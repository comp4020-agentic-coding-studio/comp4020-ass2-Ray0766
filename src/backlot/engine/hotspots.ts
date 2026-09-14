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
import { Box3, Vector3, type Object3D, type OrthographicCamera } from "three";
import type { Hotspot, HotspotApi, HotspotSpec } from "./types";

/** What the deck needs from the engine that it cannot do itself. */
export interface HotspotHooks {
  /**
   * Bring the camera onto this hotspot.
   *
   * Called from three places, and that is the point rather than a convenience:
   * a click, **the keyboard landing on the button**, and the figure walking up.
   * Arriving is one event as far as the camera is concerned, so a reader who
   * Tabs to a door gets the same thing a reader who walks to it gets, rather
   * than being told about it. `HotspotSpec.focus` says the same.
   *
   * **It used to be awaited before `activate()` and is not any more.** A press
   * is not an arrival — it is somebody saying where they are going — and
   * queueing the going behind 620 ms of camera spends their press on a shot
   * they are about to leave. The framing still starts, because the camera
   * should be doing the right thing while the figure walks to the door; it just
   * no longer stands in front of the thing the reader actually asked for.
   * Measured: 3.1 s from press to the address bar changing, against 2.5 s with
   * the wait taken out and against A2's 2.5 s before any of this existed.
   */
  frame(spec: HotspotSpec): Promise<void>;
  /**
   * And leaving. Tabbing off a hotspot is the keyboard's version of walking
   * away from it, so it releases the same framing.
   *
   * The engine ignores it for anything that is not the hotspot currently framed,
   * which is what stops a blur that fires *after* the next button's focus —
   * which is the order the DOM actually delivers them in — tearing down a
   * framing that has just been set up.
   */
  unframe(spec: HotspotSpec): void;
}

/** Keep a parked button this far inside the canvas, so one at the edge of the
 *  frame is still a whole button and its focus ring is still on screen. The
 *  clamp is on the button's **box**, not on its centre: clamping the centre let
 *  a 154 px control hang 63 px off the side of the canvas, which is a control
 *  half outside the picture it belongs to. */
const EDGE_INSET = 12;
/** Clear space kept between two parked buttons before one is pushed down. */
const GAP = 4;
/** A first guess at what a hotspot measures once its label has come down to the
 *  dot, used only until the real one has been read.
 *
 *  It used to be the number, with a comment saying it did not have to be exact
 *  because it only kept two dots off each other. That stopped being true when
 *  the keep-out started using it: at 390 the phone rule gives a control a 44 px
 *  minimum target and it renders 50 x 50, so clearing a 30 x 30 box left 10 px
 *  of control hanging over the thing it was supposed to clear on every side —
 *  the monitor's panel measured 35.3% covered by its own button while the five
 *  beside it reached 0.0%. The real box is measured now; this is the seed. */
const DOT_BOX = 30;

/**
 * How much better a new placement has to be before a parked button moves to it.
 *
 * Without this the keep-out picks the nearest clear spot every frame, and where
 * two spots are near enough in cost the idle camera's sub-pixel drift decides
 * between them — so a control alternates between two placements several times a
 * second. Measured in the machine room: `play-front-t1` flipping 216 px on y,
 * `play-front-t3` 205 px on x, `read-graph` 91 px, at 250 ms sampling. Under
 * `prefers-reduced-motion: reduce` the same forty samples are pixel-identical,
 * which is what identifies the drift as the cause rather than anything in the
 * layout. A control that teleports 216 px as a reader goes to press it cannot be
 * pressed.
 *
 * 24 px, which has to clear a frame of drift and does by three orders of
 * magnitude — the drift measured 15 px over ten seconds, monotonic, about 0.025
 * px a frame — while still letting a genuinely better placement win when the
 * camera reframes or the reader walks.
 *
 * How to tell the two apart if this ever needs re-measuring, and it does not
 * need a threshold: **the count of distinct positions.** Twelve to eighteen
 * places in forty samples is a smooth walk; two places is a flip, whatever the
 * magnitudes. Comparing a jump against the run's own drift also works but needs
 * a floor — `jump <= max(2, drift)` — because a control that moves one pixel and
 * comes back exceeds a zero drift by definition, which is what a still camera
 * produces.
 */
const HYSTERESIS = 24;

