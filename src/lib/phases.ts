export interface Phase {
  key: "rig" | "generators" | "holding" | "episode";
  title: string;
  weeks: string;
  min: number;
  max: number;
}

// The four teaching phases and the week ranges that define them. One place
// for this mapping: the home page's phase cards, the /lectures/ chips, the
// release calendar's rail and the assessment weight bar all have to agree on
// the same boundaries.
//
// The instrument ladder: two weeks getting the rig running, four generators
// (text-to-image through image-to-video), three ways of holding a story
// together across shots, three weeks cutting one episode. Anime-first is a
// property of the "generators" phase specifically — weeks 3–6 work in anime
// grammar because style absorbs the errors a generator still makes; photoreal
// is permitted from "holding" onward (week 7), once reference discipline
// exists to hold a photoreal face steady across shots.
export const PHASES: readonly Phase[] = [
  { key: "rig", title: "The Rig", weeks: "Weeks 1–2", min: 1, max: 2 },
  { key: "generators", title: "Four Generators", weeks: "Weeks 3–6", min: 3, max: 6 },
  { key: "holding", title: "Holding It Together", weeks: "Weeks 7–9", min: 7, max: 9 },
  { key: "episode", title: "The Episode", weeks: "Weeks 10–12", min: 10, max: 12 },
];

export function phaseForWeek(week: number): Phase {
  const phase = PHASES.find((p) => week >= p.min && week <= p.max);
  if (!phase) throw new Error(`week ${week} does not fall inside any phase`);
  return phase;
}
