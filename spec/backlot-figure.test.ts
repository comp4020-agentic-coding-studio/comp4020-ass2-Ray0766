// How bright the figure is allowed to be, measured on the composite, in the
// machine room, at both marking viewports and in both themes.
//
// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------
//
// The figure may not out-shine the five screens **or the tower**. The screens
// were already the ceiling — `spec/backlot-fitout.test.ts` ranks every painted
// cell against the middle of the five — and that line is loose in the one place
// it matters: it is a statement about the *room*, and the brightest painted
// thing in the room happens to be the figure, so the room's ceiling and the
// figure's ceiling have been the same assertion by accident. They are not the
// same assertion. The tower is a machine the room is named for, it is painted
// dark on purpose (`furniture.ts`: `SHELL_LEVEL`, `BAR_LEVEL`, `MESH_LEVEL`),
// and it reads a great deal lower than a screen — so "under the tower" is a
// much tighter floor than "under the screens", and it is the one that decides
// whether a figure reads as a person standing in a room or as a bollard lit
// from inside.
//
// Measured with the HUD hidden, under reduced motion, in 40 px cells at 1920 and
// 8 px at 390 (the contract's cell, scaled the way `backlot-fitout` scales it).
//
// **At df44ec0, the figure this file was written against:**
//
//                 figure            tower             the five screens
//   1920 dark     110.2 (1320,560)   78.6 (1050,703)  121.2 123.3 147.4 149.0 164.9
//   1920 light    101.1 (1400,580)  160.4 (1040,788)  121.2 125.3 147.4 150.5 168.8
//    390 dark     126.3  (308,384)   93.7  (234,427)  153.6 162.9 186.8 191.5 192.2
//    390 light    153.0  (332,388)  170.2  (221,451)  153.6 162.9 191.5 191.7 195.0
//
// which is over the tower at both viewports in the dark theme — what a marker
// sees on a first visit — and 40.1% over it at 1920. That was the state this
// file was written against and its first red was its own subject rather than an
// injection.
//
// **And on the rebuilt figure, with the tower read inside the rectangle the
// room now publishes for it:**
//
//                 figure            tower             the five screens
//   1920 dark      57.8 (1320,600)   80.0 (1061,693)  121.2 123.3 147.4 149.0 164.9
//   1920 light    118.9 (1280,760)  138.9 (1071,653)  121.2 125.3 147.4 150.5 168.8
//    390 dark      82.8  (340,392)   93.7  (234,427)  153.6 162.9 186.8 191.5 192.2
//    390 light    128.8  (340,464)  177.8  (235,411)  153.6 162.9 191.5 191.7 195.0
//
// Under the tower at every viewport in both themes, and under the dimmest of the
// five screens everywhere. The tightest of the four is 390 in the dark theme,
// where the figure has 12% of headroom.
//
// The tower's number moves with the box it is read in — 68.6 in the brief, 78.6
// off the light bar's own neighbourhood, 80.0 inside the published rect. All
// three are the tower. The reading kept is the **brightest cell inside the
// rectangle the room publishes**, because for a *ceiling* the brightest is the
// only honest reading: a ceiling beaten by part of the thing it is measured on
// is not a ceiling.
//
// ---------------------------------------------------------------------------
// Finding the figure: by moving it, never by its brightness
// ---------------------------------------------------------------------------
//
// `engine/player.ts` carries this warning at the top of the file, in its own
// words, because it was paid for there: "Segmenting a thing by brightness
// discards the pixels that make it bright." A mask built by matching the head's
// token within a band of its level threw away everything the room's practicals
// had lifted above the token and reported 125.7 for a cell that reads 145.3 —
// a check built that way would report a figure getting *darker* as it got
// brighter.
//
// So the figure is segmented by **motion**. The figure is the only thing in the
// machine room that moves under `prefers-reduced-motion: reduce`: the idle
// camera is pinned, the fill light stops breathing, and no clip is playing
// until somebody asks for one. Two rasters of the same canvas with the figure
// walked a step between them differ exactly where the figure was and where it
// now is, and a cell every one of whose pixels changed is a cell that was all
// figure. That test cannot select for value — it does not look at value at all.
//
// **Two frames are not enough, and the second frame is what says so.** A diff of
// A against B marks both where the figure *was* and where it has *gone*, and the
// cells it has gone to are read out of A — where they are floor. Measured, with
// the figure's body and head patched black in the built bundle so that the true
// answer is "very dark": the brightest cell the two-frame version called the
// figure's was 185.2 at 1920 in the light theme and 225.1 at 390, which is the
// light theme's own floor, reported as a figure painted in `--at-black`. A check
// that reports a black figure at 225 is a check that would go on passing as the
// figure got darker and fail for a reason that has nothing to do with it.
//
// So there are three frames and the figure is walked **twice in the same
// direction**. A cell holding the figure in A changes between A and B and then
// stays put between B and C; a cell the figure walks *into* changes between A
// and B and changes again between B and C as it leaves. That is the whole
// discriminator, it is still value-blind, and it costs one more raster.
//
// It is keyed on something the code does on purpose at the moment in question:
// the walk. `engine/input.ts` drives the figure while an arrow key is **held**,
// which is why `Tab.hold` exists — `press` sends the down and the up in the same
// millisecond and moves the figure about a tenth of a pixel, which reads
// exactly like a walk that did not happen.
//
// Three guards make the diff mean what it says, and each of them is a way this
// went wrong before it was a rule:
//
//   - **the published rects have to be identical either side of the nudge.**
//     Walking into a hotspot's reach frames the camera, and a framing moves the
//     whole scene: at 390 the first version of this walked the figure across
//     the room with a canvas tap, the camera pushed, 16381 cells changed, and
//     the "figure" it found was the page ground outside the room at 253.2. The
//     rects are the engine's own projection published in the same pass that drew
//     the frame, so when they are identical the camera did not move.
//   - **`data-backlot-framed` has to be absent for both readings.** The same
//     fact said the other way, from the state the engine sets rather than from
//     its consequence.
//   - **the changed pixels have to be one compact region.** A whole-canvas
//     change is a camera move that the two guards above somehow missed; a figure
//     is a few percent of the picture.
//
// The nudge is tried in three directions in turn and the first one that leaves
// all three guards satisfied is used. Not a fallback that hides a failure: when
// none of them is clean the reading is recorded as unusable and the assertion
// says so with the guard that tripped.
//
// ---------------------------------------------------------------------------
// What counts as the figure, and what the figure keeps
// ---------------------------------------------------------------------------
//
// The line is about the figure's **lit surfaces** — the body, the head, the
// clothes, whatever `player.setExposure` holds down — and not about the two
// marks on the floor at its feet. Those are the contact patch and the accent
// ring, they are painted `flat()` rather than `lit()`, and `player.ts` says why
// in the same breath as it sets the exposure: "the contact ring is unlit and
// does not [move]: it is the mark that says which thing on the floor is you, and
// dimming the figure must not dim the one part of it that is there to be found."
// CLAUDE.md §7 sanctions that gold explicitly — "a band, never a letter and
// never a stroke on a control — so the gold is allowed to be the gold here".
//
// **This is not a loophole, it is the difference between a check that would be
// right and one that would be wrong, and it took an injection to see it.** With
// the figure's body and head patched to `--at-black` in the built bundle — as
// dark as a figure can be — the brightest cell the segmentation returned was
// still 185.2 at 1920 in the light theme and 225.1 at 390, both of them at the
// figure's feet: a 40 px cell fits inside the 0.68 m contact disc, and in the
// light theme that disc and the floor under it are bright. A check that failed
// there would be telling the next lane to delete the mark the design is built
// around, which is the "make the check pass by weakening the thing" failure
// running backwards.
//
// So the marks are excluded, and excluded the same way the tower is found: an
// unlit fill composites to its declared colour exactly, so a cell carrying a
// pixel that **equals** the resolved `--at-accent` or `--at-divider` is a cell
// on the mark rather than on the figure, and it is dropped. Whether the
// exclusion actually ran is asserted rather than assumed — a branch nobody has
// watched execute is a comment.
//
// ---------------------------------------------------------------------------
// Finding the tower: by the rectangle the room publishes for it
// ---------------------------------------------------------------------------
//
// The tower is a hotspot now, and a hotspot that names its `surface` has that
// surface's box projected onto its button every park — off the same matrices the
// renderer drew with, in the pass that parks the button (`Hotspot.setRect`).
// So the tower is read inside `data-backlot-rect` on `machine-room:machine`,
// which is the same handle every other composite reading in this repo stands on:
//
//                           desktop 1920x1080     phone 390x844
//   machine-room:machine     1026,653,89,143      216,411,28,46
//
// **This replaced a locator that worked and should not have had to.** Before the
// room published a rect there was no rectangle for the tower and the only handle
// on it was the strip of light down its front — the one **unlit** fill in the
// fit-out, so its composited pixel equals its declared colour exactly, and
// measured at 1920 that colour occurred 181 times in the whole 1920x923 canvas,
// all inside a 4 x 46 px box. It was correct and it was thin: sub-pixel at 390,
// where the exact colour occurs **zero** times, so the box had to be carried
// from 1920 through a similarity fitted on the six published rects (which fitted
// to a worst residual of 0.72 px across twelve coordinates — the arithmetic was
// sound; the premise was a coincidence that had been holding).
//
// Both of those are gone. What is left is one attribute, and the check fails
// loudly when it is missing rather than falling back to anything: a reading with
// no rectangle behind it is the shape of failure this repo keeps paying for.
//
// ---------------------------------------------------------------------------
// What is NOT asserted here
// ---------------------------------------------------------------------------
//
// The hub. There is no tower and there are no screens on the ring, so "the
// figure must not be brighter than the screens or the tower" has no referent
// out there; `spec/backlot-fitout.test.ts` keeps the hub's own reading, which is
// that the figure reads the same before a room and after it.