/** Up is preferred over left, right and down by this much, as a discount on the
 *  distance. Above a thing is where a label goes: below a panel on a desk it
 *  lands where a keyboard would be and reads as an object on the desk rather
 *  than a control, and the room's own monitor is the case that showed it. */
const ABOVE_BIAS = 0.6;

/** The viewport below which every control is a dot, decided rather than clipped.
 *  Matches the breakpoint in backlot-hud.css. */
const PHONE_WIDTH = 640;

interface Parked {
  spec: HotspotSpec;
  handle: Hotspot;
  button: HTMLButtonElement;
  /** The thing in the world this hotspot marks the *surface* of, if it marks a
   *  surface at all. Projected in `park`, never cached: a door's window swings
   *  with its leaf and the camera can be mid-travel. */
  surface: Object3D | null;
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
  /** Where this button sat last frame, as an offset from its own anchor, so the
   *  choice can be held across frames instead of re-decided from scratch. An
   *  offset rather than a point: the anchor moves with the camera and the
   *  placement should move with it. */
  hold: { dx: number; dy: number } | null;
  /** And its box once it is down to the dot, which is a different number from
   *  the labelled one and is not 30. Cached separately, because the crowding
   *  decision has to keep reading the *labelled* width — deciding from a
   *  quantity the decision can change is what makes it flip-flop. */
  dotWidth: number;
  dotHeight: number;
}

/** Whether an object is actually drawn, which is not what `visible` answers:
 *  `visible` is one object's own flag, and a subtree switched off at the root
 *  leaves every flag inside it set. */
