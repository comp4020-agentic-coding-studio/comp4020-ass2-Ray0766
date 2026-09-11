// The machine room: the convener's own room, behind the Studio door.
//
// The walls are the shell's job (shell.ts) and the furniture is geometry
// (furniture.ts). What this file owns is the wiring — which layer brings what,
// which screen is allowed a decoder, and what the lights do about it.
//
// The order the room comes up in is the order a reader needs it:
//
//   L0  every shape and every light, synchronous. You can walk the room, read
//       the tower through the glass and stand at the desk before anything has
//       been fetched. A frame is already the shape of the file that belongs in
//       it, because `piece.aspect` is the file's real pixel size.
//   L1  the stills and the posters, each one fading up over the fill it is
//       replacing, and the graph on the monitor.
//   L2  one clip. `facingWhich` names the screen the figure is squarely facing
//       and that screen alone gets a decoder; everything else is on its poster.
//   L3  a model, if there is one, for the one thing box geometry cannot be.
//
// Every one of those can come back with nothing, and nothing is a normal
// outcome: no texture leaves the fill, no clip leaves the poster, no model
// leaves the procedural jacket over the chair.
//
// The room brings no ambient and no key light of its own. The stage already
// has three (src/backlot/engine/scene.ts) and they stay lit while a room is
// mounted, so everything added here is a practical: light that comes off
// something in the room.
import { Group, PointLight, Vector3, type BufferGeometry, type Object3D, type Texture } from "three";
import type { BacklotPiece, RoomContext, VideoHandle } from "../engine/types";
import { ROOM, buildRoomShell, fitInside, type MountSurface, type PieceFrame } from "./shell";
import {
  DESK,
  MONITOR,
  buildCables,
  buildChair,
  buildDesk,
  buildJacket,
  buildMonitor,
  buildMug,
  buildStoryboards,
  buildTower,
  type Kit,
} from "./furniture";

/** How often the room asks which screen the figure is facing. Four times a
 *  second is faster than anybody turns and cheap enough to leave on. */
const FACING_INTERVAL = 0.25;

/** What a screen's practical does between a poster and a clip, before exposure,
 *  and how long it takes about it when the reader has not asked for less
 *  motion. */
const GLOW = { poster: 0.18, live: 1.1, seconds: 0.3 };

/**
 * The room's exposure, from the floor's own token.
 *
 * The surfaces in here are the page's surfaces, which is the point — and the
 * page's dark surface is linear 0.005 where its light one is 0.92, a factor of
 * 180 between the two themes. One fixed set of intensities cannot serve both:
 * tuned for the dark theme the light one blows out, tuned for the light theme
 * the dark one is a black box, which is what it was. So the practicals are
 * scaled by what the floor actually reflects, which is what an exposure is.
 * Measured, in Chrome, both themes: --at-bg comes back linear 0.0045 dark and
 * 0.985 light.
 */
const TARGET_REFLECTANCE = 0.1;

function exposureFrom(linear: [number, number, number]): number {
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return Math.min(40, Math.max(1, TARGET_REFLECTANCE / Math.max(luminance, 1e-4)));
}

/**
 * The one CC0 model in the room, and the only thing in it that boxes and
 * cylinders cannot be: a moulded chair shell on a tube frame.
 *
 * Poly Haven's School Chair 01 (CC0), decimated to 1,128 vertices and stripped
 * of its textures — the room's colour comes from tokens, so a model brings
 * shape and nothing else. 36,172 bytes, 22.4 kB over the wire. Source URL and
 * the exact commands are in receipts/rig-3d/rooms.md.
 *
 * It arrives at layer 3, over a procedural chair that is already standing. If
 * it never arrives, the procedural one is what the room has, which is what it
 * had a moment ago.
 */
const CHAIR_MODEL = "chair.glb";

/** Where the model has to sit to be the chair the jacket is already draped
 *  over: its backrest is at −z and the room's is at +z, and its seat is 50 mm
 *  deeper than the procedural one. Measured off the file's own positions. */
const CHAIR_MODEL_FIT = { turn: Math.PI, shift: -0.12 };

