// Esc at a door, and walking away from one. Two states the engine used to lie
// about, and the same lie both times: something went on naming a door the
// reader was no longer being told anything true about.
//
// `backlot-doors.test.ts` asks whether the four answers agree while the reader
// is standing at a door. This file asks what happens at the two edges of that —
// the reader refusing the camera, and the reader leaving — because both of them
// change some of the four and not others, and "some of them" is where they
// drift apart.
//
// The contract, in Ray's words:
//
//   S2  Esc at a door. The refusal governs the camera and nothing else. The
//       camera pulls back, closeOn goes empty, and the reader stays in the
//       corridor — but `near` still contains the door, the hash stays at the
//       door's route, the keyboard stays on that door's button, and the live
//       region still names it. Enter still opens it, including a window-level
//       Enter with nothing in the HUD focused.
//   S3  Esc, step back but stay inside the reach, step forward again. The
//       refusal still stands, so the camera stays out; the four still name the
//       door; Enter still opens it.
//   S4  Leaving every door's reach. `near` empty, hash "#corridor", camera out,
//       nothing framed, Enter does nothing — and the live region announces once,
//       with a sentence that names no door.
//   S5  Walking back in afterwards. The refusal has cleared, so the camera
//       pushes in again and the four agree.
//
// What it looked like before, driven with real keys (receipts/rig-3d/reviewB5):
//
//   Esc: pulled back      near=[stage-week-03] hash="#corridor" kbd=stage-week-03
//                         said="Pulled back."
//   stepped out (2 taps)  near=[stage-week-01] hash="#week-01" framed=true
//   walked back in        near=[stage-week-03] hash="#week-01" kbd=stage-week-01
//                         said="At the week 3 door: Text to Image. Press Enter to open it."
//   Enter -> /lectures/week-01/
//
// and, walking away from the last door, "At the week 11 door: Production, Week
// Two. Press Enter to open it." left standing with `near` empty and nothing
// framed.
//
// **Three things this file does that a check of this shape can get wrong.**
//
// The window-level Enter is the branch that goes through `atDoorId`, and it is
// unreachable while the HUD holds focus (`input.ts` yields). A walked arrival
// hands the keyboard to the door's button, so `press("Enter")` on its own goes
// through the button's own activation and never reads `atDoorId` at all — review
// B5 watched an injection that broke `atDoorId` stay green for exactly that
// reason. So the keyboard is blurred first, and the reading taken after the blur
// is part of the evidence rather than a detail of the harness.
//
// The live region is read as a **list of everything it said**, collected by an
// observer installed before the walk, not as whatever happens to be in it at the
// end. "Announces once" is a claim about a count, and the resting text cannot
// tell one announcement from three.
//
// And the keyboard is **not** asserted in S4. Nothing moves it when the figure
// walks away, and moving it would drop the reader on `<body>` — the failure
// CLAUDE.md §7 spends a paragraph on. A parked Tab position is where the reader
// can act from, not a claim about where the figure is standing; the three
// answers that are claims (`near`, the hash, the live region) are the ones this
// file holds to naming nothing.
import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const CORRIDOR = backlotManifest.rooms.find((room) => room.id === "corridor");
const CORRIDOR_DOOR = backlotManifest.doors.find((door) => door.roomId === "corridor");
const STAGES = CORRIDOR?.stages ?? [];

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

/** Every sentence the live region says from here on, in order.
 *
 *  `announce` empties the region before it writes, so the empties are dropped
 *  and a repeat of the sentence already standing is dropped with them — the
 *  region is being re-announced, not saying something new.
 *
 *  **No backticks below.** This is a String.raw template and one closes it
 *  early, which collects zero tests under a summary that says the file passed. */
const SPY = String.raw`
  const live = document.querySelector("[aria-live]");
  if (!live) return "no live region";
  window.__said = [];
  new MutationObserver(() => {
    const text = (live.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (window.__said[window.__said.length - 1] === text) return;
    window.__said.push(text);
  }).observe(live, { childList: true, characterData: true, subtree: true });
  return "watching";
`;

