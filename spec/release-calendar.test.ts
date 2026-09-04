import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContentDir } from "./lib/content";

// The release calendar is the one place a prospective student sees the
// whole twelve-week shape at a glance. If the data selector regresses (wrong
// collection, wrong week filter, a broken gap calculation), this fails loud
// on the built page rather than silently under-listing weeks or duplicating
// the break.
const html = readFileSync(resolve("dist/index.html"), "utf8");
const assessments = loadContentDir("src/content/assessments");

describe("home page release calendar", () => {
  it("renders one row per teaching week", () => {
    const weekRows = html.match(/<article class="release-calendar__week/g) ?? [];
    expect(weekRows).toHaveLength(12);
  });

  it("renders exactly one teaching break row", () => {
    const breakRows = html.match(/class="release-calendar__break"/g) ?? [];
    expect(breakRows).toHaveLength(1);
  });

  // Two assessments can share a due week (the showcase and Dailies
  // participation both land in week 12). A `.find()` over the assessments
  // collection silently keeps only the first match for that week, so this
  // checks the raw count of "Due" cells against the assessments collection's
  // own size, not just against how many weeks have at least one.
  //
  // Seen red by reverting ReleaseCalendar.astro's week-row builder to
  // `assessments.find(...)` (a single optional `assessment` field instead of
  // the `assessments` array), rebuilding, and rerunning this suite, which
  // failed with "expected 9 to be 10". Reverted back to `.filter(...)`.
  it("renders one Due cell per assessment", () => {
    const dueCells = html.match(/<dt>Due<\/dt>/g) ?? [];
    expect(dueCells).toHaveLength(assessments.length);
    expect(dueCells).toHaveLength(10);
  });

  // Nine due weeks, not seven: weeks 3-9 each carry one assessment, week 10
  // carries none, and week 11 (the pilot) and week 12 (the showcase and
  // Dailies participation) each count once, distinct by week, even though
  // 12 carries two assessments at once.
  it("renders due dates on nine distinct weeks", () => {
    const dueWeeks = new Set(assessments.map((assessment) => assessment.frontmatter.week));
    expect(dueWeeks.size).toBe(9);

    const weekChunks = html.split(/(?=<article class="release-calendar__week)/g).slice(1);
    const weeksWithDue = weekChunks.filter((chunk) => chunk.includes("<dt>Due</dt>"));
    expect(weeksWithDue).toHaveLength(dueWeeks.size);
  });
});