import { describe, expect, it } from "vitest";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { formatHex, serveBuild, Tab, type ColourScheme, type Key, type Raster } from "./lib/chrome.ts";
import { doorInto, roomNamed } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

// This file is about the machine room in particular — its five screens, its
// tower — so it names the room and takes the door from it. `rooms[0]` and
// `kind === "room"` were both the machine room by accident and stopped being
// it the day a second room landed (spec/lib/backlot.ts).
const room = roomNamed("machine-room");
const doorway = doorInto(room);
const FRONT = room.interactives.filter((entry) => entry.id.startsWith("play-front-")).map((entry) => entry.id);

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** The contract's cell, scaled with the canvas — `receipts/rig-3d/CONTRACT-A2.md`
 *  states the room's brightness as the mean luma of a 40x40 cell at 1920, and a
 *  scene measured in screen pixels is a different scene at each size. Restated
 *  here rather than imported from `spec/backlot-fitout.test.ts`: that file ranks
 *  the room and this one measures the figure, and two files agreeing because
 *  they share a constant is two files that cannot disagree. */
const cellFor = (width: number) => Math.max(8, Math.round((40 * width) / 1920));

/** The control parked on the tower, and therefore the button whose
 *  `data-backlot-rect` is the tower's box.
 *
 *  **Found by its kind, not by its id.** `look-at` is the manifest's own word
 *  for a fitting a reader can come to and look at, and the machine room has
 *  exactly one. Writing the id here instead would be this file keeping its own
 *  copy of a name that lives in the data — and that name has already moved once
 *  this round, from a control the room registered itself under a namespaced id
 *  to a manifest entry with a plain one. A check that had typed the first would
 *  have gone looking for a button that no longer exists. */
