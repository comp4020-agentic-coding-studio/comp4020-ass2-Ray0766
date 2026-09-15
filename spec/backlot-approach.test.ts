// Coming up to a door, and what the camera and the labels owe a reader who does.
//
// Three rulings are checked here, and they are one journey rather than three, so
// they share a drive:
//
//   1. Arriving at a door — walking the figure up, or Tab landing on its button —
//      pushes the camera in about 2x. The window becomes at least 120 x 200 px
//      and its clip starts. Leaving, or Esc, pushes back. Under reduced motion
//      the camera cuts rather than travels, and still arrives.
//   2. The front wall's five labels collapse to dots at room distance, and show
//      one full row once the camera is at the wall.
//   3. A nameplate's word renders only at a projected cap height of 11 px or
//      more; below that the plate is lit and wordless.
//
// ---------------------------------------------------------------------------
// What each check is keyed on, and why it is not keyed on the obvious thing
// ---------------------------------------------------------------------------
//
// The rule this round cost four separate green-and-blind checks: key on
// something the code sets **on purpose at the moment in question**, never on a
// consequence. So:
//
//   the framing      `canvas[aria-label]`. `describeCanvas()` in engine/index.ts
//                    writes "The camera is close on: <label>. Escape pulls back."
//                    the moment `framedLabel` is set, and writes the room's own
//                    sentence back when it is cleared. It is one function
//                    precisely so the three states cannot drift apart, which
//                    makes it the sentence the engine commits to rather than a
//                    symptom of the camera having moved.
//
//   the window       `data-backlot-rect` on the door's own button, which
//                    `Hotspot.setRect` publishes from the same projection the
//                    renderer used, in the same pass that parks the button. The
//                    alternative is a radius around the control, which
//                    engine/types.ts already records as 130 px of slack at 1920
//                    and 26 px at 390.
//
//   a collapsed      `data-backlot-dense`. **Not a width threshold.** A label
//   label            that has come down to its dot still has its full text in
//                    the DOM: at 390 all eight controls render 50 x 50 with
//                    labels 79 to 280 px wide painted at 1 px. A check that asks
//                    "how wide is the label" reads a collapse as a rendered
//                    label and cannot go red. `hotspots.ts` sets the attribute on
//                    purpose, in the frame it decides, and the stylesheet paints
//                    from it.
//
//   the clip         the count of `<video>` elements that still hold a source,
//                    not the count of anything that drew. A paused decoder is
//                    still a decoder; "the picture stopped moving" is not "the
//                    decoder was let go". This is the same distinction
//                    `spec/backlot-return.test.ts` had to make between contexts
//                    that drew and contexts that were alive, where counting
//                    draws left a whole root cause invisible under fourteen
//                    passing tests. The elements are never appended to the
//                    document — `layers.ts` creates them with
//                    `document.createElement` and keeps them — so
//                    `querySelectorAll("video")` finds exactly none of them no
//                    matter how many are running. The harness patches
//                    `Document.prototype.createElement` before any of the page's
//                    own script, which is the same trick the return check uses
//                    on `getContext`, and it is the only way to see them at all.
//
//   a plate's word  `data-backlot-cap` on the same button, published in the
//                    same pass as the rect. **The composite cannot settle
//                    this and it took a measurement to be sure.** "Lit but
//                    wordless below 11 px of cap" is a claim about a plate
//                    37 x 113 px at 1920 and 14 x 42 at 390, and
//                    `spec/backlot-fitout.test.ts` already records, in its own
//                    assertion message, that at that size "no pixel of the word
//                    reaches" `--at-text`. Sampled with the HUD out of the
//                    picture, the three plates read sd 48-53 with a row spread
//                    of 150-200 counts **with the word on them** — that is the
//                    door's light and its frame, not the word. Any threshold
//                    picked there would have been a stand-in nobody checked
//                    against the real thing, which is §7's own example of how
//                    this goes wrong. So the engine publishes the number it
//                    decided on.
//
// ---------------------------------------------------------------------------
// A number, not a flag, and the difference is the whole of ruling 3
// ---------------------------------------------------------------------------
//
// `data-backlot-cap` is a **cap height**, not a "showing its word" boolean, and
// the check below is written to use it as one. A boolean would only ever let
// this file assert that the engine agrees with itself: a build where somebody
// had moved the floor from 11 px to 4 would set the flag at 4 px of cap, and a
// check reading the flag would pass while the plate carried a word nobody can
// read. That is "counting what drew rather than what is alive" wearing
// different clothes.
//
// So **11 is written here, in this file, as the ruling's number** — deliberately
// not imported from `hub.ts`'s `PLATE_CAP_FLOOR`. Importing the constant would
// make the threshold agree with itself by construction and this check would
// survive somebody moving it. Two independent statements of the same number is
// the point.
//
// And the published number is checked against the picture at least once rather
// than trusted: where the word is painted, the ink's own extent across the run
// has to agree with the cap the engine published. That pairing is the
// instrument checking its stand-in — the composite reading was validated
// against a number somebody else took by hand, 9 px against the reviewer's 8.8
// for `POLICIES` at 1920, before it was used for anything.

import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest.ts";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab, type ColourScheme, type Raster } from "./lib/chrome.ts";
import { doorInto, roomNamed } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

/** Dark is what a marker sees on a first visit. Neither the camera nor the
 *  labels are a colour, so one theme would be the honest scope for this file
 *  anyway; the plates are read in both by `spec/backlot-fitout.test.ts`.
 *
 *  **But for ruling 3 it is not a matter of scope, it is the only theme the ink
 *  reading works in, and that is measured rather than assumed.** The reading
 *  counts pixels that have gone most of the way from the plate's own ground
 *  toward `--at-text`, in that direction and not the other. In the dark theme
 *  `--at-text` is luma 238 against a plate ground of 60, so "toward the ink" is
 *  "brighter", and nothing else in a door's window is brighter than the plate.
 *  In the light theme the ink is luma 22 against a ground of 196 and "toward
 *  the ink" is "darker" — which is also the door's frame, and its shadow, and
 *  the dark inside the opening. Measured on a build where the engine's own cap
 *  says the word is not painted at all:
 *
 *      dark   1920  POLICIES  cap 8.8  →    0 px of ink    (wordless, correct)
 *      light  1920  POLICIES  cap 8.8  →  325 px of ink, 25 px across
 *
 *  The light reading is the window's own shading being counted as a word. So
 *  this file reads plates in the dark theme only, and anyone widening it to
 *  light has to replace the ink reading first — the metric does not survive the
 *  move and it fails in the direction that reports a word on a blank plate. */
const THEME: ColourScheme = "dark";

/** The ruling's own floor for a framed door window, in CSS pixels. */
const WINDOW_MIN = { width: 120, height: 200 };

/** "About 2x" as a floor rather than a band. A lane that needs more than two to
 *  put 200 px of window on a door 62 px tall at rest is not breaking the
 *  ruling, and an upper bound here would fail it for obeying the other half. */
const PUSH_AT_LEAST = 1.8;

/** And the front wall's own floor, which is **not** the door's number.
 *
 *  Ruling 1 says "about 2x" about a door; ruling 2 says nothing about how far
 *  the camera comes to the wall, only that the row has to fit once it is there.
 *  Borrowing the door's number would be this file inventing a threshold and
 *  then failing a correct build on it — measured, the wall pushes 1.68x, and
 *  the two assertions that carry ruling 2 are the dots and the row, not this.
 *  What this one is for is the difference between a camera that came in and one
 *  that did not move at all, so it sits well clear of the idle drift and no
 *  higher. */
const WALL_PUSH_AT_LEAST = 1.25;

/** Back means back. A release that leaves the window a third bigger than it was
 *  has not returned to the fixed god view, and the ring is only ever seen from
 *  there. */
const RELEASE_SLACK = 1.2;

/** The projected cap height a nameplate's word has to reach before it is drawn
 *  at all. Ruling 3's number. */
const CAP_MIN = 11;

/** How far a published rectangle may move between two readings of a scene that
 *  is supposed to be still. The god view is fixed but the mouse's four degrees
 *  of yaw and the idle animation leave a pixel or two; lane 1 measured the five
 *  front-wall rows at [153,156,157,161,163] and [151,154,156,160,163] across a
 *  press that is supposed to do nothing, which is 2px at its worst. */
const IDLE_DRIFT = 3;

/** The width at or below which every control on the front wall is a dot, and
 *  therefore the width at or below which the wall's push is skipped.
 *
 *  Stated here rather than imported, the same way `CAP_MIN` is: a check that
 *  takes the engine's own constant agrees with it by construction and survives
 *  somebody moving it. `machine-room.ts` says 640 and so does this. */
const DOT_WIDTH = 640;

/** How long the camera takes to travel, from `camera.ts`'s own TRAVEL. A sample
 *  taken inside this window is a sample of a journey rather than of an arrival,
 *  which is what makes the reduced-motion pair below mean anything. */
const TRAVEL_MS = 620;

const DOORS = backlotManifest.doors;
/** A door with a real recorded clip behind its window — the only kind that can
 *  answer "did the clip start". */
const CLIP_DOOR = DOORS.find((door) => door.window.kind === "still" && "clip" in door.window && door.window.clip)!;
/** Doors whose published rectangle **is** their window, rather than the
 *  bounding box of a parallelogram.
 *
 *  A door's window is a flat face on a leaf standing at a ring angle, and the
 *  projection of a sheared quad is a parallelogram; what gets published is its
 *  axis-aligned bounding box, so at rest roughly half of that box is not
 *  window. It cost a reading: `POLICIES` published 37 × 113 for a window that
 *  is 19 × 62, tall enough to take in the lintel board above it — and this file
 *  sampled that box, found the board's ink, and reported a word on a plate that
 *  had none. The AABB caveat was checked in A2 and found not to bite, because
 *  everything publishing a rect then was face-on; doors shear, and now doors
 *  publish.
 *
 *  Two of six doors do not shear: the ones at twelve and six o'clock, where the
 *  leaf's tangent is along the world axis the projection keeps. Derived from
 *  the ring rather than named, so a seventh door or a re-ordered nav moves it. */
const squareToAxes = (door: (typeof DOORS)[number]) => (door.order * 2) % DOORS.length === 0;

/** Every door with a nameplate, for ruling 3 — all of them, not a pick.
 *
 *  It has to be all of them, and the tree as it stands is why: `ASSESSMENT`
 *  stands at six o'clock where the door's tangent projects at full length and
 *  its word already reaches 22 px of cap from across the ring, while `POLICIES`
 *  and `PEOPLE` stand at four and ten where |cos θ| halves it to about 9. A
 *  check that picked the first plate would be asking the easy one, and a scope
 *  that is a pick is a hand-kept list one door long. */
const PLATE_DOORS = DOORS.filter((door) => door.window.kind === "nameplate");

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

