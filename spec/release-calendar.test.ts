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

const published = (dir: string) =>
  loadContentDir(dir).filter((file) => file.frontmatter.draft !== "true");
const lectures = published("src/content/lectures");
const sessions = published("src/content/sessions");

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The weekday a plain `YYYY-MM-DD` falls on, read in UTC so the answer does not
 *  depend on which side of midnight the machine running this happens to be. */
const weekdayOf = (date: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a plain YYYY-MM-DD date`);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`"${date}" is not a real date`);
  return WEEKDAYS[parsed.getUTCDay()]!;
};

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

// The rhythm the calendar is a picture of: lecture Monday, Dailies Wednesday
// (CLAUDE.md §4, decided 2026-09-01). Every page that names a day names it in
// prose — WeekStrip.astro says "Monday lecture" and "Wednesday Dailies" on all
// twenty-four lecture and session pages — so a date on the wrong day makes the
// site lie in a way nothing was reading. data-integrity.test.ts checks the
// teaching window, which a Monday Dailies sits comfortably inside.
//
// Seen red on the data as it stood: weeks 7 and 8 were the only two Dailies
// scheduled after the Easter break, and both had been given the same date as
// their own lecture. Seen red on the other half by moving week 3's lecture to a
// Tuesday, which named week 3 and nothing else.
describe("the teaching rhythm", () => {
  it("has a published lecture and a published Dailies for all twelve weeks", () => {
    expect(lectures.map((file) => Number(file.frontmatter.week)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(sessions.map((file) => Number(file.frontmatter.week)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
  });

  // Every offender collected before asserting, rather than an expect() per file
  // inside a loop: the first failure would stop the loop, so a run would name
  // one week, get fixed, and name the next one on the following run. Both weeks
  // 7 and 8 were wrong, and the point of the message is to say so once.
  it.each([
    { collection: "lecture", files: lectures, day: "Monday" },
    { collection: "Dailies", files: sessions, day: "Wednesday" },
  ])("puts every $collection on a $day", ({ collection, files, day }) => {
    const wrongDay = files
      .filter((file) => weekdayOf(file.frontmatter.date) !== day)
      .map(
        (file) =>
          `week ${file.frontmatter.week} (${file.path}) is dated ${file.frontmatter.date}, ` +
          `a ${weekdayOf(file.frontmatter.date)}`,
      );
    expect(
      wrongDay,
      `every ${collection} belongs on a ${day} — the rhythm is lecture Monday, Dailies ` +
        `Wednesday (CLAUDE.md §4), and WeekStrip.astro says so in prose on every lecture ` +
        `and session page`,
    ).toEqual([]);
  });

  it("screens each week's Dailies two days after that week's lecture", () => {
    const misaligned = sessions.flatMap((session) => {
      const week = session.frontmatter.week;
      const lecture = lectures.find((file) => file.frontmatter.week === week);
      if (!lecture) return [`week ${week} has a Dailies but no lecture`];
      const gap =
        (Date.parse(`${session.frontmatter.date}T00:00:00Z`) -
          Date.parse(`${lecture.frontmatter.date}T00:00:00Z`)) /
        86_400_000;
      return gap === 2
        ? []
        : [
            `week ${week}: lecture ${lecture.frontmatter.date}, Dailies ` +
              `${session.frontmatter.date} — ${gap} days apart`,
          ];
    });
    expect(
      misaligned,
      "a week's Dailies screens the exercise its own lecture set, so the two are two days apart",
    ).toEqual([]);
  });
});
