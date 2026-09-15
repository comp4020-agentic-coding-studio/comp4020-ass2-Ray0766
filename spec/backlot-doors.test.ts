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
// The engine answers from the **containing set** rather than from the
// crossings — the nearest door whose reach contains the figure is the single
// source for all four. So this file asks the four and requires one answer.
//
// **Rewritten in the sixth round, because the version before it was blind in
// two places and an independent review proved it.** Both blind spots came from
// the same habit: writing down what a key sequence was *meant* to do and then
// asserting something next to it.
//
//   - The twelve-door route identified each sample by the hash and returned
//     early on `#corridor` — so every sample where the URL said "no door" was
//     silently discarded, and "near names a door while the URL does not" is
//     precisely the signature of the defect the route was written for. It could
//     not see it in principle. A sample is now identified by the **containing
//     set**, which is the arithmetic the contract is about, and no reading is
//     skipped: a reading with nothing in reach is judged against "at no door"
//     instead of thrown away.
//   - The first check's comment said its key sequence "leaves the figure in the
//     band where two reaches overlap" and nothing asserted it. Replayed
//     millisecond by millisecond, the figure was inside exactly **one** reach at
//     the moment the check read — the check had never entered the band it was
//     written to guard. It now walks in on 55 ms taps, which is about 0.18 m
//     against a 0.6 m band, and asserts that two reaches hold the figure before
//     it asks anything else.
//
// **The nearest-first rule is checked without measuring a distance.** The DOM
// says which reaches contain the figure; it does not say which door is nearer.
// But the doors' depths are monotone in the week number (`BacklotStage.depth`,
// one metre of pitch, weeks alternating sides), so walking one way down the
// corridor the distance to the shallower door only grows and the distance to the
// deeper one only shrinks. Crossing the band, therefore, the answer must move
// from the shallower door to the deeper one and never back. Two readings inside
// the band and the flip between them is the whole assertion, and reversing the
// ordering in `hotspots.within` inverts it.
//
// **Enter is asked twice, because there are two Enters.** The engine hands the
// keyboard to the door's own button on arrival, so a reader's Enter is normally
// the button's own activation behaviour; the window-level Enter in
// `engine/input.ts` is the one that reads `atDoorId`, and it only runs with
// nothing in the HUD holding focus. A check that presses Enter with the button
// focused therefore tests focus and not `atDoorId` — which is exactly the state
// that decides in the band. So the band run takes the keyboard off the HUD the
// way a reader does, with a click on the page beside the stage, and presses
// Enter from there.
import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import type { BacklotStage } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const CORRIDOR = backlotManifest.rooms.find((room) => room.id === "corridor");
const CORRIDOR_DOOR = backlotManifest.doors.find((door) => door.roomId === "corridor");
const STAGES: BacklotStage[] = CORRIDOR?.stages ?? [];
const CORRIDOR_HASH = `#${CORRIDOR?.id ?? "corridor"}`;
/** Week 1, and it is chosen rather than convenient: behind the first door is
 *  open floor, so "walk out of every door's reach" is two taps there and a walk
 *  back down the corridor anywhere else. */
const FIRST_DOOR = STAGES.find((stage) => stage.week === 1);

/** A tap of a walk key, and the pause the engine is given to answer it.
 *
 *  0.18 m a tap, measured: eleven taps between same-side doors two metres
 *  apart. The band is 0.6 m, so it takes three readings, and one tap of
 *  overshoot past its edge is well inside its own half-width — which is what
 *  makes "the first reading inside the band is in its first half" a statement
 *  about arithmetic rather than about luck. A 110 ms tap is 0.33 m and lands
 *  the first reading on the midpoint, which is where the old sequence's claim
 *  came apart. */
const TAP = 55;
const SETTLE = 320;

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

/** Every sentence the live region has spoken since this was installed.
 *
 *  "The live region announces once" is a claim about how many times it speaks,
 *  and the region's own text only ever holds the last one — so the count has to
 *  be collected as it happens. `announcer` empties the node before it sets it
 *  40 ms later, so an empty reading is half of one announcement and not an
 *  announcement of nothing. */
