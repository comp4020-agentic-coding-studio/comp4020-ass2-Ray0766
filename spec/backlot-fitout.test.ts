// The A-period fit-out, measured on the composite: what sits on a door's
// window, whether a nameplate is lit, and what the brightest thing in the
// machine room is.
//
// spec/backlot-contrast.test.ts measures the HUD's own controls — their fills,
// their dots, their label ink — and says so at the top: the one thing it does
// not cover is "the button's own fill against the scene behind it", because
// proving that needs a per-pixel search around each control rather than one
// reading. This file is that search, and it exists now because the scene behind
// a control stopped being a surface the palette owns. Three doors have a
// recorded photograph in their window; two more have a workflow graph or a lit
// plate. A picture can be any colour at all, which is the exact case CLAUDE.md
// §7's two-tone focus ring was designed for and the first time anything has
// checked that the design holds.
//
// One reading per point is not enough here and one screenshot is, so the
// composite is decoded whole: `Tab.raster()` takes one `Page.captureScreenshot`
// of the canvas and inflates it, because a 40x40 cell profile of a 1920x923
// canvas is fourteen thousand readings and a protocol round trip apiece is not
// a check anybody runs.
//
// Every reading of the **scene** in this file is taken with the HUD hidden, and
// that is load-bearing rather than tidy. `Page.captureScreenshot` composites the
// page, not the canvas element, and the HUD is DOM sitting on top of it: a pill
// is `--at-bg` and its label is `--at-text`, the darkest and the brightest
// things the palette has. The first version of the plate reading came back with
// `#070504` as the commonest colour in every window and `--at-text` as the
// brightest pixel in every one of them — the pill and its own label, reported as
// the scene. The room's cell ranking had the same flaw from the other side: its
// eight controls are parked over the five screens, so the brightest cells were
// on the front wall partly because the controls are there.
//
// What each of the three things gets asserted about, and why that one:
//
//   a door window   is a picture, so it has no contrast floor of its own. What
//                   has to survive it is the control parked over it — and
//                   specifically the outer tone of that control's focus ring,
//                   which is the only part of the HUD that touches the picture.
//                   backlot-hud.css claims `--at-text` and `--at-bg` bracket
//                   every scene; this is the first surface in the scene that
//                   the palette did not paint, so the claim is checked here.
//   a nameplate     is an image of text. Nothing can read it, so the whole of
//                   its accessible existence is the control's own name, which
//                   is checked exactly against the manifest. The plate itself is
//                   read off the composite inside the rectangle the engine
//                   publishes for the window (`data-backlot-rect`), and the
//                   assertion is that the **three plates agree with each other**
//                   rather than that each clears a floor — a plate is unlit by
//                   construction, so when the ground was wrong it was wrong on
//                   all three at once and a per-door floor would have been green
//                   throughout.
//   the tower light is not text and not a control, so it has no floor to clear.
//                   It is a material somebody chose to paint, and the
//                   constraint on painted materials in that room is a ceiling:
//                   the five screens on the front wall are the brightest thing
//                   and nothing painted may out-shine them. So the assertion is
//                   a ceiling, and it is made over the whole room rather than
//                   over the tower — which catches the tower's strip, the
//                   figure, the chair and anything else painted bright, where a
//                   probe aimed at the tower alone would catch only the tower.
//
// Seen red under a bug apiece; the output is quoted above each describe.

import { describe, expect, it } from "vitest";
import { AA_BODY_TEXT, contrastRatio } from "astro-theme-university/contrast";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import {
  formatHex,
  opaque,
  RESOLVE_COLOUR,
  serveBuild,
  Tab,
  type ColourScheme,
  type Raster,
  type Resolved,
  type Rgb,
} from "./lib/chrome.ts";
import { doorInto, roomNamed } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const doors = backlotManifest.doors;
// Named, not positional: this file ranks the brightness of the machine
// room's own five screens, and `rooms[0]` stopped meaning that room the day a
// second one was added (spec/lib/backlot.ts).
const room = roomNamed("machine-room");

/** WCAG 2.2 SC 1.4.11. A focus ring is a part required to identify a control's
 *  state, so 3:1 against what it sits on is the floor, not a preference. */
const AA_NON_TEXT = 3;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** The cell the room's brightness is ranked in, and the reach that decides
 *  whether a cell is a screen's — both in the contract's units at 1920 and both
 *  scaled with the viewport, because a scene measured in screen pixels is a
 *  different scene at each size.
 *
 *  40 px and 130 px are the contract's own numbers
 *  (receipts/rig-3d/CONTRACT-A2.md), taken at 1920x1080. Carried to 390x844
 *  unscaled they stop measuring the room: a 130 px radius around five controls
 *  on a 390 px canvas covers most of it, so "on the front wall" swallowed the
 *  floor and the ceiling, and the five brightest cells inside it were wall
 *  rather than screen. The check reported a defect at 390 that was its own
 *  instrument — 175 px from a control, which at that size is the far side of the
 *  room. Scaled, the same reading comes out clean: 0 pixels over the wall's own
 *  peak, and the brightest cell that is not a screen at 149.0 against 189.3 for
 *  one that is. */
const cellFor = (width: number) => Math.max(8, Math.round((40 * width) / 1920));

/** How many pixels outside the front wall may be brighter than the brightest
 *  pixel on it before something painted is out-shining the screens. Measured at
 *  1920 in the dark theme: the side wall's recorded photograph of a white coat
 *  puts 4 over the line, and the reviewer's pure-white light bar puts 233 more
 *  on top of them. The gap this has to fall in is two orders of magnitude wide.
 *
 *  The contract grants the photograph as an honest exception — its brightness is
 *  the content's own and not ours to darken — which is exactly why this is a
 *  count and not a peak. */
const OVER_WALL_PIXELS = 50;

/** The same allowance at any viewport. A bright thing covers a fixed fraction of
 *  the picture, so the count of pixels it contributes scales with the picture's
 *  area: the reviewer's light bar is 233 px at 1920 and about a tenth of that at
 *  390. Measured, clean and with the figure's head deliberately blown out to
 *  `--at-text`:
 *
 *    1920x1080   clean 4 over   blown out 149   floor 50
 *    390x844     clean 0 over   blown out  18   floor  3
 *
 *  Three rather than two at the low end, so a single antialiased pixel pair on a
 *  boundary the dilation missed cannot trip it on its own. */
const overFloorFor = (width: number) => Math.max(3, Math.round(OVER_WALL_PIXELS * (width / 1920) ** 2));

/** How much of a published window rect is read, centred. See the table at the
 *  reading itself: the outer band of an axis-aligned box around a sheared pane
 *  is the rim and the leaf, and at 0.70 the plate's own ground stops appearing
 *  inside a photograph's window at all. */
const PANE_KEEP = 0.7;

/** How far the brightest painted cell may move between the first entry into the
 *  machine room and the second. The room is the same room both times, so the
 *  honest answer is "not at all"; the allowance is for the camera arriving from
 *  a different place and the sampler landing on a different half-pixel. Under
 *  the review's injection the same cell moved 110.2 -> 145.3, which is 35. */
const ROOM_DRIFT = 8;

/** How far the figure's own cell may move between the hub before the room and
 *  the hub after coming back. Clean it moves 3.6 (97.0 to 100.6) — the figure
 *  has walked back to the middle but not to the same pixel. With the release
 *  dropped it moves 21.1 the other way (97.0 to 75.9). Eight sits between them
 *  with room on both sides. */
const HUB_DRIFT = 8;

/** How much of a door's published rect has to carry the plate's own ground for
 *  that door to count as showing the same plate. The box is axis-aligned around
 *  a sheared parallelogram, so the share still swings with the door's angle even
 *  inset: measured at 71.7/24.7/30.3 and 71.8/21.5/30.0 at 1920, 37.5/17.2/17.2
 *  and 51.2/12.1/17.6 at 390 — against **0.0%** on every door carrying a
 *  photograph, in all twelve readings.
 *
 *  It stays at 8% against a thinnest plate of 12.1%. It was 8% against 8.7%
 *  before the inset, which is the thinnest thing in this file and was flagged as
 *  such in two receipts; the margin is wider now because the reading stopped
 *  including the frame, not because the line moved. Widening a threshold without
 *  a reason is tuning. */
const PLATE_SHARE_FLOOR = 0.08;

/** A projected rectangle in canvas coordinates, as `data-backlot-rect` gives it. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A hex the sampler produced, back as channels in 0..1. */
const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

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

/** The canvas, and every control the HUD is currently painting.
 *
 *  The name is read from `aria-label` **and** `textContent`: the hotspots carry
 *  theirs as text, not as a label, and a probe that asked for one of the two
 *  would report half the HUD as nameless. */
const HUD = String.raw`
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  if (!canvas) return null;
  const box = canvas.getBoundingClientRect();
  const buttons = [...document.querySelectorAll("[data-backlot-hud] button")]
    .filter((button) => !button.hidden && getComputedStyle(button).display !== "none")
    .map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.dataset.backlotHotspot,
        name: (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim(),
        centre: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
        box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    });
  return {
    canvas: { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) },
    buttons: buttons,
  };
`;

interface Control {
  id: string;
  name: string;
  centre: { x: number; y: number };
  box: { left: number; top: number; width: number; height: number };
}

interface Hud {
  canvas: { left: number; top: number; width: number; height: number };
  buttons: Control[];
}

