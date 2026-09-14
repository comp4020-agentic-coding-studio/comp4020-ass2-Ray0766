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
import { BoxGeometry, Group, Mesh, PlaneGeometry, Vector3, type BufferGeometry, type Object3D, type Texture } from "three";
import type { BacklotPiece, FocusRequest, Hotspot, RoomContext } from "../engine/types";
// `BacklotInteractive` is the one shape in the manifest that engine/types.ts
// does not re-export. Types erase at build, so this import costs the island
// nothing and the rule it is under — client code takes the manifest's types and
// never its values — still holds.
import type { BacklotInteractive } from "./manifest";
import type { Kit } from "./furniture";
import { Painter, type Role } from "./palette";

// --------------------------------------------------------------- dimensions

/**
 * The metres a room's box is built to.
 *
 * It is a parameter rather than a constant because the corridor asked for one,
 * and that is the only thing standing a second room up over this file cost.
 * `ROOM` below was written as if there were one room — it is the machine room's
 * plan, argued from the machine room's content — and a corridor is fifteen
 * metres of floor four and a half wide. Everything else in here turned out to
 * be about *a* room rather than about that one.
 */
export interface RoomBox {
  width: number;
  depth: number;
  height: number;
}

/**
 * Metres. Five 9:16 screens across one end, five stills down each side, a desk,
 * a tower, a chair, and room to walk between them — 5.8 wide, 4.6 deep, 2.2 to
 * the ceiling.
 *
 * It was 7.6 square, and 7.6 square is not what this room is. It is one
 * person's rig in one room; a real room of that description is four to five
 * metres, and the only reason this one is 5.8 across is that the manifest hangs
 * a five-rung ladder along that wall and the rungs have to stay big enough to
 * read. So the depth came down and the width did not.
 *
 * Depth is the lever, and it is the only one I own. The frame is 2.08:1 and the
 * room's plan is 1.26:1, so the composition is height-bound: the vertical
 * extent the camera has to hold is `height × cos(tilt) + depth × sin(tilt)`,
 * width does not enter it, and narrowing the room would shrink the screens for
 * nothing. Measured at 1920×1080, with the engine's room camera: 145 px per
 * metre at 5.8 × 5.8 × 2.2, 184 at 5.8 × 4.6 × 2.2. The furniture is what that
 * buys — a desk is 1.8 m whatever the room is, so every metre off the depth is
 * a fifth more desk, tower and chair on screen. The pictures on the side walls
 * are laid out along that depth and would shrink with it, so the clear margin
 * at each end of a run came down with it too, which holds them where they were.
 */
