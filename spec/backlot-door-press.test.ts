// What a press on a door owes a reader: the page it is going to, fetched at the
// moment of the press, and a way to change their mind while the figure walks.
//
// Ray has kept the 2,505 ms deliberately — the figure walks to the door and the
// leaf swings before anything navigates, and that is the backlot's own cost
// rather than a delay to be shaved. Two things follow from keeping it, and both
// are checked here:
//
//   1. **the target page is prefetched at the moment of the press.** Two and a
//      half seconds is a long time to be doing nothing on the wire. The press is
//      the moment the reader tells you where they are going; the arrival is not.
//   2. **Escape during the walk cancels it.** A journey with a two-and-a-half
//      second runway is a journey somebody can change their mind in, and a
//      reader who has changed their mind must not arrive anyway.
//
// ---------------------------------------------------------------------------
// Motion is ON in this file, and that is the whole reason it can say anything
// ---------------------------------------------------------------------------
//
// Every other browser-driven check in `spec/` runs under
// `prefers-reduced-motion: reduce`, and that is right for a colour or a
// geometry: it pins the idle camera so a rect read in the page and a pixel
// sampled a moment later are of the same frame. It would make this file
// meaningless. Under the preference `player.walkTo` **teleports** — "the arrival
// still happens; it just does not take two seconds" — and `use()` skips the
// leaf's 420 ms as well, so there is no walk left to cancel and the press
// navigates almost at once. A check for "Escape during the walk" taken under
// reduced motion would be a check of a build with no walk in it.
//
// So the camera drifts here, and nothing in this file reads a pixel offset or a
// published rectangle as if it were still — with one exception, made on purpose
// and put back afterwards: the reading of where the figure ended up is taken
// with the preference switched **on**, after the cancel has already happened.
// See the cancel lap for why that is the honest way round.
//
// ---------------------------------------------------------------------------
// How "the figure has stopped" is read, since nothing publishes it
// ---------------------------------------------------------------------------
//
// "Not mid-stride" is a claim about where the figure is, and the engine
// publishes a rect for every *hotspot surface* and nothing at all for the
// figure. What the figure does have is the accent ring at its feet — an unlit
// `flat("--at-accent")` fill, which takes no light and therefore composites to
// its declared colour **exactly**, the same property `spec/backlot-figure.test.ts`
// uses to find the tower's light bar. So the ring is found by exact colour.
//
// **An exact colour match is only deterministic on an unlit surface, and two
// things in this scene wear that colour without being the ring.** Both had to be
// cut out before the reading meant anything, and the second one is the more
// interesting:
//
//   the HUD's dots    `backlot-hud.css` gives `.backlot-hotspot__dot`
//                     `background: var(--at-accent)` — a fill, never ink, which
//                     is correct. Every visible button's own client rect is
//                     excluded. **Read in the same beat as the raster**, never
//                     cached: the controls are parked every frame off the
//                     camera's matrix, and boxes read once at the start of a lap
//                     left the dots uncovered — the "figure" then came back
//                     pixel-identical across 900 ms of walking, at (194.4,397.1)
//                     on the phone. A still reading off a moving figure is the
//                     worst answer this could give.
//
//   the doors' plinths  `hub.ts` paints them `lit("--at-primary")`, and
//                     `--at-accent` *is* `--at-primary`. A lit surface has no
//                     fixed value: the stage's fill light breathes ±12% on a
//                     7.0 s period, which pushes a plinth's pixels back and
//                     forth **across** the token's exact value. Measured, the
//                     exact-match pixels outside a window on the figure swing
//                     their centroid 87.7 x / 62.7 y with the count moving
//                     between 862 and 1126 — which is what six readings six
//                     seconds apart read as a walk. The camera cannot account
//                     for that and I wrongly assumed it could: the idle yaw
//                     pivots about the ring's centre and gives 8.4 x / 0.5 y
//                     where a cancel leaves the figure, and cannot put 20 px on
//                     y at all.
//
// So the ring is taken as a **connected component with the shape of a 0.90 m
// disc lying on the floor**: this camera lays a depth back by cos 52° and a
// horizontal extent not at all, so the ring's bounding box has an aspect of
// sin 52° = 0.788, and nothing else wearing that colour does. A flickering
// plinth is a different shape and is refused rather than averaged in.
//
// And the HUD is **not** hidden to get around that, which is the other half of
// the same trap: `visibility: hidden` on the HUD blurs whatever the reader was
// on and drops the framing with it, so a raster taken that way is of a scene
// that stopped being true the moment the style landed. This file is about a
// reader standing on a control; it cannot take the control away to look.
//
// Stopped is then a run of readings of that centroid inside one small envelope.
// One reading is not a measurement of a moving thing — a single read of a rect
// has reported two product failures in this repo that were not real.
//
// **And the envelope is small only because the camera is pinned for it.** A
// reading of the ring on the canvas is a reading of the figure *and* of the
// camera, and the idle camera is supposed to move: measured, a figure that had
// certainly stopped read x 947..987 and y 350..391 over ten samples, with
// consecutive steps up to 40 px, while a walking figure covers about 390 px a
// second. Those bands are three times apart, not orders of magnitude, and a
// threshold widened until the noise fits under it would pass a figure that
// really was drifting. So the noise is removed instead: `prefers-reduced-motion`
// goes on *after* the cancel, which pins the idle yaw and the fill light and
// changes nothing about the walk — `player.update` moves toward its goal whether
// or not the preference is set, and only a `walkTo` called while it is set
// arrives instantly. Then it is put back, and whether it was put back is
// asserted rather than assumed.
//
// ---------------------------------------------------------------------------
// What each check is keyed on
// ---------------------------------------------------------------------------
//
//   the prefetch      a **request on the wire** for the door's own URL, taken
//                     from `Network.requestWillBeSent` with the protocol's own
//                     wall clock, and timed against the press. The DOM link that
//                     caused it is recorded beside it as evidence of how, but it
//                     is not what is asserted: "prefetched" is a thing that
//                     either happened on the network or did not, and which tag
//                     or call did it is the engine's business. What makes this a
//                     signal rather than a consequence is the **timing** — a
//                     request that arrives within half a second of the press and
//                     a second and a half before the address bar changes cannot
//                     be the navigation wearing a different hat.
//
//   not on arrival    the same collector, over the window between the reader
//                     landing on the door's button (which frames the camera and
//                     starts the clip) and pressing it. Zero requests for the
//                     target there is the whole of "on the press and not on
//                     arrival", and it is only worth anything because the same
//                     collector finds one a moment later.
//
//   the room door     the same again for the door that opens a room rather than
//                     a page. A room is built in the browser and there is no
//                     document to fetch; a prefetch there is a request nobody
//                     will ever use. Asserted as a zero **and** paired with the
//                     room actually mounting, so a lap where the press did
//                     nothing at all cannot pass it.
//
//   not framed        `data-backlot-framed` on the HUD, which `engine/index.ts`
//                     writes from `camera.framed` in the same pass that draws the
//                     frame, and the canvas's own `aria-label`, which
//                     `describeCanvas()` writes from the state the engine
//                     **intends** rather than from where the camera happens to
//                     be mid-travel. Both, because they are set at different
//                     moments and a cancel that leaves either of them saying
//                     "close on" has left the reader looking at a door they
//                     abandoned.
//
//   focus kept        `document.activeElement`. A control must not take focus
//                     away from the person who just used it (CLAUDE.md §7), and
//                     a cancel is a moment where it is easy to: the door's
//                     control is `aria-disabled` for the length of the press, and
//                     anything that reached for the `disabled` property instead
//                     would blur it. Checked after the press rather than by
//                     watching where Tab goes next, because Chrome's
//                     sequential-focus-start hides how bad that is.
//
// Dark theme only, and for the same reason `spec/backlot-approach.test.ts`
// gives: none of this is a colour. The one pixel reading in the file is an exact
// match against a token the page resolves for itself, which is true in either.

