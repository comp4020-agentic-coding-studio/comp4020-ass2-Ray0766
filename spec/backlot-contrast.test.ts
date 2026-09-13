// The HUD's controls, measured as rendered pixels, at both marking viewports
// and in both themes.
//
// Why this is not covered by anything already here. The build's axe pass runs
// axe-core over the HTML inside a JSDOM document, and JSDOM has no layout and
// no computed colour, so its contrast rules cannot fire at all — "60 pages, no
// accessibility violations" is printed on every build and is silent about every
// line below. spec/palette.test.ts is token arithmetic, which proves the tokens
// agree with each other and says nothing about whether anything asks for one.
// And neither of them can see the HUD, which does not exist until the island has
// mounted: there is no HUD in any built HTML file.
//
// Two ways this file has been wrong, both of which read as green, and both kept
// here because they are worth more than the checks they broke.
//
// It collected **zero tests** for one run while the summary said "Tests 1210
// passed": a backtick inside one of the String.raw probes below closed the
// template, the transform failed, and all 68 readings were simply absent. The
// file-level FAIL was in the output; the number I read was not.
// spec/suite-integrity.test.ts now parses every spec file and fails by name
// before the runner gets there.
//
// And it read colour *inside the theme's own transition*. Flipping `data-theme`
// on a page that is already painted transitions `color`, and a computed read in
// that window returns the value the property is moving away from: the dark
// theme's #f0eeeb, measured against the light theme's #fffdfa ground, 1.14:1, on
// five of six controls, on one run in three. It is the same trap that made the
// engine's scene boot blown out to white, met from the other direction. The
// sweep now stores the theme and loads the page again, so it is built in that
// theme from its first frame and nothing transitions — which is also exactly
// what a returning reader gets, so the check is more honest as well as stable.
//
// The scene is put into reduced motion for the same reason spec/backlot-hotspots
// does it: the idle camera moves a button between the reading that picks a
// sample point and the screenshot that takes it. Colour does not depend on
// motion, and the alternative is sampling somewhere the control no longer is.
//
// Not covered here, and it should be: the button's own fill against the scene
// behind it. The pill is `--at-bg` over a floor the engine paints from the same
// palette, and proving that boundary is legible everywhere the camera can put a
// door needs a per-pixel search around each control rather than one reading.
// It is in the receipt as the gap it is.

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
  whileStill,
  type ColourScheme,
  type Resolved,
  type Rgb,
} from "./lib/chrome.ts";
import { doorInto, roomNamed, roomsWithDoors } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const doors = backlotManifest.doors;
// Every room, each paired with the door that opens it. This file used to take
// `rooms[0]` and `doors.find(kind === "room")` — the machine room by the
// manifest's own array order, and the Lectures door the moment a corridor
// existed (spec/lib/backlot.ts). The corridor's thirteen controls are held to
// every floor in here now, on the same derivation that gave the machine room
// its ninth: the list came out thirteen on its own.

/** WCAG 2.2 SC 1.4.11. The dot is the whole of the control at 390px, so it is
 *  a part required to identify it, not decoration with an aria-hidden on it. */
const AA_NON_TEXT = 3;

/** What the compositor does: a partly transparent ink over an opaque fill, in
 *  sRGB's own gamma space, which is where a browser blends. */
const over = (ink: Rgb, alpha: number, fill: Rgb): Rgb =>
  ink.map((channel, index) => channel * alpha + fill[index]! * (1 - alpha)) as Rgb;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080, labelled: true },
  { name: "phone 390×844", width: 390, height: 844, labelled: false },
] as const;

/** A first visit is forced dark on any OS, so dark is what a marker sees; light
 *  is what a reader gets back the moment the status bar's toggle stores a
 *  preference, which is why it is checked too (CLAUDE.md §7). */
const THEMES: readonly ColourScheme[] = ["dark", "light"];

/** What each place shows, derived from the manifest.
 *
 *  **The machine room grew a ninth control this round** — `look-machine`, the
 *  tower, which was the one fitting in a room named after it that a keyboard
 *  reader could not approach. Nothing here was widened by hand to absorb it: it
 *  is a `BacklotInteractive` like the other eight, so this list came out nine on
 *  its own, and the new control is now held to every floor in this file — its
 *  fill against its dot, its label's ink, its reveal on focus — exactly like the
 *  rest.
 *
 *  That is the case for deriving a scope from the data rather than keeping one
 *  by hand, made by a round in which the data changed twice: the control first
 *  appeared under a namespaced id the room registered itself, and then moved
 *  into the manifest under a plain one. A list typed here would have been wrong
 *  in two different ways inside an hour.
 *
 *  **And the corridor arrived the same way.** It is a room in the manifest, so
 *  its thirteen controls are a place in this list by derivation — twelve stages
 *  and a way out, each held to its fill against its dot, its label's ink and its
 *  reveal on focus, at both marking viewports in both themes. Nothing here was
 *  widened by hand to take it. What did have to change is how a room is entered:
 *  `place.name === "the machine room"` was a hand-kept scope of exactly the kind
 *  the paragraph above is about, and there is no door from one room to another,
 *  so each room is entered from a freshly loaded hub. */
