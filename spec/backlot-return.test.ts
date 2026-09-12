// Coming back to /backlot/ the way a reader comes back: by clicking the link.
//
// The two stages are joined by the status bar — "Walk the backlot →" on
// /studio/, "Open the Studio" on /backlot/ — and the site runs Astro's
// `<ClientRouter>`, so following either of those is a **soft** navigation: the
// document is swapped, not replaced. That is the route this site was designed
// around and it is the route a marker takes, so it is the one that has to work.
//
// It did not. Measured by clicking real links only:
//
//     first load, hard        ready = true
//     click /studio/, click /backlot/
//     after a soft return     ready = false
//       stage in document: true, gallery visible: true, canvas painted 0x0
//     after a hard reload     ready = true
//
// And nothing anywhere saw it, because the reader gets the static gallery and
// the static gallery is correct. That is the third time in one round a right
// fallback has hidden a failure from everyone looking at the page, after the
// `console.warn` boot catch and the reduced-motion frames that were identical
// because both were blown out to white.
//
// `spec/stage-shell.test.ts` already asserts `data-backlot-ready`, which is the
// right instrument pointed at the wrong moment: it proves the island boots on a
// **fresh** load and says nothing about a return. This file is that assertion
// moved onto the journey.
//
// ---------------------------------------------------------------------------
// Three things, because a teardown and a re-entry can each be right and be
// wrong together
// ---------------------------------------------------------------------------
//
//   ready again      the attribute boot.ts sets when the engine has the box and
//                    has presented a frame.
//   one engine       a return that boots a **second** engine beside a live first
//                    one satisfies `ready` and is a worse bug than the one it
//                    fixes. Counted as WebGL **contexts**, not as a frame rate:
//                    two engines is two contexts, a number with no threshold in
//                    it. And counted twice over — what drew, and what is still
//                    alive — because a context whose frame loop was cancelled
//                    but which was never released draws nothing and is invisible
//                    to the first count.
//   the box back     on a return that boots, the gallery ends up hidden again,
//                    the way it does on a first load. A stage that is ready with
//                    the gallery still over it is ready about nothing.
//
// ---------------------------------------------------------------------------
// No fallback, anywhere
// ---------------------------------------------------------------------------
//
// The driver that found this bug first reported fourteen clean round trips and
// every one was wrong: the page it left from had no link back, so it fell
// through to `location.assign` and measured hard reloads. A driver with a
// fallback answers a question you did not ask and does not tell you it changed
// the question.
//
// So: this navigates by clicking a link and by nothing else. If the link is not
// on the page it fails and says which page and which link. And the softness is
// not assumed either — a marker is stamped on `window` before each navigation
// and read after it. A document that was replaced loses it, which is exactly
// what a hard load looks like from the inside.

import { describe, expect, it } from "vitest";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab, type ColourScheme } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

/** Dark is what a marker sees on a first visit. The route is not a colour, so
 *  one theme is the honest scope. */
const THEME: ColourScheme = "dark";

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/** Counts WebGL contexts and the draws each one makes, installed before any of
 *  the page's own script runs so nothing can be created behind it.
 *
 *  Contexts rather than frames. "Did the return boot a second engine" is a
 *  question about how many renderers exist, and three.js gives each one its own
 *  context — so the answer is a count with no rate and no threshold in it. A
 *  frames-per-second reading would need a band, and a band is a number somebody
 *  tunes. Survives a soft navigation because the document does; a hard load
 *  re-installs it, which is itself the tell. */
const DRAW_COUNTER = String.raw`
  (() => {
    if (window.__drawWatch) return;
    const seen = new Map();
    let next = 0;
    window.__drawWatch = seen;
    const tag = (context) => {
      if (!context) return context;
      if (!seen.has(context)) seen.set(context, { id: ++next, draws: 0, last: 0 });
      return context;
    };
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, options) {
      const context = realGetContext.call(this, kind, options);
      if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl") tag(context);
      return context;
    };
    for (const proto of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!proto) continue;
      for (const method of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
        const real = proto.prototype[method];
        if (!real) continue;
        proto.prototype[method] = function (...args) {
          const entry = seen.get(this);
          if (entry) {
            entry.draws += 1;
            entry.last = performance.now();
          }
          return real.apply(this, args);
        };
      }
    }
  })();
`;

