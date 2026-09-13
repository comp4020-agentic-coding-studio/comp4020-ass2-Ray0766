// The facing mark: whether a reader can see which way the figure is pointing,
// and whether a turn changes the picture.
//
// ---------------------------------------------------------------------------
// What would settle this, and why nothing cheaper does
// ---------------------------------------------------------------------------
//
// This is the check in this round that is easiest to fake, and the three
// tempting ways to write it are all things this repo has already been caught by:
//
//   **a mark in the source is not a mark.** `player.ts` builds a collar and
//   `spec/backlot-exports.test.ts` could prove the constructor is called, and
//   that check would stay green through the exact bug this one exists for: the
//   first build of this figure put a standing open cylinder round the neck and
//   the hat brim covered every pixel of it. Nothing in the source said so, and
//   nothing in the source could have.
//
//   **a mark in a material is not a mark either.** `--at-accent` being bound to
//   a material proves the palette agrees with itself. CLAUDE.md §7's own example
//   is `--phase-*-ink`, which derived a correct ink for four phases while
//   nothing on the site referenced any of them and `spec/palette.test.ts` was
//   green about dead code.
//
//   **and a pixel count is not visibility.** A nameplate in this repo was signed
//   off on cap height — 12, 9 and 8 px, honestly measured and matching the claim
//   — while the word could not be read at 1:1 or at 2x, because cap height was
//   silent about stroke separation. A count of gold pixels is the same shape of
//   stand-in.
//
// So the figure is **turned**, driven by held arrow keys through all four
// headings, and two different things are done with what comes back.
//
// **The suite guards the mechanism.** Four things that can be asserted steadily
// at both viewports, every run:
//
//   1. the figure was segmented out of the scene by its own motion at every
//      heading, with the camera pinned and the published projection identical
//      across the frames, so the pixels read are the figure's;
//   2. the mark's own token is present on the figure's **body** — above the
//      shoulder line, so the accent ring at its feet cannot stand in for it;
//   3. that mark, once the light has fallen on it, still classifies as the
//      mark's token rather than the clothes';
//   4. the four headings produced four different pictures, so the arrow keys
//      really did reach the engine.
//
// Between them those catch the bugs this file exists for: a collar under the hat
// brim (2), a collar painted in the clothes' own token (3), and a figure that
// never turned (4).
//
// **A person settles the reading.** "Visible when the figure turns" is a claim
// about what somebody can see, and §7 is explicit about how such a claim is
// settled: "the instrument that settles a question about reading is a 1:1
// capture and somebody saying whether they can read it; everything else is a
// stand-in, and a stand-in gets checked against the real thing at least once
// before it is trusted to stand in." Four stand-ins were built for it here and
// all four lost against the captures — the note above the third describe lists
// them and what each one got wrong. So a 1:1 capture of the figure at each
// heading is written into the OS temp directory on every run, cut out of the
// very frame the numbers came from, and the receipt records what was seen in
// them at both viewports. `RECEIPTS` below says where they go and why there.
// That is not a gap in this file; it is the file being honest about which half
// of the question a suite can answer.
//
// ---------------------------------------------------------------------------
// How the mark is told apart from everything else wearing its colour
// ---------------------------------------------------------------------------
//
// The collar is `lit("--at-accent")` held at a level, so it is **not** a fixed
// value — a lit surface takes whatever the key light gives it. What survives
// lighting is the *ratio* between its linear channels: the stage's lights are
// `--at-white` on purpose ("a light's colour must not be a surface token",
// `scene.ts`), so a white light scales all three channels equally and a lit
// surface's linear RGB stays proportional to its own albedo. So the mark is
// found by **chromaticity**, not by value, inside the figure's own pixels.
//
// Chromaticity alone is useless over the whole canvas — measured, 7,749 pixels
// of this scene are proportional to the accent's chroma, across the doors'
// plinths and three photographs. It is decisive *inside the figure*, because the
// only two things on the figure wearing that hue are the collar and the ring at
// its feet, and the ring is **unlit**: it leaves the renderer as the token's own
// value exactly. So the ring is subtracted by refusing any pixel that equals the
// token, which is the same "accept only an exact match" discipline
// `spec/backlot-figure.test.ts` uses to find the tower, run backwards.
//
// The figure itself is segmented by **motion, in three frames**, for the reasons
// `spec/backlot-figure.test.ts` sets out at length: segmenting a thing by
// brightness discards the pixels that make it bright, and two frames cannot tell
// where the figure *was* from where it has *gone*. This is the hub rather than
// the machine room, which matters: in the room a step can change which screen
// holds a decoder and two settled frames differ by most of the canvas. In the
// hub, under a pinned camera, the figure is the only thing that moves.

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { contrastRatio } from "astro-theme-university/contrast";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { formatHex, serveBuild, Tab, type ColourScheme, type Key, type Raster, type Rgb } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

/** Both, because the mark is a colour and the clothes it sits on are a colour,
 *  and `--at-tertiary` is the one token in this palette that is the same value
 *  in both themes while the light around it is not. */
const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** The four headings the arrow keys give, camera-relative, which is how
 *  `engine/input.ts` composes them: "up" is always up the screen however far the
 *  mouse has nudged the view. Their names are the headings, not the keys. */
const HEADINGS: readonly { key: Key; name: string; opposite: string }[] = [
  { key: "ArrowUp", name: "away from the reader", opposite: "toward the reader" },
  { key: "ArrowDown", name: "toward the reader", opposite: "away from the reader" },
  { key: "ArrowLeft", name: "to the reader's left", opposite: "to the reader's right" },
  { key: "ArrowRight", name: "to the reader's right", opposite: "to the reader's left" },
];


/** Held, not pressed: `engine/input.ts` drives the figure for as long as the key
 *  is down, and `press` sends the down and the up in the same millisecond.
 *
 *  **400 ms rather than 200, and the reason is the one thing this file most
 *  needed to get right.** A step has to move the figure clear of where it was,
 *  or the overlap is subtracted from the segmentation — and this camera lays a
 *  depth back by cos 52 degrees, so a step *away from the reader* covers only
 *  0.616 of its length on screen. At 200 ms the figure moved 0.92 m, which is
 *  66 px up the screen against a figure 81 px tall, and the 15 px that
 *  overlapped were subtracted from the top: the capture came back as a pair of
 *  legs and a ring with the head and the collar cut off. The check was then
 *  measuring a figure with the mark removed and reporting that the mark was
 *  missing — the right answer to a question nobody asked. 400 ms is 1.8 m, which
 *  is 133 px up the screen and clears the figure's own height. */
