// The phase chips' white text, measured on the rendered page in a real browser.
//
// Second half of the job spec/weight-bar-contrast.test.ts started. That one
// covers a flat fill: one colour under the label, so one sample says everything
// about it. `.phase-chip` is the harder case and the reason this file is
// separate — it paints a *gradient*, so contrast varies continuously across the
// same element and a single sample is a number about one pixel, not about the
// component. Sampling the middle of a chip and calling it measured is the
// mistake this file exists to not make.
//
// What was wrong when this was written: the chips ran the gradient from the raw
// phase colour to a 55% mix with black, and the rig chip's bright end is the
// Slop gold itself — 3.49:1 under white. That passed nothing except WCAG's
// large-text threshold, and only because the chip happens to be an <h2>: it is
// styling, not a contract, and the day the type scale moves the heading under
// 24px the chips go unreadable with every check still green. So this asserts
// the flat 4.5:1 body-text ratio, with no large-text exemption anywhere in it.
//
// How the worst case is found, since it is the whole point:
//   - The declared stops. Chrome resolves `background-image` at computed-value
//     time, so `color-mix(...)` and the relative-colour `--phase-episode` come
//     back as concrete colours — read off the element, not restated here, which
//     is what keeps this from being the token arithmetic CLAUDE.md §7 warns
//     about. The brightest stop is the gradient's true worst case, including the
//     corner the radius makes unsampleable.
//   - The painted pixels. A grid of points inside the chip, clear of its own
//     glyphs, sampled from the compositor; the brightest wins. This is what
//     proves the declared stops are what the page actually paints — the failure
//     the weight bar taught, where four correct tokens sat next to a page that
//     referenced none of them.
// The ink is then composited over the brighter of those two, so neither reading
// can let the other through.
//
// Three things the sampling has to get right, each of them learned the hard way
// in the weight bar (CLAUDE.md §7):
//   - Keep out of the element's own text. `.phase-chip__weeks` also runs at 0.85
//     opacity, which thins its white towards the fill and is invisible to
//     anything that only reads `color`, so each text run carries the opacity
//     accumulated up to the chip.
//   - Inset past the border-radius. These are 999px pills, so most of both ends
//     is outside the painted shape, and a rounded corner's antialiased blend
//     with the page behind it is exactly the lightest pixel a worst-case search
//     goes hunting for. `elementFromPoint` alone does not save you here: it
//     answers true on the antialiased edge.
//   - Read every point at one scroll position. The four chips sit thousands of
//     pixels apart, so unlike the weight bar this cannot scroll once for all of
//     them; it scrolls per chip and re-reads the offset after sampling, and a
//     difference retakes the reading rather than quietly moving every coordinate
//     (`whileStill`, which this file's arrival is what forced — see there).

import { describe, expect, it } from "vitest";
import { AA_BODY_TEXT, contrastRatio, relativeLuminance } from "astro-theme-university/contrast";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import {
  formatHex,
  opaque,
  RESOLVE_COLOUR,
  serveBuild,
  Tab,
  whileStill,
  type ColourScheme,
  type Resolved,
  type Rgb,
} from "./lib/chrome.ts";

/** What the compositor does: a partly transparent ink over an opaque fill, in
 *  sRGB's own gamma space, which is where a browser blends. */
const over = (ink: Rgb, alpha: number, fill: Rgb): Rgb =>
  ink.map((channel, index) => channel * alpha + fill[index]! * (1 - alpha)) as Rgb;

/** The two pages that group by phase and head each group with a chip. */
const PAGES = [
  { name: "the lecture index", path: "lectures/" },
  { name: "the deck index", path: "decks/" },
] as const;

/** The marking viewports, fixed (CLAUDE.md §1). Unlike the weight bar, a chip
 *  carries its text at both — a heading has nowhere else to put it. */
const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** One run of text painted on the fill, with the opacity it is painted at. */
interface Ink {
  /** Where the ink came from, for the failure message: a class, or the chip. */
  source: string;
  text: string;
  alpha: number;
  colour: Resolved;
}

interface Point {
  x: number;
  y: number;
}