/** Assets under public/backlot/, from the prefix the page already resolved for
 *  public/studio/. Client code never calls withBase and never writes a
 *  root-absolute URL, so the base has to come from the one it was given. */
function backlotAsset(assetPrefix: string, file: string): string {
  return `${assetPrefix.replace(/studio\/$/, "backlot/")}${file}`;
}

/** The monitor's panel, as a mount surface the shell can hang the desk piece
 *  on: one slot, sized to the panel, leaning with it. */
function deskSurface(aspect: [number, number]): MountSurface {
  const box = { width: MONITOR.screenWidth, height: MONITOR.screenWidth };
  return {
    centre: DESK.centre.clone().add(MONITOR.centre),
    along: new Vector3(1, 0, 0),
    normal: new Vector3(0, Math.sin(-MONITOR.tilt), Math.cos(MONITOR.tilt)).normalize(),
    pitch: 1,
    box,
    // Close in: a monitor is read from a chair's distance, not from across a
    // room, and the smallest type on it is 12 px in a 2048 px drawing. And to
    // one side of it: the camera frames this panel, the projection is
    // orthographic, and a figure standing squarely in front of a framed panel
    // is a figure covering it — watched happen, at the right-hand end of the
    // desk the figure is beside the monitor and out of the framed shot.
    standOff: 0.8,
    standShift: new Vector3(0.8, 0, 0),
    // Tighter than the default, and the number comes from two ground distances
    // it has to sit between: the stand point is 1.13 m from under the panel
    // (0.8 m out, 0.8 m to one side), so arriving has to be inside it; and the
    // room's own entry point is 1.98 m away, so walking in has to be outside
    // it, or the figure is already near at the moment the room seeds proximity
    // and the arrival that frames the graph never happens. Watched happen.
    reach: 1.5,
    edge: { margin: 0.022, depth: 0.03, role: "bezel" },
    heightHint: fitInside(aspect, box).height,
  };
}

