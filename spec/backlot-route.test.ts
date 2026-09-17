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
// The rendered controls must be visible as well as agreeing with the engine: the room
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

/**
 * Everything this file asserts on, read in one go so the four cannot be of four
 * different moments.
 *
 * `closeOn` is what the canvas says the camera is close **on**, and it is read
 * instead of `data-backlot-framed` because that attribute answers a different
 * question: whether the camera has left its resting view at all. In the walked
 * state the reviewer drove, it was true while the URL still said the room — a
 * proxy answering the question next to the one being asked. The engine names
 * the thing on purpose in the canvas's own description, so that is what is read.
 *
 * **No backticks below.** This is a String.raw template and one closes it early,
 * which collects zero tests under a summary that says the file passed — the
 * failure CLAUDE.md section 7 records, walked into again while writing the
 * comment that replaced a proxy.
 */
const STATE = String.raw`
  const hud = document.querySelector("[data-backlot-hud]");
  const active = document.activeElement;
  const controls = [...document.querySelectorAll("[data-backlot-hotspot]")].filter((b) => !b.hidden);
  const at = controls.find((b) => b.dataset.backlotNear === "true");
  return {
    mode: document.querySelector("[data-backlot-stage]")?.dataset.backlotMode,
    hudVisible: !!hud && !hud.hidden && hud.checkVisibility(),
    boxes: controls.map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.dataset.backlotHotspot, width: r.width, height: r.height, visible: b.checkVisibility() };
    }),
    said: hud?.querySelector('[aria-live="polite"]')?.textContent ?? "",
    hash: location.hash,
    path: location.pathname,
    controls: controls.map((b) => b.dataset.backlotHotspot),
    keyboard: !active || active === document.body ? "<body>" : active.dataset && active.dataset.backlotHotspot
      ? "hotspot:" + active.dataset.backlotHotspot
      : active.tagName.toLowerCase(),
    framed: hud ? hud.dataset.backlotFramed ?? "" : "",
    closeOn: (() => {
      const said = document.querySelector("[data-backlot-canvas]")?.getAttribute("aria-label") ?? "";
      const at = /The camera is close on: ([^.]+)\./.exec(said);
      return at ? at[1] : "";
    })(),
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
  mode: string;
  hudVisible: boolean;
  boxes: { id: string; width: number; height: number; visible: boolean }[];
  said: string;
  hash: string;
  path: string;
  controls: (string | undefined)[];
  keyboard: string;
  framed: string;
  closeOn: string;
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
  coldOnPage: State;
  coldBack: State;
  coldRooms: { id: string; state: State }[];
  /** What the backlot's URL said at the moment the press took the document away
   *  — the history entry Back comes back to.
   *
   *  **Read here rather than inferred from `back`**, because whether Back shows
   *  a defect in that entry is the browser's choice and not this check's: a
   *  restore out of the back/forward cache brings the live engine with it and it
   *  rewrites the hash from the scene before anybody looks, so the same broken
   *  entry reads as fine about two runs in three. This is the entry itself. */
  leftAt: string;
  /** With JavaScript switched off entirely: does the same URL reach the same
   *  week's entry in the list? */
  noScript: { id: string | null; matched: boolean } | null;
}

async function drive(width: number, height: number, theme: "dark" | "light"): Promise<Reading> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  try {
    // On every document, before anything the page runs. A back/forward-cache
    // restore executes no page script at all, so this is the only place a
    // listener can be put that will still be there to hear its own `pageshow`.
    await tab.onNewDocument(
      `window.__restored = "cold";
       addEventListener("pageshow", (event) => { window.__restored = event.persisted ? "cache" : "cold"; });
       // And what this document's URL said as it went away, which is the history
       // entry Back has to come back to. Kept in sessionStorage because the
       // document that recorded it is gone by the time anybody can ask.
       addEventListener("pagehide", () => {
         try { sessionStorage.setItem("backlot:leftAt", location.hash); } catch {}
       });`,
    );
    await tab.viewport(width, height);
    await tab.onNewDocument(`localStorage.setItem("at-theme", "${theme}");`);
    // The engine is watched rather than the pixels, so the idle camera and the
    // breathing fill are noise this file does not need.
    await tab.media({ colourScheme: theme, reducedMotion: true });
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
    const leftAt = await tab.evaluate<string>(`return sessionStorage.getItem("backlot:leftAt") || "(never recorded)";`);

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
    expect(await tab.evaluate<string>("return document.documentElement.dataset.theme;"), "wrong theme under test").toBe(theme);
    // The restored control must work through the keyboard, not only a .click().
    await tab.press("Enter");
    await pause(4500);
    const coldOnPage = await tab.evaluate<State>(STATE);
    await tab.back();
    await pause(4200);
    const coldBack = await tab.evaluate<State>(STATE);

    const coldRooms: { id: string; state: State }[] = [];
    for (const room of backlotManifest.rooms) {
      await tab.goto("about:blank");
      await tab.goto(`${url}#${room.id}`);
      expect(await tab.evaluate<string>(READY), `the island did not boot for #${room.id}`).toBe("ready");
      await pause(1600);
      coldRooms.push({ id: room.id, state: await tab.evaluate<State>(STATE) });
    }

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

    return { atTheDoor, onThePage, back, backWas, coldUrl, coldOnPage, coldBack, coldRooms, leftAt, noScript };
  } finally {
    await tab.close();
    await site.close();
  }
}

