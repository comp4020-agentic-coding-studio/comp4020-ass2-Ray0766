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

interface Parked {
  spec: HotspotSpec;
  handle: Hotspot;
  button: HTMLButtonElement;
  /** Belongs to a room rather than to the hub. */
  scoped: boolean;
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

  function register(spec: HotspotSpec): Hotspot {
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
    api: { register } satisfies HotspotApi,

    announce: announcer,

    park(width, height) {
      if (width <= 0 || height <= 0) return;
      placed.length = 0;
      for (const entry of parked) {
        if (entry.button.hidden) continue;

        projected.copy(entry.spec.position).project(camera);
        const behind = projected.z > 1 || projected.z < -1;
        const rawX = (projected.x * 0.5 + 0.5) * width;
        const rawY = (-projected.y * 0.5 + 0.5) * height;
        let x = Math.min(Math.max(rawX, EDGE_INSET), width - EDGE_INSET);
        let y = Math.min(Math.max(rawY, EDGE_INSET), height - EDGE_INSET);
        const clamped = x !== rawX || y !== rawY || behind;

        if (entry.width === 0) {
          const box = entry.button.getBoundingClientRect();
          entry.width = box.width;
          entry.height = box.height;
        }

        // Five frames in a row on a wall put five labels in the same 600 px,
        // and five overlapping labels are none. So: parked over the thing it
        // acts on, and pushed straight down only far enough to stop being
        // covered by one already placed. Registration order wins, which makes
        // the arrangement stable from frame to frame rather than a shuffle.
        for (let attempt = 0; attempt < 8; attempt++) {
          const clash = placed.find(
            (other) =>
              Math.abs(other.x - x) < (other.width + entry.width) / 2 + GAP &&
              Math.abs(other.y - y) < (other.height + entry.height) / 2 + GAP,
          );
          if (!clash) break;
          y = clash.y + (clash.height + entry.height) / 2 + GAP;
        }
        y = Math.min(y, height - EDGE_INSET);
        placed.push({ x, y, width: entry.width, height: entry.height });

        const roundedX = Math.round(x);
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
        if (clamped) entry.button.dataset.backlotEdge = "true";
        else delete entry.button.dataset.backlotEdge;
      }
    },

    remeasure() {
      for (const entry of parked) entry.width = 0;
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
