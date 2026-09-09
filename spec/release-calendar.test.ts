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
const dues = published("src/content/assessments");

/** The clock the course publishes its deadlines in. */
const COURSE_OFFSET = "+10:00";

/** `2027-03-12T12:00:00+10:00`, split into date, time and offset. */
const DUE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})$/;

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

  // The third leg of the rhythm, and the one with a trap in it.
  //
  // `weekdayOf` above reads a plain YYYY-MM-DD in UTC, which is the right thing
  // for a date carrying no time. A `due` is not that: it is an instant with an
  // offset on it, and `new Date(due).getUTCDay()` — the obvious thing to reach
  // for — answers what day it was in London, not in the course's own week.
  // Today the two agree by luck, because every due is 12:00+10:00 and that is
  // 02:00Z on the same date. They stop agreeing the moment a deadline moves
  // earlier than 10:00 in the course's morning: 09:00+10:00 is 23:00Z the day
  // before. Measured, because I had the direction backwards at first — going
  // *later* in the local day is safe all the way to 23:59, it is going earlier
  // that rolls UTC back. Both failure modes are real from there: a correct
  // Friday 09:00 deadline would read as Thursday and fail a file that is fine,
  // and a wrong Saturday 09:00 deadline would read as Friday and pass.
  //
  // So the date is taken as written, in the offset it was written in, and that
  // offset is asserted separately rather than assumed — the reading is only
  // sound while the two are the same clock.
  it("writes every due in the course's own clock", () => {
    const odd = dues
      .map((file) => ({ file, match: DUE.exec(file.frontmatter.due ?? "") }))
      .filter(({ match }) => match?.[3] !== COURSE_OFFSET)
      .map(({ file }) => `${file.path}: due "${file.frontmatter.due}"`);
    expect(
      odd,
      `every due is an instant written as YYYY-MM-DDThh:mm:ss${COURSE_OFFSET}. The check below ` +
        `reads the date exactly as written, which is only the course's own date while the ` +
        `offset is the course's own`,
    ).toEqual([]);
  });

  it("makes every assessment due four days after its own week's lecture", () => {
    const wrong = dues.flatMap((file) => {
      const week = file.frontmatter.week;
      const due = DUE.exec(file.frontmatter.due ?? "");
      if (!due) return [`${file.path}: due "${file.frontmatter.due}" is not a timestamp`];
      const lecture = lectures.find((entry) => entry.frontmatter.week === week);
      if (!lecture) return [`week ${week} has an assessment but no lecture`];

      const dueDate = due[1]!;
      // Both sides are plain dates by here, so midnight-UTC subtraction is
      // whole calendar days and nothing else.
      const gap =
        (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${lecture.frontmatter.date}T00:00:00Z`)) /
        86_400_000;
      return gap === 4
        ? []
        : [
            `${file.slug} (week ${week}): lecture ${lecture.frontmatter.date}, due ${dueDate} ` +
              `(${weekdayOf(dueDate)} in ${COURSE_OFFSET}) — ${gap} days apart, not 4`,
          ];
    });
    expect(
      wrong,
      "due Friday (CLAUDE.md §4) — asserted as four days after that week's Monday lecture " +
        "rather than as a bare weekday, so an assessment cannot drift onto some other week's Friday",
    ).toEqual([]);
  });
});
