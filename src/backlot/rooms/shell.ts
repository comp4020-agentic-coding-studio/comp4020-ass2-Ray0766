// A room, stood up from its manifest entry: floor, four walls, a ceiling, a
// frame for every piece, and a hotspot for every interactive.
//
// This half knows nothing about what is in any particular room. It reads
// `room.pieces` for the walls and `room.interactives` for the buttons, and a
// room that wants a piece somewhere the walls do not reach — the monitor on the
// desk — hands in its own mount surface. Which is why the machine room is a
// fit-out on top of this rather than a second copy of it.
//
// Two rules hold the frames together:
//
//   1. A frame is sized from `piece.aspect`, which is the real pixel size of
//      the file, before any texture exists. So nothing on a wall moves when a
//      texture lands, and a texture that never lands leaves a frame the right
//      shape with a flat fill in it.
//   2. The fill and the picture are two coplanar meshes, not one material
//      swapping its map. A material that gains a map jumps in one frame; a
//      picture that fades up over its own fill does not, and under reduced
//      motion the same code path arrives at opacity 1 immediately.
import { BoxGeometry, Group, Mesh, PlaneGeometry, Vector3, type BufferGeometry, type Texture } from "three";
import type { BacklotPiece, FocusRequest, Hotspot, RoomContext } from "../engine/types";
// `BacklotInteractive` is the one shape in the manifest that engine/types.ts
// does not re-export. Types erase at build, so this import costs the island
// nothing and the rule it is under — client code takes the manifest's types and
// never its values — still holds.
import type { BacklotInteractive } from "./manifest";
import { Painter, type Role } from "./palette";

// --------------------------------------------------------------- dimensions

/**
 * Metres. Wide enough for five 9:16 screens along the front, deep enough for
 * five stills down each side, and square.
 *
 * Square is not a taste decision. The engine bounds the figure with a circle of
 * `max(size.x, size.z) / 2` taken off the room's own bounding box
 * (src/backlot/engine/index.ts, enterRoom), so in an oblong room the circle
 * reaches past the short pair of walls: at 9 × 7.6 the figure walked three
 * metres straight ahead and came out the far side of the front wall, which I
 * watched happen. On a square the circle is inscribed, and the walls hold.
 */
export const ROOM = {
  width: 7.6,
  depth: 7.6,
  height: 3.6,
  /** How far off a wall a frame's face sits, so it never z-fights the wall. */
  relief: 0.04,
  /** Where the figure stands to read a frame, measured out along its normal. */
  standOff: 1.7,
  /** The side walls' frames stand off the wall and turn toward the open side,
   *  which is the only reason they are visible at all: the camera is fixed,
   *  looks down the room's long axis, and a picture flat on a side wall is
   *  edge-on to it and shows nothing. A set is three walls raked toward the
   *  camera and an open fourth; this is that, at the scale of one frame. */
  rake: 0.45,
  /** How much +z the side normals carry. 0 is flat on the wall. */
  rakeTurn: 0.85,
};

/** How the picture fades up over its fill once a texture lands. Seconds. */
const FADE_SECONDS = 0.25;

/** How long the figure has to have stopped before a framed picture moves it to
 *  the spot it is read from. Walking past something is not arriving at it. */
const SETTLE_SECONDS = 0.35;
/** Metres per frame under which the figure counts as standing still. */
const STILL_ENOUGH = 0.004;

// ------------------------------------------------------------------ surfaces

