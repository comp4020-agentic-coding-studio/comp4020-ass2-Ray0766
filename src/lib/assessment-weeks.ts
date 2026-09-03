import type { CollectionEntry } from "astro:content";
import { formatCourseDate } from "./dates";

export interface WeekWindow {
  start: number;
  end: number;
}

// The window an assessment covers is never in its own frontmatter — a
// `related:` link only ever points back to the single week it's due, not
// the weeks of teaching it draws on. That span is implicit in the sequence
// itself: an assessment's window opens the week after the previous
// assessment's due week (week 1 for the first) and closes on its own due
// week. Sorting by week first makes that fold well-defined regardless of
// how many assessments exist or what their weeks are.
export function assessmentWeekWindows(
  assessments: CollectionEntry<"assessments">[],
): Map<string, WeekWindow> {
  const sorted = [...assessments].sort((a, b) => a.data.week - b.data.week);
  const windows = new Map<string, WeekWindow>();
  let previousEnd = 0;
  for (const assessment of sorted) {
    windows.set(assessment.id, { start: previousEnd + 1, end: assessment.data.week });
    previousEnd = assessment.data.week;
  }
  return windows;
}

export function formatWeekWindow(window: WeekWindow): string {
  return window.start === window.end ? `Week ${window.end}` : `Weeks ${window.start}–${window.end}`;
}

export function formatAssessmentLine(
  assessment: CollectionEntry<"assessments">,
  window: WeekWindow,
): string {
  return `${formatWeekWindow(window)} · Due ${formatCourseDate(assessment.data.due)} · ${assessment.data.weight}%`;
}