const towerHotspot = (() => {
  const looking = room.interactives.filter((entry) => entry.kind === "look-at");
  if (looking.length !== 1) {
    throw new Error(
      `the machine room has ${looking.length} "look-at" interactives (${looking.map((one) => one.id).join(", ") || "none"}), ` +
        `so this file cannot say which one is the tower. It reads the tower inside the rectangle that ` +
        `control publishes; if the room has grown a second thing to look at, this has to say which.`,
    );
  }
  return looking[0]!.id;
})();

/** How far apart two pixels have to be, summed over the three channels in 0..1,
 *  before the diff counts them as changed. A tenth of one channel count is
 *  0.0004, so this is fifty of those: well past the renderer's own noise and far
 *  under anything a moving object does. */
const PIXEL_DELTA = 0.02;

/** What share of a cell's pixels must have changed for the cell to be the
 *  figure's. Not a majority: **all of them**, give or take the antialiased rim.
 *  A cell that is half figure and half floor is not a reading of the figure, and
 *  the brightest such cell would be a blend nobody painted. */
const ALL_FIGURE = 0.99;

/** And what share may have changed on the second step before the cell is taken
 *  to be somewhere the figure walked *to* rather than somewhere it was. A cell
 *  the figure has left is floor in both of the last two frames and changes by
 *  nothing at all; this leaves room for the odd antialiased pixel on a boundary
 *  the two steps did not land on identically. */
const STAYED_PUT = 0.05;

/** What share of a cell has to be exactly the ring's own colour before the cell
 *  is taken to be the mark on the floor rather than the figure standing on it.
 *  See the exclusion itself: the figure's collar is the same token, lit. */
const ON_MARK_SHARE = 0.05;

/** And the ceiling on how much of the canvas the moving region may cover before
 *  the reading is refused. A figure is a few percent of a room; a camera that
 *  moved is most of it. Measured clean: 43 cells of 1725 at 1920 and 159 of
 *  11781 at 390; measured with the camera pushing, 16381 of 16381. */
const MOVING_SHARE = 0.12;

/** Held, not pressed — `engine/input.ts` drives for as long as the key is down.
 *  200 ms at the figure's 4.6 m/s is a step of about 0.9 m: far enough that a
 *  cell is wholly figure or wholly not, short enough to stay off every hotspot's
 *  reach. */
const NUDGE_MILLISECONDS = 200;

/** Tried in this order; the first one that leaves the scene still is used. */
const NUDGES: readonly Key[] = ["ArrowRight", "ArrowUp", "ArrowLeft"];

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

const READY = String.raw`
  return (async () => {
    const deadline = performance.now() + 30000;
    while (performance.now() < deadline) {
      if (document.querySelector("[data-backlot-stage][data-backlot-ready]")) return "ready";
      await new Promise((done) => setTimeout(done, 50));
    }
    return "timed out";
  })();
`;

/** `visibility: hidden`, not `display: none`: the engine goes on parking the
 *  buttons and publishing their rects, so the geometry stays live while the
 *  pixels stop being the HUD's. Every reading of the scene in this file is taken
 *  this way, for the reason `spec/backlot-fitout.test.ts` gives at length — a
 *  pill is `--at-bg` and its label is `--at-text`, the darkest and brightest
 *  things the palette has, and the room's eight controls are parked over the
 *  five screens.
 *
 *  It also blurs, and that is deliberate here rather than incidental: a control
 *  inside a hidden subtree cannot hold focus, and a focused control frames the
 *  camera. A raster taken with the framing still on is a raster of a scene that
 *  stopped being the resting room. */
const HIDE_HUD = String.raw`
  const style = document.createElement("style");
  style.dataset.hideHud = "";
  style.textContent = "[data-backlot-hud]{visibility:hidden!important}";
  document.head.append(style);
  document.activeElement?.blur();
  return null;
`;

const SHOW_HUD = `for (const s of document.querySelectorAll("style[data-hide-hud]")) s.remove(); return null;`;

/** The canvas, every published rect, and whether the engine says the camera is
 *  close on anything. One read, so the three cannot be of three different
 *  frames. */
const SCENE = String.raw`
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  if (!canvas) return null;
  const hud = document.querySelector("[data-backlot-hud]");
  const box = canvas.getBoundingClientRect();
  return {
    canvas: {
      x: Math.round(box.left),
      y: Math.round(box.top),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
    framed: hud ? hud.dataset.backlotFramed ?? "" : "no hud",
    rects: [...document.querySelectorAll("[data-backlot-hud] button[data-backlot-hotspot]")]
      .filter((button) => !button.hidden && getComputedStyle(button).display !== "none")
      .map((button) => ({ id: button.dataset.backlotHotspot, rect: button.dataset.backlotRect || null })),
  };
`;