/** The HUD is DOM sitting on top of the canvas, and `Page.captureScreenshot`
 *  composites the page rather than the canvas element — so any raster of "the
 *  scene" taken with the controls showing is partly a raster of the controls.
 *  It is not a subtle error: a pill is `--at-bg` and its label is `--at-text`,
 *  which are the darkest and the brightest things the palette has. The first
 *  version of the plate reading below came back with `#070504` as the commonest
 *  colour in every window and `--at-text` as the brightest pixel in every one of
 *  them, which is the pill and its own label reported as the scene.
 *
 *  `visibility: hidden` rather than `display: none`: the engine goes on parking
 *  the buttons and publishing their rects, so the geometry stays live while the
 *  pixels stop being the HUD's. */
const HIDE_HUD = String.raw`
  const style = document.createElement("style");
  style.dataset.hideHud = "";
  style.textContent = "[data-backlot-hud]{visibility:hidden!important}";
  document.head.append(style);
  document.activeElement?.blur();
  return null;
`;

/** And off again. `visibility: hidden` is not only a paint state: an element
 *  inside a hidden subtree cannot take focus, so a hidden HUD swallows the
 *  keyboard. Leaving the style on cost the machine room entirely — `focus()` on
 *  the Studio door did nothing, Enter went nowhere, and the room's cell profile
 *  came back as the hub with no front-wall controls in it to measure against. */
const SHOW_HUD = String.raw`
  for (const style of document.querySelectorAll("style[data-hide-hud]")) style.remove();
  return null;
`;

/** Where each door's window actually is, from the engine's own projection.
 *  `Hotspot.setRect` publishes it in canvas coordinates in the same pass that
 *  parks the button, off the same matrix the frame was drawn with. */
const RECTS = String.raw`
  ${RESOLVE_COLOUR}
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  const stage = document.querySelector("[data-backlot-stage]");
  if (!canvas) return null;
  const box = canvas.getBoundingClientRect();
  return {
    canvas: { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) },
    // Read off elements the theme paints rather than off the custom properties:
    // getPropertyValue hands back the raw declaration and a canvas fillStyle it
    // cannot parse leaves the probe on its default, which is opaque black.
    pageGround: resolveColour(getComputedStyle(stage).backgroundColor),
    ink: resolveColour(getComputedStyle(document.body).color),
    // Showing, not merely present. A room's hotspots are in the DOM the whole
    // time the hub is on screen, carrying the hidden attribute — so a probe that
    // waits for one to exist is satisfied by the hub, and a driver that read
    // them reported the hub's six nameplates as the room's pieces, one of them
    // at a 71% modal that was a door plate. The engine takes the rect off a
    // hidden button, so the attribute alone would have covered it here; keying
    // on the engine remembering to is the guard-masked-by-something-else shape
    // this round keeps finding, so the filter is explicit.
    rects: [...document.querySelectorAll("[data-backlot-hud] button[data-backlot-hotspot]")]
      .filter((button) => !button.hidden && getComputedStyle(button).display !== "none")
      .map((button) => ({
        id: button.dataset.backlotHotspot,
        rect: button.dataset.backlotRect || null,
      })),
  };
`;

/** The focused control's ring, as declared. The bands are not computed from
 *  these — §7's rule is to read a run of pixels and accept only one that equals
 *  a declared colour exactly — but the declaration is what a sampled pixel is
 *  matched against, and the run has to start somewhere. */
const RING = String.raw`
  ${RESOLVE_COLOUR}
  const button = document.activeElement;
  if (!button || !button.dataset.backlotHotspot) return null;
  const style = getComputedStyle(button);
  const box = button.getBoundingClientRect();
  return {
    id: button.dataset.backlotHotspot,
    focusVisible: button.matches(":focus-visible"),
    stroke: resolveColour(style.outlineColor),
    inner: resolveColour(getComputedStyle(document.documentElement).getPropertyValue("background-color")),
    background: resolveColour(style.getPropertyValue("--at-bg") || getComputedStyle(document.body).backgroundColor),
    text: resolveColour(getComputedStyle(document.body).color),
    box: { left: box.left, top: box.top, width: box.width, height: box.height },
  };
`;

interface Ring {
  id: string;
  focusVisible: boolean;
  stroke: Resolved;
  inner: Resolved;
  background: Resolved;
  text: Resolved;
  box: { left: number; top: number; width: number; height: number };
}

/** One door, focused, with the run of pixels leading out of its ring. */
interface DoorReading {
  id: string;
  label: string;
  kind: string;
  name: string;
  focusVisible: boolean;
  /** The run, outermost band first, as hex. */
  run: string[];
  /** The outermost pixel that exactly equals the ring's outer tone. */
  outerAt: number | null;
  /** The first scene pixel past the ring: what the ring has to stand out from. */
  scene: Rgb | null;
  sceneHex: string;
  ringOuter: Rgb;
  ringInner: Rgb;
}

/** One door's window, read off the composite inside the rect the engine
 *  publishes for it. */
interface PaneReading {
  id: string;
  kind: string;
  rect: string | null;
  pixels: number;
  /** Every exact colour in the box and how many pixels carry it. */
  counts: Record<string, number>;
  modal: string;
  modalShare: number;
}

interface Rects {
  canvas: { left: number; top: number; width: number; height: number };
  pageGround: Resolved;
  ink: Resolved;
  rects: { id: string; rect: string | null }[];
}

/** One entry into the machine room, measured end to end. */
interface RoomEntry {
  /** 1 for the first entry, 2 for the one after an Escape back to the hub. */
  visit: number;
  cells: { x: number; y: number; mean: number; owner: string; painted: boolean }[];
  /** The brightest cell inside each screen's own published rect: one number per
   *  screen, so "the five screens" is a set rather than a rank. */
  screens: { id: string; mean: number; x: number; y: number }[];
  /** The brightest pixel on a screen, the brightest the room paints, and the
   *  count of painted pixels that beat the first. A cell mean cannot see a small
   *  emissive object; this is what can. */
  peak: { onWall: number; offWall: number; over: number; brightest: { x: number; y: number; luma: number } } | null;
  /** Whether every front-wall screen published a rect on this entry. */
  surfaced: boolean;
  roomRectsMoved: boolean;
  /** Any published box not wholly inside the canvas. Empty is the only
   *  acceptable reading. */
  boxesEscaped: string[];
  /** The ids the room's HUD was showing when the rects were read. */
  showing: string[];
  frontControls: string[];
}

interface Case {
  viewport: string;
  theme: ColourScheme;
  ready: string;
  doors: DoorReading[];
  panes: PaneReading[];
  /** `--at-bg` as the stage paints it, and `--at-text` as the body does. */
  pageGround: string;
  ink: string;
  /** True when the projection moved between reading the rects and sampling
   *  them, which makes every box in this case a box of somewhere else. */
  rectsMoved: boolean;
  /** The plate re-read after the theme was flipped on a painted page, with the
   *  theme it was flipped to. A texture baked once would not move. */
  flipped: { theme: string; id: string; modal: string; pixels: number } | null;
  /** Whether the flip put the page back in the theme this case is about. */
  themeRestored: boolean;
  /** One reading per entry into the machine room. Two of them, because a check
   *  that only looks on the first entry is blind to anything the engine applies
   *  once per page load. */
  entries: RoomEntry[];
  /** Whether the keyboard actually got back out of the room between the two. */
  leftTheRoom: boolean;
  /** The figure's own cell in the hub, before the room and after coming back,
   *  with where the search found it each time. */
  hubBefore: number | null;
  hubAfter: number | null;
  hubBeforeAt: string;
  hubAfterAt: string;
}

/** Walk out from the control's left edge, one whole pixel at a time, and say
 *  which band each pixel is in by matching a declared colour exactly. A fixed
 *  offset reads a blend: `--backlot-x` is a projected coordinate and lands on
 *  fractions, so every band edge sits on a half pixel (CLAUDE.md §7, where this
 *  cost a reported 3.17:1 against a true 5.82:1). */
function readOut(
  raster: Raster,
  canvas: { left: number; top: number },
  box: { left: number; top: number; width: number; height: number },
  outer: Rgb,
  inner: Rgb,
): { run: string[]; outerAt: number | null; scene: Rgb | null } {
  const y = Math.round(box.top + box.height / 2) - canvas.top;
  const run: string[] = [];
  let outerAt: number | null = null;
  let scene: Rgb | null = null;
  const outerHex = formatHex(outer);
  const innerHex = formatHex(inner);
  // 1..14 px out: the ring's declared bands stop at 7, so this leaves room for
  // the composite running a pixel wide and for the scene beyond it.
  for (let step = 1; step <= 14; step++) {
    const x = Math.floor(box.left) - step - canvas.left;
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) break;
    const pixel = raster.at(x, y);
    const hex = formatHex(pixel);
    run.push(hex);
    if (hex === outerHex && outerAt === null) outerAt = step;
    // The scene starts at the first pixel past the outermost band that is
    // neither of the ring's own tones. Refusing anything that equals a declared
    // tone is what keeps an antialiased band edge out of the reading.
    if (outerAt !== null && step > outerAt && hex !== outerHex && hex !== innerHex && scene === null) {
      scene = pixel;
    }
  }
  return { run, outerAt, scene };
}