const WATCH_LIVE = String.raw`
  const live = document.querySelector("[data-backlot-live], [aria-live]");
  const heard = [];
  window.__doorsHeard = heard;
  const observer = new MutationObserver(() => {
    const text = (live.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    if (heard[heard.length - 1] === text) return;
    heard.push(text);
  });
  observer.observe(live, { childList: true, characterData: true, subtree: true });
  return 1;
`;

const HEARD = String.raw`return JSON.stringify(window.__doorsHeard || []);`;

/** Somewhere a reader can click to take the keyboard off the HUD without saying
 *  anything to the scene.
 *
 *  The window-level Enter only runs with nothing in the HUD focused, and the
 *  engine hands the keyboard to a door's button the moment it frames one, so a
 *  driver that wants that path has to get out of the HUD the way a reader does.
 *  A click on the **canvas** is not it: the god view sees nothing but floor, so
 *  the ray hits the ground and the click is a walk-to — driven, and it moved the
 *  figure out of every reach. A click on the page beside the stage takes the
 *  focus and tells the scene nothing.
 *
 *  Derived from the page rather than named: the first element outside the
 *  canvas's box that is not a control and hit-tests to itself. A check whose
 *  scope is a hand-kept name goes quiet the day the page is restyled
 *  (CLAUDE.md §7), and this one fails loudly instead. */
const OFF_THE_HUD = String.raw`
  const canvas = document.querySelector("[data-backlot-canvas]");
  const box = canvas.getBoundingClientRect();
  for (const element of document.querySelectorAll("body *")) {
    if (element.closest("a, button, input, select, textarea, [tabindex], [data-backlot-canvas]")) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 12) continue;
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    if (document.elementFromPoint(x, y) !== element) continue;
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) continue;
    return JSON.stringify({ x, y, what: element.tagName.toLowerCase() });
  }
  return JSON.stringify(null);
`;

interface Four {
  near: string[];
  hash: string;
  keyboard: string;
  said: string;
  closeOn: string;
  inTheCorridor: boolean;
}

// ---------------------------------------------------------------------------
// Reading the four
// ---------------------------------------------------------------------------

const hotspotOf = (stage: BacklotStage): string => `stage-${stage.id}`;
const stageOfHotspot = (id: string): BacklotStage | null =>
  STAGES.find((stage) => hotspotOf(stage) === id) ?? null;
const stageOfHash = (hash: string): BacklotStage | null =>
  STAGES.find((stage) => `#${stage.id}` === hash) ?? null;

/**
 * Does this sentence name this door?
 *
 * Asked as a property rather than as a string, because two of the sentences the
 * contract requires do not exist yet — the one after Esc and the one on leaving
 * every reach are the engine's to word, not this file's. A sentence names a door
 * if it carries that week's own number or that week's own title; nothing else
 * in the corridor's twelve titles is a substring of another, and the word
 * boundary is what stops "week 1" matching "week 11".
 */
function namesWeek(said: string, stage: BacklotStage): boolean {
  return new RegExp(String.raw`\bweek\s+` + stage.week + String.raw`\b`, "i").test(said) || said.includes(stage.title);
}

const doorsNamedBy = (said: string): BacklotStage[] => STAGES.filter((stage) => namesWeek(said, stage));

/** Which door the camera is on, or null for pulled back. The camera is the fifth
 *  answer and is governed separately from the four; see `cameraPulledBack`. */
function cameraOn(at: Four): BacklotStage | null {
  const week = /^Week (\d+):/.exec(at.closeOn);
  return week ? STAGES.find((stage) => stage.week === Number(week[1])) ?? null : null;
}

/**
 * Which door a reading claims the reader is at.
 *
 * The URL first, because that is the answer the engine commits to and the one a
 * reader can copy; then the sentence, then the keyboard, then whatever contains
 * the figure. **Never "skip this reading".** The version of this file that asked
 * the hash and returned early when it said `#corridor` could not see the defect
 * it was written for, because the URL going quiet while a reach still holds the
 * figure *is* the defect. A reading that no answer can name at all, with nothing
 * in reach, is a reading of "at no door" and is judged as one.
 */