/** Three different questions, and the difference between them is the whole of
 *  what this file got wrong the first time.
 *
 *    drawing   contexts that drew inside the sample window
 *    alive     contexts that exist and have not been lost
 *    attached  of those, the ones whose canvas is still in the document
 *
 *  Counting what **drew** answers "is something rendering", which is not "is
 *  something still here". A teardown that cancels the animation frame and stops
 *  there leaves a live context bound to a canvas that has left the document: it
 *  draws nothing, `drawing` reads 0 and 1 exactly as it does on a clean tree,
 *  and a whole root cause is invisible. Measured on a build with
 *  `forceContextLoss()` and the observer disconnect removed: **alive 1, attached
 *  0** while the reader is on the other page, and live contexts climbing 1, 2, 3
 *  across two laps — under fourteen passing tests.
 *
 *  `isContextLost()` is the one call that tells them apart, and lane 1 had to
 *  make the same distinction to find the bug at all. */
const DRAWING = (window_: number) => String.raw`
  const seen = window.__drawWatch;
  if (!seen) return null;
  const now = performance.now();
  let drawing = 0;
  let alive = 0;
  let attached = 0;
  let draws = 0;
  for (const [context, entry] of seen.entries()) {
    if (now - entry.last <= ${window_}) {
      drawing += 1;
      draws += entry.draws;
    }
    let lost = true;
    try {
      lost = context.isContextLost();
    } catch {
      lost = true;
    }
    if (lost) continue;
    alive += 1;
    const canvas = context.canvas;
    if (canvas && canvas.isConnected) attached += 1;
  }
  return { drawing, alive, attached, draws, known: seen.size };
`;

const STATE = String.raw`
  const stage = document.querySelector("[data-backlot-stage]");
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  const main = document.querySelector("main");
  const shell = main ? main.getBoundingClientRect() : null;
  const gallery = document.querySelector("[data-studio-fallback]");
  const box = canvas ? canvas.getBoundingClientRect() : null;
  return {
    path: location.pathname,
    soft: window.__softMarker === 1,
    stageInDocument: Boolean(stage),
    ready: Boolean(stage && stage.hasAttribute("data-backlot-ready")),
    mode: stage ? stage.dataset.backlotMode ?? "" : "",
    galleryHidden: Boolean(gallery && gallery.hidden),
    galleryInDocument: Boolean(gallery),
    canvas: box ? Math.round(box.width) + "x" + Math.round(box.height) : "none",
    // The shell's own height, which is the thing a letterbox actually moves, and
    // the attribute the page's inline script sets during parsing to say the
    // layout may exist at all.
    shell: shell ? Math.round(shell.width) + "x" + Math.round(shell.height) : "none",
    boxed: Boolean(stage && stage.hasAttribute("data-backlot-box")),
  };
`;

interface State {
  path: string;
  soft: boolean;
  stageInDocument: boolean;
  ready: boolean;
  mode: string;
  galleryHidden: boolean;
  galleryInDocument: boolean;
  canvas: string;
  shell: string;
  boxed: boolean;
}

interface Drawing {
  /** Drew inside the sample window. */
  drawing: number;
  /** Exists and has not been lost. */
  alive: number;
  /** Alive, and its canvas is still in the document. */
  attached: number;
  draws: number;
  /** Every context ever created in this document, lost or not. */
  known: number;
}

interface Journey {
  viewport: string;
  /** Fresh load of /backlot/. */
  first: State;
  firstDrawing: Drawing | null;
  /** After clicking through to /studio/. */
  away: State;
  awayDrawing: Drawing | null;
  /** After clicking back to /backlot/. */
  back: State;
  backDrawing: Drawing | null;
  /** The link text each hop was taken by, so a failure says what was clicked. */
  clicked: string[];
}

/** Wait for the island, or give up and say so. Never throws: the assertions
 *  below name the moment, which a thrown sweep cannot. */
const READY = String.raw`
  return (async () => {
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline) {
      const stage = document.querySelector("[data-backlot-stage]");
      if (stage && stage.hasAttribute("data-backlot-ready")) return "ready";
      await new Promise((done) => setTimeout(done, 50));
    }
    return "timed out";
  })();
`;