import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { formatHex, serveBuild, Tab, type ColourScheme, type Raster } from "./lib/chrome.ts";
import { doorInto, roomNamed } from "./lib/backlot.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

const THEME: ColourScheme = "dark";

/** A door that leaves the backlot for a real page, and the one that opens a
 *  room instead. Taken from the manifest rather than named here: `kind` is the
 *  property that decides, and a door that changes kind should change what this
 *  walks. */
const PAGE_DOOR = backlotManifest.doors.find((door) => door.kind === "page")!;
// The door into the machine room by name. `kind === "room"` picked whichever
// room door comes first in nav order, which stopped being this one when the
// Lectures door started opening a corridor (spec/lib/backlot.ts).
const ROOM_DOOR = doorInto(roomNamed("machine-room"));
const roomHref = () => `${prefix}${ROOM_DOOR.id}/`;

/** How long after the press a prefetch may arrive and still be "at the moment of
 *  the press". The walk alone is a bit under two seconds, so this is generous by
 *  a factor of three and still nowhere near the navigation. */
const PRESS_WINDOW = 600;

/** And how far ahead of the address bar changing the prefetch has to be, so that
 *  it cannot be the navigation itself counted twice. The press takes about
 *  2,505 ms to reach the address bar; a second is well inside that and well
 *  outside any rounding. */
const AHEAD_OF_NAVIGATION = 1000;

/** How long to sit on the door's button after landing on it, before pressing.
 *  The camera's travel is 620 ms; this is that plus the clip starting. */
const ARRIVAL_SETTLE = 1600;

/** When Escape is pressed, measured from the press on the door. Mid-walk: the
 *  figure needs a bit under two seconds to reach a door from the middle of the
 *  ring, and the leaf's 420 ms comes after that. */
const CANCEL_AT = 900;

/** And how long to wait afterwards before believing the reader is still here.
 *  Comfortably past the 2,505 ms the press would have taken, so "it did not
 *  navigate" is a finding rather than impatience. */
const AFTER_CANCEL = 6000;


/** How many readings the envelope is taken over, at 300 ms apart — so about a
 *  second and a half, in which a walking figure covers most of a canvas. */
const STILL_READS = 4;

/** What this camera does to a circle lying on the floor: it takes none of a
 *  horizontal extent and cos 52 degrees of a depth, so a disc's bounding box
 *  comes out sin 52 degrees as tall as it is wide. The figure's accent ring is
 *  the only thing in the scene wearing the accent's exact value **and** that
 *  shape — the doors' plinths wear the colour and are upright boxes. */
const DISC_ASPECT = Math.sin((52 * Math.PI) / 180);

const pause = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds));

/** How many links of each rel-and-href the document currently carries.
 *
 *  **A count, not a set**, and that is not pedantry: the page already carries a
 *  `prefetch` of /studio/ before any door is pressed — something in the theme's
 *  own chrome puts it there for the status bar's link — so a set-difference
 *  credits the press with nothing when it adds a second identical one, and the
 *  check that forbids the room door from prefetching went green under an
 *  injection that made it prefetch. Counting says "there is one more of these
 *  than there was", which is the question. */
const census = (entries: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  return counts;
};

/** The entries `after` has more of than `before` did. */
const added = (before: Map<string, number>, after: string[]): string[] => {
  const now = census(after);
  const gained: string[] = [];
  for (const [entry, count] of now) {
    const was = before.get(entry) ?? 0;
    for (let extra = 0; extra < count - was; extra += 1) gained.push(entry);
  }
  return gained;
};

/** A nonce and an Escape counter, installed before anything the page runs.
 *
 *  **It is a reload sentinel, and that is the point of it rather than a side
 *  effect.** The nastiest instrument failure this round was a run that reported
 *  the figure jumping 134 px and then holding perfectly still for fourteen
 *  identical readings — not a bug and not the camera: the document had reloaded
 *  underneath the reading, and a freshly loaded hub with a pinned camera is
 *  perfectly still. The instrument's evidence that it had settled was strongest
 *  at the moment it was measuring the wrong page.
 *
 *  This script runs once per document, so the nonce changes and the count goes
 *  back to zero on any reload. Every reading below carries both, and the run is
 *  refused if they moved — "one Escape, in one document" is a thing that can be
 *  proved rather than assumed. */
const SENTINEL = `
  window.__backlotDoc = { id: Math.random().toString(36).slice(2), escapes: 0 };
  addEventListener("keydown", (event) => {
    if (event.key === "Escape") window.__backlotDoc.escapes += 1;
  }, true);
`;

const READY = String.raw`
  return (async () => {
    const deadline = performance.now() + 30000;
    while (performance.now() < deadline) {
      if (document.querySelector("[data-backlot-stage][data-backlot-ready]")) return "ready";
      await new Promise((done) => setTimeout(done, 50));
    }
    return "timed out";
  })();
`;

/** The status bar's link to the other stage, as a point to click.
 *
 *  Nothing here falls back. If the link is not on the page, or is not the link
 *  to the page we mean, the caller fails with the reason rather than reaching
 *  for `location.assign` — which would silently turn the journey into a
 *  different one with the same address bar. */
const LINK_TO = (wanted: string) => String.raw`
  const link = document.querySelector(".studio-status__away");
  if (!link) return { found: false, why: "the status bar has no link to the other stage" };
  const href = link.getAttribute("href") || "";
  if (!href.endsWith(${JSON.stringify(wanted)})) {
    return { found: false, why: "the status bar's link points at " + href + ", not " + ${JSON.stringify(wanted)} };
  }
  link.scrollIntoView({ block: "center" });
  const box = link.getBoundingClientRect();
  if (box.width < 4 || box.height < 4) {
    return { found: false, why: "the link measures " + Math.round(box.width) + "x" + Math.round(box.height) };
  }
  return {
    found: true,
    why: "",
    text: (link.textContent || "").replace(/\s+/g, " ").trim(),
    x: Math.round(box.left + box.width / 2),
    y: Math.round(box.top + box.height / 2),
  };
`;

