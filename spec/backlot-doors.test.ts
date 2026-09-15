// Which door is the reader at? There has to be one answer.
//
// Four things name a door and a reader can tell them apart: the door drawn as
// arrived at (`data-backlot-near`), the URL, where the keyboard is, and the
// sentence the live region says. They used to be able to disagree, because
// framing and the keyboard's landing were decided by threshold **crossings**
// and the corridor's reaches overlap: 1.3 m each against a 2.0 m pitch between
// same-side doors leaves a 0.6 m band inside two of them at once. Walk past a
// door, step back, step forward — a plain key sequence — and:
//
//   near     ["stage-week-03"]   the door drawn as though the figure is there
//   hash     "#corridor"         the URL saying no door at all
//   keyboard stage-week-01       two metres away
//   said     "At the week 1 door: The Rig. Press Enter to open it."
//   Enter -> week 1
//
// Standing at week 3's door, Enter opened week 1. The second door entered won
// the framing, leaving it released the framing, and the door the reader was
// still standing in never fired again because they had never left it. Under
// reduced motion it was worse: with nothing framed, Escape has nothing to pull
// back from and took the reader out of the corridor entirely.
//
// The engine now answers from the **containing set** rather than from the
// crossings — the nearest door whose reach contains the figure, recomputed on
// every position update, is the single source for all four. So this file asks
// the four and requires one answer.
//
// **Two checks, and the second is why four reviews missed it.** The first walks
// the sequence above at a side door. The second walks *every* door: down one
// side to the end wall, across it, and back up the other. `backlot-enter` walks
// straight up the middle to week 12 — the end wall's own door — so eleven of the
// twelve had never been walked to by any check in this repo, and the defect
// lives in the band between two doors on the same side, which the middle of the
// corridor never enters.
//
// Seen red on the commit before the fix, at three viewport and theme
// combinations:
//
//   AssertionError: at week 3's door the four answers disagree — near names
//   stage-week-03, the URL says "#corridor", the keyboard is on stage-week-01
//   and the live region says "At the week 1 door: The Rig. Press Enter to open
//   it."
import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const CORRIDOR = backlotManifest.rooms.find((room) => room.id === "corridor");
const CORRIDOR_DOOR = backlotManifest.doors.find((door) => door.roomId === "corridor");
const STAGES = CORRIDOR?.stages ?? [];
/** The doors on the side walls. The end wall's own door is a different shape of
 *  problem: nothing is beside it, so its reach overlaps nothing. */
const SIDE_STAGES = STAGES.filter((stage) => stage.side !== "end");

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const READY = String.raw`
  return (async () => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (document.querySelector("[data-backlot-stage][data-backlot-ready]")) return "ready";
      await new Promise((done) => setTimeout(done, 100));
    }
    return "timed out";
  })();
`;

/** The four answers, read in one go so they cannot be of four different moments.
 *
 *  **No backticks below.** This is a String.raw template and one closes it
 *  early, which collects zero tests under a summary that says the file passed. */
const FOUR = String.raw`
  const near = [...document.querySelectorAll('[data-backlot-near="true"]')]
    .map((button) => button.dataset.backlotHotspot)
    .filter((id) => id && id.indexOf("stage-") === 0);
  const active = document.activeElement;
  const live = document.querySelector("[data-backlot-live], [aria-live]");
  const canvas = document.querySelector("[data-backlot-canvas]");
  const label = (canvas && canvas.getAttribute("aria-label")) || "";
  const on = /close on: ([^.]+)\./.exec(label);
  return JSON.stringify({
    near,
    hash: location.hash,
    keyboard: !active || active === document.body
      ? "<body>"
      : (active.dataset && active.dataset.backlotHotspot) || active.tagName.toLowerCase(),
    said: live ? (live.textContent || "").replace(/\s+/g, " ").trim() : "",
    closeOn: on ? on[1] : "",
    inTheCorridor: !!document.querySelector('[data-backlot-hotspot^="stage-"]'),
  });
`;

interface Four {
  near: string[];
  hash: string;
  keyboard: string;
  said: string;
  closeOn: string;
  inTheCorridor: boolean;
}

