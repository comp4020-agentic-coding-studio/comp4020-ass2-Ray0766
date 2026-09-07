// The palette, checked as arithmetic on the token values.
//
// Nothing in the build can do this. The theme's axe run happens inside a JSDOM
// document with no layout and no computed colour, so contrast rules never
// fire; and the theme's own contrast.ts says axe-core cannot read oklch at
// all. The tokens are the design, so the tokens are what gets checked — which
// is exact, needs no browser, and survives whatever colour syntax CSS grows
// next. The rendered-pixel check is still done in Chrome, on the composite,
// for anything semi-transparent; this is the other half.
//
// What it guards: the Slop gold is a fill, not ink. Ink is `--at-brand-ink`,
// which is the gold on the dark theme and the brand's copper on the light one.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AA_BODY_TEXT,
  contrastRatio,
  oklchToSrgb,
  parseLightDarkOklchTokens,
  type OklchToken,
  type Rgb,
} from "astro-theme-university/contrast";

const read = (path: string) => readFileSync(resolve(path), "utf8");

const BRAND_CSS = read("node_modules/astro-theme-slop/slop.css");
const THEME_TOKENS_CSS = read("node_modules/astro-theme-university/styles/tokens.css");
const SITE_CSS = read("src/styles/site.css");

// ---------------------------------------------------------------------------
// The one conversion the theme package does not ship: sRGB back to oklch. The
// brand pins --at-primary and --at-secondary as hex, and the theme's surfaces
// are `oklch(from var(--at-primary) L% C h)` — so the brand hue has to be
// recovered before a surface can be resolved at all.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): Rgb {
  const digits = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16) / 255) as Rgb;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function srgbToOklch([r, g, b]: Rgb): { l: number; c: number; hue: number } {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c: Math.hypot(A, B), hue };
}

/** `--at-primary: #b97d1c;` out of the brand package's own stylesheet. */
function brandHex(name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})`, "i").exec(BRAND_CSS);
  if (!match) throw new Error(`${name} is not pinned in astro-theme-slop/slop.css`);
  return match[1];
}

const BRAND = {
  primary: brandHex("--at-primary"),
  secondary: brandHex("--at-secondary"),
} as const;

/** The hue every surface in tokens.css inherits from the brand mark. */
const BRAND_HUE = srgbToOklch(hexToRgb(BRAND.primary)).hue;

const themeTokens = parseLightDarkOklchTokens(THEME_TOKENS_CSS);

function surface(name: string): { light: OklchToken; dark: OklchToken } {
  const token = themeTokens.get(name);
  if (!token) throw new Error(`${name} is not a light-dark oklch token in the theme`);
  return token;
}

function ratio(inkHex: string, bg: OklchToken): number {
  return contrastRatio(hexToRgb(inkHex), oklchToSrgb(bg.l, bg.c, bg.hue ?? BRAND_HUE));
}

// ---------------------------------------------------------------------------
// What the site actually says the ink is.
// ---------------------------------------------------------------------------

/** `--at-brand-ink: light-dark(var(--at-secondary), var(--at-primary));` */
function brandInk(): { light: string; dark: string } {
  const match =
    /--at-brand-ink:\s*light-dark\(\s*var\((--at-[\w-]+)\)\s*,\s*var\((--at-[\w-]+)\)\s*\)/.exec(SITE_CSS);
  if (!match) throw new Error("--at-brand-ink is not declared as light-dark(var(...), var(...)) in site.css");
  const pick = (name: string): string => {
    if (name === "--at-primary" || name === "--at-accent") return BRAND.primary;
    if (name === "--at-secondary") return BRAND.secondary;
    throw new Error(`--at-brand-ink names ${name}, which is not a pinned brand colour`);
  };
  return { light: pick(match[1]), dark: pick(match[2]) };
}

// Seen red by putting the light half of --at-brand-ink back to the gold
// (`light-dark(var(--at-accent), var(--at-primary))`), which is what the site
// shipped before this round:
//   AssertionError: the light theme's brand ink on --at-bg: expected
//   3.4335795176570396 to be greater than or equal to 4.5
//   AssertionError: the light theme's brand ink on --at-bg-alt: expected
//   3.1499786595935593 to be greater than or equal to 4.5
// then reverted.
describe("the brand ink clears AA body text on both themes", () => {
  const ink = brandInk();

  for (const name of ["--at-bg", "--at-bg-alt", "--at-bg-elevated"]) {
    const token = surface(name);

    it(`light: ${name}`, () => {
      expect(ratio(ink.light, token.light), `the light theme's brand ink on ${name}`).toBeGreaterThanOrEqual(
        AA_BODY_TEXT,
      );
    });

    it(`dark: ${name}`, () => {
      expect(ratio(ink.dark, token.dark), `the dark theme's brand ink on ${name}`).toBeGreaterThanOrEqual(
        AA_BODY_TEXT,
      );
    });
  }

  // The reason the ink has to switch at all, stated as a fact rather than as
  // a comment: neither brand colour is readable on both grounds.
  it("neither brand colour would do for both themes on its own", () => {
    const light = surface("--at-bg").light;
    const dark = surface("--at-bg").dark;
    expect(ratio(BRAND.primary, light), "the gold on the light theme").toBeLessThan(AA_BODY_TEXT);
    expect(ratio(BRAND.secondary, dark), "the copper on the dark theme").toBeLessThan(AA_BODY_TEXT);
  });
});

