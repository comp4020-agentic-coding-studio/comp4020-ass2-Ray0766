// The two things the corridor's twelve stage windows promise, held to the
// rendered page.
//
// `src/backlot/rooms/corridor-windows.ts` makes four claims and only two of them
// are worth a check. The other two — that the panel is drawn to the opening, and
// that it is legible at 1:1 — are evidence in receipts/rig-3d/b2-stage-windows.md,
// because the first is arithmetic a screenshot cannot improve on and the second
// is a person looking at a 1:1 capture, which is the instrument CLAUDE.md §7
// names for a question about reading. A check written fast against either would
// be a third blind one.
//
// ---------------------------------------------------------------------------
// 1. Where the decoders are NOT
// ---------------------------------------------------------------------------
//
// The obvious check here is "at most one decoder is ever alive", and it **cannot
// go red**. `engine/layers.ts` releases whichever handle is playing on every
// `play()`, so the peak is 1 whatever the corridor does — injected
// `handle.release()` → `handle.pause()` into `setLive`'s leaving branch and the
// peak stayed 1 while a decoder leaked at every stage. Asserting the peak is
// asserting something `layers.ts` guarantees on its own; asserting the zeroes is
// asserting what the corridor does, and that distinction is the whole of why
// this file is shaped the way it is. The next person will find the peak version
// more obvious.
//
// So: a window with no clip behind it holds **no** decoder, and walking away
// from one that has leaves **none** behind. Six of the twelve weeks have a clip;
// weeks 3 and 4 are stills whose first rung really is an image, and weeks 1, 10,
// 11 and 12 recorded nothing at all.
//
// ---------------------------------------------------------------------------
// 2. What an unshot week's window is
// ---------------------------------------------------------------------------
//
// Ray's ruling: a dark empty panel carrying the week's number, in the same frame
// and the same light as a week that did shoot, so a marker reads "this week has
// not been shot yet" rather than "this door is broken".
//
// Two halves, and the second is the one a reviewer would not think to ask for.
// The four windows that should carry a panel carry one; the **eight that should
// not contain none of it**, which is what stops a dropped request ever reading
// as a week that recorded nothing. And the panel is byte-identical in both
// themes, because a window is a picture plane: a week that did shoot hangs a
// recorded frame and the footer toggle does not repaint a photograph, so the
// empty one must not repaint either.
//
// **No colour is named here.** The panel's ground is derived from the four
// windows themselves — the value all four are commonest in — and then held to
// two things it must not be: it must not equal `--at-black`, which is the
// opening's own bare fill and would mean the gate is a hole rather than a lit
// empty frame, and it must appear nowhere in any window that has a picture. A
// check that wrote the composite down would be the wash arithmetic living in two
// places, and would go quiet the day somebody changed one of them.
//
// ---------------------------------------------------------------------------
// Seen red
// ---------------------------------------------------------------------------
//
// Each injection is recorded with the count it matched, because an injection
// that matches a bare pattern is fed by whatever else is in the file — the two
// plate sentinels that went green on a re-take were patched in the wrong place
// by a match that was not unique. `receipts/rig-3d/inject.py` refuses to patch
// unless the count is 1 and prints it either way. `dist/` was hashed either side
// of every run below, because three lanes were rebuilding under each other and a
// rebuild landing mid-run reports "no tests" and is not evidence of anything.
//
// The exact messages are at the foot of this file, next to the injection that
// produced each one.

import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { doorInto, roomNamed } from "./lib/backlot.ts";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import {
  opaque,
  RESOLVE_COLOUR,
  serveBuild,
  Tab,
  type ColourScheme,
  type Key,
  type Resolved,
  type Rgb,
  type StaticSite,
} from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const corridor = roomNamed("corridor");
const lectures = doorInto(corridor);
const stages = corridor.stages ?? [];

/** Which weeks have a clip behind the still, off the manifest rather than a list
 *  here — a week whose first rung stops being a clip changes this check on the
 *  same build it changes the corridor. */
