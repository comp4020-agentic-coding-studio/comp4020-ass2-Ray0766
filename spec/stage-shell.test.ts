// The shell both stages share: what it paints, and what it must not.
//
// StudioLayout.astro serves /studio/ and /backlot/, and src/styles/studio-shell.css
// is the stylesheet of the frame around both. Two things in it are only true in
// a browser, which is why this file drives one rather than reading source.
//
// 1. The `[hidden]` escape rule. `[hidden] { display: none }` belongs to the
//    *user agent*, and an author declaration beats a UA one whatever cascade
//    layer the author put it in — so the theme's `.at-button { display:
//    inline-flex }` in `@layer at.components` wins, and a control the page
//    hid goes on being painted. CLAUDE.md §7 records three of these already
//    (three-second-demo's Play button, the hub's six doors, the backlot stage).
//    Reading the stylesheet cannot tell you whether the rule reaches anything:
//    the only honest answer is the rendered page, at both marking viewports, in
//    both themes, with scripts on and off — because two of the four elements
//    this caught are only painted for a reader with JavaScript off, and the
//    other two only with it on.
//
// 2. The carve-out inside that rule. site.css holds space for a section JS is
//    about to reveal with `[data-reserve][hidden] { display: block }`, keyed on
//    `[hidden]` exactly so it releases itself; an escape rule written
//    `!important` and without `:not([data-reserve])` deletes that reservation
//    and hands /studio/ back the 0.11–0.13 CLS it was built to remove. So the
//    fix and the thing the fix could break are asserted together — §7's rule
//    about pairing a probe with an invariant the bug would violate. The
//    reservation only exists between the inline script that sets `data-reserve`
//    during parsing and the island that reveals the section, so it is read at
//    `DOMContentLoaded` from a script installed before the page's own, which is
//    the moment the attribute is set on purpose.
//
// 3. The two controls at the end of the status bar hover the same. The theme
//    washes an outline button with `--at-accent-soft` on `:hover` and on
//    nothing else, so `:hover` is the only state that shows the difference and
//    there is no way to reach it from inside the page — the pointer is moved
//    over the DevTools protocol and the composited pixel is read back.
//
// Seen red three times, each under its own bug, injected into the built page's
// inline <style> and reverted. The output is quoted above each describe.

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

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const STAGES = [
  { name: "/studio/", path: "studio/" },
  { name: "/backlot/", path: "backlot/" },
] as const;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

/** A first visit is forced dark on any OS, so dark is what a marker sees; light
 *  is what a reader gets back the moment the status bar's toggle stores a
 *  preference (CLAUDE.md §7). */
const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** Both, and not as a formality. Of the four controls this file caught being
 *  painted while hidden, two are only painted with scripts off and two only
 *  with them on; a sweep that ran one way would have reported half of it. */
const SCRIPTS = [true, false] as const;

interface Hidden {
  what: string;
  display: string;
  visibility: string;
  width: number;
  height: number;
  reserved: boolean;
  painted: boolean;
}

/** Every element carrying the `hidden` attribute, and whether the page is
 *  painting it anyway. `getAttribute("class")` rather than `.className`, which
 *  on an SVG element is an object that stringifies to "[object
 *  SVGAnimatedString]" and would name the wrong thing in the failure message. */
const HIDDEN = String.raw`
  const rows = [];
  for (const element of document.querySelectorAll("[hidden]")) {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const cls = element.getAttribute("class");
    const data = [...element.attributes]
      .filter((attribute) => attribute.name.indexOf("data-") === 0)
      .map((attribute) => "[" + attribute.name + "]")
      .join("");
    rows.push({
      what: element.tagName.toLowerCase() + (cls ? "." + cls.trim().split(/\s+/).join(".") : "") + data,
      display: style.display,
      visibility: style.visibility,
      width: Math.round(box.width),
      height: Math.round(box.height),
      reserved: element.hasAttribute("data-reserve"),
      painted: style.display !== "none" && box.width > 0 && box.height > 0,
    });
  }
  return rows;
`;

/** Installed before anything the page runs, so it reads the reservation in the
 *  window it exists in: after the inline script has set `data-reserve` during
 *  parsing, before the island has revealed the section. A probe that looked
 *  after load would find nothing and would have nothing to say about it. */
