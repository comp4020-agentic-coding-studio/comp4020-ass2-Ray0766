// "Press Enter to open it" has to be true.
//
// A reader walking the corridor with the arrow keys is told, by the live region,
// that they are at week N's door and that Enter opens it. This drives exactly
// that: walk until the engine says the figure is at a stage door, read the
// sentence, press Enter, and see which week's page arrives.
//
// **It was false for every reader who had entered a room, four times out of
// four at both viewports in both themes**, and it took three correct things to
// make it:
//
//  1. entering a room hands the keyboard to the room's first control, which is
//     what stopped the keyboard landing on the way out;
//  2. a window-level Enter yields whenever the HUD holds focus, because a
//     focused button's activation behaviour is the browser's and taking the key
//     as well would run the door twice;
//  3. so the engine's "Enter opens the door the figure is standing at" was
//     unreachable from inside a room, and Enter ran the focused button instead.
//
// The reader walked to week 12, was told Enter would open it, and the figure
// turned round and walked back down the corridor to week 1. A reader who moves
// by clicking the floor never saw it, because a click on the canvas drops focus
// to `<body>` and the window-level Enter is reachable again.
//
// Seen red by taking the focus hand-over out of `frameRoomDoor` in
// `src/backlot/engine/index.ts` — the one line that makes a walked arrival end
// the same way the restored one always claimed it did:
//
//   AssertionError: the live region said "At the week 12 door: After Five
//   Minutes. Press Enter to open it." and Enter opened
//   /comp4020-ass2-Ray0766/lectures/week-01/: expected false to be true
//
// A walk is the one arrival a check cannot fake: `spec/backlot-route.test.ts`
// drives the keyboard landing on a door and a press of its button, and both of
// those put focus on the door as a side effect of how they arrive. This one has
// to walk, which is why it is here and not there.
import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const CORRIDOR_DOOR = backlotManifest.doors.find((door) => door.roomId === "corridor");
const STAGES = backlotManifest.rooms.find((room) => room.id === "corridor")?.stages ?? [];

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

/** Where the figure is, what the page said about it, and what has the keyboard.
 *
 *  **No backticks below.** This is a String.raw template and one closes it
 *  early, which collects zero tests under a summary that says the file passed. */
const AT = String.raw`
  const near = [...document.querySelectorAll('[data-backlot-near="true"]')]
    .map((button) => button.dataset.backlotHotspot)
    .filter((id) => id && id.indexOf("stage-") === 0);
  const active = document.activeElement;
  const live = document.querySelector("[data-backlot-live], [aria-live]");
  return JSON.stringify({
    door: near[0] || null,
    hash: location.hash,
    keyboard: !active || active === document.body
      ? "<body>"
      : (active.dataset && active.dataset.backlotHotspot) || active.tagName.toLowerCase(),
    said: live ? (live.textContent || "").replace(/\s+/g, " ").trim() : "",
  });
`;

interface Walked {
  /** The stage hotspot the engine says the figure is standing at. */
  door: string | null;
  hash: string;
  keyboard: string;
  said: string;
  /** Where Enter actually went. */
  landed: string;
}

async function walkAndPress(): Promise<Walked> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  try {
    await tab.viewport(1920, 1080);
    // The engine is watched rather than the pixels, so the idle camera is noise
    // this file does not need. It does not change what Enter does.
    await tab.media({ colourScheme: "dark", reducedMotion: true });
    await tab.goto(`${site.origin}${prefix}backlot/`);
    expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");
    await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${CORRIDOR_DOOR!.id}"]').click(); return 1;`);
    // The room stands up and the figure is put down at its entrance.
    await new Promise((done) => setTimeout(done, 3800));
    // Walking, with the keys a reader has. Held rather than tapped: the figure
    // moves while the key is down, and a tap moves it a few centimetres.
    await tab.hold("ArrowUp", 2600);
    await new Promise((done) => setTimeout(done, 900));
    const at = JSON.parse(await tab.evaluate<string>(AT)) as Omit<Walked, "landed">;
    await tab.press("Enter");
    await new Promise((done) => setTimeout(done, 4500));
    const landed = await tab.evaluate<string>(`return location.pathname;`);
    return { ...at, landed };
  } finally {
    await tab.close();
    await site.close();
  }
}

// At import time, like the rest of this suite drives a browser: a walk and a
// page load do not fit in a test body's five seconds.
const seen = await walkAndPress();

describe("Enter at a door opens that door", () => {
  it("walked far enough to be standing at one", () => {
    expect(
      seen.door,
      `the walk did not reach any stage door — the figure ended up at "${seen.hash}" with the live region ` +
        `saying "${seen.said}", so the assertion below is about nothing`,
    ).not.toBeNull();
    expect(
      STAGES.some((stage) => seen.door === `stage-${stage.id}`),
      `the figure is at "${seen.door}", which is not one of the corridor's stages`,
    ).toBe(true);
  });

  it("told the reader Enter would open it", () => {
    expect(
      seen.said,
      `the live region said "${seen.said}" while the figure stood at ${seen.door}. If it no longer ` +
        `promises Enter, the assertion below is holding the page to a sentence it does not say.`,
    ).toContain("Press Enter to open it");
  });

  it("opens the week the reader was standing at, not the one that had the keyboard", () => {
    const week = seen.door!.replace("stage-", "");
    const stage = STAGES.find((one) => one.id === week);
    expect(stage, `the corridor has no stage called "${week}"`).toBeDefined();
    expect(
      seen.landed.includes(week),
      `the live region said "${seen.said}" and Enter opened ${seen.landed}. The keyboard was on ` +
        `${seen.keyboard} at the time: entering a room hands focus to the room's first control, and a ` +
        `window-level Enter yields to whatever the HUD has focused, so without the hand-over on arrival ` +
        `Enter runs a door the reader is not standing at.`,
    ).toBe(true);
  });

  it("left the keyboard on the door the figure walked to", () => {
    // Not a second way of saying the line above: this is the state a screen
    // reader is in *before* pressing anything, and it is what makes the
    // sentence true rather than a coincidence of which control was focused.
    expect(
      seen.keyboard,
      `the figure is standing at ${seen.door} and the keyboard is on "${seen.keyboard}", so Tab starts ` +
        `somewhere the reader has not been and Enter belongs to something else`,
    ).toBe(seen.door);
  });
});