const hasClip = new Map(
  stages.map((stage) => [stage.id, stage.window.kind === "still" && Boolean(stage.window.clip)] as const),
);
const unshot = stages.filter((stage) => stage.window.kind === "unshot").map((stage) => stage.id);
const shot = stages.filter((stage) => stage.window.kind !== "unshot").map((stage) => stage.id);

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/**
 * A walk down the corridor, as held keys.
 *
 * `hold`, never `press`: a press sends the down and the up in the same
 * millisecond, so the figure moves about a tenth of a pixel and nothing is ever
 * arrived at. The strafes are the point — the doors are in the walls and the
 * middle of a corridor is out of reach of all of them, so a figure walked
 * straight up it arrives at the end wall and nowhere else. Same sequence
 * `spec/backlot-hotspots.test.ts` walks, for the same reason.
 */
const WALK: [Key, number][] = [
  ["ArrowUp", 700],
  ["ArrowLeft", 700],
  ["ArrowRight", 700],
  ["ArrowUp", 700],
  ["ArrowRight", 700],
  ["ArrowLeft", 700],
  ["ArrowUp", 700],
  ["ArrowLeft", 700],
  ["ArrowRight", 700],
  ["ArrowUp", 700],
];

interface Step {
  /** Every stage the figure is standing at, by hotspot id, as the engine
   *  publishes it — `data-backlot-near` is set per frame from the ground
   *  distance, which is the same crossing the corridor calls `setLive` from. */
  near: string[];
  /** How many consecutive 50 ms polls this state held for. */
  ticks: number;
  /** Decoders alive: handles that still hold an element with a source on it,
   *  which is the thing `release` actually takes away. Absent means none — the
   *  engine only writes the attribute when the count changes, and it starts at
   *  zero. */
  clips: number;
}

interface Window {
  stage: string;
  /** The opening, as the engine projects it — in the **canvas's** coordinates,
   *  which is why `readWindow` adds the canvas's own client rect before it
   *  samples. `hotspots.ts`'s `setRect` says so; this file did not, and every
   *  crop was 117 rows too high. */
  rect: string;
  /** Every distinct pixel value in that rectangle, with its count. */
  tally: Map<string, number>;
  /** First and last row each value appears on, so a leak can say where it is. */
  span: Map<string, [number, number]>;
  /** The rectangle's height, so a row range reads against something. */
  rows: number;
}

async function enterCorridor(tab: Tab, site: StaticSite, scheme: ColourScheme): Promise<void> {
  await tab.viewport(1920, 1080);
  await tab.colourScheme(scheme);
  // The OS preference alone does not decide it. A first visit is forced dark on
  // any OS (`src/components/DefaultDarkTheme.astro`) and the footer toggle
  // writes `data-theme`, so the stored preference is the thing that actually
  // settles which theme a reader is in — which is why the light one is loaded
  // rather than only emulated.
  const url = `${site.origin}${prefix}backlot/`;
  await tab.goto(url);
  await tab.evaluate(`try { localStorage.setItem("at-theme", ${JSON.stringify(scheme)}); } catch {} return null;`);
  await tab.goto(url);
  await tab.settle();
  await tab.evaluate(`
    const door = document.querySelector('[data-backlot-hud] [data-backlot-hotspot=${JSON.stringify(lectures.id)}]');
    if (!door) throw new Error("no ${lectures.id} door on the ring");
    door.click();
    return null;
  `);
  for (let attempt = 0; attempt < 120; attempt++) {
    const up = await tab.evaluate<number>(
      `return document.querySelectorAll('[data-backlot-hud] [data-backlot-hotspot^="stage-"]').length;`,
    );
    if (up >= stages.length) return;
    await pause(250);
  }
  throw new Error(`the corridor never stood up: fewer than ${stages.length} stage controls after 30 s`);
}