const PLACES: { name: string; roomId: string | null; required: () => string[] }[] = [
  { name: "the hub", roomId: null, required: () => doors.map((door) => door.id) },
  ...roomsWithDoors.map(({ room: entry }) => ({
    name: entry.title,
    roomId: entry.id,
    required: () => entry.interactives.map((one) => one.id),
  })),
];

interface Probe {
  id: string;
  /** The accessible name, painted label or not. */
  name: string;
  /** The button's own declared background, resolved by the page's canvas. */
  fill: Resolved | null;
  /** Somewhere inside the button, clear of its border and of everything it
   *  contains, so the pixel there is the button's own fill. */
  point: { x: number; y: number } | null;
  why: string;
  /** Each child of the control, as it was when the reading was taken. */
  parts: string[];
  /** Any ::before or ::after painting content on the control or inside it. */
  pseudo: string[];
  /** The engine collapsed this control to its dot. */
  dense: boolean;
  /** And the browser has the reader on it, which reveals a dense label. */
  focused: boolean;
  /** The label, if the layout is painting one at this width. */
  label: { text: string; alpha: number; ink: Resolved } | null;
  /** The dot, and a point at the middle of it. */
  dot: { fill: Resolved; alpha: number; point: { x: number; y: number } | null } | null;
  opacity: number;
}

interface Reading extends Probe {
  place: string;
  viewport: string;
  theme: ColourScheme;
  pixel: Rgb | null;
  dotPixel: Rgb | null;
  scrolledBefore: { x: number; y: number };
  scrolledAfter: { x: number; y: number };
}

/** Runs in the page. Finds the parts of a control by what they are rather than
 *  by the class names the engine happens to use: the label is the painted
 *  descendant carrying the button's text, the dot is the painted descendant
 *  carrying none. A class rename in backlot-hud.css should not quietly turn
 *  this into a check that measures nothing. */