function claimOf(at: Four): BacklotStage | null {
  const said = doorsNamedBy(at.said);
  return (
    stageOfHash(at.hash) ??
    (said.length === 1 ? said[0]! : null) ??
    stageOfHotspot(at.keyboard) ??
    (at.near.length ? stageOfHotspot(at.near[0]!) : null)
  );
}

/**
 * Everything wrong with one reading of the four, in the reader's terms. Empty
 * means the four agree.
 *
 * `door` is the door the reader is standing at, or null for "at no door".
 *
 * **The camera is not in here, and that is the change this round made.** Under
 * the refusal rule an Esc at a door pulls the camera back and the four go on
 * naming that door, so folding `closeOn` in with them — which the version
 * before this did — turns a refusal into a disagreement and makes the correct
 * behaviour unassertable. It is asked separately, by a caller that knows whether
 * the camera is supposed to be in or out at that moment.
 *
 * The keyboard is not asked about in the "no door" case either, and for the
 * opposite reason: a reader who walks out of a door's reach was never using the
 * keyboard, and moving focus off the control they are on would be the theft
 * CLAUDE.md §7 forbids. "No door" is a claim about the containing set, the URL
 * and the sentence.
 */
function fourDisagreements(at: Four, door: BacklotStage | null): string[] {
  const named = { hash: stageOfHash(at.hash), keyboard: stageOfHotspot(at.keyboard), said: doorsNamedBy(at.said) };
  const wrong: string[] = [];
  if (door) {
    const id = hotspotOf(door);
    if (!at.near.includes(id)) {
      wrong.push(`the doors drawn as arrived at are [${at.near.join(", ") || "none"}], which does not include ${id}`);
    }
    if (named.hash?.id !== door.id) wrong.push(`the URL says "${at.hash}" rather than "#${door.id}"`);
    if (named.keyboard?.id !== door.id) wrong.push(`the keyboard is on "${at.keyboard}" rather than ${id}`);
    if (named.said.length !== 1 || named.said[0]!.id !== door.id) {
      wrong.push(`the live region says "${at.said}", which does not name week ${door.week} and only week ${door.week}`);
    }
    return wrong;
  }
  if (at.near.length) {
    wrong.push(`no door was named and [${at.near.join(", ")}] still hold the figure inside their reach`);
  }
  if (at.hash !== CORRIDOR_HASH) {
    wrong.push(`the figure is at no door and the URL says "${at.hash}" rather than "${CORRIDOR_HASH}"`);
  }
  if (named.said.length) {
    wrong.push(`the figure is at no door and the live region still says "${at.said}"`);
  }
  return wrong;
}

/** The camera, in: close on this door and no other. */
function cameraPushedIn(at: Four, door: BacklotStage): string[] {
  const on = cameraOn(at);
  if (on?.id === door.id) return [];
  return [`the camera is close on "${at.closeOn || "nothing"}" rather than on "Week ${door.week}: ${door.title}"`];
}

/** The camera, out. What a refusal governs, and the whole of what it governs. */
function cameraPulledBack(at: Four): string[] {
  return at.closeOn ? [`the camera is still close on "${at.closeOn}" rather than pulled back`] : [];
}

/**
 * The camera, in or out but never somewhere else.
 *
 * The weaker of the three, used only where the caller cannot know whether a
 * refusal is standing — the twelve-door route presses Esc at every door it
 * samples, so from the next reading on, "the camera is out" is correct and
 * "the camera is in" is correct too, depending on a rule the engine owns. What
 * is wrong in every case is the camera sitting on a door the four do not name,
 * which is the shape the defect actually had (`near` week 3, camera week 1).
 * The strict questions are asked where the state is known: in on arrival and on
 * walking back in, out after Esc.
 */
function cameraNotOnAnotherDoor(at: Four, door: BacklotStage): string[] {
  const on = cameraOn(at);
  if (!on || on.id === door.id) return [];
  return [`the camera is close on "${at.closeOn}" while the four name week ${door.week}`];
}