export const ROOM = {
  width: 5.8,
  depth: 4.6,
  height: 2.2,
  /** How far off a wall a frame's face sits, so it never z-fights the wall. */
  relief: 0.04,
  /** Where the figure stands to read a frame, measured out along its normal. */
  standOff: 0.9,
  /** The side walls' frames stand off the wall and turn toward the open side,
   *  which is the only reason they are visible at all: the camera is fixed,
   *  looks down the room's long axis, and a picture flat on a side wall is
   *  edge-on to it and shows nothing. A set is three walls raked toward the
   *  camera and an open fourth; this is that, at the scale of one frame. */
  rake: 0.45,
  /** How much +z the side normals carry. 0 is flat on the wall. */
  rakeTurn: 0.85,
  /** Clear floor at each end of a run of frames. */
  margin: 0.7,
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

const FRAME_HEIGHT = 1.28;

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
export function wallSurfaces(
  pieceCounts: Record<string, number>,
  box: RoomBox = ROOM,
): Record<string, MountSurface> {
  const frontSpan = box.width - ROOM.margin;
  const sideSpan = box.depth - ROOM.margin;
  const frontSlots = Math.max(1, pieceCounts.front ?? 1);
  const sideSlots = Math.max(1, pieceCounts.left ?? pieceCounts.right ?? 1);
  const frontPitch = frontSpan / frontSlots;
  const sidePitch = sideSpan / sideSlots;

  return {
    front: {
      centre: new Vector3(0, FRAME_HEIGHT, -box.depth / 2 + ROOM.relief),
      along: new Vector3(1, 0, 0),
      normal: new Vector3(0, 0, 1),
      pitch: frontPitch,
      box: { width: frontPitch - 0.2, height: 1.6 },
      standOff: ROOM.standOff,
    },
    left: {
      centre: new Vector3(-box.width / 2 + ROOM.rake, FRAME_HEIGHT, 0),
      along: new Vector3(0, 0, -1),
      normal: new Vector3(1, 0, ROOM.rakeTurn).normalize(),
      pitch: sidePitch,
      box: { width: sidePitch - 0.22, height: 1.3 },
      standOff: ROOM.standOff,
    },
    right: {
      centre: new Vector3(box.width / 2 - ROOM.rake, FRAME_HEIGHT, 0),
      along: new Vector3(0, 0, 1),
      normal: new Vector3(-1, 0, ROOM.rakeTurn).normalize(),
      pitch: sidePitch,
      box: { width: sidePitch - 0.22, height: 1.3 },
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
  /**
   * The piece's own face, for `HotspotSpec.surface` — the engine projects it and
   * publishes the box as `data-backlot-rect`, which is the only handle a check
   * has on a colour in this scene.
   *
   * It is the **fill**, not the picture. The two are coplanar and the same
   * `width × height`, but the picture ships `visible = false` and only turns on
   * if a texture lands, so a rect taken from it would be absent exactly when a
   * check most wants to know what the frame is showing — and a piece whose file
   * never arrives would have no rect at all, when a flat fill is still a colour
   * somebody has to be able to measure.
   */
  readonly face: Mesh;
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
    face: fill,
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
  /** The room's own metres. Defaults to `ROOM`, which is the machine room's. */
  box?: RoomBox;
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
   * thing and pressing its button are the same act. `target` defaults to the
   * frame's own centre and is filled in here.
   */
  focusFor?(interactive: BacklotInteractive, frame: PieceFrame | null): RoomFocus | undefined;
  /**
   * Things the room builds that a manifest interactive names but no `pieceId`
   * points at — furniture rather than a picture. The machine room's tower is
   * the one there is.
   *
   * Called with the shell's own painter and geometry tracker, **after** the
   * pieces are up and **before** the buttons are registered, and that timing is
   * the whole reason it is a callback rather than an argument. A control's place
   * in the Tab order is its place in the manifest, and a room that built its
   * furniture after `buildRoomShell` returned could only register the control
   * afterwards — which put "Look at the machine" behind "Back to the backlot".
   * Building it here keeps the way out last, where a way out belongs.
   *
   * Keyed by interactive id.
   */
  fixtures?(kit: Kit): Record<string, RoomFixture>;
}

/**
 * A thing in the room that a button is about but no piece describes.
 *
 * It carries what a `PieceFrame` would have carried: where the control is
 * parked, how close counts as arriving, what the camera comes in to, and —
 * the reason this exists at all — **the object**, so the parking pass publishes
 * where it is on screen from the same matrices the renderer used. Without one,
 * the only handle anything has on the tower is its 4 px light bar, which is
 * sub-pixel at 390 px wide.
 */
export interface RoomFixture {
  /** For `HotspotSpec.surface`. The object itself, turned as it is turned. */
  object: Object3D;
  /** Where the button parks and what `facingWhich` answers from: the thing, in
   *  world space, not the floor in front of it. */
  position: Vector3;
  /** Metres. How close the figure has to be for this to be what it is at. */
  radius: number;
  /** How the camera comes in, if it does. No `target`: the engine frames
   *  `position`, which for a fixture is the fixture.
   *
   *  Handed to the hotspot **by reference** rather than copied, because the one
   *  thing specified in pixels rather than in metres is a door's push — the
   *  window has to clear a floor once the camera is there, and only the engine
   *  knows the canvas. The engine writes `radius` on this object every resize;
   *  a copy here would leave the spec holding the number the room guessed at
   *  build time, which is right for exactly one viewport. */
  focus?: { radius: number; normal?: Vector3; clearance?: number };
  /** What the live region says on arrival. */
  arrival?: string;
  /**
   * What pressing it does, when the manifest's own verb is not what it means.
   *
   * A stage down the Lectures corridor is an `open-page` interactive and it does
   * not open a page the way this file otherwise does: it is a **door**, so the
   * press is a walk, a leaf and then the page, and Escape has to be able to call
   * it off. The room owns that and hands it in here, and the shell's own
   * `open-page` — `window.location.assign`, immediately — is what an interactive
   * that is a link rather than a door still gets.
   */
  activate?(): void;
  /**
   * Fired when the figure comes within `radius`, and again when it leaves.
   *
   * A piece gets this from the shell, because the shell knows what a piece's
   * framing is. A fixture's framing is the room's, so its proximity is too —
   * and without it, walking up to a fixture is the one way of arriving at
   * something in this backlot that does nothing, while Tab and a press both
   * work. That is exactly the asymmetry `HotspotSpec.focus` exists to rule out.
   */
  onProximity?(near: boolean): void;
}

/**
 * What a piece asks the camera for.
 *
 * `target` is the one addition to `FocusRequest`'s shape, and it is for a piece
 * that is read as part of something bigger than itself. The monitor is a thing
 * on a desk and frames its own centre; one screen on the front wall is a rung of
 * a ladder, and coming in on the rung puts the four either side of it off the
 * edge of the frame — where their controls clamp to the edge and stack, which is
 * the two staggered rows this exists to avoid. So the five screens name the same
 * target, the push holds the whole wall, and all five names read at once.
 *
 * A focus that carries one is framed by this file rather than by the engine,
 * because `HotspotSpec.focus` deliberately has no target: the engine frames a
 * hotspot's own position, which is right for everything that marks the thing it
 * is about. Both branches run — the monitor takes the first, the front wall the
 * second.
 */
export type RoomFocus = Omit<FocusRequest, "target"> & {
  target?: Vector3;
  /**
   * Asked every time the camera is about to be sent here, and true means don't.
   *
   * A predicate rather than a flag because the answer can change under a reader
   * who rotates a phone, and asking at build time would settle it for the life
   * of the room. The one caller is the front wall, which has nothing to come in
   * for below the width where every control is a dot.
   */
  skip?(): boolean;
};

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
  // The room's own metres, not this file's. `ROOM` is the machine room's plan
  // and the corridor is not that shape; everything else in here turned out to be
  // about *a* room rather than about that one.
  const box = options.box ?? ROOM;
  const shell = new Group();
  const floorGeometry = track(new PlaneGeometry(box.width, box.depth));
  const floor = new Mesh(floorGeometry, painter.lit("floor"));
  floor.rotation.x = -Math.PI / 2;
  shell.add(floor);

  const ceilingGeometry = track(new PlaneGeometry(box.width, box.depth));
  const ceiling = new Mesh(ceilingGeometry, painter.lit("ceiling"));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = box.height;
  shell.add(ceiling);

  const wallMaterial = painter.lit("wall");
  const skirtingMaterial = painter.lit("skirting");
  const longWall = track(new PlaneGeometry(box.width, box.height));
  const shortWall = track(new PlaneGeometry(box.depth, box.height));
  const longSkirting = track(new BoxGeometry(box.width, 0.12, 0.03));
  const shortSkirting = track(new BoxGeometry(box.depth, 0.12, 0.03));

  const walls: { geometry: PlaneGeometry; skirting: BoxGeometry; position: Vector3; faces: Vector3 }[] = [
    { geometry: longWall, skirting: longSkirting, position: new Vector3(0, box.height / 2, -box.depth / 2), faces: new Vector3(0, 0, 1) },
    { geometry: longWall, skirting: longSkirting, position: new Vector3(0, box.height / 2, box.depth / 2), faces: new Vector3(0, 0, -1) },
    { geometry: shortWall, skirting: shortSkirting, position: new Vector3(-box.width / 2, box.height / 2, 0), faces: new Vector3(1, 0, 0) },
    { geometry: shortWall, skirting: shortSkirting, position: new Vector3(box.width / 2, box.height / 2, 0), faces: new Vector3(-1, 0, 0) },
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
  const surfaces: Record<string, MountSurface> = { ...wallSurfaces(counts, box), ...(options.surfaces ?? {}) };

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
  /** The focus each framed piece asked for, by piece id. */
  const placeFocus = new Map<string, RoomFocus>();

  /**
   * Which pieces the figure is within reach of, and which piece's framing the
   * camera is currently on.
   *
   * Both exist because of the same failure. A framing belongs to whatever asked
   * for it, and a piece leaving reach used to release it whichever piece that
   * was: on the front wall the five reaches are 1.1 m against a 1.02 m pitch, so
   * walking up puts the figure inside **two** of them, and the moment the outer
   * one dropped out it tore down the framing the inner one had just asked for.
   * Measured: one sample in twenty-four with the camera 10% into the push, then
   * nothing — `near=t4+t5` to `near=t4`, and the framing gone with t5.
   *
   * So a release has to clear two bars: it is the piece that asked, and nothing
   * else sharing that framing is still within reach. The five screens share one
   * `RoomFocus` object, which is what "sharing" means here.
   */
  const withinReach = new Set<string>();
  let framedPiece: string | null = null;

  /** One piece's framing as the engine wants it, or null if this piece has said
   *  not to frame it under the conditions the reader is actually in. */
  function requestFor(frame: PieceFrame): FocusRequest | null {
    const asked = placeFocus.get(frame.piece.id);
    if (asked?.skip?.()) return null;
    return {
      target: (asked?.target ?? frame.centre).clone(),
      radius: asked?.radius ?? 0.5,
      ...(asked?.normal ? { normal: asked.normal.clone() } : {}),
    };
  }

  /** Send the camera to what this piece is read as part of, and remember that
   *  this piece is what sent it. */
  function frameFor(frame: PieceFrame): void {
    const request = requestFor(frame);
    if (!request) return;
    framedPiece = frame.piece.id;
    void context.focus(request);
  }

  /** And take it back, but only if this piece is the one that sent it and
   *  nothing else sharing the same framing is still in reach. */
  function unframeFor(frame: PieceFrame): void {
    if (framedPiece !== frame.piece.id) return;
    const shared = placeFocus.get(frame.piece.id);
    for (const other of withinReach) {
      if (other !== frame.piece.id && placeFocus.get(other) === shared) return;
    }
    framedPiece = null;
    context.unfocus();
  }

  const stopFrame = context.onFrame((delta) => {
    for (const item of ticking) item.tick(delta);

    if (!takePlaceAt) return;
    const moved = context.player.position.distanceTo(wasAt);
    wasAt.copy(context.player.position);
    stillFor = moved > STILL_ENOUGH ? 0 : stillFor + delta;
    if (stillFor < SETTLE_SECONDS) return;
    const place = takePlaceAt;
    takePlaceAt = null;
    // No framing, no place at it. The walk to the stand point exists so the
    // figure is not between the camera and the thing it has just been asked to
    // frame; with no framing it is the figure being dragged somewhere for no
    // reason, which is the thing the settle rule above was added to stop.
    if (!requestFor(place)) return;
    frameFor(place);
    if (context.player.position.distanceTo(place.standPoint) > 0.3) void context.player.walkTo(place.standPoint);
  });

  // --- the buttons -----------------------------------------------------
  // In manifest order, because the HUD registers them in the order they arrive
  // and that order is the Tab order a reader gets.
  const hotspots = new Map<string, Hotspot>();
  const pieceOf = new Map<string, string>();
  // An interactive with no piece — the way out, the link to the real page — is
  // a spot by the back wall, which is where the figure comes in.
  // Built before the loop, not after the function returns: see `fixtures`.
  const fixtures = options.fixtures?.({ painter, track }) ?? {};
  const looseCount = context.room.interactives.filter(
    (interactive) => !interactive.pieceId && !fixtures[interactive.id],
  ).length;
  let loose = 0;
  for (const interactive of context.room.interactives) {
    const frame = interactive.pieceId ? (frames.get(interactive.pieceId) ?? null) : null;
    const fixture = frame ? undefined : fixtures[interactive.id];
    let position: Vector3;
    if (fixture) {
      position = fixture.position.clone();
    } else if (frame) {
      // The picture, not the spot on the floor in front of it. The engine parks
      // the button on this point and answers `facingWhich` from it, so it has to
      // be the thing itself: anchored to the floor, a figure standing on the
      // anchor is zero metres from it and faces nothing at all.
      position = frame.centre.clone();
      pieceOf.set(interactive.id, frame.piece.id);
    } else {
      position = new Vector3((loose - (looseCount - 1) / 2) * 1.8, 1.2, box.depth / 2 - 1.3);
      loose += 1;
    }
    const arrival = fixture?.arrival ?? options.arrivalFor?.(interactive, frame);
    const focus = frame ? options.focusFor?.(interactive, frame) : undefined;
    if (frame && focus) placeFocus.set(frame.piece.id, focus);
    const hotspot = context.hotspots.register({
      id: interactive.id,
      // A stride past the stand point, so arriving counts and the screen next
      // along does not: on the front wall the spots are 1.28 m apart and the
      // diagonal to a neighbour is 2.13 m, which leaves 1.7 to 2.13 as the band
      // where exactly one picture is ever the one being stood at.
      radius: fixture ? fixture.radius : frame ? reachOf(surfaces[frame.piece.wall]) : 1.8,
      label: interactive.label,
      position,
      // What the button is parked near, and separately what it is *about*. A
      // control sits near the thing; a check needs the thing. Without this the
      // only way to find a piece is a radius around its control, which is 130 px
      // at 1920×1080 with the nearest stray 439 px off, and 26 px at 390×844
      // with three brighter cells 27, 29 and 35 px off — one cell of error, on
      // the screens' own edges (engine/types.ts carries the same note).
      ...(fixture ? { surface: fixture.object } : frame ? { surface: frame.face } : {}),
      ...(arrival ? { arrival } : {}),
      // Only a focus the engine can frame correctly goes on the spec. One that
      // names its own target is framed below instead, because the engine frames
      // `position` and `position` is this screen rather than the wall it is on.
      // A fixture's framing goes on by reference, which is the one place this
      // file hands an object over rather than copying it out. See
      // `RoomFixture.focus`: a door's push is specified in pixels and the engine
      // rewrites the radius on every resize, so the spec and the room have to be
      // holding the same object or the spec keeps a number that is true for one
      // viewport.
      ...(fixture?.focus
        ? { focus: fixture.focus }
        : focus && !focus.target
          ? { focus: { radius: focus.radius, ...(focus.normal ? { normal: focus.normal } : {}) } }
          : {}),
      ...(fixture?.onProximity ? { onProximity: fixture.onProximity } : {}),
      ...(focus && frame
        ? {
            onProximity(near: boolean) {
              // Walking up to the thing is what makes it readable, and walking
              // away puts the camera back. The hotspot's own `focus` does the
              // same for Enter, so the keyboard is not a second-class way in.
              if (!near) {
                withinReach.delete(frame.piece.id);
                if (takePlaceAt?.piece.id === frame.piece.id) takePlaceAt = null;
                unframeFor(frame);
                return;
              }
              withinReach.add(frame.piece.id);
              // Arriving is stopping, not passing. Both halves of it wait for
              // the figure to stand still:
              //
              //   the camera, because the way from the door to the wall of
              //   screens goes within half a metre of the desk, so framing on
              //   the crossing would lunge the view in and out every time the
              //   reader walked the room;
              //
              //   and the figure's own place at the thing, because the
              //   projection is orthographic — a figure between the camera and
              //   a framed panel is the same size as the panel and covers it —
              //   but being dragged back to a desk you were walking past is
              //   worse than covering it, and that is what an immediate walkTo
              //   here did. Both watched happen.
              takePlaceAt = frame;
              stillFor = 0;
            },
          }
        : {}),
      activate() {
        // Activating is arriving, and the contract says so: `HotspotSpec.focus`
        // has walking up, Tab landing and activating as one event as far as the
        // camera is concerned. For a focus the engine can frame that is already
        // true — the deck awaits `hooks.frame` before it calls this. For one
        // that names its own target the engine has nothing on the spec to act
        // on, and this used to rely on the button happening to take focus on the
        // way to being pressed, which is true for a pointer and not something to
        // build on: a check that focused the button by hand and pressed Enter
        // got no framing at all, because `element.focus()` fires no `focusin`
        // (CLAUDE.md §7). So it is asked for here, explicitly, on the path that
        // cannot get it any other way.
        if (frame && focus?.target) frameFor(frame);
        // A fixture that is a door is pressed, not followed. See
        // `RoomFixture.activate`: the corridor's stages are `open-page` in the
        // manifest and a door's press is a walk, a leaf and then the page, with
        // Escape able to call the whole thing off. Everything else keeps the two
        // verbs below, which are what an interactive that really is a link gets.
        if (fixture?.activate) {
          fixture.activate();
          return;
        }
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

    // The keyboard's half of arriving, for the pieces the engine cannot frame.
    //
    // Tab landing on a control is the same event as the figure walking up to
    // the thing — that is what `HotspotSpec.focus` is for, and it is the
    // accessibility of this whole scheme rather than a nicety. A piece with its
    // own target does not carry that spec, so it carries this instead, and the
    // two say the same thing. `focusin`/`focusout` rather than focus/blur
    // because they bubble and because they are what a headless run can be made
    // to deliver at all (CLAUDE.md §7).
    if (frame && focus?.target) {
      const framed = frame;
      // Not when the engine is the one moving the keyboard. `focusin` fires
      // synchronously — measured, not assumed — so this listener runs *during*
      // a hand-over and cannot otherwise tell it from a reader arriving. The
      // engine hands the keyboard to a room's first control on entry, and
      // without this the front wall framed itself before the reader had seen
      // the room: five labels already expanded, the push with nothing left to
      // do, and every rectangle in the room read while the projection was still
      // travelling. Sixteen checks said so in four different ways, which is what
      // it looks like when one thing is wrong underneath all of them.
      const onIn = () => {
        if (context.handingFocus) return;
        frameFor(framed);
      };
      const onOut = () => {
        if (context.handingFocus) return;
        unframeFor(framed);
      };
      hotspot.button.addEventListener("focusin", onIn);
      hotspot.button.addEventListener("focusout", onOut);
      context.onDispose(() => {
        hotspot.button.removeEventListener("focusin", onIn);
        hotspot.button.removeEventListener("focusout", onOut);
      });
    }
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
