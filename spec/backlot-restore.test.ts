// A document handed back by the cache can still say where the reader goes next.
//
// Pressing a door declares this document finished, so that the focusout the
// navigation itself causes cannot edit the URL on the way out
// (`src/backlot/engine/index.ts`, `departing`). The back/forward cache then
// hands that same document back — alive, with the flag still set — and unless
// the flag is cleared the engine is **mute for the rest of its life**: the
// reader walks to week 7, the camera frames week 7, and the URL still says
// week 5. Back from there returns them to a door they left twenty minutes ago.
//
// One line clears it, in the `pageshow` persisted branch. Deleting that line
// passes every other check in this repo — 48 files, 1,930 passed, 10 skipped,
// identical to the baseline — which is CLAUDE.md section 7's "a branch nobody
// has watched execute is a comment", sitting on the branch that makes the route
// survive a Back.
//
// **The restore has to be the cached one**, and which kind the browser gives is
// not the check's to choose: a cold Back rebuilds the document and the engine
// with it, so the flag is false because everything is, and the bug cannot show.
// So this leaves and comes back until it gets a cached restore, and **fails
// saying so** if it never does, rather than passing on the branch it is not
// about.
//
// Seen red by deleting `departing = false;` from that branch:
//
//   AssertionError: the restored document never wrote the URL again: Escape
//   released the framing and the hash stayed at "#week-05". It came back from
//   the cache with the departure flag still set, so nothing it does can reach
//   the address bar: expected '#week-05' to be '#corridor'
import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const CORRIDOR = backlotManifest.rooms.find((room) => room.id === "corridor");
const CORRIDOR_DOOR = backlotManifest.doors.find((door) => door.roomId === "corridor");
const STAGE = CORRIDOR?.stages?.[4];

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

interface Restored {
  /** Which kind of restore the browser gave, after up to three attempts. */
  kind: "cache" | "cold" | "gone";
  /** How many leave-and-come-back cycles it took to get a cached one. */
  tries: number;
  /** The URL the restored document came back with. */
  came: string;
  /** And the URL after Escape, which releases the framing and should write. */
  afterEscape: string;
}

async function leaveAndComeBack(): Promise<Restored> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  try {
    // On every document, before anything the page runs: a cached restore runs
    // no page script, so this is the only place a listener can be put that will
    // be there to hear its own `pageshow`.
    await tab.onNewDocument(
      `window.__restored = "cold";
       addEventListener("pageshow", (event) => { window.__restored = event.persisted ? "cache" : "cold"; });`,
    );
    await tab.viewport(1920, 1080);
    await tab.media({ colourScheme: "dark", reducedMotion: true });
    await tab.goto(`${site.origin}${prefix}backlot/`);
    expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");
    await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${CORRIDOR_DOOR!.id}"]').click(); return 1;`);
    await pause(3800);

    let kind: "cache" | "cold" | "gone" = "gone";
    let tries = 0;
    let came = "";
    // Three attempts, because eligibility is the browser's decision and a cold
    // one is not a failure of the page. Each attempt is a real press and a real
    // Back, which is the only way to reach this state at all.
    while (kind !== "cache" && tries < 3) {
      tries += 1;
      await tab.evaluate(`document.querySelector('[data-backlot-hotspot="stage-${STAGE!.id}"]').focus(); return 1;`);
      await pause(1400);
      await tab.evaluate(`document.querySelector('[data-backlot-hotspot="stage-${STAGE!.id}"]').click(); return 1;`);
      await pause(4500);
      await tab.back();
      await pause(4200);
      kind = await tab.evaluate<"cache" | "cold" | "gone">(`return window.__restored || "gone";`);
      came = await tab.evaluate<string>(`return location.hash;`);
      if (kind === "cold") {
        // A cold Back rebuilt the engine, so the corridor has to be re-entered
        // before the next attempt can press a door in it.
        expect(await tab.evaluate<string>(READY), "the island did not boot after a cold Back").toBe("ready");
        await pause(1200);
      }
    }

    // Escape releases the framing, and a release writes the room's own name.
    // Chosen over walking because it is one key and the state it changes is
    // unambiguous — the camera was framed on the door the restore put it on.
    await tab.press("Escape");
    await pause(1600);
    const afterEscape = await tab.evaluate<string>(`return location.hash;`);
    return { kind, tries, came, afterEscape };
  } finally {
    await tab.close();
    await site.close();
  }
}

const seen = await leaveAndComeBack();

describe("a document handed back by the cache still owns its URL", () => {
  it("has a week to leave from", () => {
    expect(STAGE, "the corridor has no fifth stage, so this is about nothing").toBeDefined();
    expect(CORRIDOR_DOOR, "no door opens the corridor").toBeDefined();
  });

  it("got a cached restore to test, in three tries or fewer", () => {
    expect(
      seen.kind,
      `after ${seen.tries} attempt(s) the browser never served Back out of the back/forward cache, so this ` +
        `file never reached the branch it is about. A cold Back rebuilds the engine and cannot show the ` +
        `defect. This is reported rather than passed: the check did not run.`,
    ).toBe("cache");
  });

  it("came back at the door the reader left from", () => {
    expect(
      seen.came,
      `the restored document came back at "${seen.came}" rather than the door the press left behind`,
    ).toBe(`#${STAGE!.id}`);
  });

  it("can still write the URL after being handed back", () => {
    expect(
      seen.afterEscape,
      `the restored document never wrote the URL again: Escape released the framing and the hash stayed ` +
        `at "${seen.afterEscape}". It came back from the cache with the departure flag still set, so ` +
        `nothing it does can reach the address bar — the reader can walk the whole corridor and the URL ` +
        `will go on naming the door they left.`,
    ).toBe(`#${CORRIDOR!.id}`);
  });
});
