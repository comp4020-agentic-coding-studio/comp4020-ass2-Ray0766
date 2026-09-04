// Protects decision 4 in CLAUDE.md: a ramp, not a tour. A week points back,
// never forward — an assessment can point at any week behind it because
// it's read as accumulating everything so far, but a lecture or Dailies
// body pointing forward promises a technique the student hasn't been given
// yet. The phase order (anime before live action, shot before episode)
// comes from src/lib/phases.ts, imported rather than restated here.
//
// The per-file check needed no synthetic injection: it was red on real
// content the first time it ran (see "Real finding" below). The phase-order
// check has no real violation to catch, so it was seen red by editing
// src/lib/phases.ts to swap the anime and live-action week ranges
// (anime 4–9, live action 4–6), running this suite, then reverting:
//   failed "anime should be fully before live action, not a tour: expected
//   9 to be less than 4", and separately "liveaction should pick up right
//   where anime ends: expected 4 to be 10"
//
// Real finding (fixed in the same commit): three forward references pointed
// past their own week —
//   - src/content/lectures/week-08.md said a frozen reference "makes the
//     cross-episode continuity of Week 10 possible at all"; reworded to
//     drop the week number, the point survives without naming what's ahead.
//   - src/content/lectures/week-10.md's exercise asked for a bible "for the
//     season built in Weeks 11 and 12"; reworded to "the season you are
//     about to shoot".
//   - src/content/sessions/week-10.md said a weak bible goes "back for
//     another pass, not forward to Week 11"; reworded to "not forward to
//     shooting".
// Each was seen red first, with the exact failure text produced on the
// original content:
//   "src/content/lectures/week-08.md mentions Week 10, which is not before
//   its own week 8"
//   "src/content/lectures/week-10.md mentions Week 11, which is not before
//   its own week 10" (its exercise mentions "Weeks 11 and 12"; the check
//   stops at the first bad mention, week 11)
//   "src/content/sessions/week-10.md mentions Week 11, which is not before
//   its own week 10"
import { describe, expect, it } from "vitest";
import { PHASES } from "../src/lib/phases";
import { loadContentDir, weekMentions } from "./lib/content";

function ownWeek(slug: string): number {
  const match = /^week-(\d{2})$/.exec(slug);
  if (!match) throw new Error(`can't read a week number out of slug "${slug}"`);
  return Number(match[1]);
}

describe("order: a week points back, never forward", () => {
  for (const file of [...loadContentDir("src/content/lectures"), ...loadContentDir("src/content/sessions")]) {
    const own = ownWeek(file.slug);
    it(`${file.path} only mentions weeks before its own (${own})`, () => {
      for (const mentioned of weekMentions(file.body)) {
        expect(
          mentioned < own,
          `${file.path} mentions Week ${mentioned}, which is not before its own week ${own}`,
        ).toBe(true);
      }
    });
  }
});

describe("order: the phase map is a ramp, not a tour", () => {
  it("phases run in order, contiguous from week 1 to week 12", () => {
    expect(PHASES[0].min).toBe(1);
    expect(PHASES[PHASES.length - 1].max).toBe(12);
    for (let i = 1; i < PHASES.length; i += 1) {
      expect(
        PHASES[i].min,
        `${PHASES[i].key} should pick up right where ${PHASES[i - 1].key} ends`,
      ).toBe(PHASES[i - 1].max + 1);
    }
  });

  it("anime is fully before live action, not a tour", () => {
    const anime = PHASES.find((phase) => phase.key === "anime")!;
    const liveaction = PHASES.find((phase) => phase.key === "liveaction")!;
    expect(
      anime.max,
      "anime should be fully before live action, not a tour",
    ).toBeLessThan(liveaction.min);
  });
});