interface Link {
  found: boolean;
  why: string;
  text?: string;
  x?: number;
  y?: number;
}

/** Put the keyboard on a door's own control and say whether it took.
 *
 *  `focus()` rather than a click, and then a real `Enter`, because that is the
 *  journey the accessibility of this thing rests on — and because a click leaves
 *  `document.activeElement` on `<body>`, which would make the focus assertion
 *  after the cancel vacuous. Headless Chrome defers focus events forever without
 *  `Emulation.setFocusEmulationEnabled`, which `Tab.launch` turns on; without it
 *  this would move activeElement and the engine's `focusin` would never run. */
const FOCUS_DOOR = (id: string) => String.raw`
  const button = document.querySelector('[data-backlot-hotspot="${id}"]');
  if (!button) return { found: false, why: "the HUD has no control for the ${id} door" };
  if (button.hidden) return { found: false, why: "the ${id} door's control is hidden" };
  button.focus();
  return {
    found: document.activeElement === button,
    why: document.activeElement === button ? "" : "focus() did not land on the control",
    text: (button.textContent || "").replace(/\s+/g, " ").trim(),
  };
`;

/** Everything the page says about where the reader is and what the camera is
 *  doing, in one read, so the three cannot be of three different frames. */
const STATE = String.raw`
  const hud = document.querySelector("[data-backlot-hud]");
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  const active = document.activeElement;
  const door = active instanceof HTMLElement ? active.dataset.backlotHotspot ?? "" : "";
  const doc = window.__backlotDoc ?? { id: "no sentinel", escapes: -1 };
  return {
    path: location.pathname,
    docId: doc.id,
    escapes: doc.escapes,
    framed: hud ? hud.dataset.backlotFramed ?? "" : "no hud",
    label: canvas ? canvas.getAttribute("aria-label") ?? "" : "no canvas",
    activeTag: active ? active.tagName.toLowerCase() : "none",
    activeDoor: door,
    ariaDisabled: active instanceof HTMLElement ? active.getAttribute("aria-disabled") ?? "" : "",
    live: (document.querySelector(".backlot-live")?.textContent ?? "").replace(/\s+/g, " ").trim(),
    prefetched: [...document.querySelectorAll("link")]
      .filter((link) => /prefetch|prerender|preload/.test(link.getAttribute("rel") || ""))
      .map((link) => (link.getAttribute("rel") || "") + " " + link.href),
  };
`;

interface State {
  path: string;
  /** The document this reading came from, and how many Escapes it has seen. */
  docId: string;
  escapes: number;
  framed: string;
  label: string;
  activeTag: string;
  activeDoor: string;
  ariaDisabled: string;
  live: string;
  prefetched: string[];
}

/** The canvas box, every visible button's box, and `--at-accent` as the page
 *  resolves it — composited over `--at-bg` the way `engine/colours.ts` does,
 *  because half this palette carries alpha and a translucent token has no colour
 *  of its own in a scene. */
const RING_SETUP = String.raw`
  const canvas = document.querySelector("[data-backlot-stage] canvas");
  if (!canvas) return null;
  const box = canvas.getBoundingClientRect();
  const declared = (value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    probe.style.position = "absolute";
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    document.body.append(probe);
    const read = getComputedStyle(probe).color;
    probe.remove();
    return read;
  };
  const surface = new OffscreenCanvas(1, 1);
  const ctx = surface.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = declared("var(--at-bg)");
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = declared("var(--at-accent)");
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return {
    canvas: {
      x: Math.round(box.left),
      y: Math.round(box.top),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
    // In canvas coordinates, which is the space the raster is in.
    buttons: [...document.querySelectorAll("[data-backlot-hud] button")]
      .filter((button) => !button.hidden && getComputedStyle(button).visibility === "visible")
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          left: rect.left - box.left,
          top: rect.top - box.top,
          right: rect.right - box.left,
          bottom: rect.bottom - box.top,
        };
      }),
    accent: [data[0], data[1], data[2]],
  };
`;

interface RingSetup {
  canvas: { x: number; y: number; width: number; height: number };
  buttons: { left: number; top: number; right: number; bottom: number }[];
  accent: [number, number, number];
}

/** Where the figure's ring is on the canvas, or null when it cannot be found.
 *
 *  Every visible control's own box is cut out first — the HUD's dots are painted
 *  `--at-accent` too, which is correct and is the collision this has to survive.
 *  A pixel is the ring only if it **equals** the resolved token exactly; an
 *  unlit fill takes no light, so anything else is a blend and is thrown away
 *  (CLAUDE.md §7's rule about refusing a sample rather than reporting it). */