/** What the live region has said since a mark, and a new mark. */
const SINCE = String.raw`
  const all = window.__said || [];
  const from = window.__mark || 0;
  window.__mark = all.length;
  return JSON.stringify(all.slice(from));
`;

/** The five answers, read in one go so they cannot be of five different
 *  moments. The camera is the fifth and is governed separately, which is why it
 *  is read rather than folded into the other four. */
const FIVE = String.raw`
  const near = [...document.querySelectorAll('[data-backlot-near="true"]')]
    .map((button) => button.dataset.backlotHotspot)
    .filter((id) => id && id.indexOf("stage-") === 0);
  const active = document.activeElement;
  const live = document.querySelector("[aria-live]");
  const canvas = document.querySelector("[data-backlot-canvas]");
  const hud = document.querySelector("[data-backlot-hud]");
  const aria = (canvas && canvas.getAttribute("aria-label")) || "";
  const on = /close on: ([^.]+)\./.exec(aria);
  return JSON.stringify({
    near,
    hash: location.hash,
    keyboard: !active || active === document.body
      ? "<body>"
      : (active.dataset && active.dataset.backlotHotspot) || active.tagName.toLowerCase(),
    said: live ? (live.textContent || "").replace(/\s+/g, " ").trim() : "",
    closeOn: on ? on[1] : "",
    framed: hud ? hud.dataset.backlotFramed === "true" : false,
    inTheCorridor: !!document.querySelector('[data-backlot-hotspot^="stage-"]'),
    path: location.pathname,
  });
`;

interface Five {
  near: string[];
  hash: string;
  keyboard: string;
  said: string;
  closeOn: string;
  framed: boolean;
  inTheCorridor: boolean;
  path: string;
}

/** One reading, in the reader's terms, for a failure message. */
function shown(at: Five): string {
  return (
    `near=[${at.near.join(", ")}] hash="${at.hash}" keyboard=${at.keyboard} framed=${at.framed} ` +
    `closeOn="${at.closeOn}" said="${at.said}"`
  );
}

/** Everything that is not naming `id`, of the four that are claims about where
 *  the reader is standing. Empty means they agree. */
function notNaming(at: Five, id: string): string[] {
  const stage = STAGES.find((one) => `stage-${one.id}` === id);
  if (!stage) return [`${id} is not one of the corridor's doors`];
  const wrong: string[] = [];
  if (!at.near.includes(id)) wrong.push(`the doors drawn as arrived at are [${at.near.join(", ")}]`);
  if (at.hash !== `#${stage.id}`) wrong.push(`the URL says "${at.hash}"`);
  if (at.keyboard !== id) wrong.push(`the keyboard is on "${at.keyboard}"`);
  if (!at.said.includes(`week ${stage.week} door`)) wrong.push(`the live region says "${at.said}"`);
  return wrong;
}

/** And everything still naming a door, for the state where none should. */
function stillNamingADoor(at: Five): string[] {
  const wrong: string[] = [];
  if (at.near.length) wrong.push(`the doors drawn as arrived at are [${at.near.join(", ")}]`);
  if (at.hash !== `#${CORRIDOR!.id}`) wrong.push(`the URL says "${at.hash}"`);
  if (/week \d+ door/.test(at.said)) wrong.push(`the live region says "${at.said}"`);
  if (at.closeOn) wrong.push(`the camera is close on "${at.closeOn}"`);
  if (at.framed) wrong.push("the HUD still says the camera is framed");
  return wrong;
}

const read = async (tab: Tab): Promise<Five> => JSON.parse(await tab.evaluate<string>(FIVE)) as Five;
const since = async (tab: Tab): Promise<string[]> => JSON.parse(await tab.evaluate<string>(SINCE)) as string[];

