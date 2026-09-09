// The weight bar's labels, measured on the rendered page in a real browser.
//
// spec/palette.test.ts already proves the four phase fills each carry an ink
// token that clears AA on them. That check passed for days while the bar on the
// home page and /assessments/ painted its labels in `var(--at-black)` and
// nothing on the site referenced those tokens at all --- token arithmetic is
// self-consistent by construction, and says nothing about whether a page ever
// asks for the token. So this is the other half: open the pages a marker opens,
// at both marking viewports and in both themes, sample the colour the
// compositor actually produced under each label, and read the ink off the same
// element's computed style.
//
// Why not the build's axe pass: it runs inside JSDOM, which has no layout and no
// computed colour, so its contrast rules never fire --- "59 pages, no
// accessibility violations" was printed on every build that shipped the bug.
//
// The bar is not four segments, whatever WeightBar.astro's comment says: it is
// one per published assessment, and which phases turn up depends on which weeks
// the assessments close. At the time of writing there is no rig segment at all,
// which matters --- the rig gold is the one fill a black label would have
// cleared. So the sweep enumerates what the page actually rendered and names
// each segment it measured, rather than asserting a shape the content is free
// to change.
//
// Where the sampling goes wrong, and what stops it here:
//   - hitting a child. The label text lives in two spans inside the <a>, and a
//     point that lands on a glyph reads the ink, not the fill. Every painted
//     descendant box and every painted text run's own client rects are keep-out,
//     and `document.elementFromPoint` has to come back as the <a> itself.
//   - hitting a border. A previous round sampled a 3px rule and sent me looking
//     for a bug in code that was fine, so the candidate box is inset past the
//     <a>'s own border widths before any point is considered.
//   - being blocked by text that is not there. The phone rules shrink both
//     labels to a clipped 1×1 box whose text still lays out at full width and
//     overflows the whole segment. Those rects are excluded, which is the only
//     reason a 13px-tall phone segment can be sampled at all.
//   - measuring nothing. The phone layout moves the words to a legend on the
//     page ground, so a sweep that only walked segments with text on them could
//     pass by finding none. Each viewport asserts which of the two situations it
//     is in, and a closing test demands that the desktop pass measured every
//     segment on both pages in both themes.

import { describe, expect, it } from "vitest";
import { AA_BODY_TEXT, contrastRatio } from "astro-theme-university/contrast";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import {
  formatHex,
  opaque,
  RESOLVE_COLOUR,
  serveBuild,
  Tab,
  type ColourScheme,
  type Resolved,
  type Rgb,
} from "./lib/chrome.ts";

/** What the compositor does: a partly transparent ink over an opaque fill, in
 *  sRGB's own gamma space, which is where a browser blends. */
const over = (ink: Rgb, alpha: number, fill: Rgb): Rgb =>
  ink.map((channel, index) => channel * alpha + fill[index]! * (1 - alpha)) as Rgb;

/** The two pages the bar appears on: standalone under the home page's "at a
 *  glance", and inside `.assessment-board` on the assessment index, where it is
 *  cross-linked with the cards. Different containers, same component. */
const PAGES = [
  { name: "the home page", path: "" },
  { name: "the assessment index", path: "assessments/" },
] as const;

/** The marking viewports, fixed (CLAUDE.md §1). `labelled` is what the layout
 *  is supposed to do with the words at that width, and is asserted either way. */
const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080, labelled: true },
  { name: "phone 390×844", width: 390, height: 844, labelled: false },
] as const;

const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** One label painted on the fill, with the opacity it is painted at ---
 *  `.weight-bar__weight` runs at 0.85, which thins its ink towards the fill and
 *  is invisible to anything that only reads `color`. */
interface Label {
  name: string;
  alpha: number;
  ink: Resolved;
}

interface Probe {
  /** Which phase fill this segment wears, and which assessment it is. */
  phase: string;
  label: string;
  /** Viewport CSS pixels, chosen inside the <a>, clear of painted text and of
   *  the element's own borders. */
  point: { x: number; y: number } | null;
  why: string;
  labelled: boolean;
  /** The <a>'s own opacity. The model below composites each label over the fill,
   *  which is only the whole story while the link itself is fully opaque. */
  linkOpacity: number;
  labels: Label[];
  /** The declared fill, resolved to sRGB by the page's own canvas. */
  fill: Resolved | null;
}

interface Reading extends Probe {
  page: string;
  viewport: string;
  theme: ColourScheme;
  /** The composited colour under the label, straight off a 1×1 screenshot. */
  pixel: Rgb | null;
  /** The scroll offset when the points were read, and again once every pixel
   *  had been sampled. A difference invalidates every coordinate above. */
  scrolledBefore: { x: number; y: number };
  scrolledAfter: { x: number; y: number };
}