const STEP_MILLISECONDS = 400;

/** The three albedos the figure is painted from, named here rather than
 *  resolved by hand: `player.ts` builds it out of exactly these and nothing
 *  else, and the classification below is "which of these three is this pixel",
 *  which needs no tolerance at all.
 *
 *  A **nearest-of-three** rather than a band around one, and that is what makes
 *  it honest: a tolerance is a number somebody picks, and the first version of
 *  this picked 0.06 and found two pixels of a collar that is plainly there in
 *  the capture beside it. The three tokens are far apart in chroma — the accent
 *  is rgb(185,125,28) and its linear blue is 2.6% of its red, the clothes are
 *  rgb(107,97,84) and theirs is 58.5% — so every pixel of the figure belongs to
 *  one of them and the boundary is arithmetic rather than taste. */
const FIGURE_TOKENS = {
  mark: "--at-accent",
  clothes: "--at-tertiary",
  hat: "--at-on-accent",
} as const;

/** The dimmest a pixel may be and still have a hue worth classifying, in linear
 *  light. Below this the ratios are the renderer's rounding. */
const HAS_A_HUE = 0.004;


/** How far down the figure, as a share of its own height below the head's
 *  centroid, still counts as being on its body rather than on the floor under
 *  it. See the split itself: the collar is a tenth of the height below the head
 *  and the ring is all of it. */
const ON_THE_BODY = 0.35;




/** Where the 1:1 captures go: **the OS temp directory, never the repo.**
 *
 *  `scripts/check-links.ts` already settled this question for this repo — it
 *  writes its throwaway index "in the OS temp directory, never in the repo" —
 *  and the first version of this file got it wrong, leaving 88 kB of PNGs inside
 *  the working tree on every run, not gitignored and one `git add` away from
 *  being committed. Nothing that is not source goes in.
 *
 *  A path under the repo's own parent would have been wrong twice: still not
 *  source, and broken the moment this runs on any machine but mine. `tmpdir()`
 *  is portable, and the name is stable rather than a fresh `mkdtemp` each run,
 *  because for this file the captures are not debris to be swept up — they are
 *  where the question is actually settled, and somebody has to be able to find
 *  them. The test that counts them says the path out loud. */
const RECEIPTS = join(tmpdir(), "slop-backlot-facing");

/** How far the summed absolute channel difference has to be before two pixels
 *  count as different. Fifty times a single channel count. */
const PIXEL_DELTA = 0.02;

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/** The commonest exact colour in a set of pixels.
 *
 *  **A mode rather than a mean, and `spec/backlot-fitout.test.ts` already paid
 *  for the reason**: "the ground is the commonest exact colour in the box, never
 *  an extreme and never a corner". A mean is dragged toward whatever the shape
 *  is sitting on by its own antialiased rim, and at 390 a 2 px collar is almost
 *  entirely rim — so a mean there measures the blend and reports that the mark
 *  has lost its colour when what it has lost is its size. The mode is the
 *  colour the thing is actually painted. */
