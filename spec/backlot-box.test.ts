// The stage is one box, and there is always something in it.
//
// The design this guards, in one line: the static gallery is the box's loading
// state, the engine fades in inside the same box when it has a frame, and it is
// not allowed to do that if the reader is already using the gallery. "Show as a
// list" is the reverse switch for the same box.
//
// Everything here is driven, because none of it is readable from a file. Three
// of the four states below only exist for a second and a half on a throttled
// connection, and the fourth only exists on a machine that cannot draw — which
// is exactly the shape of branch this repo keeps shipping unwatched. The one
// that was already shipped and wrong is in `releaseBox`: the old boot left the
// stage hidden with its space still reserved, so a reader with JavaScript and no
// WebGL got a full-viewport blank above the list, permanently. The no-JS path
// and the happy path were both verified and this one sat between them.
//
// Reading a computed style: always on the next frame, never in the task that
// set it. base.css forces `transition-duration: 0.01ms !important` with
// `transition-property: all` under `prefers-reduced-motion`, and a same-task
// read returns the value the property is transitioning *from* — the engine lost
// a round to that one, as a scene that booted blown out to white.

import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, SLOW_4G, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const doors = backlotManifest.doors;
const captionCount = backlotManifest.rooms.reduce((sum, room) => sum + room.pieces.length, 0);

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/** Two frames, so a computed style read after it is the value that settled
 *  rather than the one it left. */
const NEXT_FRAME = `await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));`;

const READY = String.raw`
  const stage = document.querySelector("[data-backlot-stage]");
  const deadline = performance.now() + 25000;
  while (!stage.hasAttribute("data-backlot-ready") && performance.now() < deadline) {
    await new Promise((done) => setTimeout(done, 50));
  }
  ${NEXT_FRAME}
  return stage.hasAttribute("data-backlot-ready");
`;

const STATE = String.raw`
  const stage = document.querySelector("[data-backlot-stage]");
  const canvas = document.querySelector("[data-backlot-canvas]");
  const gallery = document.querySelector("[data-studio-fallback]");
  const hud = document.querySelector("[data-backlot-hud]");
  const takeover = document.querySelector("[data-backlot-takeover]");
  const stageBox = stage.getBoundingClientRect();
  const canvasBox = canvas.getBoundingClientRect();
  const canvasStyle = getComputedStyle(canvas);
  return {
    mode: stage.dataset.backlotMode ?? null,
    boxed: stage.hasAttribute("data-backlot-box"),
    ready: stage.hasAttribute("data-backlot-ready"),
    used: stage.hasAttribute("data-backlot-used"),
    stageHeight: Math.round(stageBox.height),
    stageWidth: Math.round(stageBox.width),
    galleryHidden: gallery.hidden,
    galleryInsideStage: stage.contains(gallery),
    galleryScrolls: getComputedStyle(gallery).overflowY === "auto",
    galleryScrollHeight: gallery.scrollHeight,
    hudHidden: hud.hidden,
    takeoverShown: !takeover.hidden,
    canvasDisplay: canvasStyle.display,
    canvasVisibility: canvasStyle.visibility,
    canvasOpacity: Number(canvasStyle.opacity),
    canvasBox: Math.round(canvasBox.width) + "x" + Math.round(canvasBox.height),
    canvasAriaHidden: canvas.getAttribute("aria-hidden"),
    canvasRole: canvas.getAttribute("role"),
    // What a pointer would actually hit in the middle of the box. The engine's
    // HUD is pointer-events: none and the gallery is not, so a gallery still
    // live over the canvas swallows pointerdown and takes click-to-walk and
    // touch-steering with it, silently.
    topOfTheBox: (() => {
      const hit = document.elementFromPoint(
        Math.round(stageBox.left + stageBox.width / 2),
        Math.round(stageBox.top + stageBox.height / 2),
      );
      if (!hit) return null;
      if (hit.hasAttribute("data-backlot-canvas")) return "the canvas";
      return stage.querySelector("[data-studio-fallback]").contains(hit) ? "the gallery" : String(hit.tagName);
    })(),
    pageScrollHeight: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  };
`;