const RESERVE_PROBE = String.raw`
  window.__stageReserve = { ran: false, held: [] };
  document.addEventListener("DOMContentLoaded", function () {
    var held = [];
    var all = document.querySelectorAll("[data-reserve][hidden]");
    for (var index = 0; index < all.length; index++) {
      var element = all[index];
      var style = getComputedStyle(element);
      var box = element.getBoundingClientRect();
      held.push({
        what: element.getAttribute("data-reserve"),
        display: style.display,
        visibility: style.visibility,
        height: Math.round(box.height),
      });
    }
    window.__stageReserve = { ran: true, held: held };
  });
`;

interface Held {
  what: string;
  display: string;
  visibility: string;
  height: number;
}

interface Reserve {
  ran: boolean;
  /** Every `[data-reserve][hidden]` on the page at DOMContentLoaded, not the
   *  first one. The first version took `querySelector` and got whichever came
   *  first in the document — and when the canvas's reservation was broken on
   *  purpose the probe reported on the desk form's instead, which at 1920 is
   *  `display: none !important` from its own media query and failed for the
   *  wrong reason. A check that names the thing it is about cannot do that. */
  held: Held[];
}

/** The one this file is about. `/studio/` has two reservations and only this one
 *  is held open at the desktop viewport; naming it is the difference between
 *  asserting on the canvas and asserting on whatever the DOM offered first. */
const RESERVATION = "studio-canvas";

/** One hovered control: what it declares, and a point inside it that is the
 *  control's own fill rather than its border or a glyph.
 *
 *  The search is the one spec/backlot-contrast.test.ts arrived at the hard way:
 *  inset past the border, keep out of every text run's own client rects, and
 *  confirm `elementFromPoint` still answers the control, because a ring or a
 *  shadow from a neighbour paints outside its border box and hit-tests nowhere. */
const HOVERED = (selector: string) => String.raw`
  ${RESOLVE_COLOUR}
  // The wash composited over the bar, by the browser rather than by arithmetic
  // here. Two goes at doing it by hand were each wrong by a count in one
  // channel: resolveColour reads a translucent fill back off a transparent
  // canvas, where a low alpha costs real precision on the way through
  // premultiplication (opaque() refuses such a value for exactly this reason),
  // and a float blend of the two rounds differently from the compositor. Two
  // fills on the same pixel is the same operation the page performs, and the
  // result is opaque, so reading it back is exact.
  const compositeOver = (under, top) => {
    __probeCtx.clearRect(0, 0, 1, 1);
    __probeCtx.fillStyle = under;
    __probeCtx.fillRect(0, 0, 1, 1);
    __probeCtx.fillStyle = top;
    __probeCtx.fillRect(0, 0, 1, 1);
    const data = __probeCtx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  };
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return null;
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  if (box.width < 6 || box.height < 6 || style.display === "none") return null;

  const keepOut = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.nodeValue || !text.nodeValue.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) keepOut.push(rect);
  }
  const clearOf = (x, y) =>
    keepOut.every((r) => x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2);

  const inset = (side) => parseFloat(style["border" + side + "Width"]) + 1;
  const y = Math.round((box.top + box.bottom) / 2);
  let point = null;
  for (let x = Math.ceil(box.left + inset("Left")); x <= Math.floor(box.right - inset("Right")) && !point; x++) {
    if (!clearOf(x, y)) continue;
    if (document.elementFromPoint(x, y) !== element) continue;
    point = { x: x, y: y };
  }

  const bar = element.closest(".studio-status");
  return {
    hover: element.matches(":hover"),
    background: style.backgroundColor,
    // The control's own computed background, not the token it came from.
    // Reading --at-accent-soft off :root and resolving that instead returned
    // opaque black on every run: getPropertyValue hands back the raw
    // declaration, and a fillStyle it cannot parse leaves the canvas on its
    // default. The computed value is the browser's own answer and is already
    // the wash, alpha and all.
    declaredComposite: compositeOver(getComputedStyle(bar).backgroundColor, style.backgroundColor),
    washAlpha: style.backgroundColor,
    // What the theme says the wash is, resolved the way the browser resolves it
    // rather than parsed. getPropertyValue on the custom property hands back the
    // raw declaration and a fillStyle that cannot parse it leaves the probe on
    // opaque black; setting the custom property as a background on a fresh
    // element and reading the computed value is the browser doing the work.
    //
    // No backticks in this comment, and that is not fussiness: it sits inside a
    // String.raw template, and a backtick here closes it. The file stops
    // parsing, contributes zero tests, and the summary line still says the suite
    // passed. That has happened four times in this repo now, three of them in
    // this round's own probes, which is why spec/suite-integrity.test.ts exists.
    //
    // Fresh, and coloured before it is inserted, for the reason CLAUDE.md §7
    // gives: under prefers-reduced-motion the theme leaves a live transition on
    // every animatable property, and a computed read on an element that is
    // already in the document returns the value it is moving away from. A
    // transition never runs on an element's first style computation.
    declaredWash: (() => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--at-accent-soft)";
      probe.style.position = "absolute";
      probe.style.inlineSize = "1px";
      probe.style.blockSize = "1px";
      probe.style.insetBlockStart = "-9999px";
      bar.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    })(),
    ink: resolveColour(style.color),
    point: point,
    box: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)].join(","),
  };
`;