/** A token resolved on a **fresh** element, coloured before it is inserted.
 *
 *  CLAUDE.md §7's trap on the way out of the DOM: the theme leaves
 *  `transition-property` at `all` under `prefers-reduced-motion`, so every
 *  element has a live transition on `color` and a computed read in the same task
 *  returns the value it is moving away from. A transition never runs on an
 *  element's first style computation, which is what makes this read honest. */
/** ...and composited over `--at-bg` exactly the way the engine does it, because
 *  half this palette carries alpha and a translucent token has no colour of its
 *  own in a 3D scene. `engine/colours.ts` paints the page's surface into a 1x1
 *  context and the token over it — "an opaque token covers it completely and a
 *  translucent one comes out as the colour it will actually be seen as" — and
 *  that is the number a material is given. Doing anything else here reads a
 *  colour the scene never paints: `--at-divider` is the ink at 12%, and its
 *  un-composited value is #efefef in the dark theme against a contact patch that
 *  renders #232120. */
const TOKEN = (name: string) => String.raw`
  const declared = (value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    probe.style.position = "absolute";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    document.body.append(probe);
    const read = getComputedStyle(probe).color;
    probe.remove();
    return read;
  };
  const surface = new OffscreenCanvas(1, 1);
  const ctx = surface.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = declared("var(--at-bg)");
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = declared("var(${name})");
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0], data[1], data[2], data[3] / 255];
`;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Scene {
  canvas: { x: number; y: number; width: number; height: number };
  framed: string;
  rects: { id: string; rect: string | null }[];
}

interface Reading {
  viewport: string;
  theme: ColourScheme;
  mounted: boolean;
  /** How the sweep knew the scene had settled before it looked: the count of
   *  identical reads it waited for, and the reads themselves. */
  settledAfter: number;
  /** The nudge that left every guard satisfied, or null when none did. */
  nudge: Key | null;
  /** Why each rejected nudge was rejected, so a failure names the guard. */
  refused: string[];
  /** Every id the room was showing, and the published boxes by id. */
  showing: string[];
  screens: { id: string; mean: number; at: string }[];
  /** The figure: its brightest all-changed cell, where, and how many cells the
   *  diff called the figure's at all. `onMark` is how many of those were dropped
   *  for carrying a pixel of one of the two unlit marks at its feet. */
  figure: { mean: number; at: string; cells: number; onMark: number; share: number } | null;
  /** The unlit mark the figure keeps, as the page resolves it. */
  markHexes: string[];
  /** The tower: the box the room published for it and its brightest cell. */
  tower: { mean: number; at: string; box: Box; rect: string } | null;
  canvas: string;
}

const settle = async (tab: Tab): Promise<{ scene: Scene | null; reads: number }> => {
  // Three consecutive identical reads of the published projection. One read is
  // not a measurement of a scene that is still arriving: two product failures in
  // this repo were reported off a single read of a rect, and both were the
  // harness looking a frame early.
  let previous = "";
  let same = 0;
  let scene: Scene | null = null;
  const deadline = Date.now() + 20_000;
  let reads = 0;
  while (Date.now() < deadline) {
    const now = await tab.evaluate<Scene | null>(SCENE);
    reads += 1;
    const key = JSON.stringify(now);
    if (now && key === previous) {
      same += 1;
      if (same >= 2) {
        scene = now;
        break;
      }
    } else {
      same = 0;
    }
    previous = key;
    await pause(120);
  }
  return { scene, reads };
};

const boxesOf = (scene: Scene): Map<string, Box> => {
  const found = new Map<string, Box>();
  for (const entry of scene.rects) {
    if (!entry.rect) continue;
    const [x, y, width, height] = entry.rect.split(",").map(Number) as [number, number, number, number];
    found.set(entry.id, { left: x, top: y, right: x + width, bottom: y + height });
  }
  return found;
};

/** The brightest cell wholly inside a box, stepped a pixel at a time along a
 *  coarse stride, with where it was. A sliding window rather than a grid: a grid
 *  aligned to the canvas is aligned to nothing in the scene, which is the
 *  mistake `spec/backlot-fitout.test.ts` records as reading t4 at 80.2 where its
 *  own rect reads 145.3. */
const brightestIn = (raster: Raster, box: Box, cell: number): { mean: number; at: string } => {
  let best = -1;
  let at = "";
  const step = Math.max(1, Math.round(cell / 8));
  for (let y = Math.max(0, Math.round(box.top)); y + cell <= Math.min(raster.height, box.bottom); y += step) {
    for (let x = Math.max(0, Math.round(box.left)); x + cell <= Math.min(raster.width, box.right); x += step) {
      const mean = raster.meanLuma(x, y, cell, cell);
      if (mean > best) {
        best = mean;
        at = `(${x},${y})`;
      }
    }
  }
  return { mean: best, at };
};