interface State {
  mode: string | null;
  boxed: boolean;
  ready: boolean;
  used: boolean;
  stageHeight: number;
  stageWidth: number;
  galleryHidden: boolean;
  galleryInsideStage: boolean;
  galleryScrolls: boolean;
  galleryScrollHeight: number;
  hudHidden: boolean;
  takeoverShown: boolean;
  canvasDisplay: string;
  canvasVisibility: string;
  canvasOpacity: number;
  canvasBox: string;
  canvasAriaHidden: string | null;
  canvasRole: string | null;
  topOfTheBox: string | null;
  pageScrollHeight: number;
  viewport: number;
}

/** The gallery as it stood at the browser's own first contentful paint, which
 *  on a throttled connection is a second before the island exists. */
const AT_PAINT = String.raw`
  window.__box = null;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name !== "first-contentful-paint" || window.__box !== null) continue;
        const stage = document.querySelector("[data-backlot-stage]");
        const gallery = document.querySelector("[data-studio-fallback]");
        if (!stage || !gallery) continue;
        const stageBox = stage.getBoundingClientRect();
        const door = gallery.querySelector("li.backlot-door a");
        window.__box = {
          at: Math.round(entry.startTime),
          mode: stage.dataset.backlotMode ?? null,
          boxed: stage.hasAttribute("data-backlot-box"),
          ready: stage.hasAttribute("data-backlot-ready"),
          stageTop: Math.round(stageBox.top),
          stageHeight: Math.round(stageBox.height),
          galleryInsideStage: stage.contains(gallery),
          galleryHidden: gallery.hidden,
          galleryScrolls: getComputedStyle(gallery).overflowY === "auto",
          galleryScrollHeight: gallery.scrollHeight,
          doors: gallery.querySelectorAll("li.backlot-door").length,
          captions: gallery.querySelectorAll("figcaption.backlot-piece__caption").length,
          firstDoorTop: door ? Math.round(door.getBoundingClientRect().top) : null,
          firstDoorInsideTheBox: door
            ? door.getBoundingClientRect().top >= stageBox.top &&
              door.getBoundingClientRect().top < stageBox.bottom
            : false,
          pageScrollHeight: document.documentElement.scrollHeight,
          viewport: window.innerHeight,
        };
      }
    }).observe({ type: "paint", buffered: true });
  } catch { /* a browser with no paint entries fails the assertion, not here */ }
`;

interface AtPaint {
  at: number;
  mode: string | null;
  boxed: boolean;
  ready: boolean;
  stageTop: number;
  stageHeight: number;
  galleryInsideStage: boolean;
  galleryHidden: boolean;
  galleryScrolls: boolean;
  galleryScrollHeight: number;
  doors: number;
  captions: number;
  firstDoorTop: number | null;
  firstDoorInsideTheBox: boolean;
  pageScrollHeight: number;
  viewport: number;
}

interface Sweep {
  atPaint: AtPaint | null;
  tookOver: State;
  usedThenReady: State;
  afterPressing: State;
  showAsAList: State;
  hiddenAgain: State;
  noWebGl: State;
  scrolledInside: { inside: number; page: number };
}