interface Control {
  hover: boolean;
  background: string;
  declaredComposite: Resolved;
  washAlpha: string;
  declaredWash: string;
  ink: Resolved;
  point: { x: number; y: number } | null;
  box: string;
}

interface Sampled extends Control {
  pixel: Rgb | null;
}

interface Case {
  stage: string;
  viewport: string;
  theme: ColourScheme;
  scripts: boolean;
  hidden: Hidden[];
  reserve: Reserve | null;
  /** "ready", or how the wait ended. Null where scripts were off. */
  ready: string | null;
  list: Sampled | null;
  away: Sampled | null;
}

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/** Ready means different things on the two stages, and neither of them is
 *  `load`. On /backlot/ it is `[data-backlot-ready]`, which boot.ts sets when
 *  the engine has the box — `settle()` returns before the island has populated
 *  the HUD. On /studio/ it is the status bar's own module having un-hidden its
 *  button, which is the one thing that proves status-bar.ts ran. */
const READY = (stage: string) =>
  stage === "/backlot/"
    ? String.raw`
        return (async () => {
          const deadline = performance.now() + 25000;
          while (performance.now() < deadline) {
            if (document.querySelector("[data-backlot-stage][data-backlot-ready]")) return "ready";
            await new Promise((done) => setTimeout(done, 50));
          }
          return "timed out";
        })();
      `
    : String.raw`
        return (async () => {
          const deadline = performance.now() + 15000;
          while (performance.now() < deadline) {
            const button = document.querySelector(".studio-status__list");
            if (button && !button.hidden) return "ready";
            await new Promise((done) => setTimeout(done, 50));
          }
          return "timed out";
        })();
      `;

async function sample(tab: Tab, selector: string): Promise<Sampled | null> {
  const control = await tab.evaluate<Control | null>(HOVERED(selector));
  if (!control) return null;
  return { ...control, pixel: control.point ? await tab.pixel(control.point.x, control.point.y) : null };
}