async function open(): Promise<{ site: Awaited<ReturnType<typeof serveBuild>>; tab: Tab }> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  // Reduced motion on purpose, the same branch `backlot-doors` walks: it is
  // where Esc with nothing framed falls through to leaving the room, and where
  // the camera's travel does not hide a state behind a 620 ms journey.
  await tab.viewport(1920, 1080);
  await tab.media({ colourScheme: "dark", reducedMotion: true });
  await tab.goto(`${site.origin}${prefix}backlot/`);
  expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");
  expect(await tab.evaluate<string>(SPY), "there is no live region to watch").toBe("watching");
  await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${CORRIDOR_DOOR!.id}"]').click(); return 1;`);
  await pause(3800);
  return { site, tab };
}

/** Walk up the left wall until exactly one door's reach holds the figure and
 *  the camera has pushed in on it. Not week 1: S3 needs floor behind the door
 *  as well as in front of it. */
async function walkToADoor(tab: Tab): Promise<string> {
  await tab.hold("ArrowLeft", 900);
  await pause(600);
  let at = await read(tab);
  for (let i = 0; i < 24; i++) {
    await tab.hold("ArrowUp", 150);
    await pause(360);
    at = await read(tab);
    if (at.near.length === 1 && at.framed && at.near[0] !== "stage-week-01") return at.near[0]!;
  }
  throw new Error(`never stood alone at a door with the camera in: ${shown(at)}`);
}

// ---------------------------------------------------------------------------
// 1. Esc at a door, and the two ways of moving while the refusal stands.
// ---------------------------------------------------------------------------

interface Refused {
  door: string;
  atDoor: Five;
  afterEsc: Five;
  saidOnEsc: string[];
  steppedBack: Five;
  stillInReach: boolean;
  steppedIn: Five;
  reachedTheBand: boolean;
  bandAway: Five;
  bandBack: Five;
  blurred: Five;
  landed: string;
}

async function escAtADoor(): Promise<Refused> {
  const { site, tab } = await open();
  try {
    const door = await walkToADoor(tab);
    const atDoor = await read(tab);
    await since(tab);

    await tab.press("Escape");
    await pause(1300);
    const afterEsc = await read(tab);
    const saidOnEsc = await since(tab);

    // S3. A short tap back, which is inside the reach — 1.3 m of it — and a
    // short tap forward again.
    await tab.hold("ArrowDown", 90);
    await pause(500);
    const steppedBack = await read(tab);
    const stillInReach = steppedBack.near.includes(door);
    await tab.hold("ArrowUp", 90);
    await pause(900);
    const steppedIn = await read(tab);

    // S3 again, in the overlap band, which is the state the refusal's own
    // handover has to survive: the reaches are 1.3 m against a 2.0 m pitch, so
    // there is a strip where the figure is inside this door's reach and nearer
    // the one behind it. Stepping into that strip frames the neighbour — it was
    // never refused — and stepping back out of it arrives at a refused door with
    // the camera on somebody else. Walked in small taps because the strip is
    // 0.3 m wide and a long hold crosses it without ever being asked where it is.
    const route = `#${door.replace("stage-", "")}`;
    let reachedTheBand = false;
    let bandAway = steppedIn;
    for (let i = 0; i < 14 && !reachedTheBand; i++) {
      await tab.hold("ArrowDown", 60);
      await pause(420);
      bandAway = await read(tab);
      if (!bandAway.near.includes(door)) break;
      reachedTheBand = bandAway.hash !== route;
    }
    let bandBack = bandAway;
    if (reachedTheBand) {
      for (let i = 0; i < 14; i++) {
        await tab.hold("ArrowUp", 60);
        await pause(420);
        bandBack = await read(tab);
        if (bandBack.hash === route) break;
      }
    }

    // The window-level Enter, which is the one that goes through `atDoorId`.
    // With the door's button focused this would be the button's own activation
    // and would prove nothing about where the reader is.
    await tab.evaluate(`document.activeElement && document.activeElement.blur(); return 1;`);
    await pause(300);
    const blurred = await read(tab);
    await tab.press("Enter");
    await pause(5000);
    const landed = await tab.evaluate<string>(`return location.pathname;`);
    return {
      door,
      atDoor,
      afterEsc,
      saidOnEsc,
      steppedBack,
      stillInReach,
      steppedIn,
      reachedTheBand,
      bandAway,
      bandBack,
      blurred,
      landed,
    };
  } finally {
    await tab.close();
    await site.close();
  }
}