/** A run of evenly spaced slots on some flat face of the room. */
export interface MountSurface {
  /** Centre of the run, at frame-centre height. */
  centre: Vector3;
  /** Unit vector along the run, in slot order. */
  along: Vector3;
  /** Unit vector the frames face. */
  normal: Vector3;
  /** Distance between slot centres. */
  pitch: number;
  /** The largest frame a slot will take; the piece's aspect fits inside it. */
  box: { width: number; height: number };
  /** How far out the figure stands to read one of these. */
  standOff: number;
  /** Sideways, from the picture's centre, added to the stand point. A picture
   *  the camera can be asked to frame needs this: the projection is
   *  orthographic, so a figure between the camera and the panel is the same
   *  size as the panel however far in front of it it stands, and it covers the
   *  thing the reader just asked to read. */
  standShift?: Vector3;
  /** How close counts as arriving, measured on the floor from under the
   *  picture — the engine takes proximity as a ground distance, not a straight
   *  line, so the height the picture hangs at is not part of it. Defaults to a
   *  stride past the stand point. A surface that frames the camera when the
   *  figure reaches it needs this tighter than the default, or the room's own
   *  entry point is already inside it and the arrival never happens. */
  reach?: number;
  /** The mount behind the picture. A monitor's is thinner than a wall frame's,
   *  and a monitor's bezel is black rather than the wall frames' divider — which
   *  matters once the camera can come in close enough to light it. */
  edge?: { margin: number; depth: number; role?: Role };
  /** Unused by the shell; somewhere for a room to keep the fitted height it
   *  worked out for this surface. */
  heightHint?: number;
}

const FRAME_HEIGHT = 1.62;

/** A stride past the stand point. */
const reachOf = (surface: MountSurface | undefined): number =>
  surface?.reach ?? (surface ? surface.standOff + 0.2 : 1.8);

/** Fit `aspect` inside `box` without cropping it or changing its shape. */
export function fitInside(aspect: [number, number], box: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const ratio = aspect[0] / aspect[1];
  const width = Math.min(box.width, box.height * ratio);
  return { width, height: width / ratio };
}

/**
 * The three walls, derived from the room's own metres rather than written out,
 * so a change to `ROOM` moves every frame with it.
 *
 * Slot order is left to right as the room is entered — the figure comes in at
 * the back wall facing the front one, so the front wall runs along +x, and each
 * side wall runs the way it reads when the figure turns to face it.
 */
export function wallSurfaces(pieceCounts: Record<string, number>): Record<string, MountSurface> {
  const frontSpan = ROOM.width - 1.2;
  const sideSpan = ROOM.depth - 1.2;
  const frontSlots = Math.max(1, pieceCounts.front ?? 1);
  const sideSlots = Math.max(1, pieceCounts.left ?? pieceCounts.right ?? 1);
  const frontPitch = frontSpan / frontSlots;
  const sidePitch = sideSpan / sideSlots;

  return {
    front: {
      centre: new Vector3(0, FRAME_HEIGHT, -ROOM.depth / 2 + ROOM.relief),
      along: new Vector3(1, 0, 0),
      normal: new Vector3(0, 0, 1),
      pitch: frontPitch,
      box: { width: frontPitch - 0.26, height: 2.4 },
      standOff: ROOM.standOff,
    },
    left: {
      centre: new Vector3(-ROOM.width / 2 + ROOM.rake, FRAME_HEIGHT, 0),
      along: new Vector3(0, 0, -1),
      normal: new Vector3(1, 0, ROOM.rakeTurn).normalize(),
      pitch: sidePitch,
      box: { width: sidePitch - 0.28, height: 1.6 },
      standOff: ROOM.standOff,
    },
    right: {
      centre: new Vector3(ROOM.width / 2 - ROOM.rake, FRAME_HEIGHT, 0),
      along: new Vector3(0, 0, 1),
      normal: new Vector3(-1, 0, ROOM.rakeTurn).normalize(),
      pitch: sidePitch,
      box: { width: sidePitch - 0.28, height: 1.6 },
      standOff: ROOM.standOff,
    },
  };
}

// -------------------------------------------------------------------- frames

/** One piece, hung: the fill that is there from the first frame, and the
 *  picture that arrives over it or does not. */
export interface PieceFrame {
  readonly piece: BacklotPiece;
  readonly group: Group;
  /** World centre of the picture. */
  readonly centre: Vector3;
  /** Unit vector the picture faces. */
  readonly normal: Vector3;
  readonly width: number;
  readonly height: number;
  /** Where the figure stands to read it, on the floor. */
  readonly standPoint: Vector3;
  /** Hands the frame a picture. Null leaves the fill showing. */
  show(texture: Texture | null): void;
}