const line = (where: string, at: Four): string =>
  `${where.padEnd(28)} near=[${at.near.join(",")}] hash="${at.hash}" keyboard=${at.keyboard} ` +
  `closeOn="${at.closeOn}" said="${at.said}"`;

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

async function open(): Promise<{ site: Awaited<ReturnType<typeof serveBuild>>; tab: Tab }> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  return { site, tab };
}

const read = async (tab: Tab): Promise<Four> => JSON.parse(await tab.evaluate<string>(FOUR)) as Four;

async function intoTheCorridor(tab: Tab, origin: string, reduced: boolean): Promise<void> {
  await tab.viewport(1920, 1080);
  await tab.media({ colourScheme: "dark", reducedMotion: reduced });
  await tab.goto(`${origin}${prefix}backlot/`);
  expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");
  await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${CORRIDOR_DOOR!.id}"]').click(); return 1;`);
  await pause(3800);
}

// ---------------------------------------------------------------------------
// 1. Into the band where two reaches overlap, and out through the window-level
//    Enter — the one that reads `atDoorId` rather than whatever has focus.
// ---------------------------------------------------------------------------

interface Crossing {
  /** Every reading taken with two or more reaches holding the figure. */
  band: Four[];
  /** The whole walk as lines, so a failure can quote the approach it came off. */
  log: string[];
  /** Where the keyboard was taken off the HUD, and what that cost. */
  clicked: string;
  blurred: Four | null;
  movedTheFigure: boolean;
  /** Where the window-level Enter went. */
  landed: string;
}

async function crossTheBand(): Promise<Crossing> {
  const { site, tab } = await open();
  const log: string[] = [];
  const band: Four[] = [];
  try {
    // Reduced motion on purpose: it is the branch where the old defect put the
    // reader out of the corridor, and it is the one where the camera arrives
    // rather than travels, so a reading is of a settled scene.
    await intoTheCorridor(tab, site.origin, true);
    log.push(line("entered the corridor", await read(tab)));
    // Over to the left wall, where the odd weeks are. The band only exists
    // beside a wall: the reach is 1.3 m from a door and the middle of the
    // corridor is 1.9 m from every one of them.
    await tab.hold("ArrowLeft", 900);
    await pause(600);
    for (let step = 0; step < 40; step++) {
      await tab.hold("ArrowUp", TAP);
      await pause(SETTLE);
      const at = await read(tab);
      log.push(line(`tap ${String(step).padStart(2, "0")}`, at));
      if (at.near.length < 2) {
        // Out the far side of the band before the answer moved. Stop and let the
        // assertions say so with the walk in hand, rather than walking on to the
        // next band and reporting a crossing that is two doors from this one.
        if (band.length) break;
        continue;
      }
      band.push(at);
      const first = claimOf(band[0]!);
      const now = claimOf(at);
      // Both halves of the band seen. Stop here, still inside it, because the
      // Enter below has to be pressed where two reaches hold the figure — that
      // is the only state in which `atDoorId` and "the farthest of them" differ.
      if (band.length >= 2 && first && now && first.id !== now.id) break;
    }
    const before = band[band.length - 1] ?? (await read(tab));
    const target = JSON.parse(await tab.evaluate<string>(OFF_THE_HUD)) as { x: number; y: number; what: string } | null;
    if (!target) {
      throw new Error("no element beside the stage to click, so the window-level Enter cannot be reached");
    }
    await tab.click(target.x, target.y);
    await pause(900);
    const blurred = await read(tab);
    log.push(line(`clicked the ${target.what} beside the stage`, blurred));
    const movedTheFigure = JSON.stringify(blurred.near) !== JSON.stringify(before.near);
    await tab.press("Enter");
    await pause(5000);
    const landed = await tab.evaluate<string>(`return location.pathname;`);
    return { band, log, clicked: `${target.what} at ${target.x},${target.y}`, blurred, movedTheFigure, landed };
  } finally {
    await tab.close();
    await site.close();
  }
}