// ---------------------------------------------------------------------------
// Installed before the page's own script
// ---------------------------------------------------------------------------

/** Every `<video>` the island ever makes, so a decoder can be counted while it
 *  is alive rather than while it is drawing.
 *
 *  `layers.ts` creates its elements and never attaches them, and `release()`
 *  frees a decoder by taking the `src` off and calling `load()` — pausing alone
 *  leaves it allocated, which the file says in its own comment. So "alive" here
 *  is "still has a source on it", which is the thing release actually takes
 *  away, and "playing" is reported separately so the two cannot be confused in
 *  a failure message. */
const DECODER_WATCH = String.raw`
  (() => {
    if (window.__decoders) return;
    const made = new Set();
    window.__decoders = made;
    const real = Document.prototype.createElement;
    Document.prototype.createElement = function (tag, options) {
      const node = real.call(this, tag, options);
      try {
        if (String(tag).toLowerCase() === "video") made.add(node);
      } catch {}
      return node;
    };
  })();
`;

// ---------------------------------------------------------------------------
// Read out of the page
// ---------------------------------------------------------------------------

const READY = String.raw`
  return (async () => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const stage = document.querySelector("[data-backlot-stage]");
      if (stage && stage.hasAttribute("data-backlot-ready")) return "ready";
      await new Promise((done) => setTimeout(done, 50));
    }
    return "timed out";
  })();
`;

/** One reading of everything the three rulings turn on. Taken in one evaluate so
 *  the rects, the dense flags and the canvas's sentence are all from the same
 *  moment — a camera in flight moves all three, and three round trips would
 *  read three different frames and report them as one state. */
const STATE = String.raw`
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  const box = canvas ? canvas.getBoundingClientRect() : null;
  const made = window.__decoders;
  let held = 0;
  let playing = 0;
  if (made) {
    for (const node of made) {
      if (!node.getAttribute("src")) continue;
      held += 1;
      if (!node.paused) playing += 1;
    }
  }
  const active = document.activeElement;
  const hud = document.querySelector("[data-backlot-hud]");
  return {
    label: canvas ? canvas.getAttribute("aria-label") : null,
    // The engine's own answer to "is the camera off its resting view", written
    // in the same pass as the clip count. Not the canvas's prose and not a size
    // somebody has to know the resting value of to read.
    framed: hud instanceof HTMLElement && hud.dataset.backlotFramed === "true",
    canvas: box ? { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) } : null,
    activeHotspot: active instanceof HTMLElement ? (active.dataset.backlotHotspot ?? null) : null,
    decoders: { made: made ? made.size : -1, held, playing },
    // What the engine says it is holding, which is a different claim from what
    // the browser is actually holding. Read so the two can be put side by side.
    saidClips: hud instanceof HTMLElement && hud.dataset.backlotClips !== undefined ? Number(hud.dataset.backlotClips) : null,
    controls: [...document.querySelectorAll("[data-backlot-hotspot]")].map((button) => {
      const rect = button.dataset.backlotRect;
      const cap = button.dataset.backlotCap;
      const label = button.getBoundingClientRect();
      return {
        id: button.dataset.backlotHotspot,
        text: (button.textContent || "").replace(/\s+/g, " ").trim(),
        hidden: button.hidden,
        dense: button.dataset.backlotDense === "true",
        edge: button.dataset.backlotEdge === "true",
        rect: rect ? rect.split(",").map(Number) : null,
        cap: cap === undefined ? null : Number(cap),
        box: [Math.round(label.left), Math.round(label.top), Math.round(label.width), Math.round(label.height)],
      };
    }),
  };
`;

/** Every frame, whether each tracked control is publishing a rectangle.
 *
 *  **Sampled per animation frame, from inside the page, because the gap this is
 *  written against is frames long and a poll from out here cannot see it.**
 *  Lane 1 measured the door's rect going `null` mid-push for six samples at
 *  1920 and seventeen at 390 — the phone three times worse — while the position
 *  lerp was running. A Node-side read every 150 ms would have stepped straight
 *  over that and reported a clean push, which is the shape of a check that is
 *  green because it looked in the wrong places rather than because nothing was
 *  wrong.
 *
 *  `requestAnimationFrame` is the right rate on purpose: the engine parks the
 *  buttons and publishes the rects in the same pass it draws, so one sample per
 *  frame is one sample per publication and a gap of n frames reads as n.
 *
 *  It counts what it saw as well as what it missed. A watch that never ran
 *  reports zero gaps, which is the healthy answer and the broken one. */
const RECT_WATCH = String.raw`
  (() => {
    if (window.__rectWatch) return;
    const watch = { running: false, tracked: [], frames: 0, seen: {}, gaps: {}, capSeen: {}, capGaps: {} };
    window.__rectWatch = watch;
    const step = () => {
      if (watch.running) {
        watch.frames += 1;
        for (const id of watch.tracked) {
          const button = document.querySelector("[data-backlot-hotspot=" + JSON.stringify(id) + "]");
          if (!button || button.hidden) continue;
          if (button.dataset.backlotRect) watch.seen[id] = (watch.seen[id] || 0) + 1;
          else watch.gaps[id] = (watch.gaps[id] || 0) + 1;
          if (button.dataset.backlotCap !== undefined) watch.capSeen[id] = (watch.capSeen[id] || 0) + 1;
          else watch.capGaps[id] = (watch.capGaps[id] || 0) + 1;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();
`;

const WATCH_FROM = (ids: readonly string[]) => String.raw`
  const watch = window.__rectWatch;
  if (!watch) return null;
  watch.tracked = ${JSON.stringify(ids)};
  watch.frames = 0;
  watch.seen = {};
  watch.gaps = {};
  watch.capSeen = {};
  watch.capGaps = {};
  watch.running = true;
  return null;
`;

const WATCH_STOP = String.raw`
  const watch = window.__rectWatch;
  if (!watch) return null;
  watch.running = false;
  return { frames: watch.frames, seen: watch.seen, gaps: watch.gaps, capSeen: watch.capSeen, capGaps: watch.capGaps };
`;

/** Tab until the wanted control has the keyboard, and say so if it never does.
 *
 *  No fallback. `element.focus()` would move `document.activeElement` and fire
 *  nothing — headless Chrome defers focus events forever without focus
 *  emulation, which `Tab.launch` turns on for exactly this — so a check that
 *  reached for it would prove the camera responds to a thing no reader can do.
 *  The ruling is about Tab landing on the button, so this lands on it by
 *  tabbing. */
async function tabTo(tab: Tab, id: string, limit = 40): Promise<number> {
  for (let step = 1; step <= limit; step++) {
    await tab.press("Tab");
    const active = await tab.evaluate<string | null>(
      `const node = document.activeElement; return node instanceof HTMLElement ? (node.dataset.backlotHotspot ?? null) : null;`,
    );
    if (active === id) return step;
  }
  throw new Error(`Tab never reached the ${id} control in ${limit} presses, so nothing below was measured on a keyboard arrival`);
}

interface Control {
  id: string;
  text: string;
  hidden: boolean;
  dense: boolean;
  /** `data-backlot-edge`: the control had to be clamped to stay in the canvas. */
  edge: boolean;
  rect: number[] | null;
  /** `data-backlot-cap`: what a nameplate's cap projects to, in CSS pixels. */
  cap: number | null;
  box: number[];
}

interface State {
  label: string | null;
  canvas: { left: number; top: number; width: number; height: number } | null;
  activeHotspot: string | null;
  framed: boolean;
  decoders: { made: number; held: number; playing: number };
  saidClips: number | null;
  controls: Control[];
}

/** What the frame watch saw across one camera move. */
interface Watch {
  frames: number;
  seen: Record<string, number>;
  gaps: Record<string, number>;
  capSeen: Record<string, number>;
  capGaps: Record<string, number>;
}

const find = (state: State, id: string): Control | undefined => state.controls.find((one) => one.id === id);
const capOf = (state: State, id: string): number | null => find(state, id)?.cap ?? null;

/** The sentence `describeCanvas()` writes while something is framed. Matched on
 *  the shape the engine commits to, not on a substring of the room's own prose.
 *
 *  There are two of them, because a room's framing hands over a point and a
 *  radius and no name — so it says the state rather than inventing one. This
 *  one is the **named** framing, which is what a door gets. */
const CLOSE_ON = /The camera is close on: (.+?)\. Escape pulls back\.$/;
const closeOn = (state: State): string | null => CLOSE_ON.exec(state.label ?? "")?.[1] ?? null;

/** And the unnamed one, which is what a room gets. Either sentence means the
 *  canvas has told a reader who cannot see it that the camera moved. */
const CAME_IN = / The camera has come in close\. Escape pulls back\.$/;
const cameraSpeaks = (state: State): boolean =>
  closeOn(state) !== null || CAME_IN.test(state.label ?? "");

// ---------------------------------------------------------------------------
// The drive
// ---------------------------------------------------------------------------

interface Approach {
  viewport: string;
  reducedMotion: boolean;
  /** The hub, camera on its fixed frame. */
  rest: State;
  /** Tab has just landed on the clip door's button; sampled inside the travel. */
  early: State;
  /** And after the travel has had time to finish. */
  arrived: State;
  /** Escape pressed. */
  released: State;
  /** One per nameplate door: Tab landed on it, the travel finished, and its
   *  window was read off the composite with the HUD out of the picture. Only
   *  taken on the motion-on pass — a plate does not depend on the preference,
   *  and three more framings per combination is three more minutes.
   *
   *  `capAfter` is the published cap re-read on the far side of the raster. A
   *  plate sitting within a few tenths of the threshold could cross it between
   *  the two round trips and turn a correct build into a failure, so the pair
   *  is what makes the reading worth believing — the same guard
   *  `spec/backlot-fitout.test.ts` puts on its own rect-then-sample. */
  plates: { id: string; label: string; state: State; ink: Ink | null; capAfter: number | null }[];
  /** And the same windows read with the camera on its resting frame, which is
   *  where the threshold is actually straddled: at 1920 in the dark theme
   *  ASSESSMENT publishes 11.9 px of cap and POLICIES 8.8, so one plate has to
   *  carry its word and another has to not, in the same frame. Without this the
   *  "and not below" half of ruling 3 has nothing to run on. */
  restInk: { id: string; label: string; cap: number | null; ink: Ink | null; capAfter: number | null }[];
  /** Which control Tab reached, and after how many presses. */
  reached: { id: string; presses: number }[];
  /** Every frame from just before Tab landed on the door to just after Escape
   *  released the framing — both camera moves, which is where the gap was. */
  watch: Watch | null;
  /** The same, one window per plate framing, so every push this file makes is
   *  covered and not only the first. Each window tracks the door being pushed
   *  to, because the others leave the frame at 390 and are right to drop their
   *  rects when they do. */
  plateWatches: { id: string; label: string; watch: Watch | null }[];
}

