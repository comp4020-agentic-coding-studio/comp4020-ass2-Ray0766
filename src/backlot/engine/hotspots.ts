// The hotspots: real buttons in the HUD, parked over the things they act on.
//
// This is the interface, not a label on top of one. Every door and every piece
// is a `<button>` in registration order, which is Tab order, and the canvas is
// how those buttons look. There is no keyboard-only second path through the
// backlot to fall out of step with the mouse one, because there is no mouse-only
// path either: a click, an Enter and a walk all end up in the same `activate`.
//
// Two rules from CLAUDE.md §7 are load-bearing here and neither is optional:
//
//   - A control must not take focus away from the person who just used it. So
//     `setEnabled(false)` writes `aria-disabled` and arms a guard; it never
//     writes the `disabled` property, which blurs the element it is set on and
//     drops `document.activeElement` to `<body>`.
//   - The list is never re-rendered. Registration appends; leaving a room
//     removes only what that room added, after focus has been moved somewhere
//     deliberate.
import { Vector3, type OrthographicCamera } from "three";
import type { Hotspot, HotspotApi, HotspotSpec } from "./types";

/** What the deck needs from the engine that it cannot do itself. */
export interface HotspotHooks {
  /** Run before `activate()` for a hotspot carrying a `focus`, and awaited, so
   *  the camera is already on the thing by the time the hotspot acts. This is
   *  the whole of what makes Enter equivalent to walking up to something. */
  frame(spec: HotspotSpec): Promise<void>;
}

/** Keep a parked button this far inside the canvas, so one at the edge of the
 *  frame is still a whole button and its focus ring is still on screen. */
const EDGE_INSET = 14;
/** Clear space kept between two parked buttons before one is pushed down. */
const GAP = 4;
/** Roughly what a hotspot measures once its label has come down to the dot.
 *  Only used to keep two dots off each other, so it does not have to be exact. */
const DOT_BOX = 30;

interface Parked {
  spec: HotspotSpec;
  handle: Hotspot;
  button: HTMLButtonElement;
  /** Belongs to a room rather than to the hub. */
  scoped: boolean;
  /** Registered by the engine into the room's scope rather than by the room.
   *  It is a control the room gets for free, not a thing the room contains. */
  own: boolean;
  near: boolean;
  enabled: boolean;
  busy: boolean;
  x: number;
  y: number;
  /** Cached box, so parking does not force a layout read every frame. */
  width: number;
  height: number;
}

export interface HotspotDeck {
  api: HotspotApi;
  /** Register something the engine owns into the current scope. It behaves like
   *  any other hotspot except that `scopedBounds` does not count it: the way out
   *  is placed at a point the engine picked, so letting it into the room's
   *  extent would be the engine measuring itself. */
  registerOwn(spec: HotspotSpec): Hotspot;
  /** One polite sentence. Re-announced even when the words repeat. */
  announce(message: string): void;
  /** Park every button over its point, in canvas pixels. Called each frame. */
  park(width: number, height: number): void;
  /** Fire the proximity transitions for where the figure is now.
   *
   *  `seed` records the near/far state and fires **nothing** — no announcement
   *  and no `onProximity`. That is what a freshly mounted room needs. Every
   *  hotspot starts `near: false`, so the first tracked frame after a room is
   *  built reads as an arrival at whatever the engine happened to put the
   *  figure down beside, and the room acts on it: the machine room's desk
   *  hotspot frames the camera on its proximity, so entering the room used to
   *  land the reader nose-first on the monitor having never seen the room.
   *  Establishing the initial state is not a transition, and only transitions
   *  are events. */
  track(position: Vector3, seed?: boolean): void;
  /** Throw away the cached button boxes. The labels re-measure on the next
   *  park — needed when the CSS that sizes them changes, which is what a
   *  viewport crossing the phone breakpoint does. */
  remeasure(): void;
  locate(id: string): Vector3 | null;
  /** The extent of everything **the room itself** registered, or null when the
   *  room has registered nothing. This is what a room says is worth reaching, so
   *  it is what its resting view is composed around — and it is why the engine's
   *  own way-out hotspot is excluded. That one is parked at a point the engine
   *  chose, 5.6 m back, well outside any room; counting it pinned the near edge
   *  of every composition to the back wall and made the clamp that reads this
   *  dead on every room, always. Found by the rooms owner, who moved their
   *  furthest hotspot 2.9 m and got byte-identical output both times. */
  scopedBounds(): { min: Vector3; max: Vector3 } | null;
  buttonFor(id: string): HTMLButtonElement | null;
  /** Everything registered after this belongs to the room, and goes when it does. */
  beginScope(): void;
  endScope(): void;
  /** Hide the hub's buttons while a room is mounted: Tab must not reach a door
   *  that is not on screen. Called only after focus has been moved. */
  setBaseHidden(hidden: boolean): void;
  dispose(): void;
}