async function sweep(): Promise<Reading[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  const readings: Reading[] = [];
  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const reading: Reading = {
          viewport: viewport.name,
          theme,
          mounted: false,
          settledAfter: 0,
          nudge: null,
          refused: [],
          showing: [],
          screens: [],
          figure: null,
          tower: null,
          markHexes: [],
          canvas: "",
        };

        await tab.viewport(viewport.width, viewport.height);
        // Reduced motion is what makes the diff a segmentation rather than a
        // picture of a drifting scene. It pins the idle camera, the breathing
        // fill light and the wall's clip; without it the same cell on the
        // figure's head swings 27 points over thirteen seconds.
        await tab.media({ colourScheme: theme, reducedMotion: true });
        // Stored, then loaded again, so the page is built in the theme from its
        // first frame and nothing is transitioning while it is read.
        await tab.goto(url);
        await tab.evaluate(
          `try { localStorage.setItem("at-theme", ${JSON.stringify(theme)}); } catch {} return null;`,
        );
        await tab.goto(url);
        const ready = await tab.evaluate<string>(READY);
        if (ready !== "ready") {
          readings.push(reading);
          continue;
        }

        // The one mark at the figure's feet that can out-shine anything: the
        // accent ring, `flat("--at-accent")` at level 1 in engine/scene.ts, so
        // it composites to its token exactly and no level has to be restated.
        //
        // **Re-derived from what the code paints, not from a hex written down
        // once.** The contact patch used to be a flat `--at-divider` disc and
        // used to be in this list; it is now `--at-black` at 50% with a
        // per-vertex alpha ramp, which has no single value to match and which
        // takes the floor *down* rather than up — a shadow cannot out-shine a
        // tower, so it needs no exclusion at all. A list of hexes kept by hand
        // goes quiet exactly when the code grows.
        {
          const resolved = await tab.evaluate<[number, number, number, number]>(TOKEN("--at-accent"));
          reading.markHexes.push(formatHex([resolved[0] / 255, resolved[1] / 255, resolved[2] / 255]));
        }

        // Into the room the way a reader goes in: the keyboard on the door's own
        // control and Enter, so the browser's activation behaviour runs and the
        // engine's focus hand-over runs with it.
        await tab.evaluate(
          `document.querySelector('[data-backlot-hotspot="${doorway.id}"]')?.focus(); return null;`,
        );
        await tab.press("Enter");
        await pause(3000);

        const arrival = await settle(tab);
        reading.settledAfter = arrival.reads;
        if (!arrival.scene) {
          readings.push(reading);
          continue;
        }
        reading.mounted = arrival.scene.rects.some((entry) => entry.id.startsWith("play-front-"));
        reading.showing = arrival.scene.rects.map((entry) => entry.id);

        await tab.evaluate(HIDE_HUD);
        await tab.evaluate("return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));");

        const cell = cellFor(viewport.width);

        // One nudge at a time, each one checked against the three guards. Three
        // frames per attempt and two steps in the same direction — see the
        // header: two frames cannot tell where the figure was from where it has
        // gone, and the cells it has gone to read as floor.
        let before: Scene | null = null;
        let a: Raster | null = null;
        let b: Raster | null = null;
        let c: Raster | null = null;
        for (const nudge of NUDGES) {
          const first = await settle(tab);
          if (!first.scene) {
            reading.refused.push(`${nudge}: the scene never settled before the nudge`);
            continue;
          }
          const clip = first.scene.canvas;
          const rasterA = await tab.raster(clip);
          await tab.hold(nudge, NUDGE_MILLISECONDS);
          await pause(800);
          const second = await settle(tab);
          if (!second.scene) {
            reading.refused.push(`${nudge}: the scene never settled after the first step`);
            continue;
          }
          const rasterB = await tab.raster(clip);
          await tab.hold(nudge, NUDGE_MILLISECONDS);
          await pause(800);
          const third = await settle(tab);
          if (!third.scene) {
            reading.refused.push(`${nudge}: the scene never settled after the second step`);
            continue;
          }
          const moved = [second.scene, third.scene].find(
            (one) => JSON.stringify(one.rects) !== JSON.stringify(first.scene!.rects),
          );
          if (moved) {
            reading.refused.push(`${nudge}: the published rects moved, so the camera moved with them`);
            continue;
          }
          const framed = [first.scene, second.scene, third.scene].map((one) => one.framed);
          if (framed.some((state) => state !== "")) {
            reading.refused.push(
              `${nudge}: the HUD says the camera is close on something (data-backlot-framed ` +
                `${framed.map((state) => `"${state}"`).join(" then ")})`,
            );
            continue;
          }
          const rasterC = await tab.raster(clip);
          before = first.scene;
          a = rasterA;
          b = rasterB;
          c = rasterC;
          reading.nudge = nudge;
          break;
        }

        if (!before || !a || !b || !c) {
          await tab.evaluate(SHOW_HUD);
          readings.push(reading);
          continue;
        }

        reading.canvas = `${a.width}x${a.height}`;
        const boxes = boxesOf(before);

        // ---- the figure, by motion --------------------------------------
        const differs = (one: Raster, two: Raster, x: number, y: number): boolean => {
          const first = one.at(x, y);
          const second = two.at(x, y);
          return (
            Math.abs(first[0] - second[0]) + Math.abs(first[1] - second[1]) + Math.abs(first[2] - second[2]) >
            PIXEL_DELTA
          );
        };
        const pieces = [...boxes.values()];
        // Nothing the room hangs is the figure, and a cell that touches one is
        // not a reading of the figure even when every pixel of it changed.
        //
        // **This is what makes the diff survive the machine room.** Taking a
        // step can change which screen holds a decoder, and a wall of clips
        // repainting between two frames differs by most of the canvas — measured
        // by the rooms lane at 1,680,267 pixels of 1,772,160 between two frames
        // that had each settled. The three-frame rule already refuses a playing
        // video (it changes on both steps, not one), and this refuses the whole
        // question: the five screens and the monitor publish their own
        // rectangles, and a cell that touches one is dropped before its pixels
        // are looked at.
        const touchesAPiece = (x: number, y: number) =>
          pieces.some((box) => x < box.right + 2 && x + cell > box.left - 2 && y < box.bottom + 2 && y + cell > box.top - 2);
        const step = Math.max(2, Math.round(cell / 2));
        let figureMean = -1;
        let figureAt = "";
        let figureCells = 0;
        let onMark = 0;
        const marks = new Set(reading.markHexes);
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (let y = 0; y + cell <= a.height; y += step) {
          for (let x = 0; x + cell <= a.width; x += step) {
            if (touchesAPiece(x, y)) continue;
            let walkedOff = 0;
            let walkedOn = 0;
            let marked = 0;
            for (let row = y; row < y + cell; row++) {
              for (let column = x; column < x + cell; column++) {
                if (differs(a, b, column, row)) walkedOff += 1;
                if (differs(b, c, column, row)) walkedOn += 1;
                if (marks.has(formatHex(a.at(column, row)))) marked += 1;
              }
            }
            // Held the figure in A, and has been floor ever since: it changed on
            // the first step and did not change again on the second. A cell the
            // figure walked *into* changes on both.
            if (walkedOff / (cell * cell) < ALL_FIGURE) continue;
            if (walkedOn / (cell * cell) > STAYED_PUT) continue;
            // Standing on the ring, which is not a reading of a lit surface.
            //
            // A **share** of the cell, not a single pixel, and that distinction
            // is load-bearing now rather than fussy: the figure's facing mark is
            // a collar painted `lit("--at-accent")` — the same token, on the
            // body, and the brightest lit thing the figure has. A lit Lambert
            // surface under full key can land on its own albedo exactly, so one
            // matching pixel would throw away the cell this file most needs to
            // measure. A cell lying on the floor ring is a large fraction of
            // that exact value; a cell on a shaded collar is a pixel or two.
            if (marked / (cell * cell) >= ON_MARK_SHARE) {
              onMark += 1;
              continue;
            }
            figureCells += 1;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + cell);
            bottom = Math.max(bottom, y + cell);
            const mean = a.meanLuma(x, y, cell, cell);
            if (mean > figureMean) {
              figureMean = mean;
              figureAt = `(${x},${y})`;
            }
          }
        }
        if (figureCells > 0) {
          reading.figure = {
            mean: figureMean,
            at: figureAt,
            cells: figureCells,
            onMark,
            share: ((right - left) * (bottom - top)) / (a.width * a.height),
          };
        }

        // ---- the tower, inside the rectangle the room publishes ---------
        {
          const box = boxes.get(towerHotspot);
          const rect = before.rects.find((entry) => entry.id === towerHotspot)?.rect ?? "";
          if (box) reading.tower = { ...brightestIn(a, box, cell), box, rect };
        }

        // ---- the five screens, each inside its own published rect --------
        reading.screens = FRONT.map((id) => {
          const box = boxes.get(id);
          if (!box) return { id, mean: -1, at: "" };
          return { id, ...brightestIn(a, box, cell) };
        });

        await tab.evaluate(SHOW_HUD);
        readings.push(reading);
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return readings;
}

