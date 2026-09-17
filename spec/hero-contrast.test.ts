// The home hero's text, measured on the composite in a real browser.
//
// Nothing in spec/ measured this surface before. An independent review grepped
// for it: the only file that mentioned `home-hero` read the text of one `<p>`.
// Six runs of type on the first screen of the first page a marker opens, over a
// video under a scrim, and the only thing watching them was the build's axe
// pass -- which runs in JSDOM with no layout and no computed colour, so its
// contrast rules cannot fire (CLAUDE.md §7). Two defects were living there:
//
//   - the outline button's label took `--at-brand-ink`, which is sized against
//     `--at-bg`. §5 keeps this stage dark in **both** themes on purpose, so in
//     the light theme the token flipped to the brand's copper while the surface
//     did not: 3.54:1 at 1920 and 3.25:1 at 390, against 4.5:1.
//   - the kicker asked for `--at-light-grey`, which is defined only in the
//     theme's `deck.css` -- a stylesheet this page does not load. An undefined
//     custom property is invalid at computed-value time, so `color` inherited:
//     near-white in the dark theme, which looked right, and near-black on the
//     same dark stage in the light one. **1.03:1.** Invisible, and it had been
//     for as long as the declaration had.
//
// Both were found by sampling, neither by reading the stylesheet, which is §7's
// whole point about a surface the palette does not own.
//
// Two things this file does differently from spec/phase-card-contrast.test.ts,
// both forced by what the hero is:
//
//   - **A run with no gap in it is sampled from just outside its own box.** The
//     card runs are block paragraphs with slack around the words; the kicker,
//     the buttons' labels and the calendar link are inline text whose client
//     rects cover their whole line box, so there is no point "inside and clear
//     of the glyphs" to take at all. The first version of this measurement
//     reported "no clear point" for four of its targets and would have passed
//     by measuring nothing. So where the inside offers nothing, a ring just
//     outside the box is read instead, and every ring point has to resolve to
//     the run itself or to something it sits inside -- otherwise the point is on
//     a sibling's fill and is about that instead.
//
//     The first version of this went further and refused any run whose points
//     disagreed by more than a few counts, on the reasoning that a ring across
//     two surfaces is a number about neither. That was the wrong instrument
//     here and it failed 15 of 35: this surface is a photograph under a
//     gradient scrim, so its points *do* disagree -- by 18 to 94 of 255 -- and
//     that is the picture, not an error. §5's arithmetic is that a scrim
//     reaching 0.88 is safe for **any** frame; the reading that tests it is the
//     worst point, not the agreeing one. The spread is reported in the failure
//     message and asserted on nothing.
//   - **Reduced motion is the state under test.** It pins `--p` to 0, which §5
//     says is the composition that has everything in it, and it is also what
//     pauses the loop -- so the frame under the text is the same frame twice
//     running. A hero measured mid-loop is one sample of a moving scene.
//
// **Seen red four ways**, each injection anchored inside the declaration or the
// function it breaks (a bare pattern gets fed by whatever else is in the file and
// turns into a no-op that reads exactly like a check gone blind -- §7):
//
//   - the kicker put back to `--at-light-grey` --- 2 failed | 33 passed:
//       kicker paints #191511 on #16120b  1.03:1  (light, 1920)
//       kicker paints #191511 on #17160f  1.00:1  (light, 390)
//   - the outline button's white ink removed --- 2 failed | 33 passed:
//       outline button #8a5c13 on #040404  3.54:1  (light, 1920)
//       outline button #8a5c13 on #181004  3.25:1  (light, 390)
//     Those are the two defects this file was written for, and they are its
//     reds: both were found by sampling the page and neither by reading the
//     stylesheet, which is why the numbers are in the commit that fixed them.
//   - the calendar link dropped from the hero --- 10 failed | 25 passed, "the
//     hero should offer the Studio, the backlot and the calendar". §5 requires
//     the pinned composition to keep every way out of itself, and until this
//     file there was nothing to notice one going missing.
//   - the sampling collapsed to a single candidate point --- 25 failed | 10
//     passed, "expected 0 to be greater than or equal to 5". The failure mode of
//     a worst-of-many reading is that "many" quietly becomes one.

import { describe, expect, it } from "vitest";
import { AA_BODY_TEXT, AA_LARGE_TEXT, compositeOver, contrastRatio } from "astro-theme-university/contrast";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import {
  formatHex,
  RESOLVE_COLOUR,
  serveBuild,
  Tab,
  whileStill,
  type ColourScheme,
  type Raster,
  type Resolved,
  type Rgb,
} from "./lib/chrome.ts";

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** The fewest points a run may be judged on. */
const LEAST_POINTS = 5;