interface RoomVisit {
  viewport: string;
  /** In the machine room, camera on the room's fixed frame. */
  rest: State;
  /** After Enter on the first front-wall screen. */
  atWall: State;
}

/** Take the HUD out of the picture without taking the reader out of the scene.
 *
 *  **`opacity: 0`, and not `visibility: hidden`, and the difference cost a
 *  whole reading.** An element inside a `visibility: hidden` subtree cannot
 *  hold focus, so hiding the HUD that way blurs the control the keyboard is on
 *  — and in this file the framing was *taken* by Tab landing on that control,
 *  so blurring it releases the framing and the camera goes back out. Measured,
 *  with the Assessment door framed at 1920:
 *
 *      framed                     rect 150x200, cap 24.1, activeElement the door
 *      after visibility: hidden   rect  74x63,  cap 11.9, activeElement BODY
 *      after opacity: 0           rect 150x200, cap 24.1, activeElement the door
 *
 *  The first version of this used `visibility: hidden`, rastered the 150x200
 *  window after the camera had already left it, and reported a framed plate
 *  with no word on it and a ground of 12 — the floor of the god view, sampled
 *  through a rectangle that had been true a moment earlier. `opacity: 0` paints
 *  nothing and keeps everything else: layout, focus, parking, and the readings.
 *
 *  `spec/backlot-fitout.test.ts` uses the `visibility` version and is right to,
 *  because it samples the resting view where there is no framing to lose. It
 *  stops being right the moment anything samples a framed surface with it. */
const HIDE_HUD = String.raw`
  const style = document.createElement("style");
  style.dataset.hideHud = "";
  style.textContent = "[data-backlot-hud]{opacity:0!important}";
  document.head.append(style);
  return null;
`;

const SHOW_HUD = String.raw`
  for (const style of document.querySelectorAll("style[data-hide-hud]")) style.remove();
  return null;
`;

/** The ink on a plate, and how far it reaches across the run.
 *
 *  A nameplate's word is turned, so its cap runs **across** the window and the
 *  letters stack down it. The number ruling 3 is about is therefore the ink's
 *  extent in x, measured off the composite rather than computed from the
 *  texture's own `capPixels` — a texture-space cap says nothing about how many
 *  screen pixels survived the projection, which is the whole question.
 *
 *  Ink is a pixel that has gone most of the way from the plate's own ground
 *  toward `--at-text`, in that direction and not the other, so the door's frame
 *  and the light spilling onto it cannot be counted as letters. */
interface Ink {
  window: string;
  ground: number;
  pixels: number;
  /** The ink's extent across the run: the projected cap, read off the picture. */
  across: number;
  along: number;
}

function readInk(raster: Raster, textLuma: number): Ink {
  const { width, height } = raster;
  // Past the plate's own pad and its hairline, which `signage.ts` draws at
  // `pad * 0.5` with `pad` at 9% of the height. 16% clears both at every size
  // the window is ever read at.
  const x0 = Math.max(1, Math.round(width * 0.16));
  const x1 = Math.min(width - 1, Math.round(width * 0.84));
  const y0 = Math.max(1, Math.round(height * 0.16));
  const y1 = Math.min(height - 1, Math.round(height * 0.84));
  const values: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) values.push(raster.lumaAt(x, y));
  const bins = new Map<number, number>();
  for (const value of values) {
    const key = Math.round(value / 4) * 4;
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  let ground = 0;
  let commonest = 0;
  for (const [key, count] of bins) if (count > commonest) ((commonest = count), (ground = key));
  const cut = 0.6 * Math.abs(textLuma - ground);
  const toward = textLuma > ground ? 1 : -1;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  let pixels = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const value = raster.lumaAt(x, y);
      if ((value - ground) * toward < cut) continue;
      pixels += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return {
    window: `${width}x${height}`,
    ground,
    pixels,
    across: pixels ? right - left + 1 : 0,
    along: pixels ? bottom - top + 1 : 0,
  };
}

const TEXT_LUMA = String.raw`
  // A fresh element, coloured before it is inserted. Under
  // prefers-reduced-motion the theme's base.css leaves a live transition on
  // every animatable property including colour, so reading a token back off a
  // shared element returns the value it is transitioning **from** — which
  // painted the whole backlot in --at-text once already.
  const probe = document.createElement("span");
  probe.style.color = "var(--at-text)";
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return (0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2]);
`;

/** Read one door's window off the composite, with the HUD out of the picture
 *  and the published cap taken on both sides of the raster.
 *
 *  The HUD goes first because the composite is of the page, not of the canvas:
 *  a pill is `--at-bg` and its label is `--at-text`, so a control sitting over
 *  a window would be read as the brightest ink in it. `visibility: hidden`
 *  rather than `display: none`, so the engine goes on parking the buttons and
 *  publishing their readings while the pixels stop being the HUD's. */
async function readWindow(
  tab: Tab,
  id: string,
  textLuma: number,
): Promise<{ cap: number | null; ink: Ink | null; capAfter: number | null }> {
  const before = await tab.evaluate<State>(STATE);
  const control = find(before, id);
  const rect = control?.rect;
  if (!rect || !before.canvas) return { cap: control?.cap ?? null, ink: null, capAfter: null };
  await tab.evaluate(HIDE_HUD);
  await pause(400);
  const raster = await tab.raster({
    x: before.canvas.left + rect[0]!,
    y: before.canvas.top + rect[1]!,
    width: rect[2]!,
    height: rect[3]!,
  });
  await tab.evaluate(SHOW_HUD);
  await pause(200);
  const after = await tab.evaluate<State>(STATE);
  return { cap: control.cap, ink: readInk(raster, textLuma), capAfter: find(after, id)?.cap ?? null };
}

/** Wait until the front wall's controls hold still.
 *
 *  Two consecutive identical readings rather than a fixed sleep, and it has to
 *  work in both directions: above the breakpoint the camera pushes and then
 *  stops, and below it the push is skipped and the controls were never going to
 *  move at all. A sleep long enough for the first is a sleep wasted on the
 *  second, and a poll that waited for a framing would hang on the case where
 *  there correctly is none. */
async function settleWall(tab: Tab): Promise<void> {
  const READ = String.raw`
    const canvas = document.querySelector("[data-backlot-stage] canvas");
    return (canvas ? canvas.getAttribute("aria-label") : "") + "::" +
      [...document.querySelectorAll("[data-backlot-hotspot^='play-front-']")]
        .map((button) => (button.dataset.backlotRect ?? "-") + "|" + (button.dataset.backlotDense ?? ""))
        .join(" ");
  `;
  // The canvas's own sentence is in the reading, and there is a floor on how
  // soon this may decide. `focusin` starts the framing and the camera moves on
  // the next frame, so two reads 80 ms apart taken immediately after the press
  // are both of the moment before it started — which is how the first version
  // of this returned instantly and then read the room's plain sentence back as
  // "the camera never came". The sentence changes in the same task the framing
  // is taken, so including it means the settle cannot land on the near side of
  // a push that is about to happen.
  const FLOOR = 5;
  let previous = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    const now = await tab.evaluate<string>(READ);
    if (attempt >= FLOOR && now === previous) return;
    previous = now;
    await pause(80);
  }
}