const PROBE = String.raw`
  ${RESOLVE_COLOUR}

  const painted = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 2 && rect.height > 2 &&
      style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
    );
  };

  const alphaUpTo = (node, stop) => {
    let alpha = 1;
    for (let el = node; el && el !== stop; el = el.parentElement) alpha *= Number(getComputedStyle(el).opacity);
    return alpha;
  };

  const buttons = [...document.querySelectorAll("[data-backlot-hud] button")].filter((b) => !b.hidden);

  const probes = buttons.map((button) => {
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    const children = [...button.querySelectorAll("*")];
    const labelled = children.filter((child) => child.textContent.trim() !== "" && painted(child));
    const plain = children.filter((child) => child.textContent.trim() === "" && painted(child));

    // Keep-out: every painted descendant's boxes, and every text run's own
    // rects. A point on a glyph reads the ink, not the fill.
    const keepOut = [];
    for (const child of children) {
      if (!painted(child)) continue;
      keepOut.push(...child.getClientRects());
    }
    // A text run's own rects are laid out at the text's full width, whether or
    // not the element clips it. The label is overflow hidden with an ellipsis,
    // so "Play four sentences + beats + negatives" lays out wider than the pill
    // it sits in, and its raw rect covered every candidate point in the control
    // -- three of them could not be sampled at all. Clamped to the element that
    // owns the text, which is where the glyphs actually stop being painted.
    const clamp = (rect, bound) => ({
      left: Math.max(rect.left, bound.left),
      right: Math.min(rect.right, bound.right),
      top: Math.max(rect.top, bound.top),
      bottom: Math.min(rect.bottom, bound.bottom),
    });
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (!text.nodeValue || !text.nodeValue.trim()) continue;
      if (!painted(text.parentElement)) continue;
      const bound = text.parentElement.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) keepOut.push(clamp(rect, bound));
    }
    const clearOf = (x, y) =>
      keepOut.every((r) => x < r.left - 2 || x > r.right + 2 || y < r.top - 2 || y > r.bottom + 2);

    const inset = (side) => parseFloat(style["border" + side + "Width"]) + 1;
    const left = box.left + inset("Left");
    const right = box.right - inset("Right");

    // A hotspot is a pill, and the corner of a rounded box is where its
    // antialiased blend with whatever is behind it lives — the lightest pixel a
    // worst-case search goes hunting for, and the one the first version of this
    // found: #2b1d09 sampled against a declared #070504, four rows down from
    // the top of a 28px capsule where the shape has not reached that far left
    // yet. At the vertical middle of a rounded box its horizontal extent is the
    // full width, whatever the radius, so the search is confined to the band
    // where that is true: a single row for a capsule, the whole height for a
    // square one.
    const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((corner) =>
      parseFloat(style["border" + corner + "Radius"]),
    );
    const radius = Math.min(Math.max(...corners), box.width / 2, box.height / 2);
    const middle = (box.top + box.bottom) / 2;
    const reach = Math.max(0, box.height / 2 - radius - 1);
    const top = middle - reach;
    const bottom = middle + reach;

    // The candidates are whole pixels from the start, and the bounds are rounded
    // inwards once. Interpolating in floats and then rounding, with a guard that
    // threw away anything outside the band, silently threw away the *only* two
    // clear points on three of these controls: a button at x=859.0 has its
    // inset edge at 861.0078, rounding lands on 861, and 861 < 861.0078 is the
    // guard. It looked like a control with nowhere clear to sample and it was a
    // hundredth of a pixel of arithmetic.
    const x0 = Math.ceil(left);
    const x1 = Math.floor(right);
    const y0 = reach > 0 ? Math.ceil(top) : Math.round(middle);
    const y1 = reach > 0 ? Math.floor(bottom) : Math.round(middle);

    let point = null;
    let why =
      x1 < x0 || y1 < y0
        ? "the control has no whole pixel inside its own border"
        : "no point inside the control is clear of what it contains";
    const STEPS = 16;
    for (let row = 0; row <= STEPS && !point; row++) {
      for (let col = 0; col <= STEPS && !point; col++) {
        const x = x0 + Math.round(((x1 - x0) * col) / STEPS);
        const y = y0 + Math.round(((y1 - y0) * row) / STEPS);
        if (x1 < x0 || y1 < y0) continue;
        if (!clearOf(x, y)) continue;
        if (document.elementFromPoint(x, y) !== button) {
          why = "every clear point inside the control is covered by something else";
          continue;
        }
        point = { x, y };
      }
    }
    // A sampler that cannot find a point has to say what was in the way, or the
    // next person reads "no point is clear" and has to rebuild the geometry by
    // hand to find out why.
    if (point) why = "";
    else {
      const round = (n) => Math.round(n * 10) / 10;
      why +=
        ". The control is [" + round(box.left) + ".." + round(box.right) + "] x [" +
        round(box.top) + ".." + round(box.bottom) + "], the pixels searched were y " +
        y0 + ".." + y1 + ", x " + x0 + ".." + x1 +
        ", and the keep-out boxes were " +
        keepOut
          .map((r) => "[" + round(r.left) + ".." + round(r.right) + "] x [" + round(r.top) + ".." + round(r.bottom) + "]")
          .join(", ");
    }

    // The name, whether or not a label is painted. A control collapsed to its
    // dot is still a control and still has to say what it is.
    const named = (button.getAttribute("aria-label") || button.textContent || "").replace(/\s+/g, " ").trim();
    const labelNode = labelled[labelled.length - 1] ?? null;
    const dotNode = plain[0] ?? null;
    const dotBox = dotNode ? dotNode.getBoundingClientRect() : null;

    return {
      id: button.dataset.backlotHotspot,
      name: named,
      // The two things the page says on purpose about a label, rather than a
      // threshold on its width. data-backlot-dense is the engine saying "this
      // control is a dot and its name lives in the accessible name"; matching
      // :focus-visible is the browser saying "and this is the one the reader is
      // on". A dense label is 1x1 and a focused dense label is revealed at full
      // size by design, so the pair is what tells a collapsed label from a
      // painted one -- CLAUDE.md 7's rule about keying on what is set at the
      // moment in question rather than on the consequence.
      //
      // No backticks in this comment: it sits inside a String.raw probe and a
      // backtick closes it. That has now happened five times in this repo, and
      // spec/suite-integrity.test.ts has named every one of them before the
      // runner could report a silent zero.
      dense: button.dataset.backlotDense === "true",
      focused: button.matches(":focus-visible"),
      // A pseudo-element is not an element, and everything above walks
      // elements. querySelectorAll("*") cannot see a ::after: it has no node,
      // no textContent and nothing to measure, so a rule that paints
      // content: attr(data-backlot-hotspot) beside every control at 390 puts
      // eight labels over the 3D scene and every reading here comes back empty
      // -- both halves of the label check go quiet together and the file reports
      // 76 passed. The size-threshold path was well defended; the
      // element-existence assumption was not defended at all.
      //
      // getComputedStyle takes the pseudo-element as a second argument, which is
      // the whole fix. Both of them, on the button and on every child, because
      // any of those boxes can carry one.
      pseudo: [button, ...children].flatMap((node) =>
        ["::before", "::after"].flatMap((which) => {
          const style = getComputedStyle(node, which);
          const content = style.content;
          if (!content || content === "none" || content === "normal") return [];
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return [];
          return [String(node.className || node.tagName) + which + " " + content];
        }),
      ),
      fill: resolveColour(style.backgroundColor),
      point,
      why,
      // What the control was made of when it was read, so "no dot" says which
      // part was missing and how big it was rather than only that it was gone.
      parts: children.map((child) => {
        const rect = child.getBoundingClientRect();
        const childStyle = getComputedStyle(child);
        return (
          String(child.className || child.tagName) +
          " " + Math.round(rect.width) + "x" + Math.round(rect.height) +
          " " + childStyle.display + "/" + childStyle.visibility + "/" + childStyle.opacity +
          (child.textContent.trim() === "" ? " (no text)" : " (text)")
        );
      }),
      opacity: Number(style.opacity),
      label: labelNode
        ? {
            text: labelNode.textContent.replace(/\s+/g, " ").trim(),
            alpha: alphaUpTo(labelNode, button),
            ink: resolveColour(getComputedStyle(labelNode).color),
          }
        : null,
      dot: dotNode
        ? {
            fill: resolveColour(getComputedStyle(dotNode).backgroundColor),
            alpha: alphaUpTo(dotNode, button),
            point: {
              x: Math.round(dotBox.left + dotBox.width / 2),
              y: Math.round(dotBox.top + dotBox.height / 2),
            },
          }
        : null,
    };
  });

  return { scroll: { x: scrollX, y: scrollY }, probes };
`;