/** The status bar's link to the other stage, as a point to click.
 *
 *  Nothing here falls back. If the link is not on the page, or is not the link
 *  to the page we mean, this returns null and the caller fails with the reason —
 *  it does not reach for `location.assign`, which would silently turn a soft
 *  navigation into a hard one and report a passing round trip. */
const LINK_TO = (wanted: string) => String.raw`
  const link = document.querySelector(".studio-status__away");
  if (!link) return { found: false, why: "the status bar has no link to the other stage" };
  const href = link.getAttribute("href") || "";
  if (!href.endsWith(${JSON.stringify(wanted)})) {
    return { found: false, why: "the status bar's link points at " + href + ", not " + ${JSON.stringify(wanted)} };
  }
  const box = link.getBoundingClientRect();
  if (box.width < 4 || box.height < 4) {
    return { found: false, why: "the link is on the page but measures " + Math.round(box.width) + "x" + Math.round(box.height) };
  }
  link.scrollIntoView({ block: "center" });
  const after = link.getBoundingClientRect();
  return {
    found: true,
    why: "",
    text: (link.textContent || "").replace(/\s+/g, " ").trim(),
    x: Math.round(after.left + after.width / 2),
    y: Math.round(after.top + after.height / 2),
  };
`;

interface Link {
  found: boolean;
  why: string;
  text?: string;
  x?: number;
  y?: number;
}

