// The home page's cards, measured on the rendered page in a real browser.
//
// `spec/palette.test.ts` proves the phase tokens agree with each other, and
// `spec/weight-bar-contrast.test.ts` proves one component asks for them. Neither
// reaches these cards, and nothing did: before this file, no check in spec/
// mentioned `.phase-card` at all. Six cards on the page a marker opens first,
// and the only thing watching their ink was the build's axe pass, which runs in
// JSDOM with no layout and no computed colour and therefore cannot fire a
// contrast rule (CLAUDE.md §7).
//
// They are the case §7 says has no token value at all: a glass panel at 80%
// opacity over a blurred conic-gradient shader over the page ground. There is
// no declared background to check the composite against -- the honest reading is
// the pixel the compositor produced, and it is a *different* pixel under every
// part of the card, because the thing behind the glass is a gradient. So this
// does not sample a point; it samples a grid across each run of text and keeps
// the **worst** contrast it finds. A single point on a gradient is a number that
// happens to be true somewhere.
//
// Two things the scope does, on purpose:
//   - it is derived from the DOM, not a list. §7's own example is
//     `spec/palette.test.ts` enumerating fourteen stylesheets by name while five
//     went unchecked for weeks. Every `.phase-card` on the page is measured, so
//     the two place cards this file was written for are covered by the same pass
//     as the four phase cards that predate it, and a seventh card is covered the
//     day it is added.
//   - it reads the threshold off the type. The titles are large text by WCAG's
//     own definition and the kicker and blurb are not, so the ratio each one has
//     to clear is computed from its rendered size and weight rather than picked.
//
// **Seen red four ways, and once by the page itself.** Its first run was 4
// failed | 27 passed on a live defect -- two cards added the same afternoon and
// two that had been on the home page for weeks -- which is the strongest reading
// of "seen red" available and the reason the wash was measured rather than
// argued about. The four injections are anchored inside the thing each one
// breaks, because an injection matching a bare pattern is fed by whatever else
// is in the file and turns into a no-op that reads exactly like a check gone
// blind (§7):
//
//   - the shader's wash put back to 0.55, which is the defect this round fixed
//     --- 4 failed | 27 passed:
//       The Studio  title #b97d1c on #5b3e14  2.80:1 (dark, 1920)
//       The backlot title #b97d1c on #5b3e14  2.80:1 (dark, 1920)
//       The Rig     title #b97d1c on #553c13  2.94:1 (dark, 390)
//       The Episode title #8a5c13 on #c6b398  2.85:1 (light, 390)
//   - `animation-play-state: running` left on the shader --- 24 failed | 7
//     passed: "Four Generators's shader is running, so these readings are one
//     frame of a moving gradient". Which is the assertion that stops every
//     number in this file being one sample of a moving scene.
//   - the grid collapsed to a single candidate point (`STEPS = 0`) --- 25 failed
//     | 6 passed, "expected 0 to be greater than or equal to 6". The whole
//     failure mode of a worst-of-many check is that "many" quietly becomes one,
//     and this is what notices.
//   - the probe handing back only the first run of text (`.slice(0, 1)`) --- 25
//     failed | 6 passed, "Four Generators offered phase-card__weeks run(s) of
//     text" and "expected 24 to be 72". A mistyped selector would otherwise read
//     as a pass by measuring a third of the words and calling it done.

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

/** The fewest sample points a run of text may be judged on. A run that offers
 *  fewer than this is a reading, not a sweep: the whole failure mode of a
 *  worst-of-many check is that "many" quietly becomes one. */
const LEAST_POINTS = 6;

interface Run {
  /** The class that identifies the run, e.g. phase-card__blurb. */
  name: string;
  /** The run's own colour, and the opacity accumulated from it up to the card
   *  --- `.phase-card__kicker` paints at 0.75, which thins its ink towards the
   *  glass and is invisible to anything that only reads `color`. */
  ink: Resolved;
  alpha: number;
  /** The ratio this run has to clear, by WCAG's large-text rule, and the size
   *  and weight it was decided from. */
  needs: number;
  fontPx: number;
  weight: number;
  /** Viewport pixels inside the run's box, clear of its own glyphs and of every
   *  painted descendant, where elementFromPoint still answers the run or the
   *  card. */
  points: { x: number; y: number }[];
  why: string;
}

interface Card {
  /** Which card, named the way the page names it. */
  modifier: string;
  title: string;
  /** The card's own opacity: the composite below is ink over the sampled pixel,
   *  which is the whole story only while the card itself is opaque. */
  cardOpacity: number;
  /** Whether the shader behind the glass is standing still. */
  shaderPlayState: string;
  runs: Run[];
}