/** Everything read out of the page for one chip, before any pixel is sampled. */
interface Probe {
  phase: string;
  label: string;
  /** Every colour stop of the computed `background-image`, resolved to sRGB by
   *  the page's own canvas; the `background-color` when there is no gradient. */
  stops: Resolved[];
  /** How the fill was described, quoted in failures so a surprise is legible. */
  declared: string;
  inks: Ink[];
  /** The chip's own opacity: the model below is ink over fill, which is only the
   *  whole story while the chip itself is fully opaque. */
  chipOpacity: number;
  /** Viewport CSS pixels, inside the pill, clear of glyphs and of the radius. */
  points: Point[];
  why: string;
  scroll: Point;
}

interface Reading extends Probe {
  page: string;
  viewport: string;
  theme: ColourScheme;
  /** The composited colour at each point above, in the same order. */
  pixels: Rgb[];
  scrolledAfter: Point;
}

/** Lists the chips without touching the scroll, so the sweep below knows how
 *  many times to run the probe and what to call each one. */
const LIST = String.raw`
  return [...document.querySelectorAll(".phase-chip")].map((chip) => ({
    phase: (/phase-chip--([a-z]+)/.exec(chip.className) || [, "?"])[1],
    label: chip.textContent.trim().replace(/\s+/g, " "),
  }));
`;

/** Runs in the page for one chip, identified by index. Scrolls it into view,
 *  then reports the fill as declared, the inks on it, and where it is safe to
 *  read a pixel. */
