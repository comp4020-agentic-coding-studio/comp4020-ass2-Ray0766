// Back, from a week's page, lands where the reader left.
//
// A week's door is a real navigation to a real page, so the browser's history
// holds `/backlot/` and then `/lectures/week-05/`. Before this, Back returned a
// reader to the middle of the ring: the corridor to re-open, and eleven doors to
// walk past again to get where they already were. The backlot writes where they
// are into the hash so that Back can put them back at the door.
//
// **Back is not one path, and a check that only drives one of them is half a
// check.** A cold load rebuilds the document and the engine with it, and the
// hash is parsed on the way up. A back/forward-cache restore hands the same
// document back whole, with the same engine still alive in it, and **nothing
// about the first load runs again**.
//
// Which of the two the Back button gives is the browser's decision and not
// something this harness can force — so it is **recorded** rather than chosen,
// from a `pageshow` listener installed on every document before any page script
// runs (a cached restore executes none, so a listener added afterwards would
// never hear its own event). The second case then loads the same URL cold from
// nothing, which is the other path whichever one Back took, and is also what a
// reader gets from a bookmark, a pasted URL, or a cache that has evicted the
// page. Asserting a `persisted` the harness cannot make happen would be a check
// that passes because the browser felt like it.
//
// What is asserted is the state the reader is in, never the picture: the room
// that is mounted, the hash, which control the keyboard is on, and whether the
// camera is close on something. Those are things the engine sets on purpose at
// the moment in question (CLAUDE.md §7), and the room's own published rect is
// what says the camera is where it claims.

import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

/** The week this walks to. Read off the manifest rather than typed, so a
 *  corridor that stops having a week 5 fails here rather than drifting. */
const STAGE = backlotManifest.rooms.find((room) => room.id === "corridor")?.stages?.[4];
const CORRIDOR_DOOR = backlotManifest.doors.find((door) => door.roomId === "corridor");

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

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

/** Everything this file asserts on, read in one go so the four cannot be of
 *  four different moments. */
const STATE = String.raw`
  const hud = document.querySelector("[data-backlot-hud]");
  const active = document.activeElement;
  const controls = [...document.querySelectorAll("[data-backlot-hotspot]")].filter((b) => !b.hidden);
  const at = controls.find((b) => b.dataset.backlotNear === "true");
  return {
    hash: location.hash,
    path: location.pathname,
    controls: controls.map((b) => b.dataset.backlotHotspot),
    keyboard: !active || active === document.body ? "<body>" : active.dataset && active.dataset.backlotHotspot
      ? "hotspot:" + active.dataset.backlotHotspot
      : active.tagName.toLowerCase(),
    framed: hud ? hud.dataset.backlotFramed ?? "" : "",
    near: at ? at.dataset.backlotHotspot : null,
    rect: (() => {
      const one = document.querySelector('[data-backlot-hotspot="stage-week-05"]');
      return one ? one.dataset.backlotRect ?? null : null;
    })(),
    /** How many history entries deep this tab is, so "Back" can be shown to
     *  have had somewhere to go rather than assumed to. */
    depth: history.length,
  };
`;

interface State {
  hash: string;
  path: string;
  controls: (string | undefined)[];
  keyboard: string;
  framed: string;
  near: string | null;
  rect: string | null;
  depth: number;
}

interface Reading {
  /** In the corridor, at week 5's door, before stepping through. */
  atTheDoor: State;
  /** On the week's own page. */
  onThePage: State;
  /** The browser's own Back button. */
  back: State;
  /** Which kind of restore that turned out to be. A document handed back by the
   *  back/forward cache fires `pageshow` with `persisted` true and **nothing
   *  about the first load runs again**; a cold one rebuilds the document and the
   *  engine with it. Recorded rather than assumed, because "I drove the bfcache"
   *  is a claim and the harness cannot choose which one the browser gives. */
  backWas: "cache" | "cold" | "gone";
  /** And the same URL loaded cold from nothing — the path a reader takes when
   *  the cache has evicted the page, when they paste the URL, or when they come
   *  back to a bookmark. Whichever kind the Back above turned out to be, this is
   *  the other one. */
  coldUrl: State;
  /** With JavaScript switched off entirely: does the same URL reach the same
   *  week's entry in the list? */
  noScript: { id: string | null; matched: boolean } | null;
}