const readings = await sweep();
if (process.env.FIGURE_TABLE) {
  for (const r of readings) {
    console.log(
      `${r.viewport} ${r.theme}: figure ${r.figure?.mean.toFixed(1)} at ${r.figure?.at} ` +
        `(${r.figure?.cells} cells, ${r.figure?.onMark} on a mark) | tower ${r.tower?.mean.toFixed(1)} at ` +
        `${r.tower?.at} (rect ${r.tower?.rect}) | screens ${r.screens.map((x) => x.mean.toFixed(1)).join(" ")} ` +
        `| mark ${r.markHexes.join(",")} | nudge ${r.nudge}`,
    );
  }
}
const at = (viewport: string, theme: ColourScheme) =>
  readings.find((one) => one.viewport === viewport && one.theme === theme);

// ---------------------------------------------------------------------------
// The floors, which is what makes anything below a reading of a 3D scene
// ---------------------------------------------------------------------------
describe("the machine room was on screen and holding still", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      it(`mounted with its five screens at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme);
        expect(one, `the sweep never reached ${viewport.name} in the ${theme} theme`).toBeDefined();
        expect(
          one!.mounted,
          `the machine room never came up at ${viewport.name} in the ${theme} theme, so nothing below is ` +
            `about a 3D scene — the static gallery would still be on screen and still correct. It was ` +
            `showing: ${one!.showing.join(", ") || "nothing"}.`,
        ).toBe(true);
        expect(
          one!.showing.filter((id) => id.startsWith("play-front-")).sort(),
          `the room published no rectangle for at least one front-wall screen at ${viewport.name}, so ` +
            `"this cell is a screen's" has nothing behind it`,
        ).toEqual([...FRONT].sort());
      });

      it(`settled before it was read, and held still across the nudge at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        expect(
          one.settledAfter,
          "the sweep did not poll the published projection at all, so nothing waited for it to stop moving",
        ).toBeGreaterThanOrEqual(3);
        expect(
          one.nudge,
          `no direction left the scene still enough to segment the figure by motion at ${viewport.name} in ` +
            `the ${theme} theme. Refused: ${one.refused.join("; ") || "nothing was tried"}.`,
        ).not.toBeNull();
      });
    }
  }
});