async function sweep(): Promise<Case[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  const cases: Case[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await tab.viewport(viewport.width, viewport.height);
        // Reduced motion holds the scene still. With the idle camera drifting, a
        // door moves between the reading that picks a sample point and the
        // screenshot that takes it, and every pixel below would be of somewhere
        // else. Colour does not depend on motion.
        await tab.media({ colourScheme: theme, reducedMotion: true });
        await tab.goto(url);
        await tab.evaluate(
          `try { localStorage.setItem("at-theme", ${JSON.stringify(theme)}); } catch {} return null;`,
        );
        await tab.goto(url);
        const ready = await tab.evaluate<string>(READY);

        const readings: DoorReading[] = [];
        const panes: PaneReading[] = [];
        const entries: RoomEntry[] = [];
        let leftTheRoom = true;
        let flipped: Case["flipped"] = null;
        let hubBefore: number | null = null;
        let hubAfter: number | null = null;
        let hubBeforeAt = "";
        let hubAfterAt = "";
        let themeRestored = false;
        let pageGround = "";
        let ink = "";
        let rectsMoved = false;


        if (ready === "ready") {
          // ---- the hub -----------------------------------------------------
          const hub = await tab.evaluate<Hud | null>(HUD);
          if (hub) {
            for (const door of doors) {
              const control = hub.buttons.find((button) => button.id === door.id);
              if (!control) continue;
              await tab.evaluate(
                `document.querySelector('[data-backlot-hotspot="${door.id}"]')?.focus(); return null;`,
              );
              await tab.evaluate(
                "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
              );
              const ring = await tab.evaluate<Ring | null>(RING);
              if (!ring) continue;
              // One screenshot per door rather than one for the hub: focusing
              // moves the camera, so a raster taken before the focus is of a
              // different frame.
              const raster = await tab.raster({
                x: hub.canvas.left,
                y: hub.canvas.top,
                width: hub.canvas.width,
                height: hub.canvas.height,
              });
              const outer = opaque(ring.text, `${door.id}'s outer ring tone`);
              const inner = opaque(ring.background, `${door.id}'s inner ring tone`);
              const { run, outerAt, scene } = readOut(raster, hub.canvas, ring.box, outer, inner);
              readings.push({
                id: door.id,
                label: door.label,
                kind: door.window.kind,
                name: control.name,
                focusVisible: ring.focusVisible,
                run,
                outerAt,
                scene,
                sceneHex: scene ? formatHex(scene) : "",
                ringOuter: outer,
                ringInner: inner,
              });
            }
          }

          /** Find the figure after putting it at the same position and heading.
           *  Keep the sample coordinates: if dimming makes the search find a
           *  different object, its brightness is not a comparable reading. */
          const findFigure = async (): Promise<{ best: number; at: string }> => {
            await tab.evaluate(HIDE_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            // Set both position and heading by walking between two fixed floor
            // points. A 120 ms arrow hold only fixed the heading: the distance
            // depended on how many frames rendered while the key was down.
            // CI sampled (950,451) before the room and (950,467) after on the
            // unchanged site. Floor clicks under reduced motion arrive at the
            // exact target, so neither reading depends on the runner's speed.
            const ground = await tab.evaluate<Rects | null>(RECTS);
            if (!ground) return { best: -1, at: "" };
            for (const depth of [0.60, 0.55]) {
              await tab.click(
                ground.canvas.left + ground.canvas.width * 0.5,
                ground.canvas.top + ground.canvas.height * depth,
              );
              await tab.evaluate(
                "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
              );
            }
            const seen = await tab.evaluate<Rects | null>(RECTS);
            if (!seen) return { best: -1, at: "" };
            const raster = await tab.raster({
              x: seen.canvas.left,
              y: seen.canvas.top,
              width: seen.canvas.width,
              height: seen.canvas.height,
            });
            // The figure shrinks with the viewport. A desktop-sized cell on
            // the phone found the Lectures door's light pool instead of the
            // figure, so the sampling footprint must scale with the scene too.
            const CELL = Math.max(3, Math.round((16 * viewport.width) / 1920));
            const STEP = Math.max(1, Math.round((8 * viewport.width) / 1920));
            let best = -1;
            let at = "";
            const top = Math.round(raster.height * 0.35);
            const bottom = Math.round(raster.height * 0.65);
            const left = Math.round(raster.width * 0.42);
            const right = Math.round(raster.width * 0.58);
            for (let y = top; y + CELL <= bottom; y += STEP) {
              for (let x = left; x + CELL <= right; x += STEP) {
                const mean = raster.meanLuma(x, y, CELL, CELL);
                if (mean > best) {
                  best = mean;
                  at = `(${x},${y})`;
                }
              }
            }
            await tab.evaluate(SHOW_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            return { best, at };
          };

          // ---- the door windows, with the HUD out of the picture -----------
          // A second load rather than a blur: the ring pass above focused six
          // controls in turn and the camera followed each one, so the scene is
          // no longer where it started. This pass focuses nothing, so the hub is
          // at rest and the rects are the resting projection.
          await tab.goto(url);
          await tab.evaluate<string>(READY);
          await tab.evaluate(HIDE_HUD);
          await tab.evaluate(
            "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
          );
          const before = await tab.evaluate<Rects | null>(RECTS);
          if (before) {
            const raster = await tab.raster({
              x: before.canvas.left,
              y: before.canvas.top,
              width: before.canvas.width,
              height: before.canvas.height,
            });
            // The rects are read in the page and the pixels a moment later from
            // Node. If the projection moved in between, every box below is of
            // somewhere else — so they are re-read and the case is failed on the
            // difference rather than quietly reported.
            const after = await tab.evaluate<Rects | null>(RECTS);
            rectsMoved =
              !after ||
              JSON.stringify(before.rects) !== JSON.stringify(after.rects) ||
              JSON.stringify(before.canvas) !== JSON.stringify(after.canvas);
            pageGround = formatHex(opaque(before.pageGround, "the stage's background"));
            ink = formatHex(opaque(before.ink, "the page's ink"));
            for (const door of doors) {
              const entry = before.rects.find((one) => one.id === door.id);
              const reading: PaneReading = {
                id: door.id,
                kind: door.window.kind,
                rect: entry?.rect ?? null,
                pixels: 0,
                counts: {},
                modal: "",
                modalShare: 0,
              };
              if (entry?.rect) {
                const [x, y, width, height] = entry.rect.split(",").map(Number) as [number, number, number, number];
                // Inset before reading, and this is the sheared-box caveat met
                // head on rather than tolerated. The published rect is
                // axis-aligned around a parallelogram, so its outer band is the
                // rim and the leaf rather than the window — and that band is
                // what put the plate's own ground inside a *photograph's* box at
                // 5.0%, against a floor of 8%, which the picture guard below
                // correctly refused to accept as a separation.
                //
                // Measured across the whole box and then inset, 1920 dark:
                //
                //   keep   plates                 pictures
                //   1.00   63.2 / 24.7 / 28.0     0.0 / 5.0 / 3.7
                //   0.90   63.3 / 23.5 / 29.0     0.0 / 3.7 / 3.2
                //   0.80   72.4 / 24.0 / 32.6     0.0 / 2.5 / 2.9
                //   0.70   71.7 / 24.7 / 30.3     0.0 / 0.0 / 0.0
                //
                // At 0.70 every one of the twelve picture readings is 0.0% and
                // the thinnest plate rises from 8.7% to 12.1%. That is a margin
                // bought by cutting out the frame, not by moving the line.
                const keep = PANE_KEEP;
                const insetX = Math.round((width * (1 - keep)) / 2);
                const insetY = Math.round((height * (1 - keep)) / 2);
                const left = Math.max(0, x + insetX);
                const top = Math.max(0, y + insetY);
                const right = Math.min(x + width - insetX, raster.width);
                const bottom = Math.min(y + height - insetY, raster.height);
                const counts = new Map<string, number>();
                for (let row = top; row < bottom; row++) {
                  for (let column = left; column < right; column++) {
                    const hex = formatHex(raster.at(column, row));
                    counts.set(hex, (counts.get(hex) ?? 0) + 1);
                    reading.pixels++;
                  }
                }
                const ranked = [...counts.entries()].sort((one, two) => two[1] - one[1]);
                reading.counts = Object.fromEntries(counts);
                reading.modal = ranked[0]?.[0] ?? "";
                reading.modalShare = reading.pixels ? (ranked[0]?.[1] ?? 0) / reading.pixels : 0;
              }
              panes.push(reading);
            }
          }

          {
            const figure = await findFigure();
            hubBefore = figure.best;
            hubBeforeAt = figure.at;
          }

          const doorway = doorInto(room);
          // ---- the plates, after a live theme flip -------------------------
          //
          // The same question N1 asked of the room, asked of the hub: what here
          // would survive the thing it guards being applied once rather than
          // every time? Every plate reading above is taken on a page **loaded**
          // in its theme, so a plate texture that was baked once and never
          // redrawn would read correctly on both of those runs and be wrong for
          // any reader who touched the toggle. signage.ts says as much in its
          // own opening comment — "a canvas baked once would still be painted in
          // last theme's numbers after the footer toggle" — and nothing checked
          // it.
          //
          // So the theme is flipped on a painted page, through the status bar's
          // own control rather than by writing the attribute, and the plate is
          // read again. What it must do is *change*: the value it changes to is
          // the other theme's, which the other half of this sweep measures.
          {
            await tab.evaluate(SHOW_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            const toggled = await tab.evaluate<string | null>(
              `const button = document.querySelector(".studio-status__theme");
               if (!button) return null;
               button.click();
               return document.documentElement.dataset.theme ?? null;`,
            );
            await pause(1200);
            await tab.evaluate(HIDE_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            const after = await tab.evaluate<Rects | null>(RECTS);
            if (after && toggled) {
              const raster = await tab.raster({
                x: after.canvas.left,
                y: after.canvas.top,
                width: after.canvas.width,
                height: after.canvas.height,
              });
              const plate = doors.find((door) => door.window.kind === "nameplate")!;
              const entry = after.rects.find((item) => item.id === plate.id);
              if (entry?.rect) {
                const [x, y, width, height] = entry.rect.split(",").map(Number) as [number, number, number, number];
                const insetX = Math.round((width * (1 - PANE_KEEP)) / 2);
                const insetY = Math.round((height * (1 - PANE_KEEP)) / 2);
                const counts = new Map<string, number>();
                let total = 0;
                for (let row = Math.max(0, y + insetY); row < Math.min(y + height - insetY, raster.height); row++) {
                  for (let column = Math.max(0, x + insetX); column < Math.min(x + width - insetX, raster.width); column++) {
                    const hex = formatHex(raster.at(column, row));
                    counts.set(hex, (counts.get(hex) ?? 0) + 1);
                    total++;
                  }
                }
                const ranked = [...counts.entries()].sort((one, two) => two[1] - one[1]);
                flipped = { theme: toggled, id: plate.id, modal: ranked[0]?.[0] ?? "", pixels: total };
              }
            }
            // And back, before anything else is measured. The machine room's
            // readings below are theme-scoped and the first version of this left
            // the page in the other theme for them: the brightest painted cell
            // came back as the light theme's page ground at 253.2 with the case
            // still labelled dark. A probe that changes the page has to put it
            // back, and say whether it did.
            await tab.evaluate(SHOW_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            const restored = await tab.evaluate<string | null>(
              `const button = document.querySelector(".studio-status__theme");
               if (!button) return null;
               button.click();
               return document.documentElement.dataset.theme ?? null;`,
            );
            await pause(800);
            themeRestored = restored === theme;
          }

          // ---- the machine room, twice ------------------------------------
          //
          // Twice, and that is the newest shape this round found. Everything
          // below used to run on the **first** entry only. An independent review
          // guarded the room's own exposure so it applied once per page load
          // rather than on every entry, and the whole suite stayed green — 39
          // files, 1490 tests — while driving it by hand gave a first entry at
          // 110.2, an Escape back to the hub, and a second entry at 145.3 with a
          // peak of 190.1. That is the number this file was raised on, walking
          // back in behind a check that only ever looked once.
          //
          // The engine was fine; the instrument looked once. So the room is
          // entered, measured, left by the keyboard the way a reader leaves it,
          // and entered and measured again — and every assertion below runs on
          // both readings rather than on the first.
          for (let visit = 1; visit <= 2; visit += 1) {
            if (visit > 1) {
              // Out the way a reader goes out. `backlot-hotspots` proves at most
              // two presses of Escape leave the room; this asks for the state
              // rather than trusting the count.
              await tab.evaluate(SHOW_HUD);
              await tab.evaluate(
                "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
              );
              for (let press = 0; press < 3; press += 1) {
                const back = await tab.evaluate<boolean>(
                  `return Boolean(document.querySelector('[data-backlot-hotspot="${doorway.id}"]:not([hidden])'));`,
                );
                if (back) break;
                await tab.press("Escape");
                await pause(1200);
              }
              leftTheRoom = await tab.evaluate<boolean>(
                `return Boolean(document.querySelector('[data-backlot-hotspot="${doorway.id}"]:not([hidden])'));`,
              );
              if (!leftTheRoom) break;
            }
            let cells: RoomEntry["cells"] = [];
            let screens: RoomEntry["screens"] = [];
            let peak: RoomEntry["peak"] = null;
            let surfaced = false;
            let roomRectsMoved = false;
            let boxesEscaped: string[] = [];
            let showing: string[] = [];
            let frontControls: string[] = [];

            await tab.evaluate(SHOW_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            // Entered with the keyboard, so the engine's focus hand-over runs the
            // way it does for a reader; a synthetic click skips the browser's own
            // activation behaviour and leaves focus on the body.
            await tab.evaluate(
              `document.querySelector('[data-backlot-hotspot="${doorway.id}"]')?.focus(); return null;`,
            );
            await tab.press("Enter");
            await pause(3000);

            const inside = await tab.evaluate<Hud | null>(HUD);
            const roomRects = await tab.evaluate<Rects | null>(RECTS);
            showing = (roomRects?.rects ?? []).map((entry) => entry.id);
            // Same reason as the pane pass, and it matters more here: the room's
            // eight controls are parked over the five screens and the monitor,
            // and a pill's label is `--at-text` — the brightest thing the palette
            // has. A cell profile taken with the HUD showing would have put the
            // brightest cells on the front wall *because the controls are there*,
            // which is the ranking this file asserts. The style is added after the
            // boxes are read, so the geometry is the live one.
            await tab.evaluate(HIDE_HUD);
            await tab.evaluate(
              "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
            );
            if (inside) {
              const fronts = inside.buttons.filter((button) => button.id.startsWith("play-front-"));
              frontControls = fronts.map((button) => button.id);
              const raster = await tab.raster({
                x: inside.canvas.left,
                y: inside.canvas.top,
                width: inside.canvas.width,
                height: inside.canvas.height,
              });
              const CELL = cellFor(viewport.width);

              // Where the pieces are, from the engine's own projection. Each
              // interactive now carries a `surface` and the engine publishes its
              // projected box, so "this pixel is a screen's" stops being a circle
              // around a control and becomes the rectangle the thing actually
              // occupies. The circle was the last tuned number in this block and
              // it was the reason the room could not be checked at 390 at all: the
              // radius that brackets a 9:16 screen at 1920 is 130 px, which scales
              // to 26 px, and the three brightest cells outside it sat at 27, 29
              // and 35.
              // `setRect` publishes **canvas** pixels and the raster is of the
              // canvas, so the two share an origin and nothing is subtracted. Lane
              // 2 subtracted the canvas origin anyway, moved every box 117 px up,
              // and the monitor's box landed on blank back wall reporting a clean
              // 100% of one colour — which reads exactly like a frame whose
              // texture has not arrived. So a box that is not wholly inside the
              // raster is recorded as an escape rather than clamped into one that
              // parses.
              const escaped: string[] = [];
              const boxOf = (entry: { id: string; rect: string | null }): Box | null => {
                if (!entry.rect) return null;
                const [x, y, width, height] = entry.rect.split(",").map(Number) as [number, number, number, number];
                const box = { left: x, top: y, right: x + width, bottom: y + height };
                if (box.left < 0 || box.top < 0 || box.right > raster.width || box.bottom > raster.height) {
                  escaped.push(`${entry.id} ${entry.rect} outside a ${raster.width}x${raster.height} canvas`);
                }
                return box;
              };
              const rectsById = new Map<string, Box>();
              for (const entry of roomRects?.rects ?? []) {
                const box = boxOf(entry);
                if (box) rectsById.set(entry.id, box);
              }
              // Front wall: the five screens, which are what everything else is
              // measured against. Recorded: every piece the room hangs, front wall
              // and side walls alike. A pixel inside one of those is a photograph
              // and its brightness is the content's own — the exception the
              // contract already grants for the side walls, now drawn by the
              // engine rather than allowed for by a tolerance.
              const screenBoxes = fronts
                .map((front) => rectsById.get(front.id))
                .filter((box): box is Box => Boolean(box));
              const recordedBoxes = [...rectsById.values()];
              const inside_ = (boxes: Box[], px: number, py: number, grow = 0) =>
                boxes.some(
                  (box) =>
                    px >= box.left - grow && px < box.right + grow && py >= box.top - grow && py < box.bottom + grow,
                );
              surfaced = screenBoxes.length === fronts.length && fronts.length > 0;
              boxesEscaped = escaped;
              const onScreen = (px: number, py: number) => inside_(screenBoxes, px, py);
              // Two pixels of slack on the way out. The published box is the
              // piece's own frame mesh projected, and the pixel where it meets
              // what is behind it is a blend of the two — an antialiased edge read
              // as paint is a reading of the picture's boundary, not of anything
              // the room chose.
              const painted = (px: number, py: number) => !inside_(recordedBoxes, px, py, 2);
              // A cell is only paint if it does not touch a picture at all. A
              // centre test is too sharp at this granularity: a 40 px cell whose
              // centre sits 7 px outside a screen's box is half inside it, and the
              // first run of this reported the wall beside t1 at 143.6 as the
              // brightest painted thing in the room when what it had sampled was
              // most of t1.
              const cellTouches = (px: number, py: number, size: number) =>
                recordedBoxes.some(
                  (box) => px < box.right && px + size > box.left && py < box.bottom && py + size > box.top,
                );

              // The per-pixel pass, which is the one that can see a small bright
              // thing. Its threshold is the front wall's own peak in this same
              // frame, so nothing here is a number typed into a spec file.
              let onWall = -1;
              let offWall = -1;
              let brightest = { x: 0, y: 0, luma: -1 };
              for (let row = 0; row < raster.height; row++) {
                for (let column = 0; column < raster.width; column++) {
                  const value = raster.lumaAt(column, row);
                  if (onScreen(column, row)) {
                    if (value > onWall) onWall = value;
                  } else if (painted(column, row) && value > offWall) {
                    offWall = value;
                    brightest = { x: column, y: row, luma: value };
                  }
                }
              }
              let over = 0;
              for (let row = 0; row < raster.height; row++) {
                for (let column = 0; column < raster.width; column++) {
                  if (!painted(column, row)) continue;
                  if (raster.lumaAt(column, row) > onWall) over++;
                }
              }
              peak = { onWall, offWall, over, brightest };

              // Same discipline as the hub's pane pass: the rects were read in the
              // page and the pixels a moment later from Node, so they are re-read
              // and the case is failed on the difference rather than reported as
              // if it were of somewhere. Reduced motion is what makes this hold —
              // lane 1 measured the figure's own cell swinging 27 points under the
              // idle camera's drift, which is more than the margin this block is
              // about.
              const afterRoom = await tab.evaluate<Rects | null>(RECTS);
              roomRectsMoved =
                !afterRoom || JSON.stringify(afterRoom.rects) !== JSON.stringify(roomRects?.rects ?? null);

              // A sliding window, not a fixed grid, and the same window on both
              // sides of the comparison. A grid aligned to the canvas is aligned
              // to nothing in the scene: a screen's rect starts at x=1083 and the
              // first cell that fits wholly inside it starts at 1120, so the grid
              // threw away the brightest part of t4 and reported it at 80.2 where
              // a window on its own rect reads 145.3. Measuring the screens one
              // way and the paint another is a thumb on the scale, so both are
              // measured this way.
              const STEP = Math.max(2, Math.round(CELL / 2));
              const found: RoomEntry["cells"] = [];
              for (let row = 0; row + CELL <= raster.height; row += STEP) {
                for (let column = 0; column + CELL <= raster.width; column += STEP) {
                  // The contract's own arithmetic: a mean of the **encoded** luma,
                  // 0-255. `meanLuminance` linearises, which is a different
                  // ranking — measured on this very scene, the figure sits at rank
                  // 2 of 1104 under the contract's metric and rank 6 under the
                  // linear one, and this block only ever looked at five.
                  const mean = raster.meanLuma(column, row, CELL, CELL);
                  // A cell belongs to a piece if it sits wholly inside it, and
                  // counts as paint only if it touches none. Anything straddling
                  // an edge is neither, and is left out of both comparisons.
                  let owner = "(edge)";
                  for (const [id, box] of rectsById) {
                    if (
                      column >= box.left &&
                      column + CELL <= box.right &&
                      row >= box.top &&
                      row + CELL <= box.bottom
                    ) {
                      owner = id;
                      break;
                    }
                  }
                  const isPainted = !cellTouches(column, row, CELL);
                  if (isPainted) owner = "(painted)";
                  found.push({ x: column, y: row, mean, owner, painted: isPainted });
                }
              }
              found.sort((one, two) => two.mean - one.mean);
              cells = found;

              // One number per screen rather than the top of a list. The engine
              // parks each `play-front-tN` over its own screen, so the brightest
              // cell inside that control's reach is that screen's own.
              screens = fronts.map((front) => {
                let best = { id: front.id, mean: -1, x: 0, y: 0 };
                for (const cell of found) {
                  if (cell.owner !== front.id) continue;
                  if (cell.mean > best.mean) best = { id: front.id, mean: cell.mean, x: cell.x, y: cell.y };
                }
                return best;
              });
            }
            if (visit === 2) {
              // Out, and read the figure again. **Two Escapes, unconditionally**,
              // and then time to walk. The obvious loop — press until the hub's
              // doors are back, then stop — leaves after one press, because the
              // doors return before the figure does: the search then found
              // (806,323) against (950,467) on the way in, which is the figure
              // mid-walk rather than a darker figure. The two presses do
              // different things (spec/backlot-hotspots proves at most two leave
              // the room and says what each did), and `hub.centre` is where the
              // second one sends it.
              await tab.press("Escape");
              await pause(3000);
              await tab.press("Escape");
              await pause(3000);
              const figure = await findFigure();
              hubAfter = figure.best;
              hubAfterAt = figure.at;
            }

            entries.push({
              visit,
              cells,
              screens,
              peak,
              surfaced,
              roomRectsMoved,
              boxesEscaped,
              showing,
              frontControls,
            });
          }
        }

        cases.push({
          viewport: viewport.name,
          theme,
          ready,
          doors: readings,
          panes,
          pageGround,
          ink,
          rectsMoved,
          flipped,
          themeRestored,
          entries,
          leftTheRoom,
          hubBefore,
          hubAfter,
          hubBeforeAt,
          hubAfterAt,
        });
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return cases;
}

const cases = await sweep();
const at = (viewport: string, theme: ColourScheme) =>
  cases.find((one) => one.viewport === viewport && one.theme === theme)!;

// ---------------------------------------------------------------------------
// The island booted. Everything below is about pixels the engine drew.
// ---------------------------------------------------------------------------
describe("the backlot booted before anything was measured", () => {
  for (const one of cases) {
    it(`${one.viewport} in the ${one.theme} theme reached data-backlot-ready`, () => {
      expect(
        one.ready,
        `the island never set data-backlot-ready at ${one.viewport} in the ${one.theme} theme, so nothing ` +
          `below is about a 3D scene. The gallery would still be on screen and still correct.`,
      ).toBe("ready");
    });
  }
});

// ---------------------------------------------------------------------------
// 1. A door window is a picture, and the focus ring has to survive it.
// ---------------------------------------------------------------------------
//
// Seen red by taking the outer tone off the ring. Not in a stylesheet: this
// rule is inlined into the page's own <style> and minified without spaces, so
// the string to replace in dist/backlot/index.html is
// `box-shadow:0 0 0 5px var(--at-bg), 0 0 0 7px var(--at-text)}` with the second
// tone dropped —
// `box-shadow: 0 0 0 5px var(--at-bg)` alone, which is the single-tone ring this
// repo used to have — and reverting:
//
//   AssertionError: no pixel outside the People door's control equals the ring's
//   outer tone #191511. The run outwards was #fffdfa #fffdfa #e2d5c0 #8a5c13
//   #a7854d #fffdfa #fffdfa #fffdfa #fffdfa #fffdfa #fffdfa #fffdfa #fffdfa
//   #fffdfa.: expected null not to be null
//   (25 failed | 50 passed — re-taken on the integrated tree, where the count
//   moved with the file's own growth and the failure did not)
//
// It fails on the structure before it reaches the ratio, and that is the right
// order: with one tone there is no outer band to find, and the run of pixels in
// the message is the evidence — `--at-bg` inside, the gold at #b97d1c, and then
// the scene. The ratio half is what fires when the band is there and the picture
// behind it defeats it.
describe.each(VIEWPORTS)("a door's window at $name", ({ name: viewport }) => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    it("measured every door", () => {
      expect(
        at(viewport, theme).doors.map((reading) => reading.id),
        "the hub did not paint a control for every door, so some window went unchecked",
      ).toEqual(doors.map((door) => door.id));
    });

    for (const door of doors) {
      it(`the ${door.label} door's ring stands out from what is behind it`, () => {
        const reading = at(viewport, theme).doors.find((one) => one.id === door.id);
        expect(reading, `no reading for the ${door.label} door`).toBeDefined();
        expect(reading!.focusVisible, `the ${door.label} door's control did not take a visible focus`).toBe(true);
        expect(
          reading!.outerAt,
          `no pixel outside the ${door.label} door's control equals the ring's outer tone ` +
            `${formatHex(reading!.ringOuter)}. The run outwards was ${reading!.run.join(" ")}.`,
        ).not.toBeNull();
        expect(
          reading!.scene,
          `the run outwards from the ${door.label} door's control never left the ring: ${reading!.run.join(" ")}`,
        ).not.toBeNull();

        // Two tones, and the claim is that between them they cover every scene.
        // So the ring passes if *either* stands out — which is the whole of why
        // there are two (CLAUDE.md §7: the gold and --at-bg leave a window of
        // scene luminances that defeat both, and --at-text closes it).
        const outer = contrastRatio(reading!.ringOuter, reading!.scene!);
        const inner = contrastRatio(reading!.ringInner, reading!.scene!);
        const best = Math.max(outer, inner);
        expect(
          best,
          `the ${door.label} door's ring paints ${formatHex(reading!.ringOuter)} outside and ` +
            `${formatHex(reading!.ringInner)} inside against a scene pixel of ${reading!.sceneHex} — ` +
            `${outer.toFixed(2)}:1 and ${inner.toFixed(2)}:1, and an indicator needs ${AA_NON_TEXT}:1. ` +
            `A door window is a picture, which is the surface the two-tone ring exists for (CLAUDE.md §7).`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. A nameplate is an image of text.
// ---------------------------------------------------------------------------
//
// Two halves, and they are different kinds of claim.
//
// The **name** is exact and needs no pixels: a word drawn into a texture has no
// text alternative in the canvas, so the control's accessible name is the whole
// of its readable existence, and it has to be the nav's own word.
//
// The **plate** is read off the composite, inside the rectangle the engine
// publishes for each door's window (`Hotspot.setRect` in engine/types.ts,
// `data-backlot-rect` on the button). That rect has a caveat and the whole
// shape of this block follows from it: it is an **axis-aligned bounding box**,
// and four of the six windows project as sheared parallelograms, so for those
// four the box is roughly half door leaf. The share of each box that is
// actually plate, measured: assessments 60%, policies 18%, people 13%. So:
//
//   - the ground is the **commonest exact colour** in the box, never an extreme
//     and never a corner. A worst-case hunt inside that box finds the door
//     frame and reports it as the plate.
//   - the plate that stands square on to the camera is the reference, because
//     its box is mostly plate. The other two are checked by **containing** that
//     same colour rather than by being dominated by it, which is what survives
//     the shear: measured at 64/18/25% (1920 dark), 61/17/20% (1920 light),
//     34/12/12% (390 dark) and 37/9/9% (390 light), against **0.0%** in all six
//     readings of the three doors carrying a photograph.
//
// That last column is why this is a check rather than a formality: the colour
// separates plates from pictures completely.
//
// **The three plates agreeing is the assertion, not each of them clearing a
// floor.** A plate is a texture on a MeshBasicMaterial and nothing in the scene
// lights one, so all three are the same luminance by construction — and when
// that luminance was wrong it was wrong on all three at once. A check that only
// asked "is each plate lit" would have been green through the whole of it.
//
// The ink is the one number here that is **not** a composite reading, and it is
// labelled rather than smuggled. At 1920 the square-on plate is 76x64 px on
// screen and its word a few pixels of cap; no pixel of the type reaches the
// declared ink, so an "ink" picked off the composite is a measurement of
// antialiasing. Measured, so the claim is not a shrug: the darkest pixel inside
// the plate reaches 0.281 relative luminance in the light theme against a
// declared 0.008. So the ground is measured and the ink is the page's own
// resolved `--at-text`, read off the body rather than parsed out of a custom
// property, and the ratio between them is the number.
//
// Seen red three times, each by patching the plate's own wash in the built
// bundle (`ctx.globalAlpha = PLATE_WASH` before the brand fill) and reverting.
// The output is quoted above each assertion.
//
// All three injections have to be **anchored inside `nameplate()`**, and that is
// a lesson about injections rather than about plates. Lane 1's sign over the
// lintel uses the same recipe — `--at-bg`, then `--at-primary` at PLATE_WASH —
// and there are three draw sites using it in the bundle. The board's sits a few
// hundred bytes *before* `nameplate()` begins, and the gap has moved with every
// build: 489 bytes one day, 477 the next. So the instruction is "find the index
// of `nameplate(e,t)` and search forward from there", never "find the first
// match in the file" — which patched the sign and left the plate untouched. Two of the three reds
// quietly stopped reproducing. The minified name of the uppercased label moved
// from `s` to `o` between builds for the same reason, which turned the third
// injection into a no-op that read as a check gone blind. An injection harness
// that matches a bare pattern in a file is fed by whatever else is in the file,
// exactly as a check that matches a bare substring of source is — and the only
// reason it was caught is that reds get re-taken after the tree moves.
describe("a door's nameplate", () => {
  const nameplates = doors.filter((door) => door.window.kind === "nameplate");
  const pictures = doors.filter((door) => door.window.kind !== "nameplate");

  it("is what the manifest says it is", () => {
    expect(nameplates.length, "no door has a nameplate, so this block is about nothing").toBeGreaterThan(0);
    expect(pictures.length, "no door has a picture, so there is nothing to compare a plate against").toBeGreaterThan(
      0,
    );
  });

  describe.each(VIEWPORTS)("at $name", ({ name: viewport }) => {
    describe.each(THEMES)("in the %s theme", (theme) => {
      const one = () => at(viewport, theme);
      const pane = (id: string) => one().panes.find((reading) => reading.id === id);
      /** The door that stands square on to the camera, so its box is mostly
       *  window rather than leaf. Chosen by measurement, not by name: it is the
       *  plate whose commonest colour holds the largest share of its own box. */
      const reference = () =>
        nameplates
          .map((door) => pane(door.id))
          .filter((reading): reading is PaneReading => Boolean(reading && reading.pixels > 0))
          .reduce((best, reading) => (reading.modalShare > best.modalShare ? reading : best));

      for (const door of nameplates) {
        it(`the ${door.label} door carries its own name on the control`, () => {
          const reading = one().doors.find((entry) => entry.id === door.id);
          expect(reading, `no reading for the ${door.label} door`).toBeDefined();
          expect(
            reading!.name,
            `the ${door.label} door's control is named "${reading!.name}", which does not carry the word its ` +
              `nameplate paints. A nameplate is an image of text and the control's name is its only reading.`,
          ).toContain(door.label);
        });
      }

      it("published a window rectangle for every door", () => {
        // The handle everything below stands on. Without it there is no way to
        // tell a plate from the leaf around it, and this block would be reading
        // whatever the box happened to contain.
        for (const door of doors) {
          const reading = pane(door.id);
          expect(reading, `no pane reading for the ${door.label} door`).toBeDefined();
          expect(
            reading!.rect,
            `the ${door.label} door published no data-backlot-rect, so its window cannot be found on screen`,
          ).not.toBeNull();
          expect(reading!.pixels, `the ${door.label} door's published rect covers no pixels`).toBeGreaterThan(50);
        }
      });

      // Watched executing rather than reasoned about, because a branch nobody
      // has seen run is a comment (CLAUDE.md §7). Driving the same sweep with
      // `reducedMotion: false` turns the idle camera back on and three of the
      // four cases fail here:
      //
      //   AssertionError: the projection moved between the rects being read and
      //   the pixels being sampled, so every box in this case is a box of
      //   somewhere else: expected true to be false
      //   (3 failed | 70 passed)
      //
      // Which is also the evidence for the reduced motion every reading in this
      // file is taken under: without it, three quarters of the plate readings
      // would be of a door that had moved.
      it("held still between reading the rectangles and sampling them", () => {
        expect(
          one().rectsMoved,
          "the projection moved between the rects being read and the pixels being sampled, so every box in " +
            "this case is a box of somewhere else",
        ).toBe(false);
      });

      // Seen red by dropping the plate's wash in the built bundle
      // (`ctx.globalAlpha = PLATE_WASH` to `= 0`), which is the state that
      // shipped before lane 1 fixed it and which this file was written to catch
      // — 8 failed | 65 passed:
      //
      //   AssertionError: the plate paints #070504, which is the page's own
      //   background #070504. A plate painted in the page's ground is a hole
      //   with writing on it, not a sign — and it is that on all three doors at
      //   once, which is why this is checked as the plates agreeing rather than
      //   as each of them clearing a floor.: expected '#070504' not to be
      //   '#070504'
      //   (8 failed | 67 passed)
      //
      // The picture guard below fires on the same injection and says something
      // the first message does not: "the Studio door carries a picture and 20.9%
      // of its window is #070504, the plate's own ground". A plate painted in
      // the page's ground stops being a colour that distinguishes a plate from
      // a photograph at all, and the check notices that it has lost its own
      // instrument rather than reporting a pass.
      it("paints its plate in something other than the page's own ground", () => {
        const plate = reference();
        expect(
          plate.modal,
          `the plate paints ${plate.modal}, which is the page's own background ${one().pageGround}. A plate ` +
            `painted in the page's ground is a hole with writing on it, not a sign — and it is that on all ` +
            `three doors at once, which is why this is checked as the plates agreeing rather than as each of ` +
            `them clearing a floor.`,
        ).not.toBe(one().pageGround);
      });

      // Seen red by making the wash depend on the word, so one plate is drawn
      // differently from the others (`globalAlpha = word[0] === "P" ? 0.05 :
      // PLATE_WASH`) — 4 failed | 69 passed:
      //
      //   AssertionError: the People door's window carries 3.0% of #573b0f, the
      //   ground the square-on plate reads. The three plates are the same
      //   texture under no light at all, so they agree or something is wrong
      //   with one of them. Plates: assessments 71.7%, people 3.0%, policies
      //   0.0%. Pictures: lectures 0.0%, sessions 0.0%, studio 0.0%.: expected
      //   0.030379746835443037 to be greater than or equal to 0.08
      //   (4 failed | 71 passed)
      //
      // And the square-on plate went on passing every other assertion in this
      // block throughout, at 64.2% of its own box — which is the case for
      // checking the three against each other rather than each against a floor.
      it("paints the same plate on all three doors, and on no door carrying a picture", () => {
        const plate = reference();
        const sheet = (list: typeof doors) =>
          list
            .map((door) => {
              const reading = pane(door.id)!;
              const share = ((reading.counts[plate.modal] ?? 0) / Math.max(1, reading.pixels)) * 100;
              return `${door.id} ${share.toFixed(1)}%`;
            })
            .join(", ");

        for (const door of nameplates) {
          const reading = pane(door.id)!;
          const share = (reading.counts[plate.modal] ?? 0) / Math.max(1, reading.pixels);
          expect(
            share,
            `the ${door.label} door's window carries ${(share * 100).toFixed(1)}% of ${plate.modal}, the ` +
              `ground the square-on plate reads. The three plates are the same texture under no light at ` +
              `all, so they agree or something is wrong with one of them. Plates: ${sheet(nameplates)}. ` +
              `Pictures: ${sheet(pictures)}.`,
          ).toBeGreaterThanOrEqual(PLATE_SHARE_FLOOR);
        }

        for (const door of pictures) {
          const reading = pane(door.id)!;
          const share = (reading.counts[plate.modal] ?? 0) / Math.max(1, reading.pixels);
          // The other half of the same fact, and the half that makes the first
          // one worth having: if the plate's ground were a colour the whole
          // scene is full of, every door would pass the floor above.
          expect(
            share,
            `the ${door.label} door carries a picture and ${(share * 100).toFixed(1)}% of its window is ` +
              `${plate.modal}, the plate's own ground — so that colour does not distinguish a plate from a ` +
              `photograph and the check above is measuring the scene. Pictures: ${sheet(pictures)}.`,
          ).toBeLessThan(PLATE_SHARE_FLOOR / 4);
        }
      });

      // Seen red by pushing the plate's wash to 0.95 in the built bundle, which
      // takes the ground most of the way to the brand fill and leaves the ink on
      // top of it — 2 failed | 73 passed:
      //
      //   AssertionError: the nameplate's ink #f0eeeb on its measured ground
      //   #b0771b is 3.30:1, and AA body text needs 4.5:1. The ground is a
      //   reading off the composite; the ink is the page's own --at-text,
      //   because at this size no pixel of the word reaches it.: expected
      //   3.296835186713063 to be greater than or equal to 4.5
      it("clears AA body text with the page's own ink on that plate", () => {
        const plate = reference();
        const ground = hexToRgb(plate.modal);
        const ink = hexToRgb(one().ink);
        const ratio = contrastRatio(ink, ground);
        expect(
          ratio,
          `the nameplate's ink ${one().ink} on its measured ground ${plate.modal} is ${ratio.toFixed(2)}:1, ` +
            `and AA body text needs ${AA_BODY_TEXT}:1. The ground is a reading off the composite; the ink is ` +
            `the page's own --at-text, because at this size no pixel of the word reaches it.`,
        ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
      });
    });
  });

  // Seen red by baking the plate's texture once — the signwriter's redraw
  // callback replaced with a no-op in the built bundle, anchored on the shape
  // rather than on a name — so the plate keeps the theme it was first drawn in:
  //
  //   AssertionError: the Assessment plate reads #573b0f before the theme was
  //   flipped to light and #573b0f after. A plate is a canvas texture and
  //   signage.ts redraws it on a theme change; one that does not is painted in
  //   last theme's numbers for every reader who touches the toggle.
  it("redraws its plate when the theme is flipped on a painted page", () => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const one = at(viewport.name, theme);
        expect(
          one.flipped,
          `the theme was never flipped on a painted page at ${viewport.name} in the ${theme} theme, so the ` +
            `redraw was not tested`,
        ).not.toBeNull();
        expect(
          one.flipped!.theme,
          `the status bar's toggle did not change the theme at ${viewport.name}`,
        ).not.toBe(theme);
        expect(
          one.themeRestored,
          `the theme was not put back to ${theme} after the flip at ${viewport.name}, so every reading taken ` +
            `after it is of the other theme`,
        ).toBe(true);
        expect(
          one.flipped!.pixels,
          `the plate's window covered no pixels after the flip at ${viewport.name}`,
        ).toBeGreaterThan(50);

        const before = one.panes.find((pane) => pane.id === one.flipped!.id)!;
        expect(
          one.flipped!.modal,
          `the ${one.flipped!.id} plate reads ${before.modal} before the theme was flipped to ` +
            `${one.flipped!.theme} and ${one.flipped!.modal} after. A plate is a canvas texture and signage.ts ` +
            `redraws it on a theme change; one that does not is painted in last theme's numbers for every ` +
            `reader who touches the toggle.`,
        ).not.toBe(before.modal);
        // And it lands on the other theme's plate, not on some third colour.
        const other = at(viewport.name, theme === "dark" ? "light" : "dark");
        const otherPlate = other.panes.find((pane) => pane.id === one.flipped!.id)!;
        expect(
          one.flipped!.modal,
          `the plate redrew to ${one.flipped!.modal}, where a page loaded in the ${one.flipped!.theme} theme ` +
            `reads ${otherPlate.modal}`,
        ).toBe(otherPlate.modal);
      }
    }
  });

  it("reads the same plate at both viewports, in each theme", () => {
    // A plate is unlit and its texture is drawn at a size in metres, so the
    // viewport cannot change its colour. If it does, something is lighting a
    // plate or drawing it from a different token at one size.
    for (const theme of THEMES) {
      const grounds = VIEWPORTS.map((viewport) => {
        const one = at(viewport.name, theme);
        const best = one.panes
          .filter((reading) => reading.kind === "nameplate" && reading.pixels > 0)
          .reduce((first, second) => (second.modalShare > first.modalShare ? second : first));
        return `${viewport.name}: ${best.modal}`;
      });
      expect(
        grounds[0]!.split(": ")[1],
        `the plate reads a different colour at each viewport in the ${theme} theme — ${grounds.join(", ")}. ` +
          `Nothing in the scene lights a plate, so nothing about the viewport should change it.`,
      ).toBe(grounds[1]!.split(": ")[1]);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The tower's light, asserted as a ceiling over the whole room.
// ---------------------------------------------------------------------------
//
// The tower's light is not text and it is not a control, so it has no contrast
// floor of its own to clear. It is a material somebody chose to paint, and the
// constraint on painted materials in that room is a **ceiling**: the five
// screens on the front wall are the brightest thing and nothing painted may
// out-shine them. So the assertion is a ceiling — and it is made over the whole
// room rather than over the tower, which catches the tower's strip, the figure,
// the chair and anything else painted bright, where a probe aimed at the tower
// alone would catch only the tower. It also needs no rectangle: the room's
// screens and its monitor are not wired to `trackSurface` and this does not ask
// them to be.
//
// Scoped to the **dark theme**, deliberately and not for convenience. "The
// brightest thing in the room is the five screens" is a sentence about the dark
// theme: in the light theme the brightest pixels inside the canvas are the page
// ground showing through outside the room's geometry — measured at a mean of
// 251.0 of 255 across the whole top row of cells, and at 253.2 at the canvas's
// own left edge — and it is the brightest thing on screen by construction. A
// check that ran the ranking there could not go red, which CLAUDE.md §7 counts
// as worse than no check. The contract's own reading was taken at 1920 dark for
// the same reason.
//
// Every reading here is taken with the HUD hidden, and that is not tidiness
// either. The room's eight controls are parked over the five screens and the
// monitor, and a pill's label is `--at-text`, the brightest thing the palette
// has. With the HUD showing, the brightest cells were on the front wall partly
// *because the controls are there* — a check that would have passed for the
// wrong reason, which is the shape this repo keeps finding.
//
// Both instruments below have now been red at **both** viewports, under three
// injections between them:
//
//   the figure's head back on `--at-text`         4 failed | 71 passed
//     1920  the brightest cell that is not a piece, 195.5 against a median of
//           113.5, and 149 pixels over the screens' own peak
//     390   the same cell, 222.6 against 163.6, and 18 pixels over
//
//   the tower's light bar at `screenLight` full   1 failed | 74 passed
//     1920  185 pixels over the screens' peak of 251.3, brightest 255.0 at
//           (1081, 743) — a 5 x 48 px strip that moved no cell mean at all
//     390   nothing: the strip is about 1 x 10 there and does not clear the
//           screens' own peak, which is why 390's copy of that assertion is
//           proved by the figure instead
//
//   the room handing in no surfaces               5 failed | 70 passed
//     both  no rectangle for any screen, so the region test has nothing behind
//           it and says so rather than falling back to a circle
//
// And one injection that did **not** go red, which is worth more than most that
// did: the tower's interior light raised to intensity 14 with its 0.8 m distance
// left alone moved nothing anywhere. That was a bug the page never had, and the
// only way to find it out was to watch it stay green.
//
// Anchored on `1.4,.8,1.6`, which occurs once in the bundle, rather than on
// `PointLight`, which occurs 34 times. Every instruction in this file is
// anchored on a shape for the same reason: a red that cannot be reproduced from
// its own description is a red nobody after me can confirm, and re-taking it
// from a stale name produces a green run that reads like a blind check.
/** Both entries into the room, at one viewport, in the dark theme. */
const roomEntries = (viewport: string) => at(viewport, "dark").entries;

describe("the brightest thing in the machine room is the front wall", () => {
  it("was entered twice, and left in between", () => {
    // The scope of everything below, and the thing the review's injection was
    // invisible to. A run that only ever entered once would leave every
    // assertion here true of the first entry and silent about the second.
    for (const viewport of VIEWPORTS) {
      const one = at(viewport.name, "dark");
      expect(
        one.leftTheRoom,
        `the keyboard never got back out of the machine room at ${viewport.name}, so the second reading is of ` +
          `the same visit as the first`,
      ).toBe(true);
      expect(
        one.entries.map((entry) => entry.visit),
        `the machine room was measured ${one.entries.length} time(s) at ${viewport.name}`,
      ).toEqual([1, 2]);
    }
  });

  for (const viewport of VIEWPORTS) {
    for (const visit of [1, 2]) {
      const label = visit === 1 ? "first entry" : "second entry, after an Escape back to the hub";

      it(`found the room, its five screens and a profile to rank — ${label}, ${viewport.name}`, () => {
        const entry = roomEntries(viewport.name)[visit - 1]!;
        expect(
          entry.frontControls,
          `the room did not paint a control for every front-wall screen on the ${label} at ${viewport.name}`,
        ).toEqual(room.interactives.filter((item) => item.id.startsWith("play-front-")).map((item) => item.id));
        expect(
          entry.cells.length,
          `the room's cell profile on the ${label} at ${viewport.name} is empty`,
        ).toBeGreaterThan(100);
      });

      // Seen red by stopping the room handing its pieces' surfaces to the
      // hotspots — the `{surface:…}` spread removed from the built bundle,
      // matched on its shape rather than on a minified name:
      //
      //   AssertionError: the machine room published no rectangle for at least
      //   one front-wall screen at desktop 1920×1080, so "this pixel is a
      //   screen's" has nothing behind it.: expected false to be true
      it(`has a published rectangle for every screen — ${label}, ${viewport.name}`, () => {
        const entry = roomEntries(viewport.name)[visit - 1]!;
        expect(
          entry.roomRectsMoved,
          `the projection moved between the rects being read and the pixels being sampled on the ${label} at ` +
            `${viewport.name}, so every region below is a region of somewhere else`,
        ).toBe(false);
        expect(
          entry.boxesEscaped,
          `a published rectangle fell outside the canvas on the ${label} at ${viewport.name}`,
        ).toEqual([]);
        // Showing, not present: every room hotspot is in the DOM while the hub
        // is on screen, so "the five screens are here" is satisfied by the hub
        // unless it asks whether they are painted.
        expect(
          entry.showing.filter((id) => id.startsWith("play-front-")).sort(),
          `the machine room was not showing its five front-wall controls when the rects were read on the ` +
            `${label} at ${viewport.name} — it was showing ${entry.showing.join(", ")}.`,
        ).toEqual(room.interactives.filter((item) => item.id.startsWith("play-front-")).map((item) => item.id));
        expect(
          entry.surfaced,
          `the machine room published no rectangle for at least one front-wall screen on the ${label} at ` +
            `${viewport.name}, so "this pixel is a screen's" has nothing behind it.`,
        ).toBe(true);
      });

      it(`keeps everything painted below the middle of the five — ${label}, ${viewport.name}`, () => {
        const entry = roomEntries(viewport.name)[visit - 1]!;
        const ranked = [...entry.screens].sort((first, second) => first.mean - second.mean);
        const middle = ranked[Math.floor(ranked.length / 2)]!;
        const paintedCells = entry.cells.filter((cell) => cell.painted);
        expect(paintedCells.length, "every cell belongs to a piece, so there is nothing painted").toBeGreaterThan(0);
        const other = paintedCells[0]!;
        expect(
          other.mean,
          `on the ${label} at ${viewport.name}, the brightest ${cellFor(viewport.width)}px cell of the machine ` +
            `room that is not a piece sits at (${other.x}, ${other.y}) of the canvas at a mean luma of ` +
            `${other.mean.toFixed(1)} — against ${middle.mean.toFixed(1)} for the middle of the five screens ` +
            `(${middle.id}). The five screens on the front wall are the brightest thing in this room and ` +
            `nothing painted may out-shine them. All five: ` +
            `${entry.screens.map((screen) => `${screen.id.replace("play-front-", "")} ${screen.mean.toFixed(1)}`).join(", ")}.`,
        ).toBeLessThan(middle.mean);
      });

      it(`has nothing small and painted out-shining the screens — ${label}, ${viewport.name}`, () => {
        const entry = roomEntries(viewport.name)[visit - 1]!;
        expect(entry.peak, `no per-pixel reading on the ${label} at ${viewport.name}`).not.toBeNull();
        expect(entry.peak!.onWall, "no pixel was found on a screen").toBeGreaterThan(0);
        expect(
          entry.peak!.over,
          `on the ${label} at ${viewport.name}, ${entry.peak!.over} pixels that the machine room paints are ` +
            `brighter than the brightest pixel on a screen (${entry.peak!.onWall.toFixed(1)}), the brightest ` +
            `of them ${entry.peak!.offWall.toFixed(1)} at (${entry.peak!.brightest.x}, ` +
            `${entry.peak!.brightest.y}) of the canvas.`,
        ).toBeLessThan(overFloorFor(viewport.width));
      });
    }
  }

  // The hub is the same hub after the room as before it.
  //
  // The engine borrows the figure's exposure on the way in and releases it on
  // the way out, and the release runs on every exit — so a release guarded to
  // fire once per page load leaves the figure dark for the rest of the session.
  // Nothing here saw it: the whole suite passed 1514 of 1514 with
  // `setExposure(1)` deleted.
  //
  // A whole-room peak finds a door's light pool, which player.setExposure
  // never changes. Search the middle band instead, with the figure placed at
  // the same position and heading before each capture. The cell is 16 px at
  // desktop and scales down to 3 px on the phone; keeping it at 16 px there
  // included so much background that the search found the Lectures light pool.
  //
  // Seen red on both viewports with the hub's setExposure(1) call removed:
  // desktop (950,483), 58.2 -> (942,491), 47.1;
  // phone   (192,371), 76.8 -> (194,245), 73.5.
  // The changed coordinates reject the substituted object before comparing
  // brightness. On the clean build all 91 checks pass; with this injection
  // these two fail and the other 89 pass. Neither threshold was changed.
  for (const viewport of VIEWPORTS) {
    it(`gives the hub back as it found it, at ${viewport.name}`, () => {
      const one = at(viewport.name, "dark");
      expect(one.hubBefore, `the figure was not found in the hub before the room at ${viewport.name}`).not.toBeNull();
      expect(one.hubAfter, `the figure was not found in the hub after the room at ${viewport.name}`).not.toBeNull();
      // The same object twice, not two bright things. If the search lands
      // somewhere else on the second reading it has found something else and
      // the numbers are not comparable.
      expect(
        one.hubAfterAt,
        // The numbers go in this message as well as in the drift one below,
        // because this is the assertion that actually fires when the exposure
        // is never released: a figure that has gone dark stops being the
        // brightest thing in the band, so the search lands somewhere else and
        // the guard trips before the comparison it guards ever runs. Taken
        // under that injection it read "(950,467) before and (942,491) after"
        // and said nothing about brightness, which is the whole finding.
        `the figure was found at ${one.hubBeforeAt} before the room and ${one.hubAfterAt} after, so the two ` +
          `readings are not of the same thing — ${one.hubBefore?.toFixed(1)} against ` +
          `${one.hubAfter?.toFixed(1)}. Both readings are taken after the same two floor targets, so the figure is ` +
          `in the same pose for both; if it has moved, the likeliest reason is that it is no longer the ` +
          `brightest thing in the middle of the ring, which is what the room failing to give its exposure ` +
          `back looks like.`,
      ).toBe(one.hubBeforeAt);
      const drift = Math.abs(one.hubAfter! - one.hubBefore!);
      expect(
        drift,
        `the hub's figure reads ${one.hubBefore!.toFixed(1)} before the machine room and ` +
          `${one.hubAfter!.toFixed(1)} after coming back out, ${drift.toFixed(1)} apart, both found at ` +
          `${one.hubBeforeAt}. The room borrows the figure's exposure on the way in and gives it back on the ` +
          `way out; a release that runs once per page load leaves the figure dark for the rest of the ` +
          `session and nothing on the page says so.`,
      ).toBeLessThan(HUB_DRIFT);
    });
  }

  // And the two entries agree with each other, which is the assertion the
  // review's injection was aimed at and the one no per-entry threshold can make.
  // A room whose exposure is applied once per page load reads correctly the
  // first time and wrong every time after; comparing the two says so without
  // needing to know what the right number is.
  for (const viewport of VIEWPORTS) {
    it(`reads the same room on the way back in, at ${viewport.name}`, () => {
      const [first, second] = roomEntries(viewport.name);
      expect(first && second, "both entries are needed to compare them").toBeTruthy();
      const brightest = (entry: RoomEntry) => entry.cells.filter((cell) => cell.painted)[0]!.mean;
      const drift = Math.abs(brightest(second!) - brightest(first!));
      expect(
        drift,
        `the brightest painted cell reads ${brightest(first!).toFixed(1)} on the first entry and ` +
          `${brightest(second!).toFixed(1)} on the second, ${drift.toFixed(1)} apart. The room is the same ` +
          `room both times; a reading that moves between them is something the engine applies once per page ` +
          `load rather than on every entry.`,
      ).toBeLessThan(ROOM_DRIFT);
      const peaks = roomEntries(viewport.name).map((entry) => entry.peak!.over);
      expect(
        Math.abs(peaks[1]! - peaks[0]!),
        `the count of painted pixels over the screens' peak is ${peaks[0]} on the first entry and ${peaks[1]} ` +
          `on the second`,
      ).toBeLessThan(overFloorFor(viewport.width));
    });
  }
});

describe("the sweep measured something", () => {
  it("drove both viewports in both themes", () => {
    expect(cases.length).toBe(VIEWPORTS.length * THEMES.length);
  });

  it("read a door window in every combination", () => {
    for (const one of cases) {
      expect(
        one.doors.length,
        `${one.viewport} in the ${one.theme} theme measured no doors at all`,
      ).toBe(doors.length);
    }
  });

  it("read two different themes, not the same one twice", () => {
    const dark = cases.filter((one) => one.theme === "dark").flatMap((one) => one.doors.map((d) => d.sceneHex));
    const light = cases.filter((one) => one.theme === "light").flatMap((one) => one.doors.map((d) => d.sceneHex));
    expect(dark.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    expect(dark, "both themes produced the same scene pixels, so the toggle did not reach the canvas").not.toEqual(
      light,
    );
  });
});
