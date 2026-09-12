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
import type { BacklotPayload } from "../engine/types";

const stage = document.querySelector<HTMLElement>("[data-backlot-stage]");
const canvas = document.querySelector<HTMLCanvasElement>("[data-backlot-canvas]");
const hud = document.querySelector<HTMLElement>("[data-backlot-hud]");
const payloadTag = document.querySelector<HTMLScriptElement>("[data-backlot-payload]");
const gallery = document.querySelector<HTMLElement>("[data-studio-fallback]");
const takeover = document.querySelector<HTMLButtonElement>("[data-backlot-takeover]");

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
  await engine.ready;

  // From here the box has two sides to it, so the status bar's switch means
  // something and backlot.css lets it be seen.
  stage.dataset.backlotReady = "";

  takeover.addEventListener("click", enterBacklot);

  // "Show as a list" flips `hidden` on the list and nothing else; this is what
  // turns that into the other side of the box. Watching the attribute rather
  // than the button means the two cannot get out of step, whichever of them
  // moved first — the same reason the status bar's own module watches it.
  new MutationObserver(() => {
    const mode: Mode = gallery.hidden ? "backlot" : "gallery";
    if (stage.dataset.backlotMode !== mode) setMode(mode);
  }).observe(gallery, { attributes: true, attributeFilter: ["hidden"] });

  // The guard. The flag is set on the root element by the page's head script the
  // first time focus lands in the gallery, a pointer goes down in it, or it is
  // scrolled — from the head, because a script in the body does not run until
  // the stylesheets have, and that window is 700 ms of the reader being ignored.
  if (document.documentElement.hasAttribute("data-backlot-used")) {
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
boot().catch((error) => {
  console.error("backlot: the island did not start, so the page stays on the gallery", error);
  releaseBox();
});