/** Runs in the page; returns one Probe per rendered segment, in document order. */
const PROBE = String.raw`
  ${RESOLVE_COLOUR}
  const bar = document.querySelector(".weight-bar");
  if (!bar) return { scroll: { x: scrollX, y: scrollY }, segments: [] };

  // Scrolled exactly once, here. Doing it per segment is the trap that cost an
  // afternoon: the points are read in the browser but sampled from Node a
  // moment later, so a scroll between the two silently shifts every recorded
  // coordinate and the sampler reads whatever moved into its place. The bar is
  // a single row, so one scroll puts all of it on screen.
  bar.scrollIntoView({ block: "center", behavior: "instant" });

  const painted = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 2 && rect.height > 2 &&
      style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
    );
  };

  const segments = [...bar.querySelectorAll("li.weight-bar__segment")].map((item) => {
    const phase = (/weight-bar__segment--([a-z]+)/.exec(item.className) || [, "?"])[1];
    const link = item.querySelector("a");
    const label = (link ? link.textContent : "").trim().replace(/\s+/g, " ");
    if (!link) return { phase, label, point: null, why: "the segment has no link", labelled: false, linkOpacity: 1, labels: [], fill: null };

    const style = getComputedStyle(link);
    const box = link.getBoundingClientRect();

    // Is there text on the fill here, or has the layout hidden it? Size is the
    // test that holds however it was hidden.
    const labels = [...link.querySelectorAll(".weight-bar__title, .weight-bar__weight")];
    const labelled = labels.some(painted);
    const hidden = labels.filter((span) => !painted(span));

    // Opacity multiplies down the tree, so a label's real ink is its colour
    // thinned towards whatever is behind it. Collected up to the link, whose own
    // opacity is reported separately because it would dim the fill too.
    const painting = labels.filter(painted).map((span) => {
      let alpha = 1;
      for (let node = span; node && node !== link; node = node.parentElement) {
        alpha *= Number(getComputedStyle(node).opacity);
      }
      return { name: span.className, alpha, ink: resolveColour(getComputedStyle(span).color) };
    });
    const insideHidden = (node) => hidden.some((span) => span === node || span.contains(node));

    const keepOut = [];
    for (const node of link.querySelectorAll("*")) {
      if (insideHidden(node)) continue;
      keepOut.push(...node.getClientRects());
    }
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.nodeValue || !text.nodeValue.trim()) continue;
      if (insideHidden(text.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      keepOut.push(...range.getClientRects());
    }
    const clearOf = (x, y) =>
      keepOut.every((r) => x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2);

    // Inset past the element's own borders, plus a pixel for the edge itself.
    const inset = (side) => parseFloat(style["border" + side + "Width"]) + 1;
    const left = box.left + inset("Left");
    const right = box.right - inset("Right");
    const top = box.top + inset("Top");
    const bottom = box.bottom - inset("Bottom");

    let point = null;
    let why = "no point inside the fill is clear of its own text";
    const STEPS = 12;
    for (let row = 0; row <= STEPS && !point; row++) {
      for (let col = 0; col <= STEPS && !point; col++) {
        const x = Math.round(left + ((right - left) * col) / STEPS);
        const y = Math.round(top + ((bottom - top) * row) / STEPS);
        if (x < left || x > right || y < top || y > bottom) continue;
        if (!clearOf(x, y)) continue;
        if (document.elementFromPoint(x, y) !== link) {
          why = "every clear point inside the fill is covered by something else";
          continue;
        }
        point = { x, y };
      }
    }
    if (point) why = "";

    return { phase, label, point, why, labelled, linkOpacity: Number(style.opacity), labels: painting, fill: resolveColour(style.backgroundColor) };
  });

  return { scroll: { x: scrollX, y: scrollY }, segments };
`;

/** One browser, one pass, every combination --- run at collection time so the
 *  tests below can be generated from the segments the page really rendered. */
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

          const { scroll, segments } = await tab.evaluate<{
            scroll: { x: number; y: number };
            segments: Probe[];
          }>(PROBE);

          const sampled: Array<Omit<Reading, "scrolledAfter">> = [];
          for (const probe of segments) {
            sampled.push({
              ...probe,
              page: page.name,
              viewport: viewport.name,
              theme,
              pixel: probe.point ? await tab.pixel(probe.point.x, probe.point.y) : null,
              scrolledBefore: scroll,
            });
          }
          const after = await tab.evaluate<{ x: number; y: number }>("return { x: scrollX, y: scrollY };");
          readings.push(...sampled.map((reading) => ({ ...reading, scrolledAfter: after })));
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

