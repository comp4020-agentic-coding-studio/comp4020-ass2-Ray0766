// Booting the backlot: read the payload the page serialised, hand it to the
// engine, and decide whether the engine is allowed to have the box.
//
// The box is never empty. From first paint it holds the static gallery — real
// links, real captions, usable — and the engine, when it has a frame, fades in
// inside the same box and takes it over. Everything here is one attribute on
// the stage: `data-backlot-mode` is "gallery" or "backlot", and the canvas, the
// HUD and the list all follow it. The status bar's "Show as a list" is the
// reverse switch for the same box and goes through the same attribute, which is
// why it needs no special case: it flips `hidden` on the list, and the observer
// below turns that into a mode.
//
// The one rule that outranks all of it: do not take the page out from under
// somebody. If the reader has already put focus in the gallery or clicked in
// it, the engine waits behind a button and they make the switch. The flag for
// that is set by the page's inline script during parsing, because on a slow
// connection this module is two seconds behind the reader.
//
// The engine and the rooms are imported statically, and that is a budget
// decision rather than a style one. They used to be two `import()` calls, which
// reads better and cost the first frame 1.9 s: a dynamic import cannot be found
// by the preload scanner, so the engine chunk was only requested once the
// entry chunk had arrived and run — and because the entry chunk then needed
// Vite's preload helper first, that was two extra round trips, each one 562 ms
// of Slow 4G before a byte of it moved. Measured on the built site, throttled,
// cache off: 3.80 s with the dynamic imports, 1.67 s with these. Statically,
// the whole island is one chunk the HTML names, so the browser starts fetching
// it while it is still parsing the head. `GLTFLoader` stays dynamic inside the
// engine's layer 3, which is where a dynamic import is worth its round trip:
// nothing asks for it on a first frame.
import { createBacklot } from "../engine";
import { roomBuilders } from "../rooms";
import type { BacklotEngine, BacklotPayload } from "../engine/types";

// ---------------------------------------------------------------- lifetime
//
// **The engine's lifetime is owned here, by `live`, and by nothing else.** It is
// worth saying plainly because it is not obvious from any one line: this module
// is evaluated once per document, and `/backlot/` ships `<ClientRouter />`
// (StudioLayout.astro), so a nav link replaces the body without tearing the
// document down. Two things follow, and they are a pair rather than two
// listeners that happen to balance:
//
//   `astro:before-swap`  the body this engine was drawing into is about to go.
//                        `stop()` disposes it and clears `live`. Without this
//                        the engine keeps its WebGL context and renders a full
//                        scene into a canvas that has left the document —
//                        measured at **5,880 draw calls a second**, the same
//                        rate as when it was on screen.
//   `astro:page-load`    a body has arrived, which on a soft navigation is the
//                        only signal there is. `start()` boots against it.
//                        Without this the module is never evaluated a second
//                        time and `/backlot/` comes back as the static gallery
//                        for the rest of the session — measured: stage in the
//                        document, `data-backlot-ready` never set, canvas 0x0,
//                        one WebGL context across two round trips because no
//                        second engine was ever made.
//
// That failure was on the route we designed. The status bar carries "Walk the
// backlot" on /studio/ and "Open the Studio" on /backlot/, so the two-stage path
// a reader is invited to take is exactly the one that used to kill the 3D, and
// nothing looked broken because the gallery *is* the designed fallback.
//
// `start()` is idempotent and `stop()` is the only thing that clears `live`, so
// a hard load cannot boot twice — the module's own call and the first
// `astro:page-load` race, and the second one to arrive returns early — and a
// swap cannot leave two engines.

/** The elements this boot is working against.
 *
 *  Re-read on every boot rather than captured once at module evaluation. They
 *  used to be six module-level `const`s, which is correct exactly until a swap
 *  replaces the body: after that every one of them points at an element that is
 *  no longer in the document, and a second boot would drive the previous page's
 *  canvas. This was the blocker under the re-entry, not the listener. */
let stage: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let hud: HTMLElement | null = null;
let payloadTag: HTMLScriptElement | null = null;
let gallery: HTMLElement | null = null;
let takeover: HTMLButtonElement | null = null;