const PROBE = (index: number) => String.raw`
  ${RESOLVE_COLOUR}
  const cards = document.querySelectorAll(".phase-card");
  const card = cards[${index}];
  if (!card) return null;

  // Scrolled exactly once per card, here, and the offset is handed back so the
  // sampler can prove the page did not move between reading these coordinates
  // and reading the pixels they name.
  card.scrollIntoView({ block: "center", behavior: "instant" });

  const painted = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 2 && rect.height > 2 &&
      style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
    );
  };

  // Every painted descendant box, and every text run's own client rects. The
  // frame image falls out of this for free: it is a painted descendant, so no
  // sample point can land on the screenshot, which is the one surface on this
  // card whose colour nothing declares and nothing should have to.
  const keepOut = [];
  for (const node of card.querySelectorAll("*")) {
    if (!painted(node)) continue;
    keepOut.push(...node.getClientRects());
  }

  const modifier = (/phase-card--([a-z]+)/.exec(card.className) || [, "?"])[1];
  const titleNode = card.querySelector(".phase-card__title");
  const shader = card.querySelector(".phase-card__shader");

  const runs = [...card.querySelectorAll(".phase-card__weeks, .phase-card__kicker, .phase-card__title, .phase-card__blurb")]
    .map((run) => {
      const style = getComputedStyle(run);
      const box = run.getBoundingClientRect();

      let alpha = 1;
      for (let node = run; node && node !== card; node = node.parentElement) {
        alpha *= Number(getComputedStyle(node).opacity);
      }

      // The run's own glyphs are keep-out too, and they are the rects that
      // matter most: a point on a letter reads the ink and calls it the fill.
      const mine = [];
      const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.nodeValue || !text.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        mine.push(...range.getClientRects());
      }
      const blocked = keepOut.filter((rect) => !(rect.width >= box.width && rect.height >= box.height));
      const all = blocked.concat(mine);
      const clearOf = (x, y) =>
        all.every((r) => x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2);

      const inset = (side) => parseFloat(style["border" + side + "Width"]) + 1;
      const left = box.left + inset("Left");
      const right = box.right - inset("Right");
      const top = box.top + inset("Top");
      const bottom = box.bottom - inset("Bottom");

      const points = [];
      const STEPS = 16;
      for (let row = 0; row <= STEPS; row++) {
        for (let col = 0; col <= STEPS; col++) {
          const x = Math.round(left + ((right - left) * col) / STEPS);
          const y = Math.round(top + ((bottom - top) * row) / STEPS);
          if (x < left || x > right || y < top || y > bottom) continue;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          if (!clearOf(x, y)) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit !== run && hit !== card) continue;
          points.push({ x, y });
        }
      }

      // WCAG's large-text rule, read off what the browser rendered rather than
      // guessed from the stylesheet: 24px, or 18.66px when bold.
      const fontPx = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = fontPx >= 24 || (fontPx >= 18.66 && weight >= 700);

      return {
        name: run.className,
        ink: resolveColour(style.color),
        alpha,
        needs: large ? ${AA_LARGE_TEXT} : ${AA_BODY_TEXT},
        fontPx,
        weight,
        points,
        why: points.length === 0 ? "no point inside the run is clear of its own glyphs" : "",
      };
    });

  return {
    scroll: { x: scrollX, y: scrollY },
    card: {
      modifier,
      title: titleNode ? titleNode.textContent.trim() : "(untitled)",
      cardOpacity: Number(getComputedStyle(card).opacity),
      shaderPlayState: shader ? getComputedStyle(shader).animationPlayState : "(no shader)",
      runs,
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
  index: number;
  card: Card;
  /** Worst-first, so the first entry is the one the assertion is about. */
  worst: Map<string, Sample>;
  scrolledBefore: { x: number; y: number };
  scrolledAfter: { x: number; y: number };
}

/** How thin the ink actually is. Two alphas multiply here and each one alone
 *  reads as the whole story: the run's accumulated `opacity`, and the alpha in
 *  its own colour. `--at-text-secondary` resolves to an rgba at **0.78**, so a
 *  blurb's ink is already 22% of whatever is behind it before `opacity` is
 *  considered -- and the first version of this file threw on that rather than
 *  measuring it, which is the better failure of the two available. */
function inkAlpha(run: Run): number {
  return run.alpha * (run.ink[3] ?? 1);
}

function worstOf(raster: Raster, origin: { x: number; y: number }, run: Run): Sample | null {
  const [r, g, b] = run.ink;
  const colour: Rgb = [r / 255, g / 255, b / 255];
  const alpha = inkAlpha(run);
  let worst: Sample | null = null;
  for (const point of run.points) {
    const behind = raster.at(point.x - origin.x, point.y - origin.y);
    const ink = compositeOver(colour, alpha, behind);
    const ratio = contrastRatio(ink, behind);
    if (!worst || ratio < worst.ratio) worst = { point, behind, ink, ratio };
  }
  return worst;
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
        await tab.colourScheme(theme);
        await tab.goto(`${site.origin}${prefix}`);
        // What the footer toggle does. The OS preference alone does not decide
        // it: a first visit is forced dark on any OS, so emulating the media
        // query and calling it the light theme measures the dark one -- which it
        // did, for eight plausible-looking screenshots, before this line.
        await tab.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return null;`);
        await tab.settle();

        const count = await tab.evaluate<number>(`return document.querySelectorAll(".phase-card").length;`);
        for (let index = 0; index < count; index++) {
          const { scroll, card, raster, scrolledAfter } = await whileStill(tab, async () => {
            const probe = await tab.evaluate<{ scroll: { x: number; y: number }; card: Card } | null>(
              PROBE(index),
            );
            if (!probe) throw new Error(`card ${index} vanished between counting and probing`);
            // One screenshot for the whole card, then every point is read out of
            // it. A round trip per point would be thousands of them, and the
            // page would have every chance to move in between.
            const raster = await tab.raster();
            return { scroll: probe.scroll, card: probe.card, raster };
          });

          const worst = new Map<string, Sample>();
          for (const run of card.runs) {
            const sample = worstOf(raster, { x: 0, y: 0 }, run);
            if (sample) worst.set(run.name, sample);
          }
          out.push({
            viewport: viewport.name,
            theme,
            index,
            card,
            worst,
            scrolledBefore: scroll,
            scrolledAfter,
          });
        }
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return out;
}