function frameAt(
  painter: Painter,
  piece: BacklotPiece,
  surface: MountSurface,
  slotIndex: number,
  slotCount: number,
  reducedMotion: boolean,
  track: <T extends BufferGeometry>(geometry: T) => T,
): PieceFrame & { tick(delta: number): void } {
  const { width, height } = fitInside(piece.aspect, surface.box);
  const offset = (slotIndex - (slotCount - 1) / 2) * surface.pitch;
  const centre = surface.centre.clone().addScaledVector(surface.along, offset);

  const group = new Group();
  group.position.copy(centre);
  group.lookAt(centre.clone().add(surface.normal));

  // The edge is a slab behind the picture rather than four sticks: one mesh,
  // and it reads as a mount at every distance a figure can get to.
  const mount = surface.edge ?? { margin: 0.045, depth: 0.05, role: undefined };
  const edgeGeometry = new BoxGeometry(width + mount.margin * 2, height + mount.margin * 2, mount.depth);
  track(edgeGeometry);
  const edge = new Mesh(edgeGeometry, painter.lit(mount.role ?? "frameEdge"));
  edge.position.z = -mount.depth / 2 - 0.002;
  group.add(edge);

  // The fill is what the room has before any texture exists, and what it keeps
  // if none arrives. Unlit, because a screen is a light source: a picture that
  // takes the room's key light on its face reads as a poster, not a screen.
  const fillGeometry = new PlaneGeometry(width, height);
  track(fillGeometry);
  const fill = new Mesh(fillGeometry, painter.flat("frameFill"));
  group.add(fill);

  const pictureGeometry = new PlaneGeometry(width, height);
  track(pictureGeometry);
  const pictureMaterial = painter.flat("neutral", { transparent: true, opacity: 0 });
  const picture = new Mesh(pictureGeometry, pictureMaterial);
  picture.position.z = 0.002;
  picture.visible = false;
  group.add(picture);

  const standPoint = centre.clone().addScaledVector(surface.normal, surface.standOff);
  if (surface.standShift) standPoint.add(surface.standShift);
  standPoint.y = 0;

  let fading = false;

  return {
    piece,
    group,
    centre,
    normal: surface.normal.clone(),
    width,
    height,
    standPoint,
    show(texture: Texture | null) {
      if (!texture) {
        // Nothing arrived. The fill is the picture, and always was.
        picture.visible = false;
        pictureMaterial.opacity = 0;
        pictureMaterial.map = null;
        pictureMaterial.needsUpdate = true;
        fading = false;
        return;
      }
      pictureMaterial.map = texture;
      pictureMaterial.needsUpdate = true;
      picture.visible = true;
      if (reducedMotion) {
        pictureMaterial.opacity = 1;
        fading = false;
      } else {
        fading = true;
      }
    },
    tick(delta: number) {
      if (!fading) return;
      pictureMaterial.opacity = Math.min(1, pictureMaterial.opacity + delta / FADE_SECONDS);
      if (pictureMaterial.opacity >= 1) fading = false;
    },
  };
}

// --------------------------------------------------------------------- shell

export interface ShellOptions {
  /** Mount surfaces the room adds on top of the three walls, keyed by
   *  `BacklotPiece["wall"]`. The machine room hands in "desk". */
  surfaces?: Record<string, MountSurface>;
  /** What to do with an interactive kind this file does not own. `leave-room`
   *  and `open-page` are handled here; everything else comes back to the room. */
  onInteractive?(interactive: BacklotInteractive, frame: PieceFrame | null): void | Promise<void>;
  /** Label for the hotspot's arrival announcement, when the piece has one. */
  arrivalFor?(interactive: BacklotInteractive, frame: PieceFrame | null): string | undefined;
  /**
   * What the camera has to come in to for this piece to be readable, if
   * anything. Returning a request puts it on the hotspot — so Enter frames it —
   * and wires the figure's own proximity to the same call, so walking up to the
   * thing and pressing its button are the same act. `target` is the frame's
   * centre and is filled in here.
   */
  focusFor?(interactive: BacklotInteractive, frame: PieceFrame | null): Omit<FocusRequest, "target"> | undefined;
}

