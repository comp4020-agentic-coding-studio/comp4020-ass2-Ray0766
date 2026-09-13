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

import { backlotDoors } from "../src/backlot/rooms/manifest.ts";
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
  /** Whether the control had stopped being parked before its box was read. */
  still?: boolean;
  text?: string;
  x?: number;
  y?: number;
}

/** The door's control, probed until the scene has settled enough for its middle
 *  to be the control. A single probe is a photograph of a HUD that is parked
 *  every frame; what this gives up on is worth reporting, which is why the last
 *  answer comes back rather than a throw from in here. */
async function findDoor(tab: Tab, id: string, tries = 6): Promise<Link> {
  let last: Link = { found: false, why: `the ${id} door was never probed` };
  for (let attempt = 0; attempt < tries; attempt++) {
    last = await tab.evaluate<Link>(DOOR(id));
    if (last.found) return last;
    await pause(700);
  }
  return last;
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

// ---------------------------------------------------------------------------
// And the other way out: a door, and then the browser's Back button
// ---------------------------------------------------------------------------
//
// The lap above is the one the status bar advertises, and it is a **soft**
// navigation both ways. A door is not that. `engine/index.ts` sends a page door
// through `window.location.assign`, which is a hard navigation — and the way
// back from it is not a link at all, it is the browser's own Back button.
//
// **What Back actually does here, measured before anything was asserted**, at
// 1920×1080 on the built site, HEAD b3139e1:
//
//   after the Lectures door     path /lectures/, a fresh document, 0 WebGL
//                               contexts ever created in it
//   Back                        path /backlot/
//     pagehide  persisted true  the backlot's document was **put into the
//                               back/forward cache**, not destroyed
//     pageshow  persisted true  and **resumed** out of it 1,034 ms later
//     document id              unchanged — the same document object, not a
//                               re-parse
//     astro:page-load          fired **once**, on the original load, and **not
//                               on the restore**
//     astro:before-swap        never fired at all
//     ready                    true, canvas 1920×923, contexts drawing 1,
//                               alive 1, attached 1
//
// **And one thing about the harness that nearly became a finding about the
// page.** The first version of this lap reached /backlot/ with `Page.navigate`
// — the address bar — and then Back did **nothing at all**: session history at
// index 2 before and index 2 after, the reader still on /lectures/, and
// `history.back()` from inside the page equally inert. That is Chrome marking
// the entry skippable, because a document that navigates away from an entry
// that was never user-activated is what the history-manipulation intervention
// is for; with only `about:blank` behind it, Back had nowhere left to go. It
// correlated with `prefers-reduced-motion` — inert under the preference,
// working without it — which is exactly the shape of a page bug and is not one.
// Reached by clicking the status bar's link instead, Back works under both
// preferences. **An address bar is not a reader and a `Page.navigate` is not a
// click**, and here the difference is not softness but whether the browser
// will go back at all.
//
// So: it is a bfcache restore, `astro:page-load` does not fire, and the backlot
// is nonetheless alive — because a hard navigation out never fired
// `astro:before-swap` either, so the engine was never torn down. It was frozen
// with the document and resumed with it. **It is not broken, and it works for a
// reason worth writing down**: the teardown and the re-entry are paired on the
// router's two events, and a bfcache round trip fires neither, so the pair
// stays balanced by not being used.
//
// That is also exactly how it could break. Any teardown hung on `pagehide` — a
// reasonable-looking thing to add, since `pagehide` is the event that actually
// fires on the way out — disposes the engine into the cache, and nothing fires
// on the way back to boot it again. The reader gets a dead canvas and the
// static gallery is not there to cover it, because the gallery was hidden
// before the page was frozen. The check below is keyed on that: what is alive
// after Back, not what drew.
//
// Nothing here asserts the mechanism. A bfcache entry can be evicted, and a
// reader who comes back to a re-parsed document is entitled to the same page —
// so the mechanism is *reported* in every failure message and the assertions are
// about the outcome: one engine, alive and attached, with the gallery back
// under it. The one thing asserted about the mechanism is the one that is true
// either way: **whichever happened, there is exactly one engine.**

/** The document's own life, installed before the page's script. A restore out
 *  of the back/forward cache resumes the document, so `id` comes back unchanged
 *  and nothing in here is re-installed; a re-parse gets a new one. That is the
 *  only reliable way to tell the two apart from inside. */
const LIFE_WATCH = String.raw`
  (() => {
    if (window.__life) return;
    const life = { id: Math.random().toString(36).slice(2), pageLoad: 0, beforeSwap: 0, restored: 0, frozen: 0 };
    window.__life = life;
    document.addEventListener("astro:page-load", () => { life.pageLoad += 1; });
    document.addEventListener("astro:before-swap", () => { life.beforeSwap += 1; });
    window.addEventListener("pageshow", (event) => { if (event.persisted) life.restored += 1; });
    window.addEventListener("pagehide", (event) => { if (event.persisted) life.frozen += 1; });
  })();
`;

const LIFE = String.raw`
  const life = window.__life;
  return life ? { id: life.id, pageLoad: life.pageLoad, beforeSwap: life.beforeSwap, restored: life.restored, frozen: life.frozen } : null;
`;

/** A door's own button in the HUD, as a point to press.
 *
 *  Same rule as `LINK_TO`: no fallback. A door is a real `<button>` with an
 *  accessible name, and if it is not on the page this returns why and the
 *  caller fails — it does not reach for the href the manifest happens to know. */
/**
 * Where to click a door's control, and whether that point is the control.
 *
 * **The `elementFromPoint` line is the fix to a real failure.** Without it this
 * read a box, handed the centre to a click a round trip later, and asserted on
 * the navigation — so a click that landed on the canvas instead was reported as
 * "the press did not navigate". Inside the whole suite that happened at the
 * desktop viewport and took seven assertions down with it, six of them
 * downstream of a reader who never left; the same build, this file alone, was 28
 * passed, and driving that exact click by hand reached /sessions/ in under a
 * second. Raising the timeout from 15 s to 30 s did not fix it, which is what
 * ruled out "the machine is slow" and left "the click missed".
 *
 * The HUD parks every button every frame, so the box is only worth reading once
 * the scene has stopped moving. `still` is the same two-identical-reads test
 * `spec/backlot-hotspots.test.ts` uses on a focus push, for the same reason.
 */
const DOOR = (id: string) => String.raw`
  return (async () => {
    const selector = "[data-backlot-hotspot=" + ${JSON.stringify(JSON.stringify(id))} + "]";
    const button = document.querySelector(selector);
    if (!button) return { found: false, why: "the HUD has no control for the " + ${JSON.stringify(id)} + " door" };
    if (button.hidden) return { found: false, why: "the " + ${JSON.stringify(id)} + " door's control is hidden" };

    // Focused first, on purpose, and this is the fix to the failure.
    //
    // No backticks in this comment: it sits inside a String.raw probe and a
    // backtick closes the template. Writing it with them is how this file
    // stopped parsing on the run that proved the fix, which is the sixth time
    // this repo has paid for it and the reason spec/suite-integrity.test.ts
    // exists — it named the file and the line before any assertion ran.
    //
    // A mouse press focuses the button, the focusin listener starts the camera
    // push, and the HUD parks every button every frame. So the button moves
    // between mousedown and mouseup, the two land on different elements, and the
    // browser fires no click event at all. The control ends up focused and
    // nothing else happens, which is exactly what the page reported when this
    // went red: said "", near [], focus "sessions", mode "backlot" -- the live
    // region silent, so the engine never reached its own "Opening the … door",
    // and focus on the control, so the press had landed. A driver reporting a
    // press that did not happen is CLAUDE.md section 7's own warning, met
    // through the mouse rather than through the keyboard.
    //
    // Doing the focus deliberately, then waiting the push out, then reading the
    // box, takes the race away without changing what is driven: a reader
    // clicking this control focuses it on mousedown too. It only fails under
    // load, which is what made it look like a slow machine for two rounds.
    button.focus();
    let previous = null;
    let still = false;
    let travelled = 0;
    for (let attempt = 0; attempt < 80 && !still; attempt++) {
      await new Promise((done) => requestAnimationFrame(() => done()));
      const now = button.getBoundingClientRect();
      if (previous) {
        travelled += Math.abs(now.left - previous.left) + Math.abs(now.top - previous.top);
        still = now.left === previous.left && now.top === previous.top && now.width === previous.width;
      }
      previous = now;
    }

    const box = button.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) {
      return { found: false, why: "the door's control measures " + Math.round(box.width) + "x" + Math.round(box.height) };
    }
    const x = Math.round(box.left + box.width / 2);
    const y = Math.round(box.top + box.height / 2);
    // An outline and a box-shadow paint outside the border box and hit-test
    // nowhere, so this is not a clearance test and is not being used as one
    // (CLAUDE.md 7). It is the narrower question a click actually asks: is the
    // thing at this point this control.
    const at = document.elementFromPoint(x, y);
    if (!at || (at !== button && !button.contains(at))) {
      return {
        found: false,
        why:
          "the middle of the " + ${JSON.stringify(id)} + " door's control is not the control: " +
          (at ? at.tagName + "." + String(at.className) : "nothing") +
          " is at " + x + "," + y + ". The control is [" + Math.round(box.left) + ".." + Math.round(box.right) +
          "] x [" + Math.round(box.top) + ".." + Math.round(box.bottom) + "], it " +
          (still ? "had come to rest" : "was still moving, " + Math.round(travelled) + "px so far") + ".",
      };
    }
    return {
      found: true,
      why: "",
      still,
      text: (button.textContent || "").replace(/\s+/g, " ").trim(),
      x,
      y,
    };
  })();
`;

interface Life {
  id: string;
  pageLoad: number;
  beforeSwap: number;
  restored: number;
  frozen: number;
}

interface BackLap {
  viewport: string;
  /** The door that was pressed, and the label on its control. */
  door: { id: string; href: string; text: string };
  /** How long the press took to reach the address bar, or null if it never
   *  did. Reported rather than asserted: it is the backlot's own cost, and the
   *  number is only here so a failure downstream can say whether the reader
   *  ever left. */
  leftBy: number | null;
  first: State;
  firstLife: Life | null;
  /** On the real page the door leads to, and what that page says it is. */
  away: State;
  landed: { heading: string; title: string };
  /** After the browser's Back button. */
  back: State;
  backLife: Life | null;
  backDrawing: Drawing | null;
  /** Where the tab ended up in its own session history. */
  history: { index: number; urls: string[] };
}

/** A door that leaves the backlot for a real page, taken from the manifest
 *  rather than named here — `kind: "page"` is the property that decides, and a
 *  door that changes kind should change what this walks. */
const PAGE_DOOR = backlotDoors.find((door) => door.kind === "page")!;

/** Wait for the address bar to say what it was asked to say.
 *
 *  Returns how long it took, or null if it never did. It never throws: an
 *  assertion that names the moment is worth more than a sweep that died on the
 *  way to it, and "the press did not navigate" is a finding rather than a
 *  crash. */
async function arriveAt(tab: Tab, path: string, what: string): Promise<number | null> {
  const started = Date.now();
  // Thirty seconds, and the number moved because the claim under it turned out
  // to be false. It was fifteen, on the reasoning below that a press reaches the
  // address bar in about 2,505 ms so running out means "it did not navigate".
  // Run inside the whole suite, where up to a dozen browsers compete for this
  // machine, it ran out on a press that navigates: the same build, the same
  // build output, this file alone is 28 passed, and driving that exact click by
  // hand reaches /sessions/ in under a second. Seven failures, six of them
  // downstream of a reader who never left.
  //
  // Waiting longer is not a weaker check — the assertion is still that the
  // address bar says this exact path, and nothing about what counts as arriving
  // has changed. What was wrong was the harness's claim about its own timeout,
  // and the fix to a wait that is too short is a longer wait.
  const deadline = started + 30_000;
  while (Date.now() < deadline) {
    const here = await tab.evaluate<string>("return location.pathname;");
    if (here === path) return Date.now() - started;
    await pause(100);
  }
  console.warn(`backlot-return: ${what} did not reach ${path} within 30 s`);
  return null;
}

/** What the page said about a press that did not navigate, for the message. */
let pressDiagnosis = "";

async function walkBack(): Promise<BackLap[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const laps: BackLap[] = [];

  try {
    await tab.onNewDocument(DRAW_COUNTER);
    await tab.onNewDocument(LIFE_WATCH);

    for (const viewport of VIEWPORTS) {
      await tab.viewport(viewport.width, viewport.height);
      await tab.media({ colourScheme: THEME, reducedMotion: true });
      // **Into the backlot by clicking the link, not by the address bar**, and
      // the reason is not tidiness — it changes what Back does. An entry the
      // address bar created has no user activation on it, and a document that
      // navigates away from an unactivated entry gets that entry marked
      // skippable by Chrome's history-manipulation intervention. Measured on
      // this build: arriving at /backlot/ with `Page.navigate`, taking the
      // Lectures door and pressing Back moved the session history **not at all**
      // — index 2 before and index 2 after, the reader still on /lectures/ —
      // and `history.back()` from inside the page did nothing either. Arriving
      // by clicking the status bar's own link, everything else identical, Back
      // lands on a ready backlot. So the rule this file already has about never
      // navigating by anything but a real link turns out to reach further than
      // softness: it decides whether there is anything behind the page at all.
      await tab.goto(`${site.origin}${prefix}studio/`);
      await tab.evaluate(
        `try { localStorage.setItem("at-theme", ${JSON.stringify(THEME)}); } catch {} return null;`,
      );
      await tab.goto(`${site.origin}${prefix}studio/`);
      await tab.settle();
      const inbound = await tab.evaluate<Link>(LINK_TO("/backlot/"));
      if (!inbound.found) throw new Error(`cannot reach /backlot/ from /studio/ by clicking: ${inbound.why}`);
      await tab.click(inbound.x!, inbound.y!);
      await arriveAt(tab, `${prefix}backlot/`, "clicking the status bar's link to the backlot");
      await tab.evaluate<string>(READY);
      await pause(900);
      const first = await tab.evaluate<State>(STATE);
      const firstLife = await tab.evaluate<Life | null>(LIFE);
      if (first.path !== `${prefix}backlot/`) {
        throw new Error(`clicking "${inbound.text}" on /studio/ landed on ${first.path}, not on ${prefix}backlot/`);
      }

      const door = await findDoor(tab, PAGE_DOOR.id);
      if (!door.found) throw new Error(`cannot leave /backlot/ through the ${PAGE_DOOR.label} door: ${door.why}`);
      await tab.click(door.x!, door.y!);
      // **Waited for, not beaten.** A press on a door takes about 2,505 ms to
      // reach the address bar: the figure walks to the door and the leaf swings
      // before anything navigates, and that is the backlot's own cost rather
      // than a delay in the harness. A fixed 3,000 ms beat had 500 ms of margin
      // on it and this lap flaked on exactly that — a run that looked one beat
      // early reported the door press landing back on /backlot/, and then every
      // assertion after it failed as well, because the reader had never left.
      // The timeout below is long enough that when it runs out the answer is "it
      // did not navigate" rather than "I did not wait".
      let leftBy = await arriveAt(tab, `${prefix}${PAGE_DOOR.id}/`, `pressing "${door.text}"`);
      // What the press did, when it did not navigate. Read before anything else
      // so the answer is about the moment it went wrong rather than about a page
      // that has since settled: the live region says "Opening the … door" the
      // instant `use()` commits, so a press that started and did not arrive
      // looks nothing like a press that never ran.
      if (leftBy === null) {
        pressDiagnosis = await tab.evaluate<string>(
          `const live = document.querySelector("[data-backlot-hud] [aria-live]");
           const near = [...document.querySelectorAll("[data-backlot-hud] button")]
             .filter((b) => b.dataset.backlotNear === "true").map((b) => b.dataset.backlotHotspot);
           return JSON.stringify({
             said: (live ? live.textContent : "").trim(),
             near,
             focus: document.activeElement ? (document.activeElement.dataset.backlotHotspot ?? document.activeElement.tagName) : null,
             mode: document.querySelector("[data-backlot-stage]")?.dataset.backlotMode ?? null,
           });`,
        );
        console.warn(`backlot-return: the press did not navigate — ${pressDiagnosis}`);
      }
      const away = await tab.evaluate<State>(STATE);
      const landed = await tab.evaluate<{ heading: string; title: string }>(
        `const h = document.querySelector("main h1") ?? document.querySelector("h1");
         return { heading: (h ? h.textContent : "").replace(/\\s+/g, " ").trim(), title: document.title };`,
      );

      // The browser's Back button. Not `history.back()` and not a navigation to
      // the previous URL — see `Tab.back`.
      await tab.back();
      // Polled from out here, in short evaluates, rather than with one long
      // in-page wait. A traversal is not allowed to be raced by a script that is
      // still running in the document being left: the first version of this used
      // `READY`, which polls inside the page for up to twelve seconds, and the
      // traversal never took at all — the session history stayed at index 2 with
      // the reader still on the real page, and every assertion below failed
      // about the wrong thing.
      // Thirty, with `arriveAt` above and for the same reason: under the whole
      // suite this machine is slow enough that a wait sized on a clean run is a
      // harness reporting its own contention as a finding.
      const deadline = Date.now() + 30_000;
      let arrived = false;
      while (Date.now() < deadline) {
        await pause(150);
        const here = await tab.evaluate<{ path: string; ready: boolean }>(
          `const stage = document.querySelector("[data-backlot-stage]");
           return { path: location.pathname, ready: Boolean(stage && stage.hasAttribute("data-backlot-ready")) };`,
        );
        if (here.path === first.path && here.ready) {
          arrived = true;
          break;
        }
      }
      if (!arrived) {
        // Not thrown: the assertions below name the moment and print the state,
        // which a thrown sweep cannot. A slow boot and a dead one both end here.
        await pause(500);
      }
      await pause(1200);
      const back = await tab.evaluate<State>(STATE);
      const backLife = await tab.evaluate<Life | null>(LIFE);
      const backDrawing = await tab.evaluate<Drawing | null>(DRAWING(1500));
      const history = await tab.history();

      laps.push({
        viewport: viewport.name,
        door: { id: PAGE_DOOR.id, href: PAGE_DOOR.href, text: door.text! },
        first,
        firstLife,
        leftBy,
        away,
        landed,
        back,
        backLife,
        backDrawing,
        history,
      });
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return laps;
}

const laps = await walkBack();
const lap = (viewport: string) => laps.find((one) => one.viewport === viewport)!;
/** Which of the two things happened, said in the words of the evidence. */
const howBack = (one: BackLap) =>
  one.backLife && one.firstLife && one.backLife.id === one.firstLife.id
    ? `restored from the back/forward cache (same document, ${one.backLife.restored} persisted pageshow, ` +
      `astro:page-load fired ${one.backLife.pageLoad}×)`
    : `re-parsed (a new document, astro:page-load fired ${one.backLife?.pageLoad ?? 0}×)`;

describe.each(VIEWPORTS)("out through a door and back with the Back button at $name", ({ name }) => {
  // Seen red by making the door write a **root-absolute** URL in the built
  // bundle — the CLAUDE.md §4 hazard, which opens fine from a repo root and
  // 404s under the deployed sub-path. The output is in
  // receipts/rig-3d/a3-checks.md.
  //
  // The first version of this asserted `away.path.endsWith(door.href)` and was
  // **green under that injection**, because the manifest's href is
  // site-root-relative — `/lectures/` — and the 404's path ends with
  // `/lectures/` too. That is §7's bare-substring trap with a URL in it: the
  // assertion has to be the whole base-resolved path, and it has to be paired
  // with something that says the page is the real one rather than a page with
  // the right address.
  it("left through the door's own control, and landed on the real page", () => {
    const one = lap(name);
    expect(
      one.away.path,
      `pressing "${one.door.text}" landed on ${one.away.path} ` +
        `${one.leftBy === null ? `after 30 s of waiting for the address bar to change (${pressDiagnosis})` : `after ${one.leftBy} ms`}. ` +
        `The door's href is ${one.door.href} and the site is served under ${prefix}, so the whole path is what it ` +
        `has to be — a root-absolute URL from the island ends with the same slug and 404s on the deployed ` +
        `sub-path. A press takes about 2,505 ms to reach the address bar, because the figure walks to the door and ` +
        `the leaf swings first; if this says /backlot/ the reader never left at all.`,
    ).toBe(`${prefix}${one.door.id}/`);
    expect(
      one.landed.heading,
      `the page the door led to has the heading ${JSON.stringify(one.landed.heading)} and the title ` +
        `${JSON.stringify(one.landed.title)}. An address is not a page: a 404 under the right path would satisfy ` +
        `every other assertion in this lap.`,
    ).toMatch(/\S/);
    expect(
      one.landed.title.toLowerCase(),
      `the page the door led to is titled ${JSON.stringify(one.landed.title)}`,
    ).not.toContain("not found");
    expect(one.away.stageInDocument, "the backlot's stage is still in the document on the page the door led to").toBe(
      false,
    );
  });

  it("comes back to the backlot, not to somewhere that looks like it", () => {
    const one = lap(name);
    expect(
      one.back.path,
      `Back left the reader on ${one.back.path}. Session history: ${one.history.urls.join(" → ")}, now at index ` +
        `${one.history.index}.`,
    ).toBe(one.first.path);
  });

  it("comes back to a backlot that is running", () => {
    const one = lap(name);
    expect(
      one.back.ready,
      `after Back the stage ${one.back.stageInDocument ? "is in the document" : "is not in the document"} and ` +
        `data-backlot-ready is ${one.back.ready ? "set" : "absent"}; the canvas measures ${one.back.canvas}. The ` +
        `page ${howBack(one)}. A teardown hung on pagehide disposes the engine into the cache and nothing fires on ` +
        `the way back to boot it again — which reads exactly like this.`,
    ).toBe(true);
    expect(
      one.back.galleryHidden,
      `the static gallery is ${one.back.galleryHidden ? "hidden" : "still over the stage"} after Back. Ready with ` +
        `the gallery over it is ready about nothing.`,
    ).toBe(true);
  });

  // **This one has not been seen red, and here is exactly what was tried.**
  //
  // The bug it is written against is a teardown hung on `pagehide`: it disposes
  // the engine into the back/forward cache, where nothing fires on the way back
  // to boot it again. Injected into the built bundle beside the
  // `astro:before-swap` listener, **the lap stayed green** — because on the
  // route a reader actually takes, Back does not restore from the cache at all.
  // Measured with the document's own identity: arriving at /backlot/ by
  // clicking the status bar's link makes it a ClientRouter swap of the /studio/
  // document, and when the door's `location.assign` destroys that document,
  // Back **re-parses** /backlot/ from the network — new document id,
  // `astro:page-load` fires once, `pageshow.persisted` false. A disposal into a
  // cache that is never used is invisible, and it should be.
  //
  // The bfcache restore is real, and it is what an address-bar arrival gets:
  // `pagehide.persisted` true on the way out, `pageshow.persisted` true 1,034 ms
  // later, the same document id, `astro:page-load` not fired, and the same
  // engine still drawing. It is not driven here, because the only way the
  // harness can produce that arrival is `Page.navigate` — and an entry the
  // address bar created is one Chrome will mark skippable, which made Back a
  // no-op in the session history. Driving a route the browser treats
  // differently and calling the result a reader's experience is the mistake
  // this file was written about.
  //
  // So: the two counts below are the same counts the soft lap makes, at a
  // different moment on a different route, and what was shown red on this lap
  // is the door above. The injections tried and their outcomes are in
  // receipts/rig-3d/a3-checks.md rather than left as a claim.
  it("runs exactly one engine after Back, whichever way it came back", () => {
    const one = lap(name);
    expect(one.backDrawing, "the draw counter did not survive the return").not.toBeNull();
    // Alive first. A restore that resumed a disposed engine draws nothing and
    // has nothing alive; a restore that booted a second engine beside the frozen
    // one has two. Both are invisible to a count of what drew.
    expect(
      one.backDrawing!.alive,
      `${one.backDrawing!.alive} WebGL contexts are alive after Back, ${one.backDrawing!.attached} of them attached ` +
        `to a canvas in the document, out of ${one.backDrawing!.known} ever created in this document. The page ` +
        `${howBack(one)}.`,
    ).toBe(1);
    expect(
      one.backDrawing!.attached,
      `${one.backDrawing!.attached} of the live contexts are attached to a canvas in the document after Back`,
    ).toBe(1);
    expect(
      one.backDrawing!.drawing,
      `${one.backDrawing!.drawing} contexts drew in the sample window after Back. A resumed engine whose frame loop ` +
        `never restarted is alive, attached, and drawing nothing.`,
    ).toBe(1);
  });

  it("gives the box back to the 3D, the way the soft return does", () => {
    const one = lap(name);
    expect(
      one.back.boxed,
      `data-backlot-box is ${one.back.boxed ? "set" : "absent"} after Back, and the shell measures ` +
        `${one.back.shell} against ${one.first.shell} on the first load.`,
    ).toBe(true);
    expect(one.back.canvas, `the canvas measures ${one.back.canvas} after Back, ${one.first.canvas} before`).toBe(
      one.first.canvas,
    );
  });
});

describe("the walk measured something", () => {
  it("walked both viewports", () => {
    expect(journeys.length).toBe(VIEWPORTS.length);
  });

  it("took the Back lap at both viewports, through a door and not through an address bar", () => {
    expect(laps.length).toBe(VIEWPORTS.length);
    for (const one of laps) {
      expect(one.door.text, `${one.viewport}: the control pressed had no accessible name`).toMatch(/\S/);
      expect(
        one.leftBy,
        `${one.viewport}: pressing "${one.door.text}" never reached ${prefix}${one.door.id}/ in thirty seconds; ` +
          `the reader is on ${one.away.path}. A press is a walk to the door and a leaf swinging before anything ` +
          `navigates — about 2,505 ms of it — so this waits rather than beats. A null means either that the ` +
          `navigation did not happen at all or that it went somewhere else, and the path above says which.`,
      ).not.toBeNull();
      expect(
        one.history.urls.length,
        `${one.viewport}: the session history is ${one.history.urls.join(" → ")}. Back is only a traversal if there ` +
          `is something behind the page to traverse to.`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("saw a WebGL draw on the backlot before the door, so the counts after Back mean something", () => {
    for (const one of laps) {
      expect(one.back.ready, `${one.viewport}`).toBe(true);
      expect(
        one.backDrawing?.draws ?? 0,
        `no WebGL draw was counted at ${one.viewport} across the whole Back lap, so the counter is measuring nothing`,
      ).toBeGreaterThan(100);
    }
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