/**
 * Watch what the figure is standing at and what is decoding, continuously.
 *
 * Sampling at the end of each leg does not work, and the first version of this
 * did: the figure passes a door *during* a leg and is no longer standing at it
 * 500 ms later, so eleven samples reported reaching weeks 3, 10 and 12 on a walk
 * that had plainly decoded something on the way. The check was green about a
 * coverage it did not have, and the guard below caught it only because it fired
 * on a run where none of the three had a clip.
 *
 * **Only states that persisted count.** `data-backlot-clips` is published from
 * the render loop while `setLive` runs synchronously inside the proximity
 * crossing, so for up to one frame the two disagree by construction — the figure
 * is already at the door and the count has not been written yet. That is a real
 * property of publishing through a frame, not a defect, and asserting on a
 * single poll would make it a flake. So a state has to hold for three
 * consecutive polls before it is one, and the transient between two states is
 * not asserted on.
 */
function watch(tab: Tab): Promise<void> {
  return tab.evaluate(`
    window.__backlotSteps = [];
    const read = () => {
      const hud = document.querySelector("[data-backlot-hud]");
      return {
        near: [...document.querySelectorAll('[data-backlot-hud] [data-backlot-hotspot^="stage-"]')]
          .filter((button) => button.dataset.backlotNear === "true")
          .map((button) => button.dataset.backlotHotspot)
          .sort(),
        clips: Number(hud?.dataset?.backlotClips ?? 0),
      };
    };
    window.__backlotWatch = setInterval(() => {
      const now = read();
      const log = window.__backlotSteps;
      const last = log[log.length - 1];
      if (last && last.clips === now.clips && String(last.near) === String(now.near)) last.ticks += 1;
      else log.push({ ...now, ticks: 1 });
    }, 50);
    return null;
  `);
}

/** Every state the walk actually held, transients dropped. */
async function held(tab: Tab): Promise<Step[]> {
  const all = await tab.evaluate<(Step & { ticks: number })[]>(`
    clearInterval(window.__backlotWatch);
    return window.__backlotSteps ?? [];
  `);
  return all.filter((step) => step.ticks >= 3);
}

/**
 * Frame one stage's window and read every pixel of it.
 *
 * Focus is how a reader arrives at a door on the keyboard — `hotspots.ts` frames
 * on `focusin`, which headless Chrome delivers only because the harness has
 * `Emulation.setFocusEmulationEnabled` on. It is never pressed: a stage hotspot
 * is an `open-page` and pressing it leaves the backlot.
 *
 * **Waiting is the part that has been wrong twice, so it is written down.** A
 * fixed `setTimeout` and one sample is a single snapshot of a moving scene:
 * measured, one window read 87 pixels of the panel where three repeats of the
 * same cell each read 110, because the camera was still travelling. Waiting for
 * two consecutive identical readings instead is *worse* — two identical readings
 * are what you get after the motion ends **and before it starts** — and it
 * silently took every panel count to zero on the first stage focused after a
 * walk. So this settles on `data-backlot-rect`, which the engine republishes in
 * the same pass that parks the button from the same projection the renderer
 * uses, and it requires the rect to have **moved** from its resting value before
 * it will accept it holding still.
 */