function drawn(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** A rectangle in canvas pixels. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
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
  /**
   * Publish what a nameplate's cap measures on screen, in CSS pixels, as
   * `data-backlot-cap` on the door's own button.
   *
   * Same reason `data-backlot-rect` exists: the number decides whether the word
   * is painted, and a check that could only look at the pixels would be reading
   * the consequence rather than the signal. Rounded to a tenth — the threshold
   * is 11 and a reading of 10.96 against 11.02 is a real difference.
   */
  setCap(id: string, pixels: number | null): void;
  /** Park every button over its point, in canvas pixels. Called each frame.
   *
   *  `readable` is a rectangle no button may overlap — the thing the camera is
   *  currently framed on. Buttons are pushed clear of it rather than hidden:
   *  "Back to the backlot" and "Open the Studio" are how a reader leaves, and
   *  Escape should not be the only way out anyone has. */
  park(width: number, height: number, readable?: Rect | null): void;
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
  /**
   * Say that this hotspot marks the surface of `object`, so every `park` can
   * publish where that surface is on screen (`Hotspot.setRect` in types.ts says
   * why it has to be published rather than reconstructed).
   *
   * An object rather than a rectangle, and that is the whole point: the rect is
   * projected from the object's own world matrix in the pass that runs after
   * `render`, so a door's window follows its leaf as it swings and stays right
   * while the camera is still travelling. `null` stops tracking and takes the
   * attribute off.
   */
  trackSurface(id: string, object: Object3D | null): void;
  /**
   * Things a parked button must stay off that are nobody's surface to publish.
   *
   * A door's rect is the window, because that is what a check samples. The name
   * board over the lintel is not the window and should not be in that rect — but
   * a control parked on it is just as bad, and the first version of the
   * keep-out moved two buttons off their windows straight onto their boards.
   * Replaces the whole list; pass an empty one to clear it.
   */
  keepClear(objects: Object3D[]): void;
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
  /** Everything a parked button has to stay off this frame: the thing the camera
   *  is framed on, every surface a hotspot has said it marks, and anything else
   *  the scene has asked to be kept clear. */
  const keepOut: (Rect & { owner: Parked | null })[] = [];
  /** Objects in that last category — kept clear, never published. */
  const clearances: Object3D[] = [];
  const projected = new Vector3();
  const bounds = new Box3();
  const corner = new Vector3();
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

  /** An object's world-space extent, as a rectangle in canvas pixels.
   *
   *  Every corner is projected and the extremes taken, rather than projecting a
   *  centre and a size: the projection of a tilted box is not its plan, and the
   *  hub is seen at 52 degrees. Returns null for anything with nothing in it, so
   *  a caller that tracked the wrong object gets no attribute rather than a
   *  rectangle of infinities. */
  function projectBox(
    object: Object3D,
    width: number,
    height: number,
  ): { x: number; y: number; width: number; height: number } | null {
    if (width <= 0 || height <= 0) return null;
    // The object's **own** box, carried through its matrix — not a world-axis
    // box drawn around it.
    //
    // `Box3.setFromObject` gives the axis-aligned box the thing occupies in
    // world space, and for anything the ring has turned that is a great deal
    // bigger than the thing. A door's window at ten o'clock is a 1.8 x 2.45 m
    // plane standing at 60 degrees to the world's axes; its world box is the
    // volume that plane sweeps, and projecting that reported the Policies window
    // as 37 x 113 px where the window is 19 x 62 — **tall enough to swallow the
    // name board over the lintel**. Anything sampling the published rect for
    // that door was sampling the board, which is the one part of the door that
    // always has a word on it. The checks lane read 35 px of ink on a plate that
    // was correctly blank and was right to.
    //
    // Projecting the local corners through `matrixWorld` instead gives the
    // thing's own quad, and its screen box is tight on all six doors. Nothing
    // that is not a mesh with a box of its own falls back to the old answer,
    // which is still correct and only loose.
    const mesh = object as Object3D & { geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void } };
    const own = mesh.geometry;
    let local = false;
    if (own) {
      if (!own.boundingBox) own.computeBoundingBox();
      if (own.boundingBox) {
        object.updateWorldMatrix(true, false);
        bounds.copy(own.boundingBox);
        local = true;
      }
    }
    if (!local) bounds.setFromObject(object);
    if (bounds.isEmpty()) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    // Whether any corner is actually between the near and far planes. A framing
    // moves the near plane up to just in front of what it is framing
    // (camera.ts), so a surface the camera has **cut away** projects to a
    // perfectly sensible rectangle that is not on screen at all.
    //
    // It is not a tidiness: the rect is what `alone` in `park` counts to decide
    // whether the camera is close on one thing or on a group of them, and a
    // clipped neighbour counting as a second thing is what left eight of the
    // corridor's twelve dots sitting on the middle of their own picture at
    // 390x844 — 16% of the window, a 50 px disc on the figure's chest. The rule
    // it defeated is the one three lines of comment in `clearOf` exist to state.
    // And `setRect` promises "where the thing this hotspot marks actually is on
    // screen", which a cut-away surface has no answer to.
    let onScreen = false;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corner.set(x, y, z);
          if (local) corner.applyMatrix4(object.matrixWorld);
          corner.project(camera);
          if (corner.z >= -1 && corner.z <= 1) onScreen = true;
          const px = (corner.x * 0.5 + 0.5) * width;
          const py = (-corner.y * 0.5 + 0.5) * height;
          left = Math.min(left, px);
          right = Math.max(right, px);
          top = Math.min(top, py);
          bottom = Math.max(bottom, py);
        }
      }
    }
    if (!onScreen) return null;
    // Clamped to the canvas, because a door on the far side of a framing can
    // project outside it and a rectangle nobody can sample is worse than none.
    const x = Math.max(0, Math.min(left, width));
    const y = Math.max(0, Math.min(top, height));
    const w = Math.max(0, Math.min(right, width) - x);
    const h = Math.max(0, Math.min(bottom, height) - y);
    return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
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
      // A spec that names its surface gets its rect published from the moment it
      // registers, with no second call: the hub's doors hand theirs over through
      // `trackSurface` because the engine builds them, and a room hands its own
      // over here because the room builds those. Same projection, same pass.
      surface: spec.surface ?? null,
      near: false,
      enabled: true,
      busy: false,
      x: Number.NaN,
      y: Number.NaN,
      width: 0,
      height: 0,
      hold: null,
      dotWidth: 0,
      dotHeight: 0,
      handle: {
        id: spec.id,
        button,
        setEnabled(enabled) {
          entry.enabled = enabled;
          apply(entry);
        },
        setRect(rect) {
          if (!rect) {
            delete button.dataset.backlotRect;
            return;
          }
          // Rounded, and in the canvas's own coordinates — the same space the
          // parked buttons are positioned in, so a reader of this attribute
          // adds the canvas's own client rect exactly as they already do for a
          // button's box.
          button.dataset.backlotRect = [rect.x, rect.y, rect.width, rect.height]
            .map((value) => Math.round(value))
            .join(",");
        },
        dispose() {
          const at = parked.indexOf(entry);
          if (at >= 0) parked.splice(at, 1);
          button.remove();
        },
      },
    };

    // Arriving by keyboard. `focusin` rather than `focus` because it bubbles and
    // because it is the event a headless harness can be made to deliver at all:
    // Chrome with no OS-focused window defers focus events forever unless
    // `Emulation.setFocusEmulationEnabled` is on, so a check that reads
    // `document.activeElement` passes while this listener never runs
    // (CLAUDE.md §7). Driven, not assumed.
    //
    // Not gated on `:focus-visible`. That selector is about whether to *paint* a
    // ring, and it deliberately does not match after a pointer press; the camera
    // is not a ring, and a reader who clicked a door and a reader who Tabbed to
    // it are both at the door. The click path below frames as well, so the two
    // agree either way — this is here so that Tab alone is enough.
    button.addEventListener("focusin", () => {
      if (!spec.focus || !entry.enabled) return;
      void hooks.frame(spec).catch((error) => {
        console.warn(`backlot: ${spec.id} threw on framing`, error);
      });
    });

    button.addEventListener("focusout", () => {
      if (!spec.focus) return;
      hooks.unframe(spec);
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      // aria-disabled does not stop a click the way `disabled` would — that is
      // the whole point of using it — so the guard is here, in code. It spans
      // this handler only: the framing is no longer inside it, because the
      // press does not wait for the framing. What stops a second press doing
      // the thing twice is the engine's own re-entrancy on the act itself —
      // `use` refuses while a door is already in progress — which is where it
      // belongs, since a press that arrives by some other route has to hit the
      // same guard.
      if (!entry.enabled || entry.busy) return;
      entry.busy = true;
      try {
        // Started, not awaited. See `HotspotHooks.frame`: a press goes, and
        // whether the camera has to move on the way is the engine's business
        // and not something to make the reader wait through.
        if (spec.focus) {
          void hooks.frame(spec).catch((error) => {
            console.warn(`backlot: ${spec.id} threw on framing`, error);
          });
        }
        spec.activate();
      } catch (error) {
        console.warn(`backlot: ${spec.id} threw on activation`, error);
      } finally {
        entry.busy = false;
      }
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

    setCap(id, pixels) {
      const entry = parked.find((candidate) => candidate.spec.id === id);
      if (!entry) return;
      if (pixels === null) {
        delete entry.button.dataset.backlotCap;
        return;
      }
      entry.button.dataset.backlotCap = (Math.round(pixels * 10) / 10).toFixed(1);
    },

    park(width, height, readable = null) {
      if (width <= 0 || height <= 0) return;
      placed.length = 0;

      // Where every surface is, before anything is parked.
      //
      // This used to run after the parking, because the only keep-out was the
      // one rectangle the camera was framed on. It runs first now because a
      // door's button was parking on the door's own window — 46% of the picture
      // at 1920 and **100% of it at 390**, where the control is 50 px and the
      // window is 11 to 28 — so the round's recorded stills were, at one of the
      // two marking viewports, not visible at all. A picture nobody can see is
      // not a smaller picture.
      keepOut.length = 0;
      for (const entry of parked) {
        if (!entry.surface || entry.button.hidden) {
          if (entry.surface) entry.handle.setRect(null);
          continue;
        }
        const rect = projectBox(entry.surface, width, height);
        entry.handle.setRect(rect);
        if (rect) {
          keepOut.push({ left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height, owner: entry });
        }
      }
      for (const object of clearances) {
        // `visible` is the object's own flag and says nothing about its parents.
        // The hub's six name boards keep theirs set while the whole hub group is
        // switched off behind a room, so the room was laying its controls out
        // around six signs that are not on screen and are eleven metres outside
        // the walls. Checked up the chain, which is what "is this drawn" means.
        if (!drawn(object)) continue;
        const rect = projectBox(object, width, height);
        if (rect) {
          keepOut.push({ left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height, owner: null });
        }
      }

      // What the camera is close on, kept clear — but only where nothing inside
      // it has already said where it is.
      //
      // The framing is a square around a radius, and a radius is not a shape. On
      // a single panel the two are nearly the same rectangle and this changes
      // nothing. On the front wall they are not: the push holds five screens and
      // the wall between and above them, and treating the whole square as
      // unusable pushed all five labels to the top edge of the frame, 270 px
      // above the pictures they name. The five screens each publish their own
      // rect through `surface` — that is what `data-backlot-rect` is — so the
      // pictures are already covered, and the wall between them is where a label
      // has always belonged.
      //
      // So the square stands in only where nothing has published a rect inside
      // it, which is the case it was written for: a thing the camera can frame
      // that has no `surface` to project. Both halves of this run — the machine
      // room's front wall takes the first, and a framing on anything that marks a
      // point rather than a surface takes the second.
      //
      // And counting them answers a second question for free: **is the camera
      // close on one thing, or on a group of them.** Exactly one surface inside
      // the framing means the reader has come in on that one thing, which is the
      // one case where its own control may not sit on it (see `clearOf`). Two or
      // more means a wall, where a dot per screen is how you tell them apart.
      let alone: Parked | null = null;
      if (readable) {
        const inside = keepOut.filter(
          (rect) =>
            rect.owner !== null &&
            rect.left < readable.right &&
            rect.right > readable.left &&
            rect.top < readable.bottom &&
            rect.bottom > readable.top,
        );
        if (inside.length === 0) keepOut.push({ ...readable, owner: null });
        else if (inside.length === 1) alone = inside[0]!.owner;
      }

      const overlapArea = (
        at: { x: number; y: number },
        boxWidth: number,
        boxHeight: number,
        against: Rect[],
      ) => {
        let area = 0;
        for (const rect of against) {
          const across = Math.min(at.x + boxWidth / 2, rect.right) - Math.max(at.x - boxWidth / 2, rect.left);
          const down = Math.min(at.y + boxHeight / 2, rect.bottom) - Math.max(at.y - boxHeight / 2, rect.top);
          if (across > 0 && down > 0) area += across * down;
        }
        return area;
      };

      /** Somewhere this button can sit without covering a thing worth seeing.
       *
       *  Four things beyond "the nearest way out", each of them a bug that was
       *  measured before it was a rule:
       *
       *  - **it keeps out of all of them, not the one it started on.** Moving a
       *    button off its own window and onto its neighbour's is not a fix.
       *  - **up wins ties and near-ties.** Above a thing is where a label goes;
       *    below the monitor it lands where a keyboard would be.
       *  - **the placement is held across frames.** Nearest-every-frame let the
       *    idle camera's sub-pixel drift flip a tie, and controls alternated
       *    between two positions several times a second.
       *  - **when nothing is clear, the least-covered spot wins** rather than
       *    the anchor. A 50 px control cannot fit beside a 40 x 17 panel at 390,
       *    and "give up and sit dead centre on it" is the worst of the options
       *    rather than the safe one.
       */
      const clearOf = (entry: Parked, x: number, y: number, boxWidth: number, boxHeight: number, dense: boolean) => {
        // A dot stays on the thing it marks, and that is the whole of what a dot
        // is for. It comes down to a dot precisely because it is small enough to
        // sit on its own picture without being in the way — 20 x 20 on a
        // 165 x 181 still is 1.3% of it — and a dot beside the thing rather than
        // on it marks nothing. Measured by the rooms owner after the keep-out
        // first went in: t3's dot ended 9 px from its own picture and 11 px from
        // its neighbour's, and t5's floated on blank wall because there is no
        // seam to the right of the last frame.
        //
        // The exemption holds only while the dot is genuinely small enough to
        // sit inside its target, and that condition is not decoration: at 390 the
        // phone rule makes every control a 50 x 50 disc and a door's window is
        // 21 x 23, so without it the picture went back 100% behind its own
        // control, which is the failure this keep-out exists for. Half the target
        // in both directions.
        //
        // A label never gets the exemption: 280 px of label on a 165 px picture
        // is a control in the way, which is why it came down to a dot at all.
        //
        // And it stops the moment the camera comes in on that thing by itself.
        // At 390 a door's window is 21 x 24 px at rest and the 50 px control
        // cannot sit inside it, so it is parked beside the door; after the push
        // the window is 120 x 230 and the exemption starts applying, which put
        // the dot dead centre on the picture the reader had just come in to
        // watch. Seen, in a3-sessions-phone-dark-tab.png. A thing the camera is
        // close on is being read, and a control over the top of it is a control
        // in the way — `alone` above is what tells that apart from a wall of
        // five screens, where a dot on each is how you tell them apart.
        const fitsInside = (rect: Rect) =>
          boxWidth <= (rect.right - rect.left) * 0.5 && boxHeight <= (rect.bottom - rect.top) * 0.5;
        const avoid =
          dense && entry !== alone ? keepOut.filter((rect) => rect.owner !== entry || !fitsInside(rect)) : keepOut;
        if (avoid.length === 0) {
          entry.hold = null;
          return { x, y };
        }
        const halfW = boxWidth / 2 + GAP;
        const halfH = boxHeight / 2 + GAP;
        const hits = (at: { x: number; y: number }) =>
          avoid.some(
            (rect) =>
              at.x + halfW > rect.left && at.x - halfW < rect.right && at.y + halfH > rect.top && at.y - halfH < rect.bottom,
          );
        const onCanvas = (at: { x: number; y: number }) =>
          at.x - boxWidth / 2 >= 0 &&
          at.x + boxWidth / 2 <= width &&
          at.y - boxHeight / 2 >= 0 &&
          at.y + boxHeight / 2 <= height;

        if (!hits({ x, y })) {
          entry.hold = null;
          return { x, y };
        }

        const candidates: { x: number; y: number; cost: number; up: boolean }[] = [];
        for (const rect of avoid) {
          candidates.push(
            { x: rect.left - halfW, y, cost: 0, up: false },
            { x: rect.right + halfW, y, cost: 0, up: false },
            { x, y: rect.top - halfH, cost: 0, up: true },
            { x, y: rect.bottom + halfH, cost: 0, up: false },
          );
        }
        for (const way of candidates) {
          way.cost = Math.hypot(way.x - x, way.y - y) * (way.up ? ABOVE_BIAS : 1);
        }

        const clear = candidates.filter((way) => onCanvas(way) && !hits(way));
        if (clear.length === 0) {
          // Nothing fits. Take the least covered rather than the anchor, and
          // hold it, so a control that cannot get clear at least stops moving.
          const all = [...candidates.filter(onCanvas), { x, y, cost: 0, up: false }];
          const best = all.reduce((least, way) =>
            overlapArea(way, boxWidth, boxHeight, avoid) < overlapArea(least, boxWidth, boxHeight, avoid) ? way : least,
          );
          entry.hold = { dx: best.x - x, dy: best.y - y };
          return { x: best.x, y: best.y };
        }

        const best = clear.reduce((least, way) => (way.cost < least.cost ? way : least));
        const held = entry.hold ? { x: x + entry.hold.dx, y: y + entry.hold.dy } : null;
        if (held && onCanvas(held) && !hits(held)) {
          const heldCost = Math.hypot(held.x - x, held.y - y) * (held.y < y ? ABOVE_BIAS : 1);
          if (heldCost <= best.cost + HYSTERESIS) return held;
        }
        entry.hold = { dx: best.x - x, dy: best.y - y };
        return { x: best.x, y: best.y };
      };

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
      //
      // **And it is decided for the row, not for the pair.** Pairwise, the front
      // wall came down two-and-three: "Play one line" is 113 px and "Play
      // subject + action" is 163, their anchors are 201 px apart, and neither
      // collides with the other — so two of five rungs kept their names while
      // the three beside them were dots. That is not a row, it is a row with a
      // fault in it, and the ladder reads as five of one thing or it does not
      // read. So a control is crowded when **anything on its own line** is
      // closer than the *widest* label on that line could be laid out at: five
      // labels at a 201 px pitch cannot all be shown when one of them is 314 px
      // wide, and the answer to that is the same answer for all five.
      //
      // The line is found from the **anchors**, not from where the buttons ended
      // up — the placement is decided after this and depends on it, and reading
      // it here would be deciding from a quantity the decision changes. On the
      // wall the five anchors sit within 13 px of each other and the monitor's
      // is 424 px away, so the row is the five screens and nothing else.
      // Below the phone breakpoint every control is a dot, and the engine says
      // so rather than letting the stylesheet clip a label that still claims to
      // be shown. Those are not the same thing: a designed dot keeps its
      // accessible name, admits what it is in the DOM, and gets the reveal on
      // hover and focus that `[data-backlot-dense]` carries; a label clipped to
      // one pixel looks identical on screen and has none of that. Measured at
      // 390: all eight controls render 50 x 50 with labels 79 to 280 px wide
      // painted at 1 px, and only two of them carried the marker.
      const phone = width <= PHONE_WIDTH;
      for (const one of live) {
        if (phone) {
          one.entry.button.dataset.backlotDense = "true";
          continue;
        }
        const onLine = (other: (typeof live)[number]) =>
          Math.abs(other.y - one.y) < (other.entry.height + one.entry.height) / 2 + GAP;
        let widest = one.entry.width;
        for (const other of live) if (onLine(other)) widest = Math.max(widest, other.entry.width);
        const crowded = live.some(
          (other) => other !== one && onLine(other) && Math.abs(other.x - one.x) < widest + GAP,
        );
        if (crowded) one.entry.button.dataset.backlotDense = "true";
        else delete one.entry.button.dataset.backlotDense;
      }

      for (const one of live) {
        const { entry } = one;
        const dense = entry.button.dataset.backlotDense === "true";
        if (dense && entry.dotWidth === 0) {
          // Read once, now that the attribute is on and the element is actually
          // a dot. Seeded from DOT_BOX for the frame in which it is first set.
          const box = entry.button.getBoundingClientRect();
          entry.dotWidth = box.width || DOT_BOX;
          entry.dotHeight = box.height || DOT_BOX;
        }
        const boxWidth = dense ? entry.dotWidth || DOT_BOX : entry.width;
        const boxHeight = dense ? entry.dotHeight || DOT_BOX : entry.height;
        // Out of the way of whatever is being read, first: everything below
        // works from where the button can actually sit.
        const room = clearOf(entry, one.x, one.y, boxWidth, boxHeight, dense);
        let x = room.x;
        let y = room.y;
        // Whatever is left after the labels have come down — two dots on top of
        // each other — still gets nudged apart, downwards, in registration
        // order so the arrangement is stable rather than a shuffle.
        for (let attempt = 0; attempt < 8; attempt++) {
          const clash = placed.find(
            (other) =>
              Math.abs(other.x - x) < (other.width + boxWidth) / 2 + GAP &&
              Math.abs(other.y - y) < (other.height + boxHeight) / 2 + GAP,
          );
          if (!clash) break;
          y = clash.y + (clash.height + boxHeight) / 2 + GAP;
          // Being nudged down must not nudge it back over the thing it was
          // just moved off.
          const again = clearOf(entry, x, y, boxWidth, boxHeight, dense);
          x = again.x;
          y = again.y;
        }
        // The box inside the canvas, not just its centre. A range that inverts
        // — a control wider than the canvas has room for — centres instead.
        const reachX = boxWidth / 2 + EDGE_INSET;
        const reachY = boxHeight / 2 + EDGE_INSET;
        x = reachX * 2 > width ? width / 2 : Math.min(Math.max(x, reachX), width - reachX);
        y = reachY * 2 > height ? height / 2 : Math.min(Math.max(y, reachY), height - reachY);
        placed.push({ x, y, width: boxWidth, height: boxHeight });

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
        if (one.clamped) entry.button.dataset.backlotEdge = "true";
        else delete entry.button.dataset.backlotEdge;
      }

    },

    keepClear(objects) {
      clearances.length = 0;
      clearances.push(...objects);
    },

    trackSurface(id, object) {
      const entry = parked.find((candidate) => candidate.spec.id === id);
      if (!entry) return;
      entry.surface = object;
      if (!object) entry.handle.setRect(null);
    },

    remeasure() {
      for (const entry of parked) {
        // The label has to be showing to be measured, so the dense state comes
        // off first and the next park decides it again from scratch.
        delete entry.button.dataset.backlotDense;
        entry.width = 0;
        entry.dotWidth = 0;
      }
    },

    track(position, seed = false) {
      for (const entry of parked) {
        const radius = entry.spec.radius;
        // A hidden button is not on screen, so its threshold is not a place the
        // reader can be standing in: while a room is mounted the hub's doors
        // must not go on firing proximity at a figure that is inside the room.
        //
        // It has to stop *saying* it too. Skipping the whole entry left the
        // attribute at whatever it was when the button went away, so the Studio
        // door read `data-backlot-near="true"` for the entire time the reader
        // was inside the machine room — the door they had walked into, still
        // claiming the figure was standing at it from eleven metres outside the
        // walls. Nothing acted on it; anything reading it would have been wrong.
        if (radius === undefined || entry.button.hidden) {
          if (entry.near) {
            entry.near = false;
            delete entry.button.dataset.backlotNear;
          }
          continue;
        }
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