async function ringAt(
  tab: Tab,
): Promise<{ x: number; y: number; pixels: number; parts: number; aspects: string } | { aspects: string }> {
  // Read every time, never cached. See the header: the controls are parked every
  // frame, and boxes read once are boxes of where the HUD used to be.
  const setup = await tab.evaluate<RingSetup | null>(RING_SETUP);
  if (!setup) return { aspects: "there is no canvas" };
  const raster = await tab.raster(setup.canvas);
  const hex = formatHex([setup.accent[0] / 255, setup.accent[1] / 255, setup.accent[2] / 255]);
  const covered = (x: number, y: number) =>
    setup.buttons.some((box) => x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2);

  const hits = new Set<number>();
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (formatHex(raster.at(x, y)) !== hex) continue;
      if (covered(x, y)) continue;
      hits.add(y * raster.width + x);
    }
  }
  if (hits.size === 0) return { aspects: "no pixel anywhere carries the accent's exact value" };

  // Connected components, over the matched pixels only — a few thousand of them,
  // so this is a walk of the set rather than of the canvas. Eight-connected,
  // because the ring is a thin band on a raked plane and a four-connected walk
  // breaks it into arcs.
  const seen = new Set<number>();
  const parts: { xs: number[]; ys: number[] }[] = [];
  for (const start of hits) {
    if (seen.has(start)) continue;
    const queue = [start];
    seen.add(start);
    const xs: number[] = [];
    const ys: number[] = [];
    while (queue.length) {
      const at = queue.pop()!;
      const x = at % raster.width;
      const y = (at - x) / raster.width;
      xs.push(x);
      ys.push(y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= raster.width || ny >= raster.height) continue;
          const next = ny * raster.width + nx;
          if (!hits.has(next) || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    parts.push({ xs, ys });
  }

  // The one shaped like a disc lying flat. `DISC_ASPECT` is what this camera
  // does to a circle on the floor and nothing else in the scene wearing this
  // colour is that shape; the tolerance is two pixels of height on the
  // component's own width, so it tightens as the thing gets bigger rather than
  // being a fraction somebody picked.
  const shaped = parts
    .map((part) => {
      const left = Math.min(...part.xs);
      const right = Math.max(...part.xs);
      const top = Math.min(...part.ys);
      const bottom = Math.max(...part.ys);
      const width = right - left + 1;
      const height = bottom - top + 1;
      return { part, width, height, aspect: height / width };
    })
    .filter((one) => one.width >= 6 && Math.abs(one.aspect - DISC_ASPECT) <= 2 / one.width);
  const aspects = parts.length
    ? parts
        .map((part) => {
          const width = Math.max(...part.xs) - Math.min(...part.xs) + 1;
          const height = Math.max(...part.ys) - Math.min(...part.ys) + 1;
          return `${part.xs.length}px ${width}x${height}`;
        })
        .join(", ")
    : "none";
  if (shaped.length === 0) return { aspects };
  const best = shaped.reduce((biggest, one) => (one.part.xs.length > biggest.part.xs.length ? one : biggest));
  const xs = best.part.xs;
  const ys = best.part.ys;
  return {
    x: xs.reduce((sum, one) => sum + one, 0) / xs.length,
    y: ys.reduce((sum, one) => sum + one, 0) / ys.length,
    pixels: xs.length,
    parts: parts.length,
    aspects,
  };
}

/** Whether anything in the scene is moving, and where the figure ended up.
 *
 *  **The assertion is whole-canvas identity under a pinned camera, not the
 *  ring's position**, and that is the third instrument this question has had.
 *  The first two both measured the figure by finding the accent ring and both
 *  were wrong in ways that produced confident numbers:
 *
 *    - the ring found by colour alone picked up the doors' plinths, which wear
 *      the same token **lit** — and a lit surface has no fixed value, so the
 *      fill light breathing +-12% on a 7.0 s period pushes plinth pixels across
 *      the token's exact value and swings the centroid 87.7 x / 62.7 y.
 *    - the ring found by colour **and shape** fixes that at 1920 and finds
 *      nothing at all at 390, where the band is under a pixel wide and
 *      antialiases away entirely — measured, the only components left are the
 *      plinths: 25x3, 3x25, 23x3, 1x23. The same thing the tower's light bar
 *      does at that size.
 *
 *  So the question is asked of the whole picture instead. With the camera pinned
 *  the hub has nothing in it that moves except the figure: the idle yaw and the
 *  fill light are the two things `prefers-reduced-motion` stops, no clip plays
 *  unless the camera is framed on a door, and the framing is gone by the time
 *  this runs. Four consecutive rasters that are **pixel-identical** is therefore
 *  "the figure has stopped", with no threshold in it at all — which is what a
 *  settled state should look like, and what the ring readings under a pinned
 *  camera already showed: identical to the tenth of a pixel across 11 seconds.
 *
 *  It is paired with a liveness reading taken **before** the pin, because a
 *  canvas that is identical because nothing is drawing it is the one way this
 *  could pass while being wrong. Unpinned, the idle camera guarantees two
 *  rasters differ; if they do not, the renderer has stopped and this says so
 *  rather than reporting a still figure. */
async function stillness(
  tab: Tab,
  theme: ColourScheme,
): Promise<{
  alive: number;
  still: boolean;
  diffs: number[];
  ring: string;
  restored: boolean;
}> {
  const canvasBox = async () =>
    tab.evaluate<{ x: number; y: number; width: number; height: number } | null>(`
      const canvas = document.querySelector("[data-backlot-stage] canvas");
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      return { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) };
    `);
  const differing = (one: Raster, two: Raster): number => {
    if (one.width !== two.width || one.height !== two.height) return one.width * one.height;
    let count = 0;
    for (let y = 0; y < one.height; y++) {
      for (let x = 0; x < one.width; x++) {
        const a = one.at(x, y);
        const b = two.at(x, y);
        if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) count += 1;
      }
    }
    return count;
  };

  const box = await canvasBox();
  if (!box) {
    // Not "nothing is drawing": there is no backlot here at all, which is a
    // different finding and belongs to the assertion about where the cancel
    // left the reader rather than to this one.
    const path = await tab.evaluate<string>("return location.pathname;");
    return { alive: 0, still: false, diffs: [], ring: `there is no backlot canvas on ${path}`, restored: false };
  }

  // Alive, before anything is pinned: the idle camera is running, so two rasters
  // taken half a second apart have to differ or nothing is drawing.
  const liveA = await tab.raster(box);
  await pause(500);
  const liveB = await tab.raster(box);
  const alive = differing(liveA, liveB);

  await tab.media({ colourScheme: theme, reducedMotion: true });
  // The camera's own travel back to level is 620 ms.
  await pause(1200);

  const diffs: number[] = [];
  let previous = await tab.raster(box);
  let agreed = 0;
  let still = false;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await pause(300);
    const now = await tab.raster(box);
    const moved = differing(previous, now);
    diffs.push(moved);
    previous = now;
    agreed = moved === 0 ? agreed + 1 : 0;
    if (agreed >= STILL_READS - 1) {
      still = true;
      break;
    }
  }

  // Where it stopped, recorded rather than asserted. The ring is the figure's
  // own unlit mark and its centroid is the clearest thing to put in a failure
  // message; at 390 it is under a pixel wide and this says so.
  const found = await ringAt(tab);
  const ring = "x" in found ? `(${found.x.toFixed(1)},${found.y.toFixed(1)}) from ${found.pixels}px` : found.aspects;

  await tab.media({ colourScheme: theme, reducedMotion: false });
  const restored =
    (await tab.evaluate<boolean>("return matchMedia('(prefers-reduced-motion: reduce)').matches;")) === false;
  return { alive, still, diffs, ring, restored };
}

interface Lap {
  viewport: string;
  /** Lap 1: the press prefetches, and arriving does not. */
  press: {
    /** Requests for the door's URL between landing on the control and pressing. */
    onArrival: number[];
    /** And after the press, as milliseconds since the press. */
    afterPress: number[];
    /** When the address bar actually changed, as milliseconds since the press. */
    navigatedAfter: number | null;
    /** The first `link[rel]` naming the target that turned up, and when. */
    link: { rel: string; after: number } | null;
    landedOn: string;
    control: string;
  } | null;
  /** Lap 2: Escape during the walk. */
  cancel: {
    /** How long after the press the Escape actually went out. */
    cancelledAfter: number;
    /** The page as it was the moment the Escape landed, so the reading taken
     *  later can be proved to be of the same document. */
    atCancel: State;
    state: State;
    still: { alive: number; still: boolean; diffs: number[]; ring: string; restored: boolean };
    /** Whether the pin put the page back the way it found it. */
    motionRestored: boolean;
    control: string;
  } | null;
  /** What the page already had in its head before the room door was pressed,
   *  recorded because it is surprising and belongs in a receipt: the theme's own
   *  chrome prefetches the status bar's link to /studio/ without anybody
   *  pressing anything. */
  headBefore: string[];
  /** Lap 3: the room door. */
  room: {
    requests: number[];
    /** Any link[rel~=prefetch] naming the room door's own URL, which is the
     *  half a network collector cannot see. */
    links: string[];
    mounted: boolean;
    showing: string[];
    control: string;
  } | null;
}