const probeFor = (index: number) => String.raw`
  ${RESOLVE_COLOUR}
  const chip = document.querySelectorAll(".phase-chip")[${index}];

  // Scrolled exactly once per chip, here, because the points are read in the
  // browser and sampled from Node a moment later. The caller re-reads this
  // offset afterwards and fails the case if it moved.
  chip.scrollIntoView({ block: "center", behavior: "instant" });

  const style = getComputedStyle(chip);
  const box = chip.getBoundingClientRect();
  const phase = (/phase-chip--([a-z]+)/.exec(chip.className) || [, "?"])[1];
  const label = chip.textContent.trim().replace(/\s+/g, " ");

  // --- the fill, as the page declares it -----------------------------------
  //
  // Splitting the gradient's arguments rather than regexing colours out of it:
  // a stop can be any colour syntax, and --phase-episode serialises as oklch()
  // while the mixes serialise as oklab(). CSS.supports asks the browser which
  // tokens are colours, so nothing here has to know.
  const topLevelSplit = (text, separator) => {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (character === "(") depth++;
      else if (character === ")") depth--;
      else if (depth === 0 && separator.test(character)) {
        if (i > start) parts.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    if (start < text.length) parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  };

  const gradientStops = (value) => {
    const open = value.indexOf("(");
    if (open < 0) return [];
    let depth = 0;
    let close = -1;
    for (let i = open; i < value.length; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")" && --depth === 0) { close = i; break; }
    }
    if (close < 0) return [];
    const colours = [];
    for (const argument of topLevelSplit(value.slice(open + 1, close), /,/)) {
      // A stop is a colour, optionally followed by one or two positions.
      const token = topLevelSplit(argument, /\s/).find((part) => CSS.supports("color", part));
      if (token) colours.push(resolveColour(token));
    }
    return colours;
  };

  const stops = style.backgroundImage === "none"
    ? [resolveColour(style.backgroundColor)]
    : gradientStops(style.backgroundImage);
  const declared = style.backgroundImage === "none" ? style.backgroundColor : style.backgroundImage;

  // --- the ink on it --------------------------------------------------------
  //
  // Walked as text runs rather than by selector: the chip paints its own text
  // node ("The Rig") and a span at 0.85 opacity ("Weeks 1-2"), and a selector
  // list that names them is a selector list that goes stale silently.
  const painted = (element) => {
    const rect = element.getBoundingClientRect();
    const declaredStyle = getComputedStyle(element);
    return (
      rect.width > 2 && rect.height > 2 &&
      declaredStyle.display !== "none" && declaredStyle.visibility !== "hidden" &&
      Number(declaredStyle.opacity) > 0
    );
  };

  const inks = [];
  const keepOut = [];
  const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const parent = node.parentElement;
    if (!painted(parent)) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    keepOut.push(...range.getClientRects());

    // Opacity multiplies down the tree, so a run's real ink is its colour
    // thinned towards whatever is behind it. Accumulated up to the chip, whose
    // own opacity is reported separately because it would dim the fill too.
    let alpha = 1;
    for (let element = parent; element && element !== chip; element = element.parentElement) {
      alpha *= Number(getComputedStyle(element).opacity);
    }
    inks.push({
      source: parent === chip ? "the chip's own text" : parent.className || parent.tagName.toLowerCase(),
      text: node.nodeValue.trim().replace(/\s+/g, " "),
      alpha,
      colour: resolveColour(getComputedStyle(parent).color),
    });
  }
  // Anything else painted inside the chip is keep-out too, text or not.
  for (const descendant of chip.querySelectorAll("*")) {
    if (painted(descendant)) keepOut.push(...descendant.getClientRects());
  }

  // --- where a pixel can honestly be read -----------------------------------
  //
  // The pill's corner radius, clamped the way the used value is: a 999px radius
  // on a 76px-tall box is a 38px radius, and everything outside those arcs is
  // page background wearing an antialiased edge of chip.
  const MARGIN = 3;
  const cap = Math.min(box.width, box.height) / 2;
  const radius = (corner) => Math.min(parseFloat(style["border" + corner + "Radius"]) || 0, cap);
  const corners = [
    { r: radius("TopLeft"), cx: box.left, cy: box.top, sx: 1, sy: 1 },
    { r: radius("TopRight"), cx: box.right, cy: box.top, sx: -1, sy: 1 },
    { r: radius("BottomRight"), cx: box.right, cy: box.bottom, sx: -1, sy: -1 },
    { r: radius("BottomLeft"), cx: box.left, cy: box.bottom, sx: 1, sy: -1 },
  ].map((corner) => ({ ...corner, centreX: corner.cx + corner.sx * corner.r, centreY: corner.cy + corner.sy * corner.r }));

  const insidePill = (x, y) => {
    if (x < box.left + MARGIN || x > box.right - MARGIN) return false;
    if (y < box.top + MARGIN || y > box.bottom - MARGIN) return false;
    for (const corner of corners) {
      const inCornerBox =
        (corner.sx === 1 ? x < corner.centreX : x > corner.centreX) &&
        (corner.sy === 1 ? y < corner.centreY : y > corner.centreY);
      if (inCornerBox && Math.hypot(x - corner.centreX, y - corner.centreY) > corner.r - MARGIN) return false;
    }
    return true;
  };

  const clearOfText = (x, y) =>
    keepOut.every((rect) => x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2);

  // A grid over the inset box, plus the four corner-most points there are: the
  // spot on each inset arc at 45 degrees. Those matter more than the grid does,
  // and the first run without them is why they are here — at the desktop
  // viewport the heading's own line box is nearly the full height of the pill,
  // so the only grid points left clear of glyphs are the ones out to the right
  // of the words, which on a 135deg gradient is its *dark* end. The chip's
  // padding leaves the corner itself clear of text, so that is where a sample
  // gets closest to the bright end.
  //
  // A linear gradient's brightest point is always at an extreme of the shape
  // along its own axis, and the extremes below are taken along the four
  // 45-degree families, so this reaches the bright end for any of the eight
  // angles a stylesheet is likely to use without this file having to parse the
  // angle out and then depend on it.
  const candidates = [];
  const consider = (x, y) => {
    x = Math.round(x);
    y = Math.round(y);
    if (!insidePill(x, y) || !clearOfText(x, y)) return;
    if (document.elementFromPoint(x, y) !== chip) return;
    if (candidates.some((point) => point.x === x && point.y === y)) return;
    candidates.push({ x, y });
  };

  // Walked inward a few pixels rather than taken once, because a point exactly
  // on the inset arc rounds to an integer that can land a hundredth of a pixel
  // outside it and be dropped without a word. That happened: the rig chip's
  // brightest sample was coming from the *bottom* left corner, 4 counts darker,
  // and the check still passed — quietly measuring something other than what it
  // says it measures. The first of these to be accepted is the corner-most one.
  const DIAGONAL = Math.SQRT1_2;
  for (const corner of corners) {
    for (let back = 0; back <= 3; back++) {
      const reach = Math.max(corner.r - MARGIN - back, 0);
      consider(corner.centreX - corner.sx * reach * DIAGONAL, corner.centreY - corner.sy * reach * DIAGONAL);
    }
  }

  const COLUMNS = 24;
  const ROWS = 8;
  const left = box.left + MARGIN;
  const top = box.top + MARGIN;
  const width = Math.max(box.width - 2 * MARGIN, 0);
  const height = Math.max(box.height - 2 * MARGIN, 0);
  for (let row = 0; row <= ROWS; row++) {
    for (let column = 0; column <= COLUMNS; column++) {
      consider(left + (width * column) / COLUMNS, top + (height * row) / ROWS);
    }
  }

  const extremeBy = (score) =>
    candidates.reduce((best, point) => (score(point) < score(best) ? point : best), candidates[0]);
  const chosen = [];
  const take = (point) => {
    if (point && !chosen.some((already) => already.x === point.x && already.y === point.y)) chosen.push(point);
  };
  if (candidates.length) {
    take(extremeBy((p) => p.x + p.y));
    take(extremeBy((p) => -(p.x + p.y)));
    take(extremeBy((p) => p.x - p.y));
    take(extremeBy((p) => p.y - p.x));
    const stride = Math.max(1, Math.ceil(candidates.length / 16));
    for (let i = 0; i < candidates.length; i += stride) take(candidates[i]);
  }

  return {
    phase,
    label,
    stops,
    declared,
    inks,
    chipOpacity: Number(style.opacity),
    points: chosen,
    why: chosen.length ? "" : "no point inside the pill is clear of its own text",
    scroll: { x: scrollX, y: scrollY },
  };
`;