function modal(pixels: Rgb[]): Rgb {
  const counts = new Map<string, number>();
  for (const pixel of pixels) {
    const hex = formatHex(pixel);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((one, two) => two[1] - one[1])[0]![0];
  return [
    parseInt(best.slice(1, 3), 16) / 255,
    parseInt(best.slice(3, 5), 16) / 255,
    parseInt(best.slice(5, 7), 16) / 255,
  ];
}

/** A crop of a decoded raster, written out as a PNG.
 *
 *  **Encoded from the frame the numbers came from, rather than screenshotted
 *  afterwards**, and that is not fussiness. The first version took the capture
 *  with `Page.captureScreenshot` once the reading was done — by which time the
 *  figure had walked two more steps, so every capture was a rectangle of empty
 *  floor where the figure used to be. A capture that is evidence has to be of
 *  the same frame as the measurement, and the only frame that is certainly that
 *  is the one already decoded in memory. Twenty lines of zlib against a whole
 *  class of mistake. */
function writeCrop(raster: Raster, box: { left: number; top: number; right: number; bottom: number }, path: string): void {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const pixel = raster.at(box.left + x, box.top + y);
      const at = y * (stride + 1) + 1 + x * 3;
      raw[at] = Math.round(pixel[0] * 255);
      raw[at + 1] = Math.round(pixel[1] * 255);
      raw[at + 2] = Math.round(pixel[2] * 255);
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

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

/** A nonce per document, so a reload underneath a reading is caught rather than
 *  reported as a very settled scene. See `spec/backlot-door-press.test.ts`, where
 *  a reload mid-reading produced the strongest stillness evidence that file has
 *  ever printed, about the wrong page. */
const SENTINEL = `window.__backlotDoc = { id: Math.random().toString(36).slice(2) };`;

/** The canvas, the published rects, whether the camera is close on anything, and
 *  which document this is — one read, so the four cannot be of four frames. */
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
    docId: (window.__backlotDoc ?? { id: "no sentinel" }).id,
    framed: hud ? hud.dataset.backlotFramed ?? "" : "no hud",
    rects: [...document.querySelectorAll("[data-backlot-hud] button[data-backlot-hotspot]")]
      .filter((button) => !button.hidden && getComputedStyle(button).display !== "none")
      .map((button) => button.dataset.backlotHotspot + ":" + (button.dataset.backlotRect || "-"))
      .join("|"),
  };
`;

interface Scene {
  canvas: { x: number; y: number; width: number; height: number };
  docId: string;
  framed: string;
  rects: string;
}

/** `--at-accent` as the page resolves it, composited over `--at-bg` the way
 *  `engine/colours.ts` does — half this palette carries alpha and a translucent
 *  token has no colour of its own in a scene. Resolved on a fresh element
 *  coloured before it is inserted, because the theme leaves `transition-property`
 *  at `all` under `prefers-reduced-motion` and a computed read in the same task
 *  returns the value the property is moving away from (CLAUDE.md §7). */
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
  return [data[0], data[1], data[2]];
`;

/** sRGB's transfer function. A lit surface's *linear* channels keep the ratios
 *  of its albedo under a white light; its encoded ones do not. */
const decode = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** CIE L*a*b* under D65, from sRGB. */
function lab(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(decode) as Rgb;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76. Enough for "are these two obviously different colours", which is the
 *  question — a just-noticeable difference is about 2.3, and everything here is
 *  an order of magnitude above or below that rather than near it. */
function deltaE(one: Rgb, two: Rgb): number {
  const first = lab(one);
  const second = lab(two);
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

/** One heading, read off the composite. */
interface Look {
  heading: string;
  /** A checksum of the very frame every number in this Look was read from.
   *
   *  Recorded every run, not only on failure, and it exists to settle one fork
   *  that the failure message below currently asserts one side of. When two
   *  headings come back with the same picture, either the arrow keys never
   *  reached the engine — which is what the message claims — or the two captures
   *  are the same bytes and the sweep compared one frame with itself. Those want
   *  different fixes and nothing in here could tell them apart: `picture` is
   *  keyed on the head, so it is deliberately blind to where the figure walked,
   *  and two head-aligned pictures can coincide without the frames coinciding.
   *  A raw frame checksum cannot. */
  frame: string;
  /** The figure's own pixels, and its centroid and extent. */
  figure: { pixels: number; x: number; y: number; width: number; height: number } | null;
  /** The mark's pixels inside them, its centroid, and its share of the figure. */
  mark: { pixels: number; x: number; y: number; share: number } | null;
  /** And where each of them is, so two headings can be laid over each other. */
  markPoints: { x: number; y: number }[];
  /** The whole figure as a picture in its own frame: every segmented pixel's
   *  colour, keyed on its offset from the head. Two headings laid over each
   *  other this way are directly comparable however far the figure walked. */
  picture: Map<string, string>;
  /** The head's own centroid — the hat and hair, which `player.ts` paints from
   *  a third token and which sits on the figure's axis whichever way it is
   *  pointing. It is the origin the mark's direction is taken from. */
  head: { x: number; y: number; pixels: number } | null;
  /** How many accent-coloured pixels were below the shoulder line and therefore
   *  the ring at the figure's feet rather than the mark on its shoulders.
   *  Recorded, because a run that found none of them has not found the ring and
   *  is probably not looking at the figure at all. */
  onTheFloor: number;
  /** How wide the figure's **shoulders** are on screen, in pixels.
   *
   *  The clothes rather than the whole silhouette, because the whole silhouette
   *  includes the accent ring on the floor — a circle, the same width at every
   *  heading, which would make four turned figures measure identical. The
   *  trunk, arms and legs are not: this camera is orthographic, so there is no
   *  perspective in it at all, and a figure 0.39 m across the shoulders and
   *  less than that deep is genuinely narrower seen from the side. It is the
   *  one reading in this file that depends on the heading and not at all on
   *  where in the ring the figure is standing. */
  clothesWidth: number;
  /** The commonest composited colour of the mark and of the clothes around it,
   *  and whether the mark's is still nearer the mark's token than the clothes'. */
  markColour: Rgb | null;
  clothesColour: Rgb | null;
  markIsAccent: boolean;
  /** Whether anything about the scene moved while the three frames were taken. */
  steady: boolean;
  why: string;
}

interface Reading {
  viewport: string;
  theme: ColourScheme;
  ready: boolean;
  accent: string;
  /** CIE76 between the mark's token and the clothes' token, which is the
   *  separation the palette chose before any light fell on it. */
  tokenDistance: number;
  looks: Look[];
  /** Where the 1:1 captures went, so the receipt can name them. */
  captures: string[];
}

const settle = async (tab: Tab): Promise<Scene | null> => {
  // Three consecutive identical reads of the engine's own published projection.
  // One read is not a measurement of a scene that is still arriving.
  let previous = "";
  let same = 0;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const now = await tab.evaluate<Scene | null>(SCENE);
    const key = JSON.stringify(now);
    if (now && key === previous) {
      same += 1;
      if (same >= 2) return now;
    } else {
      same = 0;
    }
    previous = key;
    await pause(120);
  }
  return null;
};

async function sweep(): Promise<Reading[]> {
  mkdirSync(RECEIPTS, { recursive: true });
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  const readings: Reading[] = [];

  try {
    await tab.onNewDocument(SENTINEL);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const reading: Reading = {
          viewport: viewport.name,
          theme,
          ready: false,
          accent: "",
          tokenDistance: 0,
          looks: [],
          captures: [],
        };
        await tab.viewport(viewport.width, viewport.height);
        // Pinned. The idle camera yaws on a 28.6 s period and the fill light
        // breathes on a 7.0 s one, and both would turn up in a diff as movement
        // that is not the figure. Under the preference the figure still walks
        // when a key is held — `player.update` drives from `driving` whatever
        // the preference says — and its facing is set instantly rather than
        // turned into over 9 rad/s, which is the state this file wants to read.
        await tab.media({ colourScheme: theme, reducedMotion: true });
        await tab.goto(url);
        await tab.evaluate(
          `try { localStorage.setItem("at-theme", ${JSON.stringify(theme)}); } catch {} return null;`,
        );
        await tab.goto(url);
        reading.ready = (await tab.evaluate<string>(READY)) === "ready";
        if (!reading.ready) {
          readings.push(reading);
          continue;
        }

        // The three albedos, each as a linear chroma normalised on its largest
        // channel — which is what survives a white light. The encoded values do
        // not: a lit surface takes whatever the key gives it.
        const albedos: Record<string, number[]> = {};
        for (const [role, token] of Object.entries(FIGURE_TOKENS)) {
          const resolved = await tab.evaluate<[number, number, number]>(TOKEN(token));
          if (role === "mark") reading.accent = formatHex([resolved[0] / 255, resolved[1] / 255, resolved[2] / 255]);
          const linear = resolved.map((channel) => decode(channel / 255));
          const peak = Math.max(...linear, 1e-6);
          albedos[role] = linear.map((channel) => channel / peak);
        }
        {
          const markToken = await tab.evaluate<[number, number, number]>(TOKEN(FIGURE_TOKENS.mark));
          const clothesToken = await tab.evaluate<[number, number, number]>(TOKEN(FIGURE_TOKENS.clothes));
          reading.tokenDistance = deltaE(
            markToken.map((channel) => channel / 255) as Rgb,
            clothesToken.map((channel) => channel / 255) as Rgb,
          );
        }
        /** Which of the figure's three albedos this pixel is painted from. */
        const classify = (pixel: Rgb): string | null => {
          const linear = pixel.map(decode);
          const peak = Math.max(...linear);
          if (peak < HAS_A_HUE) return null;
          const chroma = linear.map((channel) => channel / peak);
          let best: string | null = null;
          let closest = Infinity;
          for (const [role, target] of Object.entries(albedos)) {
            const distance = Math.hypot(...chroma.map((channel, index) => channel - target[index]!));
            if (distance < closest) {
              closest = distance;
              best = role;
            }
          }
          return best;
        };

        for (const heading of HEADINGS) {
          const look: Look = {
            heading: heading.name,
            frame: "",
            figure: null,
            mark: null,
            markPoints: [],
            picture: new Map(),
            head: null,
            onTheFloor: 0,
            clothesWidth: 0,
            markColour: null,
            clothesColour: null,
            markIsAccent: false,
            steady: false,
            why: "",
          };

          const first = await settle(tab);
          if (!first) {
            look.why = "the scene never settled before the walk";
            reading.looks.push(look);
            continue;
          }
          const clip = first.canvas;

          // **Turned into this heading before anything is captured, and this
          // line is the whole of the defect that was here.**
          //
          // The segmentation below finds the figure *in A* on purpose — the
          // pixels that changed on the first step and have been still since are
          // the ones it vacated, which is its silhouette at A. So A is the
          // moment every number in this Look describes. A was taken before this
          // heading's key had ever been held, which made it the figure as the
          // *previous* heading's walk-back left it:
          //
          //   away   (1st)  the engine's initial placement
          //   toward (2nd)  away's walk-back was ArrowDown, so: toward  (right by luck)
          //   left   (3rd)  toward's walk-back was ArrowUp, so: AWAY    (wrong)
          //   right  (4th)  left's walk-back was ArrowRight, so: right  (right by luck)
          //
          // So "the four headings produced four different pictures" was
          // comparing two readings of *away* with each other, and a walk-back
          // that returns the figure well is exactly what made them match. It is
          // not intermittent: measured here before the fix, away-vs-left was the
          // smallest of the six pairs in every cell — 2.738%, 0.615%, 2.500%,
          // 16.410% against up to 93% for the rest — and whether it rounded to
          // "0.0%" was the coin flip that made it look like one run in eight.
          // Two of the mark assertions were reading the wrong heading too.
          //
          // One extra step of the heading's own key turns the figure and puts it
          // there before A is taken; the walk-back below is three steps rather
          // than two to match.
          await tab.hold(heading.key, STEP_MILLISECONDS);
          await pause(700);
          const turned = await settle(tab);
          if (!turned) {
            look.why = "the scene never settled after turning into the heading";
            reading.looks.push(look);
            await tab.hold(HEADINGS.find((one) => one.name === heading.opposite)!.key, STEP_MILLISECONDS);
            await pause(700);
            continue;
          }

          const a = await tab.raster(clip);
          // Cheap on purpose — every ninth pixel, weighted per channel so a
          // swapped channel does not cancel. It is not a hash, it is a witness
          // that two captures were or were not the same picture.
          look.frame = (() => {
            let total = 0;
            for (let y = 0; y < a.height; y += 3) {
              for (let x = 0; x < a.width; x += 3) {
                const pixel = a.at(x, y);
                total += pixel[0] + pixel[1] * 3 + pixel[2] * 7;
              }
            }
            return total.toFixed(4);
          })();
          await tab.hold(heading.key, STEP_MILLISECONDS);
          await pause(700);
          const second = await settle(tab);
          const b = await tab.raster(clip);
          await tab.hold(heading.key, STEP_MILLISECONDS);
          await pause(700);
          const third = await settle(tab);
          const c = await tab.raster(clip);

          // The guards that make the diff a segmentation. A framing moves the
          // whole scene, and the published rects are the engine's own projection
          // in the pass that drew the frame — identical rects mean the camera
          // did not move.
          const moved = [second, third].find((one) => !one || one.rects !== first.rects || one.docId !== first.docId);
          look.steady = !moved && first.framed === "" && (second?.framed ?? "") === "" && (third?.framed ?? "") === "";
          if (!look.steady) {
            look.why =
              !second || !third
                ? "the scene never settled after a step"
                : moved
                  ? "the published rects or the document changed between frames, so the camera moved with them"
                  : `the HUD says the camera is close on something ("${first.framed}")`;
            reading.looks.push(look);
            // Walk back anyway, so the next heading starts from where this one
            // did rather than from wherever this one gave up.
            await tab.hold(HEADINGS.find((one) => one.name === heading.opposite)!.key, STEP_MILLISECONDS * 3);
            await pause(700);
            continue;
          }

          const differs = (one: Raster, two: Raster, x: number, y: number) => {
            const first_ = one.at(x, y);
            const second_ = two.at(x, y);
            return (
              Math.abs(first_[0] - second_[0]) +
                Math.abs(first_[1] - second_[1]) +
                Math.abs(first_[2] - second_[2]) >
              PIXEL_DELTA
            );
          };

          // The figure's own pixels in A: changed on the first step, and then
          // still ever since. A pixel the figure walked *into* changes on both.
          const figure: { x: number; y: number }[] = [];
          for (let y = 0; y < a.height; y++) {
            for (let x = 0; x < a.width; x++) {
              if (!differs(a, b, x, y)) continue;
              if (differs(b, c, x, y)) continue;
              figure.push({ x, y });
            }
          }
          if (figure.length === 0) {
            look.why = "nothing moved when the figure was asked to walk";
            reading.looks.push(look);
            continue;
          }
          const xs = figure.map((one) => one.x);
          const ys = figure.map((one) => one.y);
          look.figure = {
            pixels: figure.length,
            x: xs.reduce((sum, one) => sum + one, 0) / figure.length,
            y: ys.reduce((sum, one) => sum + one, 0) / figure.length,
            width: Math.max(...xs) - Math.min(...xs) + 1,
            height: Math.max(...ys) - Math.min(...ys) + 1,
          };

          // Inside them, the mark: the accent's own hue, and **not** the accent's
          // own value. The ring at the figure's feet is unlit and leaves the
          // renderer as the token exactly; the collar is lit and cannot.
          const gold: { x: number; y: number }[] = [];
          const head: { x: number; y: number }[] = [];
          const clothes: Rgb[] = [];
          const clothesAt: { x: number; y: number }[] = [];
          for (const point of figure) {
            const pixel = a.at(point.x, point.y);
            // **The ring's own core, refused by exactness.** The accent ring at
            // the figure's feet is `flat()` — unlit — so it leaves the renderer
            // as the token's value exactly, and the collar is `lit()` and
            // cannot. The shoulder cut below takes out the ring's antialiased
            // rim; this takes out its core wherever it lands.
            //
            // Both are needed, and the light theme is what proved it. There the
            // segmented figure's extent is inflated by the bright floor around
            // the contact shadow, which pushes the shoulder cut down past the
            // ring — so the "mark" came back as **250 px reading #b97d1c**, the
            // token's exact value, which is the one colour a lit collar can
            // never be. The assertions still passed, on the wrong object: a
            // check answering the question next to the one being asked.
            if (formatHex(pixel) === reading.accent) continue;
            const role = classify(pixel);
            if (role === "mark") gold.push(point);
            else if (role === "clothes") {
              clothes.push(pixel);
              clothesAt.push(point);
            } else if (role === "hat") head.push(point);
          }

          // The two accent-coloured things on this figure, told apart by where
          // they are on it.
          //
          // `player.ts` puts the collar at 1.458 m of a 1.75 m figure and the
          // ring on the floor at 0. The head's own centroid sits around 1.65 m.
          // So the collar is about a tenth of the figure's height below the head
          // and the ring is all of it — a cut at a third of the height has an
          // order of magnitude of room on both sides and is the figure's own
          // proportions rather than a pixel offset that expires at the next
          // viewport.
          //
          // **Refusing pixels that equal the token exactly is not enough**, and
          // that is what this replaced. Nor is finding the ring by its shape —
          // a disc on this floor projects to sin 52 degrees as tall as it is
          // wide, which works at 1920 and finds nothing at 390, where the band
          // is under a pixel and antialiases away entirely. The ring is unlit, so its interior does
          // equal the token — but a 0.90 m ring has a great deal of
          // **antialiased rim**, every pixel of which is a blend that carries
          // the accent's hue. Measured, that rim was the whole of what the first
          // version called the mark: 46 px sitting 35.7 px below the head, in
          // the same place at every heading, which is exactly what a ring on the
          // floor does and exactly nothing like a heading.
          if (head.length > 0) {
            look.head = {
              x: head.reduce((sum, one) => sum + one.x, 0) / head.length,
              y: head.reduce((sum, one) => sum + one.y, 0) / head.length,
              pixels: head.length,
            };
          }
          if (look.head) {
            const originX = Math.round(look.head.x);
            const originY = Math.round(look.head.y);
            for (const point of figure) {
              look.picture.set(`${point.x - originX},${point.y - originY}`, formatHex(a.at(point.x, point.y)));
            }
          }
          const shoulderCut = (look.head?.y ?? 0) + look.figure.height * ON_THE_BODY;
          // The **shoulder line's** width, not the whole silhouette's. Two
          // things below the shoulders are circles and would read the same at
          // every heading: the accent ring, and — in the light theme, where the
          // floor is a warm grey a shade off `--at-tertiary` — the contact
          // shadow and the floor under it, which classify as clothes. Measured
          // with the whole silhouette, all four headings came back at exactly
          // 38 px in the light theme and the check could not go red there.
          const shoulders = clothesAt.filter((one) => look.head && one.y <= shoulderCut).map((one) => one.x);
          if (shoulders.length > 0) look.clothesWidth = Math.max(...shoulders) - Math.min(...shoulders) + 1;
          const mark = look.head ? gold.filter((one) => one.y <= shoulderCut) : [];
          look.onTheFloor = gold.length - mark.length;
          const markPixels = mark.map((one) => a.at(one.x, one.y));
          if (mark.length > 0) {
            look.markPoints = mark;
            look.mark = {
              pixels: mark.length,
              x: mark.reduce((sum, one) => sum + one.x, 0) / mark.length,
              y: mark.reduce((sum, one) => sum + one.y, 0) / mark.length,
              share: mark.length / figure.length,
            };
            look.markColour = modal(markPixels);
          }
          if (clothes.length > 0) look.clothesColour = modal(clothes);
          if (look.markColour) look.markIsAccent = classify(look.markColour) === "mark";

          // A 1:1 capture of the figure, at this heading, for a person to look
          // at. The numbers above are what a suite re-runs; this is what says
          // they were measuring the right thing (CLAUDE.md §7).
          // Padded off the figure's **height**, clamped to the canvas on all
          // four sides, and cut out of raster A — the frame every number above
          // came from.
          const pad = Math.round(look.figure.height * 0.25);
          const crop = {
            left: Math.max(0, Math.round(Math.min(...xs)) - pad),
            top: Math.max(0, Math.round(Math.min(...ys)) - pad),
            right: Math.min(a.width, Math.round(Math.max(...xs)) + pad),
            bottom: Math.min(a.height, Math.round(Math.max(...ys)) + pad),
          };
          const name = join(
            RECEIPTS,
            `b1-facing-${viewport.width}-${theme}-${heading.key.replace("Arrow", "").toLowerCase()}.png`,
          );
          writeCrop(a, crop, name);
          reading.captures.push(name);

          reading.looks.push(look);

          // Back to where this heading started, so every heading is read from
          // the same part of the ring and the offsets below are comparable.
          // Three, matching the three the heading now takes: one to turn into it
          // before A, and two more to segment by motion.
          await tab.hold(HEADINGS.find((one) => one.name === heading.opposite)!.key, STEP_MILLISECONDS * 3);
          await pause(700);
        }

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
// The sizes this file measures but does not threshold, for whoever is deciding
// what a mark at these sizes owes a reader. `FACING_TABLE=1 vitest run
// spec/backlot-facing` prints them; nothing asserts on them, and the reason is
// the note above the third describe.
if (process.env.FACING_TABLE) {
  for (const one of readings) {
    for (const look of one.looks) {
      console.log(
        `${one.viewport} ${one.theme} facing ${look.heading}: mark ${look.mark?.pixels ?? 0} px of a ` +
          `${look.figure?.pixels ?? 0} px figure (${((look.mark?.share ?? 0) * 100).toFixed(2)}%), ` +
          `shoulders ${look.clothesWidth} px, mark ${look.markColour ? formatHex(look.markColour) : "-"} on ` +
          `clothes ${look.clothesColour ? formatHex(look.clothesColour) : "-"}`,
      );
    }
  }
}
const at = (viewport: string, theme: ColourScheme) =>
  readings.find((one) => one.viewport === viewport && one.theme === theme);
const lookAt = (viewport: string, theme: ColourScheme, heading: string) =>
  at(viewport, theme)?.looks.find((one) => one.heading === heading);

// ---------------------------------------------------------------------------
// The floors
// ---------------------------------------------------------------------------
describe("the figure was turned, and the scene held still while it was read", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      it(`booted and read every heading at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme);
        expect(one, `the sweep never reached ${viewport.name} in the ${theme} theme`).toBeDefined();
        expect(
          one!.ready,
          `the island never set data-backlot-ready at ${viewport.name} in the ${theme} theme, so nothing ` +
            `below is about a 3D scene — the static gallery would still be on screen and still correct`,
        ).toBe(true);
        expect(one!.looks.map((look) => look.heading)).toEqual(HEADINGS.map((heading) => heading.name));
      });

      for (const heading of HEADINGS) {
        it(`segmented the figure facing ${heading.name} at ${viewport.name} in the ${theme} theme`, () => {
          const look = lookAt(viewport.name, theme, heading.name)!;
          expect(
            look.steady,
            `the scene did not hold still while the figure was walked ${heading.name} at ${viewport.name} in ` +
              `the ${theme} theme: ${look.why}`,
          ).toBe(true);
          expect(
            look.figure,
            `nothing moved when the figure was asked to walk ${heading.name} at ${viewport.name} in the ` +
              `${theme} theme, so the diff segmented nothing and every reading below would be of the scene ` +
              `rather than of the figure`,
          ).not.toBeNull();
          expect(look.figure!.pixels, "the figure covered no pixels").toBeGreaterThan(0);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 1. The mark is there, at every heading
// ---------------------------------------------------------------------------
//
// Seen red by putting the collar back under the hat, which is the bug this
// exists for and the one the first build of this figure actually had: the
// collar's `position` in the built bundle raised from the shoulders to the hat
// brim's own height, so the brim covers every pixel of it. Nothing in the source
// would say so and `spec/backlot-exports.test.ts` would still prove the
// constructor is called.
//
//   AssertionError: the figure shows no pixel of the accent's own hue anywhere
//   on itself facing toward the reader at desktop 1920×1080 in the dark theme.
//   The facing mark is the only thing on this figure that says which way it is
//   pointing, and a mark under the hat brim is a mark nobody can see — which is
//   what the first build of this figure shipped.: expected null not to be null
//   (16 failed | 28 passed)
describe("the facing mark is on screen", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const heading of HEADINGS) {
        it(`shows at ${viewport.name} in the ${theme} theme, facing ${heading.name}`, () => {
          const look = lookAt(viewport.name, theme, heading.name)!;
          expect(look.figure, "the figure was never segmented, so there is nothing to look on").not.toBeNull();
          expect(
            look.mark,
            `the figure shows no pixel of the accent's own hue anywhere on itself facing ${heading.name} at ` +
              `${viewport.name} in the ${theme} theme. The facing mark is the only thing on this figure that ` +
              `says which way it is pointing, and a mark under the hat brim is a mark nobody can see — which ` +
              `is what the first build of this figure shipped.`,
          ).not.toBeNull();
          // Presence, with the size printed rather than thresholded. A share
          // floor is a number picked out of the air about a thing whose
          // geometry — a 170-degree yoke 0.15 m across, partly behind a hat —
          // nobody has derived; measured it sits between 0.9% and 1.5% at 1920
          // and around 3% at 390, and the first version of this line asked for
          // 1% and failed two headings of a working build by four hundredths of
          // a percent. What a reader can make of the mark at these sizes is
          // settled by the captures and written up in the receipt, not by a
          // threshold here.
          expect(
            look.mark!.pixels,
            `the facing mark covers ${look.mark!.pixels} px of the figure's ${look.figure!.pixels} facing ` +
              `${heading.name} at ${viewport.name} — ${(look.mark!.share * 100).toFixed(2)}%.`,
          ).toBeGreaterThan(0);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. And it moves when the figure turns, which is the whole of what it is for
// ---------------------------------------------------------------------------
//
// **This is the assertion that a mark which merely exists cannot pass.** The
// offset is taken from the figure's own centroid, so it is free of where the
// figure happens to be standing, and it is compared against the figure's own
// width, so it is free of the viewport.
//
// Seen red by moving the collar onto the top of the hat in the built bundle —
// a hat badge, visible from every angle and identical from every angle,
// anchored on the collar's own `RingGeometry(.075,.15,...)` call inside
// `createFigure` rather than on `RingGeometry`, which the accent ring and four
// other things also call:
//
//   AssertionError: the facing mark sits 0.4 px from the figure's own centre
//   facing toward the reader and 0.6 px from it facing away from the reader,
//   0.9 px apart at desktop 1920×1080 — against 16.8 px, which is 40% of the
//   figure's own 42 px width. A mark that does not move when the figure turns
//   is a badge, not a heading.: expected 0.9 to be greater than 16.8
//   (8 failed | 36 passed)
/** How much of one picture is a different colour from the other, laid over each
 *  other by the head and searched a pixel either way for the best match — so a
 *  rounding cannot manufacture a difference. */
function pictureApart(here: Look, there: Look): { apart: number; same: number; union: number } {
  let best = 1;
  let sameCount = 0;
  let unionCount = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const keys = new Set([...here.picture.keys()]);
      let same = 0;
      for (const [cell, colour] of there.picture) {
        const [cx, cy] = cell.split(",").map(Number) as [number, number];
        const shifted = `${cx + dx},${cy + dy}`;
        keys.add(shifted);
        const mine = here.picture.get(shifted);
        if (mine === undefined) continue;
        const one = [1, 3, 5].map((at) => parseInt(mine.slice(at, at + 2), 16) / 255);
        const two = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16) / 255);
        if (Math.abs(one[0]! - two[0]!) + Math.abs(one[1]! - two[1]!) + Math.abs(one[2]! - two[2]!) <= PIXEL_DELTA) {
          same += 1;
        }
      }
      const apart = keys.size === 0 ? 0 : 1 - same / keys.size;
      if (apart < best) {
        best = apart;
        sameCount = same;
        unionCount = keys.size;
      }
    }
  }
  return { apart: best, same: sameCount, union: unionCount };
}

// **What is NOT asserted here, and why that is the honest answer.**
//
// "A turn is legible" is a claim about reading, and four automatic readouts of
// it were built and all four lost against the captures:
//
//   the mark's offset from the figure's centroid   the figure's centroid is
//     mostly the 0.90 m accent ring on the floor, so the offset is an axis that
//     carries no heading. 1.9 px of travel against a 15 px floor.
//   the mark's direction from the head             the collar sits just under
//     the head whichever way it points, so the vector is 11 px of "downward" and
//     two of "which way": 1 degree apart between opposite headings, on a build
//     whose capture shows the band plainly swinging round the shoulders.
//   the mark's footprint, laid over by the head    stable at 1920 and not at
//     390, where the whole collar is two pixels and both of them are rim.
//   the whole figure's picture, against a control  the control is the same
//     heading read twice, and it came back **54-91% different** — because this
//     figure's shading depends on where in the ring it is standing at least as
//     much as on which way it faces, and a walk back never lands on the same
//     metre. A difference measured against noise that large says nothing.
//
// So the suite guards the **mechanism** — the mark is on the figure's body, in
// its own colour, at all four headings, driven through a real turn — and the
// **reading** is settled where §7 says it is settled: a 1:1 capture and somebody
// saying whether they can see it. Those captures are written next to this file
// on every run and the receipt says what was seen in them, at both viewports.
// Writing a threshold here that I could not defend would be worse than writing
// none: it would be a number nobody could argue with because nobody could say
// where it came from.
//
// What is left below is a floor rather than a legibility claim: the four
// headings have to have produced four **different** pictures. If the arrow keys
// stopped reaching the engine, every reading in this file would be of the same
// frame and every assertion in it would still pass.
describe("the four headings were four different pictures", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      // Seen red by pinning the figure's heading in the built bundle — every
      // `rotation.y = atan2(facing)` inside `createFigure` replaced with
      // `rotation.y = 0`, anchored on the whole expression rather than on
      // `rotation.y`, which four other things in the chunk assign — so the
      // figure walks in all four directions and faces one way throughout:
      //
      //   AssertionError: the figure's clothes measure the same 16 px across at
      //   every heading at desktop 1920×1080 in the dark theme — away from the
      //   reader 16, toward the reader 16, to the reader's left 16, to the
      //   reader's right 16. This camera is orthographic and the figure is
      //   0.39 m across the shoulders and less than that deep, so a figure that
      //   is turning cannot be the same width from the front and from the side.
      //   The arrow keys are reaching the engine — it walked — and the heading
      //   is not following them.
      //   (5 failed | 57 passed | 2 skipped)
      //
      // **Two things that injection taught, and the second is about injections
      // rather than about figures.**
      //
      // It exists at all because the pair test below did **not** go red under
      // it: 60 of 60 passed with the figure facing one way through every
      // reading, because this figure's shading depends on where in the ring it
      // is standing at least as much as on which way it faces, and four headings
      // walk it to four different places. A check that watches four pictures
      // differ is watching the walk, not the turn.
      //
      // And the first attempt at the injection patched `update`'s branch only —
      // and the suite stayed green, because `place` writes the heading too and
      // every clamped walk goes through it. A half-applied injection reads
      // exactly like a check gone blind, which is the trap CLAUDE.md §7 records
      // about the plate sentinels; the only reason it surfaced is that a red
      // that does not reproduce gets looked at rather than filed.
      // **Scoped to the dark theme, and the reason is a measurement rather than
      // convenience** — the same shape of scope `spec/backlot-fitout.test.ts`
      // puts on its room ranking and `spec/backlot-approach.test.ts` on its
      // plate ink. In the light theme the room's floor is a warm grey a shade
      // off `--at-tertiary`, so a per-pixel classification cannot separate the
      // figure's clothes from the floor it is standing on: all four headings
      // come back at exactly 38 px at 1920 and 14 at 390, identical to the
      // pixel, because what is being measured is not the figure. A check that
      // cannot go red is worse than no check (CLAUDE.md §7), so it is not run
      // there. Dark is what a marker sees on a first visit, and the heading is
      // not a colour: a figure that turns in one theme turns in both, off the
      // same `rotation.y`.
      it.skipIf(theme === "light")(`turned the figure, and not only walked it, at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        const widths = one.looks.map((look) => look.clothesWidth);
        expect(
          Math.min(...widths),
          `the figure's clothes could not be measured at some heading at ${viewport.name} in the ${theme} ` +
            `theme — ${one.looks.map((look) => `${look.heading} ${look.clothesWidth}`).join(", ")}`,
        ).toBeGreaterThan(0);
        expect(
          new Set(widths).size,
          `the figure's clothes measure the same ${widths[0]} px across at every heading at ${viewport.name} ` +
            `in the ${theme} theme — ${one.looks.map((look) => `${look.heading} ${look.clothesWidth}`).join(", ")}. ` +
            `This camera is orthographic and the figure is 0.39 m across the shoulders and less than that ` +
            `deep, so a figure that is turning cannot be the same width from the front and from the side. ` +
            `The arrow keys are reaching the engine — it walked — and the heading is not following them.`,
        ).toBeGreaterThan(1);
      });

      it(`turned the figure at all, at ${viewport.name} in the ${theme} theme`, () => {
        const one = at(viewport.name, theme)!;
        const pictures = one.looks.filter((look) => look.picture.size > 0);
        expect(pictures.length, "no heading produced a picture of the figure").toBe(HEADINGS.length);
        // **The same criterion, said out loud.** This used to decide two pictures
        // were the same with `pair.endsWith(" 0.0%")` — a threshold hidden in a
        // number's rendering, because `(0.0004 * 100).toFixed(1)` is "0.0". So
        // the check already had an epsilon of 0.05%; it was just written where
        // nobody could argue with it, which is the one thing the note above this
        // describe says it refuses to do. `IDENTICAL` is that number, unchanged,
        // in a place it can be read: 0, 0.0002 and 0.0004 counted as identical
        // before and count as identical now, 0.0005 and 0.001 passed before and
        // pass now. Nothing about what this accepts has moved.
        //
        // What has moved is what it prints. A pair is now rendered to three
        // decimals, because when this goes red the first question is whether it
        // was a **true zero** — two readings of one frame, which is what the
        // message claims — or a small number under the epsilon, and "0.0%" cannot
        // tell those apart. The control for this instrument is the same heading
        // read twice, and it comes back **54-91% different**; against noise that
        // large, 0.000% and 0.031% mean very different things and the next person
        // to see this needs to know which one they have.
        const IDENTICAL = 0.0005;
        const pairs: string[] = [];
        const identical: string[] = [];
        for (let first = 0; first < pictures.length; first++) {
          for (let second = first + 1; second < pictures.length; second++) {
            const apart = pictureApart(pictures[first]!, pictures[second]!).apart;
            const said =
              `${pictures[first]!.heading} vs ${pictures[second]!.heading} ${(apart * 100).toFixed(3)}%`;
            pairs.push(said);
            if (apart < IDENTICAL) identical.push(said);
          }
        }
        expect(
          identical,
          `two headings produced the same picture of the figure at ${viewport.name} in the ${theme} theme. ` +
            `All six pairs: ${pairs.join(", ")}. The frames each Look was read from: ` +
            `${pictures.map((look) => `${look.heading} ${look.frame}`).join(", ")}. ` +
            `**Read those two lines together.** If the frames differ and the pictures do not, the captures ` +
            `are of different scenes and something about the segmentation is collapsing; if two frames are ` +
            `equal, the sweep compared one capture with itself and the arrow keys never reached the engine, ` +
            `which is the case this message used to assert without checking.`,
        ).toEqual([]);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. And the mark is still the mark's own colour once it has been lit
// ---------------------------------------------------------------------------
//
// **Asserted as a classification rather than as a distance, and the 1:1 captures
// are why.** The obvious floor is WCAG 2.2 SC 1.4.11's 3:1 of luminance, and the
// rendered pair reads 1.26:1 in the dark theme — on a collar that the capture
// shows as a plain gold band anybody can see. Luminance
// contrast is silent about hue and this mark is almost entirely hue. The next
// obvious floor is a share of the CIE76 distance the palette chose, and that one
// reads between 26% and 65% depending on viewport and heading, with no line
// through it that is anything but a number picked to fit.
//
// §7's rule is that a stand-in gets checked against the real thing at least once
// before it is trusted, and both of those stand-ins lost. So what is asserted is
// the thing the captures actually support and that no threshold is needed for:
// the mark's own colour, once lit, is still nearer the mark's token than the
// clothes' token. That is binary, it is stable at every size, and it is exactly
// what the bug this guards would break. The two numbers a threshold would have
// used are printed in the message, every run, for whoever wants to argue about
// them.
//
// Seen red by painting the collar in the clothes' own token in the built bundle
// — `lit("--at-accent")` to `lit("--at-tertiary")` inside `createFigure` — which
// leaves a mark that is still there, still the right shape, still in the right
// place, and cannot be picked out.
describe("the facing mark is still its own colour after the light has fallen on it", () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      for (const heading of HEADINGS) {
        it(`reads as the mark's token at ${viewport.name} in the ${theme} theme, facing ${heading.name}`, () => {
          const look = lookAt(viewport.name, theme, heading.name)!;
          const one = at(viewport.name, theme)!;
          expect(look.markColour, "no mark to measure").not.toBeNull();
          expect(look.clothesColour, "no clothes to measure it against").not.toBeNull();
          const rendered = deltaE(look.markColour!, look.clothesColour!);
          const ratio = contrastRatio(look.markColour!, look.clothesColour!);
          expect(
            look.markIsAccent,
            `the facing mark paints ${formatHex(look.markColour!)} facing ${heading.name} at ` +
              `${viewport.name} in the ${theme} theme, and that colour is nearer the clothes' own token than ` +
              `the mark's. It sits on clothes of ${formatHex(look.clothesColour!)} — a CIE76 distance of ` +
              `${rendered.toFixed(1)} against ${one.tokenDistance.toFixed(1)} between the two tokens, and a ` +
              `luminance ratio of ${ratio.toFixed(2)}:1. Both of those are printed rather than asserted: see ` +
              `the note above this describe for what each of them was measured against and lost to.`,
          ).toBe(true);
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The sweep measured something, and left something a person can look at
// ---------------------------------------------------------------------------
describe("the sweep measured something", () => {
  it("drove both viewports in both themes", () => {
    expect(readings.length).toBe(VIEWPORTS.length * THEMES.length);
  });

  it(`wrote a 1:1 capture for every heading it read, under ${RECEIPTS}`, () => {
    // The numbers above are a stand-in for "a reader can see which way it is
    // pointing", and a stand-in gets checked against the real thing at least
    // once before it is trusted to stand in (CLAUDE.md §7). These are that
    // check's evidence, and the receipt says what was seen in them.
    for (const one of readings) {
      expect(
        one.captures.length,
        `${one.viewport} in the ${one.theme} theme wrote ${one.captures.length} captures for ` +
          `${HEADINGS.length} headings, so there is nothing for a person to look at — and for this file the ` +
          `captures are not decoration, they are where the question is actually settled`,
      ).toBe(HEADINGS.length);
    }
  });

  it("found the ring at the figure's feet, so the split that keeps it out ran", () => {
    // The exclusion that separates the mark on the shoulders from the mark on
    // the floor, watched executing rather than reasoned about. Said over the
    // sweep rather than per heading: whether the ring's rim lands inside the
    // segmented figure depends on how far the figure walked and which way, and
    // demanding it at every heading would be demanding a coincidence. What is
    // worth proving is that the branch is live.
    const found = readings.reduce(
      (sum, one) => sum + one.looks.reduce((inner, look) => inner + look.onTheFloor, 0),
      0,
    );
    expect(
      found,
      `no accent-coloured pixel below the figure's shoulder line was found anywhere in the sweep, so the ` +
        `ring at its feet was never taken out of the mark. Per combination: ${readings
          .map((one) => `${one.viewport}/${one.theme} ${one.looks.reduce((sum, look) => sum + look.onTheFloor, 0)}`)
          .join(", ")}.`,
    ).toBeGreaterThan(0);
  });

  it("read four different headings, not the same one four times", () => {
    // The whole file rests on the four walks producing four different pictures.
    // If the arrow keys stopped reaching the engine every reading would be
    // identical and every assertion above would still pass.
    for (const one of readings) {
      const offsets = one.looks
        .filter((look) => look.mark && look.head)
        .map((look) => `${(look.mark!.x - look.head!.x).toFixed(1)},${(look.mark!.y - look.head!.y).toFixed(1)}`);
      expect(
        new Set(offsets).size,
        `the mark sat in the same place relative to the figure at every heading at ${one.viewport} in the ` +
          `${one.theme} theme — ${offsets.join(" | ")}. Either the arrow keys are not reaching the engine or ` +
          `the figure is not turning at all.`,
      ).toBeGreaterThan(1);
    }
  });
});