export interface RoomShell {
  readonly painter: Painter;
  readonly frames: Map<string, PieceFrame>;
  readonly hotspots: Map<string, Hotspot>;
  /** Interactive id to the piece it acts on. `facingWhich` is answered from
   *  hotspot ids, so anything that asks it has to ask in those. */
  readonly pieceOf: Map<string, string>;
  frame(pieceId: string): PieceFrame | null;
}

/**
 * Builds the shell and everything the manifest entry names, and registers the
 * hotspots in manifest order — which is Tab order, and the only order.
 */
export function buildRoomShell(context: RoomContext, options: ShellOptions = {}): RoomShell {
  const painter = new Painter(context.colours);
  const geometries: BufferGeometry[] = [];
  const track = <T extends BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };

  // --- the box ---------------------------------------------------------
  const shell = new Group();
  const floorGeometry = track(new PlaneGeometry(ROOM.width, ROOM.depth));
  const floor = new Mesh(floorGeometry, painter.lit("floor"));
  floor.rotation.x = -Math.PI / 2;
  shell.add(floor);

  const ceilingGeometry = track(new PlaneGeometry(ROOM.width, ROOM.depth));
  const ceiling = new Mesh(ceilingGeometry, painter.lit("ceiling"));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  shell.add(ceiling);

  const wallMaterial = painter.lit("wall");
  const skirtingMaterial = painter.lit("skirting");
  const longWall = track(new PlaneGeometry(ROOM.width, ROOM.height));
  const shortWall = track(new PlaneGeometry(ROOM.depth, ROOM.height));
  const longSkirting = track(new BoxGeometry(ROOM.width, 0.12, 0.03));
  const shortSkirting = track(new BoxGeometry(ROOM.depth, 0.12, 0.03));

  const walls: { geometry: PlaneGeometry; skirting: BoxGeometry; position: Vector3; faces: Vector3 }[] = [
    { geometry: longWall, skirting: longSkirting, position: new Vector3(0, ROOM.height / 2, -ROOM.depth / 2), faces: new Vector3(0, 0, 1) },
    { geometry: longWall, skirting: longSkirting, position: new Vector3(0, ROOM.height / 2, ROOM.depth / 2), faces: new Vector3(0, 0, -1) },
    { geometry: shortWall, skirting: shortSkirting, position: new Vector3(-ROOM.width / 2, ROOM.height / 2, 0), faces: new Vector3(1, 0, 0) },
    { geometry: shortWall, skirting: shortSkirting, position: new Vector3(ROOM.width / 2, ROOM.height / 2, 0), faces: new Vector3(-1, 0, 0) },
  ];
  for (const wall of walls) {
    const mesh = new Mesh(wall.geometry, wallMaterial);
    mesh.position.copy(wall.position);
    mesh.lookAt(wall.position.clone().add(wall.faces));
    shell.add(mesh);

    const skirting = new Mesh(wall.skirting, skirtingMaterial);
    skirting.position.copy(wall.position).setY(0.06).addScaledVector(wall.faces, 0.02);
    skirting.lookAt(skirting.position.clone().add(wall.faces));
    shell.add(skirting);
  }
  context.root.add(shell);

  // --- the pieces ------------------------------------------------------
  const counts: Record<string, number> = {};
  for (const piece of context.room.pieces) counts[piece.wall] = (counts[piece.wall] ?? 0) + 1;
  const surfaces: Record<string, MountSurface> = { ...wallSurfaces(counts), ...(options.surfaces ?? {}) };

  const frames = new Map<string, PieceFrame>();
  const ticking: { tick(delta: number): void }[] = [];
  const pieces = new Group();
  for (const piece of context.room.pieces) {
    const surface = surfaces[piece.wall];
    // A wall the room never supplied is a manifest the builder cannot hang:
    // better a missing frame than a piece silently stacked at the origin.
    if (!surface) continue;
    const slotCount = counts[piece.wall] ?? 1;
    const built = frameAt(painter, piece, surface, piece.slot, slotCount, context.reducedMotion, track);
    frames.set(piece.id, built);
    ticking.push(built);
    pieces.add(built.group);
  }
  context.root.add(pieces);

  // Where the figure should end up once it stops, if it has walked up to
  // something the camera frames.
  let takePlaceAt: PieceFrame | null = null;
  let stillFor = 0;
  const wasAt = new Vector3();

  const stopFrame = context.onFrame((delta) => {
    for (const item of ticking) item.tick(delta);

    if (!takePlaceAt) return;
    const moved = context.player.position.distanceTo(wasAt);
    wasAt.copy(context.player.position);
    stillFor = moved > STILL_ENOUGH ? 0 : stillFor + delta;
    if (stillFor < SETTLE_SECONDS) return;
    const place = takePlaceAt;
    takePlaceAt = null;
    if (context.player.position.distanceTo(place.standPoint) > 0.3) void context.player.walkTo(place.standPoint);
  });

  // --- the buttons -----------------------------------------------------
  // In manifest order, because the HUD registers them in the order they arrive
  // and that order is the Tab order a reader gets.
  const hotspots = new Map<string, Hotspot>();
  const pieceOf = new Map<string, string>();
  // An interactive with no piece — the way out, the link to the real page — is
  // a spot by the back wall, which is where the figure comes in.
  const looseCount = context.room.interactives.filter((interactive) => !interactive.pieceId).length;
  let loose = 0;
  for (const interactive of context.room.interactives) {
    const frame = interactive.pieceId ? (frames.get(interactive.pieceId) ?? null) : null;
    let position: Vector3;
    if (frame) {
      // The picture, not the spot on the floor in front of it. The engine parks
      // the button on this point and answers `facingWhich` from it, so it has to
      // be the thing itself: anchored to the floor, a figure standing on the
      // anchor is zero metres from it and faces nothing at all.
      position = frame.centre.clone();
      pieceOf.set(interactive.id, frame.piece.id);
    } else {
      position = new Vector3((loose - (looseCount - 1) / 2) * 1.8, 1.2, ROOM.depth / 2 - 1.3);
      loose += 1;
    }
    const arrival = options.arrivalFor?.(interactive, frame);
    const focus = frame ? options.focusFor?.(interactive, frame) : undefined;
    const hotspot = context.hotspots.register({
      id: interactive.id,
      // A stride past the stand point, so arriving counts and the screen next
      // along does not: on the front wall the spots are 1.28 m apart and the
      // diagonal to a neighbour is 2.13 m, which leaves 1.7 to 2.13 as the band
      // where exactly one picture is ever the one being stood at.
      radius: frame ? reachOf(surfaces[frame.piece.wall]) : 1.8,
      label: interactive.label,
      position,
      ...(arrival ? { arrival } : {}),
      ...(focus ? { focus } : {}),
      ...(focus && frame
        ? {
            onProximity(near: boolean) {
              // Walking up to the thing is what makes it readable, and walking
              // away puts the camera back. The hotspot's own `focus` does the
              // same for Enter, so the keyboard is not a second-class way in.
              if (!near) {
                takePlaceAt = null;
                context.unfocus();
                return;
              }
              // The camera comes in at once. Taking a place at the thing waits
              // until the figure has stopped: the projection is orthographic,
              // so a figure between the camera and a framed panel is the same
              // size as the panel and covers it — walking up with the keys put
              // the reader's own avatar across half the graph, which I watched
              // happen — but walking *past* it and being dragged back is worse,
              // and that is what an immediate walkTo here did.
              takePlaceAt = frame;
              stillFor = 0;
              void context.focus({ target: frame.centre.clone(), ...focus });
            },
          }
        : {}),
      activate() {
        if (interactive.kind === "leave-room") {
          context.leave();
          return;
        }
        if (interactive.kind === "open-page") {
          // Already resolved through withBase by the page. Client code never
          // calls withBase and never writes a root-absolute URL.
          if (interactive.href) window.location.assign(interactive.href);
          return;
        }
        void options.onInteractive?.(interactive, frame);
      },
    });
    hotspots.set(interactive.id, hotspot);
  }

  context.onDispose(() => {
    stopFrame();
    for (const hotspot of hotspots.values()) hotspot.dispose();
    hotspots.clear();
    for (const geometry of geometries) geometry.dispose();
    geometries.length = 0;
    painter.dispose();
  });

  return {
    painter,
    frames,
    hotspots,
    pieceOf,
    frame: (pieceId: string) => frames.get(pieceId) ?? null,
  };
}