async function sweep(): Promise<Case[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  await tab.onNewDocument(RESERVE_PROBE);
  const cases: Case[] = [];

  try {
    for (const stage of STAGES) {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          for (const scripts of SCRIPTS) {
            const url = `${site.origin}${prefix}${stage.path}`;
            await tab.viewport(viewport.width, viewport.height);
            // Reduced motion for the same reason every other browser-driven
            // check here asks for it: /backlot/'s idle camera moves a control
            // between the reading that picks a sample point and the screenshot
            // that takes it.
            await tab.media({ colourScheme: theme, reducedMotion: true });

            // Stored with scripts on and then loaded again, rather than flipped
            // on a painted page: the layout's inline script reads the key during
            // parsing, so the page is built in the theme from its first frame
            // and nothing transitions. Reading a colour inside the theme's own
            // transition returns the value it is moving away from (CLAUDE.md §7).
            await tab.scripts(true);
            await tab.goto(url);
            await tab.evaluate(
              `try { localStorage.setItem("at-theme", ${JSON.stringify(theme)}); } catch {} return null;`,
            );

            await tab.scripts(scripts);
            await tab.goto(url);

            let reserve: Reserve | null = null;
            let ready: string | null = null;
            if (scripts) {
              // Recorded, not thrown. A throw here aborts the module and the run
              // reports a file that failed to load, which says nothing about
              // which page, which size or which theme — and on /backlot/ that is
              // exactly the case worth naming, because a dead island presents as
              // a healthy static gallery.
              ready = await tab.evaluate<string>(READY(stage.name));
              reserve = await tab.evaluate<Reserve>("return window.__stageReserve ?? { ran: false };");
            }

            const hidden = await tab.evaluate<Hidden[]>(HIDDEN);

            // Hover, one control at a time, and take the pointer off between
            // them so the two readings are not each other's. With scripts off
            // the page's own timers never run, so every wait here is Node's.
            let list: Sampled | null = null;
            let away: Sampled | null = null;
            for (const [selector, put] of [
              [".studio-status__list", (value: Sampled | null) => (list = value)],
              [".studio-status__away", (value: Sampled | null) => (away = value)],
            ] as const) {
              const where = await tab.evaluate<{ x: number; y: number } | null>(
                `const element = document.querySelector(${JSON.stringify(selector)});
                 if (!element) return null;
                 const box = element.getBoundingClientRect();
                 if (box.width < 6 || box.height < 6) return null;
                 return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };`,
              );
              if (!where) continue;
              await tab.hover(where.x, where.y);
              await pause(350);
              put(await sample(tab, selector));
              await tab.hover(-1, -1);
              await pause(150);
            }

            cases.push({
              stage: stage.name,
              viewport: viewport.name,
              theme,
              scripts,
              hidden,
              reserve,
              ready,
              list,
              away,
            });
          }
        }
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return cases;
}

const cases = await sweep();

const describeCase = (one: Case) =>
  `${one.stage} at ${one.viewport} in the ${one.theme} theme with scripts ${one.scripts ? "on" : "off"}`;

// ---------------------------------------------------------------------------
// 1. Nothing carrying `hidden` is painted.
// ---------------------------------------------------------------------------
//
// Seen red by deleting `.studio-body [hidden]:not([data-reserve])` from the
// built page's inline <style> in dist/studio/index.html and dist/backlot/index.html,
// and reverting:
//
//   AssertionError: /studio/ at desktop 1920×1080 in the dark theme with scripts
//   off paints 2 elements that carry the hidden attribute: section.studio-canvas
//   [data-studio-canvas] 1920x923 display block; button.studio-status__list.
//   at-button.at-button--outline[data-studio-list] 96x27 display flex. An author
//   `display` beats the UA stylesheet's [hidden] (CLAUDE.md §7).: expected
//   [ …(2) ] to deeply equal []
//
//   AssertionError: /studio/ at phone 390×844 in the dark theme with scripts on
//   paints 2 elements that carry the hidden attribute: button.at-button.
//   at-button--outline[data-form-restore] 227x47 display flex; button.at-button.
//   at-button--outline[data-form-download] 242x47 display inline-flex. An author
//   `display` beats the UA stylesheet's [hidden] (CLAUDE.md §7).: expected
//   [ …(2) ] to deeply equal []
//   (4 failed | 25 passed — the same two pairs in both themes, taken before the
//   island-booted block below was added)
//
// Which is the whole of the defect on /studio/, and it is four elements in two
// pairs, not one: the desktop pair is only painted for a reader with JavaScript
// off, the phone pair only with it on. `[data-reserve]` is in that first list
// because with scripts off the attribute is never set, so the reservation is not
// what it is — it is a 923 px hole above the gallery.
describe.each(cases)("$stage at $viewport in the $theme theme, scripts $scripts", (one) => {
  it("paints nothing that carries the hidden attribute", () => {
    const painted = one.hidden
      .filter((row) => row.painted)
      .map((row) => `${row.what} ${row.width}x${row.height} display ${row.display}`);
    expect(
      painted,
      `${describeCase(one)} paints ${painted.length} elements that carry the hidden attribute: ` +
        `${painted.join("; ")}. An author \`display\` beats the UA stylesheet's [hidden] (CLAUDE.md §7).`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1b. The island booted, said positively.
// ---------------------------------------------------------------------------
//
// A dead island on /backlot/ presents as a healthy static gallery. That is the
// designed behaviour and it is right — the gallery is the page with JS off and
// the page again when the 3D cannot run — but it means every check that reads
// the gallery passes with the engine in pieces, and `boot()` catches the throw
// with `console.warn`, so nothing in the page says the 3D never ran. Lane 2 lost
// fifteen minutes to exactly this: `createHub` and `createBacklot` disagreed on
// a signature, the island threw on every load, and the page looked fine.
//
// So this asserts the positive, keyed on `data-backlot-ready` — the attribute
// boot.ts sets when the engine has the box and has presented a frame, which is
// the moment in question — rather than on the absence of an error. An absent
// error is not evidence of anything: the level it is logged at is a decision in
// somebody else's file, and a check that keys on it goes quiet the day that
// decision changes. §7's shape: probe the thing the code sets on purpose.
//
// Seen red by breaking the boot in the built bundle — replacing the body of the
// engine's entry with a throw in dist/_astro, the same way the first-frame
// sentinel was broken — and reverting:
//
//   AssertionError: /backlot/ at desktop 1920×1080 in the dark theme never set
//   data-backlot-ready, so the island did not boot. The gallery is still on
//   screen and still correct, which is why this has to be asserted rather than
//   inferred.: expected 'timed out' to be 'ready'
//   (4 failed | 25 passed)
describe("the island booted, rather than the gallery merely being fine", () => {
  const driven = cases.filter((one) => one.scripts);

  it("drove every stage with scripts on", () => {
    expect(driven.length).toBe(STAGES.length * VIEWPORTS.length * THEMES.length);
  });

  for (const one of driven) {
    const what = one.stage === "/backlot/" ? "data-backlot-ready" : "the status bar's own module";
    it(`${describeCase(one)} reached ${what}`, () => {
      expect(
        one.ready,
        `${describeCase(one)} never set ${what}, so the island did not boot. The gallery is still on screen ` +
          `and still correct, which is why this has to be asserted rather than inferred.`,
      ).toBe("ready");
    });
  }
});

// ---------------------------------------------------------------------------
// 2. The reservation the escape rule must not delete.
// ---------------------------------------------------------------------------
//
// Seen red by dropping `:not([data-reserve])` from the same inline <style>,
// which is the over-broad version of the fix above and passes check 1:
//
//   AssertionError: the studio-canvas reservation is display none at
//   DOMContentLoaded, so the section JS is about to reveal holds no space and
//   the page shifts under the reader when it lands (CLAUDE.md §7).: expected
//   'none' to be 'block'
//   (2 failed | 36 passed — and check 1 above stayed green throughout, which is
//   the point of having both)
// A second red, taken because this block's *scope* had never been watched fail.
// Stopping the page setting `data-reserve` on the canvas at all
// (`setAttribute("data-reserve", ...)` renamed in dist/studio/index.html):
//
//   AssertionError: /studio/ at desktop 1920×1080 in the dark theme with
//   scripts on held no space for studio-canvas at DOMContentLoaded. What it did
//   hold: studio-form none/hidden 0px: expected [ 'studio-form' ] to include
//   'studio-canvas'
//   (3 failed | 35 passed)
//
// The first version of that injection is why the probe below collects every
// reservation instead of the first one. `querySelector("[data-reserve][hidden]")`
// answered the desk form, which at 1920 is `display: none !important` from its
// own media query — so the run failed, but it failed on the wrong element with
// a message naming the wrong section, and it would have *passed* had the form's
// own reservation happened to be the one held open. A guard that reports on
// whatever the DOM offered first is the hand-kept-scope problem in miniature.
describe("the space held open for a section JavaScript is about to reveal", () => {
  const reserving = cases.filter(
    (one) => one.stage === "/studio/" && one.scripts && one.viewport === VIEWPORTS[0].name,
  );

  it("was looked for at the one moment it exists", () => {
    expect(reserving.length, "no case could have observed the reservation").toBeGreaterThan(0);
    for (const one of reserving) {
      expect(one.reserve?.ran, `the reservation probe did not run for ${describeCase(one)}`).toBe(true);
      const held = one.reserve?.held ?? [];
      expect(
        held.map((entry) => entry.what),
        `${describeCase(one)} held no space for ${RESERVATION} at DOMContentLoaded. What it did hold: ` +
          `${held.map((entry) => `${entry.what} ${entry.display}/${entry.visibility} ${entry.height}px`).join("; ") || "nothing"}`,
      ).toContain(RESERVATION);
    }
  });

  for (const one of reserving) {
    it(`holds it open in the ${one.theme} theme`, () => {
      const held = (one.reserve?.held ?? []).find((entry) => entry.what === RESERVATION);
      expect(held, `${describeCase(one)} had no ${RESERVATION} reservation to read`).toBeDefined();
      expect(
        held!.display,
        `the ${RESERVATION} reservation is display ${held!.display} at DOMContentLoaded, so the section JS is ` +
          `about to reveal holds no space and the page shifts under the reader when it lands (CLAUDE.md §7).`,
      ).toBe("block");
      // Held open but not read out: a reservation that is visible is an empty
      // box with nothing in it, which is the other way to get this wrong.
      expect(held!.visibility).toBe("hidden");
      expect(
        held!.height,
        `the ${RESERVATION} reservation is ${held!.height}px tall, which reserves nothing`,
      ).toBeGreaterThan(400);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. The status bar's two controls hover the same.
// ---------------------------------------------------------------------------
//
// Seen red by putting `.studio-status__away.at-button:hover { background: none }`
// back into the built page's inline <style> and reverting:
//
//   AssertionError: the status bar's link and its button hover differently as
//   declared: expected 'rgba(0, 0, 0, 0)' to be 'color(srgb 0.72549 0.490196
//   0.109804 …'
//   (6 failed | 32 passed — every row where both controls are painted, in both
//   themes)
//
// It fails on the declaration before it reaches the pixel, which is the right
// order: the two assertions are the same fact read twice, and the cheaper one
// says what is wrong without a screenshot. The pixel reading behind it is
// #201607 for the button and #070504 for the link in the dark theme.
//
// And seen red a second time, under the injection an independent review used to
// break this block while it stayed green: `.studio-status__list:hover,
// .studio-status__away:hover { background: none }` — *both* controls lose the
// theme's wash, which is the old button moving, which is the one thing this
// round forbids. The block asserted that the two agree and never asserted what
// they agree on, so agreeing on nothing passed at 38 of 38. With the wash
// anchored to the theme's own token first:
//
//   AssertionError: the list button's hover paints rgba(0, 0, 0, 0) where the
//   theme's --at-accent-soft resolves to color(srgb 0.72549 0.490196 0.109804 /
//   0.14). This is the shipping control and it does not move: it takes the
//   theme's outline-button wash, and a hover that clears it is a restyle, not a
//   fix.: expected 'rgba(0, 0, 0, 0)' to be 'color(srgb 0.72549 0.490196 …'
//   (6 failed | 32 passed)
describe("the status bar's link and its button take the same hover", () => {
  const both = cases.filter((one) => one.scripts && one.list && one.away);

  it("found a row with both controls painted in it", () => {
    // The floor. At 390 the phone composition hides the list toggle, so a run
    // where nothing matched would leave every assertion below untested and say
    // nothing about it.
    expect(
      both.length,
      "no case painted both controls at once, so the agreement was never tested",
    ).toBeGreaterThanOrEqual(4);
  });

  for (const one of both) {
    it(`agree on ${describeCase(one)}`, () => {
      const list = one.list!;
      const away = one.away!;
      expect(list.hover, "the list button was not hovered, so its reading is of its resting state").toBe(true);
      expect(away.hover, "the link was not hovered, so its reading is of its resting state").toBe(true);

      // Agreement first, and then what they agree **on**. The review broke this
      // block by giving *both* controls `background: none` on hover — the old
      // button moved, which is the one thing this round forbids — and the file
      // stayed green at 38 of 38, because agreeing on nothing is agreeing. So
      // the wash is anchored to the theme's own token before the two are
      // compared with each other.
      expect(
        list.background,
        `the list button's hover paints ${list.background} where the theme's --at-accent-soft resolves to ` +
          `${list.declaredWash}. This is the shipping control and it does not move: it takes the theme's ` +
          `outline-button wash, and a hover that clears it is a restyle, not a fix.`,
      ).toBe(list.declaredWash);
      expect(
        away.background,
        "the status bar's link and its button hover differently as declared",
      ).toBe(list.background);

      // And the wash is visible at all. Two controls that both resolve the token
      // to something transparent would satisfy every line above.
      expect(
        list.declaredWash,
        `--at-accent-soft resolves to ${list.declaredWash}, which paints nothing`,
      ).not.toMatch(/(^|,\s*)0\s*\)$/);

      expect(list.point, `no point inside the list button is its own fill (box ${list.box})`).not.toBeNull();
      expect(away.point, `no point inside the link is its own fill (box ${away.box})`).not.toBeNull();
      const listPixel = formatHex(list.pixel!);
      const awayPixel = formatHex(away.pixel!);
      expect(
        awayPixel,
        `the status bar's link and its button hover differently: the button paints ${listPixel} and the ` +
          `link paints ${awayPixel}. Two controls in the same row under the same pointer.`,
      ).toBe(listPixel);

      // The pixel has to be the wash over the bar, and not some other thing the
      // sampler happened to land on. Where a fill is flat, asserting the
      // sampled pixel equals the declared composite catches a bad sample point,
      // a covering element and a stale coordinate at once (CLAUDE.md §7).
      // Within a count per channel, and that bound is the reading itself rather
      // than a shrug. Exact equality was tried twice and is not available for a
      // translucent fill: a float blend of the resolved wash and the bar rounds
      // to #f8f0e3 where the page paints #f8f0e4, and so does asking Canvas2D
      // to do the same two fills — the page compositor's rounding is its own.
      // What this assertion is for survives the count: the difference between
      // the wash and no wash is eight counts (#fffdfa against #f8f0e4), so a
      // sample point on the wrong element, on a glyph, or left over from a
      // layout that has moved still fails it by a mile.
      const composite = opaque(list.declaredComposite, "the hovered pill's composite");
      // Rounded to counts before the comparison: the channels are floats here
      // and 1 came out as 1.0000000000000002, which a `<= 1` refuses.
      const drift = list.pixel!.map((channel, index) =>
        Math.abs(Math.round(channel * 255) - Math.round(composite[index]! * 255)),
      );
      expect(
        Math.max(...drift) <= 1,
        `the hovered pill paints ${listPixel} where ${list.washAlpha} over the status bar's own background ` +
          `composites to ${formatHex(composite)} — off by ${drift.map((d) => d.toFixed(1)).join("/")} counts, ` +
          `so the sample is not of the pill's own fill`,
      ).toBe(true);

      // And the ink on top of it. This is the reading the comment in
      // studio-shell.css used to say nobody had taken: --at-brand-ink is gold in
      // the dark theme and the brand's copper in the light one, and the wash
      // underneath it is the same gold at a low alpha.
      const ink = opaque(list.ink, "the hovered control's colour");
      const ratio = contrastRatio(ink, list.pixel!);
      expect(
        ratio,
        `the hovered control paints ${formatHex(ink)} on ${listPixel} — ${ratio.toFixed(2)}:1, and AA body ` +
          `text needs ${AA_BODY_TEXT}:1.`,
      ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    });
  }
});

// ---------------------------------------------------------------------------
// The sweep measured something.
// ---------------------------------------------------------------------------
//
// The failure mode of everything above is a page that stops loading, or a
// selector that stops matching, after which every case is empty and every
// assertion is about nothing.
describe("the sweep measured something", () => {
  it("drove both stages at both viewports, in both themes, with scripts on and off", () => {
    expect(cases.length).toBe(STAGES.length * VIEWPORTS.length * THEMES.length * SCRIPTS.length);
  });

  it("found elements carrying the hidden attribute to be right about", () => {
    // Every case has some; a run where none did would mean the pages had
    // stopped shipping their hidden sections and check 1 would be vacuous.
    for (const one of cases) {
      expect(one.hidden.length, `${describeCase(one)} has no [hidden] elements at all`).toBeGreaterThan(0);
    }
  });

  it("read two different themes, not the same one twice", () => {
    const pixels = cases.filter((one) => one.away?.pixel).map((one) => `${one.theme}:${formatHex(one.away!.pixel!)}`);
    const dark = new Set(pixels.filter((entry) => entry.startsWith("dark:")).map((entry) => entry.slice(5)));
    const light = new Set(pixels.filter((entry) => entry.startsWith("light:")).map((entry) => entry.slice(6)));
    expect(dark.size).toBeGreaterThan(0);
    expect(light.size).toBeGreaterThan(0);
    expect([...dark], "both themes produced the same hovered fill, so the toggle did not reach the bar").not.toEqual(
      [...light],
    );
  });
});