async function walk(): Promise<Journey[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const journeys: Journey[] = [];

  try {
    await tab.onNewDocument(DRAW_COUNTER);

    for (const viewport of VIEWPORTS) {
      await tab.viewport(viewport.width, viewport.height);
      await tab.media({ colourScheme: THEME, reducedMotion: true });

      // A fresh load of the backlot, the way a marker arrives the first time.
      await tab.goto(`${site.origin}${prefix}backlot/`);
      await tab.evaluate(
        `try { localStorage.setItem("at-theme", ${JSON.stringify(THEME)}); } catch {} return null;`,
      );
      await tab.goto(`${site.origin}${prefix}backlot/`);
      await tab.evaluate<string>(READY);
      await pause(600);

      const clicked: string[] = [];
      const stamp = `window.__softMarker = 1; return null;`;
      await tab.evaluate(stamp);
      const first = await tab.evaluate<State>(STATE);
      const firstDrawing = await tab.evaluate<Drawing | null>(DRAWING(1500));

      // Out through the link, not through the address bar.
      const out = await tab.evaluate<Link>(LINK_TO("/studio/"));
      if (!out.found) throw new Error(`cannot leave /backlot/ by clicking: ${out.why}`);
      clicked.push(out.text!);
      await tab.click(out.x!, out.y!);
      await pause(2500);
      const away = await tab.evaluate<State>(STATE);
      const awayDrawing = await tab.evaluate<Drawing | null>(DRAWING(1500));

      // And back the same way.
      const home = await tab.evaluate<Link>(LINK_TO("/backlot/"));
      if (!home.found) throw new Error(`cannot return to /backlot/ by clicking: ${home.why}`);
      clicked.push(home.text!);
      await tab.click(home.x!, home.y!);
      await pause(2500);
      await tab.evaluate<string>(READY);
      await pause(1200);
      const back = await tab.evaluate<State>(STATE);
      const backDrawing = await tab.evaluate<Drawing | null>(DRAWING(1500));

      journeys.push({
        viewport: viewport.name,
        first,
        firstDrawing,
        away,
        awayDrawing,
        back,
        backDrawing,
        clicked,
      });
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return journeys;
}

const journeys = await walk();
const at = (viewport: string) => journeys.find((one) => one.viewport === viewport)!;

describe.each(VIEWPORTS)("coming back to the backlot at $name", ({ name }) => {
  it("took both hops by clicking a link, and neither reloaded the page", () => {
    // The floor, and the thing that makes every assertion below mean what it
    // says. A hard navigation would satisfy "ready again" trivially — it is the
    // case that already worked — so the softness is asserted first, by a marker
    // stamped on the window that only survives a swap.
    const one = at(name);
    expect(one.clicked, "both hops should have been taken by clicking a link").toHaveLength(2);
    expect(
      one.away.soft,
      `leaving /backlot/ by clicking "${one.clicked[0]}" replaced the document instead of swapping it, so ` +
        `this is a hard navigation and not the journey a reader takes`,
    ).toBe(true);
    expect(
      one.back.soft,
      `returning to /backlot/ by clicking "${one.clicked[1]}" replaced the document instead of swapping it`,
    ).toBe(true);
    expect(one.away.path, "the first hop did not land on /studio/").toContain("/studio/");
    expect(one.back.path, "the second hop did not land on /backlot/").toContain("/backlot/");
  });

  it("booted on the first load, so the return has something to be compared with", () => {
    const one = at(name);
    expect(
      one.first.ready,
      `the island did not boot on a fresh load at ${name}, so nothing below is about a return`,
    ).toBe(true);
    expect(one.first.galleryHidden, "the gallery still had the box on a fresh load").toBe(true);
    expect(
      one.firstDrawing?.drawing,
      `${one.firstDrawing?.drawing} WebGL contexts were drawing on a fresh load`,
    ).toBe(1);
    expect(
      one.firstDrawing?.alive,
      `${one.firstDrawing?.alive} WebGL contexts were alive on a fresh load`,
    ).toBe(1);
  });

  it("boots again on the way back", () => {
    const one = at(name);
    // Measured, and it is worth knowing which of these assertions is load
    // bearing: **neither of the two in this test fires under the real bug.**
    // With the teardown kept and the re-entry removed, `data-backlot-ready`
    // comes back **true** on the return — the attribute survives the swap — and
    // the canvas still measures its full size, because backlot.css sizes the box
    // whether or not anything draws into it. Both look right and nothing is
    // running.
    //
    // What catches it is the pair below: no WebGL context drawing, and the
    // gallery still holding the box. They are kept here anyway because they are
    // the contract and they catch other shapes — a stage that never arrives, a
    // canvas collapsed to nothing — but the receipt says plainly that on this
    // route they are the quiet ones.
    expect(
      one.back.canvas,
      `the canvas measures ${one.back.canvas} after returning to /backlot/, so whatever the ready attribute ` +
        `says there is nothing drawing into it`,
    ).not.toBe("0x0");
    expect(
      one.back.ready,
      `the island did not boot after returning to /backlot/ by clicking "${one.clicked[1]}". The stage is ` +
        `${one.back.stageInDocument ? "in the document" : "missing"}, the gallery is ` +
        `${one.back.galleryHidden ? "hidden" : "visible"}, and the canvas measures ${one.back.canvas}. The ` +
        `reader gets the static gallery and nothing looks wrong, which is why this needs asserting rather ` +
        `than looking at: the fallback is correct and the 3D is gone.`,
    ).toBe(true);
  });

  it("gives the box back to the 3D, the way a first load does", () => {
    const one = at(name);
    // A stage that is ready with the gallery still over it is ready about
    // nothing. Asserted separately from `ready` because a re-entry could set the
    // attribute and leave the box where it was.
    expect(one.back.galleryInDocument, "the gallery left the document entirely").toBe(true);
    expect(
      one.back.galleryHidden,
      `the island reported ready after the return but the gallery still has the box at ${name}`,
    ).toBe(true);
    expect(one.back.mode, "the stage did not go back into backlot mode").toBe("backlot");
  });

  // Seen red by walking the route: /backlot/ -> /studio/ -> /backlot/ through
  // the status bar's own links, which is the journey this shell exists to serve.
  //
  //     390x844    stage 699 -> 204 px, canvas 699 -> 195
  //     1920x1080  stage 923 -> 969
  //
  // The phone comes back at 28% of its fresh-load height with the engine alive
  // and drawing 5,880 calls a second into the letterbox, which is why nothing
  // looks broken. Stable at six seconds, after a scroll to the top, and after a
  // full resize round trip.
  //
  // The old assertion here was `canvas !== "0x0"`, and 390x195 is not 0x0. A
  // check that asks whether a thing exists cannot see a thing that came back the
  // wrong size, and "the size it left" is the only version of this question with
  // no threshold in it.
  it("comes back the size it left", () => {
    const one = at(name);
    expect(
      one.back.shell,
      `the shell measured ${one.first.shell} on a fresh load and ${one.back.shell} after returning through ` +
        `the status bar's links. A stage that comes back short is a 3D scene letterboxed into a strip with ` +
        `the engine still drawing into it, which looks like nothing at all.`,
    ).toBe(one.first.shell);
    expect(
      one.back.canvas,
      `the canvas measured ${one.first.canvas} on a fresh load and ${one.back.canvas} after the return`,
    ).toBe(one.first.canvas);
    // And the reason, asserted rather than left for the next person to find:
    // `data-backlot-box` is set by the page's own inline script during parsing,
    // and a soft navigation does not parse anything. Without it the stage loses
    // the rule that sizes it and falls back to its content.
    expect(
      one.back.boxed,
      `the stage lost data-backlot-box on the return. The page's inline script sets it during parsing and a ` +
        `soft navigation never parses, so the rule that gives the stage its height stops matching and the ` +
        `stage sizes to its content instead.`,
    ).toBe(true);
  });

  it("runs one engine after the return, not two", () => {
    const one = at(name);
    // The failure a re-entry invites: boot a second engine beside a live first
    // one. It satisfies `ready`, it draws twice as much, and it is worse than
    // the bug it fixes. Counted as contexts rather than frames — two engines is
    // two contexts, which is a number with nothing to tune.
    expect(one.backDrawing, "the draw counter did not survive the return").not.toBeNull();
    expect(
      one.backDrawing!.drawing,
      `${one.backDrawing!.drawing} WebGL contexts were still drawing after the return, of ` +
        `${one.backDrawing!.known} ever created. One engine leaves one; a return that boots a second beside ` +
        `a live first one satisfies every other assertion here.`,
    ).toBe(1);
    // And **alive**, which is the different question. A first engine whose frame
    // loop was cancelled but whose context was never released draws nothing and
    // is invisible to the line above: the count that catches it is how many
    // contexts still exist, not how many are rendering.
    expect(
      one.backDrawing!.alive,
      `${one.backDrawing!.alive} WebGL contexts are alive after the return, of ${one.backDrawing!.known} ` +
        `ever created, ${one.backDrawing!.attached} of them still attached to a canvas in the document. One ` +
        `engine leaves one alive and one attached; a context that outlives its canvas draws nothing and ` +
        `costs everything.`,
    ).toBe(1);
    expect(
      one.backDrawing!.attached,
      `${one.backDrawing!.attached} of the live contexts are attached to a canvas in the document`,
    ).toBe(1);
  });

  it("stops drawing while the reader is on the other page", () => {
    const one = at(name);
    // The other half of the same fact, and the one that says the teardown ran.
    // Lane 1 measured 5,929 draws a second on screen, 5,880 after the swap with
    // the canvas out of the document, and 0 after their dispose: an engine that
    // keeps drawing into a detached canvas is invisible and expensive.
    expect(
      one.awayDrawing!.drawing,
      `${one.awayDrawing!.drawing} WebGL contexts were still drawing while the reader was on ` +
        `${one.away.path}. The canvas is out of the document by then, so the frames go nowhere and cost ` +
        `everything.`,
    ).toBe(0);
    // The half that the drawing count cannot see. A teardown that cancels the
    // frame and stops there reads 0 here and leaves the context alive: measured
    // as `alive 1, attached 0` on a build with the context loss and the observer
    // disconnect removed, under a fully green suite.
    expect(
      one.awayDrawing!.alive,
      `${one.awayDrawing!.alive} WebGL contexts are still alive while the reader is on ${one.away.path}, ` +
        `${one.awayDrawing!.attached} of them attached to a canvas in the document. Stopping the frame loop ` +
        `is not letting go: a live context bound to a detached canvas draws nothing and is invisible to ` +
        `every count of what drew.`,
    ).toBe(0);
  });
});

describe("the walk measured something", () => {
  it("walked both viewports", () => {
    expect(journeys.length).toBe(VIEWPORTS.length);
  });

  it("watched a context draw at all, so the counter is not measuring nothing", () => {
    // The counter is installed before the page's own scripts and wraps the
    // prototypes. If it stopped matching — a renderer that draws some other way,
    // a context created before the wrap — every count above would be zero and
    // every assertion would pass for the wrong reason.
    for (const one of journeys) {
      expect(
        one.firstDrawing?.draws ?? 0,
        `no WebGL draw was counted at ${one.viewport}, so the counter is measuring nothing`,
      ).toBeGreaterThan(100);
    }
  });
});