/** The engine that owns the page right now, or nothing. */
let live: BacklotEngine | null = null;
/** And a boot in flight, so the module's own call and the first
 *  `astro:page-load` cannot both make one. */
let starting = false;
/** The observer that keeps the mode in step with the list, held so it can be
 *  disconnected with the engine rather than left watching a detached element. */
let watching: MutationObserver | null = null;

function findParts(): void {
  stage = document.querySelector<HTMLElement>("[data-backlot-stage]");
  canvas = document.querySelector<HTMLCanvasElement>("[data-backlot-canvas]");
  hud = document.querySelector<HTMLElement>("[data-backlot-hud]");
  payloadTag = document.querySelector<HTMLScriptElement>("[data-backlot-payload]");
  gallery = document.querySelector<HTMLElement>("[data-studio-fallback]");
  takeover = document.querySelector<HTMLButtonElement>("[data-backlot-takeover]");
}

type Mode = "gallery" | "backlot";

/** One place where the three things that follow the mode are set, so they
 *  cannot drift: the list, the HUD's controls, and whether the canvas is
 *  something a screen reader should be told about. The canvas keeps its box in
 *  both modes — it is the engine's drawing surface and taking its size away
 *  would resize the renderer to nothing — so what changes is opacity, which
 *  backlot.css owns, and the accessible tree. */
function setMode(mode: Mode): void {
  if (!stage) return;
  stage.dataset.backlotMode = mode;
  if (gallery) gallery.hidden = mode === "backlot";
  if (hud) hud.hidden = mode === "gallery";
  if (canvas) canvas.setAttribute("aria-hidden", String(mode === "gallery"));
}

/**
 * Give the box back: no fixed height, no inner scroller, no canvas — the page
 * is simply the gallery, at natural height, which is the page a reader with no
 * JavaScript gets.
 *
 * This runs when the backlot is never going to arrive: no WebGL2, a chunk that
 * did not land, an engine that threw. It is the branch that was wrong before
 * this design and that nobody had walked — the old boot left the stage hidden
 * with its space still reserved, so a reader with JavaScript and no WebGL got a
 * full-viewport blank above the list, permanently. The no-JS path and the happy
 * path were both verified; this one sits between them.
 */
function releaseBox(): void {
  if (!stage) return;
  stage.removeAttribute("data-backlot-box");
  stage.removeAttribute("data-backlot-ready");
  if (canvas) canvas.hidden = true;
  if (takeover) takeover.hidden = true;
  setMode("gallery");
}

/** The engine has the box. Used by the automatic takeover and by the button. */
function enterBacklot(): void {
  // Read before anything is hidden. `hidden` blurs the element it is set on, so
  // by the line after this one `document.activeElement` is already <body> and
  // the question cannot be asked any more — measured, as a press that handed
  // focus nowhere (CLAUDE.md §7).
  const pressed = document.activeElement === takeover;

  if (takeover) takeover.hidden = true;
  setMode("backlot");

  // Focus follows the reader's own press, and only that press: an automatic
  // takeover must not move focus, because nobody asked it to. A press must,
  // because the control that had it has just stopped existing.
  if (!pressed) return;
  const first = hud?.querySelector<HTMLButtonElement>("button:not([hidden])");
  if (first) first.focus();
}