async function readWindow(tab: Tab, stage: string): Promise<Window> {
  const id = `stage-${stage}`;
  const rectOf = () =>
    tab.evaluate<string>(
      `return document.querySelector('[data-backlot-hud] [data-backlot-hotspot=${JSON.stringify(id)}]')` +
        `?.dataset?.backlotRect ?? "";`,
    );

  const resting = await rectOf();
  await tab.evaluate(`
    document.activeElement?.blur();
    document.querySelector('[data-backlot-hud] [data-backlot-hotspot=${JSON.stringify(id)}]').focus();
    return null;
  `);

  let rect = resting;
  let moved = false;
  let held = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    await pause(100);
    const again = await rectOf();
    if (again !== rect) {
      moved = true;
      held = 0;
    } else held += 1;
    rect = again;
    if (moved && held >= 4) break;
  }
  if (!moved || held < 4) {
    throw new Error(
      `${stage}: the camera never arrived. The rect was "${resting}" and is "${rect}"; moved=${moved}. ` +
        `A reading taken while the camera is travelling is not a reading.`,
    );
  }

  const [x, y, width, height] = rect.split(",").map(Number);
  if (!width || !height) throw new Error(`${stage}: published no usable rect ("${rect}")`);

  // **The canvas's own client rect, added.** `data-backlot-rect` is published in
  // the canvas's coordinates — `hotspots.ts`'s `setRect` says so in as many
  // words, "a reader of this attribute adds the canvas's own client rect exactly
  // as they already do for a button's box" — and `tab.raster` takes viewport
  // coordinates. This file was handing one straight to the other.
  //
  // The canvas sits at y=117 at both marking viewports, so every crop was 117 px
  // too high. Of a 209-row window, **92 rows were the window and 117 were the
  // door's upper half and two HUD label capsules**; the numeral sits in the
  // panel's vertical centre and was almost entirely outside what was sampled.
  // Measured on one window: the panel's ground was 9,393 of 25,080 px by the
  // published rect and 21,790 of 25,080 with the offset added — 37% against 87%.
  //
  // Every assertion below reached the right conclusion anyway, which is the
  // uncomfortable part: a check can be right about the page and wrong about
  // where it looked, and the only thing that catches that is somebody reading
  // the attribute's own contract.
  const canvas = await tab.evaluate<{ x: number; y: number }>(
    `const box = document.querySelector("[data-backlot-stage] canvas").getBoundingClientRect();
     return { x: Math.round(box.left), y: Math.round(box.top) };`,
  );
  const raster = await tab.raster({
    x: x! + canvas.x,
    y: y! + canvas.y,
    width: width!,
    height: height!,
  });
  const tally = new Map<string, number>();
  // And which rows each colour occupies, because "72 px of the panel's ground
  // is somewhere in this window" and "72 px of it are the bottom thirteen rows"
  // are different findings and only the second is actionable. Cheap: the same
  // loop, two numbers per colour.
  const span = new Map<string, [number, number]>();
  for (let row = 0; row < raster.height; row++) {
    for (let column = 0; column < raster.width; column++) {
      const key = raster
        .at(column, row)
        .map((channel) => Math.round(channel * 255))
        .join(",");
      tally.set(key, (tally.get(key) ?? 0) + 1);
      const seen = span.get(key);
      span.set(key, seen ? [Math.min(seen[0], row), Math.max(seen[1], row)] : [row, row]);
    }
  }
  return { stage, rect, tally, span, rows: raster.height };
}

const commonest = (window: Window): string =>
  [...window.tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];

let site: StaticSite;
let tab: Tab;
let walk: Step[] = [];
/** Keyed by theme, then by stage. */
const windows = new Map<ColourScheme, Map<string, Window>>();
/** `--at-black`, resolved by the page rather than written down here: it is the
 *  opening's own bare fill, and "the gate is washed rather than bare" is the
 *  claim that separates an empty frame from a hole. */
let bareFill: Rgb;

beforeAll(async () => {
  site = await serveBuild(resolve("dist"), base);
  tab = await Tab.launch();

  // The decoders, walked. One theme: what is decoding has nothing to do with
  // what colour the page is, and a second pass here would be padding.
  await enterCorridor(tab, site, "dark");
  // Nothing focused, so the only thing moving is the figure.
  await tab.evaluate(`document.activeElement?.blur(); return null;`);
  await watch(tab);
  for (const [key, milliseconds] of WALK) {
    await tab.hold(key, milliseconds);
    await pause(500);
  }
  walk = await held(tab);

  // The windows, in both themes, from a fresh page each time so nothing the walk
  // started is still running underneath.
  for (const scheme of ["dark", "light"] as ColourScheme[]) {
    await enterCorridor(tab, site, scheme);
    const read = new Map<string, Window>();
    for (const stage of stages) read.set(stage.id, await readWindow(tab, stage.id));
    windows.set(scheme, read);
  }

  bareFill = opaque(
    await tab.evaluate<Resolved>(`
      ${RESOLVE_COLOUR}
      return resolveColour(getComputedStyle(document.documentElement).getPropertyValue("--at-black").trim());
    `),
    "--at-black",
  );
}, 600_000);

