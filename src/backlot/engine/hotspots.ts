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
  /** The nameplate's painted box, kept from the first frame it is painted on.
   *
   *  A name is only painted while the reader is on the control, so most of the
   *  time there is nothing to read and the pass below plans from the text's own
   *  width instead. That estimate is the text without the pill it sits in; this
   *  is the pill, and it is 20 px wider.
   *
   *  Kept rather than re-read for the usual reason, and this is the one that
   *  bit hardest. The pass used to read the live label every frame, and for the
   *  one control the keyboard is on, the live label is the revealed one — whose
   *  width the side it chose last frame was capping, at 12rem under a dot and
   *  20rem beside it. So the side decided the width and the width decided the
   *  side: the Studio door's name alternated between `below` at 295 px and
   *  `before` at 216 px every 500 ms, for as long as the keyboard was on it,
   *  with the button standing still — 39.3% and 65.9% of the name on screen.
   *  The stylesheet now caps every side the same, so the painted box no longer
   *  depends on the answer, and this keeps the reading from drifting anyway. */
  labelWidth: number;
  labelHeight: number;
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
  /**
   * Every hotspot whose reach contains this point, nearest first.
   *
   * **The set, not the crossings.** `track` reports the moment a threshold is
   * crossed, which is the right event for "you have arrived" and the wrong one
   * for "where are you now": reaches overlap — the corridor's are 1.3 m against
   * a 2.0 m pitch, so there is a 0.6 m band inside two of them — and a reader
   * who leaves one while still standing in the other gets a crossing for the
   * one they left and none for the one they are in. Nothing then says where
   * they are. This answers that question from the position itself, so an answer
   * exists on every frame rather than only on the frames something changed.
   *
   * Ground distance, like `track`: a door's point is up at head height on the
   * leaf, and measuring in three dimensions from there puts a figure standing
   * in the doorway 2.2 m away from it.
   */
  within(point: Vector3): { id: string; distance: number }[];
  /**
   * How close the figure has to be to this hotspot to be at it, or null for a
   * hotspot with no reach at all.
   *
   * The same number `within` and `track` decide "near" with, published so that
   * anything which has to expire when the reader leaves a thing can ask the
   * thing rather than pick a distance. The engine's refusal used to pick one —
   * three metres, against a corridor door's reach of 1.3 — and a reader who
   * stepped out of a door and back in was still inside a band the door itself
   * says they left.
   */
  reachOf(id: string): number | null;
  /** The sentence a room gave this hotspot for the moment of arrival, if it
   *  gave one. The room writes it; who says it, and when, is the engine's. */
  arrivalOf(id: string): string | null;
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
  /** How much wider a revealed name is than its own text: the pill's padding
   *  and border, 20 px at the time of writing. Learned from the first name this
   *  page paints rather than copied from the stylesheet, so that changing the
   *  padding there does not quietly leave a number behind here. Zero until then,
   *  which is the estimate the pass used to make on its own. */
  let plate = 0;

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
      labelWidth: 0,
      labelHeight: 0,
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

        /**
         * The controls already down, as rectangles this search has to respect
         * too — **in the same search, not in a second one afterwards.**
         *
         * This used to be somebody else's problem: the caller nudged a
         * colliding control downwards and then asked here again, and whatever
         * came back was adopted. But this function knows about faces and
         * nothing about controls, so its answer could put a control straight
         * back on top of the button the nudge had just separated it from —
         * eight times, whichever ran last winning. `look-machine`'s centre
         * ended up inside "Back to the backlot" at 1920x1080, so a tap on the
         * machine the room is named for answered for the way out. It was
         * marginal — present, absent, present, present across four trees with
         * nothing in the loop changing — which is worse than a fixed fault,
         * because the run that comes up clean reads as a fix.
         *
         * Making the de-collision authoritative instead took this file's suite
         * from 3 failures to 17: the two constraints are coupled, and a
         * placement that satisfies one by ignoring the other moves a great many
         * controls. So they are solved together — one candidate set, generated
         * from both, tested against both.
         */
        const taken: Rect[] = placed.map((box) => ({
          left: box.x - box.width / 2,
          top: box.y - box.height / 2,
          right: box.x + box.width / 2,
          bottom: box.y + box.height / 2,
        }));
        const blocked = [...avoid, ...taken];
        if (blocked.length === 0) {
          entry.hold = null;
          return { x, y };
        }
        const halfW = boxWidth / 2 + GAP;
        const halfH = boxHeight / 2 + GAP;
        const clears = (at: { x: number; y: number }, rects: readonly Rect[]) =>
          !rects.some(
            (rect) =>
              at.x + halfW > rect.left && at.x - halfW < rect.right && at.y + halfH > rect.top && at.y - halfH < rect.bottom,
          );
        const hits = (at: { x: number; y: number }) => !clears(at, blocked);
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
        for (const rect of blocked) {
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
          //
          // Least covered **by another control first**, and only then by a
          // face. Ranked rather than weighted, so there is no number here that
          // nobody could argue with: a control a reader cannot press is a
          // failure, and a control sitting over a picture is a cost, and no
          // amount of the second is worth any of the first.
          const all = [...candidates.filter(onCanvas), { x, y, cost: 0, up: false }];
          const best = all.reduce((least, way) => {
            const wayOnControls = overlapArea(way, boxWidth, boxHeight, taken);
            const leastOnControls = overlapArea(least, boxWidth, boxHeight, taken);
            if (wayOnControls !== leastOnControls) return wayOnControls < leastOnControls ? way : least;
            return overlapArea(way, boxWidth, boxHeight, avoid) < overlapArea(least, boxWidth, boxHeight, avoid)
              ? way
              : least;
          });
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
          //
          // **This is the line the defect was on, and it is fixed — the record
          // is kept because the way it was fixed is the useful part.**
          //
          // `clearOf` answered from faces and was adopted unconditionally by a
          // loop that knew about controls, so it could put a control back on top
          // of the button the nudge had just separated it from. Eight times,
          // whichever ran last winning. `look-machine`'s centre landed inside
          // "Back to the backlot" at 1920x1080 in both themes, so a tap on the
          // machine the room is named for answered for the way out — and it was
          // **marginal**: present, absent, present, present across four trees
          // with nothing in this loop changing.
          //
          // Two fixes were tried. Giving the de-collision the last word — take
          // this answer only when it does not re-clash — took
          // `spec/backlot-contrast.test.ts` from 3 failures to 17, because the
          // two constraints are coupled and neither may win alone. What worked
          // was solving them together: `clearOf` builds its candidates from the
          // faces **and** from `placed`, and tests against both, which is the
          // `blocked` list above. The checks lane's injection removes exactly
          // that coupling and reproduces the old defect precisely in both
          // themes, so the fix is load-bearing rather than incidental.
          //
          // Two things worth keeping from getting there. The first explanation
          // — that the clamp below pushed a separated control back — was wrong
          // for this defect: (1071,752) sits in a clamp range of x in [92,1828]
          // and y in [26,897], nowhere near an edge. It fitted the toggling only
          // because we wanted it to. And it was not wrong about the *clamp*:
          // the clamp really can undo a de-collision, which is a second defect
          // found later at 390x844 and guarded where the clamp actually is.
          const again = clearOf(entry, x, y, boxWidth, boxHeight, dense);
          x = again.x;
          y = again.y;
        }
        // The box inside the canvas, not just its centre. A range that inverts
        // — a control wider than the canvas has room for — centres instead.
        const reachX = boxWidth / 2 + EDGE_INSET;
        const reachY = boxHeight / 2 + EDGE_INSET;
        const clampX = (value: number) =>
          reachX * 2 > width ? width / 2 : Math.min(Math.max(value, reachX), width - reachX);
        const clampY = (value: number) =>
          reachY * 2 > height ? height / 2 : Math.min(Math.max(value, reachY), height - reachY);
        x = clampX(x);
        y = clampY(y);

        // **And after the clamp, because the clamp can undo the de-collision.**
        //
        // Everything above keeps controls apart at the position they were
        // chosen at; this line then moves them, and nothing looked again. Pushed
        // deep into the corridor at 390x844 every control but the focused one is
        // clamped to an edge, so several arrive at the same edge point and come
        // to rest on **pixel-identical 50x50 boxes** — measured: `stage-week-01`
        // and `leave-corridor` both at (328,754,50,50), thirteen controls
        // showing twelve dots, and a tap on week 1 leaving the corridor. It
        // happens while walking too, with nothing focused, which is the reader a
        // phone actually has.
        //
        // So the pile is broken up along whichever axis the clamp has not
        // pinned: down the edge first, and across it when the bottom is where
        // the clamp already is.
        for (let attempt = 0; attempt < 8; attempt++) {
          const clash = placed.find(
            (other) =>
              Math.abs(other.x - x) < (other.width + boxWidth) / 2 + GAP &&
              Math.abs(other.y - y) < (other.height + boxHeight) / 2 + GAP,
          );
          if (!clash) break;
          // Away from it, in whichever direction the clamp has left room — and
          // **both** directions are tried, because a control clamped into a
          // corner is pinned against the far edge on one axis and the far edge
          // on the other, and a rule that only ever moves down and right gives
          // up exactly there. (328,754) at 390x844 is that corner, and it is
          // where the pile was.
          const stepY = (clash.height + boxHeight) / 2 + GAP;
          const stepX = (clash.width + boxWidth) / 2 + GAP;
          const options = [
            clampY(clash.y + stepY),
            clampY(clash.y - stepY),
          ].filter((value) => value !== y);
          if (options.length > 0) {
            y = options[0]!;
            continue;
          }
          const across = [clampX(clash.x + stepX), clampX(clash.x - stepX)].filter((value) => value !== x);
          if (across.length === 0) break;
          x = across[0]!;
        }
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

      // --- which way a name opens ---------------------------------------
      //
      // A control that has come down to its dot gives its name back on hover
      // and on focus, and that name is painted **outside** the button — so it
      // covers whatever is on that side. Which side is free is not a constant,
      // because the rooms do not run the same way: the machine room's five
      // screens are a row across a wall, so a name opening to the side lands on
      // the next screen twenty-five pixels away; the corridor's twelve doors
      // are two columns down the screen, so a name opening downwards lands on
      // the next door.
      //
      // Both were measured by picking one and looking. Opening to the side:
      // `play-front-t2`'s composited fill read #4b4947 against its own declared
      // #070504. Opening downwards instead: the corridor's windows went from
      // 0.3% covered to 11.7-12.4% at 390x844. A fixed direction cannot be
      // right for both, so it is chosen per control against what is actually
      // around it — the same question the placement above answers for the
      // button, asked for the label.
      //
      // The button's own final box is what the label hangs off, so this is a
      // second pass rather than part of the loop: it needs every control down
      // before it can ask what is beside any of them.
      for (const one of live) {
        const { entry } = one;
        if (entry.button.dataset.backlotDense !== "true") {
          delete entry.button.dataset.backlotSide;
          continue;
        }
        // The name's **own** painted box, not the button's and not its text's.
        //
        // `entry.width` is the button measured with its label showing, which is
        // the right number at 1920 and the wrong one at 390: there the
        // stylesheet keeps every label visually hidden at 1 px, so the button
        // measures the dot and every side looked like it fitted. The names that
        // then ran off the canvas were 200 px being planned for as 50 —
        // "open the Studio door" showing 29.7% of itself.
        //
        // `scrollWidth` fixed that and left a second gap: it is the *text's*
        // width, and what has to stay on screen is the pill the text sits in,
        // which is 20 px wider. "Open the Assessment door" planned at 174 and
        // painted at 188 chose `beside` and hung 22 px off the right edge.
        //
        // So: the painted box when there is one to read, and the text plus the
        // pill when there is not. Only the reader's own control is painted, so
        // most controls are planned from the estimate — and `plate` is what
        // makes the estimate right, taken from the first name this page paints
        // rather than copied out of the stylesheet, where it could drift.
        const nameplate = entry.button.querySelector<HTMLElement>(".backlot-hotspot__label");
        const painted = nameplate && entry.button.matches(":hover, :focus-visible");
        if (painted) {
          const box = nameplate.getBoundingClientRect();
          if (box.width > DOT_BOX) {
            entry.labelWidth = box.width;
            entry.labelHeight = box.height;
            if (nameplate.scrollWidth > 0) plate = Math.max(plate, box.width - nameplate.scrollWidth);
          }
        }
        const labelWidth =
          entry.labelWidth || (nameplate?.scrollWidth ? nameplate.scrollWidth + plate : 0) || entry.width || DOT_BOX;
        const labelHeight =
          entry.labelHeight || (nameplate?.scrollHeight ? nameplate.scrollHeight + plate : 0) || entry.height || DOT_BOX;
        const dotWidth = entry.dotWidth || DOT_BOX;
        const dotHeight = entry.dotHeight || DOT_BOX;
        // Everything the name must not land on: every other control where it
        // ended up, and every face anybody published — **including this
        // control's own**. A dot is allowed to sit on the thing it marks; that
        // is what a dot is for, and the placement above goes on letting it. A
        // 216x24 nameplate laid across a 120x209 still is not the same act, and
        // the reader walked up to that door to look at that still: leaving the
        // door's own window out of this took nine of the corridor's twelve
        // windows from 0.3% covered to 12.4% at 390, and one to 21.0%.
        const others: Rect[] = [
          ...live
            .filter((other) => other.entry !== entry)
            .map((other) => ({
              left: other.entry.x - (other.entry.dotWidth || DOT_BOX) / 2,
              right: other.entry.x + (other.entry.dotWidth || DOT_BOX) / 2,
              top: other.entry.y - (other.entry.dotHeight || DOT_BOX) / 2,
              bottom: other.entry.y + (other.entry.dotHeight || DOT_BOX) / 2,
            })),
          ...keepOut,
        ];
        const clearOfOthers = (box: Rect) =>
          box.left >= 0 &&
          box.right <= width &&
          box.top >= 0 &&
          box.bottom <= height &&
          !others.some(
            (rect) => box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top,
          );
        const beside: Rect = {
          left: entry.x + dotWidth / 2,
          right: entry.x + dotWidth / 2 + labelWidth,
          top: entry.y - labelHeight / 2,
          bottom: entry.y + labelHeight / 2,
        };
        const before: Rect = {
          left: entry.x - dotWidth / 2 - labelWidth,
          right: entry.x - dotWidth / 2,
          top: entry.y - labelHeight / 2,
          bottom: entry.y + labelHeight / 2,
        };
        const below: Rect = {
          left: entry.x - labelWidth / 2,
          right: entry.x + labelWidth / 2,
          top: entry.y + dotHeight / 2,
          bottom: entry.y + dotHeight / 2 + labelHeight,
        };
        const above: Rect = {
          left: entry.x - labelWidth / 2,
          right: entry.x + labelWidth / 2,
          top: entry.y - dotHeight / 2 - labelHeight,
          bottom: entry.y - dotHeight / 2,
        };
        // Beside first, because that is where a name reads best and where it
        // has always been; then under, then over, then back along the other
        // side.
        const sides: { name: string; box: Rect }[] = [
          { name: "beside", box: beside },
          { name: "below", box: below },
          { name: "above", box: above },
          { name: "before", box: before },
        ];
        const free = sides.find((side) => clearOfOthers(side.box));
        if (free) {
          entry.button.dataset.backlotSide = free.name;
        } else {
          // **Nowhere is clear, so the question becomes how much of the name a
          // reader can actually read** — which is not what this did before. It
          // fell back to `beside` and said so in a comment about having to cover
          // something; at 390 that ran names off the edge of the canvas instead.
          // Measured by the reviewer: 26 of 112 expanded names incomplete, "open
          // the Studio door" showing **29.7%** of itself and "Read the workflow
          // graph on the monitor" 61.5%. A name half off the screen is not a
          // name covering something, it is a name nobody can read.
          //
          // So the fallback asks two questions in order, and the order is the
          // whole of it. **First: which sides hold the whole name on the
          // canvas?** Among those, the least covering one wins. **Only if none
          // of them does** is it a question of how much of the name is on
          // screen at all.
          //
          // Ranking straight by on-screen area, with covering as a tie-break,
          // is what this did first and it was wrong in the other direction: a
          // name under a dot keeps more of itself on a 390 px screen than one
          // beside it does, so `below` won nearly everywhere and landed on the
          // picture it names. Measured in the corridor at 390: nine of twelve
          // windows went from 0.3% covered to 12.4%, one to 21.0%. Both costs
          // are real and they are not on the same scale — a name off the edge
          // is text nobody can finish, a name over a still is a still nobody
          // can see — so neither gets to be a tie-break for the other.
          const onCanvasArea = (box: Rect) =>
            Math.max(0, Math.min(box.right, width) - Math.max(box.left, 0)) *
            Math.max(0, Math.min(box.bottom, height) - Math.max(box.top, 0));
          const covered = (box: Rect) =>
            others.reduce(
              (sum, rect) =>
                sum +
                Math.max(0, Math.min(box.right, rect.right) - Math.max(box.left, rect.left)) *
                  Math.max(0, Math.min(box.bottom, rect.bottom) - Math.max(box.top, rect.top)),
              0,
            );
          const whole = (box: Rect) => box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height;
          const fits = sides.filter((side) => whole(side.box));
          const best = (fits.length ? fits : sides).reduce((most, side) => {
            if (fits.length) return covered(side.box) < covered(most.box) ? side : most;
            const here = onCanvasArea(side.box);
            const there = onCanvasArea(most.box);
            if (here !== there) return here > there ? side : most;
            return covered(side.box) < covered(most.box) ? side : most;
          });
          entry.button.dataset.backlotSide = best.name;
        }
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
        entry.labelWidth = 0;
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

    within(point) {
      const inside: { id: string; distance: number }[] = [];
      for (const entry of parked) {
        const radius = entry.spec.radius;
        // Same two exclusions as `track`: a hotspot with no reach has no
        // threshold to be inside, and a hidden button is not a place the reader
        // can be standing — the hub's doors are eleven metres outside the walls
        // of the room they are in.
        if (radius === undefined || entry.button.hidden) continue;
        const alongX = entry.spec.position.x - point.x;
        const alongZ = entry.spec.position.z - point.z;
        const distance = Math.hypot(alongX, alongZ);
        if (distance <= radius) inside.push({ id: entry.spec.id, distance });
      }
      return inside.sort((one, two) => one.distance - two.distance);
    },

    reachOf(id) {
      return parked.find((entry) => entry.spec.id === id)?.spec.radius ?? null;
    },

    arrivalOf(id) {
      return parked.find((entry) => entry.spec.id === id)?.spec.arrival ?? null;
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