async function boot(): Promise<void> {
  findParts();
  if (!stage || !canvas || !hud || !gallery || !takeover || !payloadTag?.textContent) {
    releaseBox();
    return;
  }
  // A browser with no WebGL gets the gallery as the page rather than a box with
  // nothing coming for it.
  if (!("WebGL2RenderingContext" in window)) {
    releaseBox();
    return;
  }

  const payload = JSON.parse(payloadTag.textContent) as BacklotPayload;
  // Read before the engine can write its route. Native fragment scrolling is
  // not a decision to stay in the list; a named room or door asks for the 3D.
  let sharedPlace = false;
  try {
    const hash = decodeURIComponent(location.hash.slice(1)).trim();
    sharedPlace = payload.manifest.rooms.some((room) =>
      room.id === hash || room.stages?.some((door) => door.id === hash),
    );
  } catch {
    // An invalid fragment names no room. The gallery still works.
  }

  // Out of `hidden` before the engine measures it, or the renderer is sized
  // against a box of nothing — the engine counts its first presented frame off
  // this element's box, and a `display: none` canvas reads 0x0. It keeps that
  // box in both modes from here on and only its opacity changes.
  //
  // Hidden from the accessible tree at the same time, because the engine gives
  // it `role="img"` and a description of the scene at construction — which is
  // well before the scene is what is on screen. The gallery is what is showing
  // until the mode flips, so the canvas should not be describing itself yet.
  canvas.hidden = false;
  canvas.setAttribute("aria-hidden", "true");

  const engine = await createBacklot({ canvas, hud, payload, rooms: roomBuilders });
  // Handed to `live` before `ready` is awaited, so a reader who navigates away
  // during the two seconds the first frame takes on a slow connection still gets
  // the teardown rather than leaving an engine nobody holds.
  live = engine;

  await engine.ready;

  // From here the box has two sides to it, so the status bar's switch means
  // something and backlot.css lets it be seen.
  stage.dataset.backlotReady = "";

  takeover.addEventListener("click", enterBacklot);

  // "Show as a list" flips `hidden` on the list and nothing else; this is what
  // turns that into the other side of the box. Watching the attribute rather
  // than the button means the two cannot get out of step, whichever of them
  // moved first — the same reason the status bar's own module watches it.
  //
  // The two elements are captured as locals rather than read off the
  // module-level `let`s: those now point at whatever body is current, and this
  // observer belongs to the body it was made for. It is disconnected by `stop()`
  // with the engine, which is the other half of the lifetime being owned in one
  // place — an observer left watching a detached element is the same shape of
  // leak as a render loop left running on a detached canvas, just quieter.
  const list = gallery;
  const box = stage;
  watching = new MutationObserver(() => {
    const mode: Mode = list.hidden ? "backlot" : "gallery";
    if (box.dataset.backlotMode !== mode) setMode(mode);
  });
  watching.observe(list, { attributes: true, attributeFilter: ["hidden"] });

  // The guard. The flag is set on the root element by the page's head script the
  // first time focus lands in the gallery, a pointer goes down in it, or it is
  // scrolled — from the head, because a script in the body does not run until
  // the stylesheets have, and that window is 700 ms of the reader being ignored.
  const use = document.documentElement.getAttribute("data-backlot-used");
  if (use !== null && !(sharedPlace && use === "scroll")) {
    takeover.hidden = false;
    return;
  }

  enterBacklot();
}

// `error`, not `warn`, and the difference is the size of what has gone wrong. A
// room that throws is a warning: the hub is still standing and the reader still
// has the backlot. This is the whole 3D experience failing, and the failure is
// silent by design — the gallery is real, the box is given back, and the page a
// reader gets is a correct page. That is exactly what makes it expensive: an
// island that throws on every load presents as a healthy static gallery, and
// twice this round a signature mismatch did precisely that for minutes.
//
// It is still not an uncaught error, so a probe watching `window.onerror` sees
// nothing either way — and the absence of a logged error is not evidence the
// island booted. The check for that is the positive one, on the
// `data-backlot-ready` attribute the engine sets on purpose once it has a frame.
// This line is what makes the cause findable after that check has gone red.
/** Boot against whatever body is in the document now, unless one is already
 *  running or on its way. */
async function start(): Promise<void> {
  if (live || starting) return;
  starting = true;
  try {
    await boot();
  } finally {
    starting = false;
  }
}

/** And give it back. The only thing that clears `live`. */
function stop(): void {
  const engine = live;
  live = null;
  watching?.disconnect();
  watching = null;
  engine?.dispose();
}

document.addEventListener("astro:before-swap", stop);
document.addEventListener("astro:page-load", () => void run());

/** One way in, with the one place the failure is reported.
 *
 *  `await` rather than a `.catch()` chain, which is not a style preference: the
 *  chain raised ts(80006) "this may be converted to an async function", and a
 *  hint nothing in this repo will ever fail on is exactly the kind of thing that
 *  survives forever. Cleared at the source rather than left for a diagnostic
 *  level nobody reads. */
async function run(): Promise<void> {
  try {
    await start();
  } catch (error) {
    console.error("backlot: the island did not start, so the page stays on the gallery", error);
    releaseBox();
  }
}

void run();