async function sweep(): Promise<Sweep> {
  const site = await serveBuild("dist", base);
  const url = `${site.origin}${prefix}backlot/`;
  const read = (tab: Tab) => tab.evaluate<State>(`return (async () => { ${NEXT_FRAME} ${STATE} })();`);

  // 1. What is in the box at first paint, throttled so the island is still a
  //    second away. Reduced motion throughout, so the fade is instant and an
  //    opacity read is a value rather than a moment in a transition.
  const first = await Tab.launch();
  let atPaint: AtPaint | null = null;
  let scrolledInside = { inside: 0, page: 0 };
  try {
    await first.onNewDocument(AT_PAINT);
    await first.viewport(1920, 1080);
    await first.media({ colourScheme: "dark", reducedMotion: true });
    await first.network(SLOW_4G, "off");
    await first.goto(url);
    atPaint = await first.evaluate<AtPaint | null>("return window.__box;");
  } finally {
    await first.close();
  }

  // 2. The plain case: nobody touched anything, the engine takes the box.
  const second = await Tab.launch();
  let tookOver: State;
  try {
    await second.viewport(1920, 1080);
    await second.media({ colourScheme: "dark", reducedMotion: true });
    await second.goto(url);
    await second.evaluate(`return (async () => { ${READY} })();`);
    tookOver = await read(second);
  } finally {
    await second.close();
  }

  // 3. The guard: focus lands in the gallery while the island is still on the
  //    wire. Driven from a script injected before the document, because that is
  //    when it happens — the reader is a second ahead of boot.ts. It waits for
  //    the page's own inline script to have attached the listener, which is
  //    what records the use.
  const third = await Tab.launch();
  let usedThenReady: State;
  let afterPressing: State;
  try {
    await third.onNewDocument(String.raw`
      const waiting = setInterval(() => {
        const stage = document.querySelector("[data-backlot-stage][data-backlot-box]");
        const link = document.querySelector("[data-studio-fallback] li.backlot-door a");
        if (!stage || !link) return;
        clearInterval(waiting);
        link.focus();
      }, 20);
    `);
    await third.viewport(1920, 1080);
    await third.media({ colourScheme: "dark", reducedMotion: true });
    await third.network(SLOW_4G, "off");
    await third.goto(url);
    await third.evaluate(`return (async () => { ${READY} })();`);
    usedThenReady = await read(third);

    // The box is one viewport and the list is thousands of pixels, so the list
    // scrolls inside it. Driven here rather than at first paint, because by the
    // time `goto` returns the island has usually taken the box — the first
    // version of this scrolled a gallery that was already hidden and read back
    // a very convincing zero. This tab is the one where the reader is still in
    // the list, which is the only state the question is about.
    scrolledInside = await third.evaluate<{ inside: number; page: number }>(`return (async () => {
      const gallery = document.querySelector("[data-studio-fallback]");
      gallery.scrollTop = 1500;
      ${NEXT_FRAME}
      return { inside: Math.round(gallery.scrollTop), page: Math.round(window.scrollY) };
    })();`);

    await third.evaluate(`document.querySelector("[data-backlot-takeover]").focus(); return null;`);
    await third.press("Enter");
    await pause(400);
    afterPressing = await read(third);
  } finally {
    await third.close();
  }

  // 4. The reverse switch, and back again.
  const fourth = await Tab.launch();
  let showAsAList: State;
  let hiddenAgain: State;
  try {
    await fourth.viewport(1920, 1080);
    await fourth.media({ colourScheme: "dark", reducedMotion: true });
    await fourth.goto(url);
    await fourth.evaluate(`return (async () => { ${READY} })();`);
    await fourth.evaluate(`document.querySelector("[data-studio-list]").click(); return null;`);
    await pause(400);
    showAsAList = await read(fourth);
    await fourth.evaluate(`document.querySelector("[data-studio-list]").click(); return null;`);
    await pause(400);
    hiddenAgain = await read(fourth);
  } finally {
    await fourth.close();
  }

  // 5. A boot that cannot succeed. WebGL2 is taken away before the document, so
  //    boot.ts meets a browser that will never draw — the branch that used to
  //    leave a full-viewport blank.
  const fifth = await Tab.launch();
  let noWebGl: State;
  try {
    await fifth.onNewDocument("delete window.WebGL2RenderingContext;");
    await fifth.viewport(1920, 1080);
    await fifth.media({ colourScheme: "dark", reducedMotion: true });
    await fifth.goto(url);
    await pause(1500);
    noWebGl = await read(fifth);
  } finally {
    await fifth.close();
    await site.close();
  }

  return { atPaint, tookOver, usedThenReady, afterPressing, showAsAList, hiddenAgain, noWebGl, scrolledInside };
}

const driven = await sweep();

// ---------------------------------------------------------------------------
// 1. The box is never empty.
// ---------------------------------------------------------------------------

