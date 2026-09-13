// What is behind the twelve stage windows down the Lectures corridor, and when.
//
// The corridor itself — its floor, its walls, the twelve door frames and the
// openings cut in them — is built elsewhere. This file owns only what fills an
// opening, which is the same split `engine/hub.ts` already draws between the
// geometry it builds and the `dress()` / `watch()` / `unwatch()` that puts
// pictures in it. The corridor hands over a `StageOpening` per stage; nothing
// here makes geometry, registers a hotspot or moves the camera.
//
// The order things arrive in is the order a reader needs them, and twelve of
// them is what makes the order matter:
//
//   L0  the corridor's own shapes and lights, already walkable. Every window is
//       the flat fill the frame was built with, which is also what it stays as
//       if nothing below ever lands.
//   L1  `dress()`. The four unshot panels first, because they are drawn rather
//       than fetched and owe the network nothing; then the eight recorded
//       stills, in the order a reader walks past them.
//   L2  `setLive()`. One clip. Six of the twelve have one behind the still, and
//       at most one of the six holds a decoder at any moment — a corridor with
//       twelve decoders running is the failure that rule exists to prevent.
//
// Every one of those may come back with nothing, and nothing is a normal
// outcome rather than an error state. A still that never lands leaves the
// window on the frame's flat fill; a clip that never plays leaves the still up.
// A failed still is **never** replaced by the unshot panel: the panel is a claim
// about the course — that this week recorded nothing — and a dropped request is
// not evidence for it.
import { CanvasTexture, SRGBColorSpace, type Texture } from "three";
import type { LayerApi, VideoHandle } from "../engine/types";
import type { BacklotStage } from "./manifest";
import type { Painter } from "./palette";

/**
 * Texture pixels per world metre for an unshot week's panel.
 *
 * Higher than `signage.ts`'s 160 because the two drawings are read at different
 * distances. A door's lintel sign is read across the hub; a stage window is
 * something the camera comes in on, and the doors' push takes a window from
 * 21 px across to about 120 — so on a 2x display the panel is being asked for
 * roughly 240 device pixels of width. 256 px/m keeps it sampling at or above
 * 1:1 there rather than being magnified, and four panels at this size are a
 * couple of megabytes of texture between them.
 */
const PANEL_PX_PER_METRE = 256;

/**
 * How much brand fill is washed over an unshot panel's black ground.
 *
 * This is the number that decides whether the window reads as "empty" or as
 * "broken", and it is measured on the composite rather than picked by eye — a
 * canvas composites in sRGB's gamma space, so alpha is not linear in luminance
 * and the value that looks right in the head is not the value that lands.
 *
 * The band it has to sit in has both ends measured. `engine/hub.ts` records a
 * plate painted in `--at-bg` alone landing at 0.012 relative luminance and
 * reading "as a hole with writing on it", against about 0.10 for a door with a
 * picture behind it. An empty gate belongs between those and nearer the bottom:
 * plainly darker than any week that did shoot, plainly not an absence. Over a
 * black ground this alpha puts the panel at rgb(59,40,9), relative luminance
 * 0.0245 — twice the hole and a quarter of a picture.
 */
const PANEL_WASH = 0.32;

/** And the hairline inside the opening, which is what stops the panel reading
 *  as a hole cut in the door rather than as a panel sitting in one. Same fill at
 *  a different strength: one material at two levels, not two decisions. */
const PANEL_EDGE = 0.62;

/** How far in the hairline sits, as a fraction of the panel's short side. */
const PANEL_INSET = 0.055;

/**
 * The week's number, as a fraction of the panel.
 *
 * Small on purpose. What carries "this week has not been shot yet" is the
 * emptiness — an empty slot in a row of full ones — and a numeral sized to fill
 * the opening would turn the panel into a poster of a number, which is a
 * different thing that is also not the week's frame. A quarter of the height
 * leaves the panel obviously mostly empty and still puts the digits well above
 * anything a reader has to squint at once the camera has come in.
 *
 * Both clamps are measured against the glyphs rather than assumed: `capOf`
 * reads the sample's own ascent out of `TextMetrics`, so a machine whose system
 * face sets figures differently gets a numeral that still fits its opening.
 */
