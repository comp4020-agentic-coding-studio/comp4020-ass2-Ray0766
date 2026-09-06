// Protects decision 3 in CLAUDE.md (a deck is content and checked like a
// page) across all twelve decks. The grammar is the point: every lecture
// carries a deck, and the decks share one shape, so a student who has read
// one can read all twelve — and the Showcase asks students for a deck of
// their own, with these as the model.
//
// The Week 1 phase-slide check reads the deck source, because the phase map
// is a thing the deck states; everything else reads the built page, because
// what a slide says to a room is what it rendered as.
//
// Seen red by injecting each failure into a real deck, running
// `pnpm build && npx vitest run spec/deck.test.ts`, then reverting with
// `git checkout` (output below is verbatim from those runs):
//   - deleted the "## This week's exercise" slide from week-07.deck.mdx →
//     failed "src/decks/week-07.deck.mdx has no slide headed "This week's
//     exercise"" and "dist/decks/week-07/index.html should have 8-12 slides"
//     stayed green at 9, which is the point of checking both
//   - changed week-05.deck.mdx's title slide from "Text to Video" to "Text
//     To Video" → failed "dist/decks/week-05/index.html's title slide
//     doesn't carry the lecture title "Text to Video""
//   - pointed week-11.md's slides: at /decks/week-eleven/ → failed
//     "src/content/lectures/week-11.md's slides: /decks/week-eleven/ is not
//     a built deck". That injection found a bug in this file rather than in
//     a deck: the built deck used to be read while the suite was being
//     collected, so a bad route threw before any test existed and vitest
//     reported "no tests" instead of naming the lecture. Fixed by reading
//     the deck inside each test — see the note above the second describe.
//   - the phase-slide check was seen red separately when it was written, by
//     editing the ramp slide's "Live Action" to "Live-Action"
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PHASES } from "../src/lib/phases";
import { loadContentDir } from "./lib/content";
import { firstSentence, loadBuiltDeck, normalise } from "./lib/deck";

const MIN_SLIDES = 8;
const MAX_SLIDES = 12;

const lectures = loadContentDir("src/content/lectures");

function deckSourcePath(route: string): string {
  const slug = route.replace(/^\/decks\//, "").replace(/\/$/, "");
  return `src/decks/${slug}.deck.mdx`;
}

describe("deck: every lecture opens a deck", () => {
  for (const lecture of lectures) {
    it(`${lecture.slug} declares slides: and the deck is built`, () => {
      const route = lecture.frontmatter.slides;
      expect(route, `${lecture.path} has no slides: to open`).toBeTruthy();
      expect(() => loadBuiltDeck(route), `${lecture.path}'s slides: ${route} is not a built deck`).not.toThrow();
    });
  }
});

// Resolved inside each `it`, never while the suite is being collected: a
// route pointing at a deck that isn't there would otherwise throw during
// collection and take the whole file down with it, reporting "no tests"
// instead of naming the lecture that is wrong.
describe("deck: every deck runs the same grammar", () => {
  for (const lecture of lectures) {
    const route = lecture.frontmatter.slides;
    if (!route) continue;
    const deck = () => loadBuiltDeck(route);
    const title = normalise(lecture.frontmatter.title.replace(/^"|"$/g, ""));

    it(`${route} opens on a title slide carrying "${title}"`, () => {
      const { path, slides } = deck();
      expect(slides[0], `${path}'s title slide doesn't carry the lecture title "${title}"`).toContain(title);
    });

    it(`${route} has ${MIN_SLIDES}-${MAX_SLIDES} slides`, () => {
      const { path, slides } = deck();
      expect(
        slides.length,
        `${path} should have ${MIN_SLIDES}-${MAX_SLIDES} slides, not ${slides.length}`,
      ).toBeGreaterThanOrEqual(MIN_SLIDES);
      expect(slides.length).toBeLessThanOrEqual(MAX_SLIDES);
    });

    it(`${route} sets the exercise in the lecture's own words`, () => {
      const { path, slides } = deck();
      const section = /## This week's exercise\n([\s\S]*?)(?:\n##|$)/.exec(lecture.body);
      expect(section, `${lecture.path} has no exercise section to quote`).toBeTruthy();
      const opening = firstSentence(section![1]);

      const slide = slides.find((text) => text.startsWith("This week's exercise"));
      expect(slide, `${deckSourcePath(route)} has no slide headed "This week's exercise"`).toBeTruthy();
      expect(
        slide,
        `${path}'s exercise slide doesn't open on the lecture's own first sentence:\n  ${opening}`,
      ).toContain(opening);
    });
  }
});

// The Week 1 deck states the phase map to a student before the site's own
// phase cards do, so it is tied to src/lib/phases.ts rather than left to
// drift.
const week1Path = "src/decks/week-01.deck.mdx";
const week1Source = readFileSync(resolve(week1Path), "utf8");
const rampMatch = /## The ramp\n([\s\S]*?)\n---/.exec(week1Source);
if (!rampMatch) throw new Error(`${week1Path} has no "## The ramp" slide to check`);
const rampSlide = rampMatch[1];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("deck: the Week 1 phase slide matches the site's phase map", () => {
  for (const phase of PHASES) {
    it(`lists "${phase.weeks}: **${phase.title}**"`, () => {
      const line = new RegExp(`^- ${escapeRegExp(phase.weeks)}: \\*\\*${escapeRegExp(phase.title)}\\*\\*`, "m");
      expect(
        rampSlide,
        `${week1Path}'s phase slide doesn't list "${phase.weeks}: **${phase.title}**"`,
      ).toMatch(line);
    });
  }

  it("lists the four phases in the same order as the phase map", () => {
    const positions = PHASES.map((phase) => rampSlide.indexOf(`**${phase.title}**`));
    for (let i = 1; i < positions.length; i += 1) {
      expect(
        positions[i],
        `${PHASES[i].title} should appear after ${PHASES[i - 1].title} on the ramp slide`,
      ).toBeGreaterThan(positions[i - 1]);
    }
  });
});
