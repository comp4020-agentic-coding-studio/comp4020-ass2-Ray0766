// Every door and every screen is a real button, and the keyboard is the way
// through them — not a second way, the way. The canvas is how the buttons look.
//
// All of it driven in a real browser, because none of it can be read off the
// source: the buttons do not exist until the island has mounted, their order is
// the order the engine registered them in, and whether Tab reaches them is a
// question about the document the engine built rather than about any file.
//
// `Emulation.setFocusEmulationEnabled` is on in spec/lib/chrome.ts. Headless
// Chrome has no OS-focused window and therefore defers every focus event
// forever: `element.focus()` moves `document.activeElement` and fires no
// `focusin` at all, so a check that reads activeElement passes while the page
// code listening for focus never runs. A red run taken before that emulation is
// on is not evidence of anything (CLAUDE.md §7).
//
// Counts come from the manifest. "Six doors" and "eight things in the machine
// room" are facts about src/backlot/rooms/manifest.ts, and a check that writes
// them down again is a check that agrees with itself.

import { describe, expect, it } from "vitest";
import { contrastRatio } from "astro-theme-university/contrast";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import {
  formatHex,
  opaque,
  RESOLVE_COLOUR,
  serveBuild,
  Tab,
  type Key,
  type Resolved,
  type Rgb,
} from "./lib/chrome.ts";
import { roomsWithDoors } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const doors = backlotManifest.doors;
// Every room, each paired with the door that opens it, in the manifest's order.
// This file used to take `rooms[0]` and `doors.find(kind === "room")` — the
// machine room by the manifest's own array order, and the Lectures door the
// moment a corridor existed, so it drove a room with no builder while every
// message in it said "the machine room" (spec/lib/backlot.ts). It is now every
// room the manifest builds, which is what the file was always claiming to be
// about: a button per interactive, reachable by Tab, with a ring you can see.

/** WCAG 2.2 SC 1.4.11: a focus indicator is a non-text contrast requirement,
 *  3:1 against the colours next to it. The theme's contrast module has no
 *  constant for it — its AA_LARGE_TEXT is the same number about a different
 *  thing, and borrowing it would make this line read as a claim about type. */
const AA_NON_TEXT = 3;

/** Waits for the HUD to be on screen *and* to have stopped changing shape.
 *  Two things go wrong a frame too early, and both did. The stage carries
 *  `data-reserve`, so for a moment after boot.ts takes the `hidden` attribute
 *  off it a computed style read from here still reports the
 *  `[data-reserve][hidden]` rule's `visibility: hidden` — and a control inside
 *  a `visibility: hidden` subtree cannot be focused and is not what
 *  `elementFromPoint` answers. And a control read on the frame it was parked on
 *  can still measure its parts at nothing, which showed up as "people has no
 *  dot" on one run in three and a green suite on the others. So: the same shape
 *  twice in a row, with the stage on screen for both.
 */
const MOUNTED = String.raw`
  const stage = document.querySelector("[data-backlot-stage]");
  // Not the stage's own visibility: its subtree's. A computed style read here
  // goes on reporting the [data-reserve][hidden] rule for a while after the
  // attribute is gone, and it clears on the stage before it clears on the
  // controls inside it -- measured, as a hotspot whose dot came back
  // "14x14 block/hidden/1" while the stage above it already read visible.
  const onScreen = () => {
    // The mode first. The stage now holds the gallery until the engine takes
    // the box, and while it does the HUD carries the hidden attribute -- its
    // buttons do not, so a check that only looked at them found six controls
    // inside a display:none container and called the page ready. It passed
    // alone and failed under six browsers competing, which is the worst way for
    // it to be wrong.
    if (stage.dataset.backlotMode !== "backlot") return false;
    if (stage.hidden || getComputedStyle(stage).visibility !== "visible") return false;
    const control = document.querySelector("[data-backlot-hud] button:not([hidden])");
    if (!control) return false;
    for (const part of [control, ...control.querySelectorAll("*")]) {
      if (getComputedStyle(part).visibility !== "visible") return false;
    }
    return true;
  };
  const shape = () =>
    [...document.querySelectorAll("[data-backlot-hud] button")]
      .filter((button) => !button.hidden)
      .map((button) => {
        const box = button.getBoundingClientRect();
        const parts = [...button.querySelectorAll("*")].map((child) => {
          const rect = child.getBoundingClientRect();
          return Math.round(rect.width) + "x" + Math.round(rect.height) + getComputedStyle(child).visibility;
        });
        return Math.round(box.width) + "x" + Math.round(box.height) + ":" + parts.join(",");
      })
      .join("|");

  let previous = "";
  const deadline = performance.now() + 20000;
  while (performance.now() < deadline) {
    await new Promise((done) => requestAnimationFrame(() => done()));
    if (!onScreen()) {
      previous = "";
      continue;
    }
    const now = shape();
    if (now !== "" && now === previous) return "mounted";
    previous = now;
  }
  return null;
`;

/** The HUD's buttons in document order, which is the order the engine
 *  registered them and therefore the order Tab has to reach them in. Hidden
 *  ones are reported too: a button the engine has taken out of play has to be
 *  out of the tab order as well, and `hidden` alone does not do that when a
 *  stylesheet has given the element a `display` (CLAUDE.md §7). */
const BUTTONS = String.raw`
  [...document.querySelectorAll("[data-backlot-hud] button")].map((button) => ({
    id: button.dataset.backlotHotspot ?? null,
    name: (button.getAttribute("aria-label") ?? button.textContent).replace(/\s+/g, " ").trim(),
    hidden: button.hidden,
    display: getComputedStyle(button).display,
  }))
`;