const NUMERAL_CAP = 0.25;
/** And never wider than half the opening, which is the clamp that binds on a
 *  two-digit week. */
const NUMERAL_RUN = 0.5;
/**
 * What the width clamp is measured against, which is **not** this panel's own
 * number.
 *
 * Four weeks are unshot and three of them are two digits. Sized per panel, the
 * run clamp binds on 10, 11 and 12 and does not bind on 1 — measured at the
 * corridor's opening that is a 52 px cap against a 72 px one, so week 1 would
 * carry a numeral half again the size of week 12's and a row of four would read
 * as a mistake rather than as a set. The corridor is twelve teaching weeks, so
 * two digits is the widest any of them ever gets; measuring the clamp against a
 * constant two-digit sample gives every week the same cap and lets the short
 * one simply be short, which is how a sign painter sets a run of numbers.
 */
const NUMERAL_SAMPLE = "00";

/** How far the numeral is held under pure white.
 *
 * `--at-white` is the token, because the panel's ground does not follow the
 * theme and so its ink must not either. But a panel is not the brightest thing
 * in this corridor and should not paint itself that way: the pictures are, and
 * an empty window that out-glows every week that did shoot is the wrong way
 * round. 0.82 lands the digits at rgb(209,209,209) — 9.7:1 on the washed
 * ground, which is a long way clear of anything legibility needs. */
const NUMERAL_LEVEL = 0.82;

/** The stack, not a face — same argument `engine/signage.ts` makes at length:
 *  the page's own Public Sans would cost no transfer and would put this drawing
 *  behind `document.fonts.ready` and add a redraw-when-the-font-lands branch to
 *  a thing that has to be right on the frame it appears. Cost here: 0 bytes. */
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * One opening, as the corridor built it.
 *
 * The corridor owns the geometry and therefore owns the material that hangs in
 * it; this file owns the texture that goes on the material. `fill` is the whole
 * of the seam.
 */
export interface StageOpening {
  /** The stage this opening belongs to, straight off the manifest. */
  stage: BacklotStage;
  /**
   * The opening's real size in metres.
   *
   * Read per opening rather than taken as a constant, because an unshot week's
   * panel is drawn **to** the opening the way `signage.ts` draws a nameplate to
   * `entry.windowMetres` — the drawing is made at the size it will be seen at
   * rather than at a round number and scaled. All twelve are the same opening
   * today, 0.630 x 1.120 m, because the corridor builds them at the house 9:16
   * rather than at each file's own aspect; reading it per opening rather than
   * once is what makes a stage that ever needs its own cost nothing.
   */
  metres: { wide: number; tall: number };
  /** Put a texture in every pane of this opening. `null` puts back the flat fill
   *  the frame was built with, which is what a released clip's window shows for
   *  the one tick before its still goes back up and what a window whose picture
   *  never landed keeps for good. */
  fill(texture: Texture | null): void;
}

export interface StageWindows {
  /**
   * Layer 1. Fill every window from its manifest entry.
   *
   * Call it **after the first frame has been presented**, not before: twelve
   * stills fetched during L0 are twelve requests competing with the thing a
   * reader sees first, and the first frame is what the budget is measured
   * against. Never rejects — an opening that gets nothing keeps its flat fill.
   */
  dress(): Promise<void>;
  /**
   * Layer 2. Name the one stage whose clip is allowed to decode, or `null`.
   *
   * Setting a different id releases whatever was playing before anything else
   * is asked to start, so one decoder is a property of this function rather than
   * of its callers remembering. A stage with no clip behind its still is a
   * perfectly good argument: it simply ends the previous one.
   *
   * **The corridor decides which stage that is, and this file does not.** It
   * already has the answer: the proximity crossing that frames the camera and
   * paints the leaf as the one being stood at is the same event as "the figure
   * is at this window", so it is computed once and passed here. This file used
   * to be going to run its own facing poll, the way `machine-room.ts` does over
   * a wall of five screens a figure can stand in front of all at once — but a
   * corridor has one window within reach at a time, and a second test at 0.25 s
   * against a proximity crossing would be two nearly-identical answers
   * disagreeing by a frame, which reads as a decoder race. **Do not add one
   * back.** If the corridor's crossing is ever wrong, the fix is there.
   *
   * **Reduced motion is gated at the call site too, for the same reason.**
   * `engine/index.ts` returns before `watch()` for a reader who asked for less
   * motion and `machine-room.ts` passes `null`; this half does not know where
   * the camera is or why it arrived.
   */
  setLive(id: string | null): void;
  dispose(): void;
}