for (const [width, height] of [[1920, 1080], [390, 844]] as const) {
  for (const theme of ["dark", "light"] as const) {
    const seen = await drive(width, height, theme);
    describe(`${width}x${height} ${theme}`, () => {

    describe("the backlot says where you are in the URL", () => {
      it("has a week to walk to", () => {
        expect(STAGE, "the corridor has no fifth stage, so everything below is about nothing").toBeDefined();
        expect(CORRIDOR_DOOR, "no door opens the corridor").toBeDefined();
        expect(STAGE!.id).toBe("week-05");
      });

      it("leaves the door's name in the entry the press pushed off", () => {
        // The act is the press; the state it has to change is the history entry the
        // document leaves behind. Everything else here reads what Back gave back,
        // and Back is allowed to hand the live engine back with it — which rewrites
        // the hash from the scene and hides a broken entry about two runs in three.
        //
        // Seen red by taking the guard off the route writer: a navigation blurs the
        // control that started it, the blur is how the framing is released, and the
        // release wrote the room's own name over the door's on the way out.
        expect(
          seen.leftAt,
          `the backlot's URL said "${seen.leftAt}" as the press took the document away, so the entry Back ` +
            `comes back to does not name the door the reader pressed. Whether that shows up in the state after ` +
            `Back is the browser's choice of restore, not this check's.`,
        ).toBe(`#${STAGE!.id}`);
      });

      it("names the door the reader is standing at, not just the room", () => {
        expect(
          seen.atTheDoor.hash,
          `at week 5's door the URL says "${seen.atTheDoor.hash}". It has to name the door, or Back has ` +
            `nothing to put the reader back at.`,
        ).toBe(`#${STAGE!.id}`);
        expect(
          seen.atTheDoor.closeOn,
          `the camera is close on "${seen.atTheDoor.closeOn}" rather than the door the hash names`,
        ).toBe(`Week ${STAGE!.week}: ${STAGE!.title}`);
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
          expect(
            state.closeOn,
            `the camera is close on "${state.closeOn}" rather than the door the reader left from. ` +
              `"Framed" on its own only says the camera has left its resting view, which it had also ` +
              `done in the state where the URL still said the room.`,
          ).toBe(`Week ${STAGE!.week}: ${STAGE!.title}`);
        });
      }

      for (const [what, state] of [["Back", seen.back], ["a cold share URL", seen.coldUrl], ["Back after cold Enter", seen.coldBack]] as const) {
        it(`shows the HUD after ${what}`, () => {
          expect(state.hudVisible, "the restored room's HUD is hidden").toBe(true);
          expect(state.mode, "the engine restored behind the static gallery").toBe("backlot");
        });
        it(`gives every active hotspot a visible box after ${what}`, () => {
          expect(state.boxes.length).toBeGreaterThan(0);
          for (const box of state.boxes) {
            expect(box.width, `${box.id} has no width`).toBeGreaterThan(0);
            expect(box.height, `${box.id} has no height`).toBeGreaterThan(0);
            expect(box.visible, `${box.id} is hidden`).toBe(true);
          }
        });
        it(`puts the keyboard on the restored door after ${what}`, () => {
          expect(state.keyboard).toBe("hotspot:stage-week-05");
        });
        it(`announces the restored door after ${what}`, () => {
          expect(state.said).toContain(`At the week ${STAGE!.week} door:`);
        });
      }

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

      it("opens the shared week with Enter on a cold load", () => {
        expect(seen.coldOnPage.path).toBe(`${prefix}lectures/${STAGE!.id}/`);
        expect(seen.coldBack.hash).toBe(`#${STAGE!.id}`);
      });
      for (const { id, state } of seen.coldRooms) {
        it(`opens #${id} with its own usable controls`, () => {
          const room = backlotManifest.rooms.find((one) => one.id === id)!;
          expect(state.hash).toBe(`#${id}`);
          expect(state.hudVisible).toBe(true);
          expect(state.mode).toBe("backlot");
          expect(state.controls).toEqual(room.interactives.map((one) => one.id));
          for (const box of state.boxes) {
            expect(box.width, `${id}: ${box.id} width`).toBeGreaterThan(0);
            expect(box.height, `${id}: ${box.id} height`).toBeGreaterThan(0);
            expect(box.visible, `${id}: ${box.id} visible`).toBe(true);
          }
          expect(state.keyboard).toBe(`hotspot:${room.interactives[0]!.id}`);
        });
      }
    });
  }
}