// Seen red by taking the box away — the inline script's
// `stage.setAttribute("data-backlot-box", "")` deleted — and reverted:
//   AssertionError: expected false to be true   (boxed)
//   AssertionError: expected null to be 'the gallery'   (what a pointer hits)
//   AssertionError: expected '1920x960' to be '1920x969'   (the canvas stopped
//   being the size of the stage)
describe("at first paint the box holds the gallery", () => {
  const paint = driven.atPaint;

  it("was measured at all", () => {
    expect(paint, "the browser never reported a contentful paint, so nothing was measured").not.toBeNull();
    expect(paint!.ready, "the island had already taken the box, so this proves nothing about the wait").toBe(false);
  });

  it("is a box, one viewport tall, with the gallery inside it", () => {
    expect(paint!.boxed).toBe(true);
    expect(paint!.mode).toBe("gallery");
    expect(paint!.galleryInsideStage, "the gallery is not inside the stage").toBe(true);
    expect(paint!.galleryHidden).toBe(false);
    expect(paint!.stageHeight).toBeGreaterThan(paint!.viewport * 0.7);
    expect(paint!.stageHeight).toBeLessThanOrEqual(paint!.viewport);
  });

  it("has the whole of the gallery in it, and its first door on screen", () => {
    expect(paint!.doors).toBe(doors.length);
    expect(paint!.captions).toBe(captionCount);
    expect(
      paint!.firstDoorInsideTheBox,
      `the first door is ${paint!.firstDoorTop} px down and the box ends at ` +
        `${paint!.stageTop + paint!.stageHeight} px — a reader looking at the stage cannot see it`,
    ).toBe(true);
  });

  it("scrolls the list inside the box rather than moving the page", () => {
    // The page itself is exactly the viewport with the box on, so a scroll that
    // chained out of the box would be the reader dragging something that cannot
    // move. `overscroll-behavior: contain` is what stops it.
    expect(paint!.galleryScrolls, "the gallery is not an inner scroller").toBe(true);
    expect(paint!.galleryScrollHeight).toBeGreaterThan(paint!.stageHeight * 2);
    expect(paint!.pageScrollHeight, "the page scrolls as well as the box").toBe(paint!.viewport);
    expect(driven.scrolledInside.inside, "scrolling the box did not move the list").toBe(1500);
    expect(driven.scrolledInside.page, "scrolling the box scrolled the page too").toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The takeover, and the four things the engine measured about it.
// ---------------------------------------------------------------------------

describe("the engine takes the box when nobody is using it", () => {
  const state = driven.tookOver;

  it("swaps the gallery for the canvas", () => {
    expect(state.mode).toBe("backlot");
    expect(state.galleryHidden).toBe(true);
    expect(state.hudHidden).toBe(false);
    expect(state.canvasOpacity).toBe(1);
  });

  it("leaves the canvas a box to be measured against", () => {
    // The engine sizes its renderer off this element and counts its first
    // presented frame off it. Under `display: none` it reads 0x0 and the engine
    // falls back to the stage's box, which is right today by coincidence.
    expect(state.canvasDisplay, "the canvas was swapped with display, not opacity").not.toBe("none");
    expect(state.canvasVisibility).toBe("visible");
    expect(state.canvasBox).toBe(`${state.stageWidth}x${state.stageHeight}`);
  });

  it("takes the gallery out of the way of the pointer, not just out of sight", () => {
    // The nasty one. The HUD is `pointer-events: none` and the gallery is not,
    // so a gallery left live over the canvas swallows `pointerdown` and
    // click-to-walk and touch-steering both die with no error anywhere.
    expect(
      state.topOfTheBox,
      "something other than the canvas is what a pointer hits in the middle of the box",
    ).toBe("the canvas");
  });

  it("tells a screen reader about the canvas only once it is what is shown", () => {
    expect(state.canvasRole, "the engine gives the canvas its role at construction").toBe("img");
    expect(state.canvasAriaHidden).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// 3. The guard.
// ---------------------------------------------------------------------------

// Seen red by deleting the `data-backlot-used` guard from boot.ts, which is the
// whole of it, and reverting:
//   AssertionError: the engine took the box from under the reader: expected
//   'backlot' to be 'gallery'
describe("the engine does not take the box from a reader who is using it", () => {
  it("records that the gallery was used, and waits", () => {
    expect(driven.usedThenReady.used, "focus landed in the gallery and nothing recorded it").toBe(true);
    expect(driven.usedThenReady.ready, "the engine never became ready, so it was never asked to wait").toBe(true);
    expect(driven.usedThenReady.mode, "the engine took the box from under the reader").toBe("gallery");
    expect(driven.usedThenReady.galleryHidden).toBe(false);
    expect(driven.usedThenReady.takeoverShown, "no way across was offered").toBe(true);
  });

  it("crosses when the reader presses the button, and not before", () => {
    expect(driven.afterPressing.mode).toBe("backlot");
    expect(driven.afterPressing.galleryHidden).toBe(true);
    expect(driven.afterPressing.takeoverShown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The reverse switch.
// ---------------------------------------------------------------------------

// Seen red by deleting the MutationObserver that turns the list's `hidden` into
// a mode, and reverting. The status bar's own button still worked — it hid the
// list exactly as it always has — and the box behind it did not follow:
//   AssertionError: expected 'backlot' to be 'gallery'
describe("Show as a list puts the gallery back over the 3D", () => {
  it("puts the list in the box and takes the HUD out of the tab order", () => {
    expect(driven.showAsAList.mode).toBe("gallery");
    expect(driven.showAsAList.galleryHidden).toBe(false);
    expect(driven.showAsAList.hudHidden, "the HUD's controls are still tabbable under the list").toBe(true);
    expect(driven.showAsAList.canvasOpacity).toBe(0);
    expect(driven.showAsAList.topOfTheBox).toBe("the gallery");
    // Same box, either way round. This is what stops the camera reframing at
    // the moment of the switch.
    expect(driven.showAsAList.stageHeight).toBe(driven.tookOver.stageHeight);
    expect(driven.showAsAList.canvasBox).toBe(driven.tookOver.canvasBox);
  });

  it("switches back", () => {
    expect(driven.hiddenAgain.mode).toBe("backlot");
    expect(driven.hiddenAgain.galleryHidden).toBe(true);
    expect(driven.hiddenAgain.topOfTheBox).toBe("the canvas");
  });
});

// ---------------------------------------------------------------------------
// 5. A boot that cannot succeed.
// ---------------------------------------------------------------------------

// Seen red by leaving `data-backlot-box` on in `releaseBox`, which is what the
// page did before this design, and reverting:
//   AssertionError: the box stayed on with nothing coming to fill it: expected
//   true to be false
//   AssertionError: the stage is 923 px on a 1080 px viewport — a reader with
//   no WebGL is looking at a blank the height of their screen: expected 923 to
//   be greater than 2160
describe("a boot that cannot succeed gives the box back", () => {
  const state = driven.noWebGl;

  it("stops being a box at all, so the page is simply the gallery", () => {
    expect(state.boxed, "the box stayed on with nothing coming to fill it").toBe(false);
    expect(state.ready).toBe(false);
    expect(state.mode).toBe("gallery");
    expect(state.galleryHidden).toBe(false);
    expect(state.galleryScrolls, "the list is still trapped in an inner scroller").toBe(false);
    expect(state.canvasDisplay, "the canvas is still painted over the page").toBe("none");
    expect(state.takeoverShown, "a way into a backlot that will never exist").toBe(false);
  });

  it("gives the stage the list's own height, and the page its scroll", () => {
    expect(
      state.stageHeight,
      `the stage is ${state.stageHeight} px on a ${state.viewport} px viewport — a reader with no WebGL ` +
        `is looking at a blank the height of their screen`,
    ).toBeGreaterThan(state.viewport * 2);
    expect(state.pageScrollHeight).toBeGreaterThan(state.viewport * 2);
  });
});
