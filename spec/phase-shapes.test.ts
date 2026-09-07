// Decision 4 in CLAUDE.md, and the reason the twelve lectures were rebuilt in
// four shapes rather than one: a marker samples two non-adjacent weeks, and
// one template makes those two look like the same page with the words
// swapped. The shape is carried by `data-phase` on the lecture page's <main>,
// which every rule in src/styles/lecture-phases.css keys off. A week landing
// in the wrong phase is not a build error, not a broken link and not an axe
// violation --- the page renders perfectly, in the wrong shape, and only a
// reader who already knows the ramp would notice.
//
// The ramp is written out here rather than imported from src/lib/phases.ts.
// The first version of this file computed what it expected with the same
// phaseForWeek() the page calls, and widening the generators phase to
// `max: 7` moved the check and the page together --- fourteen tests, still
// green, week 7 built as a bench. A sentinel that reads its answer off the
// thing it is guarding is not a sentinel. spec/ is the contract; src/ is what
// implements it, and this is the one place the two are allowed to disagree
// out loud.
//
// Read out of dist/ rather than off the template, because the styling depends
// on the attribute that shipped: one the template computes correctly and the
// layout then drops is the same failure to a reader.
//
// Seen red with that same injection, once the contract was written down here
// --- src/lib/phases.ts, generators changed to `max: 7`, then
// `pnpm build && npx vitest run spec/phase-shapes.test.ts` (output verbatim):
//   AssertionError: src/lib/phases.ts maps week 7 to "generators"; the ramp
//   puts it in holding: expected 'generators' to be 'holding'
//   AssertionError: dist/lectures/week-07/index.html is built as the
//   generators shape; week 7 is a holding week: expected 'generators' to be
//   'holding'
// Two failures, not three: weeks 8 and 9 still map to holding, so the
// four-shapes check stayed green. That check catches a phase losing every
// one of its weeks, not one week wandering, and the per-week checks are what
// catch the wandering.
// then reverted.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { phaseForWeek } from "../src/lib/phases";
import { loadContentDir } from "./lib/content";

/**
 * The ramp: two weeks getting the rig running, four generators, three ways of
 * holding a story together, three weeks cutting one episode. Anime-first
 * phases out at the end of week 6, which is why week 7 is the boundary that
 * matters most here.
 */
const RAMP: Record<number, string> = {
  1: "rig",
  2: "rig",
  3: "generators",
  4: "generators",
  5: "generators",
  6: "generators",
  7: "holding",
  8: "holding",
  9: "holding",
  10: "episode",
  11: "episode",
  12: "episode",
};

const lectures = loadContentDir("src/content/lectures");

function builtMainPhase(slug: string): { path: string; phase: string | null } {
  const path = `dist/lectures/${slug}/index.html`;
  const html = readFileSync(resolve(path), "utf8");
  const main = /<main\b[^>]*>/.exec(html);
  if (!main) throw new Error(`${path} has no <main>`);
  const attr = /data-phase="([^"]*)"/.exec(main[0]);
  return { path, phase: attr ? attr[1] : null };
}

describe("phase shapes: every lecture is built in its own phase's shape", () => {
  it("has a lecture for every week of the ramp", () => {
    expect(lectures.map((lecture) => Number(lecture.frontmatter.week)).sort((a, b) => a - b)).toEqual(
      Object.keys(RAMP).map(Number),
    );
  });

  for (const lecture of lectures) {
    const week = Number(lecture.frontmatter.week);
    const expected = RAMP[week];

    it(`src/lib/phases.ts puts week ${week} in ${expected}`, () => {
      expect(phaseForWeek(week).key, `src/lib/phases.ts maps week ${week} to "${phaseForWeek(week).key}"; the ramp puts it in ${expected}`).toBe(expected);
    });

    it(`${lecture.slug} is built in the ${expected} shape`, () => {
      const { path, phase } = builtMainPhase(lecture.slug);
      expect(phase, `${path}'s <main> has no data-phase, so lecture-phases.css styles nothing`).not.toBeNull();
      expect(
        phase,
        `${path} is built as the ${phase} shape; week ${week} is a ${expected} week`,
      ).toBe(expected);
    });
  }

  it("uses all four shapes, so no phase has quietly lost its own", () => {
    const shipped = [...new Set(lectures.map((lecture) => builtMainPhase(lecture.slug).phase))].sort();
    expect(shipped, "the twelve lectures do not cover the four phases").toEqual(
      [...new Set(Object.values(RAMP))].sort(),
    );
  });
});
