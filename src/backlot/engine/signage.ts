// Everything in the hub that is drawn rather than built: the plate in a door's
// window, the door's name on the floor, the grain on a frame, the pool of light
// a window throws, and the week 7 workflow as it reads at the size a door
// window actually is.
//
// All of it is a 2D canvas handed to three as a texture, and all of it is
// redrawn on a theme flip — a canvas baked once would still be painted in last
// theme's numbers after the footer toggle. Colour comes from ColourReader, the
// same as every material in the scene, so there is no colour value written
// here in any syntax; `globalAlpha` does the work `rgba()` would otherwise do.
//
// Type is drawn in the system sans stack rather than the page's own face. That
// is a decision about bytes and about branches: the theme's Public Sans is
// already downloaded for the page, so using it would cost no transfer — but it
// would put the scene behind `document.fonts.ready` and add a redraw-when-the-
// font-lands branch to a thing that has to be right on the frame it appears.
// A sign in a backlot is not set in the body face anyway. Cost of every word
// in this file, measured: 0 bytes of font.
import { CanvasTexture, SRGBColorSpace, type Texture } from "three";
import type { ColourReader } from "./types";

/** Texture pixels per world metre. The largest thing drawn here is a name board
 *  about 3.4 m wide, which lands around 150 px across at 1920 — so 160 px/m is a
 *  little over 3x the screen size a 2x display asks for, and the whole set of
 *  them is well under a megabyte of texture memory. */
const PX_PER_METRE = 160;

/** Cap height of a door's name on the board over its lintel, in metres.
 *
 *  This is the number the legibility target is actually made of. The god view
 *  is fixed at 52 degrees, so a horizontal surface keeps sin(52) = 0.788 of its
 *  depth on screen while a vertical one keeps only cos(52) = 0.616 of its
 *  height — and a horizontal surface, unlike a door's face, is never turned away
 *  from the camera by the ring. At 1920x1080 the hub resolves about 41 px per
 *  metre, so 0.36 m of cap comes out around 12 px, which reads at 1:1 on all six
 *  doors in both themes. Verified by looking at the pixels, not by this
 *  arithmetic: cap height is a proxy and it passed once while the word failed. */
const SIGN_CAP_METRES = 0.36;

/** The stack, not a face. See the note at the top of the file. */
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Letter-spacing on a sign, as a fraction of the cap height. Stencilled floor
 *  type is tracked out; it also stops two letters merging once the whole word
 *  is 150 px wide on screen. */
const TRACKING = 0.16;

/** And on the plate in a door's window, which is tighter. Tracking there is
 *  bought with cap height — the word's length is what limits the size, so every
 *  0.01 of tracking is about 0.05 px of cap at 1920 — and a turned word does not
 *  need much of it, because the line it is set along is already generous. */
const PLATE_TRACKING = 0.06;

/**
 * The narrowest a plate's word will be set, as a fraction of the face's own
 * advance. 0.72 is about where a real condensed cut sits.
 *
 * Worth being honest about what this buys, because it was introduced chasing a
 * number that turned out to be the wrong target. Cap height is a **proxy** for
 * readability, and on the four doors the ring turns 60° from the camera the
 * proxy passes while the word fails: the glyph's cap direction projects to
 * (cos θ, sin 52 · sin θ), so the letters are sheared about 54° and their
 * across-the-run extent is |cos θ| = 0.5 of the cap. Looked at 1:1 and at 6x
 * nearest-neighbour, POLICIES and PEOPLE do not resolve as words at **either**
 * 0.72 or 1.0 — the condensing is not what breaks them, the shear is.
 *
 * It is kept because it is worth 1.39x of cap on the one plate that can be
 * read — Assessment, at six o'clock, square on to the camera, which goes from
 * about 8.9 px to 12.3 px — and costs nothing on the two that cannot. Its only
 * beneficiary is that door, and that is the whole of the case for it.
 */
const CONDENSE_MIN = 0.72;

/**
 * How much brand fill is washed over a plate's ground, which is the whole of
 * what makes a plate read as lit.
 *
 * Picked by measurement rather than by eye, and the first value picked was
 * wrong for a reason CLAUDE.md §5 already records about the hero scrim: a canvas
 * composites in sRGB's **gamma** space, so alpha is not linear in luminance. At
 * 0.22 I expected 0.055 and the composite measured 0.016 — a third of it. The
 * value below is the one that lands a dark plate in the same band as the doors
 * with a picture behind them, which is what "lit" has to mean here.
 */