// Seen red by driving the same sweep with `Tab.press` in place of `Tab.hold` —
// the down and the up in the same millisecond, which is what every other driver
// in this repo sends and what this check would have sent if `hold` had not been
// written for it:
//
//   AssertionError: nothing in the machine room moved when the figure was asked
//   to walk at desktop 1920×1080 in the dark theme, so the diff has segmented
//   nothing and the brightest cell below would be the brightest cell in the
//   room — which is the reading this file exists to refuse. The nudge was
//   ArrowRight; refused: none.: expected null not to be null
//   (14 failed | 14 passed, re-taken on the rebuilt figure; 9 failed | 18
//   passed on the figure at df44ec0, where 1920 in the light theme did find a
//   cell — a key that is down for a millisecond moves the figure by *some*
//   amount, and a check that only asked "did anything move" would have gone
//   green on that one and told you nothing.)
describe("the figure was found by moving it, not by its brightness", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      it(`segmented the figure at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        expect(
          one.figure,
          `nothing in the machine room moved when the figure was asked to walk at ${viewport.name} in the ` +
            `${theme} theme, so the diff has segmented nothing and the brightest cell below would be the ` +
            `brightest cell in the room — which is the reading this file exists to refuse. The nudge was ` +
            `${one.nudge ?? "never taken"}; refused: ${one.refused.join("; ") || "none"}.`,
        ).not.toBeNull();
        expect(
          one.figure!.cells,
          `no ${cellFor(viewport.width)}px cell of the canvas was wholly the figure's at ${viewport.name} in ` +
            `the ${theme} theme. The cell is the contract's, scaled; a figure narrower than one — the ` +
            `shoulders are 0.39 m, which is about 33 px at this camera — cannot fill a cell on its own, and ` +
            `if that is what happened here the cell is the thing to argue with rather than the figure.`,
        ).toBeGreaterThan(0);
        // And the moving thing is an object, not the picture. A camera that
        // moved changes everything, and the two guards above would have to have
        // missed it for this to fire — which is exactly why it is here.
        expect(
          one.figure!.share,
          `the pixels that changed when the figure walked cover ${(one.figure!.share * 100).toFixed(1)}% of ` +
            `the canvas at ${viewport.name} in the ${theme} theme. A figure is a few percent of a room; a ` +
            `region that size is the camera having moved, and every cell below would be a cell of a ` +
            `different shot.`,
        ).toBeLessThan(MOVING_SHARE);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// The tower, and the rectangle that finds it
// ---------------------------------------------------------------------------
//
// Seen red by taking the tower's `object` out of the fixture the machine room
// hands the shell, so the control stays on screen and the rectangle goes.
// Anchored on the fixture's own literal inside the room's `fixtures` callback
// rather than on `look-machine`, which `manifest.ts` also carries:
//
//   AssertionError: look-machine published no data-backlot-rect at desktop
//   1920×1080 in the dark theme. A hotspot that names its surface has that
//   surface's box projected onto it every park; without one there is nothing
//   behind "this is the tower" and nothing here falls back to guessing.:
//   expected null not to be null
//   (8 failed | 20 passed — the four rectangle assertions and the four
//   comparisons that stand on them)
describe("the tower was found, and found on purpose", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      it(`read the tower inside its own published rectangle at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        expect(
          one.showing,
          `the machine room published no control for its own tower at ${viewport.name} in the ${theme} ` +
            `theme, so there is no rectangle to read it inside. It was showing: ${one.showing.join(", ")}.`,
        ).toContain(towerHotspot);
        expect(
          one.tower,
          `${towerHotspot} published no data-backlot-rect at ${viewport.name} in the ${theme} theme. A ` +
            `hotspot that names its surface has that surface's box projected onto it every park; without one ` +
            `there is nothing behind "this is the tower" and nothing here falls back to guessing.`,
        ).not.toBeNull();
        expect(one.tower!.rect, "the published rectangle is empty").not.toBe("");
        // Wholly inside the canvas. A box that has escaped the picture is a box
        // of somewhere else, and lane 2 once shifted every rect 117 px by
        // subtracting an origin that was already subtracted.
        const box = one.tower!.box;
        const [width, height] = one.canvas.split("x").map(Number) as [number, number];
        expect(
          box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height,
          `the tower's published rectangle ${one.tower!.rect} is not wholly inside the ${one.canvas} canvas`,
        ).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// The line itself
// ---------------------------------------------------------------------------
//
// Seen red twice, once without any injection at all.
//
// **On df44ec0**, the figure this file was written against, because that figure
// was over the tower in the dark theme at both viewports:
//
//   AssertionError: the figure's brightest 40px cell reads 110.2 at (1320,560)
//   and the tower reads 78.6 at (1050,703) — the figure is 40.1% brighter than
//   the machine the room is named for. The figure is found by moving it and the
//   tower by the unlit bar down its front; neither is found by being bright.:
//   expected 110.16169525000255 to be less than or equal to 78.63397187500087
//   (2 failed | 25 passed)
//
// **And on the rebuilt figure**, with the three materials `createFigure` gives
// its lit surfaces patched to `--at-text` in the built bundle — the page's ink,
// which is what the old head was painted in and the original defect this whole
// line exists for. Anchored on the three `lit()` calls together rather than on a
// token, which occurs elsewhere in the same chunk:
//
//   AssertionError: the figure's brightest 40px cell reads 163.0 at (1320,580)
//   and the tower reads 78.6 at (1050,703) — the figure is 107.4% brighter than
//   the machine the room is named for.
//   (4 failed | 24 passed — the tower and the screens, at both viewports in the
//   dark theme)
//
// So the check is two-sided without needing a third state invented for it: it
// fails on the figure that was wrong and passes on the figure that is right.
describe("the figure is not brighter than the room's own machine", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      it(`stays under the tower at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        expect(one.figure, "the figure was never segmented, so there is nothing to compare").not.toBeNull();
        expect(one.tower, "the tower was never found, so there is nothing to compare against").not.toBeNull();
        const figure = one.figure!;
        const tower = one.tower!;
        const over = ((figure.mean - tower.mean) / Math.max(tower.mean, 1)) * 100;
        expect(
          figure.mean,
          `the figure's brightest ${cellFor(viewport.width)}px cell reads ${figure.mean.toFixed(1)} at ` +
            `${figure.at} and the tower reads ${tower.mean.toFixed(1)} at ${tower.at} — the figure is ` +
            `${over.toFixed(1)}% brighter than the machine the room is named for. The figure is found by ` +
            `moving it and the tower by the unlit bar down its front; neither is found by being bright.`,
        ).toBeLessThanOrEqual(tower.mean);
      });

      it(`stays under every one of the five screens at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        expect(one.figure, "the figure was never segmented, so there is nothing to compare").not.toBeNull();
        const figure = one.figure!;
        const sheet = one.screens
          .map((screen) => `${screen.id.replace("play-front-", "")} ${screen.mean.toFixed(1)}`)
          .join(", ");
        const dimmest = one.screens.reduce((least, screen) => (screen.mean < least.mean ? screen : least));
        // Every one of them, not the middle. `spec/backlot-fitout.test.ts` ranks
        // the whole room against the middle of the five, which is the right line
        // for a room full of things nobody chose the brightness of; the figure is
        // a thing somebody chose, and "not brighter than the screens" reads as
        // all five or it reads as nothing.
        expect(
          figure.mean,
          `the figure's brightest ${cellFor(viewport.width)}px cell reads ${figure.mean.toFixed(1)} at ` +
            `${figure.at}, against ${dimmest.mean.toFixed(1)} for the dimmest of the five screens ` +
            `(${dimmest.id}). All five: ${sheet}.`,
        ).toBeLessThanOrEqual(dimmest.mean);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// The sweep measured something, said positively
// ---------------------------------------------------------------------------
describe("the sweep measured something", () => {
  it("drove both viewports in both themes", () => {
    expect(readings.length).toBe(VIEWPORTS.length * THEMES.length);
  });

  it("read two different themes, not the same one twice", () => {
    const dark = readings.filter((one) => one.theme === "dark").map((one) => one.figure?.mean ?? -1);
    const light = readings.filter((one) => one.theme === "light").map((one) => one.figure?.mean ?? -1);
    expect(
      dark,
      "both themes produced the same figure reading, so the stored preference did not reach the canvas",
    ).not.toEqual(light);
  });

  it("dropped at least one cell for sitting on the figure's own mark", () => {
    // The exclusion ran. A branch nobody has watched execute is a comment
    // (CLAUDE.md §7), and this one decides whether the reading is of the figure
    // or of the ring on the floor under it — with the figure's body and head
    // painted `--at-black` in the bundle it was the only thing standing between
    // this file and a demand that the next lane delete the accent ring.
    //
    // Asserted over the **sweep** rather than per combination, and that is a
    // correction rather than a convenience: whether a cell lands mark-dominated
    // depends on where the figure happens to be standing, and at 1920 in the
    // dark theme it does not — 0 cells, against 5, 1 and 16 in the other three.
    // Demanding it in every combination would be demanding a coincidence; the
    // thing worth proving is that the branch is live.
    const dropped = readings.reduce((sum, one) => sum + (one.figure?.onMark ?? 0), 0);
    expect(
      dropped,
      `no cell anywhere in the sweep carried enough of ${readings[0]?.markHexes.join(" or ") ?? "the ring"} ` +
        `to be dropped, so the exclusion that keeps the figure's own floor mark out of this reading never ` +
        `ran. Per combination: ${readings
          .map((one) => `${one.viewport}/${one.theme} ${one.figure?.onMark ?? "-"}`)
          .join(", ")}.`,
    ).toBeGreaterThan(0);
  });

  it("found the tower and the figure in different places", () => {
    // The one way every number above could agree and mean nothing: a
    // segmentation and a mark that landed on the same object. They cannot,
    // because one is found by moving and the other by not moving — but a check
    // that never says so is a check nobody can audit.
    for (const one of readings) {
      if (!one.figure || !one.tower) continue;
      const [fx, fy] = one.figure.at.replace(/[()]/g, "").split(",").map(Number) as [number, number];
      const inside =
        fx >= one.tower.box.left && fx <= one.tower.box.right && fy >= one.tower.box.top && fy <= one.tower.box.bottom;
      expect(
        inside,
        `the figure's cell ${one.figure.at} sits inside the tower's own box at ${one.viewport} in the ` +
          `${one.theme} theme, so the two readings are of the same object and the comparison is of a thing ` +
          `with itself`,
      ).toBe(false);
    }
  });
});