/** Everything wrong with one reading, in the reader's terms. Empty means the
 *  four agree. */
function disagreements(at: Four): string[] {
  const week = at.hash.replace(/^#/, "");
  const stage = STAGES.find((one) => one.id === week);
  if (!stage) return [`the URL says "${at.hash}", which is not one of the corridor's doors`];
  const id = `stage-${week}`;
  const wrong: string[] = [];
  if (!at.near.includes(id)) {
    wrong.push(`the URL says ${week} and the doors drawn as arrived at are [${at.near.join(", ")}]`);
  }
  if (at.keyboard !== id) wrong.push(`the keyboard is on "${at.keyboard}" rather than ${id}`);
  if (!at.said.includes(`week ${stage.week} door`)) {
    wrong.push(`the live region says "${at.said}" rather than naming week ${stage.week}`);
  }
  if (at.closeOn !== `Week ${stage.week}: ${stage.title}`) {
    wrong.push(`the camera is close on "${at.closeOn}" rather than "Week ${stage.week}: ${stage.title}"`);
  }
  return wrong;
}

async function open(): Promise<{ site: Awaited<ReturnType<typeof serveBuild>>; tab: Tab }> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  return { site, tab };
}

async function intoTheCorridor(tab: Tab, origin: string, reduced: boolean): Promise<void> {
  await tab.viewport(1920, 1080);
  await tab.media({ colourScheme: "dark", reducedMotion: reduced });
  await tab.goto(`${origin}${prefix}backlot/`);
  expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");
  await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${CORRIDOR_DOOR!.id}"]').click(); return 1;`);
  await pause(3800);
}

// ---------------------------------------------------------------------------
// 1. Past a side door, back, forward — under reduced motion, where Escape was
//    taking the reader out of the room.
// ---------------------------------------------------------------------------

interface Stepped {
  at: Four;
  /** After Escape: pulling back from a door is not leaving the room. */
  afterEscape: Four;
  landed: string;
}

async function stepBackAndForward(): Promise<Stepped> {
  const { site, tab } = await open();
  try {
    // Reduced motion on purpose: it is the branch where the old defect put the
    // reader out of the corridor, because Escape with nothing framed falls
    // through to leaving.
    await intoTheCorridor(tab, site.origin, true);
    await tab.hold("ArrowLeft", 900);
    for (let i = 0; i < 3; i++) await tab.hold("ArrowUp", 260);
    await tab.hold("ArrowDown", 200);
    await tab.hold("ArrowUp", 320);
    await pause(1200);
    const at = JSON.parse(await tab.evaluate<string>(FOUR)) as Four;
    await tab.press("Escape");
    await pause(1500);
    const afterEscape = JSON.parse(await tab.evaluate<string>(FOUR)) as Four;
    // Back to the door, then through it: Enter has to open the one the reader
    // is standing at, which is the whole point of the four agreeing.
    await tab.hold("ArrowUp", 200);
    await pause(1200);
    await tab.press("Enter");
    await pause(4500);
    const landed = await tab.evaluate<string>(`return location.pathname;`);
    return { at, afterEscape, landed };
  } finally {
    await tab.close();
    await site.close();
  }
}

// ---------------------------------------------------------------------------
// 2. Every door, on one route.
// ---------------------------------------------------------------------------

interface Visit {
  week: string;
  where: string;
  wrong: string[];
}

