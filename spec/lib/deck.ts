// Shared helpers for reading built decks. Not a *.test.ts file, so vitest
// never runs this on its own.
//
// The decks are checked as they shipped, not as they were written: a slide is
// content, and `pnpm test` builds before it runs, so dist/ is the honest
// place to read one. It also means a deck that fails to compile fails the
// build first, and these checks never see it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(html: string): string {
  return html.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(Number(body.slice(1)));
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Slide text as a presenter's audience sees it: markup gone, speaker notes
 * gone. Notes have to go before the text is compared to anything, or a claim
 * would match against the lecture paragraph quoted in its own notes rather
 * than against the slide.
 */
function slideText(sectionHtml: string): string {
  const withoutNotes = sectionHtml.replace(/<aside\b[^>]*class="[^"]*\bnotes\b[^"]*"[\s\S]*?<\/aside>/gi, " ");
  return normalise(decodeEntities(withoutNotes.replace(/<[^>]+>/g, " ")));
}

/**
 * Smartypants runs over every slide, so the deck's curly quotes and the
 * lecture's straight ones are the same text with different characters in it.
 * Fold both to the straight forms and collapse the line wrapping the lecture
 * source carries, so the two can be compared at all.
 */
export function normalise(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

export interface BuiltDeck {
  /** Route as the lecture's `slides:` names it, e.g. "/decks/week-01/". */
  route: string;
  /** Path relative to the repo root, for failure messages. */
  path: string;
  slides: string[];
}

export function loadBuiltDeck(route: string): BuiltDeck {
  const path = `dist${route}index.html`;
  const html = readFileSync(resolve(path), "utf8");
  const slidesBlock = /<div class="slides">([\s\S]*)<\/div>/.exec(html);
  if (!slidesBlock) throw new Error(`${path} has no .slides container`);
  const slides = [...slidesBlock[1].matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map((match) =>
    slideText(match[1]),
  );
  return { route, path, slides };
}

/**
 * The first sentence of a stretch of prose. Sentence-final punctuation
 * followed by a space or the end of the text — good enough for the exercise
 * sections these checks read, which carry no abbreviations or decimals, and
 * not meant to become a general sentence splitter.
 */
export function firstSentence(text: string): string {
  const collapsed = normalise(text);
  const match = /^(.*?[.!?])(?:\s|$)/.exec(collapsed);
  return match ? match[1] : collapsed;
}