// ---------------------------------------------------------------------------
// 2. Leaving every door's reach, and walking back in.
// ---------------------------------------------------------------------------

interface Left {
  door: string;
  away: Five;
  saidOnLeaving: string[];
  afterEnter: Five;
  saidOnEnter: string[];
  reachedItAgain: boolean;
  backAgain: Five;
}

async function leaveAndComeBack(): Promise<Left> {
  const { site, tab } = await open();
  try {
    const door = await walkToADoor(tab);
    // Esc first, so this is also the state review B5 could not get out of: a
    // live refusal, and the reader walking away from the door it was taken at.
    await tab.press("Escape");
    await pause(1300);
    await since(tab);

    // Back out into the middle of the corridor, which is 1.9 m from every side
    // door and so is outside all twelve reaches at once.
    let away = await read(tab);
    for (let i = 0; i < 12 && away.near.length; i++) {
      await tab.hold("ArrowRight", 220);
      await pause(360);
      away = await read(tab);
    }
    await pause(900);
    away = await read(tab);
    const saidOnLeaving = await since(tab);

    // Enter, with nothing in the HUD focused and the figure at no door, does
    // nothing at all.
    await tab.evaluate(`document.activeElement && document.activeElement.blur(); return 1;`);
    await pause(300);
    await tab.press("Enter");
    await pause(3000);
    const afterEnter = await read(tab);
    const saidOnEnter = await since(tab);

    // And back in — **to the same door**, which is the whole of what this leg
    // is for. Walking until any door frames passes the refused one by and
    // settles on the next one along, and a refusal that outlives its door reads
    // as a clean arrival two metres further up the corridor. So the walk stops
    // when the door the Esc was pressed at is the nearest one again, which is
    // what the hash says, and the camera is read there.
    const route = `#${door.replace("stage-", "")}`;
    await tab.hold("ArrowLeft", 900);
    await pause(900);
    let backAgain = await read(tab);
    for (let i = 0; i < 16 && backAgain.hash !== route; i++) {
      await tab.hold("ArrowUp", 90);
      await pause(420);
      backAgain = await read(tab);
    }
    const reachedItAgain = backAgain.hash === route;
    await pause(900);
    backAgain = await read(tab);
    return { door, away, saidOnLeaving, afterEnter, saidOnEnter, reachedItAgain, backAgain };
  } finally {
    await tab.close();
    await site.close();
  }
}

const refused = await escAtADoor();
const left = await leaveAndComeBack();