export function createHotspots(hud: HTMLElement, camera: OrthographicCamera, hooks: HotspotHooks): HotspotDeck {
  const live = document.createElement("p");
  live.className = "backlot-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  hud.append(live);

  const parked: Parked[] = [];
  /** Boxes already placed this frame, for the de-collision pass in `park`. */
  const placed: { x: number; y: number; width: number; height: number }[] = [];
  const projected = new Vector3();
  let scoping = false;
  let liveTimer = 0;

  function announcer(message: string): void {
    // A live region only speaks when its contents change, so the same sentence
    // twice in a row has to be emptied before it is set again.
    window.clearTimeout(liveTimer);
    live.textContent = "";
    liveTimer = window.setTimeout(() => {
      live.textContent = message;
    }, 40);
  }

  function apply(entry: Parked): void {
    entry.button.setAttribute("aria-disabled", entry.enabled ? "false" : "true");
  }

  function register(spec: HotspotSpec, own = false): Hotspot {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "backlot-hotspot";
    button.dataset.backlotHotspot = spec.id;

    const dot = document.createElement("span");
    dot.className = "backlot-hotspot__dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "backlot-hotspot__label";
    label.textContent = spec.label;

    button.append(dot, label);
    hud.append(button);

    const entry: Parked = {
      spec,
      button,
      scoped: scoping,
      own,
      near: false,
      enabled: true,
      busy: false,
      x: Number.NaN,
      y: Number.NaN,
      width: 0,
      height: 0,
      handle: {
        id: spec.id,
        button,
        setLabel(next) {
          label.textContent = next;
          entry.width = 0;
        },
        setEnabled(enabled) {
          entry.enabled = enabled;
          apply(entry);
        },
        dispose() {
          const at = parked.indexOf(entry);
          if (at >= 0) parked.splice(at, 1);
          button.remove();
        },
      },
    };

    button.addEventListener("click", (event) => {
      event.preventDefault();
      // aria-disabled does not stop a click the way `disabled` would — that is
      // the whole point of using it — so the guard is here, in code. It now
      // spans the framing as well as the activation, which is what it is for:
      // a second Enter while the camera is still travelling does nothing.
      if (!entry.enabled || entry.busy) return;
      entry.busy = true;
      void (async () => {
        try {
          if (spec.focus) await hooks.frame(spec);
          spec.activate();
        } catch (error) {
          console.warn(`backlot: ${spec.id} threw on activation`, error);
        } finally {
          entry.busy = false;
        }
      })();
    });

    parked.push(entry);
    apply(entry);
    return entry.handle;
  }

  return {
    api: { register: (spec) => register(spec) } satisfies HotspotApi,

    registerOwn(spec) {
      return register(spec, true);
    },

    announce: announcer,

    park(width, height) {
      if (width <= 0 || height <= 0) return;
      placed.length = 0;

      // Project everything first: where a label can go depends on where its
      // neighbours are, so nothing can be decided one button at a time.
      const live: { entry: Parked; x: number; y: number; clamped: boolean }[] = [];
      for (const entry of parked) {
        if (entry.button.hidden) continue;
        projected.copy(entry.spec.position).project(camera);
        const behind = projected.z > 1 || projected.z < -1;
        const rawX = (projected.x * 0.5 + 0.5) * width;
        const rawY = (-projected.y * 0.5 + 0.5) * height;
        const x = Math.min(Math.max(rawX, EDGE_INSET), width - EDGE_INSET);
        const y = Math.min(Math.max(rawY, EDGE_INSET), height - EDGE_INSET);
        if (entry.width === 0) {
          // Measured with the label showing, and kept. A dense button's own box
          // is the dot, so re-measuring one would read the wrong number and the
          // decision below would flip-flop frame to frame.
          const box = entry.button.getBoundingClientRect();
          entry.width = box.width;
          entry.height = box.height;
        }
        live.push({ entry, x, y, clamped: x !== rawX || y !== rawY || behind });
      }

      // A label that covers the thing it names is worse than no label on the
      // canvas at all: five clips in a row on a wall are 143 px wide at
      // 1920x1080 and their labels are up to 320, so laying them out at all
      // means laying them across the artwork. Where the anchors are closer
      // together than the labels are wide, the labels come down to their dot
      // and come back on hover or focus. The dot still marks the thing, the
      // accessible name never changes, and the gallery has every caption in
      // text regardless.
      //
      // The test is the distance between anchors against the *labelled* widths,
      // never against what is currently rendered — a button that is already
      // dense measures narrow, which would un-dense it, which would widen it
      // again. Deciding from a quantity the decision cannot change is what
      // makes this hold still.
      for (const one of live) {
        const crowded = live.some(
          (other) =>
            other !== one &&
            Math.abs(other.x - one.x) < (other.entry.width + one.entry.width) / 2 + GAP &&
            Math.abs(other.y - one.y) < (other.entry.height + one.entry.height) / 2 + GAP,
        );
        if (crowded) one.entry.button.dataset.backlotDense = "true";
        else delete one.entry.button.dataset.backlotDense;
      }

      for (const one of live) {
        const { entry } = one;
        const dense = entry.button.dataset.backlotDense === "true";
        const boxWidth = dense ? DOT_BOX : entry.width;
        const boxHeight = dense ? DOT_BOX : entry.height;
        let y = one.y;
        // Whatever is left after the labels have come down — two dots on top of
        // each other — still gets nudged apart, downwards, in registration
        // order so the arrangement is stable rather than a shuffle.
        for (let attempt = 0; attempt < 8; attempt++) {
          const clash = placed.find(
            (other) =>
              Math.abs(other.x - one.x) < (other.width + boxWidth) / 2 + GAP &&
              Math.abs(other.y - y) < (other.height + boxHeight) / 2 + GAP,
          );
          if (!clash) break;
          y = clash.y + (clash.height + boxHeight) / 2 + GAP;
        }
        y = Math.min(y, height - EDGE_INSET);
        placed.push({ x: one.x, y, width: boxWidth, height: boxHeight });

        const roundedX = Math.round(one.x);
        const roundedY = Math.round(y);
        if (roundedX !== entry.x || roundedY !== entry.y) {
          entry.x = roundedX;
          entry.y = roundedY;
          // Numbers inline, styling in the stylesheet: the only thing that can
          // live in JS here is the projected coordinate, and it is handed over
          // as a custom property so backlot-hud.css still owns the transform.
          entry.button.style.setProperty("--backlot-x", `${roundedX}px`);
          entry.button.style.setProperty("--backlot-y", `${roundedY}px`);
        }
        // Off the edge of the frame is a styling state, never a removal: a
        // button that leaves the tab order because the camera moved is a
        // control that disappeared under the reader's hand.
        if (one.clamped) entry.button.dataset.backlotEdge = "true";
        else delete entry.button.dataset.backlotEdge;
      }
    },

    remeasure() {
      for (const entry of parked) {
        // The label has to be showing to be measured, so the dense state comes
        // off first and the next park decides it again from scratch.
        delete entry.button.dataset.backlotDense;
        entry.width = 0;
      }
    },

    track(position, seed = false) {
      for (const entry of parked) {
        const radius = entry.spec.radius;
        // A hidden button is not on screen, so its threshold is not a place the
        // reader can be standing in: while a room is mounted the hub's doors
        // must not go on firing proximity at a figure that is inside the room.
        if (radius === undefined || entry.button.hidden) continue;
        // Ground distance, not the straight line. A hotspot's position is where
        // its button is parked, which for a door is up at head height on the
        // leaf; measuring in three dimensions from there put the figure 2.2 m
        // from a door it was standing in, and a walk could never arrive.
        const alongX = entry.spec.position.x - position.x;
        const alongZ = entry.spec.position.z - position.z;
        const near = Math.hypot(alongX, alongZ) <= radius;
        if (near === entry.near) continue;
        entry.near = near;
        entry.button.dataset.backlotNear = near ? "true" : "false";
        if (seed) continue;
        if (near && entry.spec.arrival) announcer(entry.spec.arrival);
        entry.spec.onProximity?.(near);
      }
    },

    locate(id) {
      return parked.find((entry) => entry.spec.id === id)?.spec.position ?? null;
    },

    scopedBounds() {
      const marks = parked.filter((entry) => entry.scoped && !entry.own);
      if (marks.length === 0) return null;
      const min = marks[0]!.spec.position.clone();
      const max = min.clone();
      for (const entry of marks) {
        min.min(entry.spec.position);
        max.max(entry.spec.position);
      }
      return { min, max };
    },

    buttonFor(id) {
      return parked.find((entry) => entry.spec.id === id)?.button ?? null;
    },

    beginScope() {
      scoping = true;
    },

    endScope() {
      scoping = false;
      for (const entry of [...parked]) if (entry.scoped) entry.handle.dispose();
    },

    setBaseHidden(hidden) {
      for (const entry of parked) if (!entry.scoped) entry.button.hidden = hidden;
    },

    dispose() {
      window.clearTimeout(liveTimer);
      for (const entry of [...parked]) entry.handle.dispose();
      live.remove();
    },
  };
}
