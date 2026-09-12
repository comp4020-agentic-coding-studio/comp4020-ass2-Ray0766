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

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const doors = backlotManifest.doors;
const room = backlotManifest.rooms[0]!;

/** WCAG 2.2 SC 1.4.11. A focus ring is a part required to identify a control's
 *  state, so 3:1 against what it sits on is the floor, not a preference. */
const AA_NON_TEXT = 3;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** The cell the room's brightness is ranked in. 40 px is the size the contract's
 *  own reading was taken at, so the numbers in this file and the numbers in
 *  receipts/rig-3d/CONTRACT-A2.md are the same measurement. */
const CELL = 40;

/** How far a cell's centre may sit from a front-wall control and still be that
 *  screen's cell. The engine parks each `play-front-tN` button over its own
 *  screen every frame, and a screen measures about 143 px across at 1920 — so
 *  half a screen plus a cell's own diagonal is 130. Measured at 1920 in the dark
 *  theme: the five brightest cells sit 39, 73, 77, 79 and 118 px from a front
 *  control, and the brightest cell that is not on the front wall sits 439 px
 *  away, so the gap this number has to fall in is wide. */
const SCREEN_REACH = 130;

/** How much of a door's published rect has to carry the plate's own ground for
 *  that door to count as showing the same plate. The box is axis-aligned around
 *  a sheared parallelogram, so the share swings with the door's angle: measured
 *  at 64/18/25% and 61/17/20% at 1920, 34/12/12% and 37/9/9% at 390, against
 *  0.0% on every door carrying a photograph. 8% clears the lowest plate with
 *  room and is nowhere near a picture. */