interface Run {
  name: string;
  ink: Resolved;
  alpha: number;
  needs: number;
  fontPx: number;
  weight: number;
  /** "inside" when points came from within the run's own box, "around" when the
   *  run is solid text and the ring outside it was read instead. */
  how: string;
  points: { x: number; y: number }[];
  why: string;
}

interface Hero {
  runs: Run[];
  /** Every way out of the hero, which §5 requires the pinned composition to
   *  keep: two buttons and the calendar link. */
  links: { text: string; opacity: number; onScreen: boolean }[];
  /** The loop, which must not be playing while this is measured. */
  videoPaused: boolean | null;
  pinned: string;
}

const PROBE = String.raw`
  ${RESOLVE_COLOUR}
  const hero = document.querySelector(".home-hero");
  if (!hero) return null;
  window.scrollTo({ top: 0, behavior: "instant" });

  const painted = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 2 && rect.height > 2 && style.display !== "none" &&
      style.visibility !== "hidden" && Number(style.opacity) > 0;
  };

  // Every text rect on the hero, so a point taken outside one run does not land
  // on another's glyphs.
  const allText = [];
  const everything = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
  for (let t = everything.nextNode(); t; t = everything.nextNode()) {
    if (!t.nodeValue || !t.nodeValue.trim()) continue;
    if (!t.parentElement || !painted(t.parentElement)) continue;
    const r = document.createRange();
    r.selectNodeContents(t);
    allText.push(...r.getClientRects());
  }

  const TARGETS = [
    [".home-hero__kicker", "kicker"],
    [".home-hero__lead", "lead"],
    [".home-hero__word", "title word"],
    [".home-hero__actions .at-button:not(.at-button--outline)", "filled button"],
    [".home-hero__actions .at-button--outline", "outline button"],
    [".home-hero__aside a", "calendar link"],
  ];

  const runs = TARGETS.map(([selector, name]) => {
    const element = document.querySelector(selector);
    if (!element) return { name, ink: [0,0,0,1], alpha: 1, needs: 4.5, fontPx: 0, weight: 400, how: "missing", points: [], why: "no element matches " + selector };
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();

    let alpha = 1;
    for (let node = element; node; node = node.parentElement) alpha *= Number(getComputedStyle(node).opacity);

    const clearOf = (rects, x, y) =>
      rects.every((r) => x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2);

    const inset = (side) => parseFloat(style["border" + side + "Width"]) + 1;
    const onScreen = (x, y) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;

    // First: inside the run's own box, clear of every glyph.
    const inside = [];
    {
      const L = box.left + inset("Left"), R = box.right - inset("Right");
      const T = box.top + inset("Top"), B = box.bottom - inset("Bottom");
      for (let row = 0; row <= 14; row++) for (let col = 0; col <= 14; col++) {
        const x = Math.round(L + ((R - L) * col) / 14);
        const y = Math.round(T + ((B - T) * row) / 14);
        if (x < L || x > R || y < T || y > B) continue;
        if (!onScreen(x, y)) continue;
        if (!clearOf(allText, x, y)) continue;
        if (document.elementFromPoint(x, y) !== element) continue;
        inside.push({ x, y });
      }
    }
    if (inside.length >= ${LEAST_POINTS}) {
      return pack(element, style, box, alpha, "inside", inside, "");
    }

    // Otherwise the run is solid text: read the ring just outside it, staying
    // inside the hero and clear of every other run's glyphs. Which surface that
    // is gets checked by the agreement test in Node, not assumed here.
    const around = [];
    const bounds = hero.getBoundingClientRect();
    for (const gap of [3, 5, 8, 12]) {
      // Left and right as well as above and below. A title word is as tall as
      // the line it sits on, so its own glyph rects swallow the horizontal ring
      // and only the vertical one is left --- at 1920 that found nothing at all
      // and the run reported no points.
      for (let step = 0; step <= 20; step++) {
        const y0 = Math.round(box.top + ((box.bottom - box.top) * step) / 20);
        for (const x of [Math.round(box.left - gap), Math.round(box.right + gap)]) {
          if (!onScreen(x, y0)) continue;
          if (x < bounds.left || x > bounds.right) continue;
          if (!clearOf(allText, x, y0)) continue;
          const side = document.elementFromPoint(x, y0);
          if (!side || !(side === element || side.contains(element))) continue;
          around.push({ x, y: y0 });
        }
      }
      for (let col = 0; col <= 20; col++) {
        const x = Math.round(box.left + ((box.right - box.left) * col) / 20);
        for (const y of [Math.round(box.top - gap), Math.round(box.bottom + gap)]) {
          if (!onScreen(x, y)) continue;
          if (y < bounds.top || y > bounds.bottom) continue;
          if (!clearOf(allText, x, y)) continue;
          // The surface behind this run, not a neighbour's: a point over the
          // filled button's gold would make the ring a reading about the gold.
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(hit === element || hit.contains(element))) continue;
          around.push({ x, y });
        }
      }
    }
    return pack(element, style, box, alpha, "around", around,
      around.length ? "" : "neither inside the run nor the ring around it offered a point");

    function pack(el, st, bx, a, how, points, why) {
      const fontPx = parseFloat(st.fontSize);
      const weight = Number(st.fontWeight) || 400;
      const large = fontPx >= 24 || (fontPx >= 18.66 && weight >= 700);
      return { name, ink: resolveColour(st.color), alpha: a, needs: large ? ${AA_LARGE_TEXT} : ${AA_BODY_TEXT},
               fontPx, weight, how, points, why };
    }
  });

  const links = [...hero.querySelectorAll(".home-hero__actions a, .home-hero__aside a")].map((a) => {
    const rect = a.getBoundingClientRect();
    let o = 1;
    for (let n = a; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return {
      text: a.textContent.replace(/\s+/g, " ").trim(),
      opacity: o,
      onScreen: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
    };
  });

  const video = hero.querySelector("video");
  const stage = hero.querySelector(".home-hero__stage");
  return {
    scroll: { x: scrollX, y: scrollY },
    hero: {
      runs,
      links,
      videoPaused: video ? video.paused : null,
      pinned: stage ? getComputedStyle(stage).getPropertyValue("--p").trim() : "(no stage)",
    },
  };
`;

