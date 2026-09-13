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
import { formatHex, opaque, RESOLVE_COLOUR, serveBuild, Tab, type Resolved, type Rgb } from "./lib/chrome.ts";
import { doorInto, roomNamed } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const doors = backlotManifest.doors;
// Named, not positional. `rooms[0]` was the machine room by the manifest's own
// array order and nothing else, and the door was found with
// `kind === "room"`, which returned the Lectures door the moment a corridor
// existed — so this file drove a room with no builder while every message in it
// said "the machine room" (spec/lib/backlot.ts).
const room = roomNamed("machine-room");
const roomDoor = doorInto(room);

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
  roomButtons: Button[];
  roomTabOrder: string[];
  roomRings: Measured[];
  enteredBy: string;
  focusAfterEnter: string | null;
  afterEscape: { buttons: Button[]; focus: string | null; announced: string };
  escapes: { press: number; inRoom: boolean; announced: string }[];
  doorNavigation: { from: string; landedOn: string };
}

/** What comes back when there is no 3D to drive. Every field is present and
 *  empty, so the assertions below fail on their own terms with their own
 *  messages rather than on a missing property. */
const EMPTY: Sweep = {
  mounted: false,
  hub: [],
  hubTabOrder: [],
  hubRings: [],
  roomButtons: [],
  roomTabOrder: [],
  roomRings: [],
  enteredBy: "",
  focusAfterEnter: null,
  afterEscape: { buttons: [], focus: null, announced: "" },
  escapes: [],
  doorNavigation: { from: "", landedOn: "" },
};

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

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

    // Into the room with the keyboard: Tab to the Studio door and press Enter.
    // A synthetic click would skip the browser's own activation behaviour and
    // would leave focus on the body, which is the state the engine's focus
    // hand-over refuses to act on.
    const studioDoor = roomDoor;
    await tab.goto(url);
    await tab.evaluate<string | null>(`return (async () => { ${MOUNTED} })();`);
    await tabTo(tab, studioDoor.id);
    await tab.press("Enter");
    await tab.evaluate(`return new Promise((done) => setTimeout(done, 2500));`);

    const roomButtons = await tab.evaluate<Button[]>(`return (${BUTTONS});`);
    const focusAfterEnter = await tab.evaluate<string | null>(
      `return document.activeElement?.dataset?.backlotHotspot ?? null;`,
    );

    const roomWalk = await tabTo(tab, room.interactives[room.interactives.length - 1]!.id);
    const roomRings: Measured[] = [];
    for (const interactive of room.interactives) {
      const measured = await measureRing(tab, interactive.id);
      if (measured) roomRings.push(measured);
    }

    // Escape is staged, and the engine is explicit about why: the framing
    // first, the room second, because a reader who has come in close on a piece
    // expects Esc to pull back rather than throw them out. So it is driven until
    // it has done both, and how many presses that took is asserted below rather
    // than assumed — one press from a room where nothing is framed, two where
    // something is.
    const escapes: { press: number; inRoom: boolean; announced: string }[] = [];
    for (let press = 1; press <= 3; press++) {
      await tab.press("Escape");
      await tab.evaluate(`return new Promise((done) => setTimeout(done, 2500));`);
      const state = await tab.evaluate<{ inRoom: boolean; announced: string }>(
        `return {
          inRoom: [...document.querySelectorAll("[data-backlot-hud] button")]
            .some((button) => !button.hidden && button.dataset.backlotHotspot === ${JSON.stringify(
              room.interactives[0]!.id,
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
      roomButtons,
      roomTabOrder: roomWalk.seen,
      roomRings,
      enteredBy: studioDoor.id,
      focusAfterEnter,
      afterEscape,
      escapes,
      doorNavigation: { from: pageDoor.id, landedOn },
    };
  } finally {
    await tab.close();
    await site.close();
  }
}

const driven = await sweep();

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

describe("the machine room is its interactives", () => {
  it("has one button per interactive in the manifest, and no others in play", () => {
    const live = named(driven.roomButtons.filter((button) => !button.hidden).map((button) => button.id));
    expect(
      live,
      `the machine room's visible buttons are not its manifest's interactives. It was showing ` +
        `${live.join(", ")}; the manifest has ` +
        `${room.interactives.map((interactive) => interactive.id).join(", ")}. An id here that the manifest ` +
        `does not have is either a piece that has fallen out of it or a control the engine registered for a ` +
        `room with no exit of its own — see the note above.`,
    ).toEqual(room.interactives.map((interactive) => interactive.id));
  });

  it("takes the hub's doors out of the tab order while the reader is inside", () => {
    // `hidden` on its own is not enough: `.backlot-hotspot` declares a display
    // and an author display beats the UA stylesheet's `[hidden]`, which would
    // leave six buttons opening doors the reader cannot see, still tabbable.
    const parked = driven.roomButtons.filter((button) => doors.some((door) => door.id === button.id));
    expect(parked.length).toBe(doors.length);
    for (const button of parked) {
      expect(button.hidden, `${button.id} is still in play inside the room`).toBe(true);
      expect(button.display, `${button.id} is hidden and still painted`).toBe("none");
    }
  });

  it("labels each one with what it does", () => {
    for (const interactive of room.interactives) {
      const button = driven.roomButtons.find((candidate) => candidate.id === interactive.id)!;
      expect(button.name).toBe(interactive.label);
    }
  });

  it("is reached by Tab in document order", () => {
    expect(named(driven.roomTabOrder)).toEqual(room.interactives.map((interactive) => interactive.id));
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
describe("Enter opens, Escape goes back", () => {
  it("Enter on the Studio door opens the machine room", () => {
    expect(
      named(driven.roomButtons.filter((button) => !button.hidden).map((button) => button.id)),
      "Enter on the Studio door did not open the machine room",
    ).toEqual(room.interactives.map((interactive) => interactive.id));
  });

  it("hands focus to a control inside the room, rather than dropping it on the body", () => {
    // A control must not take focus away from the person who just used it: the
    // door the reader pressed stops existing, so something in the room has to
    // take it. Both failures land on <body>, where the ring vanishes and a
    // screen reader loses its place.
    expect(
      driven.focusAfterEnter,
      "focus was dropped when the room opened, so the next Tab starts from the top of the page",
    ).not.toBeNull();
    expect(room.interactives.map((interactive) => interactive.id)).toContain(driven.focusAfterEnter);
  });

  it("leaves the room in at most two presses of Escape, and says what each one did", () => {
    // The staging is the contract's, not an accident: at most two, and every
    // press has to have announced something, or a reader who cannot see the
    // camera has no idea the first press did anything at all.
    expect(
      driven.escapes.length,
      `Escape took ${driven.escapes.length} presses to leave the room: ` +
        driven.escapes.map((e) => `${e.press}. ${e.inRoom ? "still inside" : "out"} — "${e.announced}"`).join("; "),
    ).toBeLessThanOrEqual(2);
    expect(driven.escapes[driven.escapes.length - 1]!.inRoom, "Escape never left the room").toBe(false);
    for (const escape of driven.escapes) {
      expect(escape.announced, `press ${escape.press} of Escape announced nothing`).not.toBe("");
    }
  });

  it("Escape brings the ring back, with the doors in play again", () => {
    expect(driven.afterEscape.buttons.filter((button) => !button.hidden).map((button) => button.id)).toEqual(
      doors.map((door) => door.id),
    );
  });

  it("Escape puts focus back on the door the reader came through", () => {
    expect(driven.afterEscape.focus).toBe(driven.enteredBy);
  });

  it("says where the figure ended up", () => {
    expect(driven.afterEscape.announced, "the live region says nothing about arriving back").not.toBe("");
  });

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
    ...driven.roomRings.map((ring) => ({ where: "the machine room", ring })),
  ];

  it("focused every button it was supposed to", () => {
    expect(driven.hubRings.map((ring) => ring.id)).toEqual(doors.map((door) => door.id));
    expect(driven.roomRings.map((ring) => ring.id)).toEqual(
      room.interactives.map((interactive) => interactive.id),
    );
  });

  for (const door of doors) {
    it(`the ${door.label} door's button`, () => {
      const ring = driven.hubRings.find((candidate) => candidate.id === door.id)!;
      assertRing(ring, "the hub");
    });
  }

  for (const interactive of room.interactives) {
    it(`the ${interactive.label} button`, () => {
      const ring = driven.roomRings.find((candidate) => candidate.id === interactive.id)!;
      assertRing(ring, "the machine room");
    });
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

  it("measured a ring on every control in both places", () => {
    expect(all().length).toBe(doors.length + room.interactives.length);
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
