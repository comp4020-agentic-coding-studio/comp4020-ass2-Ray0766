// Booting the backlot: read the payload the page serialised, hand it to the
// engine, and get out of the way.
//
// The gallery below the stage is the page. This script is the only thing that
// turns it into a place you can walk, and if any part of that fails — no
// WebGL, a chunk that never arrives, an engine that throws — the gallery is
// what stays on screen, which is the same page every reader with JS off gets.
import type { BacklotPayload } from "../engine/types";

const stage = document.querySelector<HTMLElement>("[data-backlot-stage]");
const canvas = document.querySelector<HTMLCanvasElement>("[data-backlot-canvas]");
const hud = document.querySelector<HTMLElement>("[data-backlot-hud]");
const payloadTag = document.querySelector<HTMLScriptElement>("[data-backlot-payload]");
const gallery = document.querySelector<HTMLElement>("[data-studio-fallback]");

async function boot(): Promise<void> {
  if (!stage || !canvas || !hud || !payloadTag?.textContent) return;
  // A browser with no WebGL gets the gallery rather than a blank rectangle.
  if (!("WebGL2RenderingContext" in window)) return;

  const payload = JSON.parse(payloadTag.textContent) as BacklotPayload;
  const [{ createBacklot }, { roomBuilders }] = await Promise.all([
    import("../engine"),
    import("../rooms"),
  ]);

  const engine = await createBacklot({ canvas, hud, payload, rooms: roomBuilders });
  await engine.ready;

  // Only once a frame is on screen: until then the gallery is doing the work,
  // and swapping earlier would leave a reader looking at nothing.
  stage.hidden = false;
  if (gallery) gallery.hidden = true;
}

boot().catch((error) => {
  console.warn("backlot: staying on the gallery", error);
  if (stage) stage.hidden = true;
  if (gallery) gallery.hidden = false;
});