const PLATE_WASH = 0.45;

export interface Sign {
  readonly texture: Texture;
  /** The drawing's own size in metres, so the caller can build a mesh to it. */
  readonly metresWide: number;
  readonly metresTall: number;
  /** Cap height of the type in this drawing, in texture pixels. Zero where the
   *  drawing carries no type. Reported rather than assumed: it comes off
   *  TextMetrics, which is the renderer's own answer and not 0.72 x the size. */
  readonly capPixels: number;
}

/**
 * A nameplate, which is the one drawing here that is not finished when it is
 * made.
 *
 * The word on it is painted only while it is big enough on screen to be a word,
 * and nothing in this file can know that: the cap height that matters is the
 * projected one, which depends on the camera and on which door this is. So the
 * plate reports the cap it drew at **in metres** — the unit the engine can
 * project — and takes the answer back through `setWord`.
 */
export interface Plate extends Sign {
  /** Cap height of the word in world metres, which is what a projection needs.
   *  `capPixels` is the same height in the drawing's own pixels. */
  readonly capMetres: number;
  /** Paint the word, or leave the plate lit and wordless. Redraws only when the
   *  answer changes, so this is safe to call every frame.
   *
   *  There is deliberately no `showingWord` to read back. What goes up on the
   *  button is the **cap height**, which lets a check assert the threshold
   *  itself — on above 11 px, off below it — where a flag saying which way the
   *  engine went would only ever prove the engine agrees with itself, and would
   *  pass a build where the threshold had moved to 4 px. */
  setWord(show: boolean): void;
}

export interface Signwriter {
  /** The plate behind a door's window: a ground, a hairline, and the door's own
   *  name. `metres` is the window opening, so the drawing is made at the size it
   *  will be seen at rather than at a round number. */
  nameplate(label: string, metres: { wide: number; tall: number }): Plate | null;
  /** The door's name on a board over its lintel, at a fixed cap height so every
   *  door's name is equally readable however long the word is. */
  lintelSign(label: string): Sign | null;
  /** The pool a lit window throws on the floor. Alpha only — the colour is the
   *  material's, so a theme flip repaints it without a redraw. */
  spill(): Texture | null;
  /** Brushed grain for a frame, tiled. Multiplies the material's own colour. */
  grain(): Texture | null;
  /** The week 7 workflow as a door window can honestly show it: the real graph's
   *  real topology, no type, running down the window. Layer 1, so it resolves
   *  after the first frame or resolves null and the window keeps its plate. */
  workflow(file: string, metres: { wide: number; tall: number }): Promise<Sign | null>;
  dispose(): void;
}

/** A token as something a 2D context will accept. Not a literal: the digits come
 *  from ColourReader, which resolved them the way the compositor did. */
function css(colours: ColourReader, token: string): string {
  return `#${colours.hex(token).toString(16).padStart(6, "0")}`;
}

/** A context, or nothing. A browser with no 2D context keeps the flat fills,
 *  which is the same bargain every other layer in the backlot strikes. */
function context(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  return ctx ? { canvas, ctx } : null;
}

/** The ascent of a run of capitals at a given font size — which for an all-caps
 *  string with no accents is the cap height, measured rather than guessed. */
function capRatio(ctx: CanvasRenderingContext2D, sample: string): number {
  ctx.font = `700 100px ${SANS}`;
  const metrics = ctx.measureText(sample);
  const ascent = metrics.actualBoundingBoxAscent;
  // A browser that reports nothing useful falls back to the usual ratio rather
  // than dividing by zero; 0.72 is the ratio for the stacks above.
  return ascent > 0 ? ascent / 100 : 0.72;
}

/** Width of a tracked run at a given font size. Canvas has `letterSpacing` but
 *  it is not everywhere, so the tracking is added rather than declared. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, extra: number): number {
  return ctx.measureText(text).width + extra * Math.max(0, text.length - 1);
}

/** Draw a tracked run, left edge at x, baseline at y. */
function trackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, extra: number): void {
  let cursor = x;
  for (const glyph of text) {
    ctx.fillText(glyph, cursor, y);
    cursor += ctx.measureText(glyph).width + extra;
  }
}

