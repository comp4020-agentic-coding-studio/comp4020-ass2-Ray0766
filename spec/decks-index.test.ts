// The deck listing at /decks/ is the only page that shows a prospective
// student that this course has twelve decks rather than one. Every lecture
// already declares its own deck in `slides:`, and spec/deck.test.ts checks
// that route resolves — what nothing checked until now is whether the
// listing agrees with that set. A listing that silently drops a card is the
// failure this page was built to fix, arriving back through the page itself.
//
// Seen red by deleting a card: temporarily filtered week-07 out of the
// listing in src/pages/decks/index.astro
//   decks: decks.filter((deck) => deck.phase.key === phase.key && deck.slug !== "week-07"),
// then `pnpm build && npx vitest run spec/decks-index.test.ts`, which
// failed four of its tests (output verbatim):
//   AssertionError: /decks/ lists 11 decks, but the lectures collection
//   declares 12: expected 11 to be 12 // Object.is equality
//   AssertionError: expected [ '/decks/week-01/', …(10) ] to have a length
//   of 12 but got 11
//   AssertionError: /decks/ is missing: /decks/week-07/: expected
//   [ '/decks/week-07/' ] to deeply equal []
//   AssertionError: /decks/ has no card linking to /decks/week-07/:
//   expected null to be truthy
// then reverted.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContentDir } from "./lib/content";

const html = readFileSync(resolve("dist/decks/index.html"), "utf8");

// The base path is a deploy-time prefix, so match the route rather than the
// URL: this stays true on localhost and on Pages without restating the repo
// name, which is exactly the drift the theme's own link check exists for.
const listedRoutes = [...html.matchAll(/href="[^"]*?(\/decks\/[a-z0-9-]+\/)"/g)].map(
  (match) => match[1],
);

const declaredRoutes = loadContentDir("src/content/lectures")
  .map((lecture) => lecture.frontmatter.slides)
  .filter(Boolean)
  .sort();

describe("decks index: one card per lecture's deck, and nothing else", () => {
  it("lists as many decks as the lectures collection declares", () => {
    expect(
      listedRoutes.length,
      `/decks/ lists ${listedRoutes.length} decks, but the lectures collection declares ${declaredRoutes.length}`,
    ).toBe(declaredRoutes.length);
  });

  it("lists twelve, one per teaching week", () => {
    expect(declaredRoutes).toHaveLength(12);
    expect(listedRoutes).toHaveLength(12);
  });

  it("lists every deck a lecture declares, and no others", () => {
    const listed = [...listedRoutes].sort();
    const missing = declaredRoutes.filter((route) => !listed.includes(route));
    const extra = listed.filter((route) => !declaredRoutes.includes(route));
    expect(missing, `/decks/ is missing: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `/decks/ lists decks no lecture declares: ${extra.join(", ")}`).toEqual([]);
  });

  it("links each deck exactly once", () => {
    const seen = new Map<string, number>();
    for (const route of listedRoutes) seen.set(route, (seen.get(route) ?? 0) + 1);
    const repeated = [...seen.entries()].filter(([, count]) => count > 1);
    expect(repeated, `listed more than once: ${repeated.map(([r]) => r).join(", ")}`).toEqual([]);
  });
});

// The slide count on a card is computed from the deck source at build time
// (src/lib/decks.ts splits on the thematic breaks astromotion splits on).
// That is a second implementation of something the built deck already knows,
// so check it against the built deck rather than trusting the arithmetic:
// a fenced block containing a line of three dashes, or a change to how
// astromotion splits, would put a wrong number on a card and nothing on the
// page would say so.
describe("decks index: the slide count on a card matches the built deck", () => {
  for (const route of declaredRoutes) {
    it(`${route} says how many slides it has`, () => {
      const deckHtml = readFileSync(resolve(`dist${route}index.html`), "utf8");
      const slidesBlock = /<div class="slides">([\s\S]*)<\/div>/.exec(deckHtml);
      expect(slidesBlock, `dist${route}index.html has no .slides container`).toBeTruthy();
      const built = [...slidesBlock![1].matchAll(/<section\b[^>]*>/g)].length;

      // The card is the anchor whose href ends in this route; its slide count
      // is the "<n> slides" line inside that anchor's own markup.
      const card = new RegExp(`href="[^"]*?${route}"[\\s\\S]*?</a>`).exec(html);
      expect(card, `/decks/ has no card linking to ${route}`).toBeTruthy();
      const stated = /(\d+)\s+slides/.exec(card![0]);
      expect(stated, `${route}'s card states no slide count`).toBeTruthy();
      expect(
        Number(stated![1]),
        `/decks/ says ${stated![1]} slides for ${route}, but the built deck has ${built}`,
      ).toBe(built);
    });
  }
});