export async function buildMachineRoom(context: RoomContext): Promise<void> {
  const deskPiece = context.room.pieces.find((piece) => piece.wall === "desk");
  const desk = deskPiece ? deskSurface(deskPiece.aspect) : null;

  const shell = buildRoomShell(context, {
    surfaces: desk ? { desk } : {},
    arrivalFor: (_interactive, frame) => frame?.piece.caption,
    onInteractive: (interactive, frame) => approach(frame, interactive.kind === "play-clip"),
    // Only the monitor. The five screens on the front wall are 86 px across at
    // 1920×1080 and a clip is watchable at that; a sixteen-node workflow graph
    // is not, and framing all six would mean the camera moved every time the
    // figure crossed the room.
    //
    // Half the panel's longest side, not half its diagonal. The engine fits
    // `max(radius, radius / aspect)` as a half-height, so what it guarantees at
    // every aspect is a box 2 × radius wide — which makes radius the thing's
    // half-width, and a diagonal here would just frame emptier.
    focusFor: (_interactive, frame) =>
      frame && frame.piece.id === deskPiece?.id
        ? { radius: Math.max(frame.width, frame.height) / 2, normal: frame.normal.clone() }
        : undefined,
  });
  const painter = shell.painter;

  const geometries: BufferGeometry[] = [];
  const kit: Kit = {
    painter,
    track<T extends BufferGeometry>(geometry: T): T {
      geometries.push(geometry);
      return geometry;
    },
  };

  // ------------------------------------------------------------------- L0 --
  const fitOut = new Group();

  const deskGroup = buildDesk(kit);
  const monitor = buildMonitor(kit, desk?.heightHint ?? MONITOR.screenWidth);
  deskGroup.add(monitor.group);

  const tower = buildTower(kit);
  deskGroup.add(tower.group);
  deskGroup.add(buildCables(kit));

  const mug = buildMug(kit);
  mug.position.set(DESK.width / 2 - 0.24, DESK.top, DESK.depth / 2 - 0.2);
  deskGroup.add(mug);

  const storyboards = buildStoryboards(kit);
  storyboards.position.set(-DESK.width / 2 + 0.27, DESK.top, DESK.depth / 2 - 0.17);
  storyboards.rotation.y = -0.18;
  deskGroup.add(storyboards);

  fitOut.add(deskGroup);

  const chair = buildChair(kit);
  const jacket = buildJacket(kit);
  chair.group.add(jacket);
  fitOut.add(chair.group);

  context.root.add(fitOut);

  // --- practicals ---
  // One lamp in front of every clip screen, so what the room is lit by is the
  // pictures on its walls, and one in front of the monitor, which is what puts
  // screen light on the desk top and the floor under it.
  let exposure = exposureFrom(context.colours.get("--at-bg"));
  let live: string | null = null;
  const glow = new Map<string, { current: number; target: number }>();

  const clipPieces = context.room.pieces.filter((piece) => piece.kind === "clip");
  const practicals = new Map<string, PointLight>();
  for (const piece of clipPieces) {
    const frame = shell.frame(piece.id);
    if (!frame) continue;
    const lamp = painter.lamp(new PointLight(undefined, GLOW.poster * exposure, 9, 1.5), "screenLight");
    lamp.position.copy(frame.centre).addScaledVector(frame.normal, 0.6);
    context.root.add(lamp);
    practicals.set(piece.id, lamp);
    glow.set(piece.id, { current: lamp.intensity, target: lamp.intensity });
  }

  // Above and in front of the panel rather than level with it. A screen's spill
  // comes off a 0.62 × 0.39 area, and the nearest thing a point standing in for
  // that must not be is the panel's own bezel: at 0.3 m the inverse square put
  // the bezel and the stand at a hundred times the desk's irradiance, which was
  // invisible at 85 px per metre and a white halo the moment the camera came in.
  const deskLamp = painter.lamp(new PointLight(undefined, 0.45 * exposure, 3, 1.7), "screenLight");
  deskLamp.position.copy(monitor.screenCentre).add(new Vector3(0, 0.3, 0.48));
  context.root.add(deskLamp);

  // Two overheads, so the far corners of the set are not flat. The stage's own
  // three lights are tuned for the ring outside, which has no walls to fall on.
  const overheads: PointLight[] = [];
  for (const z of [-ROOM.depth / 4, ROOM.depth / 4]) {
    const lamp = painter.lamp(new PointLight(undefined, 2.2 * exposure, ROOM.width * 1.4, 1.25), "roomLight");
    lamp.position.set(0, ROOM.height - 0.4, z);
    context.root.add(lamp);
    overheads.push(lamp);
  }

  tower.interior.intensity *= Math.min(exposure, 6);

  // A theme flip changes every albedo in the room at once, so the exposure has
  // to move with it or one of the two themes is always wrong.
  const stopTheme = context.colours.onThemeChange(() => {
    exposure = exposureFrom(context.colours.get("--at-bg"));
    for (const [pieceId, level] of glow) {
      level.target = (live === pieceId ? GLOW.live : GLOW.poster) * exposure;
      level.current = level.target;
      const lamp = practicals.get(pieceId);
      if (lamp) lamp.intensity = level.current;
    }
    deskLamp.intensity = 0.45 * exposure;
    for (const lamp of overheads) lamp.intensity = 2.2 * exposure;
  });

  // The figure arrives at the engine's own entry point, which is outside this
  // room's back wall. Put it inside, at the back, looking at the ladder — and
  // far enough back that the desk's own reach does not already contain it, or
  // the room would frame the monitor the instant anyone walked in.
  context.player.placeAt(new Vector3(0, 0, ROOM.depth / 2 - 0.55), new Vector3(0, 0, -1));

  // -------------------------------------------------------------- L2 state --
  // One decoder, and this room is what holds that true: `setLive` releases
  // whatever was playing before it asks anything to play.
  const handles = new Map<string, VideoHandle>();

  const handleFor = (piece: BacklotPiece): VideoHandle => {
    const existing = handles.get(piece.id);
    if (existing) return existing;
    const made = context.layers.video(piece);
    handles.set(piece.id, made);
    return made;
  };

  const setLive = (pieceId: string | null): void => {
    if (live === pieceId) return;
    const leaving = live;
    live = pieceId;
    if (leaving) {
      // Released, not paused. A paused decoder is still a decoder.
      handles.get(leaving)?.release();
      const dim = glow.get(leaving);
      if (dim) dim.target = GLOW.poster * exposure;
      // Back onto the poster in the same tick. Waiting on a reload would leave
      // the frame showing a texture whose video element has just been emptied,
      // which WebGL reports as "texImage2D: no video" once a frame until
      // something replaces it.
      const previous = shell.frame(leaving);
      if (previous) previous.show(posters.get(leaving) ?? null);
    }
    if (!pieceId) return;
    const frame = shell.frame(pieceId);
    if (!frame) return;
    const handle = handleFor(frame.piece);
    const lit = glow.get(pieceId);
    if (lit) lit.target = GLOW.live * exposure;
    void handle
      .play()
      .then(() => {
        // Another screen may have won the race while this one was starting.
        if (live !== pieceId) {
          handle.release();
          return;
        }
        if (handle.texture) frame.show(handle.texture);
      })
      .catch(() => {
        // A clip that will not play leaves the poster up and the room intact.
        if (live === pieceId) live = null;
        const dim = glow.get(pieceId);
        if (dim) dim.target = GLOW.poster * exposure;
      });
  };

  // ----------------------------------------------------------- L1 pictures --
  // Kept, not re-fetched: a poster is what a screen goes back to every time a
  // clip is released, and the browser cache is not the right place to keep
  // something that has to be there in the same frame.
  const posters = new Map<string, Texture>();

  async function showStill(frame: PieceFrame, file: string): Promise<void> {
    const texture = await context.layers.texture(file);
    if (texture) posters.set(frame.piece.id, texture);
    // A clip that started playing while its poster was in flight keeps the
    // clip: the poster is the thing underneath, not the thing on top.
    if (live === frame.piece.id) return;
    frame.show(texture);
  }

  for (const piece of context.room.pieces) {
    const frame = shell.frame(piece.id);
    if (!frame || piece.wall === "desk") continue;
    void showStill(frame, piece.poster ?? piece.file);
  }

  // The graph, drawn rather than fetched: the module that draws it carries the
  // graph file inlined, so it is a chunk of its own and nothing on the path to
  // the first frame waits for it.
  if (deskPiece) {
    void (async () => {
      const frame = shell.frame(deskPiece.id);
      if (!frame) return;
      try {
        const { createGraphScreen } = await import("./graph-texture");
        const screen = createGraphScreen(painter, deskPiece.file, deskPiece.caption);
        if (!screen) return;
        frame.show(screen.texture);
        context.onDispose(() => screen.dispose());
      } catch {
        // No graph module, no graph. The monitor keeps its fill and the room
        // is still a room.
      }
    })();
  }

  // -------------------------------------------------------------- L3 model --
  void context.layers.model(backlotAsset(context.assetPrefix, CHAIR_MODEL)).then((model: Object3D | null) => {
    // The stand-in only comes down once something is actually standing in its
    // place. A null here — no file, no loader chunk, no WebGL budget for it —
    // runs none of this and leaves the procedural chair exactly where it was,
    // with the jacket still over it, because the jacket was never the model's.
    if (!model) return;
    model.rotation.y = CHAIR_MODEL_FIT.turn;
    model.position.z = CHAIR_MODEL_FIT.shift;
    // Repainted, not taken as it came. The file's own material is a colour this
    // room did not read off the page, and it is a second lighting model on top
    // of that; both of those are budget, not taste.
    const skin = painter.lit("board");
    model.traverse((node: Object3D) => {
      const mesh = node as Object3D & { isMesh?: boolean; material?: unknown };
      if (mesh.isMesh) mesh.material = skin;
    });
    chair.group.add(model);
    chair.stand.visible = false;
  });

  // ------------------------------------------------------------ behaviour --
  /**
   * Walking up to a picture, in two legs.
   *
   * One leg does not work. `walkTo` points the figure along the way it is
   * travelling, so a walk from one screen to the screen beside it arrives
   * facing sideways — and the facing rule, which is doing exactly what it is
   * supposed to, then squares up whatever is off to that side and starts the
   * wrong clip. Measured: pressing "Play four sentences" left t5 decoding.
   * The second leg runs straight at the picture, so the heading the walk ends
   * on is the picture's own normal.
   */
  let walking = false;
  function approach(frame: PieceFrame | null, play: boolean): void {
    if (!frame) return;
    const player = context.player;
    const back = frame.standPoint.clone().addScaledVector(frame.normal, 1.2);
    const settled = player.position.distanceTo(frame.standPoint) < 0.35;
    walking = true;
    const arrive = settled
      ? Promise.resolve(player.placeAt(frame.standPoint, frame.normal.clone().negate()))
      : player.walkTo(back).then(() => player.walkTo(frame.standPoint));
    void arrive.then(() => {
      walking = false;
      if (play) setLive(frame.piece.id);
      context.announce(frame.piece.caption);
    });
  }

  // `facingWhich` answers from hotspot positions, so it is asked in hotspot
  // ids and the answer is turned back into a piece.
  const clipHotspots = [...shell.pieceOf]
    .filter(([, pieceId]) => clipPieces.some((piece) => piece.id === pieceId))
    .map(([hotspotId]) => hotspotId);

  /**
   * How close to a screen's own spot the figure has to be for that screen to
   * count as the one being watched.
   *
   * Facing alone is not enough, and the room said so: standing at the desk
   * reading the monitor, the figure is also squarely facing the middle screen
   * six metres away down the room, and that screen started decoding. So the
   * reach is derived from the wall itself — a bit under the gap between two
   * neighbouring spots, so each screen owns the floor in front of it and
   * nothing owns the middle of the room.
   */
  const spots = clipPieces.map((piece) => shell.frame(piece.id)?.standPoint).filter((spot) => spot !== undefined);
  const watchReach =
    0.8 *
    Math.min(
      ...spots.flatMap((spot, index) => (index ? [spot.distanceTo(spots[index - 1]!)] : [])),
      ROOM.standOff,
    );

  let sinceCheck = 0;
  const stopFrame = context.onFrame((delta) => {
    // The lights first, so a release that happened last tick is already on its
    // way down before anything else is decided.
    for (const [pieceId, level] of glow) {
      if (level.current === level.target) continue;
      // Under reduced motion the state still changes; it just arrives.
      const step = context.reducedMotion ? 1 : Math.min(1, delta / GLOW.seconds);
      level.current += (level.target - level.current) * step;
      if (Math.abs(level.target - level.current) < 0.02) level.current = level.target;
      const lamp = practicals.get(pieceId);
      if (lamp) lamp.intensity = level.current;
    }

    sinceCheck += delta;
    if (sinceCheck < FACING_INTERVAL) return;
    sinceCheck = 0;
    // A walk the reader asked for is not second-guessed halfway along it.
    if (walking) return;

    const squarelyAt = shell.pieceOf.get(context.player.facingWhich(clipHotspots) ?? "") ?? null;
    const standing = squarelyAt ? shell.frame(squarelyAt) : null;
    const facingPiece =
      standing && context.player.position.distanceTo(standing.standPoint) <= watchReach ? squarelyAt : null;
    if (facingPiece === live) return;
    if (facingPiece === null) {
      // Turned away, or turned to something that is not a screen. The decoder
      // goes with the attention.
      setLive(null);
      return;
    }
    // Squaring up to a different screen always ends the one that was playing.
    // Whether it starts the new one is the reader's call under reduced motion:
    // nothing plays itself, so the screen arrives on its poster and the button
    // is what starts it.
    setLive(context.reducedMotion ? null : facingPiece);
  });

  context.onDispose(() => {
    // The camera belongs to the engine and the hub is about to want it back.
    context.unfocus();
    stopFrame();
    stopTheme();
    live = null;
    for (const handle of handles.values()) handle.release();
    handles.clear();
    for (const geometry of geometries) geometry.dispose();
    geometries.length = 0;
  });

  await Promise.resolve();
}