interface Sample {
  point: { x: number; y: number };
  behind: Rgb;
  ink: Rgb;
  ratio: number;
}

interface Measured {
  viewport: string;
  theme: ColourScheme;
  hero: Hero;
  worst: Map<string, Sample>;
  /** Channel spread across the points of each run, so a reading taken off two
   *  surfaces can be refused rather than reported. */
  spread: Map<string, number>;
  scrolledBefore: { x: number; y: number };
  scrolledAfter: { x: number; y: number };
}

const byte = (channel: number): number => Math.round(channel * 255);

function measure(raster: Raster, run: Run): { worst: Sample | null; spread: number } {
  const [r, g, b, a] = run.ink;
  const colour: Rgb = [r / 255, g / 255, b / 255];
  const alpha = run.alpha * (a ?? 1);
  let worst: Sample | null = null;
  const lo = [255, 255, 255];
  const hi = [0, 0, 0];
  for (const point of run.points) {
    const behind = raster.at(point.x, point.y);
    for (let channel = 0; channel < 3; channel++) {
      lo[channel] = Math.min(lo[channel]!, byte(behind[channel]!));
      hi[channel] = Math.max(hi[channel]!, byte(behind[channel]!));
    }
    const ink = compositeOver(colour, alpha, behind);
    const ratio = contrastRatio(ink, behind);
    if (!worst || ratio < worst.ratio) worst = { point, behind, ink, ratio };
  }
  const spread = run.points.length ? Math.max(...[0, 1, 2].map((c) => hi[c]! - lo[c]!)) : 0;
  return { worst, spread };
}