const readings = await sweep();

/** The cards as the first pass found them, used to name the tests. */
const CARDS = readings
  .filter((r) => r.viewport === VIEWPORTS[0].name && r.theme === THEMES[0])
  .map((r) => ({ index: r.index, modifier: r.card.modifier, title: r.card.title }));

describe.each(VIEWPORTS)("the home page's cards at $name", ({ name: viewport }) => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    it("finds the same cards as every other pass", () => {
      const here = readings.filter((r) => r.viewport === viewport && r.theme === theme);
      expect(here.map((r) => `${r.card.modifier}:${r.card.title}`)).toEqual(
        CARDS.map((c) => `${c.modifier}:${c.title}`),
      );
    });

    for (const card of CARDS) {
      it(`${card.title} (.phase-card--${card.modifier})`, () => {
        const reading = readings.find(
          (r) => r.viewport === viewport && r.theme === theme && r.index === card.index,
        )!;

        expect(
          reading.scrolledAfter,
          "the page scrolled while the card was being sampled, so every coordinate is stale",
        ).toEqual(reading.scrolledBefore);

        // A moving gradient would make every number below one sample of a scene
        // in motion. The shader only runs on hover and focus, and this is the
        // assertion that keeps that true.
        expect(
          reading.card.shaderPlayState,
          `${card.title}'s shader is ${reading.card.shaderPlayState}, so these readings are one frame of a moving gradient`,
        ).toBe("paused");

        expect(reading.card.cardOpacity, `${card.title} is not fully opaque`).toBe(1);

        // Three runs of text, named, so a mistyped selector cannot read as a
        // pass by measuring one of them or none.
        const names = reading.card.runs.map((run) => run.name).sort();
        expect(names.length, `${card.title} offered ${names.join(", ") || "no"} run(s) of text`).toBe(3);

        for (const run of reading.card.runs) {
          expect(run.points.length, `${card.title}: ${run.name} -- ${run.why}`).toBeGreaterThanOrEqual(
            LEAST_POINTS,
          );
          const sample = reading.worst.get(run.name)!;
          expect(
            sample.ratio,
            `${card.title}'s ${run.name} paints ${formatHex(sample.ink)}` +
              `${inkAlpha(run) === 1 ? "" : ` (its colour at ${inkAlpha(run).toFixed(3)} effective alpha)`} on ` +
              `${formatHex(sample.behind)} at (${sample.point.x}, ${sample.point.y}) -- ` +
              `${sample.ratio.toFixed(2)}:1, and ${run.fontPx}px/${run.weight} text needs ` +
              `${run.needs}:1. Worst of ${run.points.length} points across the run, because the ` +
              `glass sits on a gradient and one point is only true where it was taken.`,
          ).toBeGreaterThanOrEqual(run.needs);
        }
      });
    }
  });
});

// The sweep must not be able to pass by measuring nothing.
describe("the card sweep measured something", () => {
  it("found the four phase cards and the two places", () => {
    expect(CARDS.map((c) => c.modifier)).toEqual([
      "rig",
      "generators",
      "holding",
      "episode",
      "place",
      "place",
    ]);
  });

  it("sampled every card in every viewport and theme", () => {
    expect(readings.length).toBe(CARDS.length * VIEWPORTS.length * THEMES.length);
  });

  it("judged every run of text on a spread of points, not on one", () => {
    const runs = readings.flatMap((r) => r.card.runs);
    expect(runs.length).toBe(CARDS.length * VIEWPORTS.length * THEMES.length * 3);
    expect(Math.min(...runs.map((run) => run.points.length))).toBeGreaterThanOrEqual(LEAST_POINTS);
  });
});
