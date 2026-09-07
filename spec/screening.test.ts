// Decision 5 in CLAUDE.md, the half that was missing: Dailies is the formative
// loop (Sadler), and a formative loop needs a stated scale as much as it needs
// a thing to bring. Twelve Dailies pages said what to bring. None of them said
// what it would be measured against — the ladder was the ruler, and the ruler
// only existed in the lecture.
//
// So each Dailies now carries a "What gets screened" section, and for the eight
// weeks that have a recorded ladder the rungs it names are that week's own
// manifest labels rather than a paraphrase of them. This checks that the naming
// has not drifted: a label edited in one place and not the other is exactly the
// failure this exists for, and it is invisible on the rendered page.
//
// Every assertion below is anchored to a line start or to a structure, never to
// a bare substring — see CLAUDE.md §7 on checks that match their own comments.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContentDir } from "./lib/content";

const HEADING = /^## What gets screened$/m;

/** The section body: from its own heading to the next one, or the end. */
function screeningSection(body: string): string | undefined {
  const start = body.search(HEADING);
  if (start < 0) return undefined;
  const after = body.slice(start).replace(HEADING, "");
  const next = after.search(/^## /m);
  return next < 0 ? after : after.slice(0, next);
}

/** The rungs the section names, as written. Bold is the only emphasis used in
 *  these sections, and every list item opens with one. */
function boldSpans(section: string): string[] {
  return [...section.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]);
}

const STUDIO_LINK = /\]\(\/studio\/#week-(\d{2}):([^)\s]+)\)/g;

interface Manifest {
  week: number;
  tiers: { id: string; tier: string; label: string }[];
}

function manifest(week: number): Manifest | undefined {
  try {
    return JSON.parse(readFileSync(resolve(`src/data/studio/week-${String(week).padStart(2, "0")}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

const sessions = loadContentDir("src/content/sessions");

function ownWeek(slug: string): number {
  const match = /^week-(\d{2})$/.exec(slug);
  if (!match) throw new Error(`can't read a week number out of slug "${slug}"`);
  return Number(match[1]);
}

// Seen red by deleting the whole section from week-07.md:
//   AssertionError: src/content/sessions/week-07.md has no "## What gets
//   screened": a Dailies that says what to bring and not what it is measured
//   against is half a formative loop: expected undefined not to be undefined
// then reverted.
describe("every Dailies says what it is measured against, not just what to bring", () => {
  it("there are twelve of them", () => {
    expect(sessions.length).toBe(12);
  });

  for (const session of sessions) {
    it(`${session.slug} has a "What gets screened" section`, () => {
      const section = screeningSection(session.body);
      expect(
        section,
        `${session.path} has no "## What gets screened": a Dailies that says what to bring and not what it is measured against is half a formative loop`,
      ).not.toBeUndefined();
      expect(section!.trim().length, `${session.path}'s screening section is empty`).toBeGreaterThan(200);
    });

    it(`${session.slug} still names its rungs`, () => {
      const rungs = boldSpans(screeningSection(session.body) ?? "");
      expect(rungs.length, `${session.path} names no rungs in its screening section`).toBeGreaterThanOrEqual(3);
    });
  }
});

// Seen red by changing week-06's third rung from "finished key frame" to
// "finished keyframe" — a one-character drift of the kind that happens when a
// manifest is edited and the page is not:
//   AssertionError: src/content/sessions/week-06.md names a rung "finished
//   keyframe" that week 6's manifest does not have. Its tiers are: sketch as
//   first frame, flat colour as first frame, finished key frame, finished key
//   frame + four sentences, first frame + last frame (FL2VA): expected
//   undefined to be defined
// then reverted.
describe("the rungs a Dailies names are its own week's recorded tiers", () => {
  let checked = 0;

  for (const session of sessions) {
    const week = ownWeek(session.slug);
    const data = manifest(week);
    if (!data) continue;

    it(`${session.slug} names only tiers week ${week} actually recorded`, () => {
      const labels = new Set(data.tiers.map((tier) => tier.label));
      const rungs = boldSpans(screeningSection(session.body) ?? "");
      expect(rungs.length, `${session.path} names no rungs`).toBeGreaterThan(0);

      for (const rung of rungs) {
        checked += 1;
        expect(
          labels.has(rung) ? rung : undefined,
          `${session.path} names a rung "${rung}" that week ${week}'s manifest does not have. Its tiers are: ${[...labels].join(", ")}`,
        ).toBeDefined();
      }
    });
  }

  it("the eight weeks with a recorded ladder were all checked", () => {
    const withManifest = sessions.filter((session) => manifest(ownWeek(session.slug)));
    expect(withManifest.map((session) => session.slug)).toEqual([
      "week-02",
      "week-03",
      "week-04",
      "week-05",
      "week-06",
      "week-07",
      "week-08",
      "week-09",
    ]);
    expect(checked, "no rung was actually compared against a manifest").toBeGreaterThan(30);
  });
});

// Seen red by pointing week-08's link at a tier that does not exist
// (`/studio/#week-08:t9`):
//   AssertionError: src/content/sessions/week-08.md points at
//   /studio/#week-08:t9, and week 8 recorded no tier "t9": expected undefined
//   to be defined
// then reverted.
describe("each ladder Dailies points at the run its own week recorded", () => {
  const linked: number[] = [];

  for (const session of sessions) {
    const week = ownWeek(session.slug);
    const section = screeningSection(session.body) ?? "";
    const links = [...section.matchAll(STUDIO_LINK)];

    if (manifest(week)) {
      it(`${session.slug} closes its section with one studio anchor`, () => {
        expect(
          links.length,
          `${session.path} should point at the recorded run exactly once, not ${links.length} times`,
        ).toBe(1);
      });
    }

    for (const link of links) {
      const linkedWeek = Number(link[1]);
      const tierId = link[2];
      linked.push(linkedWeek);

      it(`${session.slug} points at week ${linkedWeek} tier ${tierId}, which exists`, () => {
        const data = manifest(linkedWeek);
        expect(data, `${session.path} points at week ${linkedWeek}, which has no manifest`).toBeDefined();
        const tier = data!.tiers.find((candidate) => candidate.tier === tierId || candidate.id === tierId);
        expect(
          tier,
          `${session.path} points at /studio/#week-${link[1]}:${tierId}, and week ${linkedWeek} recorded no tier "${tierId}"`,
        ).toBeDefined();
      });

      it(`${session.slug} points at its own week, not another`, () => {
        expect(
          linkedWeek,
          `${session.path} points at week ${linkedWeek}'s ladder rather than its own`,
        ).toBe(week);
      });
    }
  }

  it("all eight ladder weeks point somewhere", () => {
    expect(linked.sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
