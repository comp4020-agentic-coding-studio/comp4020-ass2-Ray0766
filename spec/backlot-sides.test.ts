// A name holds the side it opens on.
//
// At 390 every control is a dot and its name is a 1x1 box until the reader
// lands on it. Which side of the dot the name then opens on is decided by the
// engine, per control, against what is around it (`src/backlot/engine/
// hotspots.ts`) — and for one round it was decided from a number the decision
// itself had just written: the picker measured the live label, the live label
// for the control the keyboard is on is the *revealed* one, and its width was
// capped by whichever side had been picked last frame. So the side set the
// width and the width set the side. Watched on a build of `ff7807f`, the Studio
// door's name alternated for as long as the keyboard stayed on it, with the
// button standing still:
//
//   before@-74 before@-74 below@274 below@274 before@-74 below@274 below@274 …
//
// 39.3% of the name on screen in one state and 65.9% in the other, taking turns
// about every 500-750 ms.
//
// **Why this is its own file, and not a few lines added to the contrast sweep.**
// Three things have to be true at once for the defect to be visible, and the
// sweep can only offer two of them.
//
//  1. *The watch has to be four seconds or more.* Each side holds for 500 to
//     750 ms, so the whole period is 1.0 to 1.5 s. Two readings 600 ms apart and
//     four readings across 900 ms both fit inside a single dwell and agree —
//     for the same reason a clock read twice a second looks stopped. Sixteen
//     readings at 250 ms catch it.
//  2. *The control has to be one nothing has touched yet.* The checks lane put
//     this watch after their reveal loop and it held perfectly still: focusing
//     28 controls for 1.8 s each is enough for the picker to converge on an
//     answer it then keeps. Their `whileStill` settle-probe was enough on its
//     own too.
//  3. *The watch leaves the keyboard on a control*, and every colour reading
//     taken afterwards is then of a different state — it broke 38 readings in
//     the file they tried it in.
//
// A page of its own gives all three: the control this focuses is the first thing
// touched on it, and nothing downstream needs the page untouched.
//
// Seen red by making one side's cap differ from another's again — restoring
// `max-inline-size: 12rem` on `[data-backlot-side="before"]` in
// `src/styles/backlot-hud.css`, which is one half of the original defect and
// enough to bring the loop back on its own, since the picker goes on reading
// the painted box for as long as a name is painted:
//
//   AssertionError: the studio door's name changed which side it opens on 7
//   time(s) while nothing touched the page: below@274w216 dot@249
//   below@274w216 dot@249 before@-101w234 dot@249 before@-101w234 dot@249
//   below@274w216 dot@249 … before@-101w234 dot@249
//   (1 failed | 1 passed — the injection matched exactly once, and the dot
//   never moves, which is the half of the reading that says this is a decision
//   and not the camera)
//
// **The first injection I tried matched exactly once and was green**, which is
// the no-op that reads like a check gone blind (CLAUDE.md section 7). It capped
// `below`, and this door does not use `below`: the picker plans all four sides
// from **one** width — the painted one — so a cap only bites on the side that is
// currently painted. Capping a side nothing is painting changes nothing and
// says nothing. An injection for this check has to cap the side the control it
// watches actually opens on, which is `before` for the Studio door at 390.
//
// What this does **not** guard is how much of the name is on screen; that is
// `spec/backlot-contrast.test.ts`, which is red on the symptom a reader sees.
// This one is about the mechanism: a decision that cannot hold still is wrong
// even in the moments it happens to be right.
import { describe, expect, it } from "vitest";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

/** The hub door whose name is long enough that no side of its dot holds it
 *  whole at 390 — which is what makes it the one with something to argue
 *  about. Read off the DOM rather than the manifest because it is the painted
 *  control this is about, and the id is asserted below before it is watched. */
const DOOR = "studio";

/** Sixteen readings at 250 ms is four seconds, which is at least two and a half
 *  of the 1.0-1.5 s period the defect ran at. Less than four seconds is the
 *  window that reported it still. */
const READINGS = 16;
const SPACING = 250;

const READY = String.raw`
  return (async () => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (document.querySelector("[data-backlot-stage][data-backlot-ready]")) return "ready";
      await new Promise((done) => setTimeout(done, 100));
    }
    return "timed out";
  })();
`;

/**
 * Focus one control and read it sixteen times without touching it again.
 *
 * The reading is the side the engine says the name opens on **and** where the
 * name is actually painted, because those are two different claims and the
 * defect moved both. The button's own left edge goes in too: a name that moves
 * because its button moved is the camera doing its job, not a decision
 * flip-flopping, and without the button in the reading the two are the same
 * string.
 *
 * `Tab` first, so the browser treats the focus that follows as a keyboard focus
 * and `:focus-visible` matches — the reveal rules are written on that, and
 * without it the label stays a 1x1 box and there is nothing to watch.
 *
 * **No backticks below.** This is a String.raw template and one closes it
 * early, which collects zero tests under a summary that says the file passed.
 * Seventh time in this repo.
 */
const WATCH = String.raw`
  return (async () => {
    const button = document.querySelector('[data-backlot-hotspot="` + DOOR + String.raw`"]');
    if (!button) return "no such control";
    const label = button.querySelector(".backlot-hotspot__label");
    if (!label) return "no nameplate";
    button.focus();
    if (document.activeElement !== button) return "the control refused focus";
    // Long enough for the camera to finish framing the door and for the park to
    // settle on the new positions, so the watch below is of a page at rest.
    await new Promise((done) => setTimeout(done, 900));
    const seen = [];
    for (let i = 0; i < ` + READINGS + String.raw`; i++) {
      await new Promise((done) => setTimeout(done, ` + SPACING + String.raw`));
      const box = label.getBoundingClientRect();
      const dot = button.getBoundingClientRect();
      seen.push(
        (button.dataset.backlotSide || "-") + "@" + Math.round(box.left) +
          "w" + Math.round(box.width) + " dot@" + Math.round(dot.left),
      );
    }
    return seen.join(" | ");
  })();
`;

async function watch(): Promise<string> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  try {
    // The phone viewport on purpose: this is the one where every control is a
    // dot and the name is the only thing that says what it is, so which side it
    // opens on is the whole of the reading experience rather than a detail.
    await tab.viewport(390, 844);
    await tab.media({ colourScheme: "dark", reducedMotion: true });
    await tab.goto(`${site.origin}${prefix}backlot/`);
    expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");
    await tab.press("Tab");
    return await tab.evaluate<string>(WATCH);
  } finally {
    await tab.close();
    await site.close();
  }
}

// At import time, like the rest of this suite drives a browser: the watch is
// four seconds of page plus a boot, and a test body gets five.
const series = await watch();

describe("a name holds the side it opens on", () => {
  it("found the door, and the keyboard could reach its name", () => {
    expect(
      series,
      `the watch never got as far as reading the ${DOOR} door's name, so the assertion below is about nothing`,
    ).toContain("@");
  });

  it("does not change sides while nothing touches the page", () => {
    const readings = series.split(" | ");
    const changes = readings.filter((one, index) => index > 0 && one !== readings[index - 1]).length;
    expect(
      changes,
      `the ${DOOR} door's name changed which side it opens on ${changes} time(s) while nothing touched ` +
        `the page: ${readings.join(" ")}. A reader watching it sees the name hop from one side of the dot ` +
        `to the other. If the button moved too, that is the camera and this reading is wrong; if only the ` +
        `label moved, the side is being decided from a number the decision itself wrote.`,
    ).toBe(0);
  });
});
