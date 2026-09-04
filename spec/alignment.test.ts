// Protects decision 2 in CLAUDE.md (Biggs, constructive alignment): an
// assessment may only ask for an artefact an earlier week's exercise
// produced, and may only cite weeks before its own due date.
//
// No real assessment fails either half (every artefact named in a "## What
// to submit" section was first produced at or before that assessment's own
// `week`, and every "Week N" mentioned anywhere in an assessment body is
// ≤ its own week), so both halves were seen red by synthetic injection:
//
// 1. Temporarily changed spec/fixtures/artefacts.ts's "workflow graph"
//    entry from 1 to 20, ran this suite, then reverted. Failure text (one
//    per assessment that names it):
//      "src/content/assessments/shot-portfolio.md asks for "workflow
//      graph" (first produced week 20) but is due week 3"
//    (and the same shape for anime-short, due 6, and a-longer-cut, due 9).
//
// 2. Temporarily appended "as covered back in Week 11." to
//    src/content/assessments/shot-portfolio.md's body (due week 3), ran
//    this suite, then reverted. Failure text:
//      "src/content/assessments/shot-portfolio.md mentions Week 11, after
//      its own due week 3"
import { describe, expect, it } from "vitest";
import { loadContentDir, weekMentions } from "./lib/content";
import { ARTEFACT_FIRST_WEEK } from "./fixtures/artefacts";

const assessments = loadContentDir("src/content/assessments").map((assessment) => ({
  ...assessment,
  dueWeek: Number(assessment.frontmatter.week),
}));

function submitSection(body: string): string {
  const match = /## What to submit\n([\s\S]*?)(?:\n## |$)/.exec(body);
  // Collapse wrapped lines to spaces so a phrase split across the markdown's
  // hard-wrapped source (e.g. "seed and\nparameter log") still matches.
  return match ? match[1].toLowerCase().replace(/\s+/g, " ") : "";
}

describe("alignment: an assessment only asks for what an earlier week produced", () => {
  for (const assessment of assessments) {
    const submit = submitSection(assessment.body);
    for (const [artefact, firstWeek] of Object.entries(ARTEFACT_FIRST_WEEK)) {
      if (!submit.includes(artefact)) continue;
      it(`${assessment.slug} can ask for "${artefact}"`, () => {
        expect(
          firstWeek,
          `${assessment.path} asks for "${artefact}" (first produced week ${firstWeek}) but is due week ${assessment.dueWeek}`,
        ).toBeLessThanOrEqual(assessment.dueWeek);
      });
    }
  }
});

describe("alignment: an assessment only cites weeks before its own due date", () => {
  for (const assessment of assessments) {
    it(`${assessment.slug} (due week ${assessment.dueWeek})`, () => {
      for (const mentioned of weekMentions(assessment.body)) {
        expect(
          mentioned,
          `${assessment.path} mentions Week ${mentioned}, after its own due week ${assessment.dueWeek}`,
        ).toBeLessThanOrEqual(assessment.dueWeek);
      }
    });
  }
});