interface Button {
  id: string | null;
  name: string;
  hidden: boolean;
  display: string;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Ring {
  id: string;
  focusVisible: boolean;
  style: string;
  width: number;
  offset: number;
  declared: Resolved;
  /** Viewport pixels, each wholly inside its own band. */
  ringPoint: { x: number; y: number } | null;
  haloPoint: { x: number; y: number } | null;
  box: Box;
  why: string;
}

interface Measured extends Ring {
  ringPixel: Rgb | null;
  haloPixel: Rgb | null;
  /** The button's box, re-read once both pixels were taken. A difference means
   *  the scene moved under the sampler and the reading is worthless. */
  boxAfter: Box | null;
  /** How the control came to a stop before it was sampled. A travel with an end
   *  is a push; something that never stops is not. */
  rest: Settling;
}

/** What happened between focusing a control and the control holding still. */
interface Settling {
  /** True once two consecutive reads of the box were identical. */
  settled: boolean;
  samples: number;
  /** How many different places the box was seen in. Lane 1's own distinction:
   *  twelve to eighteen distinct positions in forty samples is a walk, two is a
   *  flip, and a push is neither — it is a travel with an end. */
  distinct: number;
  waited: number;
  /** How far it moved in total, so a failure can say whether it moved at all. */
  travelled: number;
}

interface Sweep {
  /** Whether the island got as far as a HUD. Everything else in here is about a
   *  3D scene and is meaningless without it, so it is recorded rather than
   *  thrown — see "the island booted" at the bottom of the file. */
  mounted: boolean;
  hub: Button[];
  hubTabOrder: string[];
  hubRings: Measured[];
  /** One entry per room in the manifest, in the manifest's order, each entered
   *  through its own door. Keyed rather than flat: the machine room and the
   *  corridor are two rooms and every assertion below is about one of them. */
  rooms: RoomSweep[];
  doorNavigation: { from: string; landedOn: string };
}

/** Everything read inside one room, from the door that opens it. */
interface RoomSweep {
  id: string;
  buttons: Button[];
  tabOrder: string[];
  rings: Measured[];
  enteredBy: string;
  focusAfterEnter: string | null;
  afterEscape: { buttons: Button[]; focus: string | null; announced: string };
  escapes: { press: number; inRoom: boolean; announced: string }[];
  /** Every sentence the live region said while the figure was walked through
   *  the room, in the order it said them. Empty for a room with no stages. */
  announcements: string[];
  /** The URL the moment the room opened. */
  hashOnEntering: string;
  /** The URL as each control was arrived at by keyboard. */
  hashOnFocus: { id: string; hash: string }[];
  /** Which door the figure was at, and what the URL said, at each step of the
   *  walk — the same moment, read in one evaluate. */
  walkedTo: { near: string; hash: string }[];
  /** `history.length` and the hash once the room is open, against the length
   *  recorded on the hub before the door was pressed. */
  history: { length: number; hash: string; onTheHub: number };
}

/** What comes back when there is no 3D to drive. Every field is present and
 *  empty, so the assertions below fail on their own terms with their own
 *  messages rather than on a missing property. */
const EMPTY: Sweep = {
  mounted: false,
  hub: [],
  hubTabOrder: [],
  hubRings: [],
  rooms: [],
  doorNavigation: { from: "", landedOn: "" },
};

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/**
 * A walk down a corridor, as held keys.
 *
 * Forward, then across and back, repeatedly. The strafes are the point: the
 * doors are in the walls and the middle of a corridor is out of reach of all of
 * them, so a figure walked straight up it arrives at the end wall and nowhere
 * else — one arrival, which cannot show that two doors say different things.
 * Driven, and what it reaches is in the receipt: weeks 3, 5, 8, 10 and 12, five
 * different sentences, the same five under reduced motion.
 *
 * Camera-relative, so "up" is up the corridor whichever way the camera has been
 * turned, which is what makes a fixed sequence a sensible thing to write down.
 */
const CORRIDOR_WALK: [Key, number][] = [
  ["ArrowUp", 700],
  ["ArrowLeft", 700],
  ["ArrowRight", 700],
  ["ArrowUp", 700],
  ["ArrowRight", 700],
  ["ArrowLeft", 700],
  ["ArrowUp", 700],
  ["ArrowLeft", 700],
  ["ArrowRight", 700],
  ["ArrowUp", 700],
];

/** Tab from wherever focus is until it reaches `id`, or give up. Returns how
 *  many presses it took and every hotspot it passed on the way, so the caller
 *  can assert the order rather than only the destination. */
async function tabTo(tab: Tab, id: string, limit = 40): Promise<{ presses: number; seen: string[] }> {
  const seen: string[] = [];
  for (let presses = 1; presses <= limit; presses++) {
    await tab.press("Tab");
    const at = await tab.evaluate<string | null>(
      `return document.activeElement?.dataset?.backlotHotspot ?? null;`,
    );
    if (at && !seen.includes(at)) seen.push(at);
    if (at === id) return { presses, seen };
  }
  return { presses: limit, seen };
}

/** The focus ring, read where it is painted. `all: unset` in a later cascade
 *  layer is an opt-out of the indicator that still matches `:focus-visible`,
 *  which is exactly the failure a computed-style check alone calls a pass
 *  (CLAUDE.md §7) — so the ring is measured as pixels.
 *
 *  Two points, both on the button's left edge at half its height, where a
 *  pill's outline runs vertically and its curvature over one row is under a
 *  hundredth of a pixel:
 *
 *    ring  the middle of the outline band, `outline-offset` to
 *          `offset + width` outside the border box
 *    halo  between the border box and the outline, which is what the ring has
 *          to stand out against on its inner side
 *
 *  Both are chosen as a pixel *wholly inside* their band. The first version of
 *  this rounded to the band's centre instead, and every reading came back as
 *  gold at three-quarter coverage — `--backlot-x` is a projected coordinate and
 *  lands on fractions, so the band's edges do too, and the sampled pixel was an
 *  antialiased blend of the ring and what is behind it. `#8b5e16` against a
 *  declared `#b97d1c`, differently wrong on every button. */
const RING = String.raw`
  ${RESOLVE_COLOUR}
  const button = document.activeElement;
  if (!button || !button.dataset.backlotHotspot) return null;
  const style = getComputedStyle(button);
  const box = button.getBoundingClientRect();
  const width = parseFloat(style.outlineWidth);
  const offset = parseFloat(style.outlineOffset);
  const y = Math.round(box.top + box.height / 2);

  // A pixel covers [i, i+1). Wholly inside [from, to) means i >= from and
  // i + 1 <= to; the middle of that range is the furthest from either edge.
  const wholly = (from, to) => {
    const first = Math.ceil(from);
    const last = Math.floor(to) - 1;
    if (last < first) return null;
    const x = Math.floor((first + last) / 2);
    return x >= 1 && y >= 1 && x < innerWidth - 1 && y < innerHeight - 1 ? { x, y } : null;
  };

  const ring = wholly(box.left - offset - width, box.left - offset);
  const halo = offset >= 1 ? wholly(box.left - offset, box.left) : wholly(box.left + 1, box.left + 3);

  return {
    id: button.dataset.backlotHotspot,
    focusVisible: button.matches(":focus-visible"),
    style: style.outlineStyle,
    width,
    offset,
    declared: resolveColour(style.outlineColor),
    ringPoint: ring,
    haloPoint: halo,
    box: { left: box.left, top: box.top, width: box.width, height: box.height },
    why: ring && halo ? "" : "no whole pixel of the ring is on screen, so it cannot be sampled",
  };
`;

/** Where a control's box is right now, in viewport pixels. */
const BOX_OF = (id: string) => `const button = document.querySelector('[data-backlot-hotspot="${id}"]');
   if (!button) return null;
   const box = button.getBoundingClientRect();
   return { left: box.left, top: box.top, width: box.width, height: box.height };`;

/** Wait for a control to stop moving, and say how it stopped.
 *
 *  **Focus now pushes the camera**, which is ruling 1: Tab landing on a door is
 *  the same event as walking up to it, so a control genuinely moves between one
 *  reading and the next by design. The `boxAfter` guard below is still right —
 *  two readings of two different places are worthless — but it is a guard, not
 *  a verdict, and the answer to a worthless reading is to take another one
 *  rather than to fail. So this waits for the push to finish first.
 *
 *  "Finished" is two consecutive reads of the same box, not a fixed sleep: the
 *  travel is 620 ms of camera plus however long the figure takes to walk, and a
 *  sleep long enough for the worst case is a sleep on every one of fourteen
 *  controls. What it reports when it gives up is the shape of what it saw —
 *  lane 1's distinction, that a walk is a dozen distinct places in forty
 *  samples, a flip is two, and a push is a travel with an end. */
async function settleControl(tab: Tab, id: string): Promise<Settling> {
  const started = Date.now();
  const places = new Set<string>();
  let previous: Box | null = null;
  let travelled = 0;
  let samples = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const box = await tab.evaluate<Box | null>(BOX_OF(id));
    samples += 1;
    if (!box) break;
    places.add(`${Math.round(box.left)},${Math.round(box.top)}`);
    if (previous) {
      travelled += Math.hypot(box.left - previous.left, box.top - previous.top);
      if (box.left === previous.left && box.top === previous.top && box.width === previous.width) {
        return { settled: true, samples, distinct: places.size, waited: Date.now() - started, travelled };
      }
    }
    previous = box;
    await new Promise<void>((done) => setTimeout(done, 80));
  }
  return { settled: false, samples, distinct: places.size, waited: Date.now() - started, travelled };
}

