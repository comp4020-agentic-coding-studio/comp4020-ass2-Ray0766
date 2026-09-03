export interface Phase {
  key: "foundations" | "anime" | "liveaction" | "series";
  title: string;
  weeks: string;
  min: number;
  max: number;
}

// The four teaching phases and the week ranges that define them. One place
// for this mapping: the home page's phase cards, the /lectures/ chips, the
// release calendar's rail and the assessment weight bar all have to agree on
// the same boundaries.
export const PHASES: readonly Phase[] = [
  { key: "foundations", title: "Foundations", weeks: "Weeks 1–3", min: 1, max: 3 },
  { key: "anime", title: "Anime", weeks: "Weeks 4–6", min: 4, max: 6 },
  { key: "liveaction", title: "Live Action", weeks: "Weeks 7–9", min: 7, max: 9 },
  { key: "series", title: "The Series", weeks: "Weeks 10–12", min: 10, max: 12 },
];

export function phaseForWeek(week: number): Phase {
  const phase = PHASES.find((p) => week >= p.min && week <= p.max);
  if (!phase) throw new Error(`week ${week} does not fall inside any phase`);
  return phase;
}