describe("Esc at a door pulls the camera back and nothing else", () => {
  it("has a corridor of doors to stand at", () => {
    expect(CORRIDOR, "there is no corridor, so this file is about nothing").toBeDefined();
    expect(CORRIDOR_DOOR, "no door opens the corridor").toBeDefined();
    expect(STAGES.length, "the corridor has no stages").toBeGreaterThan(2);
  });

  it("was standing at a door with the camera in, before any of this", () => {
    expect(
      notNaming(refused.atDoor, refused.door),
      `the control reading is already wrong: ${shown(refused.atDoor)}. Everything below is about a state ` +
        `reached from this one, so a disagreement here is not what this file is for.`,
    ).toEqual([]);
    expect(refused.atDoor.framed, `the camera never came in: ${shown(refused.atDoor)}`).toBe(true);
  });

  it("takes the camera off the door", () => {
    expect(
      refused.afterEsc.framed,
      `Escape left the camera framed: ${shown(refused.afterEsc)}. Esc pulls back, which is the one thing ` +
        `it is for.`,
    ).toBe(false);
    expect(
      refused.afterEsc.closeOn,
      `Escape pulled the camera back and the canvas still says it is close on "${refused.afterEsc.closeOn}". ` +
        `That sentence is the same class of lie as an arrival left standing after the reader has walked away.`,
    ).toBe("");
  });

  it("leaves the reader in the corridor, not on the backlot", () => {
    expect(
      refused.afterEsc.inTheCorridor,
      `Escape at a door took the reader out of the corridor: ${shown(refused.afterEsc)}. A reader who has ` +
        `come in close on something expects Esc to pull back, not to throw them out of the room.`,
    ).toBe(true);
  });

  it("leaves all four still naming that door", () => {
    const wrong = notNaming(refused.afterEsc, refused.door);
    expect(
      wrong,
      `after Escape at ${refused.door} the four no longer agree: ${wrong.join("; ")}. The refusal is an ` +
        `answer about the shot. The reader has not moved.`,
    ).toEqual([]);
  });

  it("says one sentence on Escape, and it still names the door", () => {
    const stage = STAGES.find((one) => `stage-${one.id}` === refused.door);
    expect(
      refused.saidOnEsc,
      `Escape said ${refused.saidOnEsc.length} thing(s): ${JSON.stringify(refused.saidOnEsc)}. A live region ` +
        `holds one message, so this one has to do both jobs — the camera has come back, and the reader has ` +
        `not moved.`,
    ).toHaveLength(1);
    expect(
      refused.saidOnEsc[0],
      `Escape said "${refused.saidOnEsc[0]}", which does not name the door the other three answers name. ` +
        `That made the live region the one of the four that had stopped.`,
    ).toContain(`week ${stage!.week} door`);
  });

  it("keeps the camera out when the reader steps back inside the reach", () => {
    expect(
      refused.stillInReach,
      `the step back left the door's reach altogether: ${shown(refused.steppedBack)}. This case is about ` +
        `moving **inside** the reach, so it did not run.`,
    ).toBe(true);
    expect(
      refused.steppedBack.framed,
      `stepping back inside the reach put the camera back on the door: ${shown(refused.steppedBack)}. The ` +
        `reader refused it and has not left.`,
    ).toBe(false);
    expect(notNaming(refused.steppedBack, refused.door)).toEqual([]);
  });

  it("keeps the camera out when the reader steps forward again", () => {
    expect(
      refused.steppedIn.framed,
      `stepping forward again inside the reach put the camera back: ${shown(refused.steppedIn)}`,
    ).toBe(false);
    const wrong = notNaming(refused.steppedIn, refused.door);
    expect(
      wrong,
      `after Esc, a step back and a step forward the four disagree: ${wrong.join("; ")}. This is the ` +
        `sequence review B5 reproduced eight times out of eight.`,
    ).toEqual([]);
  });

  it("walked into the band where the nearest door is the one behind", () => {
    expect(
      refused.reachedTheBand,
      `the walk never reached the strip where the figure is inside ${refused.door}'s reach and nearer the ` +
        `door behind it — last reading ${shown(refused.bandAway)}. The hand-back into a refused door is ` +
        `only reachable from there, so this is reported rather than passed: the case did not run.`,
    ).toBe(true);
    expect(
      refused.bandAway.near,
      `in the band the figure should still be inside ${refused.door}'s reach: ${shown(refused.bandAway)}`,
    ).toContain(refused.door);
    // The neighbour was never refused, so it gets the camera — and the reading
    // below is only worth anything because of it: "the camera is off the refused
    // door" means nothing unless the camera was on something to begin with.
    expect(
      refused.bandAway.framed,
      `the door behind was never refused and the camera did not come in on it: ${shown(refused.bandAway)}. ` +
        `Without that, the next reading cannot tell a camera that was taken off the neighbour from a camera ` +
        `that was never anywhere.`,
    ).toBe(true);
  });

  it("comes back out of the band with the four on the refused door and the camera on nothing", () => {
    const wrong = notNaming(refused.bandBack, refused.door);
    expect(
      wrong,
      `arriving back at ${refused.door} from the band, the four disagree: ${wrong.join("; ")}. A refusal ` +
        `must not veto the hand-over — the keyboard, the URL and the sentence belong to the door the reader ` +
        `is at, whatever the camera is doing.`,
    ).toEqual([]);
    expect(
      refused.bandBack.closeOn,
      `arriving back at ${refused.door} left the canvas saying the camera is close on ` +
        `"${refused.bandBack.closeOn}" — the door next to the one the reader is standing at.`,
    ).toBe("");
    expect(refused.bandBack.framed, `the refused door was framed again: ${shown(refused.bandBack)}`).toBe(false);
  });

  it("opens that door on a window-level Enter with nothing focused", () => {
    expect(
      refused.blurred.keyboard,
      `the keyboard was still in the HUD (${refused.blurred.keyboard}), so Enter went through a button's own ` +
        `activation and this says nothing about where the reader is.`,
    ).toBe("<body>");
    const week = refused.blurred.hash.replace(/^#/, "");
    expect(
      refused.landed.includes(week),
      `the four said ${refused.blurred.hash} and the live region said "${refused.blurred.said}", and Enter ` +
        `opened ${refused.landed}. A refusal is not the reader saying they have left the door.`,
    ).toBe(true);
    expect(week, `Enter was pressed somewhere other than the refused door: ${shown(refused.blurred)}`).toBe(
      refused.door.replace("stage-", ""),
    );
  });
});

describe("walking out of every door's reach", () => {
  it("leaves nothing naming a door", () => {
    const wrong = stillNamingADoor(left.away);
    expect(
      wrong,
      `the figure is at no door and ${wrong.length} thing(s) still say otherwise: ${wrong.join("; ")}. ` +
        `Reading: ${shown(left.away)}`,
    ).toEqual([]);
  });

  it("says so once, in a sentence that names no door", () => {
    expect(
      left.saidOnLeaving,
      `walking out of every reach said ${left.saidOnLeaving.length} thing(s): ` +
        `${JSON.stringify(left.saidOnLeaving)}. Arrival was announced and departure was not, which left the ` +
        `last arrival standing in the live region while the reader was nowhere near it.`,
    ).toHaveLength(1);
    expect(
      /week \d+ door/.test(left.saidOnLeaving[0] ?? ""),
      `the departure sentence is "${left.saidOnLeaving[0]}", which names a door the reader has left`,
    ).toBe(false);
  });

  it("does nothing at all on Enter", () => {
    expect(
      left.afterEnter.path,
      `Enter at no door navigated to ${left.afterEnter.path}. A window-level Enter goes through the door the ` +
        `figure is standing at, and there is not one.`,
    ).toBe(left.away.path);
    expect(
      left.afterEnter.inTheCorridor,
      `Enter at no door took the reader out of the corridor: ${shown(left.afterEnter)}`,
    ).toBe(true);
    expect(
      left.saidOnEnter,
      `Enter at no door said ${JSON.stringify(left.saidOnEnter)}. Nothing happened, so there is nothing to say.`,
    ).toEqual([]);
  });

  it("walked back to the same door it left", () => {
    expect(
      left.reachedItAgain,
      `the walk back never made ${left.door} the nearest door again — last reading ${shown(left.backAgain)}. ` +
        `A return to some other door cannot see a refusal that outlived the one it was taken at, so this is ` +
        `reported rather than passed: the case did not run.`,
    ).toBe(true);
  });

  it("frames that door again when the reader walks back in", () => {
    expect(
      left.backAgain.framed,
      `walking back in left the camera out: ${shown(left.backAgain)}. The refusal was taken at that door and ` +
        `the reader has been out of its reach since, so it has expired. It expires at the reach of the thing ` +
        `it was taken at — 1.3 m for a corridor door — and not at some distance of the camera's.`,
    ).toBe(true);
    const wrong = notNaming(left.backAgain, left.door);
    expect(
      wrong,
      `walking back in, the four disagree: ${wrong.join("; ")}. Reading: ${shown(left.backAgain)}`,
    ).toEqual([]);
    expect(
      left.backAgain.closeOn,
      `the camera came back in and the canvas does not say what it is on: ${shown(left.backAgain)}`,
    ).not.toBe("");
  });
});
