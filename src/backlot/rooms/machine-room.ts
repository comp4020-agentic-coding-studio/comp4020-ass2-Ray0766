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
import {
  ROOM,
  buildRoomShell,
  fitInside,
  wallSurfaces,
  type MountSurface,
  type PieceFrame,
  type RoomFocus,
} from "./shell";
import {
  DESK,
  MONITOR,
  TOWER,
  buildCables,
  buildChair,
  buildDesk,
  buildJacket,
  buildMonitor,
  buildMug,
  buildStoryboards,
  buildTower,
  type Kit,
  type TowerBuild,
} from "./furniture";

/** How often the room asks which screen the figure is facing. Four times a
 *  second is faster than anybody turns and cheap enough to leave on. */
const FACING_INTERVAL = 0.25;

/** What a screen's practical does between a poster and a clip, before exposure,
 *  and how long it takes about it when the reader has not asked for less
 *  motion. */
const GLOW = { poster: 1.2, live: 3.5, seconds: 0.3 };

/**
 * The room's exposure, read off the brightest thing it paints a lit surface
 * with rather than off the floor.
 *
 * It used to target the floor, and that is the wrong end of the range to
 * expose for. The palette's surfaces run from `--at-bg` at linear 0.0017 to
 * `--at-tertiary` at 0.121 — a factor of 70 — so a level that lifts the floor
 * to something you can see puts every other token past 1.0, and past 1.0 a
 * colour stops being a colour. Measured in the resting shot: the floor read
 * rgb(33–43), which is right, while the jacket, the coffee and the light inside
 * the tower were all flat saturated gold with no shape left in them. You expose
 * for the highlight; the shadows are allowed to be shadows, and in this room
 * they are the page's own near-black, which is what the floor is meant to be.
 */
/** What fraction of the room's own level the light inside the tower runs at.
 *  Measured on the composite, not guessed: the receipt carries the cell means
 *  it was tuned against. */
const TOWER_GLOW = 0.34;

const HIGHLIGHT = "--at-tertiary";
/** Where that token should land, in linear light, with the stage's own three
 *  lights already on it. Under 1.0 by enough that a specular-free Lambert never
 *  reaches it. */
const TARGET_HIGHLIGHT = 0.68;

function exposureFrom(linear: [number, number, number]): number {
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return Math.min(40, Math.max(0.2, TARGET_HIGHLIGHT / Math.max(luminance, 1e-4)));
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

/**
 * How far out the front wall's push comes, in slot pitches.
 *
 * The ladder is five rungs and it is read as a ladder, so the push holds more
 * than the rung the reader stopped at: it has to hold all five names at once,
 * in one row, which is the whole of what this number is for. It is a band with
 * a floor and a ceiling and this sits in the middle of it, and both ends are
 * measured rather than guessed — at 1920x1080 the canvas is 923 px tall, which
 * is the number the arithmetic below is in.
 *
 * **The floor.** The five labels render 113, 163, 157, 281 and 314 px wide —
 * 1,028 px of name. Two neighbouring controls crowd, and come down to their
 * dots, once their anchors are closer than (a + b) / 2 + 4 px; the widest pair
 * is t4 and t5 at 301.5 px, and their anchors are exactly one pitch apart. So
 * the wall has to resolve at least 301.5 / 1.02 = 296 px per metre, and
 * anything further out puts two of the five back on their dots — which is the
 * two-row answer this is instead of.
 *
 * **The ceiling.** The row has to fit the canvas: four pitches between the outer
 * two anchors, plus half of the first label and half of the last, is 1,896 px of
 * usable width at about 412 px per metre. Past that the last control clamps to
 * the edge of the frame and stacks.
 *
 * 1.17 pitches lands at 339 px per metre — the wall 1,967 px across against
 * 1,028 px of label, with 15% of headroom on the crowding test and 18% on the
 * canvas. Measured after, at both viewports and in both themes; the numbers are
 * in the receipt.
 */
const FRONT_PUSH_PITCHES = 1.17;

/**
 * And the width below which the front wall does not push at all.
 *
 * Not a tuning: it is the width below which **every** control on the backlot is
 * a dot, decided rather than clipped — `backlot-hud.css` has the media query and
 * `engine/hotspots.ts` has the same number as `PHONE_WIDTH`. This is the third
 * place it is written down, which is a cost worth naming: if it moves, it moves
 * in three files.
 *
 * The push exists to buy one row of five names. Below this width there are no
 * names to put in a row, so there is nothing to buy — and it is not free:
 * measured at 390x844 the framed box is 2.72 m wide against a 4.9 m run, so two
 * of the five rungs clamp to the edge of the frame with no rect at all. Paying
 * two screens for a row that does not exist is the wrong trade, so the wall
 * stays where it is and the room keeps the resting view that already holds all
 * five.
 *
 * The doors' push is untouched by this and should be: at 390 it is 5.71x and
 * takes a window from 21 px across to 120, which is the whole of what it is for.
 */
const DOT_WIDTH = 640;

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
    // is a figure covering it — watched happen. 0.75 m across clears the framed
    // half-width of 0.74 m, so the figure stands at the end of the desk and out
    // of the shot it just asked for.
    standOff: 0.6,
    standShift: new Vector3(0.75, 0, 0),
    // Tighter than the default, and the number has three ground distances to
    // sit between. The stand point is 0.96 m from under the panel, so arriving
    // has to be inside it. The spot in front of the middle screen is 1.69 m
    // away and the room's entry point 2.85 m, and neither may be inside it —
    // the second because the figure would already be near when the room seeds
    // proximity and the arrival that frames the graph would never happen, which
    // I watched, and the first because standing at the wall of screens is not
    // standing at the desk. The desk is off the middle screen's line in depth
    // for the same reason: in line with it, those two distances came within
    // 20 mm of each other and no reach could separate them.
    reach: 1.3,
    edge: { margin: 0.022, depth: 0.03, role: "bezel" },
    heightHint: fitInside(aspect, box).height,
  };
}