export interface StageWindowOptions {
  layers: LayerApi;
  /** For the unshot panels' colours. Every one of them is a `--at-*` token read
   *  through `ColourReader`; there is no colour value in this file. */
  painter: Painter;
}

/** The ascent of a run of digits at a given size, which for lining figures is
 *  their cap height — measured off `TextMetrics` rather than assumed to be
 *  0.72 of the size, because that ratio belongs to a face and this is a stack. */
function capOf(ctx: CanvasRenderingContext2D, digits: string): number {
  ctx.font = `700 100px ${SANS}`;
  const ascent = ctx.measureText(digits).actualBoundingBoxAscent;
  return ascent > 0 ? ascent / 100 : 0.72;
}

/**
 * A week that recorded nothing, as the thing that hangs in its window.
 *
 * Ray's ruling, and the manifest states it too: a dark 9:16 empty panel carrying
 * the week's number, in the same frame and the same light as a week that did
 * shoot, so that a marker reads "this week has not been shot yet" rather than
 * "this door is broken". It is emphatically not a nameplate — a nameplate door
 * has nothing behind it to show, and a teaching week has a slot for a thing it
 * has not made.
 *
 * Nothing here follows the theme, and that is the decision rather than an
 * oversight: see the note on `gate` in palette.ts. A theme flip must leave these
 * four panels pixel-identical, which is a thing a probe can assert and a redraw
 * listener could only ever agree with itself about.
 *
 * Returns null on a browser with no 2D context, which leaves the window on its
 * flat fill — the same bargain every other layer in the backlot strikes.
 */