const PLATE_SHARE_FLOOR = 0.08;

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
    rects: [...document.querySelectorAll("[data-backlot-hud] button[data-backlot-hotspot]")].map((button) => ({
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
  /** The machine room, ranked by 40x40 cell. */
  cells: { x: number; y: number; mean: number; distance: number; nearest: string }[];
  frontControls: string[];
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
        let cells: Case["cells"] = [];
        let frontControls: string[] = [];
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
                const left = Math.max(0, x);
                const top = Math.max(0, y);
                const right = Math.min(x + width, raster.width);
                const bottom = Math.min(y + height, raster.height);
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

          // ---- the machine room --------------------------------------------
          // The HUD comes back first: it is entered with the keyboard, and a
          // control inside a `visibility: hidden` subtree cannot take focus.
          //
          // And then a frame, which is not padding. `focus()` does not force a
          // style recalculation, so a call in the same task as the style's
          // removal is tested against the visibility the element still has:
          // measured, as `document.activeElement` coming back BODY with the
          // style gone and the button on screen, and the room never entered —
          // the cell profile below was of the hub, ranked against no front-wall
          // controls at all, and every distance came out Infinity.
          await tab.evaluate(SHOW_HUD);
          await tab.evaluate(
            "return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));",
          );
          // Entered with the keyboard, so the engine's focus hand-over runs the
          // way it does for a reader; a synthetic click skips the browser's own
          // activation behaviour and leaves focus on the body.
          const doorway = doors.find((candidate) => candidate.kind === "room")!;
          await tab.evaluate(
            `document.querySelector('[data-backlot-hotspot="${doorway.id}"]')?.focus(); return null;`,
          );
          await tab.press("Enter");
          await pause(3000);

          const inside = await tab.evaluate<Hud | null>(HUD);
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
            const found: Case["cells"] = [];
            for (let row = 0; row + CELL <= raster.height; row += CELL) {
              for (let column = 0; column + CELL <= raster.width; column += CELL) {
                const mean = raster.meanLuminance(column, row, CELL, CELL);
                const x = inside.canvas.left + column + CELL / 2;
                const y = inside.canvas.top + row + CELL / 2;
                let nearest = "(nothing)";
                let distance = Infinity;
                for (const front of fronts) {
                  const away = Math.hypot(x - front.centre.x, y - front.centre.y);
                  if (away < distance) {
                    distance = away;
                    nearest = front.id;
                  }
                }
                found.push({ x: column, y: row, mean, distance: Math.round(distance), nearest });
              }
            }
            found.sort((one, two) => two.mean - one.mean);
            cells = found;
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
          cells,
          frontControls,
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
// Seen red by taking the outer tone off the ring in the built stylesheet —
// `box-shadow: 0 0 0 5px var(--at-bg)` alone, which is the single-tone ring this
// repo used to have — and reverting:
//
//   AssertionError: no pixel outside the People door's control equals the ring's
//   outer tone #f0eeeb. The run outwards was #070504 #070504 #34230a #b97d1c
//   #8c5f16 #070504 #070504 #070504 #070504 #070504 #070504 #070504 #070504
//   #070504.: expected null not to be null
//   (25 failed | 32 passed | 6 skipped)
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
      //   AssertionError: the People door's window carries 0.0% of #573b0f, the
      //   ground the square-on plate reads. The three plates are the same
      //   texture under no light at all, so they agree or something is wrong
      //   with one of them. Plates: assessments 64.2%, people 0.0%, policies
      //   0.0%. Pictures: lectures 0.0%, sessions 0.0%, studio 0.0%.: expected
      //   0 to be greater than or equal to 0.08
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
      // top of it — 3 failed | 70 passed:
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
// Seen red by opening the tower's interior light up in the built bundle —
// `new PointLight(undefined, 1.4, 0.8, 1.6)` to `(undefined, 60, 8, 1.6)`, an
// intensity and a reach that put the glass panel above the screens — and
// reverting:
//
//   AssertionError: of the five brightest cells in the machine room, 1 are not
//   on the front wall: expected [ '(1280, 720) 0.302 at 602px' ] to deeply
//   equal []
//
// Note which of the two went red, because it is the reason there are two. The
// brightest single cell was still a screen; the tower took fifth place. A check
// that only asked about the top cell would have stayed green with the tower lit
// forty times over. Raising the same light to an intensity of 14 and leaving its
// 0.8 m distance alone moved nothing at all — that injection was a bug the page
// never had, and the only way to find that out was to watch it stay green.
describe("the brightest thing in the machine room is the front wall", () => {
  it("found the room, its five screens and a profile to rank", () => {
    for (const viewport of VIEWPORTS) {
      const one = at(viewport.name, "dark");
      expect(
        one.frontControls,
        `the room did not paint a control for every front-wall screen at ${viewport.name}`,
      ).toEqual(room.interactives.filter((entry) => entry.id.startsWith("play-front-")).map((entry) => entry.id));
      // 1104 cells of a 1920x923 canvas, 153 of a 390x699 one. A profile that
      // came back short means the raster was of something other than the canvas.
      expect(
        one.cells.length,
        `the room's cell profile at ${viewport.name} is empty, so the ranking is about nothing`,
      ).toBeGreaterThan(100);
    }
  });

  for (const viewport of VIEWPORTS) {
    it(`puts the brightest cell on the front wall at ${viewport.name}`, () => {
      const brightest = at(viewport.name, "dark").cells[0]!;
      expect(
        brightest.distance,
        `the brightest 40x40 cell of the machine room at ${viewport.name} sits at (${brightest.x}, ` +
          `${brightest.y}) of the canvas, ${brightest.distance} px from the nearest front-wall control ` +
          `(${brightest.nearest}), at a mean luminance of ${brightest.mean.toFixed(3)}. The five screens on ` +
          `the front wall are the brightest thing in this room and nothing painted may out-shine them.`,
      ).toBeLessThanOrEqual(SCREEN_REACH);
    });
  }

  it("and the four next brightest as well, at 1920", () => {
    // One cell is a thin claim: a single bright run on a screen's edge would
    // satisfy it while the whole of the rest of the wall had gone dark. Five is
    // the number of screens.
    //
    // At 1920 only, and the number says why: the five brightest cells sit 39,
    // 73, 77, 79 and 118 px from a front control and the sixth sits 439 px away,
    // so the wall owns the top of the list with room to spare. At 390 the whole
    // room is 153 cells and a screen is about one cell wide — the top four sit
    // 14, 19, 29 and 32 px out and the fifth is already 136 px away, on the side
    // wall. There is no depth there to ask for, and asking for it would be
    // tuning a number until the current frame passed.
    const one = at(VIEWPORTS[0].name, "dark");
    const top = one.cells.slice(0, 5);
    const strays = top.filter((cell) => cell.distance > SCREEN_REACH);
    expect(
      strays.map((cell) => `(${cell.x}, ${cell.y}) ${cell.mean.toFixed(3)} at ${cell.distance}px`),
      `of the five brightest cells in the machine room, ${strays.length} are not on the front wall`,
    ).toEqual([]);
  });
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