export async function buildMachineRoom(context: RoomContext): Promise<void> {
  const deskPiece = context.room.pieces.find((piece) => piece.wall === "desk");
  const desk = deskPiece ? deskSurface(deskPiece.aspect) : null;

  // The front wall's own geometry, worked out from the same function the shell
  // hangs the pieces with rather than from the pieces themselves: `focusFor` is
  // called while the shell is still being built, so there are no frames to
  // measure yet. Same input, same answer.
  const frontCounts: Record<string, number> = {};
  for (const piece of context.room.pieces) frontCounts[piece.wall] = (frontCounts[piece.wall] ?? 0) + 1;
  const frontSurface = wallSurfaces(frontCounts).front;
  const frontPiece = context.room.pieces.find((piece) => piece.wall === "front");
  // Live, not read once: a reader who turns a phone sideways crosses this, and a
  // query settled at build time would have answered for the room's whole life.
  const dots = window.matchMedia(`(max-width: ${DOT_WIDTH}px)`);
  const frontWall: RoomFocus | null = frontPiece
    ? {
        skip: () => dots.matches,
        // The middle of the run, so every one of the five frames the same shot
        // and the ladder does not slide sideways as the reader moves along it.
        target: frontSurface.centre.clone(),
        radius: frontSurface.pitch * FRONT_PUSH_PITCHES,
        normal: frontSurface.normal.clone(),
      }
    : null;

  // The machine, worked out before the shell is asked for it.
  //
  // `DESK.centre + TOWER.centre` because the tower is parented to the desk
  // group; the hotspot's position is world space either way, so it is the same
  // arithmetic `buildTower` does, not a second copy of the answer.
  const towerCentre = DESK.centre.clone().add(TOWER.centre).setY(TOWER.height / 2);
  // The front panel's own normal. `TOWER.turn` is a positive rotation about y,
  // so the face points at (sin, 0, cos).
  const towerFacing = new Vector3(Math.sin(TOWER.turn), 0, Math.cos(TOWER.turn));
  // Half the longest side. The engine fits `max(radius, radius / aspect)` as a
  // half-height, so a radius guarantees a box two of them wide — which makes it
  // the thing's half-width. Same reasoning as the monitor.
  const towerReach = Math.max(TOWER.width, TOWER.height, TOWER.depth) / 2;
  let built: TowerBuild | undefined;

  const shell = buildRoomShell(context, {
    surfaces: desk ? { desk } : {},
    /**
     * The tower, built here so that the button the manifest asks for can be
     * registered in the manifest's own order.
     *
     * Two things this is load-bearing for, and the second one is the one that
     * would not have been noticed:
     *
     *   - **the control is parked at the machine.** An interactive with no
     *     `pieceId` is otherwise laid out on a row by the back wall, and a
     *     button by the back wall that claims to be about the tower is the
     *     defect `HotspotSpec.surface` exists to fix, re-made.
     *   - **the loose row does not move.** That row's x positions are
     *     `(loose - (looseCount - 1) / 2) * 1.8`, so a third loose control takes
     *     `open-studio` and `leave-machine-room` from ±0.9 m to ±1.8 — half the
     *     room — and with them the composition. A fixture is not loose, so the
     *     count stays 2.
     */
    fixtures(kit) {
      built = buildTower(kit);
      return {
        "look-machine": {
          object: built.group,
          position: towerCentre,
          // Far enough out that standing at the desk is not standing at the
          // machine: the two are 1.4 m apart on the desk's own axis.
          radius: 0.62,
          focus: { radius: towerReach, normal: towerFacing.clone() },
          arrival: "At the machine.",
        },
      };
    },
    arrivalFor: (_interactive, frame) => frame?.piece.caption,
    onInteractive: (interactive, frame) => approach(frame, interactive.kind === "play-clip"),
    // Two things the camera comes in for, and they come in differently.
    //
    // The monitor is a thing on a desk: half the panel's longest side, not half
    // its diagonal. The engine fits `max(radius, radius / aspect)` as a
    // half-height, so what it guarantees at every aspect is a box 2 × radius
    // wide — which makes radius the thing's half-width, and a diagonal here
    // would just frame emptier.
    //
    // The front wall is a ladder, and a rung of it is not read on its own. It
    // used to have no push at all, on the reasoning that a clip is watchable at
    // 86 px and only the graph needed the camera. That was about the picture and
    // it was right about the picture; it was silent about the five names, which
    // at room distance are five labels across 143 px of artwork each and come
    // down to their dots. The push is what pays for them: it is the same arrival
    // the doors now have, and at the wall the row fits.
    focusFor: (_interactive, frame) => {
      if (!frame) return undefined;
      if (frame.piece.id === deskPiece?.id) {
        return { radius: Math.max(frame.width, frame.height) / 2, normal: frame.normal.clone() };
      }
      if (frame.piece.wall === "front" && frontWall) return frontWall;
      return undefined;
    },
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

  // Built by `fixtures` above, before the buttons, and parented here. Nothing
  // renders between those two points — the whole of L0 is synchronous — so the
  // first park sees it in place and the published rect is right from the first
  // frame.
  if (!built) throw new Error("backlot: the shell never asked for the room's fixtures, so there is no machine");
  const tower = built;
  deskGroup.add(tower.group);
  deskGroup.add(buildCables(kit));


  // On the near corner, in the monitor's own light. At the room's scale it is
  // nine pixels across and reads as nothing; it is there for the close-up the
  // desk gets when the camera comes in, and the receipt says so.
  const mug = buildMug(kit);
  mug.position.set(DESK.width / 2 - 0.26, DESK.top, DESK.depth / 2 - 0.18);
  deskGroup.add(mug);

  // Leaned against the end of the desk, not lying on it: at 52° above the floor
  // a sheet flat on a desk foreshortens to nothing, and the same stack stood up
  // turns its face to the camera.
  const storyboards = buildStoryboards(kit);
  storyboards.position.set(-DESK.width / 2 - 0.11, 0.02, DESK.depth / 2 - 0.1);
  storyboards.rotation.set(Math.PI * 0.43, 0.22, 0);
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
  let exposure = exposureFrom(context.colours.get(HIGHLIGHT));
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
  const deskLamp = painter.lamp(new PointLight(undefined, 1.6 * exposure, 3, 1.7), "screenLight");
  deskLamp.position.copy(monitor.screenCentre).add(new Vector3(0, 0.3, 0.48));
  context.root.add(deskLamp);

  // Two overheads, low: enough that the far corners are not flat, and not so
  // much that they drown the screens. What lights this room is the pictures on
  // its walls, and a screen's pool only reads if it is at least the strength of
  // whatever else is falling on the same floor — measured, the overheads at
  // their old level put 7.8 on the floor against a screen's 1.1, which is a
  // pool five counts deep and invisible.
  const overheads: PointLight[] = [];
  for (const z of [-ROOM.depth / 4, ROOM.depth / 4]) {
    const lamp = painter.lamp(new PointLight(undefined, 0.7 * exposure, ROOM.width * 1.4, 1.25), "roomLight");
    lamp.position.set(0, ROOM.height - 0.4, z);
    context.root.add(lamp);
    overheads.push(lamp);
  }

  // This light is 0.15 m from every surface it falls on, so the inverse square
  // does most of the work and the room's own level would put the card, the
  // radiator and the fans all past 1.0 — which is what the case looked like
  // before: one flat gold rectangle with no shape in it. It is now a third
  // rather than a seventh, because the case turned three quarters on and the
  // glass went from square to the camera to 43 px of rake: the same light has a
  // twelfth of the panel to come through, and at the old level the glass read
  // as a black side.
  tower.interior.intensity *= exposure * TOWER_GLOW;

  // A theme flip changes every albedo in the room at once, so the exposure has
  // to move with it or one of the two themes is always wrong.
  const stopTheme = context.colours.onThemeChange(() => {
    exposure = exposureFrom(context.colours.get(HIGHLIGHT));
    for (const [pieceId, level] of glow) {
      level.target = (live === pieceId ? GLOW.live : GLOW.poster) * exposure;
      level.current = level.target;
      const lamp = practicals.get(pieceId);
      if (lamp) lamp.intensity = level.current;
    }
    deskLamp.intensity = 1.6 * exposure;
    for (const lamp of overheads) lamp.intensity = 0.7 * exposure;
  });

  // The figure arrives at the engine's own entry point, which is outside this
  // room. Put it inside, looking at the ladder, and far enough from the desk
  // that the desk's own reach does not already contain it — or the room would
  // frame the monitor the instant anyone walked in.
  // Down the open side, clear of the desk, the tower and the chair: the engine
  // clamps the figure to the composition, so anywhere behind it is a figure
  // standing in the desk, and anywhere in front of a prop is a figure covering
  // one.
  context.player.placeAt(new Vector3(1.9, 0, 0.75), new Vector3(0, 0, -1));

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