// ---------------------------------------------------------------------------
// 2. Esc at a door, and everything that follows from it: the refusal governs
//    the camera and nothing else.
// ---------------------------------------------------------------------------

interface Refused {
  /** Standing at the first door with the camera in. */
  arrived: Four | null;
  /** Esc. The camera comes off; the reader is still in the corridor at a door. */
  afterEscape: Four | null;
  /** A step back that stays inside the reach, and a step forward again. */
  steppedBack: Four | null;
  steppedForward: Four | null;
  /** Out of every door's reach, and what the live region said on the way. */
  leftEveryReach: Four | null;
  heardOnLeaving: string[];
  /** Back in. */
  cameBackIn: Four | null;
  /** Where Enter went, pressed on the door's own button. */
  landed: string;
  log: string[];
}

async function escapeAtADoor(): Promise<Refused> {
  const { site, tab } = await open();
  const log: string[] = [];
  const door = FIRST_DOOR!;
  const id = hotspotOf(door);
  const state: Refused = {
    arrived: null,
    afterEscape: null,
    steppedBack: null,
    steppedForward: null,
    leftEveryReach: null,
    heardOnLeaving: [],
    cameBackIn: null,
    landed: "",
    log,
  };
  try {
    await intoTheCorridor(tab, site.origin, true);
    log.push(line("entered the corridor", await read(tab)));
    await tab.hold("ArrowLeft", 900);
    await pause(600);
    // Up to the first door and no further: its reach alone, with the camera in.
    for (let step = 0; step < 40 && !state.arrived; step++) {
      await tab.hold("ArrowUp", TAP);
      await pause(SETTLE);
      const at = await read(tab);
      log.push(line(`tap ${String(step).padStart(2, "0")}`, at));
      if (at.near.length === 1 && at.near[0] === id && at.closeOn) state.arrived = at;
    }
    if (!state.arrived) return state;

    await tab.press("Escape");
    await pause(1400);
    state.afterEscape = await read(tab);
    log.push(line("Esc at the door", state.afterEscape));

    // One tap back and one tap forward, both inside the reach — 0.18 m against
    // a reach that runs 0.77 m along the wall either side of the stand point.
    // The step back is read as well as the step forward, because "without
    // leaving the reach" is the premise of the whole case and a premise nobody
    // checked is how the last version of this file ended up asserting nothing.
    await tab.hold("ArrowDown", TAP);
    await pause(SETTLE);
    state.steppedBack = await read(tab);
    log.push(line("a step back", state.steppedBack));
    await tab.hold("ArrowUp", TAP);
    await pause(SETTLE + 400);
    state.steppedForward = await read(tab);
    log.push(line("and forward again", state.steppedForward));

    // Out of every reach. Watched from here, because "the live region announces
    // once" is a count and the region only ever holds the last sentence.
    await tab.evaluate(WATCH_LIVE);
    for (let step = 0; step < 24 && !state.leftEveryReach; step++) {
      await tab.hold("ArrowDown", TAP);
      await pause(SETTLE);
      const at = await read(tab);
      if (at.near.length === 0) state.leftEveryReach = at;
    }
    await pause(900);
    if (state.leftEveryReach) {
      state.leftEveryReach = await read(tab);
      log.push(line("out of every reach", state.leftEveryReach));
    }
    state.heardOnLeaving = JSON.parse(await tab.evaluate<string>(HEARD)) as string[];

    // And back in, which is where the refusal has to have cleared.
    for (let step = 0; step < 24 && !state.cameBackIn; step++) {
      await tab.hold("ArrowUp", TAP);
      await pause(SETTLE);
      const at = await read(tab);
      if (at.near.includes(id)) state.cameBackIn = at;
    }
    await pause(900);
    if (state.cameBackIn) {
      state.cameBackIn = await read(tab);
      log.push(line("walked back in", state.cameBackIn));
    }
    // The reader's own Enter: the keyboard is on the door's button, so this is
    // the button's activation behaviour rather than the window-level path. Both
    // have to open this door and they are different code.
    await tab.press("Enter");
    await pause(5000);
    state.landed = await tab.evaluate<string>(`return location.pathname;`);
    return state;
  } finally {
    await tab.close();
    await site.close();
  }
}