function drawEmptyGate(
  painter: Painter,
  week: number,
  metres: { wide: number; tall: number },
): CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(metres.wide * PANEL_PX_PER_METRE));
  canvas.height = Math.max(1, Math.round(metres.tall * PANEL_PX_PER_METRE));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  const { width, height } = canvas;
  const short = Math.min(width, height);

  ctx.fillStyle = painter.css("gate");
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = PANEL_WASH;
  ctx.fillStyle = painter.css("gateLight");
  ctx.fillRect(0, 0, width, height);

  const inset = short * PANEL_INSET;
  ctx.globalAlpha = PANEL_EDGE;
  ctx.strokeStyle = painter.css("gateLight");
  ctx.lineWidth = Math.max(2, short * 0.012);
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.globalAlpha = 1;

  // The number, upright.
  //
  // `signage.ts` turns a nameplate's word a quarter turn because a word needs
  // run length and a door window has its length in the vertical. A one- or
  // two-digit number does not: it fits across the opening at the size this
  // panel wants it, and a number set sideways is a number a reader has to
  // decode before reading. So it stays the way round a number is written.
  const digits = String(week);
  const ratio = capOf(ctx, NUMERAL_SAMPLE);
  const byHeight = height * NUMERAL_CAP;
  const byRun = ((width * NUMERAL_RUN) / ctx.measureText(NUMERAL_SAMPLE).width) * 100 * ratio;
  const cap = Math.min(byHeight, byRun);
  ctx.font = `700 ${cap / ratio}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = NUMERAL_LEVEL;
  ctx.fillStyle = painter.css("neutral");
  ctx.fillText(digits, width / 2, height / 2 + cap / 2);
  ctx.globalAlpha = 1;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** The file a stage hangs at layer 1, and the clip behind it if there is one.
 *  Reads the manifest's union by its `kind` rather than by going looking for a
 *  field, so a stage whose window changes shape is a type error here rather than
 *  an `undefined` that reaches the browser. */
function stillOf(stage: BacklotStage): { file: string; clip?: string } | null {
  const spec = stage.window;
  return spec.kind === "still" ? { file: spec.file, ...(spec.clip ? { clip: spec.clip } : {}) } : null;
}

export function createStageWindows(openings: StageOpening[], options: StageWindowOptions): StageWindows {
  const { layers, painter } = options;
  const byId = new Map(openings.map((opening) => [opening.stage.id, opening]));
  /** Kept rather than re-fetched: a still is what a window goes back to the
   *  moment its clip is released, and the browser cache is not somewhere you can
   *  get a texture from in the same tick. */
  const stills = new Map<string, Texture>();
  /** Made on first use, so a stage nobody walks up to never allocates one. */
  const clips = new Map<string, VideoHandle>();
  /** The panels this file drew, which are the only textures it owns — the
   *  stills belong to `layers` and are disposed with it. */
  const panels: CanvasTexture[] = [];
  let live: string | null = null;

  return {
    async dress() {
      // The panels first. They are drawn rather than fetched, so they cost the
      // connection nothing and there is no reason for a window at the far end of
      // the corridor to wait behind eight requests for a drawing that is already
      // finished.
      for (const opening of openings) {
        const spec = opening.stage.window;
        if (spec.kind !== "unshot") continue;
        const panel = drawEmptyGate(painter, spec.week, opening.metres);
        if (!panel) continue;
        panels.push(panel);
        opening.fill(panel);
      }

      // Then the recorded stills, one at a time, in the order the corridor puts
      // them: `openings` is the manifest's own order, which is teaching order,
      // which is the order a reader walks past them. Eight at once would finish
      // no sooner and would arrive in whatever order the connection felt like.
      for (const opening of openings) {
        const hanging = stillOf(opening.stage);
        if (!hanging) continue;
        const texture = await layers.texture(hanging.file);
        if (!texture) continue;
        stills.set(opening.stage.id, texture);
        // A clip that started while its still was in flight keeps the clip: the
        // still is the thing underneath, not the thing on top.
        if (live !== opening.stage.id) opening.fill(texture);
      }
    },

    setLive(id) {
      if (live === id) return;
      const leaving = live;
      live = id;
      if (leaving) {
        const handle = clips.get(leaving);
        if (handle) {
          // Released, not paused. A paused decoder is still a decoder.
          handle.release();
          // And back onto the still in this same tick. Waiting on anything would
          // leave the window showing a texture whose video element has just been
          // emptied, which WebGL reports once a frame as "texImage2D: no video"
          // until something replaces it — the machine room and the hub have both
          // been here.
          byId.get(leaving)?.fill(stills.get(leaving) ?? null);
        }
      }
      if (!id) return;
      const opening = byId.get(id);
      const wanted = opening ? stillOf(opening.stage) : null;
      // Six of the twelve have a clip. The other six are a still or an empty
      // panel and there is nothing to start — which is not a fallback, it is
      // what those windows are.
      if (!opening || !wanted?.clip) return;
      let handle = clips.get(id);
      if (!handle) {
        handle = layers.videoFile(wanted.clip);
        clips.set(id, handle);
      }
      const started = handle;
      void started.play().then(() => {
        // The reader may have walked on while the file was opening. Releasing
        // here rather than leaving it running is the difference between
        // "stopped drawing" and "let go".
        if (live !== id) {
          started.release();
          return;
        }
        if (started.texture) opening.fill(started.texture);
      });
    },

    dispose() {
      live = null;
      // The corridor's own teardown will dispose `layers`, and this deliberately
      // does not rely on that: this file asked for these handles, so it lets
      // them go. A teardown that leaves a decoder alive because some other
      // teardown was going to get it is a teardown that stops working the day
      // the order changes.
      for (const handle of clips.values()) handle.release();
      clips.clear();
      stills.clear();
      for (const panel of panels) panel.dispose();
      panels.length = 0;
    },
  };
}