async function walkThemAll(): Promise<Visit[]> {
  const { site, tab } = await open();
  const visits: Visit[] = [];
  try {
    await intoTheCorridor(tab, site.origin, true);
    const look = async (where: string): Promise<void> => {
      const at = JSON.parse(await tab.evaluate<string>(FOUR)) as Four;
      if (!at.hash || at.hash === "#corridor") return;
      const week = at.hash.replace(/^#/, "");
      const wrong = disagreements(at);
      const already = visits.find((visit) => visit.week === week);
      if (!already) visits.push({ week, where, wrong });
      else if (wrong.length && !already.wrong.length) already.wrong = wrong;
      // **Pull back before walking on.** Walking is camera-relative, so a framed
      // door turns the whole basis and the next arrow key means something else.
      // A reader does this; it is also the only way a scripted route keeps its
      // bearings. Escape is only safe once something is framed, which is exactly
      // what the reading above has just established.
      await tab.press("Escape");
      await pause(500);
    };
    // Down one side, sampling between steps rather than holding a long walk:
    // the doors are 2.0 m apart and a long hold walks past one without ever
    // being asked where it is.
    await tab.hold("ArrowLeft", 800);
    await pause(300);
    for (let i = 0; i < 20; i++) {
      await tab.hold("ArrowUp", 200);
      await pause(240);
      await look(`up the left, step ${i}`);
    }
    await tab.hold("ArrowUp", 400);
    await pause(300);
    await look("the far end");
    // Across the end wall, which has a door of its own at its centre — so this
    // is sampled as it crosses rather than only where it arrives.
    for (let i = 0; i < 6; i++) {
      await tab.hold("ArrowRight", 260);
      await pause(240);
      await look(`across the end, step ${i}`);
    }
    for (let i = 0; i < 20; i++) {
      await tab.hold("ArrowDown", 200);
      await pause(240);
      await look(`down the right, step ${i}`);
    }
    return visits;
  } finally {
    await tab.close();
    await site.close();
  }
}

const stepped = await stepBackAndForward();
const visited = await walkThemAll();

describe("stepping back and forward at a side door", () => {
  it("is standing at one of the side doors", () => {
    expect(
      SIDE_STAGES.some((stage) => stepped.at.hash === `#${stage.id}`),
      `after walking past a door and stepping back, the URL says "${stepped.at.hash}". The sequence is ` +
        `meant to leave the figure in the band where two reaches overlap, and only a side door has one.`,
    ).toBe(true);
  });

  it("gives one answer to which door that is", () => {
    const wrong = disagreements(stepped.at);
    expect(
      wrong,
      `at ${stepped.at.hash} the four answers disagree: ${wrong.join("; ")}. A reader is told one of these ` +
        `by the door, one by the address bar, one by Tab and one by the live region.`,
    ).toEqual([]);
  });

  it("opens the door it named when the reader presses Enter", () => {
    const week = stepped.at.hash.replace(/^#/, "");
    expect(
      stepped.landed.includes(week),
      `the live region said "${stepped.at.said}" and Enter opened ${stepped.landed}`,
    ).toBe(true);
  });

  it("pulls the camera back on Escape rather than leaving the corridor", () => {
    // The reduced-motion half of the old defect: with nothing framed, Escape
    // has nothing to pull back from and falls through to leaving the room.
    expect(
      stepped.afterEscape.inTheCorridor,
      `Escape at a door took the reader out of the corridor. A reader who has come in close on something ` +
        `expects Esc to pull back, not to throw them out of the room.`,
    ).toBe(true);
    expect(
      stepped.afterEscape.hash,
      `Escape left the URL at "${stepped.afterEscape.hash}" rather than back at the room`,
    ).toBe(`#${CORRIDOR!.id}`);
  });
});

describe("walking every door in the corridor", () => {
  it("reached all twelve on one route", () => {
    const missed = STAGES.filter((stage) => !visited.some((visit) => visit.week === stage.id)).map(
      (stage) => stage.id,
    );
    expect(
      missed,
      `the route walked ${visited.length} of ${STAGES.length} doors and never stood at ${missed.join(", ")}. ` +
        `A door no check has ever walked to is a door with no evidence behind it — which is how a defect in ` +
        `the overlap band survived four reviews.`,
    ).toEqual([]);
  });

  it("gives one answer at every one of them", () => {
    const wrong = visited
      .filter((visit) => visit.wrong.length)
      .map((visit) => `${visit.week} (${visit.where}): ${visit.wrong.join("; ")}`);
    expect(
      wrong,
      `${wrong.length} door(s) answered "which door are you at" more than one way:\n  ${wrong.join("\n  ")}`,
    ).toEqual([]);
  });
});