/** The segments as the first page rendered them, used to name the tests. Every
 *  other combination has to produce the same list. */
const SEGMENTS = readings
  .filter((r) => r.page === PAGES[0].name && r.viewport === VIEWPORTS[0].name && r.theme === THEMES[0])
  .map((r, index) => ({ index, phase: r.phase, label: r.label }));

describe.each(PAGES)("the weight bar on $name", ({ name: page }) => {
  describe.each(VIEWPORTS)("at $name", ({ name: viewport, labelled }) => {
    describe.each(THEMES)("in the %s theme", (theme) => {
      it("renders the same segments as every other pass", () => {
        const here = readings.filter((r) => r.page === page && r.viewport === viewport && r.theme === theme);
        expect(here.map((r) => `${r.phase}:${r.label}`)).toEqual(
          SEGMENTS.map((s) => `${s.phase}:${s.label}`),
        );
      });

      for (const segment of SEGMENTS) {
        it(`the ${segment.phase} segment for ${segment.label}`, () => {
          const reading = readings.filter(
            (r) => r.page === page && r.viewport === viewport && r.theme === theme,
          )[segment.index]!;

          // Every coordinate above is relative to this scroll offset, so if the
          // page moved between reading them and sampling them, nothing below
          // means anything.
          expect(reading.scrolledAfter, "the page scrolled while the pixels were being sampled").toEqual(
            reading.scrolledBefore,
          );

          expect(
            reading.point,
            `could not sample the ${reading.phase} segment for ${reading.label}: ${reading.why}`,
          ).not.toBeNull();
          expect(reading.pixel, `no pixel came back for ${reading.label}`).not.toBeNull();
          const fill = reading.pixel!;

          // The fill is opaque and nothing sits over it, so the composited
          // colour and the declared one agree. If they ever stop agreeing the
          // pixel is the true reading, and this says which is which.
          expect(
            formatHex(fill),
            `${reading.label}'s composited fill should match its declared background`,
          ).toBe(formatHex(opaque(reading.fill!, `${reading.label}'s background`)));

          if (!labelled) {
            // The phone layout moves the words to the legend below the bar, on
            // the page ground. Asserted, not assumed: if a label turns up here,
            // the contrast branch below is what should have run.
            expect(
              reading.labelled,
              `${reading.label} paints a label on its fill at ${viewport}, so it needs the contrast check`,
            ).toBe(false);
            return;
          }

          // The composite below is ink over fill, which is only the whole story
          // while the link itself is opaque.
          expect(reading.linkOpacity, `${reading.label}'s link is not fully opaque`).toBe(1);

          // Both labels, or the loop below could check one and call it done ---
          // a mistyped selector would otherwise read as a pass.
          expect(
            reading.labels.map((l) => l.name).sort(),
            `${reading.label} should paint both its title and its weight on the fill`,
          ).toEqual(["weight-bar__title", "weight-bar__weight"]);

          for (const label of reading.labels) {
            const ink = over(opaque(label.ink, `${label.name}'s colour`), label.alpha, fill);
            const ratio = contrastRatio(ink, fill);
            expect(
              ratio,
              `the ${reading.phase} segment's ${label.name} for ${reading.label} paints ` +
                `${formatHex(ink)}${label.alpha === 1 ? "" : ` (its colour at ${label.alpha} opacity)`} on ` +
                `${formatHex(fill)} — ${ratio.toFixed(2)}:1, and AA body text needs ${AA_BODY_TEXT}:1. ` +
                `A phase colour is a fill, so the label takes that fill's own ink token (CLAUDE.md §7).`,
            ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
          }
        });
      }
    });
  });
});

// The sweep must not be able to pass by measuring nothing: the failure mode of
// everything above is a layout change that hides every label, after which all
// the desktop cases take the phone branch and the suite stays green.
describe("the sweep measured something", () => {
  it("found the bar, with a segment per published assessment", () => {
    expect(SEGMENTS.length, "the weight bar renders one segment per assessment").toBeGreaterThanOrEqual(4);
  });

  it("has text on every fill at the desktop viewport, on both pages and in both themes", () => {
    const measured = readings.filter((r) => r.viewport === VIEWPORTS[0].name && r.labelled);
    expect(measured.length).toBe(SEGMENTS.length * PAGES.length * THEMES.length);
  });

  it("covers every phase the bar actually uses", () => {
    const phases = new Set(SEGMENTS.map((s) => s.phase));
    expect(phases.size, `the bar uses ${[...phases].join(", ")}`).toBeGreaterThanOrEqual(2);
  });
});