/** Waits for the HUD to be on screen *and* to have stopped changing shape.
 *  Two things go wrong a frame too early, and both did. The stage carries
 *  `data-reserve`, so for a moment after boot.ts takes the `hidden` attribute
 *  off it a computed style read from here still reports the
 *  `[data-reserve][hidden]` rule's `visibility: hidden` — and a control inside
 *  a `visibility: hidden` subtree cannot be focused and is not what
 *  `elementFromPoint` answers. And a control read on the frame it was parked on
 *  can still measure its parts at nothing, which showed up as "people has no
 *  dot" on one run in three and a green suite on the others. So: the same shape
 *  twice in a row, with the stage on screen for both.
 */
/** Does focus alone bring a collapsed control's label back? Driven with the
 *  keyboard, not read off a stylesheet: a reveal that only answers `:hover`
 *  leaves three of the machine room's controls nameless to anybody driving the
 *  page from the keyboard, whatever their accessible name says. The label is
 *  found by being the descendant that carries the text, so a class rename does
 *  not turn this into a check that measures nothing.
 *
 *  **It puts the scene back before it reads the "before", and it has to now.**
 *  Focus pushes the camera — that is ruling 1, and the front wall inherits it —
 *  so focusing one control brings the whole wall in and every label on it out
 *  of its dot. This probe is run over the collapsed controls in turn, so by the
 *  third one the "unfocused" reading was being taken with the camera still at
 *  the wall from the second: `play-front-t4` measured 247 px wide unfocused and
 *  247 px focused, and the check read that as a keyboard that does not bring
 *  the name back. The control was fine; the reading was of a scene the probe
 *  had moved itself.
 *
 *  So: blur, wait out the camera's travel back, read the resting width, then
 *  focus. What satisfies this afterwards may be the stylesheet's reveal or may
 *  be the push — on the front wall at 1920 it is now the push — and either is
 *  the keyboard bringing the name back, which is the whole of what it asks. */
const REVEAL = (id: string) => String.raw`
  return (async () => {
    const button = document.querySelector('[data-backlot-hotspot="${id}"]');
    if (!button) return null;
    const carrying = [...button.querySelectorAll("*")].filter((child) => child.textContent.trim() !== "");
    const label = carrying[carrying.length - 1];
    if (!label) return null;
    const resting = document.activeElement;
    if (resting instanceof HTMLElement) resting.blur();
    // The camera's travel is 620 ms and the buttons are parked from it, so this
    // is that plus room for the frame the parking lands on.
    await new Promise((done) => setTimeout(done, 900));
    const before = label.getBoundingClientRect();
    button.focus();
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    // Long enough for a push to finish as well as for a transition to, since
    // on the front wall the push is what brings the label back.
    await new Promise((done) => setTimeout(done, 900));
    const after = label.getBoundingClientRect();
    return {
      focused: document.activeElement === button,
      beforeWidth: Math.round(before.width),
      afterWidth: Math.round(after.width),
      afterHeight: Math.round(after.height),
      afterVisibility: getComputedStyle(label).visibility,
    };
  })();
`;

const MOUNTED = String.raw`
  const stage = document.querySelector("[data-backlot-stage]");
  // Not the stage's own visibility: its subtree's. A computed style read here
  // goes on reporting the [data-reserve][hidden] rule for a while after the
  // attribute is gone, and it clears on the stage before it clears on the
  // controls inside it -- measured, as a hotspot whose dot came back
  // "14x14 block/hidden/1" while the stage above it already read visible.
  const onScreen = () => {
    // The mode first. The stage now holds the gallery until the engine takes
    // the box, and while it does the HUD carries the hidden attribute -- its
    // buttons do not, so a check that only looked at them found six controls
    // inside a display:none container and called the page ready. It passed
    // alone and failed under six browsers competing, which is the worst way for
    // it to be wrong.
    if (stage.dataset.backlotMode !== "backlot") return false;
    if (stage.hidden || getComputedStyle(stage).visibility !== "visible") return false;
    const control = document.querySelector("[data-backlot-hud] button:not([hidden])");
    if (!control) return false;
    for (const part of [control, ...control.querySelectorAll("*")]) {
      if (getComputedStyle(part).visibility !== "visible") return false;
    }
    return true;
  };
  const shape = () =>
    [...document.querySelectorAll("[data-backlot-hud] button")]
      .filter((button) => !button.hidden)
      .map((button) => {
        const box = button.getBoundingClientRect();
        const parts = [...button.querySelectorAll("*")].map((child) => {
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          // Colour is in the shape, not just geometry, and that is the whole
          // reason this loop exists in a contrast check. The theme transitions
          // the colour when data-theme flips, and a computed read inside that
          // transition returns the value it is moving *from*: the dark theme's
          // #f0eeeb, measured against the light theme's #fffdfa ground at
          // 1.14:1, on five of six controls, on one run in three. Waiting for
          // the same colour twice in a row is waiting for the transition.
          return (
            Math.round(rect.width) + "x" + Math.round(rect.height) +
            style.visibility + style.color + style.backgroundColor
          );
        });
        return Math.round(box.width) + "x" + Math.round(box.height) + ":" + parts.join(",");
      })
      .join("|");

  let previous = "";
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    await new Promise((done) => requestAnimationFrame(() => done()));
    if (!onScreen()) {
      previous = "";
      continue;
    }
    const now = shape();
    if (now !== "" && now === previous) return "mounted";
    previous = now;
  }
  return null;
`;