// A minute, not vitest's default ten seconds. `Tab.close()` waits for Chrome to
// actually exit, and under a loaded machine that has taken longer than the
// default — which surfaced as a suite-level "Hook timed out in 10000ms" beside
// perfectly good assertions, i.e. a red that says nothing about the page. The
// teardown still has to finish; it is only allowed to take its time.
afterAll(async () => {
  await tab?.close();
  await site?.close();
}, 60_000);

// ---------------------------------------------------------------------------
// 1. Where the decoders are not
// ---------------------------------------------------------------------------
//
// Seen red by `receipts/rig-3d/inject.py`, **1 match**, replacing the released
// handle in `setLive`'s leaving branch with a paused one — a paused decoder is
// still a decoder, which is the bug the word "released" in that comment exists
// to prevent. Anchored inside the `if (handle) {` block, because `dispose()`
// contains the same call and a bare match would have patched the wrong one.
//
//   AssertionError: a window with no clip behind it is holding a decoder.
//   After leg 4 the figure is at stage-week-10, which has no clip, and 1
//   decoder is alive.: expected 1 to be +0
//
// Reverted, rebuilt, green.
describe("only a window with a clip behind it holds a decoder", () => {
  it("walked far enough to have something to say", () => {
    // A check that never reaches both cases is green about nothing. This is the
    // guard on that, and it is why the strafes are in the walk at all.
    const reached = new Set(walk.flatMap((step) => step.near));
    const withClip = [...reached].filter((id) => hasClip.get(id.replace(/^stage-/, "")));
    const without = [...reached].filter((id) => hasClip.get(id.replace(/^stage-/, "")) === false);
    expect(
      withClip.length,
      `the walk never stood at a week that has a clip, so "a clip week decodes" was never exercised. ` +
        `It reached: ${[...reached].join(", ") || "nothing"}`,
    ).toBeGreaterThan(0);
    expect(
      without.length,
      `the walk never stood at a week with no clip, so the whole of this file was vacuous. ` +
        `It reached: ${[...reached].join(", ") || "nothing"}`,
    ).toBeGreaterThan(0);
    expect(
      walk.some((step) => step.near.length === 0),
      "the walk never stood away from every door, so “walking off leaves nothing behind” was never exercised",
    ).toBe(true);
  });

  it("holds none where there is no clip, and leaves none behind", () => {
    const wrong = walk
      .map((step, index) => ({ index, ...step }))
      .filter((step) => {
        const owed = step.near.some((id) => hasClip.get(id.replace(/^stage-/, ""))) ? 1 : 0;
        return step.clips !== owed;
      });
    const describeStep = (step: { index: number; near: string[]; clips: number; ticks: number }) =>
      `state ${step.index}, held ${step.ticks * 50} ms: the figure is at ${step.near.join(", ") || "no door at all"}, ` +
      `${step.near.some((id) => hasClip.get(id.replace(/^stage-/, ""))) ? "which has a clip" : "which has no clip"}, ` +
      `and ${step.clips} decoder(s) are alive`;
    expect(
      wrong.map(describeStep),
      "A window with no clip behind it must hold no decoder, and walking away from one that has must leave " +
        "none behind. Asserting the peak instead would assert what engine/layers.ts guarantees on its own.",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. What an unshot week's window is
// ---------------------------------------------------------------------------
//
// Seen red twice, both by `receipts/rig-3d/inject.py` at **1 match** each.
//
// (a) The panel pass in `dress()` run over the wrong half of the manifest —
// `spec.kind !== "unshot"` for `spec.kind === "unshot"`, one operator:
//
//   AssertionError: the four unshot windows are painted the opening's own bare
//   fill, which is a hole rather than an empty frame lit from behind.: expected
//   '0,0,0' not to be '0,0,0'
//
// (b) The panel's ground taken from a token that follows the theme —
// `painter.css("gate")` for `painter.css("panel")`, one call:
//
//   AssertionError: an unshot week's window repaints when the theme flips. It
//   is dark 59,40,9 and light 250,250,249, and a window is a picture plane: a
//   week that did shoot hangs a photograph the footer toggle does not
//   repaint.: expected '250,250,249' to be '59,40,9'
//
// Reverted and rebuilt after each.
describe("a week that has not been shot yet says so", () => {
  it("has four windows to be about", () => {
    expect(unshot.length, "no stage in the manifest is unshot, so this file is about nothing").toBeGreaterThan(0);
    expect(shot.length, "every stage is unshot, so the zeroes below prove nothing").toBeGreaterThan(0);
  });

  for (const scheme of ["dark", "light"] as ColourScheme[]) {
    it(`paints one ground across all ${unshot.length} of them in the ${scheme} theme`, () => {
      const read = windows.get(scheme)!;
      const grounds = unshot.map((stage) => ({ stage, ground: commonest(read.get(stage)!) }));
      const distinct = new Set(grounds.map((entry) => entry.ground));
      expect(
        [...distinct],
        `the unshot windows are not one panel at four sizes: ${grounds
          .map((entry) => `${entry.stage} ${entry.ground}`)
          .join(", ")}`,
      ).toHaveLength(1);
    });

    it(`is lit rather than a hole in the ${scheme} theme`, () => {
      const read = windows.get(scheme)!;
      const ground = commonest(read.get(unshot[0]!)!);
      const bare = bareFill.map((channel) => Math.round(channel * 255)).join(",");
      expect(
        ground,
        "the four unshot windows are painted the opening's own bare fill, which is a hole rather than an " +
          "empty frame lit from behind. The gate is that ground with a wash of the brand fill over it; " +
          "hub.ts measured a bare one at 0.012 relative luminance and it read as a hole with writing on it.",
      ).not.toBe(bare);
    });

    it(`is in none of the ${shot.length} windows that have a picture, in the ${scheme} theme`, () => {
      const read = windows.get(scheme)!;
      const ground = commonest(read.get(unshot[0]!)!);
      const leaked = shot
        .map((stage) => ({ stage, window: read.get(stage)!, count: read.get(stage)!.tally.get(ground) ?? 0 }))
        .filter((entry) => entry.count > 0);
      expect(
        leaked.map((entry) => {
          const [first, last] = entry.window.span.get(ground)!;
          return `${entry.stage} carries ${entry.count} px of it, rows ${first}..${last} of ${entry.window.rows}`;
        }),
        "The panel is a claim about the course — that this week recorded nothing — so it may not appear in a " +
          "window that has a picture, and a dropped request must never be dressed as a week that did not shoot.",
      ).toEqual([]);
    });
  }

  it("does not repaint when the theme flips", () => {
    // The claim, in one line: a window is a picture plane. A week that did shoot
    // hangs a recorded frame and the footer toggle does not repaint a
    // photograph, so the week that did not shoot must not repaint either — an
    // empty slot that changes with the theme is the one thing in the row that
    // does, which reads as a mistake rather than as empty.
    const dark = windows.get("dark")!;
    const light = windows.get("light")!;
    expect(
      commonest(light.get(unshot[0]!)!),
      "an unshot week's window repaints when the theme flips, and a window is a picture plane",
    ).toBe(commonest(dark.get(unshot[0]!)!));

    const differing = unshot
      .map((stage) => ({
        stage,
        dark: dark.get(stage)!.tally.get(commonest(dark.get(stage)!)) ?? 0,
        light: light.get(stage)!.tally.get(commonest(dark.get(stage)!)) ?? 0,
      }))
      .filter((entry) => entry.dark !== entry.light);
    expect(
      differing.map((entry) => `${entry.stage}: ${entry.dark} px dark against ${entry.light} px light`),
      "the panel covers a different amount of its window in the two themes, so something in it is theme-aware",
    ).toEqual([]);
  });
});
