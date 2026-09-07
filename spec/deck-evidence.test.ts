// The evidence decks have one rule holding them up: a slide carries a claim
// and the source it came from, and it fits on a screen at the back of a
// room. Both halves are easy to lose in a rewrite --- prose creeps back into
// a slide until it is a paragraph, and a slide that needs a third source is
// a slide that is making two claims. Neither breaks the build, and neither
// shows up in a screenshot taken at 1920 on a laptop.
//
// The word count reads the built page, because what a slide says to a room
// is what it rendered as; it counts only the slide's own prose, since a
// heading, a table, a list, a pull quote and the source footer are all
// scanned rather than read, and counting them would ban the layouts these
// decks are made of. Speaker notes are a script, not a slide, so they go too.
//
// Seen red before it was trusted, by injecting both failures and running
// `pnpm build && npx vitest run spec/deck-evidence.test.ts`, then reverting
// (output verbatim from those runs):
//   - pasted the first notes paragraph of week-11's loudness slide into the
//     slide body as a second paragraph -->
//     AssertionError: dist/decks/week-11/index.html slide 4 has 97 words of
//     body prose, over the 60 a slide can hold --- move it into the notes:
//     "-23.0 LUFS, ±1.0 LU, true peak not above -1 dBTP EBU R 128's target,
//     and the reason "sounds about right" is not a delivery note: it varies
//     with the speaker, the room, and the listener. The measurement does not.
//     The recommendation's own wording is that "Programme Loudness Level
//     shall be normalised to a Target Level of -23.0 LUFS", with the ±1.0 LU
//     tolerance allowed where the target is "not achievable practically (for
//     example, live programmes)", and True Peak Level "shall not exceed -1
//     dBTP". The meter has to be compliant with ITU-R BS.1770, currently at
//     revision 5.": expected 97 to be less than or equal to 60
//   - added a third Source: line to week-11's delivery-specs slide -->
//     AssertionError: dist/decks/week-11/index.html slide 7 cites 3 sources;
//     a slide makes one claim, so two is the ceiling --- split it: expected 3
//     to be less than or equal to 2
//
// The deck-count guard was seen red without being asked: a build picked up an
// iCloud conflict copy of src/pages/decks/index.astro and emitted
// "dist/decks/index 2/", and this file reported 13 deck pages for 12 decks
// before spec/no-duplicate-copies.test.ts named the file behind it.
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBuiltDeck, normalise } from "./lib/deck";

/** Prose a reader has to read left to right, rather than scan. */
const BODY_WORD_LIMIT = 60;

/** Two sources is a claim and its corroboration; three is two claims. */
const SOURCE_LIMIT = 2;

const NOTES = /<aside\b[^>]*class="[^"]*\bnotes\b[^"]*"[\s\S]*?<\/aside>/gi;

// Scanned, not read: a heading is the slide's label, a table and a list are
// looked up a row at a time, a blockquote is a citation the eye lands on
// whole, and the source footer is the provenance line this deck format puts
// under every claim.
const SCANNED = [
  /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi,
  /<table\b[\s\S]*?<\/table>/gi,
  /<[uo]l\b[\s\S]*?<\/[uo]l>/gi,
  /<blockquote\b[\s\S]*?<\/blockquote>/gi,
  /<footer\b[\s\S]*?<\/footer>/gi,
  /<p\b[^>]*class="[^"]*\bdeck-source\b[^"]*"[\s\S]*?<\/p>/gi,
];

function withoutNotes(section: string): string {
  return section.replace(NOTES, " ");
}

function bodyProse(section: string): string {
  let html = withoutNotes(section);
  for (const pattern of SCANNED) html = html.replace(pattern, " ");
  return normalise(html.replace(/<[^>]+>/g, " ")).replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, " ");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Read the routes off the built decks rather than off a list, so a deck added
// later is checked without anyone remembering to add it here.
const routes = globSync("dist/decks/*/index.html")
  .map((file) => file.replace(/^dist/, "").replace(/index\.html$/, ""))
  .sort();

// Counted against the sources rather than against a number written here, so
// a thirteenth deck is checked the day it is added --- and so a directory
// under dist/decks/ that no deck put there fails loudly rather than being
// read as a deck with no slides in it.
const deckSources = globSync("src/decks/*.deck.mdx").length;

describe("deck evidence: a slide is a claim, not a paragraph", () => {
  it("found the built decks to check", () => {
    expect(
      routes.length,
      `dist/decks/ holds ${routes.length} deck pages for ${deckSources} decks in src/decks/`,
    ).toBe(deckSources);
  });

  for (const route of routes) {
    it(`${route} keeps every slide's prose under ${BODY_WORD_LIMIT} words`, () => {
      const { path, sections } = loadBuiltDeck(route);
      for (const [index, section] of sections.entries()) {
        const prose = bodyProse(section);
        expect(
          wordCount(prose),
          `${path} slide ${index + 1} has ${wordCount(prose)} words of body prose, over the ${BODY_WORD_LIMIT} a slide can hold --- move it into the notes: "${prose}"`,
        ).toBeLessThanOrEqual(BODY_WORD_LIMIT);
      }
    });

    it(`${route} cites at most ${SOURCE_LIMIT} sources a slide`, () => {
      const { path, sections } = loadBuiltDeck(route);
      for (const [index, section] of sections.entries()) {
        // Counted on the slide only. The notes quote sources at length by
        // design, and that is the right place for the third one.
        const cited = (withoutNotes(section).match(/\bSource:/g) ?? []).length;
        expect(
          cited,
          `${path} slide ${index + 1} cites ${cited} sources; a slide makes one claim, so two is the ceiling --- split it`,
        ).toBeLessThanOrEqual(SOURCE_LIMIT);
      }
    });
  }
});
