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
import { createGodCamera } from "./camera";
import { createFigure } from "./player";
import { createHotspots } from "./hotspots";
import { createHub, DOOR_REACH } from "./hub";
import { createInput } from "./input";
import { createLayers } from "./layers";
import { createMotionPreference } from "./motion";
import { createResizer } from "./resize";
import { createStage, releaseSubtree } from "./scene";
import type { BacklotEngine, BacklotOptions, BacklotRoom, Hotspot, RoomContext } from "./types";
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
    async frame(spec) {
      if (!spec.focus) return;
      await camera.focusOn(spec.position, spec.focus.radius, spec.focus.normal, motion.reduced);
      framingArmed = false;
      framedLabel = spec.label;
      describeCanvas();
      // Deliberately not announced. A live region holds one message, and the
      // room announces what is on the thing the moment `activate` runs — the
      // caption off its own manifest, which is a better sentence than anything
      // the engine could assemble from a button's label. An engine
      // announcement here was measured being replaced within the same turn,
      // which is a message nobody ever hears. The state and the way out go on
      // the canvas's description instead, where they are not competing.
    },
  });

  stage.scene.add(camera.rig);

  const hub = createHub(manifest.doors, stage.palette);
  stage.scene.add(hub.group);

  const player = createFigure({
    palette: stage.palette,
    locate: (id) => hotspots.locate(id),
    reducedMotion: () => motion.reduced,
  });
  stage.scene.add(player.group);
  player.setBounds(hub.walkableRadius);
  player.placeAt(hub.middle, new Vector3(0, 0, -1));

  camera.frame(hub.bounds.centre, hub.bounds.radius, hub.bounds.height);

  // The canvas is a picture with a description, not a control: every control
  // over it is a real button in the HUD.
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", HUB_LABEL);

  /** What the canvas says it is right now. One function so the three states —
   *  the ring, a room, a room with the camera close on something — cannot
   *  drift out of step with each other. */
  function describeCanvas(): void {
    const place = mounted ? mounted.room.intro : HUB_LABEL;
    canvas.setAttribute(
      "aria-label",
      framedLabel ? `${place} The camera is close on: ${framedLabel}. Escape pulls back.` : place,
    );
  }

  // ------------------------------------------------------------------ state

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

  const announce = (message: string) => hotspots.announce(message);

  /** Back to the fixed god view, if there is anything to come back from. */
  function releaseFraming(speak: boolean): boolean {
    if (!camera.framed) return false;
    camera.release(motion.reduced);
    framingArmed = false;
    framedLabel = null;
    describeCanvas();
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
    // A room left while the camera was close on something does not get to keep
    // the framing either: the hub is only ever seen from the god view.
    camera.release(true);
    framingArmed = false;
    framedLabel = null;
    // A room that forgot to release a clip does not get to keep the decoder.
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
    const leave = hotspots.api.register({
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
        await camera.focusOn(request.target, request.radius, request.normal, motion.reduced);
        framingArmed = false;
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

    // The room decides its own size, so the camera is fitted to what the
    // builder actually put in the group rather than to a number agreed in
    // advance. An empty group falls back to the hub's framing.
    const box = new Box3().setFromObject(group);
    if (box.isEmpty()) {
      camera.frame(hub.bounds.centre, hub.bounds.radius, hub.bounds.height);
      player.setBounds(hub.walkableRadius);
    } else {
      const centre = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const radius = Math.max(Math.max(size.x, size.z) / 2, 1);
      camera.frame(new Vector3(centre.x, 0, centre.z), radius, Math.max(size.y, 1));
      player.setBounds(radius);
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
    if (pressed) (roomExit ?? leave.button).focus();
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
    unmount();

    camera.frame(hub.bounds.centre, hub.bounds.radius, hub.bounds.height);
    player.setBounds(hub.walkableRadius);
    if (door) {
      player.placeAt(door.standing, new Vector3().copy(door.outward).multiplyScalar(-1));
      hub.setOpen(door.door.id, false, motion.reduced);
      hub.setNear(door.door.id, false);
      doorsArmed = false;
    } else {
      player.placeAt(hub.middle, new Vector3(0, 0, -1));
    }

    // The room's buttons have gone, so anything that was focused in there is no
    // longer in the document. Put the keyboard on the door it came out of.
    const target = door ? hotspots.buttonFor(door.door.id) : null;
    if (pressed && !pressed.isConnected && target) target.focus();

    describeCanvas();
    announce(door ? `Back on the backlot, at the ${door.door.label} door.` : "Back on the backlot.");
  }

  // ------------------------------------------------------------------ doors

  async function use(doorId: string): Promise<void> {
    if (busy || mounted) return;
    const entry = hub.find(doorId);
    if (!entry) return;
    const mine = ++generation;
    const handle = doorHandles.get(doorId);
    busy = true;
    // aria-disabled, never the `disabled` property: `disabled` blurs the
    // element it is set on, and the reader loses the ring on the control they
    // just pressed (CLAUDE.md §7). The guard that actually stops a second
    // press is `busy`.
    handle?.setEnabled(false);
    try {
      if (player.position.distanceTo(entry.standing) > 0.3) await player.walkTo(entry.standing);
      if (disposed || generation !== mine) return;

      hub.setOpen(doorId, true, motion.reduced);
      announce(`Opening the ${entry.door.label} door.`);
      if (!motion.reduced) await wait(OPEN_MILLISECONDS);
      if (disposed || generation !== mine) return;

      const roomId = entry.door.roomId;
      if (entry.door.kind === "room" && roomId && rooms[roomId]) {
        await enterRoom(roomId);
        return;
      }
      // Already base-resolved by the page: the island never calls withBase and
      // never writes a root-absolute URL (CLAUDE.md §4). A room door with no
      // builder registered lands here too, which is the honest fallback — the
      // Studio door still takes you to the Studio.
      window.location.assign(entry.door.href);
    } finally {
      busy = false;
      handle?.setEnabled(true);
    }
  }

  for (const entry of hub.doors) {
    doorHandles.set(
      entry.door.id,
      hotspots.api.register({
        id: entry.door.id,
        label:
          entry.door.kind === "room"
            ? `Open the ${entry.door.label} door into the machine room`
            : `Open the ${entry.door.label} door`,
        position: entry.anchor,
        radius: DOOR_REACH,
        arrival: `At the ${entry.door.label} door.`,
        activate: () => void use(entry.door.id),
        onProximity(near) {
          hub.setNear(entry.door.id, near);
          // Walking into a door is the third way of pressing it, and it goes
          // through the same `use` a click and an Enter do.
          if (near && doorsArmed && !busy && !mounted) void use(entry.door.id);
        },
      }),
    );
  }

  // ------------------------------------------------------------------ input

  function escape(): void {
    // The framing first, the room second. A reader who has come in close on
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
    aim: (yaw, pitch) => {
      aimYaw = yaw;
      aimPitch = pitch;
    },
    reducedMotion: () => motion.reduced,
  });

  // ------------------------------------------------------------------ sizes

  const sizer = createResizer(canvas, (box) => {
    stage.renderer.setPixelRatio(box.pixelRatio);
    // `false`: never write an inline size back onto the canvas. The page owns
    // the box (backlot.css), and on a `dvh` stage an inline pixel height is a
    // feedback loop waiting for a phone's URL bar to slide away.
    stage.renderer.setSize(box.width, box.height, false);
    camera.resize(box.width, box.height);
    // A viewport crossing the phone breakpoint restyles the labels, so the
    // cached button boxes the parking uses are no longer the right size.
    hotspots.remeasure();
  });
  stage.renderer.setPixelRatio(sizer.pixelRatio);
  stage.renderer.setSize(sizer.width, sizer.height, false);
  camera.resize(sizer.width, sizer.height);

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
  let settleReady: () => void = () => {};
  const ready = new Promise<void>((settle) => {
    settleReady = settle;
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
    hotspots.park(sizer.width, sizer.height);

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
    enterRoom,
    returnToHub,
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
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
      canvas.removeAttribute("role");
      canvas.removeAttribute("aria-label");
    },
  };
}