/** One browser, one pass, every combination — run at collection time so the
 *  tests below can be generated from the chips the page really rendered. */
async function sweep(): Promise<Reading[]> {
  const { base } = resolveDeployment(process.env, gitOrigin);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const readings: Reading[] = [];

  try {
    for (const page of PAGES) {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          await tab.viewport(viewport.width, viewport.height);
          await tab.colourScheme(theme);
          await tab.goto(`${site.origin}${prefix}${page.path}`);
          // What the footer toggle does (the theme stores the choice and sets
          // the attribute); the emulated media query covers a first visit.
          await tab.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return null;`);
          await tab.settle();

          const chips = await tab.evaluate<Array<{ phase: string; label: string }>>(LIST);
          for (let index = 0; index < chips.length; index++) {
            const reading = await whileStill(tab, async () => {
              const probe = await tab.evaluate<Probe>(probeFor(index));
              const pixels: Rgb[] = [];
              for (const point of probe.points) pixels.push(await tab.pixel(point.x, point.y));
              return { ...probe, pixels };
            });
            readings.push({ ...reading, page: page.name, viewport: viewport.name, theme });
          }
        }
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return readings;
}

const readings = await sweep();

/** The chips as the first combination rendered them, used to name the tests.
 *  Every other combination has to produce the same list. */
const CHIPS = readings
  .filter((r) => r.page === PAGES[0].name && r.viewport === VIEWPORTS[0].name && r.theme === THEMES[0])
  .map((r, index) => ({ index, phase: r.phase, label: r.label }));

describe.each(PAGES)("the phase chips on $name", ({ name: page }) => {
  describe.each(VIEWPORTS)("at $name", ({ name: viewport }) => {
    describe.each(THEMES)("in the %s theme", (theme) => {
      const here = () => readings.filter((r) => r.page === page && r.viewport === viewport && r.theme === theme);

      it("renders the same chips as every other pass", () => {
        expect(here().map((r) => `${r.phase}:${r.label}`)).toEqual(CHIPS.map((c) => `${c.phase}:${c.label}`));
      });

      for (const chip of CHIPS) {
        it(`the ${chip.phase} chip`, () => {
          const reading = here()[chip.index]!;

          // Every coordinate below is relative to this scroll offset, so if the
          // page moved between reading them and sampling them, nothing else here
          // means anything.
          expect(reading.scrolledAfter, "the page scrolled while the pixels were being sampled").toEqual(
            reading.scroll,
          );

          expect(
            reading.points.length,
            `could not sample the ${reading.phase} chip: ${reading.why}`,
          ).toBeGreaterThanOrEqual(4);

          // The composite below is ink over fill, which is only the whole story
          // while the chip itself is opaque.
          expect(reading.chipOpacity, `the ${reading.phase} chip is not fully opaque`).toBe(1);

          // Both runs of text, or the loop below could check one and call it
          // done — the weeks span is the one painted at reduced opacity, so a
          // walker that missed it would drop the thinner of the two inks.
          expect(
            reading.inks.map((ink) => ink.source).sort(),
            `the ${reading.phase} chip should paint its own heading text and the weeks span`,
          ).toEqual(["phase-chip__weeks", "the chip's own text"]);

          // The fill is a gradient, so contrast varies across the element and a
          // single reading is not a statement about the chip.
          expect(
            reading.stops.length,
            `the ${reading.phase} chip's fill is "${reading.declared}", which resolved to ` +
              `${reading.stops.length} colour stop(s); a gradient needs at least two`,
          ).toBeGreaterThanOrEqual(2);

          const declaredStops = reading.stops.map((stop, index) =>
            opaque(stop, `stop ${index + 1} of the ${reading.phase} chip's fill`),
          );
          const sampled = reading.pixels;
          const brightest = (colours: Rgb[]): Rgb =>
            colours.reduce((best, colour) => (relativeLuminance(colour) > relativeLuminance(best) ? colour : best));

          const brightestDeclared = brightest(declaredStops);
          const brightestSampled = brightest(sampled);

          // Did the sweep reach the bright end? The corner radius keeps a sample
          // a few percent short of the true endpoint, so this cannot demand they
          // match — but a sample from the bright half of the gradient proves both
          // that the search found the right end and that the stops resolved above
          // are what the compositor is actually painting. A token nothing paints
          // is not a passing check (CLAUDE.md §7).
          const midpoint =
            (relativeLuminance(brightestDeclared) +
              relativeLuminance(
                declaredStops.reduce((dim, colour) =>
                  relativeLuminance(colour) < relativeLuminance(dim) ? colour : dim,
                ),
              )) /
            2;
          expect(
            relativeLuminance(brightestSampled),
            `the brightest pixel sampled inside the ${reading.phase} chip is ` +
              `${formatHex(brightestSampled)}, dimmer than the midpoint of its declared gradient ` +
              `(${declaredStops.map(formatHex).join(" → ")}) — the sweep did not reach the bright end, ` +
              `or the chip is not painting the fill it declares`,
          ).toBeGreaterThanOrEqual(midpoint);

          // The worst case is the brighter of the two readings: the declared end
          // the radius hides, or a pixel that came out brighter than anything
          // declared. Neither can let the other through.
          const worst = brightest([brightestDeclared, brightestSampled]);
          const from = worst === brightestSampled ? "sampled at" : "declared as";

          for (const ink of reading.inks) {
            const painted = over(opaque(ink.colour, `${ink.source}'s colour`), ink.alpha, worst);
            const ratio = contrastRatio(painted, worst);
            expect(
              ratio,
              `the ${reading.phase} chip paints "${ink.text}" in ${formatHex(painted)}` +
                `${ink.alpha === 1 ? "" : ` (its colour at ${ink.alpha} opacity)`} on the brightest end of its ` +
                `gradient, ${from} ${formatHex(worst)} — ${ratio.toFixed(2)}:1, and AA body text needs ` +
                `${AA_BODY_TEXT}:1. Not the large-text 3:1: the chip is a heading today, which is styling ` +
                `rather than a contract. A phase colour is a fill (CLAUDE.md §7), so the fix is to darken ` +
                `the gradient's bright end, not to re-ink the text.`,
            ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
          }
        });
      }
    });
  });
});

// The sweep must not be able to pass by measuring nothing: the failure mode of
// everything above is a page that stops rendering chips, after which every
// describe block generates no cases at all and the suite stays green.
describe("the sweep measured something", () => {
  it("found a chip for each of the four phases", () => {
    expect(CHIPS.map((c) => c.phase).sort()).toEqual(["episode", "generators", "holding", "rig"]);
  });

  it("sampled pixels for every chip in every combination", () => {
    const measured = readings.filter((r) => r.pixels.length >= 4);
    expect(measured.length).toBe(CHIPS.length * PAGES.length * VIEWPORTS.length * THEMES.length);
  });
});