/** Every request for a path, as wall-clock milliseconds, from a collector the
 *  caller snapshots around the window it cares about. */
const requestsFor = (events: Record<string, unknown>[], from: number, path: string): number[] =>
  events
    .slice(from)
    .filter((event) => {
      const request = event.request as { url?: string } | undefined;
      return typeof request?.url === "string" && new URL(request.url).pathname === path;
    })
    .map((event) => (event.wallTime as number) * 1000);

async function walk(): Promise<Lap[]> {
  // **Served with a `max-age`, not with `no-store`.** Every other
  // browser-driven check here takes the default, and the default is right for
  // them: a budget measured against a warm cache is a measurement of this
  // machine. It is wrong for a prefetch, and wrong in the direction that makes
  // the check pass for the wrong reason — a response that says `no-store` can
  // never be reused by the navigation after it, so a prefetch served that way is
  // a request that happened and bought the reader nothing. GitHub Pages serves
  // with a `max-age`; a file about prefetching has to as well, or it is
  // measuring the harness.
  const site = await serveBuild("dist", base, "public, max-age=600");
  const tab = await Tab.launch();
  const laps: Lap[] = [];
  const pageTarget = `${prefix}${PAGE_DOOR.id}/`;
  const roomTarget = `${prefix}${ROOM_DOOR.id}/`;

  try {
    // `Network.enable`, which is what makes the collector below see anything.
    await tab.network(null);
    await tab.onNewDocument(SENTINEL);
    const events = tab.collect("Network.requestWillBeSent");

    /** Into the backlot the way a reader gets there: by clicking the status
     *  bar's own link on the other stage. Never by the address bar — with
     *  `Page.navigate` as the arrival the entry gets marked skippable and the
     *  browser's Back button becomes a no-op, which `spec/backlot-return.test.ts`
     *  measured on this build. It matters here because the press this file is
     *  about is a real navigation away from that entry. */
    const arrive = async (): Promise<void> => {
      await tab.goto(`${site.origin}${prefix}studio/`);
      await tab.evaluate(
        `try { localStorage.setItem("at-theme", ${JSON.stringify(THEME)}); } catch {} return null;`,
      );
      await tab.goto(`${site.origin}${prefix}studio/`);
      await tab.settle();
      const inbound = await tab.evaluate<Link>(LINK_TO("/backlot/"));
      if (!inbound.found) throw new Error(`cannot reach /backlot/ from /studio/ by clicking: ${inbound.why}`);
      await tab.click(inbound.x!, inbound.y!);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        if ((await tab.evaluate<string>("return location.pathname;")) === `${prefix}backlot/`) break;
        await pause(100);
      }
      const ready = await tab.evaluate<string>(READY);
      if (ready !== "ready") throw new Error("the backlot never reached data-backlot-ready after the click");
      await pause(900);
    };

    for (const viewport of VIEWPORTS) {
      const lap: Lap = { viewport: viewport.name, headBefore: [], press: null, cancel: null, room: null };
      await tab.viewport(viewport.width, viewport.height);
      // Motion **on**. See the header: under the preference the walk this file
      // is about does not exist.
      await tab.media({ colourScheme: THEME, reducedMotion: false });

      // ---- lap 1: the press prefetches, arriving does not ------------------
      {
        await arrive();
        const landed = await tab.evaluate<{ found: boolean; why: string; text?: string }>(FOCUS_DOOR(PAGE_DOOR.id));
        if (!landed.found) {
          throw new Error(`cannot put the keyboard on the ${PAGE_DOOR.label} door's control: ${landed.why}`);
        }
        const arrivalFrom = events.length;
        // Long enough for the camera to have come in and the clip to have
        // started: everything arriving at a door does, it does now, and none of
        // it is a press.
        await pause(ARRIVAL_SETTLE);
        const onArrival = requestsFor(events, arrivalFrom, pageTarget);

        const pressFrom = events.length;
        // What was already in the head before the press. **Links present are not
        // links added**, and the difference is a whole class of passing for the
        // wrong reason: a theme or a router that prefetches visible links would
        // put one here on arrival, and a check that reads the document's current
        // links would credit the press with it. Measured on the room-door lap,
        // where a `prefetch` of /studio/ was in the head on a clean build and
        // this check reported the press as having declared it.
        const already = census((await tab.evaluate<State>(STATE)).prefetched);
        const pressedAt = Date.now();
        await tab.press("Enter");

        let navigatedAfter: number | null = null;
        let link: { rel: string; after: number } | null = null;
        const deadline = pressedAt + 15_000;
        while (Date.now() < deadline) {
          const state = await tab.evaluate<State>(STATE);
          if (!link) {
            const named = added(already, state.prefetched).find((entry) => {
              try {
                return new URL(entry.split(" ")[1]!).pathname === pageTarget;
              } catch {
                return false;
              }
            });
            if (named) link = { rel: named.split(" ")[0]!, after: Date.now() - pressedAt };
          }
          if (state.path === pageTarget) {
            navigatedAfter = Date.now() - pressedAt;
            break;
          }
          await pause(50);
        }
        const landedOn = await tab.evaluate<string>(
          `const h = document.querySelector("main h1") ?? document.querySelector("h1");
           return (h ? h.textContent : "").replace(/\\s+/g, " ").trim();`,
        );
        lap.press = {
          onArrival: requestsFor(events, arrivalFrom, pageTarget).slice(0, onArrival.length),
          afterPress: requestsFor(events, pressFrom, pageTarget).map((at) => at - pressedAt),
          navigatedAfter,
          link,
          landedOn,
          control: landed.text ?? "",
        };
      }

      // ---- lap 2: Escape during the walk -----------------------------------
      {
        await arrive();
        const landed = await tab.evaluate<{ found: boolean; why: string; text?: string }>(FOCUS_DOOR(PAGE_DOOR.id));
        if (!landed.found) {
          throw new Error(`cannot put the keyboard on the ${PAGE_DOOR.label} door's control: ${landed.why}`);
        }
        await pause(ARRIVAL_SETTLE);
        const pressedAt = Date.now();
        await tab.press("Enter");
        // Mid-walk. **Not measured off the figure**, and that is a correction
        // rather than a convenience: focusing a door pushes the camera in on its
        // window at about 2x on the desktop and 5.5x on the phone, and from
        // inside that framing the figure in the middle of the ring is a long way
        // outside the shot. A ring-based reading there is either nothing or
        // something else — which is exactly what it was: with the HUD's boxes
        // read once it found a parked dot and called the walk finished.
        //
        // What proves the Escape landed during a walk is the walk's own length,
        // measured on the very same door at the very same viewport by the lap
        // above: the press takes about 2,465 ms to reach the address bar, and it
        // only spends that because `use()` awaits `walkTo` before it opens the
        // leaf. Escape at 900 ms is squarely inside it, and the assertion says
        // so against the measured number rather than against a constant.
        await pause(CANCEL_AT);
        await tab.press("Escape");
        const cancelledAfter = Date.now() - pressedAt;
        const atCancel = await tab.evaluate<State>(STATE);

        await pause(AFTER_CANCEL);
        // The camera is pinned inside `stillness`, after the cancel has already
        // happened, and put back afterwards. Pinning changes nothing about the
        // thing under test — `player.update` moves toward its goal whether or
        // not the preference is set, and only a `walkTo` called while it is set
        // arrives instantly — only the reading of it.
        const still = await stillness(tab, THEME);
        const state = await tab.evaluate<State>(STATE);
        const motionRestored = still.restored;
        lap.cancel = { cancelledAfter, atCancel, state, still, motionRestored, control: landed.text ?? "" };
      }

      // ---- lap 3: the door that opens a room -------------------------------
      {
        await arrive();
        const landed = await tab.evaluate<{ found: boolean; why: string; text?: string }>(FOCUS_DOOR(ROOM_DOOR.id));
        if (!landed.found) {
          throw new Error(`cannot put the keyboard on the ${ROOM_DOOR.label} door's control: ${landed.why}`);
        }
        await pause(ARRIVAL_SETTLE);
        const from = events.length;
        const already = census((await tab.evaluate<State>(STATE)).prefetched);
        lap.headBefore = [...already.entries()].map(([entry, count]) => `${count}x ${entry}`);
        const pressedAt = Date.now();
        await tab.press("Enter");
        let mounted = false;
        let showing: string[] = [];
        const links = new Set<string>();
        const deadline = pressedAt + 15_000;
        while (Date.now() < deadline) {
          // **Both halves, and the network half alone is not enough.** A
          // prefetch of a page the tab has already visited is answered out of
          // the cache and never reaches the wire — and this file serves with a
          // `max-age` on purpose, so that is exactly what happens to /studio/,
          // which every lap starts from. Measured: injecting the prefetch
          // unconditionally, so that the room door fetches a page too, left this
          // check **green at 30 of 30** while the link was plainly in the head.
          // The declaration is what the engine does; the request is what the
          // network does; only asking for both catches this one.
          for (const entry of added(already, (await tab.evaluate<State>(STATE)).prefetched)) {
            try {
              if (new URL(entry.split(" ")[1]!).pathname === roomTarget) links.add(entry);
            } catch {
              /* a link with an href nothing can parse is not a prefetch of ours */
            }
          }
          showing = await tab.evaluate<string[]>(
            `return [...document.querySelectorAll("[data-backlot-hud] button[data-backlot-hotspot]")]
               .filter((button) => !button.hidden)
               .map((button) => button.dataset.backlotHotspot);`,
          );
          if (showing.some((id) => id.startsWith("play-front-"))) {
            mounted = true;
            break;
          }
          await pause(100);
        }
        // A moment past the mount, so a prefetch fired late still turns up.
        await pause(1500);
        // And once more after the mount, so a link added late is not missed.
        for (const entry of added(already, (await tab.evaluate<State>(STATE)).prefetched)) {
          try {
            if (new URL(entry.split(" ")[1]!).pathname === roomTarget) links.add(entry);
          } catch {
            /* unparseable */
          }
        }
        lap.room = {
          requests: requestsFor(events, from, roomTarget).map((at) => at - pressedAt),
          links: [...links],
          mounted,
          showing,
          control: landed.text ?? "",
        };
      }

      laps.push(lap);
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return laps;
}

const laps = await walk();
const at = (viewport: string) => laps.find((lap) => lap.viewport === viewport);

// ---------------------------------------------------------------------------
// The floor: the journey happened at all
// ---------------------------------------------------------------------------
describe("the press was a press on a real control", () => {
  for (const viewport of VIEWPORTS) {
    it(`took every lap at ${viewport.name}`, () => {
      const lap = at(viewport.name);
      expect(lap, `the sweep never reached ${viewport.name}`).toBeDefined();
      expect(lap!.press, "the press lap did not run").not.toBeNull();
      expect(lap!.cancel, "the cancel lap did not run").not.toBeNull();
      expect(lap!.room, "the room-door lap did not run").not.toBeNull();
      expect(
        lap!.press!.control,
        `the control pressed at ${viewport.name} carries no name, so there is no evidence it was the ` +
          `${PAGE_DOOR.label} door's own button`,
      ).toContain(PAGE_DOOR.label);
    });

    it(`the press still navigates at ${viewport.name}, so the cancel lap means something`, () => {
      // Without this the cancel below could pass on a build where a door press
      // does nothing at all. Reported as the backlot's own cost rather than
      // asserted against a budget: Ray has kept the 2,505 ms on purpose.
      const press = at(viewport.name)!.press!;
      expect(
        press.navigatedAfter,
        `pressing "${press.control}" never reached ${prefix}${PAGE_DOOR.id}/ within 15 s, so either the press ` +
          `did not navigate or it went somewhere else`,
      ).not.toBeNull();
      expect(press.landedOn, "the page the door opened has no heading to identify it by").not.toBe("");
    });
  }
});

// ---------------------------------------------------------------------------
// 1. The prefetch happens on the press
// ---------------------------------------------------------------------------
//
// Seen red on the tree this file was written against — df44ec0, no injection —
// because nothing prefetches anything yet:
//
//   AssertionError: pressing "Open the Lectures door" fetched
//   /comp4020-ass2-Ray0766/lectures/ 0 times before the address bar changed at
//   2521 ms. The press is the moment the reader says where they are going, and
//   2,505 ms of walking is the room on the wire that buying it costs nothing.:
//   expected +0 to be greater than 0
//   (4 failed | 12 passed)
//
// And seen **green** under an injection that adds one, so this is two-sided:
// `use()`'s `hub.setOpen(...)` call in the built bundle preceded by a
// `<link rel="prefetch">` for `entry.door.href`, anchored on the `setOpen` call
// inside `use` rather than on `setOpen`, which the room's own code also calls.
describe("the door prefetches the page it opens, at the press", () => {
  for (const viewport of VIEWPORTS) {
    it(`fetches the target before it navigates, at ${viewport.name}`, () => {
      const press = at(viewport.name)!.press!;
      expect(
        press.afterPress.length,
        `pressing "${press.control}" fetched ${prefix}${PAGE_DOOR.id}/ ${press.afterPress.length} times ` +
          `before the address bar changed at ${press.navigatedAfter} ms. The press is the moment the reader ` +
          `says where they are going, and 2,505 ms of walking is the room on the wire that buying it costs ` +
          `nothing.`,
      ).toBeGreaterThan(0);

      const first = press.afterPress[0]!;
      expect(
        first,
        `the first request for ${prefix}${PAGE_DOOR.id}/ came ${first} ms after the press. "At the moment of ` +
          `the press" is the press, not the arrival at the door and not the navigation — the walk alone is ` +
          `most of two seconds.`,
      ).toBeLessThanOrEqual(PRESS_WINDOW);

      // And it is not the navigation counted twice. A document request that
      // happens to be the first one for this URL would satisfy the line above
      // and buy the reader nothing at all.
      expect(
        press.navigatedAfter! - first,
        `the first request for ${prefix}${PAGE_DOOR.id}/ came ${first} ms after the press and the address ` +
          `bar changed at ${press.navigatedAfter} ms — ${press.navigatedAfter! - first} ms apart. That is ` +
          `the navigation's own request, not a prefetch: a prefetch that arrives with the navigation has ` +
          `bought nothing.`,
      ).toBeGreaterThanOrEqual(AHEAD_OF_NAVIGATION);
    });

    it(`does not fetch it merely because the reader arrived, at ${viewport.name}`, () => {
      const press = at(viewport.name)!.press!;
      expect(
        press.onArrival,
        `landing on "${press.control}" fetched ${prefix}${PAGE_DOOR.id}/ ${press.onArrival.length} time(s) ` +
          `before anything was pressed. Arriving at a door frames it and starts its clip; it is not somebody ` +
          `saying they are going through it, and every reader who Tabs past six doors would pay for six ` +
          `pages.`,
      ).toEqual([]);
    });

    it(`says how it prefetched, at ${viewport.name}`, () => {
      // Recorded rather than legislated: which tag or call does it is the
      // engine's business. What this refuses to do is report a passing prefetch
      // with nothing in the page to show for it — if the request happened and no
      // declaration did, the receipt should say so out loud rather than leave
      // the next reader guessing at the mechanism.
      const press = at(viewport.name)!.press!;
      expect(press.afterPress.length, "no prefetch to describe").toBeGreaterThan(0);
      expect(
        press.link,
        `a request for ${prefix}${PAGE_DOOR.id}/ went out ${press.afterPress[0]} ms after the press, but no ` +
          `link[rel~=prefetch] naming it ever appeared in the document. The request is what counts and it ` +
          `happened; this is the evidence of how, and a prefetch nothing in the page declares is one nobody ` +
          `after you can find.`,
      ).not.toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// 2. And not for the door that opens a room
// ---------------------------------------------------------------------------
//
// Green on the current tree, which is worth nothing on its own — nothing
// prefetches anything yet, so a zero here is a zero about nothing. **Seen red**
// by injecting the prefetch unconditionally, which is the mistake this guards:
// the same `<link rel="prefetch">` added in `use()` before the `kind === "room"`
// branch rather than after it, so every door fetches a page and the one that
// opens a room fetches a page nobody will ever be sent to:
//
//   AssertionError: pressing "Open the Studio door into the machine room"
//   fetched /comp4020-ass2-Ray0766/studio/ at 12 ms after the press. That door
//   opens a room built in the browser; there is no document to fetch and the
//   request is one nobody will ever use.: expected [ 12 ] to deeply equal []
//   (2 failed | 14 passed)
describe("the door that opens a room prefetches nothing", () => {
  for (const viewport of VIEWPORTS) {
    it(`opened the room rather than a page, at ${viewport.name}`, () => {
      // The pairing that stops the zero below being a zero about nothing: a lap
      // where the press did not happen would prefetch nothing either.
      const room = at(viewport.name)!.room!;
      expect(
        room.mounted,
        `pressing "${room.control}" never brought the machine room up at ${viewport.name}, so a zero count ` +
          `of prefetches says nothing about the room door. The HUD was showing: ${room.showing.join(", ")}.`,
      ).toBe(true);
    });

    it(`declared no prefetch for it, at ${viewport.name}`, () => {
      const room = at(viewport.name)!.room!;
      expect(
        room.links,
        `pressing "${room.control}" put ${room.links.join(", ")} in the document. That door opens a room ` +
          `built in the browser; there is no document to fetch and the link is a promise nobody will ever ` +
          `collect on.`,
      ).toEqual([]);
    });

    it(`fetched nothing for it, at ${viewport.name}`, () => {
      const room = at(viewport.name)!.room!;
      expect(
        room.requests,
        `pressing "${room.control}" fetched ${roomHref()} at ${room.requests.join(", ")} ms after the press. ` +
          `That door opens a room built in the browser; there is no document to fetch and the request is one ` +
          `nobody will ever use.`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Escape during the walk cancels it
// ---------------------------------------------------------------------------
//
// Seen red on the tree this file was written against — df44ec0, no injection —
// because Escape during a door's walk does not cancel anything today. The first
// Escape is taken by `releaseFraming`, which returns true because the press
// framed the door, so `escape()` returns before it reaches the `generation`
// bump; `use()` comes back from the walk with the generation it started with and
// navigates:
//
//   AssertionError: Escape was pressed 900 ms into the walk and the reader
//   ended up on /comp4020-ass2-Ray0766/lectures/ anyway. A cancel that arrives
//   is not a cancel.: expected '/comp4020-ass2-Ray0766/lectures/' to be
//   '/comp4020-ass2-Ray0766/backlot/'
//   (6 failed | 10 passed)
//
// And seen **green** under an injection that cancels: `escape()` in the built
// bundle with the `generation` bump and the door's own release hoisted above the
// `releaseFraming` early return, anchored inside `escape` on the
// `walkTo(...middle)` call rather than on `generation`, which the input handler
// also bumps.
//
// The three things asserted are three different ways a cancel can be wrong, and
// only the first of them is about the address bar.
describe("Escape during the walk cancels it", () => {
  for (const viewport of VIEWPORTS) {
    it(`was pressed while the figure was still walking, at ${viewport.name}`, () => {
      // The floor. A cancel tested after the walk finished is a test of
      // something else, and this repo has shipped a check that could not go red
      // for exactly that shape of reason. The comparison is against the same
      // door's own measured press-to-address-bar time at the same viewport, so
      // it stays true if the walk is ever re-timed.
      const lap = at(viewport.name)!;
      const runway = lap.press!.navigatedAfter;
      expect(runway, "the press lap never navigated, so there is no runway to place the Escape inside").not.toBeNull();
      expect(
        lap.cancel!.cancelledAfter,
        `Escape went out ${lap.cancel!.cancelledAfter} ms after the press, and the same press on the same ` +
          `door at this viewport takes ${runway} ms to reach the address bar — so the cancel did not land ` +
          `inside the walk and this lap is not about cancelling one. \`use()\` spends that time awaiting ` +
          `walkTo before it opens the leaf.`,
      ).toBeLessThan(runway! - 400);
    });

    it(`leaves the reader on the backlot, at ${viewport.name}`, () => {
      const cancel = at(viewport.name)!.cancel!;
      expect(
        cancel.state.path,
        `Escape was pressed ${CANCEL_AT} ms into the walk and the reader ended up on ${cancel.state.path} ` +
          `anyway. A cancel that arrives is not a cancel.`,
      ).toBe(`${prefix}backlot/`);
    });

    it(`stops the figure rather than leaving it mid-stride, at ${viewport.name}`, () => {
      const cancel = at(viewport.name)!.cancel!;
      // The scene was drawing before it was pinned. A canvas that holds still
      // because nothing is rendering it is the one way the assertion below could
      // pass while being wrong, and it is the reading this repo has been caught
      // by twice — a reduced-motion check once screenshotted two identical
      // frames four seconds apart and both were blown out to white.
      expect(
        cancel.still.alive,
        `two rasters of the hub half a second apart with the idle camera **running** differ by ` +
          `${cancel.still.alive} pixels at ${viewport.name}, on ${cancel.state.path} — ${cancel.still.ring}. ` +
          `The idle yaw has a 28.6 s period and the fill light a 7.0 s one, so an unpinned hub cannot be ` +
          `identical: either nothing is drawing, or the reader is not on the backlot at all — and if it is ` +
          `the second, read the assertion about where the cancel left them first.`,
      ).toBeGreaterThan(0);
      expect(
        cancel.still.still,
        `${AFTER_CANCEL} ms after the cancel, with the camera pinned, consecutive rasters of the hub still ` +
          `differ at ${viewport.name}, on ${cancel.state.path}: ${cancel.still.diffs.join(", ")} pixels ` +
          `between each pair, needing ${STILL_READS - 1} zeroes in a row. The figure is the only thing left ` +
          `moving under the preference, and it is still walking. It was last seen at ${cancel.still.ring}.`,
      ).toBe(true);
    });

    it(`read one document, and read it after exactly one Escape, at ${viewport.name}`, () => {
      // The floor under every reading in this lap. A document that reloaded
      // under the instrument reads as a figure that teleported and then held
      // perfectly still — which is the strongest evidence of stillness this
      // check can produce and the moment it is measuring the wrong page.
      const cancel = at(viewport.name)!.cancel!;
      expect(
        cancel.atCancel.escapes,
        `the page counted ${cancel.atCancel.escapes} Escape(s) at the moment of the cancel at ` +
          `${viewport.name}. The sentinel installs one counter per document, so anything but 1 is either a ` +
          `key that did not reach the page or a document that is not the one the press happened in.`,
      ).toBe(1);
      expect(
        cancel.state.docId,
        `the reading taken ${AFTER_CANCEL} ms after the cancel came from document ${cancel.state.docId} and ` +
          `the cancel happened in ${cancel.atCancel.docId}. The page reloaded underneath the instrument, and ` +
          `a freshly loaded hub under a pinned camera is perfectly still — which is exactly the answer this ` +
          `would otherwise have reported.`,
      ).toBe(cancel.atCancel.docId);
      expect(cancel.state.escapes, "the Escape count moved after the cancel").toBe(cancel.atCancel.escapes);
    });

    it(`read the figure with the camera pinned, and put the camera back, at ${viewport.name}`, () => {
      // The instrument's own honesty, asserted rather than described. A probe
      // that changes the page and leaves it changed makes every reading after it
      // a reading of something else — this repo has already had a theme flip do
      // exactly that to a room's brightness table.
      const cancel = at(viewport.name)!.cancel!;
      expect(
        cancel.motionRestored,
        `prefers-reduced-motion was switched on to read where the figure stopped at ${viewport.name} and was ` +
          `not switched back off afterwards`,
      ).toBe(true);
    });

    it(`is not left framed on the door it abandoned, at ${viewport.name}`, () => {
      const cancel = at(viewport.name)!.cancel!;
      expect(
        cancel.state.framed,
        `the HUD still carries data-backlot-framed="${cancel.state.framed}" after the cancel, so the camera ` +
          `is still close on the door the reader just backed out of. The reader is on ${cancel.state.path}` +
          `${cancel.state.path === `${prefix}backlot/` ? "" : ", which is not the backlot at all — read the " +
            "assertion about where the cancel left them first"}.`,
      ).toBe("");
      expect(
        cancel.state.label,
        `the canvas still says "${cancel.state.label}" after the cancel, on ${cancel.state.path}. ` +
          `describeCanvas() writes the state the engine intends, so a sentence with "close on" in it is the ` +
          `engine intending to be at a door nobody is going to.`,
      ).not.toMatch(/close on|come in close/);
    });

    it(`leaves the keyboard on the control that was pressed, at ${viewport.name}`, () => {
      const cancel = at(viewport.name)!.cancel!;
      expect(
        cancel.state.activeDoor,
        `after the cancel the keyboard is on <${cancel.state.activeTag}> on ${cancel.state.path} rather than ` +
          `on the ${PAGE_DOOR.label} door's own control. A control must not take focus away from the person ` +
          `who just used it (CLAUDE.md §7), and a cancel is exactly the moment it is easy to.`,
      ).toBe(PAGE_DOOR.id);
      expect(
        cancel.state.ariaDisabled,
        `the control is still aria-disabled="${cancel.state.ariaDisabled}" after the cancel, so the reader ` +
          `has been left standing on a button they can no longer press`,
      ).not.toBe("true");
    });
  }
});

// ---------------------------------------------------------------------------
// The sweep measured something
// ---------------------------------------------------------------------------
describe("the sweep measured something", () => {
  it("drove both viewports", () => {
    expect(laps.map((lap) => lap.viewport)).toEqual(VIEWPORTS.map((viewport) => viewport.name));
  });

  it("watched the hub actually move before it asked whether it had stopped", () => {
    // The pairing that stops "identical rasters" being a statement about a dead
    // canvas, said once over the whole sweep rather than only inside the
    // per-viewport assertion, so a lap that never took the liveness reading at
    // all is caught too.
    for (const lap of laps) {
      expect(
        lap.cancel!.still.alive,
        `the sweep never saw the hub move at ${lap.viewport}, so every "identical" reading below it is a ` +
          `reading of a canvas nothing is drawing`,
      ).toBeGreaterThan(0);
      expect(
        lap.cancel!.still.diffs.length,
        `the sweep took no raster pairs at ${lap.viewport}, so it never asked the question`,
      ).toBeGreaterThan(0);
    }
  });
});