interface Reveal {
  focused: boolean;
  beforeWidth: number;
  afterWidth: number;
  afterHeight: number;
  afterVisibility: string;
}

const reveals: Record<string, Reveal | null> = {};

/** Whether the island got far enough for any of this to be about a 3D scene.
 *  Recorded per combination rather than thrown, and the reason is in the
 *  describe below. */
interface Mount {
  viewport: string;
  theme: ColourScheme;
  mounted: boolean;
}

const mounts: Mount[] = [];

async function sweep(): Promise<Reading[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  const readings: Reading[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await tab.viewport(viewport.width, viewport.height);
        await tab.media({ colourScheme: theme, reducedMotion: true });
        // Stored, then loaded again — rather than flipped on a page that is
        // already painted. The layout's own inline script reads this key during
        // parsing, so the page is built in the theme from its first frame and
        // nothing transitions. Flipping `data-theme` after the fact transitions
        // `color`, and a computed read inside that transition returns the value
        // it is moving *from*: measured as the dark theme's #f0eeeb against the
        // light theme's #fffdfa at 1.14:1, on five of six controls, on one run
        // in three. This is also what a returning reader actually gets.
        await tab.goto(url);
        await tab.evaluate(
          `try { localStorage.setItem("at-theme", ${JSON.stringify(theme)}); } catch {} return null;`,
        );
        await tab.goto(url);
        const mounted = await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
        mounts.push({ viewport: viewport.name, theme, mounted: mounted === "mounted" });
        // Recorded and skipped, not thrown. A throw here happens during module
        // evaluation, so the runner reports a file that failed to load: no test
        // names, none of the 68 readings below, and a summary line that has
        // nothing to say about which page, which size or which theme — which is
        // the exact shape spec/suite-integrity.test.ts exists to break up. The
        // island falls back to the static gallery when the engine throws, and
        // that gallery is correct, so nothing on the page says the 3D never ran
        // either. The describe at the bottom of this file is where that gets
        // said, by name, with the combination in the message.
        if (!mounted) continue;

        for (const place of PLACES) {
          if (place.roomId) {
            // Entered with the keyboard, so the engine's focus hand-over runs
            // the way it does for a reader. The page is loaded again first, so
            // each room is entered from a hub in its resting state rather than
            // from wherever the last room left the camera — which is also the
            // only way a second room can be reached at all, since there is no
            // door from one room to another.
            const door = doorInto(roomNamed(place.roomId));
            await tab.goto(url);
            const back = await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
            if (!back) continue;
            await tab.evaluate(
              `document.querySelector('[data-backlot-hotspot="${door.id}"]').focus(); return null;`,
            );
            await tab.press("Enter");
            await tab.evaluate(`return new Promise((done) => setTimeout(done, 2500));`);
          }

          const { scroll, sampled, scrolledAfter } = await whileStill(tab, async () => {
            const { scroll, probes } = await tab.evaluate<{
              scroll: { x: number; y: number };
              probes: Probe[];
            }>(PROBE);
            const sampled: Array<Probe & { pixel: Rgb | null; dotPixel: Rgb | null }> = [];
            for (const probe of probes) {
              sampled.push({
                ...probe,
                pixel: probe.point ? await tab.pixel(probe.point.x, probe.point.y) : null,
                dotPixel: probe.dot?.point ? await tab.pixel(probe.dot.point.x, probe.dot.point.y) : null,
              });
            }
            return { scroll, sampled };
          });

          // Every control that is not painting a label, focused, to see whether
          // the keyboard brings it back.
          for (const probe of sampled) {
            if (probe.label !== null || !viewport.labelled) continue;
            reveals[`${place.name}|${viewport.name}|${theme}|${probe.id}`] = await tab.evaluate<Reveal | null>(
              REVEAL(probe.id),
            );
          }

          readings.push(
            ...sampled.map((reading) => ({
              ...reading,
              place: place.name,
              viewport: viewport.name,
              theme,
              scrolledBefore: scroll,
              scrolledAfter,
            })),
          );
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

const at = (place: string, viewport: string, theme: ColourScheme) =>
  readings.filter((r) => r.place === place && r.viewport === viewport && r.theme === theme);

// Seen red by painting the hotspot's label in the brand gold in the built page
// (`.backlot-hotspot__label { color: var(--at-accent) }`), which is the mistake
// CLAUDE.md §7 says this palette keeps inviting:
//   AssertionError: the lectures control paints #b97d1c on #fffdfa — 3.44:1,
//   and AA body text needs 4.5:1. A brand colour is a fill, not ink
//   (CLAUDE.md §7).: expected 3.4395959058292935 to be greater than or equal
//   to 4.5
//   (14 failed | 54 passed — every control at 1920, in both themes)
// then reverted. Injected into the build rather than into backlot-hud.css
// because that file belongs to the engine this round.
describe.each(PLACES)("$name", ({ name: place, required }) => {
  describe.each(VIEWPORTS)("at $name", ({ name: viewport, labelled }) => {
    describe.each(THEMES)("in the %s theme", (theme) => {
      it("has the controls it should have", () => {
        expect(at(place, viewport, theme).map((r) => r.id)).toEqual(required());
      });

      for (const id of required()) {
        it(`the ${id} control`, () => {
          const found = at(place, viewport, theme).find((r) => r.id === id);
          // Named, rather than a TypeError two lines down. The one way this is
          // missing is the island not mounting, and the describe at the bottom
          // of the file says so with the combination in it; this keeps the
          // per-control failures readable while that is true.
          expect(
            found,
            `no reading for ${id} in ${place} at ${viewport} in the ${theme} theme — see "the island booted" ` +
              `below, which names the combination that did not mount`,
          ).toBeDefined();
          const reading = found!;

          // Every coordinate above was read in the page and sampled from Node a
          // moment later. If the page moved in between, nothing below is about
          // the place it says it is.
          expect(reading.scrolledAfter, "the page moved while the pixels were being sampled").toEqual(
            reading.scrolledBefore,
          );

          expect(reading.point, `could not sample ${id}: ${reading.why}`).not.toBeNull();
          expect(reading.pixel, `no pixel came back for ${id}`).not.toBeNull();
          const fill = reading.pixel!;

          // The control's fill is opaque and it is the topmost thing at that
          // point, so the composited colour and the declared one agree. When
          // they stop agreeing the pixel is the true reading, and this says so.
          expect(
            formatHex(fill),
            `${id}'s composited fill should match its declared background`,
          ).toBe(formatHex(opaque(reading.fill!, `${id}'s background`)));
          expect(reading.opacity, `${id} is not fully opaque, so its label sits over the scene too`).toBe(1);

          // At every size, not only the phone. A pseudo-element carries type
          // that nothing above can see or measure, so the ink check cannot be
          // run on it — the only honest position is that a hotspot does not have
          // one. Seen red by adding
          // `.backlot-hotspot::after { content: attr(data-backlot-hotspot) }`
          // under a 640px media query, which paints a pill of type beside all
          // eight controls in the machine room.
          // Before the pseudo-element read that injection gave **76 passed, 0
          // failed** — the screenshot is the room with eight labels over the
          // scene and the check written to forbid exactly that saying nothing.
          // After: 28 failed | 48 passed.
          //
          // And one negative result worth as much as the fix, because it says
          // which half is load-bearing: stripping `clip-path` from the dense
          // label does **not** spill the 1 px box. `overflow: hidden` survives
          // on the label's own base rule and the visually-hidden recipe is
          // written out twice, so the defence holds on the half nobody was
          // looking at. The size threshold was well defended; the assumption
          // that a painted thing has an element was not defended at all.
          expect(
            reading.pseudo,
            `${id} paints a pseudo-element over the canvas: ${reading.pseudo.join(", ")}. It is type with no ` +
              `element behind it, so nothing here can measure its ink — a hotspot's name belongs in its label ` +
              `or in its accessible name, where both can be read.`,
          ).toEqual([]);

          // The dot is the control at 390px and part of it at 1920.
          expect(
            reading.dot,
            `${id} has no dot, so there is nothing to identify it by. It was made of: ${reading.parts.join("; ")}`,
          ).not.toBeNull();
          expect(reading.dotPixel, `no pixel came back for ${id}'s dot`).not.toBeNull();
          const dot = reading.dotPixel!;
          expect(formatHex(dot), `${id}'s dot should paint its declared fill`).toBe(
            formatHex(opaque(reading.dot!.fill, `${id}'s dot`)),
          );
          const dotRatio = contrastRatio(dot, fill);
          expect(
            dotRatio,
            `${id}'s dot paints ${formatHex(dot)} on ${formatHex(fill)} — ${dotRatio.toFixed(2)}:1, and a ` +
              `part that identifies a control needs ${AA_NON_TEXT}:1.`,
          ).toBeGreaterThanOrEqual(AA_NON_TEXT);

          // Two different silences, and they are not the same check.
          //
          // At 390 px the layout clips *every* label and puts the name on the
          // button: there is no reveal, the dot is the control, and a label
          // turning up here would mean the phone composition had stopped
          // applying. That is asserted as the state it is.
          if (!labelled) {
            // At 390 every control is dense and its label collapses to a 1x1
            // box with the whole sentence still inside it. Every control except
            // the one the reader is on: entering the room hands focus to a
            // control inside it, `:focus-visible` reveals a dense label by
            // design, and that label is genuinely 141x27 px of type over the
            // canvas. Measured, after the assertion below failed on it: eight
            // controls dense, seven labels 1x1, `leave-machine-room` at 141x27
            // and `document.activeElement`. Blur it and all eight read 1x1.
            //
            // So the revealed one is not excused, it is checked — a label a
            // reader can see over a 3D scene is exactly what the ink check is
            // for, and the phone invariant is that *nothing else* paints one.
            if (reading.focused && reading.label !== null) {
              const revealed = over(
                opaque(reading.label.ink, `${id}'s label colour`),
                reading.label.alpha,
                fill,
              );
              const revealedRatio = contrastRatio(revealed, fill);
              expect(
                revealedRatio,
                `${id} has the reader on it at ${viewport}, which reveals its label over the canvas: it ` +
                  `paints ${formatHex(revealed)} on ${formatHex(fill)} — ${revealedRatio.toFixed(2)}:1, and ` +
                  `AA body text needs ${AA_BODY_TEXT}:1.`,
              ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
              expect(reading.dense, `${id} is revealed at ${viewport} but is not marked dense`).toBe(true);
              return;
            }
            expect(
              reading.label,
              `${id} paints a label over the canvas at ${viewport} without the reader being on it, so it ` +
                `needs the ink check. Every control at this size is a dot; only the focused one reveals.`,
            ).toBeNull();
            expect(reading.name, `${id} has no name to stand in for the label it does not paint`).not.toBe("");
            return;
          }

          // At 1920 it is a fact about *this control*, not about the
          // viewport. Where the anchors on a wall are closer together than the
          // labels are wide, the engine collapses a label to its dot — five
          // pictures at 143 px with labels up to 320 px cannot all be labelled
          // in place, and every layout that keeps all five puts them on top of
          // the artwork they name. The engine sizes that test against the
          // labelled width rather than the rendered one, so a collapsed button
          // does not measure narrow and un-collapse itself.
          //
          // So this branches per control. Where there is a label, its ink is
          // measured on the fill. Where there is not, the control still has to
          // carry its whole name and a dot you can see, and the label has to
          // come back for the keyboard — three assertions where there used to
          // be one, which is the only shape of change to a failing check worth
          // making.
          if (reading.label === null) {
            // Across every room, not the machine room's list: a corridor's
            // controls are named by their own manifest exactly the same way,
            // and looking only in one room turned every corridor control into
            // "a door with no label" and skipped the name assertion for it.
            const interactive = roomsWithDoors
              .flatMap(({ room: entry }) => entry.interactives)
              .find((entry) => entry.id === id);
            const door = doors.find((entry) => entry.id === id);
            const expected = interactive?.label ?? `Open the ${door?.label} door`;

            expect(
              reading.name,
              `${id} is collapsed to its dot and its accessible name is "${reading.name}" — a control ` +
                `with no painted label is only as good as the name it carries`,
            ).not.toBe("");
            if (interactive) {
              expect(reading.name, `${id}'s name is not the one the manifest gives it`).toBe(expected);
            }

            const reveal = reveals[`${place}|${viewport}|${theme}|${id}`];
            expect(reveal, `${id} was never focused, so the reveal was not tested`).not.toBeNull();
            expect(reveal!.focused, `${id} could not take focus`).toBe(true);
            expect(
              reveal!.afterWidth,
              `${id}'s label is ${reveal!.beforeWidth} px wide unfocused and ${reveal!.afterWidth} px wide ` +
                `focused — the keyboard does not bring it back, so this control is nameless to anyone not ` +
                `using a pointer`,
            ).toBeGreaterThan(reveal!.beforeWidth + 20);
            expect(reveal!.afterVisibility).toBe("visible");
            return;
          }

          const ink = over(opaque(reading.label.ink, `${id}'s label colour`), reading.label.alpha, fill);
          const ratio = contrastRatio(ink, fill);
          expect(
            ratio,
            `the ${id} control paints ${formatHex(ink)}` +
              `${reading.label.alpha === 1 ? "" : ` (its colour at ${reading.label.alpha} opacity)`} on ` +
              `${formatHex(fill)} — ${ratio.toFixed(2)}:1, and AA body text needs ${AA_BODY_TEXT}:1. ` +
              `A brand colour is a fill, not ink (CLAUDE.md §7).`,
          ).toBeGreaterThanOrEqual(AA_BODY_TEXT);
        });
      }
    });
  });
});

// ---------------------------------------------------------------------------
// The island booted, said positively and said by name.
// ---------------------------------------------------------------------------
//
// This used to be a `throw` inside `sweep()`. It read as the careful thing to do
// and it was the wrong shape: a throw at module evaluation takes the whole file
// down, so the run prints a file that failed to load with no test names, after
// up to four twenty-second waits, and every one of the 68 readings above is
// simply absent — under a summary line that still counts the rest of the suite
// as passing. A suite that cannot name what failed is a suite somebody re-runs
// instead of reads.
//
// Keyed on the mount having happened rather than on an error having been
// logged. A dead island on /backlot/ presents as a healthy static gallery —
// that fallback is the designed behaviour and it is correct — so there is
// nothing on the page to notice, and `boot()`'s own log line is a decision in
// another file that a check should not depend on.
//
// Seen red by making the engine throw where lane 2's signature mismatch made it
// throw — the engine's entry replaced with a thrower in the built bundle, so
// boot() catches, the page falls back to the static gallery and looks perfectly
// healthy — and reverting://
// Anchored on a **shape**, not a name. `createBacklot` occurs 0 times in the
// built bundle — it minifies to two letters — so an instruction naming it
// produces a green run that reads exactly like a check gone blind. The shape
// `await(await X({canvas:…,hud:…,payload:…,rooms:…})).ready` matches once in the
// chunk the backlot page loads, and that is what to replace with a thrower.
//
//   AssertionError: the backlot never mounted at desktop 1920×1080 in the dark
//   theme, so nothing above is about a 3D scene. The static gallery would still
//   be on screen and still correct, which is why this is asserted rather than
//   inferred.: expected false to be true
//   (74 failed | 2 passed)
//
// 74 of the 76 fail, and that is the improvement rather than a problem with it:
// under the old `throw` the run printed a file that failed to load, zero test
// names and none of these 76 at all. Now the first thing in the failure list
// says which combination did not mount and why the page looks fine anyway.
describe("the island booted before any of this was measured", () => {
  it("tried every combination", () => {
    expect(mounts.length, "the sweep did not reach every viewport and theme").toBe(
      VIEWPORTS.length * THEMES.length,
    );
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      it(`mounted at ${viewport.name} in the ${theme} theme`, () => {
        const mount = mounts.find((one) => one.viewport === viewport.name && one.theme === theme);
        expect(mount, `the sweep never got as far as ${viewport.name} in the ${theme} theme`).toBeDefined();
        expect(
          mount!.mounted,
          `the backlot never mounted at ${viewport.name} in the ${theme} theme, so nothing above is about a 3D ` +
            `scene. The static gallery would still be on screen and still correct, which is why this is ` +
            `asserted rather than inferred.`,
        ).toBe(true);
      });
    }
  }
});

// The failure mode of everything above is a layout change that hides every
// label, after which all the desktop cases take the phone branch and the suite
// stays green about a HUD nobody can read.
describe("the sweep measured something", () => {
  it("measured every control in every place, at both viewports, in both themes", () => {
    const controls = PLACES.reduce((sum, place) => sum + place.required().length, 0);
    expect(
      readings.length,
      `${readings.length} readings came back and there are ${controls} controls across ${PLACES.length} ` +
        `place(s), at ${VIEWPORTS.length} viewports in ${THEMES.length} themes`,
    ).toBe(controls * VIEWPORTS.length * THEMES.length);
  });

  it("found painted labels at the desktop viewport, and measured their ink", () => {
    // The floor. Collapsing is per control and legitimate; collapsing *every*
    // label is a layout change that would leave this check measuring nothing
    // but dots, and it would otherwise pass.
    const desktop = readings.filter((r) => r.viewport === VIEWPORTS[0].name);
    expect(desktop.length).toBeGreaterThan(0);
    const painted = desktop.filter((r) => r.label !== null).length;
    expect(
      painted,
      `${painted} of ${desktop.length} controls painted a label at the desktop viewport`,
    ).toBeGreaterThanOrEqual(Math.ceil(desktop.length / 2));
  });

  it("gave every control a name, painted or collapsed", () => {
    for (const reading of readings) {
      expect(reading.name, `${reading.id} at ${reading.viewport} in ${reading.theme} has no name`).not.toBe("");
    }
  });

  it("drove the keyboard reveal on every control that collapsed", () => {
    const collapsed = readings.filter((r) => r.label === null && r.viewport === VIEWPORTS[0].name);
    expect(collapsed.length, "no control collapsed anywhere, so the reveal was never exercised").toBeGreaterThan(0);
    for (const reading of collapsed) {
      expect(
        reveals[`${reading.place}|${reading.viewport}|${reading.theme}|${reading.id}`],
        `${reading.id} collapsed at ${reading.viewport} and its reveal was not driven`,
      ).toBeTruthy();
    }
  });

  it("paints no label at the phone viewport except on the control with the reader on it", () => {
    // Re-derived rather than re-numbered. This used to assert that *every*
    // control at 390 had a collapsed label, and the number it compared against
    // was the count of readings — which was true until the engine's focus
    // hand-over started revealing one on the way into a room. Patching 28 to 26
    // would have been fitting the check to the page; the honest statement is
    // which control is allowed to paint one and why.
    const phone = readings.filter((r) => r.viewport === VIEWPORTS[1].name);
    expect(phone.length).toBeGreaterThan(0);
    const painted = phone.filter((r) => r.label !== null);
    expect(
      painted.filter((r) => !r.focused).map((r) => `${r.place}/${r.id}`),
      "a control painted a label at 390 without the reader being on it",
    ).toEqual([]);
    // And the reveal really happens, so the branch above is not a comment: the
    // hand-over puts the reader on a control in the room and that control shows
    // its name.
    expect(
      painted.length,
      "no control revealed a label at 390 at all, so the focus hand-over did not run and the branch that " +
        "checks the revealed ink was never exercised",
    ).toBeGreaterThan(0);
  });

  it("found some controls collapsed at the desktop viewport, so that branch ran", () => {
    // The collapse is the design; a run where nothing collapsed would leave the
    // name, reveal and dot assertions above untested and say nothing about it.
    const collapsed = readings.filter((r) => r.label === null && r.viewport === VIEWPORTS[0].name);
    expect(collapsed.length, "no control collapsed at 1920, so the collapse branch never ran").toBeGreaterThan(0);
  });

  it("read two different themes, not the same one twice", () => {
    const fills = new Set(
      readings.filter((r) => r.point).map((r) => `${r.theme}:${formatHex(r.pixel!)}`),
    );
    const dark = [...fills].filter((entry) => entry.startsWith("dark:"));
    const light = [...fills].filter((entry) => entry.startsWith("light:"));
    expect(dark.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
    expect(
      dark.map((entry) => entry.slice(5)),
      "both themes produced the same control fill, so the toggle did not reach the HUD",
    ).not.toEqual(light.map((entry) => entry.slice(6)));
  });
});