/** Focus one hotspot, let the push it starts finish, and measure its ring. */
async function measureRing(tab: Tab, id: string): Promise<Measured | null> {
  await tab.evaluate(`document.querySelector('[data-backlot-hotspot="${id}"]')?.focus(); return null;`);
  const rest = await settleControl(tab, id);
  const ring = await tab.evaluate<Ring | null>(RING);
  if (!ring) return null;
  const ringPixel = ring.ringPoint ? await tab.pixel(ring.ringPoint.x, ring.ringPoint.y) : null;
  const haloPixel = ring.haloPoint ? await tab.pixel(ring.haloPoint.x, ring.haloPoint.y) : null;
  const boxAfter = await tab.evaluate<Box | null>(BOX_OF(id));
  return { ...ring, ringPixel, haloPixel, boxAfter, rest };
}

async function sweep(): Promise<Sweep> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  try {
    await tab.viewport(1920, 1080);
    // Reduced motion, for two reasons. It is a state that has to be observed
    // running at least once rather than read in the source, and it is what
    // holds the scene still: with the idle camera drifting, a button moves
    // between the reading that chooses a sample point and the screenshot that
    // takes it, and every pixel below would be of somewhere else.
    await tab.media({ colourScheme: "dark", reducedMotion: true });
    await tab.goto(url);
    const mounted = await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
    // Returned empty, not thrown. A throw here runs during module evaluation and
    // the runner reports a file that failed to load: no test names, none of the
    // assertions below, and a summary line that counts the rest of the suite as
    // passing. Every check in this file then has nothing to say about why, and
    // the page itself says nothing either — a dead island falls back to the
    // static gallery, which is correct and looks healthy. So the sweep comes
    // back with `mounted: false` and empty arrays, and the describe at the
    // bottom of the file names it.
    if (!mounted) return EMPTY;

    // Parenthesised, and that is not a style choice: `return` followed by a
    // newline is a `return;`, and the first version of this handed every
    // assertion below `undefined` while looking like it was reading the page.
    const hub = await tab.evaluate<Button[]>(`return (${BUTTONS});`);

    // Walked from the address bar, so the site's own chrome is in front of the
    // hotspots and the order below is the order a reader actually gets.
    const hubWalk = await tabTo(tab, doors[doors.length - 1]!.id);
    const hubRings: Measured[] = [];
    for (const door of doors) {
      const measured = await measureRing(tab, door.id);
      if (measured) hubRings.push(measured);
    }

    // Into each room with the keyboard: Tab to its own door and press Enter.
    // A synthetic click would skip the browser's own activation behaviour and
    // would leave focus on the body, which is the state the engine's focus
    // hand-over refuses to act on.
    //
    // Every room the manifest builds, through the door that opens it, and the
    // page reloaded in between so each room is entered from a hub in its
    // resting state rather than from wherever the last room's Escape left it.
    const rooms: RoomSweep[] = [];
    for (const { room: entry, door } of roomsWithDoors) {
      await tab.goto(url);
      await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
      const historyOnTheHub = await tab.evaluate<number>(`return window.history.length;`);
      await tabTo(tab, door.id);
      await tab.press("Enter");
      await tab.evaluate(`return new Promise((done) => setTimeout(done, 2500));`);

      const buttons = await tab.evaluate<Button[]>(`return (${BUTTONS});`);
      const focusAfterEnter = await tab.evaluate<string | null>(
        `return document.activeElement?.dataset?.backlotHotspot ?? null;`,
      );
      const hashOnEntering = await tab.evaluate<string>(`return window.location.hash;`);

      // The walk starts wherever the room put the reader, so where that is has
      // to be part of the reading.
      //
      // This collected only the controls Tab *moved to*. That was the whole list
      // while the room handed focus outside itself, and became one short the day
      // entering a room started landing focus on the **first** control: the
      // first press moves to the second, and the walk came back "expected
      // [ 'play-front-t2', …(7) ] to deeply equal [ 'play-front-t1', …(8) ]",
      // which reads as a missing control and is a missing starting point.
      //
      // Blurring does not fix it and it is worth saying why, because it is the
      // obvious move: Chrome remembers the sequential-focus start at the element
      // that was blurred, so the next Tab still goes to the one after it. The
      // honest reading is the starting point plus what the walk saw — and when
      // the walk has already wrapped round to it, it is in `seen` and must not
      // be counted twice.
      // **A rotation, not a prefix, and the difference is a check that could not
      // fail.** This used to be `focusAfterEnter && !seen.includes(focusAfterEnter)
      // ? [focusAfterEnter, ...seen] : seen`, and `tabTo` walks to the *last*
      // control — so with focus starting on the last one, Tab wraps, the last
      // reappears in `seen`, the `!includes` guard drops the seed, and what is
      // left equals the manifest exactly. Focus landing on the first control and
      // focus landing on the last produced the same passing answer, which is
      // precisely the handoff this check was written to guard. An independent
      // review broke the handoff to send the keyboard to the exit and the whole
      // suite stayed at 1,908.
      //
      // The honest statement does not depend on where the walk began: the cycle
      // is the seed followed by everything after it, and that has to be a
      // **rotation** of the manifest's order. A rotation pins the sequence and
      // says nothing about the starting point — which is a separate assertion,
      // below, because it is a separate fact.
      const walk = await tabTo(tab, entry.interactives[entry.interactives.length - 1]!.id);
      const order = focusAfterEnter
        ? [focusAfterEnter, ...walk.seen.filter((id) => id !== focusAfterEnter)]
        : walk.seen;
      const rings: Measured[] = [];
      // The URL as each control is arrived at by keyboard. `measureRing` focuses
      // the control and waits out the push, so by the time it returns the
      // arrival has happened and the route is whatever the engine wrote.
      const hashOnFocus: { id: string; hash: string }[] = [];
      for (const interactive of entry.interactives) {
        const measured = await measureRing(tab, interactive.id);
        if (measured) rings.push(measured);
        hashOnFocus.push({
          id: interactive.id,
          hash: await tab.evaluate<string>(`return window.location.hash;`),
        });
      }

      // Then the figure is walked, and every sentence the live region says on
      // the way is collected.
      //
      // **Walked, not focused, and the difference is the whole check.** The
      // first version of this read the live region after focusing each control
      // in turn and found one sentence across all thirteen — which looks like a
      // corridor that never says where you are and is not. Focus moves the
      // *camera* (`hotspots.ts`'s `focusin` calls `hooks.frame`); arrival is
      // fired from `track(player.position)`, which is the **figure**. Tabbing
      // to a door announces nothing through this region because the browser has
      // already read the button's own name out — and the region would be
      // saying it twice. It is the reader walking with the arrow keys who has
      // no other channel, and that is the reader this is about. A check on the
      // wrong event answers the question next to the one being asked
      // (CLAUDE.md §7), and this one did until it was driven.
      //
      // `hold`, not `press`: press sends down and up in the same millisecond,
      // so the figure does not travel and nothing is ever arrived at. The
      // strafes are what reach the side doors — straight up the middle arrives
      // only at the end wall, which is one arrival and cannot show that two
      // doors say different things.
      const announcements: string[] = [];
      const walkedTo: { near: string; hash: string }[] = [];
      if ((entry.stages?.length ?? 0) > 0) {
        await tab.evaluate(`
          window.__backlotSaid = [];
          const live = document.querySelector("[data-backlot-hud] [aria-live]");
          if (live) {
            const take = () => {
              const now = (live.textContent ?? "").trim();
              const said = window.__backlotSaid;
              if (now && said[said.length - 1] !== now) said.push(now);
            };
            take();
            new MutationObserver(take).observe(live, { childList: true, subtree: true, characterData: true });
            setInterval(take, 50);
          }
          return null;
        `);
        // Nothing focused, so the only thing moving is the figure.
        await tab.evaluate(`document.activeElement?.blur(); return null;`);
        for (const [key, milliseconds] of CORRIDOR_WALK) {
          await tab.hold(key, milliseconds);
          await pause(500);
          // Which door the figure is standing at, and what the URL says, read in
          // the same evaluate so they are the same moment.
          walkedTo.push(
            await tab.evaluate<{ near: string; hash: string }>(`
              return {
                near: [...document.querySelectorAll("[data-backlot-hud] button")]
                  .filter((one) => one.dataset.backlotNear === "true")
                  .map((one) => one.dataset.backlotHotspot)
                  .join(","),
                hash: window.location.hash,
              };
            `),
          );
        }
        announcements.push(...(await tab.evaluate<string[]>(`return window.__backlotSaid ?? [];`)));
        // And the reader is put back on a control before Escape is driven.
        //
        // Not tidying: the walk above blurs, and with nothing focused Escape
        // left `document.activeElement` on <body> and "Escape puts focus back
        // on the door the reader came through" read null. That is this harness
        // changing the state the next assertion is about, which is its own
        // failure mode (CLAUDE.md §7) — the assertion is about a reader who was
        // using the controls, so the harness hands the controls back. What the
        // engine should do for a reader who walked in and never focused
        // anything is a real question and it is not this check's to answer
        // quietly.
        await tab.evaluate(
          `document.querySelector('[data-backlot-hotspot="${
            entry.interactives[entry.interactives.length - 1]!.id
          }"]')?.focus(); return null;`,
        );
        await pause(1200);
      }

      // Escape is staged, and the engine is explicit about why: the framing
      // first, the room second, because a reader who has come in close on a
      // piece expects Esc to pull back rather than throw them out. So it is
      // driven until it has done both, and how many presses that took is
      // asserted below rather than assumed — one press from a room where
      // nothing is framed, two where something is.
      const escapes: { press: number; inRoom: boolean; announced: string }[] = [];
      for (let press = 1; press <= 3; press++) {
        await tab.press("Escape");
        await tab.evaluate(`return new Promise((done) => setTimeout(done, 2500));`);
        const state = await tab.evaluate<{ inRoom: boolean; announced: string }>(
          `return {
            inRoom: [...document.querySelectorAll("[data-backlot-hud] button")]
              .some((button) => !button.hidden && button.dataset.backlotHotspot === ${JSON.stringify(
                entry.interactives[0]!.id,
              )}),
            announced: (document.querySelector("[data-backlot-hud] [aria-live]")?.textContent ?? "").trim(),
          };`,
        );
        escapes.push({ press, ...state });
        if (!state.inRoom) break;
      }

      const afterEscape = await tab.evaluate<{ buttons: Button[]; focus: string | null; announced: string }>(
        `return {
          buttons: ${BUTTONS},
          focus: document.activeElement?.dataset?.backlotHotspot ?? null,
          announced: (document.querySelector("[data-backlot-hud] [aria-live]")?.textContent ?? "").trim(),
        };`,
      );

      // History, read after the room has been entered and the route written.
      // `writeRoute` is expected to *replace* rather than push: a room is a
      // place in the backlot, not a page, and Ray's rule is that a room change
      // is never a history entry. If it pushes, Back stops being "leave the
      // backlot" and becomes a step-by-step rewind of the reader's own walk —
      // and the engine's own comment calls that load-bearing while nothing
      // checked it.
      const history = await tab.evaluate<{ length: number; hash: string }>(
        `return { length: window.history.length, hash: window.location.hash };`,
      );

      rooms.push({
        id: entry.id,
        buttons,
        tabOrder: order,
        hashOnEntering,
        hashOnFocus,
        walkedTo,
        history: { ...history, onTheHub: historyOnTheHub },
        rings,
        enteredBy: door.id,
        focusAfterEnter,
        afterEscape,
        escapes,
        announcements,
      });
    }

    // And a door that is a door: Enter on one of the five leaves the backlot
    // for the page it is named after.
    const pageDoor = doors.find((door) => door.kind === "page")!;
    await tab.goto(url);
    await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
    await tabTo(tab, pageDoor.id);
    await tab.press("Enter");
    // Waited from here rather than inside the page: the navigation destroys the
    // execution context an in-page poll is running in, and the protocol answers
    // "Inspected target navigated or closed" instead of a path.
    await pause(4000);
    const landedOn = await tab.evaluate<string>(`return location.pathname;`);

    return {
      mounted: true,
      hub,
      hubTabOrder: hubWalk.seen,
      hubRings,
      rooms,
      doorNavigation: { from: pageDoor.id, landedOn },
    };
  } finally {
    await tab.close();
    await site.close();
  }
}