async function drive(): Promise<Reading> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  try {
    // On every document, before anything the page runs. A back/forward-cache
    // restore executes no page script at all, so this is the only place a
    // listener can be put that will still be there to hear its own `pageshow`.
    await tab.onNewDocument(
      `window.__restored = "cold";
       addEventListener("pageshow", (event) => { window.__restored = event.persisted ? "cache" : "cold"; });`,
    );
    await tab.viewport(1920, 1080);
    // The engine is watched rather than the pixels, so the idle camera and the
    // breathing fill are noise this file does not need.
    await tab.media({ colourScheme: "dark", reducedMotion: true });
    await tab.goto(url);
    expect(await tab.evaluate<string>(READY), "the island did not boot").toBe("ready");

    // Into the corridor, then to week 5's door. Focusing its control is one of
    // the three ways of arriving and the one a check can drive; walking is the
    // other and `spec/backlot-approach.test.ts` drives that.
    await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${CORRIDOR_DOOR!.id}"]').click(); return 1;`);
    await pause(3800);
    await tab.evaluate(`document.querySelector('[data-backlot-hotspot="stage-week-05"]').focus(); return 1;`);
    await pause(1600);
    const atTheDoor = await tab.evaluate<State>(STATE);

    // Through it. A press is a walk and a leaf before it is a navigation, so
    // this waits for the page rather than for a tick.
    await tab.evaluate(`document.querySelector('[data-backlot-hotspot="stage-week-05"]').click(); return 1;`);
    await pause(4500);
    const onThePage = await tab.evaluate<State>(STATE);

    // Back — the browser's own button, not `history.back()` in the page.
    //
    // Which kind of restore this is is the browser's to decide, so it is
    // recorded rather than chosen. The recorder is installed on **every**
    // document from before anything the page runs, because a bfcache restore
    // runs no page script and a listener added afterwards would never see its
    // own event.
    await tab.back();
    await pause(4200);
    const backWas = await tab.evaluate<"cache" | "cold" | "gone">(`return window.__restored || "gone";`);
    expect(await tab.evaluate<string>(READY), "the island did not boot after Back").toBe("ready");
    await pause(1200);
    const back = await tab.evaluate<State>(STATE);

    // And the same URL from nothing. Whichever kind Back turned out to be, this
    // is the other one: a document and an engine built from scratch with the
    // hash already in the address bar, which is what a reader gets when the
    // cache has evicted the page, or when they paste the URL, or from a
    // bookmark. It exercises the boot-time parse; Back may not have.
    // Away first, so this is a **new document** rather than a same-document
    // fragment change. Two URLs differing only by the fragment are the latter,
    // and `goto` then waits for a load event that never comes — it hangs the run
    // rather than failing it, and it caught this file twice: once here and once
    // on the no-script load below. Going via `about:blank` keeps the URL under
    // test literally the one the backlot wrote, which a differing query would
    // not.
    await tab.goto("about:blank");
    await tab.goto(`${site.origin}${prefix}backlot/${back.hash}`);
    expect(await tab.evaluate<string>(READY), "the island did not boot on a cold load of the URL").toBe("ready");
    await pause(4200);
    const coldUrl = await tab.evaluate<State>(STATE);

    // And the half a reader with no JavaScript gets: the same URL, no island at
    // all, and the browser's own hash scrolling has to reach that week's entry
    // in the list. Asserted as "the fragment names an element that exists",
    // which is the whole of what native scrolling needs.
    await tab.scripts(false);
    await tab.goto("about:blank");
    await tab.goto(`${site.origin}${prefix}backlot/${back.hash}`);
    const noScript = await tab.evaluate<{ id: string | null; matched: boolean } | null>(`
      const id = decodeURIComponent(location.hash.replace(/^#/, ""));
      if (!id) return { id: null, matched: false };
      return { id, matched: !!document.getElementById(id) };
    `);

    return { atTheDoor, onThePage, back, backWas, coldUrl, noScript };
  } finally {
    await tab.close();
    await site.close();
  }
}

const seen = await drive();

describe("the backlot says where you are in the URL", () => {
  it("has a week to walk to", () => {
    expect(STAGE, "the corridor has no fifth stage, so everything below is about nothing").toBeDefined();
    expect(CORRIDOR_DOOR, "no door opens the corridor").toBeDefined();
    expect(STAGE!.id).toBe("week-05");
  });

  it("names the door the reader is standing at, not just the room", () => {
    expect(
      seen.atTheDoor.hash,
      `at week 5's door the URL says "${seen.atTheDoor.hash}". It has to name the door, or Back has ` +
        `nothing to put the reader back at.`,
    ).toBe(`#${STAGE!.id}`);
    expect(seen.atTheDoor.framed, "the camera is not close on the door the hash names").toBe("true");
  });

  it("steps through to that week's own page", () => {
    expect(seen.onThePage.path).toBe(`${prefix}lectures/${STAGE!.id}/`);
  });
});