async function sweep(): Promise<Measured[]> {
  const { base } = resolveDeployment(process.env, gitOrigin);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const out: Measured[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await tab.viewport(viewport.width, viewport.height);
        // Reduced motion for both reasons at once: it pins --p to 0, which is
        // the composition §5 says has everything in it, and the page's own
        // script pauses the loop under it, so the frame under the text holds
        // still between reading the points and reading the pixels.
        await tab.media({ colourScheme: theme, reducedMotion: true });
        await tab.goto(`${site.origin}${prefix}`);
        // The OS preference alone does not decide the theme: a first visit is
        // forced dark on any OS, so emulating the media query and calling it
        // the light theme measures the dark one twice.
        await tab.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return null;`);
        await tab.settle();
        const applied = await tab.evaluate<string>(
          `return document.documentElement.getAttribute("data-theme") || "(none)";`,
        );
        expect(applied, `asked for the ${theme} theme and the document says ${applied}`).toBe(theme);

        const { scroll, hero, raster, scrolledAfter } = await whileStill(tab, async () => {
          const probe = await tab.evaluate<{ scroll: { x: number; y: number }; hero: Hero } | null>(PROBE);
          if (!probe) throw new Error("the home page has no hero");
          const raster = await tab.raster();
          return { scroll: probe.scroll, hero: probe.hero, raster };
        });

        const worst = new Map<string, Sample>();
        const spread = new Map<string, number>();
        for (const run of hero.runs) {
          const read = measure(raster, run);
          if (read.worst) worst.set(run.name, read.worst);
          spread.set(run.name, read.spread);
        }
        out.push({
          viewport: viewport.name,
          theme,
          hero,
          worst,
          spread,
          scrolledBefore: scroll,
          scrolledAfter,
        });
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return out;
}

const readings = await sweep();

const RUNS = readings[0]!.hero.runs.map((run) => run.name);

describe.each(VIEWPORTS)("the home hero at $name", ({ name: viewport }) => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    const reading = () => readings.find((r) => r.viewport === viewport && r.theme === theme)!;

    it("was measured with the loop paused and the composition pinned", () => {
      const here = reading();
      expect(here.scrolledAfter, "the page moved while the hero was being sampled").toEqual(
        here.scrolledBefore,
      );
      // Not "the video element exists": the number that matters is whether it
      // was playing while the pixels under the text were read.
      expect(here.hero.videoPaused, "the hero loop was playing while this was measured").toBe(true);
      expect(here.hero.pinned, "reduced motion should pin --p at 0").toBe("0");
    });

    it("keeps every way out of itself in the pinned composition", () => {
      // §5: the scroll's end state drops the lead and the links on purpose,
      // because the page is arriving underneath. Frozen as a resting
      // composition that is a hero missing its links, so the two stand-in
      // states pin --p at 0 -- and this is the assertion that says they did.
      const links = reading().hero.links;
      expect(
        links.map((link) => link.text),
        "the hero should offer the Studio, the backlot and the calendar",
      ).toEqual(["Open the Studio", "Walk the backlot", "Release calendar"]);
      for (const link of links) {
        expect(link.opacity, `"${link.text}" is at ${link.opacity} effective opacity`).toBe(1);
        expect(link.onScreen, `"${link.text}" is not fully on screen`).toBe(true);
      }
    });

    for (const name of RUNS) {
      it(`${name} reads on the composite`, () => {
        const here = reading();
        const run = here.hero.runs.find((candidate) => candidate.name === name)!;

        expect(run.how, `${name}: ${run.why}`).not.toBe("missing");
        expect(run.points.length, `${name}: ${run.why || "no points"} (${run.how})`).toBeGreaterThanOrEqual(
          LEAST_POINTS,
        );

        const spread = here.spread.get(name)!;
        const sample = here.worst.get(name)!;
        const effective = run.alpha * (run.ink[3] ?? 1);
        expect(
          sample.ratio,
          `the hero's ${name} paints ${formatHex(sample.ink)}` +
            `${effective === 1 ? "" : ` (its colour at ${effective.toFixed(3)} effective alpha)`} on ` +
            `${formatHex(sample.behind)} at (${sample.point.x}, ${sample.point.y}) -- ` +
            `${sample.ratio.toFixed(2)}:1, and ${run.fontPx}px/${run.weight} text needs ${run.needs}:1. ` +
            `Worst of ${run.points.length} points taken ${run.how} the run, which span ${spread}/255 on ` +
            `a channel because the surface is a frame under a scrim. This stage stays dark in ` +
            `both themes (CLAUDE.md §5), so ink sized against --at-bg does not hold here.`,
        ).toBeGreaterThanOrEqual(run.needs);
      });
    }
  });
});

describe("the hero sweep measured something", () => {
  it("found all six runs of type", () => {
    expect(RUNS).toEqual([
      "kicker",
      "lead",
      "title word",
      "filled button",
      "outline button",
      "calendar link",
    ]);
  });

  it("sampled every run in both viewports and both themes", () => {
    expect(readings.length).toBe(VIEWPORTS.length * THEMES.length);
    for (const reading of readings) {
      expect(reading.hero.runs.map((run) => run.name)).toEqual(RUNS);
    }
  });

  it("judged every run on a spread of points, not on one", () => {
    const points = readings.flatMap((r) => r.hero.runs.map((run) => run.points.length));
    expect(Math.min(...points)).toBeGreaterThanOrEqual(LEAST_POINTS);
  });
});