// ---------------------------------------------------------------------------
// 3. Every door, on one route.
// ---------------------------------------------------------------------------

interface Visit {
  /** The door's own id, or "(no door)" for a reading with nothing in reach. */
  key: string;
  where: string;
  wrong: string[];
}

interface Route {
  visits: Visit[];
  /** Where the reader stopped being in the corridor, if they ever did. */
  threwOut: string | null;
  log: string[];
}

async function walkThemAll(): Promise<Route> {
  const { site, tab } = await open();
  const visits: Visit[] = [];
  const log: string[] = [];
  let threwOut: string | null = null;
  try {
    await intoTheCorridor(tab, site.origin, true);
    const look = async (where: string): Promise<void> => {
      const at = await read(tab);
      log.push(line(where, at));
      if (!at.inTheCorridor && !threwOut) threwOut = `${where}: ${line(where, at)}`;
      if (!at.inTheCorridor) return;
      // **Nothing is discarded.** A reading with a reach holding the figure is
      // judged against the door it claims; a reading with none is judged
      // against "at no door". The version before this returned here whenever
      // the URL said "#corridor", which is the one reading that matters.
      const door = at.near.length ? claimOf(at) : null;
      const wrong = [
        ...fourDisagreements(at, door),
        ...(door ? cameraNotOnAnotherDoor(at, door) : cameraPulledBack(at)),
      ];
      const key = door ? door.id : "(no door)";
      const already = visits.find((visit) => visit.key === key);
      if (!already) visits.push({ key, where, wrong });
      else if (wrong.length && !already.wrong.length) already.wrong = wrong;
      // **Pull back before walking on.** Walking is camera-relative, so a framed
      // door turns the whole basis and the next arrow key means something else.
      // A reader does this; it is also the only way a scripted route keeps its
      // bearings. Only when something is framed: Esc with the camera already out
      // is the reader's way out of the room, and pressing it here would end the
      // route rather than steady it.
      if (at.closeOn) {
        await tab.press("Escape");
        await pause(500);
      }
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
    return { visits, threwOut, log };
  } finally {
    await tab.close();
    await site.close();
  }
}

const crossed = await crossTheBand();
const refused = await escapeAtADoor();
const route = await walkThemAll();

const walk = (log: string[]): string => `\n  ${log.join("\n  ")}`;

// ---------------------------------------------------------------------------

describe("crossing the band where two reaches overlap", () => {
  it("walks the figure into two reaches at once", () => {
    // (b). The claim the old check made in a comment and never asserted: the
    // sequence is meant to leave the figure where two reaches hold it, and
    // replayed millisecond by millisecond it left the figure in exactly one.
    expect(
      crossed.band.length,
      `no reading on the way up the left wall had two doors' reaches holding the figure, so nothing below is ` +
        `about the overlap band at all. The walk: ${walk(crossed.log)}`,
    ).toBeGreaterThan(0);
  });

  it("crosses it, so the nearest-first rule is watched changing its mind", () => {
    const first = crossed.band[0] ? claimOf(crossed.band[0]) : null;
    const last = crossed.band.length ? claimOf(crossed.band[crossed.band.length - 1]!) : null;
    const crossing =
      `${crossed.band.length} reading(s) inside the band, naming ${first?.id ?? "nothing"} first and ` +
      `${last?.id ?? "nothing"} last. The walk: ${walk(crossed.log)}`;
    expect(
      crossed.band.length,
      `one reading inside the band says nothing about which door is nearer — the crossing is the assertion. ` +
        crossing,
    ).toBeGreaterThan(1);
    expect(
      [first?.id ?? null, last?.id ?? null],
      `a reading inside the band named no door at all. ${crossing}`,
    ).not.toContain(null);
    expect(
      (first?.depth ?? -1) < (last?.depth ?? -1),
      `inside the band the answer went from ${first?.id} to ${last?.id}. The doors' depths are monotone in the week ` +
        `number, so walking in, the distance to the shallower door only grows and the nearest door whose reach ` +
        `contains the figure can only get deeper. ${first?.id} -> ${last?.id} is the nearest-first ordering ` +
        `reversed. ${crossing}`,
    ).toBe(true);
  });

  it("gives one answer at every reading inside the band", () => {
    const wrong = crossed.band
      .map((at, index) => {
        const door = claimOf(at);
        const said = [...fourDisagreements(at, door), ...(door ? cameraPushedIn(at, door) : [])];
        return said.length ? `reading ${index + 1} (${door?.id ?? "no door named"}): ${said.join("; ")}` : "";
      })
      .filter(Boolean);
    expect(
      wrong,
      `inside the band the four answers disagree:\n  ${wrong.join("\n  ")}\nThe walk: ${walk(crossed.log)}`,
    ).toEqual([]);
  });

  it("lets the reader take the keyboard off the HUD without moving the figure", () => {
    expect(
      crossed.movedTheFigure,
      `clicking the ${crossed.clicked} moved the figure, so the Enter below is not pressed where the reading was ` +
        `taken. The walk: ${walk(crossed.log)}`,
    ).toBe(false);
    expect(
      crossed.blurred?.keyboard,
      `clicking the ${crossed.clicked} left the keyboard on "${crossed.blurred?.keyboard}". The window-level Enter ` +
        `only runs with nothing in the HUD focused, so without this the press below goes through a button's own ` +
        `activation and never reaches the door the figure is standing at.`,
    ).toBe("<body>");
  });

  it("opens the door the four named when Enter comes from the window", () => {
    const door = crossed.band.length ? claimOf(crossed.band[crossed.band.length - 1]!) : null;
    expect(
      crossed.landed,
      `the four named ${door?.id ?? "no door"} with [${crossed.band[crossed.band.length - 1]?.near.join(", ")}] ` +
        `holding the figure, and a window-level Enter opened ${crossed.landed}. This is the press that reads ` +
        `atDoorId rather than whatever has focus, and in the band it is the only answer that can differ.`,
    ).toContain(door?.id ?? "no door was named");
  });
});

describe("Esc at a door refuses the camera and nothing else", () => {
  const door = FIRST_DOOR!;

  it("stands at the first door with the camera in on it", () => {
    expect(refused.arrived, `never stood at ${door.id} alone with the camera in. ${walk(refused.log)}`).not.toBeNull();
    const wrong = refused.arrived
      ? [...fourDisagreements(refused.arrived, door), ...cameraPushedIn(refused.arrived, door)]
      : [];
    expect(wrong, `walking up to ${door.id}: ${wrong.join("; ")}`).toEqual([]);
  });

  it("pulls the camera back on Esc and leaves the reader in the corridor", () => {
    // The reduced-motion half of the old defect: with nothing framed, Escape
    // has nothing to pull back from and falls through to leaving the room.
    expect(
      refused.afterEscape?.inTheCorridor,
      `Escape at a door took the reader out of the corridor. A reader who has come in close on something expects ` +
        `Esc to pull back, not to throw them out of the room.`,
    ).toBe(true);
    const wrong = refused.afterEscape ? cameraPulledBack(refused.afterEscape) : ["there was no reading"];
    expect(wrong, `Escape at ${door.id}: ${wrong.join("; ")}`).toEqual([]);
  });

  it("goes on naming that door after the Esc", () => {
    // The refusal governs the camera **only**. The reader is still standing at
    // the door; the four have not stopped being true because the camera came
    // off. This is the expectation this file used to have backwards: it asserted
    // the URL went back to the room, which is the state a reader sees as "the
    // address bar forgot which door I am at".
    const wrong = refused.afterEscape ? fourDisagreements(refused.afterEscape, door) : ["there was no reading"];
    expect(
      wrong,
      `after Esc at ${door.id} the four no longer name it: ${wrong.join("; ")}. Esc is a refusal of the camera, ` +
        `not of the door — a reader standing in front of it has not moved. ${walk(refused.log)}`,
    ).toEqual([]);
  });

  it("holds that answer through a step back inside the reach and forward again", () => {
    expect(
      refused.steppedBack?.near,
      `the step back left ${door.id}'s reach, so this case is not the one it is named for`,
    ).toContain(hotspotOf(door));
    const wrong = refused.steppedForward
      ? [...fourDisagreements(refused.steppedForward, door), ...cameraPulledBack(refused.steppedForward)]
      : ["there was no reading"];
    expect(
      wrong,
      `after Esc, a step back inside the reach and a step forward: ${wrong.join("; ")}. ${walk(refused.log)}`,
    ).toEqual([]);
  });

  it("says once that the reader has left, naming no door", () => {
    expect(refused.leftEveryReach, `never walked out of every door's reach. ${walk(refused.log)}`).not.toBeNull();
    const wrong = refused.leftEveryReach
      ? [...fourDisagreements(refused.leftEveryReach, null), ...cameraPulledBack(refused.leftEveryReach)]
      : ["there was no reading"];
    expect(wrong, `walking out of every reach: ${wrong.join("; ")}. ${walk(refused.log)}`).toEqual([]);
    expect(
      refused.heardOnLeaving,
      `the live region said ${JSON.stringify(refused.heardOnLeaving)} while the reader walked out of every door's ` +
        `reach. It has to say exactly one thing: nothing at all leaves the last door's sentence standing for a ` +
        `screen reader while the figure is nowhere near it, and a sentence a frame is a firehose.`,
    ).toHaveLength(1);
    expect(
      doorsNamedBy(refused.heardOnLeaving[0] ?? "").map((stage) => stage.id),
      `the sentence for leaving every door's reach was "${refused.heardOnLeaving[0] ?? ""}", which still names a door`,
    ).toEqual([]);
  });

  it("pushes the camera in again when the reader walks back in", () => {
    // The refusal has to have cleared. `releaseFraming` sets the clear distance
    // to at least 3 m and walking out of a reach takes 1.3, so "Esc, step back,
    // walk in" landed inside the refusal band every time and the door the reader
    // was standing at could not be framed again.
    expect(refused.cameBackIn, `never walked back into ${door.id}'s reach. ${walk(refused.log)}`).not.toBeNull();
    const wrong = refused.cameBackIn
      ? [...fourDisagreements(refused.cameBackIn, door), ...cameraPushedIn(refused.cameBackIn, door)]
      : ["there was no reading"];
    expect(
      wrong,
      `walking back into ${door.id}'s reach after Esc and stepping out: ${wrong.join("; ")}. ${walk(refused.log)}`,
    ).toEqual([]);
  });

  it("opens the door it named when the reader presses Enter", () => {
    expect(
      refused.landed,
      `the live region said "${refused.cameBackIn?.said}" and Enter opened ${refused.landed}`,
    ).toContain(door.id);
  });
});

describe("walking every door in the corridor", () => {
  it("keeps the reader in the corridor for the whole route", () => {
    expect(
      route.threwOut,
      `the route left the corridor part way through, so every reading after that is of the ring: ${route.threwOut}`,
    ).toBeNull();
  });

  it("reached all twelve on one route", () => {
    const missed = STAGES.filter((stage) => !route.visits.some((visit) => visit.key === stage.id)).map(
      (stage) => stage.id,
    );
    expect(
      missed,
      `the route stood inside the reach of ${route.visits.filter((visit) => visit.key !== "(no door)").length} of ` +
        `${STAGES.length} doors and never stood at ${missed.join(", ")}. A door no check has ever walked to is a ` +
        `door with no evidence behind it — which is how a defect in the overlap band survived four reviews.`,
    ).toEqual([]);
  });

  it("gives one answer at every one of them", () => {
    const wrong = route.visits
      .filter((visit) => visit.wrong.length)
      .map((visit) => `${visit.key} (${visit.where}): ${visit.wrong.join("; ")}`);
    expect(
      wrong,
      `${wrong.length} reading(s) answered "which door are you at" more than one way:\n  ${wrong.join("\n  ")}`,
    ).toEqual([]);
  });
});
