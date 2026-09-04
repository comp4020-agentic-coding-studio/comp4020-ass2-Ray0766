// Protects decision 1 and decision 5 in CLAUDE.md: every lecture runs the
// same two beats, and Dailies is the formative loop that closes them.
//
// Seen red by injecting each violation into a real file, running this
// suite, confirming the failure named the right week, then reverting with
// `git checkout` (recorded output below is verbatim from that run):
//   - stripped "## Before class" from week-05.mdx → failed
//     "src/content/lectures/week-05.mdx is missing "## Before class""
//   - stripped "## This week's exercise" from week-09.md → failed
//     "src/content/lectures/week-09.md is missing "## This week's exercise""
//   - cut the "Bring ... Wednesday's Dailies" sentence from week-03.md's
//     exercise → failed "src/content/lectures/week-03.md's exercise never
//     says what to bring to Wednesday's Dailies"
//   - emptied week-01.md's Dailies body → failed
//     "src/content/sessions/week-01.md never says what to bring to this
//     Dailies"
//
// Real finding (fixed in the same commit): src/content/sessions/week-08.md
// through week-12.md never named anything to bring — the Dailies page
// described the room's process but not what a student carries into it. Each
// now opens with a "Bring ..." sentence naming that week's exercise output.
import { describe, expect, it } from "vitest";
import { loadContentDir } from "./lib/content";

const lectures = loadContentDir("src/content/lectures");
const sessions = loadContentDir("src/content/sessions");

describe("structure: every lecture runs Before class and the exercise", () => {
  for (const lecture of lectures) {
    it(`${lecture.slug} has "Before class" and "This week's exercise"`, () => {
      expect(lecture.body, `${lecture.path} is missing "## Before class"`).toMatch(
        /^## Before class$/m,
      );
      expect(lecture.body, `${lecture.path} is missing "## This week's exercise"`).toMatch(
        /^## This week's exercise$/m,
      );
    });

    it(`${lecture.slug}'s exercise ends by bringing something to Wednesday's Dailies`, () => {
      const exerciseMatch = /## This week's exercise\n([\s\S]*?)(?:\n##|$)/.exec(lecture.body);
      expect(exerciseMatch, `${lecture.path} has no exercise section to check`).toBeTruthy();
      expect(
        exerciseMatch![1],
        `${lecture.path}'s exercise never says what to bring to Wednesday's Dailies`,
      ).toMatch(/bring.*Wednesday's Dailies/is);
    });
  }
});

describe("structure: every Dailies names something to bring", () => {
  for (const session of sessions) {
    it(`${session.slug} says what to bring`, () => {
      expect(session.body, `${session.path} never says what to bring to this Dailies`).toMatch(
        /\bbring\b/i,
      );
    });
  }
});
