// The engine's public surface. Everything the page and the rooms are allowed
// to reach lives behind this one export.
//
// What this file does that the others do not: it is the only place that knows
// a door can lead out of the backlot. The hub knows where six doors stand, the
// hotspots know how to be buttons, the figure knows how to walk — none of them
// knows what a door means. Meaning is here, and it is one function, `use`,
// which a click, an Enter and a walk all arrive at.
//
// The loading order the budget is written against:
//   L0  everything constructed below, up to the first `render()`. Geometry and
//       lights, no network past this chunk. `ready` resolves on the animation
//       frame after the one that drew it, which is the earliest moment it can
//       honestly be called presented.
//   L1+ whatever a room asks `layers` for, after it is already on screen.
import { Box3, Group, Vector3 } from "three";
import { createColourReader } from "./colours";
import { createGodCamera, focusRadiusFor } from "./camera";
import { createFigure } from "./player";
import { createHotspots } from "./hotspots";
import { createHub, DOOR_REACH } from "./hub";
import { createInput } from "./input";
import { createLayers } from "./layers";
import { createMotionPreference } from "./motion";
import { createResizer } from "./resize";
import { createStage, releaseSubtree } from "./scene";
import type {
  BacklotEngine,
  BacklotOptions,
  BacklotRoom,
  Hotspot,
  HotspotSpec,
  RoomContext,
  RoomDoor,
} from "./types";
// The engine's own stylesheet, carried by the engine's own chunk. It is here
// rather than on the page because the buttons, the ring and the live region are
// the engine's DOM: a page that forgot the import would ship a HUD with no
// focus indicator, which is the one failure this project has already paid for
// twice (CLAUDE.md §7).
import "../../styles/backlot-hud.css";

/** What the canvas says it is while the hub is what is on it. */
const HUB_LABEL =
  "A view from above the backlot: a circular floor with six doors standing in a ring and a figure " +
  "in the middle. The buttons over this picture open the doors, and the arrow keys walk.";

/** How long a leaf is given to swing before the door does what it is for. */
const OPEN_MILLISECONDS = 420;

/**
 * What a door's window has to measure once the camera has come in, in CSS
 * pixels. The whole of the approach-zoom's specification.
 *
 * The ring does not move and the windows do not grow; the camera comes to them.
 * At 1920x1080 the hub resolves about 41 px per metre and a 1.38 x 2.45 m
 * opening lands at 57 x 62 px, which is a picture you can see is there and not
 * one you can watch. Coming in until it clears this costs a little over 2x —
 * which is the push as it was asked for — and the same floor at 390x844 costs
 * about 5.5x, because the resting ring there is fitted to a 390 px width. The
 * pixels are the requirement and the multiple is what they cost; camera.ts's
 * `focusRadiusFor` turns one into the other and the receipt reports both.
 */
const WINDOW_FLOOR = { wide: 120, tall: 200 };

/** Metres of floor kept in shot past the nearest thing a room registered. */
const NEAR_MARGIN = 0.4;
/** And metres of wall kept above the highest of them, so a picture is not
 *  guillotined by the top of the frame. */
const HEAD_ROOM = 1.05;
/** How far inside the near edge of the shot the figure is allowed to walk. */
const EDGE_OF_SHOT = 0.6;
/** And how far off a wall it stops, so it never stands inside one. */
const WALL_CLEARANCE = 0.6;

/**
 * How far the figure's lit surfaces are held under their own tokens while it is
 * inside a room.
 *
 * A room adds practical lights the hub does not have, and it puts the figure
 * four times closer to the camera, so a level chosen against the ring does not
 * survive the crossing. Measured on the composite at 1920x1080, dark, HUD
 * hidden, 40x40 cells — the metric the room's own brightness line is written in:
 *
 *   the head's cell      145.3, rank 2 of 1104, tying the brightest front-wall
 *                        screen and beating the other four
 *   the front wall       145.3 / 143.7 / 143.6 / 143.1 / 134.6
 *
 * The contract says the five screens are the brightest thing in the room and
 * nothing painted may out-shine them, and at 1.0 the figure does. 0.55 is the
 * factor that lands the head's cell at 110.2 — rank 8, with the seven cells above
 * it all front wall — which is clear of the dimmest screen by a wider margin
 * than the drift the idle camera puts on the reading. It is a measurement rather
 * than a taste; the runs are in receipts/rig-3d/a2-hub.md.
 *
 * The first explanation for this was that the figure lacked the room Painter's
 * exposure gain. That was never tested and it was wrong: in the dark theme that
 * gain computes to min(1, 0.13 / 0.0016) = 1, so the room's own surfaces are not
 * stopped down either and matching it would change nothing.
 *
 * Only the lit surfaces move; the gold ring at the figure's feet is unlit and
 * keeps its value, which is what stops "not the brightest" turning into "not
 * findable".
 */
const ROOM_EXPOSURE = 0.55;

const wait = (milliseconds: number) => new Promise<void>((settle) => window.setTimeout(settle, milliseconds));

/** "The machine room" mid-sentence is "the machine room". Only the first letter,
 *  and only when the second one is already lower case, so a room named after an
 *  initialism keeps its capitals. */
function lowerArticle(title: string): string {
  if (title.length < 2 || title[1] !== title[1]?.toLowerCase()) return title;
  return title[0]!.toLowerCase() + title.slice(1);
}