// Seen red by deleting the `.at-button--outline, .at-button--ghost { color:
// var(--at-brand-ink) }` rule from site.css, which sends the button back to
// the theme's `color: var(--at-accent)`:
//   AssertionError: the outline button must take its ink from
//   --at-brand-ink: expected null not to be null
// then reverted.
describe("the theme's outline button takes the brand ink", () => {
  const rule = (selectors: string) =>
    new RegExp(`${selectors.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*color:\\s*var\\(--at-brand-ink\\)`);

  it("is restyled through its own class, and takes the ink token", () => {
    expect(
      rule(".at-button--outline,\n.at-button--ghost").exec(SITE_CSS),
      "the outline button must take its ink from --at-brand-ink",
    ).not.toBeNull();
  });

  it("borders with the same ink, since a border on the page ground is a stroke", () => {
    expect(/\.at-button--outline\s*\{[^}]*border-color:\s*var\(--at-brand-ink\)/.test(SITE_CSS)).toBe(true);
  });

  // The fills stay gold, which is the whole point of splitting the two.
  it("leaves the filled button alone", () => {
    expect(SITE_CSS.includes(".at-button {"), "site.css must not restyle the filled button").toBe(false);
  });
});

// The other half of the same rule: a phase colour is a fill too, and a fill
// needs an ink chosen against it rather than assumed. The four straddle the
// switch — white is fine on three of them and 3.49:1 on the rig gold — which
// is why phase-colours.css derives each one's ink from its own lightness with
// the recipe tokens.css uses for --at-on-primary.
//
// Seen red by pinning every phase ink to white
// (`--phase-rig-ink: var(--at-white)`):
//   AssertionError: --phase-rig-ink must be derived from --phase-rig:
//   expected '/* The four phase colours, in one fil…' to contain
//   '--phase-rig-ink: oklch(from var(--pha…'
// then reverted.
describe("every phase colour carries an ink that clears AA on it", () => {
  const PHASE_CSS = read("src/styles/phase-colours.css");

  /** The four fills, resolved: three are pinned brand hexes, the fourth is the
   *  relative-colour step the stylesheet writes. */
  const gold = srgbToOklch(hexToRgb(BRAND.primary));
  const episode = oklchToSrgb(gold.l - 0.22, gold.c * 0.85, gold.hue);

  const fills: Record<string, Rgb> = {
    "--phase-rig": hexToRgb(BRAND.primary),
    "--phase-generators": hexToRgb(BRAND.secondary),
    "--phase-holding": hexToRgb(brandHex("--at-tertiary")),
    "--phase-episode": episode,
  };

  /** tokens.css's switch: near-black above 0.58 lightness, white below. */
  function derivedInk(fill: Rgb): Rgb {
    const { l, hue } = srgbToOklch(fill);
    const lightness = Math.min(1, Math.max(0.16, (0.58 - l) * 1000));
    return oklchToSrgb(lightness, 0, hue);
  }

  for (const [name, fill] of Object.entries(fills)) {
    it(`${name} has an ink derived from it, not assumed`, () => {
      expect(PHASE_CSS, `${name}-ink must be derived from ${name}`).toContain(
        `${name}-ink: oklch(from var(${name})`,
      );
      expect(
        contrastRatio(derivedInk(fill), fill),
        `the ink derived from ${name} has to clear AA body text on it`,
      ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    });
  }

  it("white alone would not have done, which is the whole reason for the switch", () => {
    const white: Rgb = [1, 1, 1];
    expect(
      contrastRatio(white, fills["--phase-rig"]),
      "white on --phase-rig is 3.49:1, which is why the ink is derived from the fill rather than assumed",
    ).toBeLessThan(AA_BODY_TEXT);
    expect(contrastRatio(white, fills["--phase-episode"])).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });
});

// The project's own stylesheets follow the same rule: gold fills, ink is the
// token. Anything that paints the accent as text or as a line is a light-theme
// contrast bug waiting to be found in a screenshot.
//
// Seen red by putting `color: var(--at-accent)` back on `.studio-card__link`
// in studio-canvas.css:
//   AssertionError: src/styles/studio-canvas.css paints --at-accent as ink or
//   as a stroke; gold is a fill (see the brand-ink block in site.css):
//   expected [ 'color: var(--at-accent);' ] to deeply equal []
// then reverted.
describe("no stylesheet in this project paints the accent as ink", () => {
  const FILES = [
    "blind-rung.css",
    "compare-set.css",
    "cut.css",
    "drift-audit.css",
    "graph-reader.css",
    "lecture-phases.css",
    "reading.css",
    "retention-curve.css",
    "same-seed.css",
    "site.css",
    "studio.css",
    "studio-canvas.css",
    "studio-shell.css",
    "three-second-demo.css",
  ];

  // `background`, `fill` and `accent-color` are fills and stay gold; every
  // other property that can take a colour is ink or a stroke.
  const INK = /^\s*(?:color|stroke|border[\w-]*|outline|text-decoration-color|caret-color)\s*:[^;]*var\(--at-accent\)[^;]*;/gm;

  for (const file of FILES) {
    it(`${file} uses the accent only as a fill`, () => {
      const css = read(`src/styles/${file}`);
      const offenders = [...css.matchAll(INK)].map((match) => match[0].trim());
      expect(
        offenders,
        `src/styles/${file} paints --at-accent as ink or as a stroke; gold is a fill (see the brand-ink block in site.css)`,
      ).toEqual([]);
    });
  }
});