async function walk(): Promise<{ approaches: Approach[]; rooms: RoomVisit[] }> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const approaches: Approach[] = [];
  const rooms: RoomVisit[] = [];

  try {
    await tab.onNewDocument(DECODER_WATCH);
    await tab.onNewDocument(RECT_WATCH);

    for (const viewport of VIEWPORTS) {
      for (const reducedMotion of [false, true]) {
        await tab.viewport(viewport.width, viewport.height);
        await tab.media({ colourScheme: THEME, reducedMotion });
        await tab.goto(`${site.origin}${prefix}backlot/`);
        await tab.evaluate(`try { localStorage.setItem("at-theme", ${JSON.stringify(THEME)}); } catch {} return null;`);
        await tab.goto(`${site.origin}${prefix}backlot/`);
        await tab.evaluate<string>(READY);
        await pause(1200);

        const reached: { id: string; presses: number }[] = [];
        const rest = await tab.evaluate<State>(STATE);

        // --- ruling 1, by keyboard. Tab lands on the door; the camera is asked
        // for twice: once inside the travel and once after it. The frame watch
        // runs across the whole of it, both ways, because a published reading
        // that blinks out while the camera travels is exactly what a sample
        // taken at either end cannot see.
        await tab.evaluate(WATCH_FROM(DOORS.map((door) => door.id)));
        reached.push({ id: CLIP_DOOR.id, presses: await tabTo(tab, CLIP_DOOR.id) });
        await pause(Math.round(TRAVEL_MS * 0.35));
        const early = await tab.evaluate<State>(STATE);
        await pause(2200);
        const arrived = await tab.evaluate<State>(STATE);

        // --- and back out, the way a reader asks for it.
        await tab.press("Escape");
        await pause(2200);
        const released = await tab.evaluate<State>(STATE);
        const watch = await tab.evaluate<Watch | null>(WATCH_STOP);

        // --- ruling 3, on every door whose window is a plate.
        const plates: Approach["plates"] = [];
        const plateWatches: Approach["plateWatches"] = [];
        const restInk: Approach["restInk"] = [];
        if (!reducedMotion) {
          const textLuma = await tab.evaluate<number>(TEXT_LUMA);
          // First from where the reader is standing, because that is where the
          // threshold is straddled and where "lit but wordless" is the claim —
          // but only on the doors whose published box is their window. On a
          // sheared door the box takes in the lintel board, and counting ink in
          // it answers a question about the board.
          for (const door of PLATE_DOORS) {
            if (!squareToAxes(door)) {
              restInk.push({ id: door.id, label: door.label, cap: capOf(await tab.evaluate<State>(STATE), door.id), ink: null, capAfter: null });
              continue;
            }
            const reading = await readWindow(tab, door.id, textLuma);
            restInk.push({ id: door.id, label: door.label, ...reading });
          }
          // Then with the camera on each of them in turn, each push inside its
          // own frame watch.
          for (const door of PLATE_DOORS) {
            await tab.evaluate(WATCH_FROM([door.id, ...PLATE_DOORS.map((plate) => plate.id)]));
            reached.push({ id: door.id, presses: await tabTo(tab, door.id) });
            await pause(2200);
            const state = await tab.evaluate<State>(STATE);
            const reading = await readWindow(tab, door.id, textLuma);
            plates.push({ id: door.id, label: door.label, state, ink: reading.ink, capAfter: reading.capAfter });
            await tab.press("Escape");
            await pause(1400);
            plateWatches.push({ id: door.id, label: door.label, watch: await tab.evaluate<Watch | null>(WATCH_STOP) });
          }
        }

        approaches.push({
          viewport: viewport.name,
          reducedMotion,
          rest,
          early,
          arrived,
          released,
          plates,
          plateWatches,
          restInk,
          reached,
          watch,
        });
      }

      // --- ruling 2. Into the machine room, which is entered by pressing its
      // own door, and then to the wall by pressing the first screen — the same
      // event the engine treats a walk-up as.
      await tab.viewport(viewport.width, viewport.height);
      await tab.media({ colourScheme: THEME, reducedMotion: true });
      await tab.goto(`${site.origin}${prefix}backlot/`);
      await tab.evaluate<string>(READY);
      await pause(1200);
      const roomDoor = doorInto(roomNamed("machine-room"));
      await tabTo(tab, roomDoor.id);
      await tab.press("Enter");
      await pause(4000);
      const roomRest = await tab.evaluate<State>(STATE);
      const wall = roomRest.controls.filter((one) => !one.hidden && /^play-front-/.test(one.id));
      let atWall = roomRest;
      if (wall.length > 0) {
        // **Tab landing on it, and nothing else.** Arriving is what frames, and
        // Tab landing on a control is an arrival — that is ruling 1 and it is
        // what the front wall inherits. Pressing Enter as well was what the
        // first version did, and it read the room's plain sentence back: Enter
        // on a front-wall screen walks the figure to the piece, the walk takes
        // it out of the neighbouring piece's reach, the proximity that fires on
        // the way calls `unfocus()`, and 2.6 s later the camera is back on the
        // room. The check was reading a release it had caused itself.
        await tabTo(tab, wall[0]!.id);
        await settleWall(tab);
        atWall = await tab.evaluate<State>(STATE);
      }
      rooms.push({ viewport: viewport.name, rest: roomRest, atWall });
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return { approaches, rooms };
}

const { approaches, rooms } = await walk();
const approachAt = (viewport: string, reducedMotion: boolean) =>
  approaches.find((one) => one.viewport === viewport && one.reducedMotion === reducedMotion)!;
const roomAt = (viewport: string) => rooms.find((one) => one.viewport === viewport)!;

const size = (control: Control | undefined) => (control?.rect ? { width: control.rect[2]!, height: control.rect[3]! } : null);
const say = (control: Control | undefined) => {
  const box = size(control);
  return box ? `${box.width}×${box.height}` : "no published rectangle";
};

// ---------------------------------------------------------------------------
// The probe measured something
// ---------------------------------------------------------------------------
//
// First, because every assertion under it is worthless if the drive did not
// happen. A door the keyboard never reached, a canvas with no sentence on it or
// a decoder watch that saw no element at all are all failures of the instrument,
// and each of them would otherwise turn into a quiet green somewhere below.

describe("the approach was driven", () => {
  it("drove both viewports with motion on and off", () => {
    expect(approaches.map((one) => `${one.viewport} reduced=${one.reducedMotion}`).sort()).toEqual(
      VIEWPORTS.flatMap((viewport) => [false, true].map((reduced) => `${viewport.name} reduced=${reduced}`)).sort(),
    );
  });

  it("reached every door it set out to with the keyboard", () => {
    for (const one of approaches) {
      expect(one.reached.map((step) => step.id), `${one.viewport} reduced=${one.reducedMotion}`).toEqual(
        one.reducedMotion ? [CLIP_DOOR.id] : [CLIP_DOOR.id, ...PLATE_DOORS.map((door) => door.id)],
      );
      for (const step of one.reached) {
        expect(step.presses, `${step.id} at ${one.viewport} took ${step.presses} presses`).toBeGreaterThan(0);
      }
    }
  });

  it("read a published rectangle for every one of them at rest", () => {
    for (const one of approaches) {
      for (const id of [CLIP_DOOR.id, ...PLATE_DOORS.map((door) => door.id)]) {
        expect(size(find(one.rest, id)), `${id} at rest, ${one.viewport} reduced=${one.reducedMotion}`).not.toBeNull();
      }
    }
  });

  it("read the ink on every plate it pushed to, so the cap readings are not about nothing", () => {
    for (const one of approaches.filter((approach) => !approach.reducedMotion)) {
      expect(
        one.plates.map((plate) => `${plate.id}:${plate.ink ? plate.ink.window : "unsampled"}`),
        `${one.viewport}`,
      ).toEqual(PLATE_DOORS.map((door) => expect.stringMatching(new RegExp(`^${door.id}:\\d+x\\d+$`))));
    }
  });

  it("sampled at rest exactly the doors whose box is their window", () => {
    // The scope of the resting sample is derived, so it is worth saying out
    // loud what it came to: a check that silently sampled none of them would
    // read as a passing run.
    const square = PLATE_DOORS.filter(squareToAxes).map((door) => door.id);
    expect(square.length, "no nameplate door is square to the world axes, so nothing can be counted at rest").toBeGreaterThan(0);
    for (const one of approaches.filter((approach) => !approach.reducedMotion)) {
      expect(
        one.restInk.filter((entry) => entry.ink !== null).map((entry) => entry.id),
        `${one.viewport}: the resting sample covered the wrong doors`,
      ).toEqual(square);
    }
  });

  it("found the canvas saying what it is, so the framing has something to change", () => {
    for (const one of approaches) {
      expect(one.rest.label, `${one.viewport} reduced=${one.reducedMotion}`).toMatch(/\S/);
    }
  });

  // The decoder watch is the one instrument here that reports a zero as its
  // healthy reading, and a zero is what a broken instrument reports too. If
  // `layers.ts` ever stops making its elements with `document.createElement` —
  // a `new Audio()`, a template, a worker — the patch sees nothing, every
  // "holds nothing" assertion passes and every "the clip started" assertion
  // fails for the wrong reason. So it is proved against a place where a clip
  // demonstrably runs: pressing a front-wall screen in the machine room is the
  // room's own play-clip interactive.
  it("saw a video element get made at all, so counting zero means something", () => {
    const seen = [
      ...approaches.flatMap((one) => [
        { where: `${one.viewport} reduced=${one.reducedMotion} at the door`, made: one.arrived.decoders.made },
      ]),
      ...rooms.map((one) => ({ where: `${one.viewport} at the wall`, made: one.atWall.decoders.made })),
    ];
    expect(
      seen.some((entry) => entry.made > 0),
      `no <video> element was created anywhere in the drive (${seen
        .map((entry) => `${entry.where}: ${entry.made}`)
        .join(", ")}). The watch patches Document.prototype.createElement before the page's own script; nothing it ` +
        `counts is visible to querySelectorAll, because layers.ts never attaches these elements to the document.`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ruling 1 — arriving at a door frames it
// ---------------------------------------------------------------------------

describe.each(VIEWPORTS)("arriving at a door at $name", ({ name }) => {
  const one = () => approachAt(name, false);

  it("says what the camera came in on", () => {
    const state = one().arrived;
    expect(
      closeOn(state),
      `Tab landed on the ${CLIP_DOOR.label} door's button and the canvas still says ${JSON.stringify(state.label)}. ` +
        `describeCanvas() writes "The camera is close on: …" the moment a framing is taken, so a canvas that never ` +
        `says it is a camera that never came in — arriving by keyboard is meant to be the same event as walking up.`,
    ).not.toBeNull();
  });

  it("puts at least 120 × 200 px of window on the door", () => {
    const box = size(find(one().arrived, CLIP_DOOR.id));
    expect(box, `no rectangle was published for the ${CLIP_DOOR.label} door after the approach`).not.toBeNull();
    const said =
      `the ${CLIP_DOOR.label} door's window is ${say(find(one().arrived, CLIP_DOOR.id))} after arriving, against ` +
      `${say(find(one().rest, CLIP_DOOR.id))} at rest. The ruling is at least ${WINDOW_MIN.width} × ` +
      `${WINDOW_MIN.height} px, which is what makes the picture behind it worth having.`;
    expect(box!.width, said).toBeGreaterThanOrEqual(WINDOW_MIN.width);
    expect(box!.height, said).toBeGreaterThanOrEqual(WINDOW_MIN.height);
  });

  it("pushes in about 2×", () => {
    const before = size(find(one().rest, CLIP_DOOR.id))!;
    const after = size(find(one().arrived, CLIP_DOOR.id))!;
    const push = Math.min(after.width / before.width, after.height / before.height);
    expect(
      push,
      `the ${CLIP_DOOR.label} door's window went from ${before.width}×${before.height} to ${after.width}×${after.height}, ` +
        `which is ${push.toFixed(2)}× on its smaller axis. A push that is not a push leaves the ring where it was and ` +
        `calls it an arrival.`,
    ).toBeGreaterThanOrEqual(PUSH_AT_LEAST);
  });

  it("starts the clip behind the window", () => {
    const state = one().arrived;
    expect(
      state.decoders.held,
      `after arriving at the ${CLIP_DOOR.label} door — whose window names ${JSON.stringify(
        (CLIP_DOOR.window as { clip?: string }).clip,
      )} — ${state.decoders.held} decoders are alive out of ${state.decoders.made} elements ever made. A door seen ` +
        `from the middle of the ring is 29 px across and a clip there is a decoder running for nobody, which is why ` +
        `it waits for the camera; a clip that never starts is the other half of the same rule going wrong.`,
    ).toBeGreaterThanOrEqual(1);
  });

  it("holds nothing before the reader is there", () => {
    const state = one().rest;
    expect(
      state.decoders.held,
      `${state.decoders.held} decoders are alive with the camera on its resting frame and nobody at any door.`,
    ).toBe(0);
  });

  // The engine publishes its own live-decoder count on the HUD as
  // `data-backlot-clips`. That is a claim about what it thinks it is holding;
  // the count above is what the browser is actually holding, taken by patching
  // `createElement` before the page ran. Putting the two side by side is the
  // §7 rule about checking a stand-in against the real thing — and it is the
  // only thing that would catch a `liveCount()` that has quietly stopped
  // counting something it lets go of.
  it("says it is holding what it is actually holding", () => {
    for (const [when, state] of [
      ["at rest", one().rest],
      ["with the camera on the door", one().arrived],
      ["after Escape", one().released],
    ] as const) {
      if (state.saidClips === null) continue;
      expect(
        state.saidClips,
        `${when}, the HUD says data-backlot-clips="${state.saidClips}" and the browser is holding ` +
          `${state.decoders.held} <video> elements with a source on them (${state.decoders.playing} of them playing, ` +
          `${state.decoders.made} ever made). One of those two numbers is the engine's opinion of itself.`,
      ).toBe(state.decoders.held);
    }
  });
});

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------

describe.each(VIEWPORTS)("leaving a door at $name", ({ name }) => {
  const one = () => approachAt(name, false);

  it("pushes back out to the fixed view", () => {
    const state = one().released;
    expect(
      closeOn(state),
      `Escape was pressed and the canvas still says ${JSON.stringify(state.label)}. Esc pulls the framing back before ` +
        `it does anything else, and the sentence is written by the same function that put it there.`,
    ).toBeNull();
  });

  it("gives the window back the size it had", () => {
    const before = size(find(one().rest, CLIP_DOOR.id))!;
    const after = size(find(one().released, CLIP_DOOR.id))!;
    const ratio = Math.max(after.width / before.width, after.height / before.height);
    expect(
      ratio,
      `the ${CLIP_DOOR.label} door's window was ${before.width}×${before.height} before the approach and ` +
        `${after.width}×${after.height} after Escape, ${ratio.toFixed(2)}× of where it started. A release that lands ` +
        `somewhere else is not the fixed god view, and the ring is only ever seen from there.`,
    ).toBeLessThanOrEqual(RELEASE_SLACK);
  });

  // Seen red by deleting the `layers.releaseVideos()` call from the engine's
  // unmount in the built bundle — the shape, not the name — which leaves a
  // decoder allocated behind a view nobody can see it from. The output is in
  // receipts/rig-3d/a3-checks.md. Counting what **drew** cannot find this: a
  // paused video draws nothing and reads exactly like a released one.
  it("lets the decoder go", () => {
    const state = one().released;
    expect(
      state.decoders.held,
      `after Escape, ${state.decoders.held} decoders are still alive (${state.decoders.playing} of them playing) out ` +
        `of ${state.decoders.made} elements ever made. Alive is "still has a source on it", which is what release() ` +
        `takes away — a paused decoder is still a decoder, and "the picture stopped moving" is not "the decoder was ` +
        `let go".`,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------
//
// Two assertions, because either one alone is satisfied by a bug. "Nothing
// moved" is satisfied by a camera that never went anywhere — which is how a
// reduced-motion check screenshotted two identical frames four seconds apart
// and was green while both were blown out to white. "It arrived" is satisfied
// by a camera that travelled the whole way. The pair is the ruling: the state
// change happens, and only the movement goes.

describe.each(VIEWPORTS)("reduced motion at $name", ({ name }) => {
  const cut = () => approachAt(name, true);
  const travels = () => approachAt(name, false);

  // **No fraction of a journey in either of these, and the first version had
  // one.** It asked how far along the travel the early sample was, as a share
  // of the distance from rest to arrival — and that share is not linear in the
  // camera's own blend, because a window's projected size is not linear in it.
  // On a correct build the motion-on sample read 94% of the way there a third
  // of the way through the travel, and the check called that "essentially
  // instant". The contract has no fraction in it: under this preference the
  // camera does not pass through intermediate states, and with motion on it
  // does. Both halves are written as that and nothing else.
  it("is already there in the first reading, with nothing in between", () => {
    const early = size(find(cut().early, CLIP_DOOR.id));
    const arrived = size(find(cut().arrived, CLIP_DOOR.id))!;
    expect(early, `no rectangle was published for the ${CLIP_DOOR.label} door`).not.toBeNull();
    const apart = Math.max(Math.abs(early!.width - arrived.width), Math.abs(early!.height - arrived.height));
    expect(
      apart,
      `${Math.round(TRAVEL_MS * 0.35)} ms after Tab landed on the door the window was ` +
        `${early!.width}×${early!.height}, and it settled at ${arrived.width}×${arrived.height} — ${apart} px apart. ` +
        `Under this preference the camera cuts, so the first reading anyone can take is already the last one; ` +
        `anything past ${IDLE_DRIFT} px is a journey.`,
    ).toBeLessThanOrEqual(IDLE_DRIFT);
  });

  it("still arrives, and says so", () => {
    expect(
      closeOn(cut().arrived),
      `with motion reduced, the canvas says ${JSON.stringify(cut().arrived.label)}. Cutting rather than travelling ` +
        `takes away the journey, not the arrival — the state change has to happen either way.`,
    ).not.toBeNull();
  });

  it("and the camera with motion on was still on its way at that moment, so the pair says something", () => {
    // The other half of the pair, and the reason the check above is not
    // vacuous: if the framing were instant under both preferences, "already
    // there" would be true of a build with no reduced-motion handling at all.
    //
    // Written as a fraction of the journey rather than as "smaller than". The
    // first version asked `early.height < arrived.height` and **passed on the
    // tree with no framing in it at all**, where the two readings were 62 and
    // 63 px — a pixel of projection jitter standing in for a camera move. A
    // check that a rounding error satisfies is a check that cannot go red.
    const rest = size(find(travels().rest, CLIP_DOOR.id))!;
    const early = size(find(travels().early, CLIP_DOOR.id))!;
    const arrived = size(find(travels().arrived, CLIP_DOOR.id))!;
    expect(
      arrived.height - rest.height,
      `with motion on the window went from ${rest.height} px at rest to ${arrived.height} px after the approach, so ` +
        `there is no journey at all and the reduced-motion check above is measuring nothing.`,
    ).toBeGreaterThan(rest.height * (PUSH_AT_LEAST - 1));
    const apart = Math.max(Math.abs(early.width - arrived.width), Math.abs(early.height - arrived.height));
    expect(
      apart,
      `with motion on, the window was ${early.width}×${early.height} ${Math.round(TRAVEL_MS * 0.35)} ms after Tab ` +
        `landed on the door and ${arrived.width}×${arrived.height} once it settled — ${apart} px apart. If the ` +
        `camera is at its destination in the first reading with motion **on**, then "already there" under reduced ` +
        `motion is true of a build with no reduced-motion handling in it at all, and the check above is not ` +
        `evidence of anything.`,
    ).toBeGreaterThan(IDLE_DRIFT);
  });
});

// ---------------------------------------------------------------------------
// Ruling 2 — the front wall's five labels
// ---------------------------------------------------------------------------

describe.each(VIEWPORTS)("the front wall's labels at $name", ({ name }) => {
  const one = () => roomAt(name);
  const wallOf = (state: State) => state.controls.filter((control) => !control.hidden && /^play-front-/.test(control.id));

  it("found the room and its five screens", () => {
    const wall = wallOf(one().rest);
    expect(
      wall.map((control) => control.id),
      `the machine room was entered through its own door and ${wall.length} front-wall controls were found. ` +
        `Everything below is about those five.`,
    ).toHaveLength(5);
  });

  // Seen red on the tree as it stands: at 1920×1080 two of the five carry a
  // full label and three are dots, which is the arrangement the ruling
  // overturns. The output is in receipts/rig-3d/a3-checks.md.
  it("comes down to dots at room distance", () => {
    const wall = wallOf(one().rest);
    const showing = wall.filter((control) => !control.dense);
    expect(
      showing.map((control) => `${control.id} ${control.box[2]}×${control.box[3]}`),
      `at room distance ${showing.length} of the five front-wall labels are still laid out across the wall: ` +
        `${showing.map((control) => control.text).join(", ")}. A label that covers the thing it names is worse than ` +
        `no label on the canvas, and the gallery carries every caption in text regardless. Keyed on ` +
        `data-backlot-dense, which hotspots.ts sets in the frame it decides — a width threshold cannot see this, ` +
        `because a collapsed label keeps its full text inside a 1 px box.`,
    ).toEqual([]);
  });

  // ------------------------------------------------------------------------
  // Above the breakpoint: the camera comes to the wall and the row appears.
  // ------------------------------------------------------------------------

  const wide = VIEWPORTS.find((viewport) => viewport.name === name)!.width > DOT_WIDTH;

  // **Keyed on `data-backlot-framed`**, which the engine writes on the HUD in
  // the same pass as the clip count and for exactly this: "the row is owed once
  // the camera is at the wall" needs a condition to hang off, and the two other
  // candidates are both wrong. The canvas's sentence is prose — and it did not
  // mention a room's framing at all until this round, which this file caught by
  // reading it. A rectangle is a size somebody has to know the resting value of
  // to interpret. The flag is the state the engine intends, said as a state.
  it.runIf(wide)("has the camera off its resting view at the wall", () => {
    expect(
      one().atWall.framed,
      `Tab landing on the first front-wall screen left data-backlot-framed ${
        one().atWall.framed ? "set" : "absent"
      } on the HUD, and the canvas saying ${JSON.stringify(one().atWall.label)}.`,
    ).toBe(true);
    expect(one().rest.framed, "the camera was already off its resting view before anything was pressed").toBe(false);
  });

  // And the rectangles, which are what the push actually moves. Kept as a
  // second assertion rather than the first: the flag says the engine meant to,
  // this says it did.
  it.runIf(wide)("brings the camera to the wall when a reader comes to it", () => {
    const before = wallOf(one().rest);
    const after = wallOf(one().atWall);
    const pushes = before.map((control, index) => {
      const then = control.rect;
      const now = after[index]?.rect;
      if (!then || !now) return { id: control.id, push: 0, said: `${control.id}: no rectangle` };
      const push = Math.min(now[2]! / then[2]!, now[3]! / then[3]!);
      return { id: control.id, push, said: `${control.id}: ${then[2]}×${then[3]} → ${now[2]}×${now[3]} (${push.toFixed(2)}×)` };
    });
    expect(
      pushes.filter((entry) => entry.push < WALL_PUSH_AT_LEAST).map((entry) => entry.said),
      `Tab landing on the first front-wall screen did not bring the camera to the wall. The five pieces measure ` +
        `${pushes.map((entry) => entry.said).join(", ")}. The row below is only owed once the camera is there, so ` +
        `this is the condition the rest of the ruling hangs off.`,
    ).toEqual([]);
  });

  // **A separate check, because it is about the reader rather than the ruling,
  // and it found something.** `describeCanvas()` exists so that the states a
  // canvas can be in cannot drift apart, and it says so in its own comment. A
  // door's framing wrote "The camera is close on: …" and the front wall's wrote
  // nothing: measured at 1920 before it was fixed, the wall pushed from 161×179
  // to 278×484 and all five labels came out of their dots onto one row while
  // the canvas went on saying the room's resting sentence. A reader who cannot
  // see the screen was told the camera came in at a door and not told it came
  // in at the wall, which is the same event.
  //
  // There is a third state now, and it is the unnamed one on purpose: a room's
  // framing hands over a point and a radius, so naming it would mean picking
  // one rung of five to call it. Either sentence satisfies this.
  it.runIf(wide)("tells a reader who cannot see it that the camera moved", () => {
    expect(
      cameraSpeaks(one().atWall),
      `the camera came to the front wall and the canvas says ${JSON.stringify(one().atWall.label)}. The flag above ` +
        `is for a check; this sentence is for a reader, and the two have to move together or the description is ` +
        `of a shot nobody is looking at.`,
    ).toBe(true);
    expect(
      cameraSpeaks(one().rest),
      `the canvas already claimed the camera had come in before anything was pressed: ` +
        `${JSON.stringify(one().rest.label)}`,
    ).toBe(false);
  });

  it.runIf(wide)("shows one full row once the camera is at the wall", () => {
    const wall = wallOf(one().atWall);
    const dots = wall.filter((control) => control.dense);
    expect(
      dots.map((control) => control.id),
      `with the camera at the wall, ${dots.length} of the five labels are still dots. At the wall there is room for ` +
        `the words and the reason for the dots is gone.`,
    ).toEqual([]);
  });

  it.runIf(wide)("lays that row out as one row, not as a stack", () => {
    const wall = wallOf(one().atWall);
    // The guard first, because five dots parked across a wall satisfy "one row"
    // trivially and this check would pass about nothing — which is the shape of
    // failure §7 calls green and blind. A row is a row of words.
    expect(
      wall.filter((control) => control.dense).map((control) => control.id),
      `${wall.filter((control) => control.dense).length} of the five are still dots, so there is no row to measure ` +
        `and a spread taken over dots would pass without meaning anything.`,
    ).toEqual([]);
    const centres = wall.map((control) => control.box[1]! + control.box[3]! / 2);
    const spread = Math.max(...centres) - Math.min(...centres);
    const tallest = Math.max(...wall.map((control) => control.box[3]!));
    expect(
      spread,
      `the five labels' centres are spread over ${Math.round(spread)} px vertically and the tallest label is ` +
        `${tallest} px, so they are on ${Math.round(spread / Math.max(tallest, 1)) + 1} rows rather than one. ` +
        `"One full row" is the shape the ruling asked for: two staggered rows was the alternative and it was not ` +
        `the one chosen.`,
    ).toBeLessThanOrEqual(tallest);
  });

  // ------------------------------------------------------------------------
  // At or below it: the push is removed, not fixed
  // ------------------------------------------------------------------------
  //
  // **These three replace an assertion that was wrong, and the way it was wrong
  // is worth keeping.** This file first asserted that the camera comes to the
  // wall at 390 too, on the reasoning that the ruling did not scope itself by
  // viewport. It does now: below the width where every control is a dot there
  // is no row of words for the push to reveal, and lane 1 measured the push
  // clamping two of the five rungs off frame and buying nothing. So the push is
  // skipped there — through a `skip()` predicate asked at framing time rather
  // than a query read at build, because rotating a phone crosses that line
  // under a room that is already standing.
  //
  // A check written against the old ruling would have gone red on the fix and
  // read exactly like a regression. What stops the next one doing that is that
  // these assert the **skip** as a thing the code does on purpose, not the
  // absence of a thing.

  it.runIf(!wide)("does not push to the wall at all below the breakpoint", () => {
    expect(
      closeOn(one().atWall),
      `at ${name}, Enter on the first front-wall screen left the canvas saying ` +
        `${JSON.stringify(one().atWall.label)}. Below ${DOT_WIDTH}px every control on the wall is a dot, so there ` +
        `is no row of words for a push to reveal and the push is skipped rather than fitted.`,
    ).toBeNull();
  });

  it.runIf(!wide)("leaves the five rectangles where they were", () => {
    const before = wallOf(one().rest);
    const after = wallOf(one().atWall);
    expect(after.map((control) => control.id), "the five controls are not the five that were there").toEqual(
      before.map((control) => control.id),
    );
    const moved = before
      .map((control, index) => {
        const then = control.rect;
        const now = after[index]!.rect;
        if (!then || !now) return `${control.id}: ${then ? "rect" : "no rect"} → ${now ? "rect" : "no rect"}`;
        const shift = Math.max(...then.map((value, axis) => Math.abs(value - now[axis]!)));
        return shift > IDLE_DRIFT ? `${control.id}: moved ${shift}px` : null;
      })
      .filter((one): one is string => one !== null);
    expect(
      moved,
      `pressing a front-wall screen at ${name} moved its neighbours' published rectangles. Nothing is supposed to ` +
        `happen here: rows measured [${before.map((control) => control.rect?.[1] ?? "—").join(", ")}] before and ` +
        `[${after.map((control) => control.rect?.[1] ?? "—").join(", ")}] after, and anything past ${IDLE_DRIFT}px ` +
        `is more than the idle camera's own drift.`,
    ).toEqual([]);
  });

  it.runIf(!wide)("clamps nothing to the edge of the canvas", () => {
    const clamped = wallOf(one().atWall).filter((control) => control.edge);
    expect(
      clamped.map((control) => control.id),
      `${clamped.length} of the five front-wall controls are carrying data-backlot-edge at ${name}, which is the ` +
        `engine saying it had to hold them inside the canvas. That is what the push did here before it was ` +
        `removed: two rungs off frame, for a row that does not exist at this width.`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ruling 3 — a nameplate's word, once there is room for it
// ---------------------------------------------------------------------------
//
// Only the half a rendered pixel can settle. See the note at the top of this
// file for what the other half needs and why it is not guessed at here.

describe.each(VIEWPORTS)("a nameplate at $name", ({ name }) => {
  const one = () => approachAt(name, false);
  const plate = (id: string) => one().plates.find((entry) => entry.id === id)!;
  /** The published cap at a given moment, or null if the engine said nothing. */
  const capAt = (state: State, id: string) => find(state, id)?.cap ?? null;
  const rest = (id: string) => one().restInk.find((entry) => entry.id === id)!;

  it("publishes a cap for every plate, at rest and framed", () => {
    // The instrument, before anything is asserted with it. An attribute that is
    // not there reads as null, and null compared against a threshold is a
    // comparison that quietly answers "no" — which would make every assertion
    // below agree with a build that publishes nothing at all.
    for (const door of PLATE_DOORS) {
      expect(
        capAt(one().rest, door.id),
        `${door.label} publishes no data-backlot-cap on its control at rest. The cap is what decides whether the ` +
          `word is painted, and nothing sampling the composite can recover it: a 37×113 window reads as the door's ` +
          `own light whether the word is on it or not.`,
      ).not.toBeNull();
      expect(capAt(plate(door.id).state, door.id), `${door.label} publishes no cap with the camera on it`).not.toBeNull();
    }
  });

  for (const door of PLATE_DOORS) {
    it(`the ${door.label} plate was framed, so there is a plate to read`, () => {
      expect(
        closeOn(plate(door.id).state),
        `Tab landed on the ${door.label} door and the canvas says ${JSON.stringify(plate(door.id).state.label)}.`,
      ).not.toBeNull();
    });

    // **The threshold itself, which is why the engine publishes a number and
    // not a flag.** A `showingWord` boolean would only ever let this assert
    // that the engine agrees with itself — a build with the floor moved to 4 px
    // would set the flag at 4 px of cap and a check reading the flag would pass
    // while the plate carried a word nobody can read. `CAP_MIN` is stated here
    // rather than imported from `hub.ts`'s `PLATE_CAP_FLOOR` for the same
    // reason: two independent statements of 11, so moving one of them fails.
    //
    // Both directions, and the resting frame is where "and not below" actually
    // gets exercised: at 1920 in the dark theme the three plates publish 11.9,
    // 10.6 and 8.8 px of cap from the god view, so the line runs between
    // ASSESSMENT and the other two in the same frame.
    it(`the ${door.label} plate paints its word above ${CAP_MIN} px of cap and not below`, () => {
      const readings = [
        { when: "at rest", sampled: squareToAxes(door), ...rest(door.id) },
        {
          when: "with the camera on it",
          sampled: true,
          cap: capAt(plate(door.id).state, door.id),
          ink: plate(door.id).ink,
          capAfter: plate(door.id).capAfter,
        },
      ];
      let asserted = 0;
      for (const reading of readings) {
        const { cap, ink, capAfter } = reading;
        expect(cap, `the ${door.label} plate publishes no cap ${reading.when}`).not.toBeNull();
        // A sheared door's resting box is not its window, so there is nothing
        // to count in it. The cap above is still asserted; the pixels are not
        // pretended to.
        if (!reading.sampled) continue;
        expect(ink, `the ${door.label} plate's window was not sampled ${reading.when}`).not.toBeNull();
        // Refuse the reading rather than report it, if the plate crossed the
        // line between the cap being read and the pixels being taken. A guard
        // that trips does not say the build is wrong; it says this particular
        // sample is worthless.
        if (capAfter !== null && cap !== null && cap >= CAP_MIN !== capAfter >= CAP_MIN) continue;
        asserted += 1;
        expect(
          ink!.pixels > 0,
          `the ${door.label} plate ${reading.when} publishes a cap of ${cap} px and its window (${ink!.window}) ` +
            `carries ${ink!.pixels} px of ink over a ground of ${ink!.ground}. The ruling is that the word is ` +
            `painted at ${CAP_MIN} px of cap and above and that below it the plate is lit and says nothing — so ` +
            `${cap! >= CAP_MIN ? "at this cap the word has to be there" : "at this cap there must be no word to find"}.`,
        ).toBe(cap! >= CAP_MIN);
      }
      expect(
        asserted,
        `every reading of the ${door.label} plate was refused. A reading is refused when the plate's cap crossed ` +
          `${CAP_MIN} px between the attribute being read and the pixels being taken — a plate sitting on the ` +
          `line, not a build that is wrong — or, at rest on a door that shears, when its published box is the ` +
          `bounding box of a parallelogram and counting ink in it would be counting the lintel board. Either way ` +
          `this check measured nothing this run.`,
      ).toBeGreaterThan(0);
    });

    // And the published number checked against the picture, because a cap the
    // engine computes and a cap the screen shows are two different claims, and
    // §7's rule is that a stand-in gets checked against the real thing at least
    // once before it is trusted to stand in. The composite reading was itself
    // validated this way: 9 px for POLICIES at 1920, against the reviewer's 8.8
    // measured by hand.
    it(`the ${door.label} plate's published cap agrees with the ink on it`, () => {
      const entry = plate(door.id);
      const cap = capAt(entry.state, door.id);
      if (cap === null || entry.ink === null || entry.ink.pixels === 0) {
        expect(
          { cap, ink: entry.ink },
          `nothing to compare for ${door.label}: the published cap is ${cap} and the window carries ` +
            `${entry.ink?.pixels ?? "no"} pixels of ink. This check is about the two agreeing, and it has no opinion ` +
            `when one of them is missing — the two above are what fail in that case.`,
        ).toMatchObject({ cap: expect.any(Number) });
        return;
      }
      const measured = entry.ink.across;
      const slack = Math.max(3, cap * 0.35);
      expect(
        Math.abs(measured - cap),
        `the ${door.label} plate publishes a cap of ${cap} px and the ink in its window (${entry.ink.window}) reaches ` +
          `${measured} px across the run. The word is turned, so the cap is the across-the-run extent and the two ` +
          `are measuring the same thing from opposite ends — the engine from the projection it drew with, this from ` +
          `the pixels it drew. A number the engine computes and does not paint at is the kind of proxy that passes ` +
          `while the thing it stands for fails.`,
      ).toBeLessThanOrEqual(slack);
    });
  }
});

// ---------------------------------------------------------------------------
// The published readings do not blink
// ---------------------------------------------------------------------------
//
// `engine/types.ts` now says that anything the engine publishes as a
// `data-backlot-*` reading carries two properties or it does not go up: the
// same projection the renderer used, and the same pass that parks the button.
// "Same pass as the parking" means every frame, and that is checkable.
//
// It is here because lane 1 measured it going wrong: the door's rect went
// `null` mid-push for **six frames at 1920 and seventeen at 390** — the phone
// three times worse — while the position lerp ran. Every instrument in this
// file reads rects, so a gap in the middle of a camera move is a hole every
// check here would fall through without noticing. It is fixed; this is what
// stops it coming back silently.
//
// Counted per animation frame from inside the page, which is the only rate that
// can see it: the samples this file takes from Node are 150 ms apart at best,
// and seventeen frames is about a quarter of a second.

describe.each(VIEWPORTS)("what the engine publishes at $name", ({ name }) => {
  const watch = () => approachAt(name, false).watch;

  it("watched frames go by, so a count of zero gaps means something", () => {
    expect(watch(), "the frame watch never reported").not.toBeNull();
    expect(
      watch()!.frames,
      `the watch ran for ${watch()!.frames} frames across the approach and the release. A watch that never ran ` +
        `reports zero gaps, which is the healthy answer and the broken one.`,
    ).toBeGreaterThan(60);
    expect(
      watch()!.seen[CLIP_DOOR.id] ?? 0,
      `the ${CLIP_DOOR.label} door's control published a rectangle on ${watch()!.seen[CLIP_DOOR.id] ?? 0} of ` +
        `${watch()!.frames} frames, so there is nothing to have a gap in.`,
    ).toBeGreaterThan(0);
  });

  // **Scoped to the door being approached, and that scope was measured rather
  // than chosen.** The first version tracked all six and would have failed a
  // correct build: at 390 the camera coming in on one door puts four of the
  // others outside the frame entirely, and their rects came off for 156 of 279
  // frames — 123 seen, 156 gone. That is not a blink, it is a door that is not
  // on screen, and `setRect(null)` is the right answer for it. The door the
  // reader is walking to is the one that has to hold: 279 of 279 frames at 390
  // and 280 of 280 at 1920.
  it("keeps the rectangle of every door it pushes to up for every frame of the push", () => {
    const pushes = [
      { id: CLIP_DOOR.id, label: CLIP_DOOR.label, watch: watch() },
      ...approachAt(name, false).plateWatches,
    ];
    const bad = pushes
      .map((push) => {
        if (!push.watch) return `${push.id}: the watch never reported`;
        const gaps = push.watch.gaps[push.id] ?? 0;
        const seen = push.watch.seen[push.id] ?? 0;
        if (seen === 0) return `${push.id}: published a rectangle on none of ${push.watch.frames} frames`;
        return gaps > 0 ? `${push.id}: missing for ${gaps} of ${push.watch.frames} frames` : null;
      })
      .filter((one): one is string => one !== null);
    expect(
      bad,
      `a door's rectangle went missing while the camera was pushing to it. This is the one lane 1 measured — six ` +
        `consecutive samples at 1920 and seventeen at 390, the phone three times worse, while the position lerp ` +
        `ran. A published reading that is only right when the camera is still is not the promise ` +
        `engine/types.ts makes for it, and every instrument in this file reads these rectangles. Each window ` +
        `tracks only the door being pushed to: at 390 the others leave the frame entirely and dropping their ` +
        `rects is correct — measured at 156 of 279 frames, which is not a blink.`,
    ).toEqual([]);
  });

  // The cap is checked over **all three** plates and not just the approached
  // one, because unlike the rect it does not come off when a door leaves the
  // frame: measured at 390 with the camera in on another door, `people` and
  // `policies` published no rectangle and went on publishing a cap on every one
  // of 279 frames. So there is no on-screen exemption to carve out here, and
  // the scope is every plate.
  it("keeps every nameplate's cap up for the same frames", () => {
    const plates = new Set(PLATE_DOORS.map((door) => door.id));
    const gaps = Object.entries(watch()!.capGaps).filter(([id, count]) => plates.has(id) && count > 0);
    expect(
      gaps.map(([id, count]) => `${id}: ${count} of ${watch()!.frames} frames`),
      `a nameplate's cap went missing while the camera was moving. It is published in the same pass as the ` +
        `rectangle and carries the same promise, so it gets the same check rather than being trusted because the ` +
        `rectangle passed.`,
    ).toEqual([]);
    for (const door of PLATE_DOORS) {
      expect(
        watch()!.capSeen[door.id] ?? 0,
        `the ${door.label} plate published a cap on ${watch()!.capSeen[door.id] ?? 0} of ${watch()!.frames} frames`,
      ).toBe(watch()!.frames);
    }
  });
});

// ---------------------------------------------------------------------------
// Leaving the ring, and refusing the wall
// ---------------------------------------------------------------------------
//
// Two states the hub and the machine room were left in that the corridor had
// already had fixed, and both are about the same thing: something going on
// naming, or going on giving back, what the reader has left.
//
//   L1  Walking out of a ring door's reach. The live region announces once,
//       with a sentence that names no door. `settleRoomDoors` does this for a
//       room's doors and returns before it reaches the ring — it is guarded on
//       a room being mounted — so the hub's departure runs through the door
//       spec's own `onProximity`, which said nothing at all. Driven on the tree
//       this was written against:
//
//         walked to a ring door   near=[lectures] framed=true
//                                 said="At the Lectures door. Press Enter to
//                                 open it."
//         walked out of reach     near=[]         framed=false
//                                 said="At the Lectures door. Press Enter to
//                                 open it."
//         said while leaving: []
//
//       The ring is the first thing every reader sees, and its six doors are
//       doors.
//
//   L2  Esc at the front wall, and the shot not coming back while the reader is
//       still standing at the screen they refused it at. `refusalReach()` takes
//       the reach of the hotspot the **figure** is inside and draws the band
//       around the camera's **framing target**, and for a room that frames a
//       bare point those are two different objects: the front wall's five
//       screens share one shot aimed at the middle of the run, so a reader
//       standing at t1 is 2.23 m from a band 1.1 m wide and the refusal is gone
//       on the next frame. Driven, walking, on the same tree:
//
//         at t4, Escape, one step sideways  -> the camera came straight back in
//         at t3, Escape, one step sideways  -> it stayed out
//
//       Same keys, same step, opposite answers, decided by where on the wall the
//       reader happens to be standing — which is what a band drawn around the
//       wrong point looks like from outside.
//
// **Neither leg walks inside its own assertion.** L1's walk is closed on both
// sides — it reads after every tap and stops on the reading, and running out of
// wall clock lands in a "did not run" flag that is asserted and therefore red.
// L2 does not walk at all once the figure is in place: the reader stands still
// and presses Tab, which asks for the same shot through the keyboard. A step
// sideways would have been the reader's own version of it and it is what I
// drove, but a 0.4 m step against a 1.1 m reach is a walk inside an assertion,
// and this file has paid for one of those already.
//
// **Seen red, both of them, with nothing injected** — they are live defects and
// the reds are the defects themselves — and then re-taken against the fixed
// tree with each fix undone in the built chunk, anchored inside the function it
// breaks and matched exactly once (CLAUDE.md §7: an injection's anchor expires
// more quietly than a check does).
//
//   - L1, and the departure announcement taken back out of the ring door's
//     `onProximity`:
//       ...re(t),r&&L(zf)}  ->  ...re(t)}
//       AssertionError: walking out of lectures's reach said 0 thing(s): []
//       AssertionError: the live region is left saying "Pulled back. Still at
//       the Lectures door. Press Enter to open it." with the figure at no door
//   - L2, and the refusal's band put back on the framing target inside
//     `refusalBand` while keeping the hotspot's reach, which is the pairing the
//     defect was:
//       {from:t.clone(),clear:n}  ->  {from:u.framedTarget?.clone()??t.clone(),clear:n}
//       AssertionError: Escape at play-front-t1, then one Tab onto
//       play-front-t2, and the camera came straight back to the wall:
//       near=[play-front-t1] keyboard=play-front-t2 framed=true said="Pulled
//       back."
//     The second injection is the interesting one to have written down: it
//     changes one of the two fields and leaves the other, which is exactly what
//     the code did before, and it is the smallest thing that can tell this check
//     apart from a check that would pass on any band at all.

/** The five answers this pair turns on, read in one go. */
const LEAVING = String.raw`
  const near = [...document.querySelectorAll('[data-backlot-near="true"]')]
    .map((button) => button.dataset.backlotHotspot);
  const active = document.activeElement;
  const live = document.querySelector("[data-backlot-hud] [aria-live]");
  const hud = document.querySelector("[data-backlot-hud]");
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  return JSON.stringify({
    near,
    keyboard: !active || active === document.body
      ? "<body>"
      : ((active.dataset && active.dataset.backlotHotspot) || active.tagName.toLowerCase()),
    said: live ? (live.textContent || "").replace(/\s+/g, " ").trim() : "",
    framed: hud ? hud.dataset.backlotFramed === "true" : false,
    label: canvas ? canvas.getAttribute("aria-label") : "",
    path: location.pathname,
  });
`;

/** Every sentence the live region says from here on, in order, repeats kept.
 *
 *  "Announces once" is a claim about a count and the resting text cannot tell
 *  one announcement from three. `announce` empties the region before it writes,
 *  so the empties are dropped and every call lands exactly one entry.
 *
 *  **No backticks below.** This is a String.raw template and one closes it
 *  early, which collects zero tests under a summary saying the file passed. */
const SPY = String.raw`
  const live = document.querySelector("[data-backlot-hud] [aria-live]");
  if (!live) return "no live region";
  window.__said = [];
  new MutationObserver(() => {
    const text = (live.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    window.__said.push(text);
  }).observe(live, { childList: true, characterData: true, subtree: true });
  return "watching";
`;

const SINCE = String.raw`
  const all = window.__said || [];
  const from = window.__mark || 0;
  window.__mark = all.length;
  return JSON.stringify(all.slice(from));
`;

interface Reading {
  near: string[];
  keyboard: string;
  said: string;
  framed: boolean;
  label: string | null;
  path: string;
}

const readOut = async (tab: Tab): Promise<Reading> => JSON.parse(await tab.evaluate<string>(LEAVING)) as Reading;
const saidSince = async (tab: Tab): Promise<string[]> => JSON.parse(await tab.evaluate<string>(SINCE)) as string[];
const told = (at: Reading): string =>
  `near=[${at.near.join(", ")}] keyboard=${at.keyboard} framed=${at.framed} said=${JSON.stringify(at.said)}`;

/** A wall-clock budget, because an iteration cap is not one. Running out of it
 *  is not a pass: it lands in the same "did not run" flag an exhausted tap count
 *  does, and that flag is asserted. */
const budget = (milliseconds: number): (() => boolean) => {
  const until = Date.now() + milliseconds;
  return () => Date.now() < until;
};

/** Whether a sentence names any of the six doors, as a reader would hear it. */
const namesADoor = (sentence: string): string[] =>
  DOORS.filter((door) => new RegExp(`\\b${door.label}\\b`, "i").test(sentence)).map((door) => door.id);

interface Ring {
  /** The door the figure walked up to. */
  door: string;
  atTheDoor: Reading;
  afterEsc: Reading;
  /** True once the figure is out of every door's reach. */
  clearOfEveryDoor: boolean;
  away: Reading;
  saidOnLeaving: string[];
  afterEnter: Reading;
  saidOnEnter: string[];
}

interface Wall {
  /** Whether the room, the screen and the push were all reached. */
  ran: boolean;
  why: string;
  atTheScreen: Reading;
  afterEsc: Reading;
  /** Read again after a wait, with nothing touched: the camera must not come
   *  back on its own, or the Tab below proves nothing. */
  stillOut: Reading;
  /** Which control the Tab landed on. */
  tabbedTo: string;
  afterTab: Reading;
}

/**
 * One tab: out to a ring door and away from it, then into the machine room and
 * up to the front wall.
 *
 * Reduced motion throughout, the same branch `backlot-leaving` walks: the
 * camera cuts rather than travels, so a reading is of an arrival rather than of
 * a journey, and Escape with nothing framed is where the fall-through out of a
 * room lives.
 */
async function leavingAndRefusing(): Promise<{ ring: Ring; wall: Wall }> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  try {
    await tab.viewport(1920, 1080);
    await tab.media({ colourScheme: THEME, reducedMotion: true });

    // --- L1, on the ring.
    await tab.goto(`${site.origin}${prefix}backlot/`);
    await tab.evaluate<string>(READY);
    await pause(1200);
    if ((await tab.evaluate<string>(SPY)) !== "watching") throw new Error("the HUD has no live region to watch");

    // Out from the middle until a door has the figure. The ring is 11.5 m out
    // and the doors are 11.5 m apart with a 2.1 m reach, so there is metres of
    // room either side of this — but it is read after every tap all the same,
    // because a stride that is right on a quiet machine is not on a loaded one.
    let at = await readOut(tab);
    const outward = budget(90_000);
    for (let step = 0; step < 24 && outward() && at.near.length === 0; step++) {
      await tab.hold("ArrowUp", 600);
      await pause(400);
      at = await readOut(tab);
    }
    const door = at.near[0] ?? "";
    await pause(1200);
    const atTheDoor = await readOut(tab);

    // Esc first, so this is also the state this round made worse: a live
    // refusal, and the reader walking away from the door it was taken at.
    await tab.press("Escape");
    await pause(1600);
    const afterEsc = await readOut(tab);
    await saidSince(tab);

    const back = budget(90_000);
    for (let step = 0; step < 24 && back() && at.near.length > 0; step++) {
      await tab.hold("ArrowDown", 600);
      await pause(400);
      at = await readOut(tab);
    }
    await pause(1200);
    const away = await readOut(tab);
    const clearOfEveryDoor = away.near.length === 0;
    const saidOnLeaving = await saidSince(tab);

    // Enter, with nothing in the HUD focused and the figure at no door, does
    // nothing at all.
    await tab.evaluate(`document.activeElement && document.activeElement.blur(); return null;`);
    await pause(300);
    await tab.press("Enter");
    await pause(3000);
    const afterEnter = await readOut(tab);
    const saidOnEnter = await saidSince(tab);

    // --- L2, in the machine room. A fresh document: the walk above has left
    // the figure somewhere, and this leg is about a figure that has not moved.
    let ran = false;
    let why = "";
    let tabbedTo = "";
    await tab.goto(`${site.origin}${prefix}backlot/`);
    await tab.evaluate<string>(READY);
    await pause(1200);
    const roomDoor = doorInto(roomNamed("machine-room"));
    // Guarded, and not because a Tab that never lands is acceptable: this drive
    // runs after `walk()` at module scope, so a throw here would take the sixty
    // checks above it down with a message about the keyboard. It lands in the
    // "did not run" flag instead, which is asserted and therefore red on its
    // own terms.
    let screens: string[] = [];
    try {
      await tabTo(tab, roomDoor.id);
      await tab.press("Enter");
      await pause(4500);
      screens = (await tab.evaluate<State>(STATE)).controls
        .filter((one) => !one.hidden && /^play-front-/.test(one.id))
        .map((one) => one.id);
    } catch (error) {
      why = `the machine room was never entered: ${String(error)}`;
    }
    let atTheScreen = await readOut(tab);
    let afterEsc2 = atTheScreen;
    let stillOut = atTheScreen;
    let afterTab = atTheScreen;
    if (screens.length < 2) {
      why = why || `the machine room showed ${screens.length} front-wall screen(s), so there is no wall to refuse`;
    } else {
      try {
        // Enter on the first screen, which walks the figure to that screen's own
        // spot and leaves it there. The placement is the point: a refusal is about
        // where the reader is standing, and this is the only way to put them
        // somewhere known without walking inside the assertion.
        await tabTo(tab, screens[0]!).catch((error: unknown) => {
          why = `the keyboard never reached ${screens[0]}: ${String(error)}`;
          throw error;
        });
        await tab.press("Enter");
        await pause(6000);
        await settleWall(tab);
        atTheScreen = await readOut(tab);
        if (!atTheScreen.framed || !atTheScreen.near.includes(screens[0]!)) {
          why =
            `Enter on ${screens[0]} left the reader at ${told(atTheScreen)} rather than standing at that ` +
            `screen with the camera in`;
        } else {
          await tab.press("Escape");
          await pause(1600);
          afterEsc2 = await readOut(tab);
          // Nothing touched. The camera must not come back on its own, or the Tab
          // below is not what brought it.
          await pause(2500);
          stillOut = await readOut(tab);
          await tab.press("Tab");
          await pause(2500);
          tabbedTo = (await readOut(tab)).keyboard;
          afterTab = await readOut(tab);
          ran = screens.includes(tabbedTo) && tabbedTo !== screens[0];
          if (!ran) {
            why =
              `one Tab from ${screens[0]} put the keyboard on "${tabbedTo}" rather than on another screen ` +
              `sharing the same shot`;
          }
        }
      } catch {
        ran = false;
      }
    }

    return {
      ring: { door, atTheDoor, afterEsc, clearOfEveryDoor, away, saidOnLeaving, afterEnter, saidOnEnter },
      wall: { ran, why, atTheScreen, afterEsc: afterEsc2, stillOut, tabbedTo, afterTab },
    };
  } finally {
    await tab.close();
    await site.close();
  }
}

const { ring: theRing, wall: theWall } = await leavingAndRefusing();

describe("walking out of a ring door's reach", () => {
  it("got the figure to a door and then out of every reach, so the case ran", () => {
    expect(
      theRing.door,
      `the walk out from the middle never reached a door: ${told(theRing.atTheDoor)}. Everything below is about ` +
        `leaving one, so this is reported rather than passed: the case did not run.`,
    ).not.toBe("");
    expect(
      theRing.atTheDoor.framed,
      `the figure reached ${theRing.door} and the camera never came in: ${told(theRing.atTheDoor)}`,
    ).toBe(true);
    expect(
      theRing.clearOfEveryDoor,
      `the walk back never left every door's reach — last reading ${told(theRing.away)}. The case did not run.`,
    ).toBe(true);
  });

  it("says so once, in a sentence that names no door", () => {
    expect(
      theRing.saidOnLeaving,
      `walking out of ${theRing.door}'s reach said ${theRing.saidOnLeaving.length} thing(s): ` +
        `${JSON.stringify(theRing.saidOnLeaving)}. Arrival is announced on the ring and departure was not, so ` +
        `what was left standing is the sentence from the door the reader has walked away from — and with ` +
        `Escape pressed first it is this round's own "still at the Lectures door, press Enter to open it", ` +
        `with nothing near, nothing framed and Enter dead.`,
    ).toHaveLength(1);
    const named = namesADoor(theRing.saidOnLeaving[0] ?? "");
    expect(
      named,
      `the departure sentence is "${theRing.saidOnLeaving[0]}", which names ${named.length} of the ring's six ` +
        `doors. It is said at the moment there is no door to name, and it is said for all six.`,
    ).toEqual([]);
  });

  it("leaves nothing else naming the door either", () => {
    expect(theRing.away.near, `the figure is at no door: ${told(theRing.away)}`).toEqual([]);
    expect(theRing.away.framed, `the camera is still framed on something: ${told(theRing.away)}`).toBe(false);
    expect(
      namesADoor(theRing.away.said),
      `the live region is left saying "${theRing.away.said}" with the figure at no door`,
    ).toEqual([]);
  });

  it("does nothing at all on Enter", () => {
    expect(
      theRing.afterEnter.path,
      `Enter at no door navigated to ${theRing.afterEnter.path}. A window-level Enter goes through the door the ` +
        `figure is standing at, and there is not one.`,
    ).toBe(theRing.away.path);
    expect(
      theRing.saidOnEnter,
      `Enter at no door said ${JSON.stringify(theRing.saidOnEnter)}. Nothing happened, so there is nothing to say.`,
    ).toEqual([]);
  });
});

describe("Esc at the front wall, from a reader who has not moved since", () => {
  it("stood the figure at a screen with the camera in, so the case ran", () => {
    expect(theWall.ran, theWall.why).toBe(true);
    expect(
      theWall.atTheScreen.framed,
      `the camera never came to the wall: ${told(theWall.atTheScreen)}`,
    ).toBe(true);
  });

  it("takes the camera off the wall", () => {
    expect(
      theWall.afterEsc.framed,
      `Escape left the camera framed: ${told(theWall.afterEsc)}`,
    ).toBe(false);
    expect(
      theWall.stillOut.framed,
      `the camera came back on its own, with nothing pressed and the figure standing still: ` +
        `${told(theWall.stillOut)}. Nothing below can tell what brought it back if this is already true.`,
    ).toBe(false);
  });

  it("does not give the same shot back to a reader who has not left the screen they refused it at", () => {
    expect(
      theWall.afterTab.near,
      `the figure moved between the Escape and the Tab: ${told(theWall.afterTab)}. This case is about a reader ` +
        `who has not moved at all, so it did not run.`,
    ).toEqual(theWall.atTheScreen.near);
    expect(
      theWall.afterTab.framed,
      `Escape at ${theWall.atTheScreen.near.join(", ")}, then one Tab onto ${theWall.tabbedTo}, and the camera came ` +
        `straight back to the wall: ${told(theWall.afterTab)}. The five screens share one shot aimed at the ` +
        `middle of the run, so that is the shot the reader has just refused, handed back without them having ` +
        `moved a millimetre. A refusal expires when the figure is out of the reach of the thing it was taken ` +
        `at — and the band has to be drawn around that thing, not around a framing target up to 2 m away ` +
        `from it.`,
    ).toBe(false);
  });
});
