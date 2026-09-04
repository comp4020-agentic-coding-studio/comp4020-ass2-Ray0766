import type { CollectionEntry } from "astro:content";
import { describe, expect, it } from "vitest";
import { assessmentWeekWindows } from "../src/lib/assessment-weeks";

// The fold in assessmentWeekWindows only has one real edge case: two
// assessments sharing a due week (the showcase and Dailies participation
// both land in week 12). Before the fix, the second entry in sort order
// opened its window at `previousEnd + 1` unconditionally, so a tied week
// produced a window that opened after it closed (start 13, end 12).
//
// Seen red by reverting the fix to `start: previousEnd + 1` /
// `previousEnd = assessment.data.week`, which failed with:
//   "expected 13 to be less than or equal to 12"
// then restored.
function assessment(id: string, week: number): CollectionEntry<"assessments"> {
  return { id, data: { week } } as unknown as CollectionEntry<"assessments">;
}

describe("assessmentWeekWindows: a shared due week never opens after it closes", () => {
  it("gives each of two same-week assessments a window that starts at or before it ends", () => {
    const windows = assessmentWeekWindows([
      assessment("a3", 3),
      assessment("the-pilot", 11),
      assessment("dailies-participation", 12),
      assessment("the-showcase", 12),
    ]);

    for (const [id, window] of windows) {
      expect(window.start, `${id}: window opens after it closes`).toBeLessThanOrEqual(window.end);
    }

    expect(windows.get("dailies-participation")).toEqual({ start: 12, end: 12 });
    expect(windows.get("the-showcase")).toEqual({ start: 12, end: 12 });
  });

  it("still covers every week exactly once when due weeks don't repeat", () => {
    const windows = assessmentWeekWindows([assessment("a3", 3), assessment("a4", 4)]);
    expect(windows.get("a3")).toEqual({ start: 1, end: 3 });
    expect(windows.get("a4")).toEqual({ start: 4, end: 4 });
  });
});