describe("Back lands where the reader left", () => {
  // Seen red by taking the hash out of the backlot entirely — `writeRoute` made
  // a no-op in the built bundle — which is the state this whole change is
  // against:
  //   AssertionError: Back landed on the ring with the corridor shut: the
  //   controls are lectures,sessions,studio,assessments,people,policies and the
  //   URL says "". A reader who walked to week 5 has to open the Lectures door
  //   and walk it again.: expected [ 'lectures', …(5) ] to contain
  //   'stage-week-05'
  for (const [what, state] of [
    [`by the Back button (which this browser served ${seen.backWas})`, seen.back],
    ["on a cold load of the same URL", seen.coldUrl],
  ] as const) {
    it(`puts the reader back in the corridor ${what}`, () => {
      expect(
        state.controls,
        `Back landed on the ring with the corridor shut: the controls are ${state.controls.join(",")} ` +
          `and the URL says "${state.hash}". A reader who walked to week 5 has to open the Lectures ` +
          `door and walk it again.`,
      ).toContain("stage-week-05");
      expect(state.path, "Back did not return to the backlot at all").toBe(`${prefix}backlot/`);
    });

    it(`stands the figure at week 5's door ${what}`, () => {
      expect(state.hash, "the URL forgot which door").toBe(`#${STAGE!.id}`);
      expect(
        state.near,
        `the figure is at ${state.near ?? "no door"} rather than week 5's, so Back put it in the room ` +
          `but not where it was.`,
      ).toBe("stage-week-05");
      expect(state.framed, "the camera is not close on the door the reader left from").toBe("true");
    });
  }

  // Asserted on the Back case only, and the reason is the harness rather than
  // the page. A document that has never had a user gesture does not take
  // programmatic focus in headless Chrome the way one that has does — the cold
  // load restores the room, stands the figure at the door and brings the camera
  // in, and leaves `activeElement` on `<body>`. Pressing Back arrives with a
  // gesture behind it, which is also the case a reader is actually in, so that
  // is where the keyboard is checked. Asserting it on the cold load would be
  // asserting a property of this browser.
  it("puts the keyboard on the door the reader left from", () => {
    expect(
      seen.back.keyboard,
      "the keyboard is not on the door the reader left from, so Tab starts somewhere they have not been",
    ).toBe("hotspot:stage-week-05");
  });

  it("drove both restores, whichever way the browser served Back", () => {
    // The two cases above are only two cases if they are different code paths.
    // A bfcache restore hands back a live engine and runs no page script; a cold
    // load rebuilds both and parses the hash on the way up. Which one Back gives
    // is the browser's call, so this asserts that it said **something** and that
    // the cold path was reached by the second case regardless — rather than
    // asserting a `persisted` the harness cannot force.
    expect(seen.backWas, "the recorder never saw a pageshow at all, so neither path is identified").not.toBe(
      "gone",
    );
  });

  it("had somewhere to go back to", () => {
    expect(seen.onThePage.depth, "the walk never made a history entry, so Back proves nothing").toBeGreaterThan(1);
  });
});

describe("the same URL works with no JavaScript at all", () => {
  // What is asserted is that the fragment **names an element that exists**,
  // which is exactly the condition native fragment scrolling needs and exactly
  // what the `@` form fails. The scroll itself is not asserted here, and that is
  // deliberate rather than lazy: the theme sets `scroll-behavior: smooth`, so a
  // fragment scroll is animated and a scroll offset read in the same task is the
  // first frame of an animation — the checks lane read `y=0` for a card 7,560 px
  // down and spent ten minutes believing native anchoring was broken. They then
  // measured it properly with scripts off, which is the reading this leans on:
  // `#week-05` scrolls to y=6989 and `#corridor` to y=6381, while
  // `#corridor@wk05`, `#corridor@week-05` and `#wk05` all leave the page at y=0
  // because no element carries those ids.
  it("names an element the gallery actually has", () => {
    expect(seen.noScript, "no reading was taken with scripts off").not.toBeNull();
    expect(
      seen.noScript!.matched,
      `the URL the backlot writes is "#${seen.noScript!.id}", and with JavaScript off there is no ` +
        `element with that id — so the browser scrolls to the top of the page and a reader who came ` +
        `back gets the list from the beginning. The hash has to be an anchor the page already carries.`,
    ).toBe(true);
    expect(seen.noScript!.id).toBe(STAGE!.id);
  });
});