export function createSignwriter(colours: ColourReader): Signwriter {
  const textures = new Set<CanvasTexture>();
  const redraws: (() => void)[] = [];
  const stopListening = colours.onThemeChange(() => {
    for (const redraw of redraws) redraw();
  });

  const ink = (token: string) => css(colours, token);

  /**
   * The door's name, set at a fixed cap height, for a **horizontal** surface.
   *
   * One drawing serves the floor and the lintel because the god view treats
   * every horizontal surface the same: it keeps sin(52) = 0.788 of a depth, at
   * every angle on the ring, and unlike a door's face it is never turned away.
   * That is the whole reason the name ended up above the door — see the note in
   * hub.ts — and it is why the two places share a cap height and a layout.
   *
   * It used to take a `board` flag, because the floor markings drew the same
   * word with no ground under it. They came out when the boards went up — one
   * place that reads beats three that hedge — and the flag came out with them
   * rather than being left as a branch nothing takes.
   */
  function name(label: string): Sign | null {
    const measure = context(8, 8);
    if (!measure) return null;
    const word = label.toUpperCase();
    const capPx = SIGN_CAP_METRES * PX_PER_METRE;
    const ratio = capRatio(measure.ctx, word);
    const size = capPx / ratio;
    measure.ctx.font = `700 ${size}px ${SANS}`;
    const extra = capPx * TRACKING;
    const run = trackedWidth(measure.ctx, word, extra);
    const padX = capPx * 0.75;
    const padY = capPx * 0.6;

    const made = context(run + padX * 2, capPx + padY * 2);
    if (!made) return null;
    const { canvas, ctx } = made;

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // The same ground as the plate in the window, washed the same amount, so
      // a door's two signs are one material at two sizes rather than two
      // decisions. `--at-bg` under `--at-text` is the pair the theme guarantees
      // in both directions; the wash is what makes it read as lit.
      ctx.fillStyle = ink("--at-bg");
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = ink("--at-primary");
      ctx.globalAlpha = PLATE_WASH;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink("--at-border");
      ctx.lineWidth = Math.max(2, canvas.height * 0.04);
      ctx.strokeRect(padX * 0.3, padY * 0.3, canvas.width - padX * 0.6, canvas.height - padY * 0.6);
      // Ink is `--at-text` rather than the brand fill, because this is a word
      // and CLAUDE.md §7 keeps the gold off anything that is ink.
      ctx.font = `700 ${size}px ${SANS}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = ink("--at-text");
      trackedText(ctx, word, padX, padY + capPx, extra);
    };

    return {
      texture: bake(canvas, draw),
      metresWide: canvas.width / PX_PER_METRE,
      metresTall: canvas.height / PX_PER_METRE,
      capPixels: capPx,
    };
  }

  /** Wrap a texture so it is disposed with the writer and redrawn with the
   *  theme. `draw` is called once here and again on every flip. */
  function bake(canvas: HTMLCanvasElement, draw: () => void): CanvasTexture {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    draw();
    texture.needsUpdate = true;
    textures.add(texture);
    redraws.push(() => {
      draw();
      texture.needsUpdate = true;
    });
    return texture;
  }

  return {
    nameplate(label, metres) {
      const made = context(metres.wide * PX_PER_METRE, metres.tall * PX_PER_METRE);
      if (!made) return null;
      const { canvas, ctx } = made;
      const word = label.toUpperCase();
      const pad = canvas.height * 0.09;
      // Turned: the word runs **up** the window, not across it.
      //
      // Anyone trying to make something readable in this scene will reach for a
      // bigger font first, so here is what the god view actually does to type on
      // a door, written out once. There are two in-plane directions on a door
      // face at ring angle θ, and the camera treats them differently:
      //
      //   world vertical        projects to (0, −cos 52)             length 0.616
      //   the door's tangent    projects to (cos θ, sin 52 · sin θ)  length 0.846 at 60°
      //
      // Set **across**, the letters run along the tangent and the cap is the
      // vertical: 0.616 of it survives, at every door.
      //
      // Set **up**, the letters run along the vertical and the cap is the
      // tangent — but the readable number is *not* that vector's length. The
      // letters stack down the screen, so what has to be big enough is the
      // extent perpendicular to the run, and the tangent's component along the
      // run only shears the glyph. That leaves |cos θ|: 1.000 at twelve and six
      // o'clock, 0.500 at the other four. I quoted 0.846 once and it was wrong
      // by the same factor the two angled plates measured short.
      //
      // Turning still wins, and by a lot, because the long axis is where the
      // room is — but it wins on advance, not on foreshortening, and the four
      // angled doors are the hard case rather than the easy one.
      //
      // Vertical signage on a door is a real thing rather than a workaround —
      // it is how a narrow sign has always been set — and it reads bottom to
      // top, which is the way round the rest of the world sets a spine.
      const along = canvas.height - pad * 2;
      const across = canvas.width - pad * 2;

      // Sized to the opening rather than to a chosen point size. Two clamps, and
      // **the width one never binds** — measured, not assumed: at this window a
      // plate could carry 161 px of cap before its width mattered, and the
      // longest of the three words wants 33. Every nameplate is limited by how
      // far its word has to run, which is why widening the opening on its own
      // changed all three caps by exactly nothing.
      //
      // So the unused width is spent the way a sign painter spends it: the word
      // is **condensed** along its run and the cap grows to match, until either
      // the width clamp finally bites or the letters reach the narrowest this
      // will set them. That is what the wider plate is for — at 3:4 there is
      // room for the enlarged cap; at 9:16 the word would be crowding its own
      // opening.
      ctx.font = `700 100px ${SANS}`;
      const ratio = capRatio(ctx, word);
      const run100 = trackedWidth(ctx, word, 100 * ratio * PLATE_TRACKING);
      const capByLength = ratio * (along / run100) * 100;
      const capByWidth = across / 1.35;
      const cap = Math.min(capByWidth, capByLength / CONDENSE_MIN);
      // Never wider than the face sets naturally, and never narrower than the
      // floor below: `condense` is the factor the run is squeezed by, and the
      // cap is what that buys.
      const condense = Math.min(1, Math.max(CONDENSE_MIN, capByLength / cap));
      const size = cap / ratio;

      const draw = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // The page's own ground and the page's own ink: the pair the theme
        // guarantees is readable in both themes, rather than a pair chosen here
        // that happens to work in the one being looked at.
        ctx.fillStyle = ink("--at-bg");
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // And then the light.
        //
        // A plate is unlit by construction — it is a texture on a basic material
        // and nothing in the scene falls on it — so whatever the ground token is
        // *is* the plate's luminance. `--at-bg` is the right ground, because
        // `--at-bg` against `--at-text` is the one pair this theme guarantees in
        // both directions; it is also the brightest surface in the light theme
        // and the darkest in the dark one. Painted with it alone, a plate reads
        // as a lit sign under light and as a hole with writing on it under dark:
        // measured at 0.012 relative luminance, which is the page's own
        // background, against 0.10 for the doors with a picture in them.
        //
        // So the ground gets a wash of the brand fill, which is a fill doing a
        // fill's job and is the same decision in both themes rather than a
        // token that flips. The ink is untouched and still clears 4.5:1 on the
        // washed ground at both ends; the numbers are in the receipt.
        ctx.fillStyle = ink("--at-primary");
        ctx.globalAlpha = PLATE_WASH;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;

        // A hairline inside the opening: what keeps the plate reading as a plate
        // rather than as a hole. Drawn before the turn, so it stays square.
        ctx.strokeStyle = ink("--at-border");
        ctx.lineWidth = Math.max(2, canvas.width * 0.012);
        ctx.strokeRect(pad * 0.5, pad * 0.5, canvas.width - pad, canvas.height - pad);

        // A quarter turn anticlockwise: the drawing's +x now runs up the canvas
        // and a glyph's top points to the left, which is how a turned sign is
        // read everywhere else.
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        // The turn puts the run on the drawing's x and the cap on its y, so one
        // scale on x condenses the advance and the glyph together — which is
        // what a condensed face is — and leaves the cap where it was.
        ctx.scale(condense, 1);

        ctx.font = `700 ${size}px ${SANS}`;
        ctx.textBaseline = "alphabetic";
        const extra = cap * PLATE_TRACKING;
        const run = trackedWidth(ctx, word, extra);

        // And the word itself, but only while it is one.
        //
        // Below about eleven pixels of projected cap this stops being type and
        // becomes texture: the letters are there, nobody can read them, and a
        // plate with unreadable writing on it claims to say something it does
        // not. The plate is still lit and still a sign — the name is over the
        // lintel, on a horizontal board the god view never turns away, and that
        // is the door's name whether this is painted or not. So the plate is
        // allowed to stay quiet, and it says the word once the camera has come
        // in far enough for the word to be a word.
        //
        // The threshold is the engine's to apply, because it is the only half
        // that knows where the camera is; this end just draws what it is told.
        //
        // **And the rule under the word goes with it**, which it did not at
        // first. I kept it on the grounds that it is the light down the edge of
        // a lit sign rather than the word's own underline — but it is drawn from
        // `run`, which is the word's own measured length, and at the size this
        // rule is about that is not a distinction anything can see: at 390 the
        // Assessment plate is a 28 x 24 px window, and a bar as long as
        // ASSESSMENT in it is a word as far as any sampler or any reader is
        // concerned. The checks lane measured 35 px of ink over a ground of 60
        // and read it as the word, and they were right to. What keeps the plate
        // lit is the wash and the hairline, neither of which is shaped like
        // type.
        if (!showWord) {
          ctx.restore();
          return;
        }
        // The brand fill beside the word rather than under it — a rule the
        // length of the name, which is the light down the edge of the plate.
        ctx.fillStyle = ink("--at-primary");
        ctx.globalAlpha = 0.55;
        ctx.fillRect(-run / 2, cap * 0.42, run, Math.max(2, cap * 0.075));
        ctx.globalAlpha = 1;

        ctx.fillStyle = ink("--at-text");
        trackedText(ctx, word, -run / 2, cap / 2, extra);
        ctx.restore();
      };

      let showWord = false;
      const texture = bake(canvas, draw);
      return {
        texture,
        metresWide: metres.wide,
        metresTall: metres.tall,
        capPixels: cap,
        capMetres: cap / PX_PER_METRE,
        setWord(show: boolean) {
          if (show === showWord) return;
          showWord = show;
          draw();
          texture.needsUpdate = true;
        },
      };
    },

    lintelSign(label) {
      return name(label);
    },

    spill() {
      // The pool a window throws: brightest at the foot of the door, fanning out
      // and gone before it reaches the middle of the ring.
      //
      // Written a byte at a time rather than as a canvas gradient, because a
      // gradient is the wrong shape twice over. A radial one is still at 0.30 of
      // its alpha where it meets the left and right edges of the quad, which
      // paints a hard-edged slab of floor with a blob in it — seen, and the
      // reason this is not four lines of `createRadialGradient`. And light out
      // of a doorway *widens*: a falloff that is the same width at 5 m as it is
      // at the threshold is a projector, not a door.
      //
      // No colour is decided here at all. The bytes are a mask, the material
      // carries the token, and one texture serves all six doors in both themes.
      const size = 128;
      const made = context(size, size);
      if (!made) return null;
      const { canvas, ctx } = made;
      const image = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        // Row 0 is the top of the canvas, which `flipY` puts at the edge of the
        // quad nearest the door — so `depth` is 0 at the door and 1 at the far
        // end of the pool.
        const depth = y / (size - 1);
        const fade = (1 - depth) ** 1.3;
        const spread = 0.46 + 0.54 * depth;
        for (let x = 0; x < size; x++) {
          const across = Math.abs(x / (size - 1) - 0.5) / (spread / 2);
          const shape = across >= 1 ? 0 : (1 - across * across) ** 1.1;
          const at = (y * size + x) * 4;
          const value = Math.round(255 * fade * shape);
          image.data[at] = value;
          image.data[at + 1] = value;
          image.data[at + 2] = value;
          image.data[at + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      // No colour space on this one on purpose: an alphaMap is read as data off
      // the green channel, and tagging it sRGB would put a transfer function on
      // a falloff.
      const texture = new CanvasTexture(canvas);
      textures.add(texture);
      return texture;
    },

    grain() {
      // A frame that is one flat fill is a rectangle; a frame with a grain in it
      // is a thing made of something. Drawn once, tiled, and multiplied into
      // whatever colour the frame's token is — so it survives a theme flip
      // without being redrawn, because it carries no hue of its own.
      const made = context(64, 64);
      if (!made) return null;
      const { canvas, ctx } = made;
      ctx.fillStyle = ink("--at-white");
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = ink("--at-black");
      for (let x = 0; x < 64; x += 2) {
        ctx.globalAlpha = 0.04 + ((x * 37) % 11) / 110;
        ctx.fillRect(x, 0, 1, 64);
      }
      ctx.globalAlpha = 1;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      textures.add(texture);
      return texture;
    },

    async workflow(file, metres) {
      // One reader, two surfaces. `src/lib/graph-reader.ts` already lays these
      // graphs out for the week 7 lecture, and `rooms/graph-texture.ts` draws
      // that same layout onto the monitor inside the machine room. The door
      // window is a third surface for the same layout, not a second parser:
      // nothing about the file is read here.
      //
      // Dynamic, so the reader and the graph JSON it inlines stay off the path
      // to the first frame and share a chunk with the monitor's drawing rather
      // than being counted twice.
      let view: { nodes: { x: number; y: number; kind: string }[]; edges: { path: string }[]; width: number; height: number };
      let box: { width: number; height: number };
      try {
        const module = await import("../../lib/graph-reader");
        view = module.graphView("", file);
        box = module.BOX;
      } catch {
        return null;
      }

      const made = context(metres.wide * PX_PER_METRE, metres.tall * PX_PER_METRE);
      if (!made) return null;
      const { canvas, ctx } = made;

      // The window is portrait and the graph is laid out left to right, so the
      // drawing is turned a quarter: the workflow runs down the window, which is
      // how it fills the opening instead of sitting in a band across the middle
      // of it. Nothing is written on it. At this size a door window is not a
      // place anyone can read a graph, and drawing type on it would be the door
      // claiming otherwise — what it shows is the shape of the thing: the real
      // graph's real columns, its real fan-out, and the four trades as the four
      // colours the lecture and the monitor already use.
      const kinds: Record<string, string> = {
        loader: "--phase-rig",
        conditioning: "--phase-generators",
        sampler: "--phase-episode",
        fix: "--phase-holding",
        other: "--at-divider",
      };

      const draw = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = ink("--at-bg");
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const inset = canvas.width * 0.1;
        const across = canvas.width - inset * 2;
        const along = canvas.height - inset * 2;
        // The graph runs 5.4 : 1 and the window is 1 : 1.8, so a uniform fit
        // leaves the whole thing a ribbon a quarter of the opening wide with
        // nodes two pixels across — which is a texture, not a workflow. The
        // long axis is fitted honestly and the short one is stretched to fill
        // the opening, capped at 3x so the nodes end up reading as blocks
        // rather than as slivers. What survives is the thing this is for: how
        // many steps there are, where the work fans out, and which trade each
        // node belongs to.
        const lengthwise = along / view.width;
        const crosswise = Math.min(across / view.height, lengthwise * 3);
        ctx.save();
        ctx.translate(
          inset + (across - view.height * crosswise) / 2,
          inset + (along - view.width * lengthwise) / 2,
        );
        // A quarter turn, with the two axes scaled separately: the graph's x
        // (its columns) becomes the drawing's y, so the workflow runs down the
        // window the way the window is tall.
        ctx.transform(0, lengthwise, -crosswise, 0, view.height * crosswise, 0);

        ctx.strokeStyle = ink("--at-text-muted");
        ctx.lineWidth = 3 / lengthwise;
        for (const edge of view.edges) {
          const numbers = edge.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
          if (!numbers || numbers.length < 8) continue;
          ctx.beginPath();
          ctx.moveTo(numbers[0]!, numbers[1]!);
          ctx.bezierCurveTo(numbers[2]!, numbers[3]!, numbers[4]!, numbers[5]!, numbers[6]!, numbers[7]!);
          ctx.stroke();
        }
        for (const node of view.nodes) {
          // Solid, not the 22% wash graph-reader.css puts behind a node it also
          // writes a name in. Nothing is written here, the panel behind is the
          // page's own near-black ground, and at 0.34 alpha over it the four
          // trades came out between 33 and 45 — measured, and invisible.
          ctx.fillStyle = ink(kinds[node.kind] ?? "--at-divider");
          ctx.fillRect(node.x, node.y, box.width, box.height);
        }
        ctx.restore();

        ctx.strokeStyle = ink("--at-border");
        ctx.lineWidth = Math.max(2, canvas.width * 0.012);
        ctx.strokeRect(inset * 0.4, inset * 0.4, canvas.width - inset * 0.8, canvas.height - inset * 0.8);
      };

      return { texture: bake(canvas, draw), metresWide: metres.wide, metresTall: metres.tall, capPixels: 0 };
    },

    dispose() {
      stopListening();
      redraws.length = 0;
      for (const texture of textures) texture.dispose();
      textures.clear();
    },
  };
}
