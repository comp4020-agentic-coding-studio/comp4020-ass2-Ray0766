// The first teaching week each named production artefact exists to be
// asked for. Used by spec/alignment.test.ts to check constructive alignment
// (decision 2 in CLAUDE.md): an assessment may only ask for an artefact an
// earlier week's exercise produced.
export const ARTEFACT_FIRST_WEEK: Record<string, number> = {
  "workflow graph": 1,
  "seed and parameter log": 1,
  "still or reference frame": 2,
  "rejection note": 2,
  "reference sheet": 4,
  captions: 6,
  "cut with temporary score": 6,
  "reference library": 8,
  "audit notes": 8,
  "sound bridge": 9,
  "series bible": 10,
  "beat template": 10,
  "quality gate": 11,
  retrospective: 12,
};