export async function createBacklot(options: BacklotOptions): Promise<BacklotEngine> {
  const { canvas, hud, payload, rooms } = options;
  const { manifest, assetPrefix } = payload;

  const colours = createColourReader();
  const motion = createMotionPreference();
  const stage = createStage(canvas, colours);
  const camera = createGodCamera();
  const layers = createLayers(assetPrefix);
  // The deck frames a hotspot that carries one before it lets it act. Declared
  // here rather than in hotspots.ts because the camera is the engine's, and a
  // button has no business knowing one exists.
  const hotspots = createHotspots(hud, camera.camera, {
    frame: (spec) => arriveAt(spec),
    unframe: (spec) => leaveOf(spec),
  });

  stage.scene.add(camera.rig);

  const hub = createHub(manifest.doors, stage.palette, { colours, layers });
  stage.scene.add(hub.group);

  const player = createFigure({
    palette: stage.palette,
    locate: (id) => hotspots.locate(id),
    reducedMotion: () => motion.reduced,
  });
  stage.scene.add(player.group);
  player.setBounds(hub.walkableRadius);
  player.placeAt(hub.middle, new Vector3(0, 0, -1));

  camera.frame(hub.bounds.centre, hub.bounds.radius, hub.bounds.height, hub.bounds.standRadius);

  // The canvas is a picture with a description, not a control: every control
  // over it is a real button in the HUD.
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", HUB_LABEL);

  /** What the canvas says it is right now. One function so the three states —
   *  the ring, a room, a room with the camera close on something — cannot
   *  drift out of step with each other. */
  function describeCanvas(): void {
    const place = mounted ? mounted.room.intro : HUB_LABEL;
    // Three states, and the third one was missing. A room moves the camera
    // through `RoomContext.focus`, which hands over a point and a radius and no
    // name — so there was nothing to put after "close on", and the canvas went
    // on describing the wide shot while the camera was at the wall. A reader on
    // a screen reader got no notice that anything had moved, and a check
    // looking for the one published condition the row hangs off found the
    // resting sentence.
    //
    // It says the state rather than inventing a name for it. The framing target
    // is a point; the nearest control to it is not what is being framed — on
    // the front wall that would name one rung of five — and the room has
    // already announced what the figure is at through the live region, which is
    // where a caption belongs.
    //
    // `closeUp` rather than `camera.framed`, and the difference is a lag that
    // never resolves: `release` is a journey, so `framed` stays true for the
    // 620 ms the camera spends coming back out — and nothing describes the
    // canvas again when it arrives. Escape out of the monitor left the room
    // saying "The camera has come in close" for the rest of the visit. This is
    // the state the engine **intends**, which is what a description should be.
    const close = framedLabel
      ? ` The camera is close on: ${framedLabel}. Escape pulls back.`
      : closeUp
        ? " The camera has come in close. Escape pulls back."
        : "";
    canvas.setAttribute("aria-label", `${place}${close}`);
  }

  // ------------------------------------------------------------------ state

  /**
   * A door, as this file understands one: a standing mark, a leaf that swings,
   * and a page or a room behind it. The ring has six and the Lectures corridor
   * has twelve, and they are one shape here rather than two implementations.
   *
   * They were not, until the corridor. Everything a press is — the walk, the
   * leaf, `rel="prefetch"` fired at the moment of the press, and Escape stopping
   * the figure where it stands — lived in `use` keyed on `hub.find`, so a room
   * that wanted a door could have the geometry and not the behaviour. Reusing it
   * cost this record and the `scoped` flag on it; reimplementing it would have
   * cost twelve doors that look like the ring's and answer Escape differently.
   */
  interface Pressable {
    id: string;
    /** What the live region calls it mid-sentence: "Lectures", "week 5". */
    name: string;
    standing: Vector3;
    /** Already base-resolved by the page. */
    href: string;
    /** The room it opens into instead of leaving, when it opens one. */
    roomId?: string;
    /** True for a door a mounted room built. A door in the ring cannot be
     *  pressed from inside a room, and a room's door does not outlive its room:
     *  the same rule the hidden buttons already enforce, stated where the act
     *  is rather than where the control is. */
    scoped: boolean;
    /** So the press can take the control out of service while it runs. */
    handle?: Hotspot;
    setOpen(open: boolean, instant: boolean): void;
  }
  const pressables = new Map<string, Pressable>();
  /** The doors the mounted room handed over, kept as they were given so their
   *  framing radius can be re-derived against a viewport that has changed and
   *  their name boards can be kept out from under the buttons. */
  const roomDoors: RoomDoor[] = [];

  let mounted: { room: BacklotRoom; group: Group; teardown: (() => void)[]; fromDoorId: string | null } | null = null;
  const roomFrames = new Set<(delta: number, elapsed: number) => void>();
  const doorHandles = new Map<string, Hotspot>();
  let busy = false;
  /** Bumped by anything that countermands a door in progress, so an `await`
   *  that comes back to find the reader has pressed Esc stops rather than
   *  finishing a navigation nobody is waiting for any more. */
  let generation = 0;
  /** A figure standing in a doorway does not re-open it. It has to leave every
   *  threshold once before walking into one counts again. */
  let doorsArmed = true;
  /** The same bargain for a framing: walking away drops it, but only once the
   *  figure has actually been near the thing. Enter from across the room frames
   *  something the figure is nowhere near, and that framing has to survive. */
  let framingArmed = false;
  let disposed = false;
  let aimYaw = 0;
  let aimPitch = 0;
  /** The label of whatever the camera is close on, or null for the wide view. */
  let framedLabel: string | null = null;
  /** And whether the camera is meant to be close on anything at all, which is
   *  the room's framings as well as the engine's. Not `camera.framed`: see
   *  `describeCanvas`. */
  let closeUp = false;
  /** Something the reader has just backed out of. A room frames from a
   *  hotspot's proximity, and a room also walks the figure to the thing it has
   *  just been asked about — so an Esc pressed while that walk is still running
   *  used to be undone by the arrival a moment later, and the reader could press
   *  Esc twice and still be nose-first against the monitor. A request to frame
   *  this again is ignored until the figure has actually been away from it. */
  let refused: { at: Vector3; clear: number } | null = null;
  /** The hotspot the camera is currently on, by id, so a `focusout` that lands
   *  after the next button's `focusin` can tell whether it is releasing the
   *  framing it made or somebody else's. */
  let framedId: string | null = null;
  /** And the door whose clip is running, which is at most one. */
  let watchedDoorId: string | null = null;
  /**
   * The door press that is in flight, or null.
   *
   * A press is not one act: it is a walk, a leaf swinging, and then either a
   * room or a navigation, and between the press and the last of those is about
   * two and a half seconds of the reader watching a figure cross a floor. That
   * stretch is deliberate — the walk is the point — but it has to be possible
   * to change your mind in it, and until this existed it was not: `escape`
   * pulled the camera back and returned, and the walk it left behind went on
   * and navigated.
   */
  let pressing: Pressable | null = null;
  /** The door the figure is standing at, which is what a window-level Enter
   *  goes through. Kept from the proximity crossings rather than searched for,
   *  so it is the same answer the announcement was made from. */
  let atDoorId: string | null = null;
  /**
   * True while the engine is moving the keyboard itself rather than the reader
   * moving it.
   *
   * Leaving a room puts focus back on the door it came out of, because a
   * control must not drop the reader on `<body>`. That is a hand-back, not an
   * arrival: the reader pressed Escape to get out, and being pushed straight
   * back in on the door they just left is the opposite of what they asked for.
   * Watched happen — the canvas came back from the machine room saying "The
   * camera is close on: Open the Studio door".
   */
  let handingFocus = false;

  /** Move the keyboard somewhere without it counting as the reader arriving. */
  function handFocusTo(element: HTMLElement): void {
    handingFocus = true;
    try {
      element.focus();
    } finally {
      handingFocus = false;
    }
  }

  const announce = (message: string) => hotspots.announce(message);

  // --------------------------------------------------------------- arriving

  /**
   * Where the camera goes when a reader arrives at this hotspot.
   *
   * A door's framing is not its button's point. The button is parked on the
   * middle of the leaf at head height and the thing being read is the window,
   * 0.26 m lower, and it is read square on — so the target is the opening's own
   * centre and the direction is the door's outward normal. Everything else in
   * the backlot marks the thing it is about, so everything else frames its own
   * position, which is what the contract says `focus` means.
   */
  function framingFor(spec: HotspotSpec): { target: Vector3; radius: number; normal: Vector3 | undefined } {
    const radius = spec.focus?.radius ?? 1;
    const door = hub.find(spec.id);
    // The direction comes off the spec either way. A door only overrides where
    // the camera looks, not which way it faces — two sources for the normal is
    // how the negate below ended up written on a field nothing read.
    return { target: door ? door.windowCentre : spec.position, radius, normal: spec.focus?.normal };
  }

  /**
   * A reader has come to this hotspot. The camera comes in; if there is
   * something behind the window worth watching, it starts.
   *
   * The three ways of arriving — walking the figure up, the keyboard landing on
   * the button, and pressing it — all end here, and that equivalence is the
   * accessibility of the thing rather than a tidiness: a reader on a keyboard
   * gets the door framed and the clip running, not a description of somebody
   * else getting it. `HotspotSpec.focus` and `HotspotHooks.frame` both say so.
   */
  async function arriveAt(spec: HotspotSpec): Promise<void> {
    if (!spec.focus || disposed || handingFocus) return;
    const here = framingFor(spec);
    framedId = spec.id;
    framedLabel = spec.label;
    closeUp = true;
    describeCanvas();
    await camera.focusOn(here.target, here.radius, here.normal, motion.reduced);
    if (disposed || framedId !== spec.id) return;
    framingArmed = false;
    // Only now. The still is what hangs in the window, and the clip decodes once
    // the window is worth watching — which is the state the line above has just
    // arrived at, not the moment somebody set off for it. The heaviest of them
    // is 4.9 MB, and starting it on approach rather than on arrival would spend
    // that on every reader who walked past.
    //
    // And not at all for a reader who asked for less motion. The machine room's
    // front wall already holds this line — squaring up to a screen there ends
    // whatever was playing and starts nothing, because nothing plays itself
    // under the preference — and a clip that begins on its own is the plainest
    // case the preference covers. The window keeps its still, no decoder is
    // allocated, and the reader has lost nothing that was ever a still's job.
    if (motion.reduced) return;
    void watch(spec.id);
  }

  /** Start the clip behind a door's window, if that is what this hotspot is. */
  async function watch(id: string): Promise<void> {
    if (!hub.find(id)) return;
    if (watchedDoorId && watchedDoorId !== id) hub.unwatch(watchedDoorId);
    watchedDoorId = id;
    await hub.watch(id);
  }

  /** And let it go. Called from every way out there is, which is the only way to
   *  be sure a decoder does not outlive the reason for it. */
  function dropWatch(): void {
    if (!watchedDoorId) return;
    hub.unwatch(watchedDoorId);
    watchedDoorId = null;
  }

  /** The reader has left this hotspot — Tabbed off it, or walked out of reach.
   *  Ignored unless it is the one the camera is actually on. */
  function leaveOf(spec: HotspotSpec): void {
    if (framedId !== spec.id) return;
    releaseFraming(false);
  }

  /**
   * Drop the framing outright: no travel, no announcement, nothing left behind.
   *
   * What crossing between the hub and a room does, in both directions. Leaving a
   * room already did it; **entering one did not**, and a door's push is a
   * framing, so pressing a door while the camera was close on it carried that
   * framing into the machine room — which arrived with its camera on a window
   * eleven metres outside its own walls, its five screens already at the size
   * the wall push gives them, and its labels laid out as if a reader had asked
   * for them. Every number I took in that room was taken through it. Doors had
   * no framing before this round, so there was nothing to carry.
   */
  function cutFraming(): void {
    camera.release(true);
    dropWatch();
    framingArmed = false;
    framedId = null;
    framedLabel = null;
    closeUp = false;
    describeCanvas();
  }

  /** Back to the fixed god view, if there is anything to come back from. */
  function releaseFraming(speak: boolean): boolean {
    if (!camera.framed) return false;
    const was = camera.framedTarget;
    const reach = Math.max(camera.framedRadius * 6, 3);
    camera.release(motion.reduced);
    // The clip goes with the framing, whichever end the release came from — a
    // walk away, a Tab away, Esc, leaving for a room, or the engine being torn
    // down. One place, so there is no way out that forgets.
    dropWatch();
    framingArmed = false;
    framedId = null;
    framedLabel = null;
    closeUp = false;
    describeCanvas();
    // Only a release the reader asked for countermands a pending arrival. The
    // walk-away rule calls this too, and there the figure is already clear.
    if (speak && was) refused = { at: was.clone(), clear: reach };
    if (speak) announce("Pulled back.");
    return true;
  }

  /** Whether the keyboard is currently on something in the HUD. Read before
   *  anything is hidden or removed: a control must not take focus away from the
   *  person who just used it, and it must not steal focus from someone who was
   *  not using it (CLAUDE.md §7). */
  const keyboardInHud = (): HTMLElement | null => {
    const active = document.activeElement;
    return active instanceof HTMLElement && hud.contains(active) ? active : null;
  };

  // ------------------------------------------------------------------ rooms

  function unmount(): void {
    if (!mounted) return;
    const leaving = mounted;
    mounted = null;
    for (const handler of leaving.teardown) {
      try {
        handler();
      } catch (error) {
        console.warn("backlot: a room's teardown threw", error);
      }
    }
    roomFrames.clear();
    // The room's doors go with the room, and so does whatever the figure was
    // standing at. Otherwise a press could reach a door that is no longer in the
    // scene, and the ring would come back with the reader apparently at one.
    for (const door of roomDoors) pressables.delete(door.hotspot.id);
    roomDoors.length = 0;
    atDoorId = null;
    refreshClearances();
    // A room left while the camera was close on something does not get to keep
    // the framing either: the hub is only ever seen from the god view.
    cutFraming();
    refused = null;
    // A room that forgot to release a clip does not get to keep the decoder.
    // `cutFraming` above took the hub's; this takes the room's.
    layers.releaseVideos();
    hotspots.endScope();
    stage.scene.remove(leaving.group);
    releaseSubtree(leaving.group);
  }

  async function enterRoom(roomId: string): Promise<void> {
    const room = manifest.rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      console.warn(`backlot: no room called ${roomId} in the manifest`);
      return;
    }
    const build = rooms[roomId];
    if (!build) {
      // Not an error: the door falls back to being a link to the page the room
      // stands in for, which is where it was always going to take you.
      console.warn(`backlot: no builder registered for ${roomId}, so its door stays a link`);
      return;
    }
    if (mounted) returnToHub();
    // The hub's camera does not cross the threshold. See `cutFraming`.
    cutFraming();
    // Nor does the door the reader was standing at: a window-level Enter inside
    // a room must reach one of the room's doors or nothing, never the ring's.
    atDoorId = null;

    const pressed = keyboardInHud();
    const group = new Group();
    const teardown: (() => void)[] = [];
    const fromDoorId = hub.doors.find((entry) => entry.door.roomId === roomId)?.door.id ?? null;
    mounted = { room, group, teardown, fromDoorId };
    stage.scene.add(group);

    // Everything registered from here until the room is left belongs to it.
    // The way out is the engine's, registered first so it is the first room
    // control in Tab order and so a room that builds nothing is still a room
    // you can leave.
    hotspots.beginScope();
    const leave = hotspots.registerOwn({
      id: `${room.id}:leave`,
      label: "Back to the backlot",
      position: new Vector3(0, 1.7, 5.6),
      activate: () => returnToHub(),
    });

    player.placeAt(new Vector3(0, 0, 5), new Vector3(0, 0, -1));

    const context: RoomContext = {
      root: group,
      room,
      assetPrefix,
      colours,
      hotspots: hotspots.api,
      layers,
      player,
      announce,
      async focus(request) {
        // Backed out of a moment ago and not left since: the reader's Esc wins
        // over a proximity that is only now catching up with it.
        if (refused && request.target.distanceTo(refused.at) < 0.5) return;
        await camera.focusOn(request.target, request.radius, request.normal, motion.reduced);
        framingArmed = false;
        closeUp = true;
        describeCanvas();
      },
      unfocus: () => void releaseFraming(false),
      // A getter rather than a snapshot: the contract types this as a boolean,
      // and a boolean read once at build time would leave a room animating at
      // a reader who turned the preference on after the room was built.
      get reducedMotion() {
        return motion.reduced;
      },
      onFrame(handler) {
        roomFrames.add(handler);
        return () => roomFrames.delete(handler);
      },
      door(entry) {
        const id = entry.hotspot.id;
        roomDoors.push(entry);
        pressables.set(id, {
          id,
          name: entry.name,
          standing: entry.standing,
          href: entry.href,
          scoped: true,
          handle: entry.hotspot,
          setOpen: entry.setOpen,
        });
        // The radius the window's pixel floor costs at the canvas as it is now.
        // A room is built with the viewport already measured, so this is not
        // waiting for a resize that may never come.
        entry.focus.radius = focusRadiusFor(entry.windowMetres, WINDOW_FLOOR, {
          width: sizer.width,
          height: sizer.height,
        });
        refreshClearances();
        return {
          press: () => void use(id),
          near(at: boolean) {
            atDoorId = at ? id : atDoorId === id ? null : atDoorId;
          },
        };
      },
      leave: () => returnToHub(),
      onDispose(handler) {
        teardown.push(handler);
      },
    };

    try {
      await build(context);
    } catch (error) {
      // A room that throws leaves the backlot standing: the reader gets the hub
      // back rather than a frozen canvas.
      console.warn(`backlot: the ${roomId} builder threw`, error);
      returnToHub();
      return;
    }
    if (disposed || mounted?.group !== group) return;

    hub.group.visible = false;
    // The figure crosses into a differently lit place, so its exposure crosses
    // with it. Set here rather than at construction because the hub and a room
    // are two different lighting states for one object.
    player.setExposure(ROOM_EXPOSURE);

    // A room gets its own resting view rather than the hub's.
    //
    // The hub is a ring you look down into and its camera is fitted to a
    // cylinder. A room is a box with its content on the walls and on one desk,
    // and fitting it the hub's way spent the frame on three things nobody needs
    // to see: the ceiling, the empty floor behind the reader, and — because a
    // cylinder fit is symmetric about a floor-level pivot — as much empty air
    // under the floor as there was room above it. Measured on the machine room
    // at 1920x1080, the three together cost more than half the scale: 85 px per
    // metre as it was against 128 with them taken out, which is the desk going
    // from 153 px across to 231.
    //
    // What stays in shot: the room's full width, everything from the far wall
    // to just past the furthest thing the room registered, and up to a head
    // above the highest of them. What goes: the ceiling and the near floor.
    const box = new Box3().setFromObject(group);
    if (box.isEmpty()) {
      camera.frame(hub.bounds.centre, hub.bounds.radius, hub.bounds.height, hub.bounds.standRadius);
      player.setBounds(hub.walkableRadius);
    } else {
      const min = box.min.clone();
      const max = box.max.clone();
      const marks = hotspots.scopedBounds();
      if (marks) {
        max.z = Math.min(max.z, marks.max.z + NEAR_MARGIN);
        max.y = Math.min(max.y, marks.max.y + HEAD_ROOM);
      }
      camera.frameBox(min, max);
      // Nothing walks out of the shot. The near edge of the composition is the
      // near edge of the floor as far as the figure is concerned, which is what
      // keeps this a god view of a room rather than a camera that follows.
      //
      // A box rather than a disc, and that is not tidiness: the pieces on a
      // wall stand at the room's corners, and a disc inscribed in a square room
      // stops 0.9 m short of them — the figure could not reach the outer two
      // clips on the front wall at all.
      player.setWalkableBox(
        new Vector3(min.x + WALL_CLEARANCE, 0, min.z + WALL_CLEARANCE),
        new Vector3(max.x - WALL_CLEARANCE, 0, max.z - EDGE_OF_SHOT),
      );
    }

    // The engine's way out is a floor, not a second door. A room whose manifest
    // has a `leave-room` interactive is expected to register a hotspot for it,
    // and two buttons saying the same thing in the same list is a worse answer
    // than either one alone — so if the room built its own, the engine's goes.
    const ownExit = room.interactives.find((interactive) => interactive.kind === "leave-room");
    const roomExit = ownExit ? hotspots.buttonFor(ownExit.id) : null;
    if (roomExit) leave.dispose();

    hotspots.setBaseHidden(true);
    // Hiding the hub's buttons blurs whichever one was pressed, so the keyboard
    // is handed to the way out rather than dropped on <body>.
    if (pressed) handFocusTo(roomExit ?? leave.button);
    describeCanvas();
    // Record every new hotspot's near/far state without firing anything. The
    // figure is put down where the engine chose, not where the reader walked,
    // so nothing about that position is an arrival — and a room that frames the
    // camera on a proximity would otherwise open on the thing it frames instead
    // of on the room.
    hotspots.track(player.position, true);
    announce(`Inside ${lowerArticle(room.title)}.`);
  }

  function returnToHub(): void {
    if (!mounted) return;
    generation += 1;
    const door = mounted.fromDoorId ? hub.find(mounted.fromDoorId) : undefined;
    const pressed = keyboardInHud();

    hub.group.visible = true;
    hotspots.setBaseHidden(false);
    player.setExposure(1);
    unmount();

    camera.frame(hub.bounds.centre, hub.bounds.radius, hub.bounds.height, hub.bounds.standRadius);
    player.setBounds(hub.walkableRadius);
    if (door) {
      player.placeAt(door.standing, new Vector3().copy(door.outward).multiplyScalar(-1));
      hub.setOpen(door.door.id, false, motion.reduced);
      hub.setNear(door.door.id, false);
      doorsArmed = false;
      // Put down at the door rather than having walked to it, so no proximity
      // crossing fires and nothing else would set this. Enter still has to
      // reach the door the reader is visibly standing at.
      atDoorId = door.door.id;
    } else {
      player.placeAt(hub.middle, new Vector3(0, 0, -1));
      atDoorId = null;
    }

    // The room's buttons have gone, so anything that was focused in there is no
    // longer in the document. Put the keyboard on the door it came out of.
    const target = door ? hotspots.buttonFor(door.door.id) : null;
    if (pressed && !pressed.isConnected && target) handFocusTo(target);

    describeCanvas();
    announce(door ? `Back on the backlot, at the ${door.door.label} door.` : "Back on the backlot.");
  }

  // ------------------------------------------------------------------ doors

  /** Pages already asked for. A reader who presses the same door twice, or
   *  changes their mind and presses it again, does not ask for it twice. */
  const prefetched = new Map<string, HTMLLinkElement>();

  /**
   * Ask the browser for the page behind a door **at the moment the door is
   * pressed**, not when the figure gets there.
   *
   * The walk is 2.5 s of wall clock in which the network is doing nothing, and
   * the thing it ends in is a full document load. `rel="prefetch"` with
   * `as="document"` is the cheap half of what is available here: it puts the
   * response in the cache so the navigation can be served from it, and it costs
   * one request for a page the reader has already said they want. It does
   * **not** fetch that page's stylesheet or its scripts, so it can only ever
   * buy the document's own round trip — which is why the receipt measures what
   * that is worth rather than asserting it is worth something.
   *
   * Only for a door that leaves the backlot. The Studio door mounts a room out
   * of a chunk that is already in the tab, and prefetching /studio/ for it would
   * be spending a request on a page the press is not going to.
   */
  function prefetchPage(href: string): void {
    if (prefetched.has(href)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    // Without `as` the browser has no destination for the request and Chrome
    // treats it as a subresource, which is a different cache entry from the one
    // the navigation will look in.
    link.as = "document";
    link.href = href;
    document.head.append(link);
    prefetched.set(href, link);
  }

  /**
   * Esc, pressed while a door press is walking or opening.
   *
   * It stops the figure **where it stands** rather than sending it anywhere:
   * "not that door" is what was asked, and walking back to the middle of the
   * ring is a second decision the reader did not make. The leaf goes back, the
   * camera comes off the door the press had framed, and the `generation` bump
   * is what makes the `await` inside `use` come back to a press that is no
   * longer anybody's.
   *
   * Returns whether there was one, so `escape` can fall through to the framing
   * and the room when there was not.
   */
  function stopPress(): boolean {
    const press = pressing;
    if (!press) return false;
    pressing = null;
    generation += 1;
    player.placeAt(player.position.clone());
    press.setOpen(false, motion.reduced);
    releaseFraming(false);
    announce(`Stopped. The ${press.name} door is closed again.`);
    return true;
  }

  async function use(doorId: string): Promise<void> {
    if (busy) return;
    const entry = pressables.get(doorId);
    if (!entry) return;
    // A door in the ring cannot be pressed from inside a room, and a room's door
    // cannot be pressed from the ring. This replaces the bare `mounted` guard,
    // which said the first and could not say the second.
    if (entry.scoped !== Boolean(mounted)) return;
    const mine = ++generation;
    busy = true;
    pressing = entry;
    // aria-disabled, never the `disabled` property: `disabled` blurs the
    // element it is set on, and the reader loses the ring on the control they
    // just pressed (CLAUDE.md §7). The guard that actually stops a second
    // press is `busy`.
    entry.handle?.setEnabled(false);
    // Where this press is going, decided **here** rather than after the walk,
    // because the point of asking now is to spend the walk on the fetch. It is
    // the same test the end of this function makes, and it is one expression so
    // the two cannot drift.
    const roomId = entry.roomId;
    const intoARoom = Boolean(roomId && rooms[roomId]);
    if (!intoARoom) prefetchPage(entry.href);
    try {
      if (player.position.distanceTo(entry.standing) > 0.3) await player.walkTo(entry.standing);
      if (disposed || generation !== mine) return;

      entry.setOpen(true, motion.reduced);
      announce(`Opening the ${entry.name} door.`);
      if (!motion.reduced) await wait(OPEN_MILLISECONDS);
      if (disposed || generation !== mine) return;

      if (intoARoom && roomId) {
        // Cleared before the room rather than after it. `stopPress` used to
        // refuse whenever a room was mounted, on the grounds that a press which
        // had got that far was over — which stopped being a safe thing to say
        // the moment a room had doors of its own. This is the same statement
        // made where it is true: this press is finished, the room's are not it.
        pressing = null;
        await enterRoom(roomId);
        return;
      }
      // Already base-resolved by the page: the island never calls withBase and
      // never writes a root-absolute URL (CLAUDE.md §4). A room door with no
      // builder registered lands here too, which is the honest fallback — the
      // Studio door still takes you to the Studio.
      window.location.assign(entry.href);
    } finally {
      busy = false;
      pressing = null;
      entry.handle?.setEnabled(true);
    }
  }

  const doorSpecs = new Map<string, HotspotSpec>();
  for (const entry of hub.doors) {
    const spec: HotspotSpec = {
      id: entry.door.id,
      label:
        entry.door.kind === "room"
          ? `Open the ${entry.door.label} door into the machine room`
          : `Open the ${entry.door.label} door`,
      position: entry.anchor,
      radius: DOOR_REACH,
      // Where you are, and how to go on.
      //
      // The second sentence is new and it is not decoration. Walking up used to
      // *be* the navigation, so there was nothing to say; now walking up frames
      // the window and starts the clip and going through is a separate act, and
      // a reader who is not told that is worse off than before the push existed.
      // A live region holds one message, so this is the whole of it: two short
      // sentences, no punctuation games, and the second one is only true because
      // `onActivate` above makes Enter reach the door from where a walking
      // reader actually is.
      arrival: `At the ${entry.door.label} door. Press Enter to open it.`,
      // Seeded with the opening's own half-extent and replaced by
      // `refreshDoorFocus` the moment the viewport has been measured — the
      // radius that delivers the window's floor depends on the canvas, and the
      // canvas is not known until the resizer below has run.
      focus: {
        radius: Math.max(entry.windowMetres.wide, entry.windowMetres.tall) / 2,
        // **Inward**, not outward. `FocusRequest.normal` is the face's own
        // outward normal, and a door's window faces the middle of the ring —
        // which is where the reader is standing. Handing the camera
        // `entry.outward` sends it over the top of the door to look back in from
        // outside, and the window still reads (the back pane is turned rather
        // than mirrored, on purpose) so the shot looks plausible until you read
        // anything else in it: every name board on the ring comes out
        // back-to-front, including the framed door's own. Seen, in
        // a3-plate-policies-desktop-dark-push-full.png, before this line had the
        // negate on it.
        normal: entry.outward.clone().negate(),
      },
      activate: () => void use(entry.door.id),
      onProximity(near) {
        hub.setNear(entry.door.id, near);
        atDoorId = near ? entry.door.id : atDoorId === entry.door.id ? null : atDoorId;
        // Walking up to a door is arriving at it, and arriving is what frames
        // it. It is **not** what opens it, and that changed this round.
        //
        // It used to go straight through `use`, so a walk to a door was a
        // navigation: the camera had nowhere to push to and nothing to push
        // for, because the page was leaving. Arriving and activating are two
        // events now — you walk up and the window comes to you, and the button
        // over the door is what takes you through it. Every way in still ends
        // at the same `use`; a walk is no longer one of them.
        if (near) {
          if (!doorsArmed || busy || mounted) return;
          void arriveAt(spec);
          return;
        }
        // And walking away puts it back, which is the half of this a keyboard
        // reader gets by Tabbing off the button.
        leaveOf(spec);
      },
    };
    doorSpecs.set(entry.door.id, spec);
    const handle = hotspots.api.register(spec);
    doorHandles.set(entry.door.id, handle);
    pressables.set(entry.door.id, {
      id: entry.door.id,
      name: entry.door.label,
      standing: entry.standing,
      href: entry.door.href,
      ...(entry.door.roomId ? { roomId: entry.door.roomId } : {}),
      scoped: false,
      handle,
      setOpen: (open, instant) => hub.setOpen(entry.door.id, open, instant),
    });
    // What the door's button marks the surface of. A door hotspot is parked on
    // the leaf's middle, which is not the window, and the window is the only
    // part of a door that carries a colour worth measuring — a still, a
    // workflow, or a plate with the door's name on it.
    hotspots.trackSurface(entry.door.id, entry.pane);
  }
  // And the six name boards, which are not anybody's published surface but are
  // the one part of a door that has to stay readable without hovering.
  //
  // A room's doors have boards for the same reason and they go in the same list,
  // which is why this is a function rather than a call: `keepClear` replaces the
  // whole list, so a room that set its own would have taken the ring's out and
  // never put them back.
  const hubBoards = hub.doors
    .map((entry) => entry.board)
    .filter((board): board is NonNullable<typeof board> => board !== null);
  function refreshClearances(): void {
    hotspots.keepClear([
      ...hubBoards,
      ...roomDoors.map((door) => door.board).filter((board): board is NonNullable<typeof board> => Boolean(board)),
    ]);
  }
  refreshClearances();

  // ------------------------------------------------------------------ input

  function escape(): void {
    // A press already on its way to a navigation is the biggest thing Esc can
    // be countermanding, so it goes first — and it takes the framing with it,
    // because a camera left pushed in on a door the figure is no longer walking
    // to is a shot of nothing. Before this, Esc during a walk released the
    // framing, returned, and let the navigation happen anyway.
    if (stopPress()) return;
    // Then the framing, then the room. A reader who has come in close on
    // something expects Esc to pull back, not to throw them out of the room.
    if (releaseFraming(true)) return;
    if (mounted) {
      returnToHub();
      return;
    }
    generation += 1;
    doorsArmed = false;
    void player.walkTo(hub.middle).then(() => announce("Back in the middle of the ring."));
  }

  const input = createInput({
    canvas,
    camera,
    drive: (direction) => player.drive(direction),
    walkTo: (point) => {
      generation += 1;
      void player.walkTo(point);
    },
    onEscape: escape,
    // Enter with nothing in the HUD focused. It reaches the same `use` a click
    // and an Enter on the button reach, and it does nothing at all unless the
    // figure is standing at a door — which is the state the live region has just
    // said "press Enter to open it" about.
    onActivate: () => {
      if (atDoorId) void use(atDoorId);
    },
    aim: (yaw, pitch) => {
      aimYaw = yaw;
      aimPitch = pitch;
    },
    reducedMotion: () => motion.reduced,
  });

  // ------------------------------------------------------------------ sizes

  /**
   * Re-derive every door's framing radius against the canvas as it is now.
   *
   * The push is specified in pixels — the window has to clear `WINDOW_FLOOR`
   * once the camera is there — and a radius in metres only delivers that for one
   * viewport. So the number on the spec is the one that is true for the canvas
   * the reader has, and a phone that becomes a tablet gets it again. Written
   * onto `spec.focus.radius` rather than kept beside it, because that is the
   * field the deck and any check actually read.
   */
  function refreshDoorFocus(): void {
    const view = { width: sizer.width, height: sizer.height };
    for (const entry of hub.doors) {
      const focus = doorSpecs.get(entry.door.id)?.focus;
      if (!focus) continue;
      focus.radius = focusRadiusFor(entry.windowMetres, WINDOW_FLOOR, view);
    }
    // And the doors a room built, which are the same arithmetic on the same
    // floor: "the window measures at least 120 x 200 px once the camera is
    // there" is a statement about a rectangle in metres and a canvas, and the
    // canvas is the engine's. A room writes its own radius once, at build time,
    // and then this owns it — `RoomDoor.focus` is handed over by reference so
    // that both halves are holding the same object.
    for (const door of roomDoors) door.focus.radius = focusRadiusFor(door.windowMetres, WINDOW_FLOOR, view);
  }

  const sizer = createResizer(canvas, (box) => {
    stage.renderer.setPixelRatio(box.pixelRatio);
    // `false`: never write an inline size back onto the canvas. The page owns
    // the box (backlot.css), and on a `dvh` stage an inline pixel height is a
    // feedback loop waiting for a phone's URL bar to slide away.
    stage.renderer.setSize(box.width, box.height, false);
    camera.resize(box.width, box.height);
    refreshDoorFocus();
    // A viewport crossing the phone breakpoint restyles the labels, so the
    // cached button boxes the parking uses are no longer the right size.
    hotspots.remeasure();
  });
  stage.renderer.setPixelRatio(sizer.pixelRatio);
  stage.renderer.setSize(sizer.width, sizer.height, false);
  camera.resize(sizer.width, sizer.height);
  refreshDoorFocus();

  // ------------------------------------------------------------- the themes

  const unwatchTheme = colours.onThemeChange(() => stage.repaint());
  const unwatchMotion = motion.onChange((reduced) => {
    if (!reduced) return;
    // Turning the preference on has to stop the motion already running, not
    // only the next lot: the camera goes level and the light stops breathing
    // on the frame after the flip.
    aimYaw = 0;
    aimPitch = 0;
    camera.aim(0, 0);
    // A framing halfway through its journey when the preference flips arrives
    // rather than carrying on travelling.
    camera.settleNow();
    stage.fill.intensity = stage.fillBaseIntensity;
  });

  // -------------------------------------------------------------- the frame

  let frame = 0;
  let previous = performance.now();
  let presented = 0;
  /** Last cap published per door, in tenths of a pixel, so the attribute is
   *  written when the number changes and not sixty times a second. */
  const publishedCap = new Map<string, number>();
  let publishedClips = -1;
  let publishedFramed: boolean | null = null;
  let settleReady: () => void = () => {};
  const ready = new Promise<void>((settle) => {
    settleReady = settle;
  });

  // Layer 1 for the hub: the six door windows. Deliberately after `ready` and
  // not before it — a still off the network, a graph reader pulled in on a
  // dynamic import and six canvases drawn with type on them are none of them
  // things the first frame owes anybody, and the budget's 2 s is measured
  // against a frame that is geometry and lights only. Every one of them may
  // come back empty, and empty leaves the window the flat fill it was built
  // with, the same bargain the rest of `layers` strikes.
  void ready.then(() => {
    if (disposed) return;
    void hub.dress().catch((error) => console.warn("backlot: a door window did not land", error));
  });

  function tick(now: number): void {
    frame = window.requestAnimationFrame(tick);
    // A tab that was in the background hands back a delta of several seconds,
    // which would teleport the figure across the floor on the first frame back.
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    const elapsed = now / 1000;
    const still = motion.reduced;

    if (sizer.width === 0 || sizer.height === 0) sizer.measure();

    if (!still) {
      // The whole of the idle camera: a third of the mouse's four degrees, on a
      // half-minute cycle. Under reduced motion neither term is evaluated and
      // the rig stays at exactly zero, which is the value the receipt reads.
      camera.aim(aimYaw + Math.sin(elapsed * 0.22) * 0.35, aimPitch);
      stage.fill.intensity = stage.fillBaseIntensity * (1 + Math.sin(elapsed * 0.9) * 0.12);
    }

    player.update(delta, elapsed);
    hub.update(delta);
    camera.update(delta);
    // Walking away puts the camera back on its own, which is what makes the
    // framing a place you stand rather than a mode you are stuck in.
    if (refused && Math.hypot(refused.at.x - player.position.x, refused.at.z - player.position.z) > refused.clear) {
      refused = null;
    }
    const framedAt = camera.framedTarget;
    if (framedAt) {
      const away = Math.hypot(framedAt.x - player.position.x, framedAt.z - player.position.z);
      const leaveAt = Math.max(camera.framedRadius * 6, 3);
      if (!framingArmed) framingArmed = away <= leaveAt;
      else if (away > leaveAt) releaseFraming(true);
    }
    hotspots.track(player.position);
    if (!doorsArmed && !mounted) {
      doorsArmed = hub.doors.every((entry) => entry.anchor.distanceTo(player.position) > DOOR_REACH);
    }
    for (const handler of roomFrames) {
      try {
        handler(delta, elapsed);
      } catch (error) {
        console.warn("backlot: a room's frame handler threw", error);
      }
    }

    stage.renderer.render(stage.scene, camera.camera);
    // After the render, not before: `render` is what brings the camera's world
    // matrices up to date, and parking off the previous frame's matrices would
    // leave every button one frame behind the picture it sits on.
    hotspots.park(sizer.width, sizer.height, camera.framedRect(sizer.width, sizer.height));

    // And the plates, for the same reason and under the same rule `setRect` is
    // under (engine/types.ts): a reading published on a button is taken from the
    // same projection the renderer used and in the same pass that parks the
    // button, or it does not go up. Both halves matter here — the camera that
    // measured this cap is the one that has just drawn the frame the word will
    // appear on, and the attribute lands beside the rect rather than a frame
    // behind it.
    //
    // It is the number rather than the decision, which is why there is no
    // `showingWord` anywhere: a cap height lets a check assert that the word is
    // there above eleven pixels and not below, and nothing sampling the
    // composite can tell those two apart — a 37 x 113 plate reads as the door's
    // own light with the word on it or off it.
    //
    // Only while the hub is what is on screen. Inside a room the doors are
    // hidden, and measuring what a hidden plate would project to is a number
    // about nothing.
    if (!mounted) {
      for (const reading of hub.readPlates(camera.camera, sizer.width, sizer.height)) {
        const shown = Math.round(reading.capPixels * 10);
        if (publishedCap.get(reading.id) === shown) continue;
        publishedCap.set(reading.id, shown);
        hotspots.setCap(reading.id, reading.capPixels);
      }
    }

    // What is alive, not what happened. A decoder that stopped drawing is still
    // a decoder; this counts the ones that still hold an element with a source
    // on it, and it is on the HUD rather than in a console so a check can read
    // it at the moment it cares about.
    const alive = layers.liveCount();
    if (alive !== publishedClips) {
      publishedClips = alive;
      hud.dataset.backlotClips = String(alive);
    }

    // Whether the camera is off its resting view at all, published as the state
    // and not as a consequence. "The row is owed once the camera is at the wall"
    // needs something to hang off, and the two things a check could otherwise
    // read are both wrong: the canvas's own sentence is prose, and a rect is a
    // size somebody has to know the resting value of to interpret.
    const close = camera.framed;
    if (close !== publishedFramed) {
      publishedFramed = close;
      if (close) hud.dataset.backlotFramed = "true";
      else delete hud.dataset.backlotFramed;
    }

    if (sizer.width > 0 && sizer.height > 0) {
      presented += 1;
      // The frame drawn last turn has been committed by the time this one runs,
      // so this is the first moment "presented" is true rather than hoped for.
      if (presented === 2) settleReady();
    }
  }

  frame = window.requestAnimationFrame(tick);

  return {
    ready,
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      dropWatch();
      unmount();
      input.dispose();
      sizer.dispose();
      unwatchTheme();
      unwatchMotion();
      hotspots.dispose();
      layers.dispose();
      player.dispose();
      hub.dispose();
      stage.dispose();
      motion.dispose();
      colours.dispose();
      for (const link of prefetched.values()) link.remove();
      prefetched.clear();
      canvas.removeAttribute("role");
      canvas.removeAttribute("aria-label");
      delete hud.dataset.backlotClips;
      delete hud.dataset.backlotFramed;
    },
  };
}
