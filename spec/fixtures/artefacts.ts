// The first teaching week each named production artefact exists to be
// asked for. Used by spec/alignment.test.ts to check constructive alignment
// (decision 2 in CLAUDE.md): an assessment may only ask for an artefact an
// earlier week's exercise produced.
export const ARTEFACT_FIRST_WEEK: Record<string, number> = {
  "graph file": 1,
  "production log": 2,
  keyframe: 3,
  "turnaround sheet": 4,
  clip: 5,
  "reference set": 8,
  "audit notes": 8,
  "beat sheet": 9,
  storyboard: 9,
  "gated shot": 10,
  "assembled cut": 11,
  "process account": 12,
};