/**
 * Every stage door, pressed for real, and where the press landed.
 *
 * **Nothing in this suite pressed a corridor door until now**, and an
 * independent review proved what that cost: replacing the corridor's
 * door-behaviour loop with `doors.slice(0, 11)` makes week 12's door — the one
 * on the end wall, the last thing a reader sees — a dead control with a button,
 * a label, a place in the Tab order and a window, and the whole suite stayed at
 * 1,864 passed. Pointing all twelve at week 1 in the manifest's interactives did
 * the same: the static cards still went to the right weeks and the 3D did not,
 * and nothing noticed.
 *
 * So this drives all twelve rather than a sample. A press is the one thing that
 * cannot be inferred from the href in the DOM — the door press that turned out
 * never to have fired is the whole lesson — and "one of them works" would not
 * have caught either injection: the first only shows on the twelfth, and the
 * second only shows on a week that is not week 1.
 *
 * Entered fresh each time, because a press leaves the backlot for a real page.
 */
async function pressStages(): Promise<Landing[]> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  const landings: Landing[] = [];

  /** Polled rather than slept: under reduced motion the walk to the door is a
   *  cut, so most presses arrive in well under a second, and a fixed wait long
   *  enough for the worst case is that wait twelve times over. */
  const arriveAt = async (want: string): Promise<string> => {
    const deadline = Date.now() + 30_000;
    let here = "";
    while (Date.now() < deadline) {
      here = await tab.evaluate<string>("return location.pathname;").catch(() => here);
      if (here === want) return here;
      await pause(100);
    }
    return here;
  };

  try {
    await tab.viewport(1920, 1080);
    await tab.media({ colourScheme: "dark", reducedMotion: true });
    for (const { room: entry, door } of roomsWithDoors) {
      for (const stage of entry.stages ?? []) {
        const control = entry.interactives.find((one) => one.stageId === stage.id);
        const want = `${prefix}${stage.href.replace(/^\//, "")}`;
        if (!control) {
          landings.push({ stage: stage.id, want, landedOn: "", why: "no interactive in the manifest" });
          continue;
        }
        await tab.goto(url);
        const mounted = await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
        if (!mounted) {
          landings.push({ stage: stage.id, want, landedOn: "", why: "the island never mounted" });
          continue;
        }
        await tabTo(tab, door.id);
        await tab.press("Enter");
        await tab.evaluate(`return new Promise((done) => setTimeout(done, 2500));`);
        const walk = await tabTo(tab, control.id, 40);
        const at = await tab.evaluate<string | null>(
          `return document.activeElement?.dataset?.backlotHotspot ?? null;`,
        );
        if (at !== control.id) {
          landings.push({
            stage: stage.id,
            want,
            landedOn: "",
            why: `Tab never reached ${control.id} in ${walk.presses} presses inside ${entry.title}`,
          });
          continue;
        }
        await tab.press("Enter");
        landings.push({ stage: stage.id, want, landedOn: await arriveAt(want), why: "" });
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }
  return landings;
}

interface Landing {
  stage: string;
  /** The deployed path this week's own page is built at. */
  want: string;
  landedOn: string;
  /** Why there is no landing to report, when there is none. */
  why: string;
}

const driven = await sweep();
const landings = await pressStages();

// ---------------------------------------------------------------------------
// One button per door, one per interactive.
// ---------------------------------------------------------------------------

// Seen red by handing the engine five doors where the nav has six, and then
// reverting. The injection went into the built page's payload rather than into
// the hub that reads it: the engine and the manifest are not mine this round,
// and a temporary edit to a file another agent is writing at the same moment is
// a worse idea than a temporary edit to build output.
//   AssertionError: the hub has one button per door in the manifest, in the
//   nav's order: expected [ 'lectures', 'sessions', …(3) ] to deeply equal
//   [ 'lectures', 'sessions', …(4) ]
//   AssertionError: Tab reaches the doors in an order the document does not
//   have: expected [ 'lectures', 'sessions', …(3) ] to deeply equal
//   [ 'lectures', 'sessions', …(4) ]
//   (7 failed | 22 passed)
describe("the hub is the doors", () => {
  it("has one button per door, in the manifest's order", () => {
    expect(
      driven.hub.map((button) => button.id),
      "the hub has one button per door in the manifest, in the nav's order",
    ).toEqual(doors.map((door) => door.id));
  });

  it("names each one as the thing it does", () => {
    for (const door of doors) {
      const button = driven.hub.find((candidate) => candidate.id === door.id)!;
      expect(button.name, `the ${door.label} door's button does not say what it opens`).toContain(door.label);
    }
  });

  it("is reached by Tab in document order", () => {
    expect(driven.hubTabOrder, "Tab reaches the doors in an order the document does not have").toEqual(
      doors.map((door) => door.id),
    );
  });
});

// Seen red by taking `read-graph` out of the room's interactives in the built
// payload, and reverting:
//   AssertionError: the machine room has one button per interactive in its
//   manifest: expected [ 'play-front-t1', …(6) ] to deeply equal
//   [ 'play-front-t1', …(7) ]
//   (6 failed | 23 passed)
/** The machine room grew a ninth control this round: `look-machine`, the tower.
 *  It was the one fitting in a room named after it that a keyboard reader could
 *  not approach — the five screens and the monitor all frame the camera when you
 *  walk up or Tab to them, and the machine did neither.
 *
 *  **Nothing here was widened to absorb it.** It is a `BacklotInteractive` in
 *  `manifest.ts` like the other eight, so `room.interactives` is nine by
 *  derivation and every list below came out nine on its own. That is the shape
 *  this file already had and the reason it had it.
 *
 *  The equality below is therefore back to what it always was: **the room's
 *  visible buttons are exactly its manifest's interactives, in order.** Worth
 *  saying out loud is what that equality *also* forbids, because the engine can
 *  in principle put a control in a room that the manifest does not name —
 *  `engine/index.ts` registers its own way out under `${room.id}:leave` for a
 *  room that has none of its own. **No room in this tree takes that path**: the
 *  machine room's manifest has a `leave-room` interactive, so `index.ts` finds
 *  it and disposes the engine's. So the case exists in the code and has never
 *  run here, this assertion has never seen it, and when a room without its own
 *  exit appears this is where it will fail and what to change. Said rather than
 *  guarded — a branch nobody has watched execute is a comment (CLAUDE.md §7),
 *  and a rule written for a case that cannot occur would read as coverage. */
const named = (ids: (string | null)[]): string[] => ids.filter((id): id is string => typeof id === "string");

/** One reading per room, found by id. Named rather than indexed, so a room the
 *  sweep never reached fails by name in the `it` that is about it. */
const inRoom = (id: string): RoomSweep =>
  driven.rooms.find((entry) => entry.id === id) ?? {
    id,
    buttons: [],
    tabOrder: [],
    rings: [],
    enteredBy: "",
    focusAfterEnter: null,
    afterEscape: { buttons: [], focus: null, announced: "" },
    escapes: [],
    announcements: [],
    hashOnEntering: "",
    hashOnFocus: [],
    walkedTo: [],
    // Deliberately unequal, so a room the sweep never reached fails the history
    // assertion by name rather than passing on two zeroes.
    history: { length: 0, hash: "", onTheHub: -1 },
  };

describe.each(roomsWithDoors)("$room.title is its interactives", ({ room: entry, door }) => {
  const controls = entry.interactives.map((interactive) => interactive.id);

  it("has one button per interactive in the manifest, and no others in play", () => {
    const live = named(inRoom(entry.id).buttons.filter((button) => !button.hidden).map((button) => button.id));
    expect(
      live,
      `${entry.title}'s visible buttons are not its manifest's interactives. It was showing ` +
        `${live.join(", ")}; the manifest has ${controls.join(", ")}. An id here that the manifest ` +
        `does not have is either a piece that has fallen out of it or a control the engine registered for a ` +
        `room with no exit of its own — see the note above.`,
    ).toEqual(controls);
  });

  // The corridor's count, stated as the thing it is rather than as a number.
  // "Twelve stages plus the way out" is a fact about the manifest, and the
  // equality above is what holds the HUD to it; this is what holds the manifest
  // to itself, so a stage that loses its button fails here with the stage named
  // rather than as an off-by-one in a list of ids.
  it("gives every stage a button of its own, and keeps exactly one way out", () => {
    const stages = entry.stages ?? [];
    expect(
      entry.interactives.filter((one) => one.kind === "open-page" && one.stageId).map((one) => one.stageId),
      `${entry.title} has ${stages.length} stages and they do not line up with its open-page interactives`,
    ).toEqual(stages.map((stage) => stage.id));
    expect(
      entry.interactives.filter((one) => one.kind === "leave-room").map((one) => one.id),
      `${entry.title} has no single way out, so a reader who walked in cannot be sure of walking out`,
    ).toHaveLength(1);
    // And the two together are the whole of the room's controls where the room
    // is a corridor: the count nobody writes down.
    if (stages.length > 0) {
      expect(
        entry.interactives.length,
        `${entry.title} is ${stages.length} stages plus a way out, which is ${stages.length + 1} controls, ` +
          `and its manifest has ${entry.interactives.length}`,
      ).toBe(stages.length + 1);
    }
  });

  it("takes the hub's doors out of the tab order while the reader is inside", () => {
    // `hidden` on its own is not enough: `.backlot-hotspot` declares a display
    // and an author display beats the UA stylesheet's `[hidden]`, which would
    // leave six buttons opening doors the reader cannot see, still tabbable.
    const parked = inRoom(entry.id).buttons.filter((button) => doors.some((one) => one.id === button.id));
    expect(parked.length).toBe(doors.length);
    for (const button of parked) {
      expect(button.hidden, `${button.id} is still in play inside ${entry.title}`).toBe(true);
      expect(button.display, `${button.id} is hidden and still painted`).toBe("none");
    }
  });

  it("labels each one with what it does", () => {
    for (const interactive of entry.interactives) {
      const button = inRoom(entry.id).buttons.find((candidate) => candidate.id === interactive.id);
      expect(button, `${interactive.id} has no button in ${entry.title}`).toBeDefined();
      expect(button!.name).toBe(interactive.label);
    }
  });

  it("is reached by Tab in document order", () => {
    // A rotation of the manifest's order, because the walk starts wherever the
    // room put the reader and that is a different fact — asserted on its own
    // below. Equality here would be an assertion about two things at once, and
    // the version that was is the reason this comment exists.
    const seen = named(inRoom(entry.id).tabOrder);
    const rotations = controls.map((_, at) => [...controls.slice(at), ...controls.slice(0, at)]);
    expect(
      rotations.some((one) => one.length === seen.length && one.every((id, at) => id === seen[at])),
      `Tab reached ${seen.join(", ")}, which is not ${entry.title}'s controls in the manifest's order ` +
        `from any starting point. The manifest has ${controls.join(", ")}.`,
    ).toBe(true);
  });

  // Seen red by sending the handoff to the room's exit instead of its first
  // control, which is the injection the review landed and which every other
  // assertion in this suite survived:
  //   AssertionError: entering The machine room put the keyboard on
  //   leave-machine-room, and a reader who walks in should arrive on the room
  //   rather than thirteen Tabs behind it.
  // Seen red by turning `writeRoute`'s `replaceState` into `pushState` at
  // engine/index.ts:542, which an independent review landed and the whole suite
  // survived at 1,908 passed:
  //   AssertionError: entering The machine room added 1 entry to the session
  //   history (2 on the hub, 3 inside). A room is a place in the backlot, not a
  //   page, so Back has to leave the backlot rather than rewind the reader's own
  //   walk one door at a time.
  // ---------------------------------------------------------------------------
  // Where you are, in the URL, however you got there
  // ---------------------------------------------------------------------------
  //
  // A second review found that `spec/` read `location.hash` in exactly one file,
  // which drove one week by one arrival path — so "walking to a door never
  // writes the hash at all, only focus does" was a live defect that nothing
  // could see. The guard is therefore **every way of arriving**, not the one
  // that happened to work.
  //
  // Derived rather than picked: the walk goes wherever the walk goes, and the
  // assertion is that at every step where the engine says the figure is at a
  // door, the URL says the same door. No week is named here.
  //
  // Seen red against e96bfb5, the last commit where walking never wrote the
  // hash: "the figure is at stage-week-03 and the URL says "#corridor" —
  // 5 step(s) of the walk arrived at a door and the URL followed at none of
  // them." Green after 0d1dff3.
  // The route a hotspot's door writes, from the manifest: a stage's control is
  // `stage-week-05` and the fragment it writes is `#week-05`, so the two are not
  // the same string and the check has to map rather than concatenate. My first
  // version compared the hash against `#` plus the *hotspot* id and failed a
  // working page four ways, which is the check being wrong about the page.
  const routeOf = new Map(
    (entry.stages ?? []).map((stage) => [
      entry.interactives.find((one) => one.stageId === stage.id)!.id,
      stage.id,
    ]),
  );

  if ((entry.stages?.length ?? 0) > 0) {
    it("says which door the figure has walked to, in the URL", () => {
      const walked = inRoom(entry.id).walkedTo.filter((step) => step.near !== "");
      expect(
        walked.length,
        `the walk never arrived at a door in ${entry.title}, so this says nothing about the URL`,
      ).toBeGreaterThan(1);
      const wrong = walked
        .filter((step) => {
          // A door's reach can overlap its neighbour's, so the figure is
          // sometimes at two at once. The engine picks one; the URL has to name
          // one of the ones it is actually at.
          const at = step.near.split(",").map((id) => routeOf.get(id));
          return !at.some((route) => route && step.hash === `#${route}`);
        })
        .map((step) => `the figure is at ${step.near} and the URL says ${JSON.stringify(step.hash)}`);
      expect(
        wrong,
        `${wrong.length} of ${walked.length} step(s) of the walk arrived at a door and the URL did not ` +
          `follow. Walking up to a door is an arrival like any other, and a reader who walks somewhere ` +
          `and presses Back should come back to where they walked to.`,
      ).toEqual([]);
    });
  }

  it("says which door the keyboard is on, in the URL", () => {
    const stages = entry.stages ?? [];
    if (stages.length === 0) return;
    const wrong = inRoom(entry.id)
      .hashOnFocus.filter((seen) => routeOf.has(seen.id))
      .filter((seen) => seen.hash !== `#${routeOf.get(seen.id)}`)
      .map((seen) => `${seen.id} has the keyboard and the URL says ${JSON.stringify(seen.hash)}`);
    expect(
      wrong,
      `${wrong.length} control(s) had the keyboard on them and the URL did not say so. Tab landing on a ` +
        `door is the same arrival as walking to it.`,
    ).toEqual([]);
  });

  it("says which room the reader is in, in the URL", () => {
    expect(
      inRoom(entry.id).hashOnEntering,
      `opening ${entry.title} left the URL at ${JSON.stringify(inRoom(entry.id).hashOnEntering)}`,
    ).toBe(`#${entry.id}`);
  });

  it("opening it does not put an entry in the session history", () => {
    const read = inRoom(entry.id).history;
    expect(
      read.length,
      `entering ${entry.title} added ${read.length - read.onTheHub} entr(y/ies) to the session history ` +
        `(${read.onTheHub} on the hub, ${read.length} inside). A room is a place in the backlot, not a ` +
        `page, so Back has to leave the backlot rather than rewind the reader's own walk one door at a ` +
        `time. The engine writes the route with replaceState for exactly this reason.`,
    ).toBe(read.onTheHub);
  });

  it("puts the keyboard on the room's first control, not its way out", () => {
    // Ray's ruling, and the thing the rotation above deliberately cannot see.
    // A reader who walks in arrives on the room; landing them on the exit means
    // everything in front of them is behind them.
    expect(
      inRoom(entry.id).focusAfterEnter,
      `entering ${entry.title} put the keyboard on ${inRoom(entry.id).focusAfterEnter}, and a reader who ` +
        `walks in should arrive on the room rather than ${controls.length - 1} Tabs behind it`,
    ).toBe(controls[0]);
  });

  // The live region is the whole of what a reader walking with the arrow keys
  // gets, and in a corridor the thing it has to carry is *where they are*. A
  // reader on Tab is told by the browser, which reads the button's own name;
  // a reader walking the figure has no such channel and the room's own
  // `arrival` string is the only one there is.
  //
  // Scoped to rooms that have stages, derived rather than named: a room with
  // doors down it is a room where "which door am I at" is a question. The
  // machine room's controls are on its walls and the checks about its live
  // region are the Escape ones below.
  if ((entry.stages?.length ?? 0) > 0) {
    it("says which door the figure has walked up to, and says a different one at each", () => {
      const said = inRoom(entry.id).announcements;
      // Everything after the sentence the room says on the way in.
      const arrivals = said.slice(1);
      expect(
        arrivals.length,
        `walking ${entry.title} produced ${said.length} live-region sentence(s): ` +
          `${said.map((one) => JSON.stringify(one)).join(", ")}. A reader who cannot see the camera and is ` +
          `walking with the arrow keys is told nothing about arriving anywhere.`,
      ).toBeGreaterThan(1);

      // **Not "every arrival is distinct".** That is what this said first, and
      // it was wrong about the page rather than about the region: the walk
      // strafes, so the figure comes back past a door it has already been at,
      // and arriving at week 8 twice is the corridor working. It read "8
      // arrivals and only 6 distinct sentences" and the six were correct.
      //
      // What has teeth, and what a repeated sentence would actually break, is
      // that the sentence and the door are the same fact: every arrival naming a
      // week says the same thing, and no two weeks share a sentence. A region
      // that says one line everywhere fails the first assertion below, because a
      // constant collapses to a single entry; a region that says the same line
      // at two different doors fails this one.
      const named = new Map<number, Set<string>>();
      for (const arrival of arrivals) {
        const weeks = entry.stages!.filter((stage) =>
          new RegExp(`\\bweek ${stage.week}\\b`, "i").test(arrival),
        );
        expect(
          weeks.map((stage) => stage.id),
          `${JSON.stringify(arrival)} names ${weeks.length} of ${entry.title}'s weeks, and an arrival at a ` +
            `door has to say which one`,
        ).toHaveLength(1);
        const week = weeks[0]!.week;
        if (!named.has(week)) named.set(week, new Set());
        named.get(week)!.add(arrival);
      }

      expect(
        named.size,
        `walking ${entry.title} arrived at ${named.size} door(s): ` +
          `${arrivals.map((one) => JSON.stringify(one)).join(", ")}. One door is not enough to show that two ` +
          `of them say different things.`,
      ).toBeGreaterThan(1);

      for (const [week, sentences] of named) {
        expect(
          [...sentences],
          `week ${week}'s door announced ${sentences.size} different sentences`,
        ).toHaveLength(1);
      }

      const sentences = [...named.values()].map((one) => [...one][0]!);
      expect(
        new Set(sentences).size,
        `${named.size} different doors in ${entry.title} share ${new Set(sentences).size} sentence(s): ` +
          `${sentences.map((one) => JSON.stringify(one)).join(", ")}. A live region that says the same thing ` +
          `at two doors is not announcing position.`,
      ).toBe(named.size);
    });
  }

  it(`is opened by the ${door.label} door`, () => {
    // The binding this whole file was driven on, asserted rather than assumed:
    // the room that came back is the one that door opens.
    expect(inRoom(entry.id).enteredBy).toBe(door.id);
  });
});

// ---------------------------------------------------------------------------
// Enter, Escape, and where focus is afterwards.
// ---------------------------------------------------------------------------

// The staged Escape was seen red by rebinding the key in the built chunk so it
// never matches, and reverted. Anchored on the shape the bundler emits rather
// than on the source literal: `"Escape"` occurs 0 times in the built chunk,
// because Rolldown writes the comparison with backticks — match
// key===<backtick>Escape<backtick> inside the chunk the backlot page loads, and
// note that the site's search dialog carries the same literal in a chunk of its
// own, so the file matters as much as the pattern:
//   AssertionError: Escape took 3 presses to leave the room: 1. still inside —
//   "Inside the machine room."; 2. still inside — "Inside the machine room.";
//   3. still inside — "Inside the machine room.": expected 3 to be less than or
//   equal to 2
//   AssertionError: expected 'leave-machine-room' to be 'studio'
//
// Seen red in the same round as the interactive that was taken out of the
// payload — the room the Studio door opens came back one control short:
//   AssertionError: Enter on the Studio door did not open the machine room:
//   expected [ 'play-front-t1', …(6) ] to deeply equal
//   [ 'play-front-t1', …(7) ]
// then reverted.
describe.each(roomsWithDoors)("Enter opens $room.title, Escape goes back", ({ room: entry, door }) => {
  const controls = entry.interactives.map((interactive) => interactive.id);

  it(`Enter on the ${door.label} door opens it`, () => {
    expect(
      named(inRoom(entry.id).buttons.filter((button) => !button.hidden).map((button) => button.id)),
      `Enter on the ${door.label} door did not open ${entry.title}`,
    ).toEqual(controls);
  });

  it("hands focus to a control inside the room, rather than dropping it on the body", () => {
    // A control must not take focus away from the person who just used it: the
    // door the reader pressed stops existing, so something in the room has to
    // take it. Both failures land on <body>, where the ring vanishes and a
    // screen reader loses its place.
    expect(
      inRoom(entry.id).focusAfterEnter,
      "focus was dropped when the room opened, so the next Tab starts from the top of the page",
    ).not.toBeNull();
    expect(controls).toContain(inRoom(entry.id).focusAfterEnter);
  });

  it("leaves the room in at most two presses of Escape, and says what each one did", () => {
    // The staging is the contract's, not an accident: at most two, and every
    // press has to have announced something, or a reader who cannot see the
    // camera has no idea the first press did anything at all.
    const escapes = inRoom(entry.id).escapes;
    expect(escapes.length, `Escape never ran in ${entry.title}`).toBeGreaterThan(0);
    expect(
      escapes.length,
      `Escape took ${escapes.length} presses to leave ${entry.title}: ` +
        escapes.map((e) => `${e.press}. ${e.inRoom ? "still inside" : "out"} — "${e.announced}"`).join("; "),
    ).toBeLessThanOrEqual(2);
    expect(escapes[escapes.length - 1]!.inRoom, `Escape never left ${entry.title}`).toBe(false);
    for (const escape of escapes) {
      expect(escape.announced, `press ${escape.press} of Escape announced nothing`).not.toBe("");
    }
  });

  it("Escape brings the ring back, with the doors in play again", () => {
    expect(
      inRoom(entry.id).afterEscape.buttons.filter((button) => !button.hidden).map((button) => button.id),
    ).toEqual(doors.map((one) => one.id));
  });

  it("Escape puts focus back on the door the reader came through", () => {
    expect(inRoom(entry.id).afterEscape.focus).toBe(door.id);
  });

  it("says where the figure ended up", () => {
    expect(
      inRoom(entry.id).afterEscape.announced,
      "the live region says nothing about arriving back",
    ).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// A stage door is a door: pressing it leaves for that week's page.
// ---------------------------------------------------------------------------
//
// Both halves matter and they fail differently. The manifest half is free and
// catches a week pointed at another week's page; the driven half costs twelve
// navigations and is the only thing that can tell a control that opens a page
// from a control that looks exactly like one and does nothing.
describe.each(roomsWithDoors.filter(({ room }) => (room.stages?.length ?? 0) > 0))(
  "$room.title's doors go where they say",
  ({ room: entry }) => {
    const stages = entry.stages!;

    // Seen red by pointing every stage's interactive at week 1 in
    // src/backlot/rooms/manifest.ts (`href: stage.href` -> the literal), which
    // is invisible in the static list because the cards read `stage.href`
    // directly:
    //   AssertionError: week-02's button opens /lectures/week-01/ and week-02
    //   is at /lectures/week-02/. The list reads the stage and the island reads
    //   the interactive, so this is the gallery and the room disagreeing about
    //   the same door.
    it("gives every week's button that week's own route", () => {
      for (const stage of stages) {
        const control = entry.interactives.find((one) => one.stageId === stage.id);
        expect(control, `${stage.id} has no interactive of its own`).toBeDefined();
        expect(
          control!.href,
          `${stage.id}'s button opens ${control!.href} and ${stage.id} is at ${stage.href}. The list reads ` +
            `the stage and the island reads the interactive, so this is the gallery and the room ` +
            `disagreeing about the same door.`,
        ).toBe(stage.href);
      }
      const routes = stages.map((stage) => stage.href);
      expect(
        new Set(routes).size,
        `${stages.length} doors share ${new Set(routes).size} route(s): ${routes.join(", ")}`,
      ).toBe(stages.length);
    });

    // Seen red by replacing the corridor's door-behaviour loop with
    // `doors.slice(0, 11)` — week 12 keeps its button, its label, its place in
    // the Tab order and its window, and the press does nothing:
    //   AssertionError: pressing week-12's button left the reader on
    //   /comp4020-ass2-Ray0766/backlot/ and week-12 is at
    //   /comp4020-ass2-Ray0766/lectures/week-12/
    // Every other assertion in this suite passed under that injection, which is
    // why this one is driven rather than read off the href.
    for (const stage of stages) {
      it(`pressing ${stage.id} leaves for that week's page`, () => {
        const landing = landings.find((one) => one.stage === stage.id);
        expect(landing, `${stage.id} was never pressed`).toBeDefined();
        expect(landing!.why, `${stage.id} could not be pressed: ${landing!.why}`).toBe("");
        expect(
          landing!.landedOn,
          `pressing ${stage.id}'s button left the reader on ${landing!.landedOn} and ${stage.id} is at ` +
            `${landing!.want}. A button that carries the right href and does not go there is the failure ` +
            `no assertion about the DOM can see.`,
        ).toBe(landing!.want);
      });
    }

    it("pressed every one of them, rather than a sample", () => {
      // The floor. "One of them works" would not have caught either injection
      // the review landed: one only shows on the twelfth door, the other only
      // on a week that is not week 1.
      expect(landings.filter((one) => stages.some((stage) => stage.id === one.stage))).toHaveLength(
        stages.length,
      );
    });
  },
);

describe("a door that is a door", () => {
  it("Enter on a door that is a page leaves the backlot for that page", () => {
    const door = doors.find((candidate) => candidate.id === driven.doorNavigation.from)!;
    expect(
      driven.doorNavigation.landedOn,
      `Enter on the ${door.label} door stayed on /backlot/`,
    ).toBe(`${prefix}${door.href.replace(/^\//, "")}`);
  });
});

// ---------------------------------------------------------------------------
// A ring you can see.
// ---------------------------------------------------------------------------

// Seen red by resetting the ring away in the built page
// (`.backlot-hotspot:focus-visible { outline: none; box-shadow: none }`), which
// is what `all: unset` in a later cascade layer does to it — the element still
// matches :focus-visible and paints nothing:
//   AssertionError: the lectures button matches :focus-visible and paints no
//   ring: expected 'none' not to be 'none'
//   (14 failed | 15 passed — every control in both places)
// then reverted.
describe("every hotspot shows a focus ring", () => {
  const all = () => [
    ...driven.hubRings.map((ring) => ({ where: "the hub", ring })),
    ...driven.rooms.flatMap((entry) =>
      entry.rings.map((ring) => ({ where: backlotManifest.rooms.find((one) => one.id === entry.id)!.title, ring })),
    ),
  ];

  it("focused every button it was supposed to", () => {
    expect(driven.hubRings.map((ring) => ring.id)).toEqual(doors.map((door) => door.id));
    for (const { room: entry } of roomsWithDoors) {
      expect(
        inRoom(entry.id).rings.map((ring) => ring.id),
        `${entry.title} did not give a ring reading for every control`,
      ).toEqual(entry.interactives.map((interactive) => interactive.id));
    }
  });

  for (const door of doors) {
    it(`the ${door.label} door's button`, () => {
      const ring = driven.hubRings.find((candidate) => candidate.id === door.id)!;
      assertRing(ring, "the hub");
    });
  }

  for (const { room: entry } of roomsWithDoors) {
    for (const interactive of entry.interactives) {
      it(`the ${interactive.label} button in ${entry.title}`, () => {
        const ring = inRoom(entry.id).rings.find((candidate) => candidate.id === interactive.id);
        expect(ring, `${interactive.id} was never focused in ${entry.title}`).toBeDefined();
        assertRing(ring!, entry.title);
      });
    }
  }

  function assertRing(ring: Measured, where: string): void {
    expect(ring.focusVisible, `${ring.id} in ${where} does not match :focus-visible when focused`).toBe(true);
    expect(ring.style, `the ${ring.id} button matches :focus-visible and paints no ring`).not.toBe("none");
    expect(
      ring.width,
      `${ring.id}'s ring is ${ring.width}px, which is not a ring anybody sees`,
    ).toBeGreaterThanOrEqual(2);

    // Everything above is the declaration. Below is the pixel.
    expect(ring.ringPoint, `${ring.id}: ${ring.why}`).not.toBeNull();
    expect(ring.ringPixel, `no pixel came back for ${ring.id}'s ring`).not.toBeNull();
    expect(ring.haloPixel, `no pixel came back beside ${ring.id}'s ring`).not.toBeNull();
    // The push has to have ended before any of this is worth reading, and
    // "ended" is a thing to wait for rather than a thing to assume. Focusing a
    // control is now an arrival, so the camera moves on purpose; what would be
    // wrong is a control that never comes to rest.
    expect(
      ring.rest.settled,
      `${ring.id} never stopped moving: ${ring.rest.distinct} distinct positions in ${ring.rest.samples} samples ` +
        `over ${ring.rest.waited} ms, ${Math.round(ring.rest.travelled)}px travelled in total. Focus pushes the ` +
        `camera, so a control moving after focus is ruling 1 working — but a push is a travel with an end, and a ` +
        `dozen places in forty samples is a walk rather than a push.`,
    ).toBe(true);
    expect(
      ring.boxAfter,
      `${ring.id} moved while its ring was being sampled, so both readings are of somewhere else. It had already ` +
        `come to rest after ${ring.rest.waited} ms in ${ring.rest.distinct} distinct positions, so this is movement ` +
        `after the push finished rather than the push itself.`,
    ).toEqual(ring.box);

    // The ring has to be seen against what it sits on, which is the button's
    // own halo on the inside. A control whose indicator is the same colour as
    // the thing it surrounds has no indicator, however correct the declaration.
    const ratio = contrastRatio(ring.ringPixel!, ring.haloPixel!);
    expect(
      ratio,
      `${ring.id} in ${where} paints ${formatHex(ring.ringPixel!)} for its ring against ` +
        `${formatHex(ring.haloPixel!)} beside it — ${ratio.toFixed(2)}:1, and a focus indicator needs ` +
        `${AA_NON_TEXT}:1 against what it is next to. It declares ` +
        `${formatHex(opaque(ring.declared, `${ring.id}'s outline colour`))}.`,
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  }

  it("measured a ring on every control in every place", () => {
    const wanted =
      doors.length + roomsWithDoors.reduce((sum, { room: entry }) => sum + entry.interactives.length, 0);
    expect(
      all().length,
      `${all().length} ring readings came back and there are ${wanted} controls across the hub and ` +
        `${roomsWithDoors.length} room(s)`,
    ).toBe(wanted);
  });
});

// ---------------------------------------------------------------------------
// The island booted, said positively and said by name.
// ---------------------------------------------------------------------------
//
// This used to be a `throw` inside `sweep()`, and it was the wrong shape for the
// same reason the one in spec/backlot-contrast.test.ts was: a throw at module
// evaluation prints a file that failed to load, with no test names, after a
// twenty-second wait, and every assertion above is absent under a summary that
// still counts the rest of the suite as passing.
//
// It is asserted on the attribute the engine sets when it has the box, not on
// the absence of a logged error: the fallback to the static gallery is the
// designed behaviour and it is correct, so a dead island looks like a healthy
// page from the outside, and the level `boot.ts` logs at is a decision in
// another file that a check should not be built on.
//
// Seen red the same way spec/backlot-contrast.test.ts's is — the engine's entry
// replaced with a thrower in the built bundle — and reverting://
// Anchored on a **shape**, not a name. `createBacklot` occurs 0 times in the
// built bundle — it minifies to two letters — so an instruction naming it
// produces a green run that reads exactly like a check gone blind. The shape
// `await(await X({canvas:…,hud:…,payload:…,rooms:…})).ready` matches once in the
// chunk the backlot page loads, and that is what to replace with a thrower.
//
//   AssertionError: the backlot never mounted, so there was no HUD to drive and
//   nothing above is about a 3D scene. The static gallery would still be on
//   screen and still correct, which is why this is asserted rather than
//   inferred.: expected false to be true
//   (105 failed | 2 passed, across this file and backlot-contrast together)
describe("the island booted before any of this was driven", () => {
  it("mounted, so there was a HUD to drive", () => {
    expect(
      driven.mounted,
      "the backlot never mounted, so there was no HUD to drive and nothing above is about a 3D scene. The " +
        "static gallery would still be on screen and still correct, which is why this is asserted rather " +
        "than inferred.",
    ).toBe(true);
  });
});
