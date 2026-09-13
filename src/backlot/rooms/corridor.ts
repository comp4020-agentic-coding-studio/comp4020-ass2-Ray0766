// The Lectures corridor: twelve teaching weeks, twelve doors, and the walk down
// them is the course in order.
//
// What this file owns is the place and the doors — the box, the twelve frames,
// the openings cut in them, the boards over the lintels, the light on the floor,
// and every button. What is *behind* an opening is `corridor-windows.ts`, which
// is the same split `engine/hub.ts` draws between the door it builds and the
// `dress()` that puts a picture in it. The seam is one function: the corridor
// hands over a `fill`, the windows hand back a texture.
//
// Three things this room is, stated once, because each of them was a decision
// and none of them is obvious from the geometry:
//
//   1. **It is a second fit-out over the same shell, and it cost two things.**
//      `rooms/index.ts` said a second room should be one, and that turned out to
//      be true of the box — `buildRoomShell` needed the room's own metres and
//      nothing else — and not true of the *door*. Everything a press is lived in
//      `engine/index.ts` keyed on `hub.find`, so a room could have a door's
//      geometry and not its behaviour. `RoomContext.door` is that fixed: the
//      engine keeps the meaning of a door and this file keeps the door.
//
//   2. **The side doors are raked, and they have to be.** The god view looks
//      down the corridor at 52 degrees, and a door flat on a side wall has its
//      face exactly edge-on to that: it projects to a line and shows nothing.
//      So every side door stands proud of its wall and turns toward the open
//      end, which is what `shell.ts`'s own side walls already do and for the
//      same reason — a set is three walls raked toward the camera and an open
//      fourth. What a reader sees is a long floor with a row of doors angled
//      out of each wall, which is what a corridor is from above.
//
//   3. **The end wall finishes it.** Week 12 is `side: "end"` in the manifest
//      and faces you square on, which is the one surface in this room the camera
//      keeps whole. A reader who walks to the end has arrived somewhere rather
//      than run out of doors.
import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  Vector3,
  type MeshBasicMaterial,
  type MeshLambertMaterial,
  type Object3D,
  type Texture,
} from "three";
import type { RoomContext, RoomDoor, RoomDoorHandle } from "../engine/types";
// The one drawing shop in the backlot. A corridor door's name board is the same
// object as a ring door's — a word on a horizontal surface, which is the only
// kind of surface the god view never turns away — so it is the same function
// that draws it, at the same cap height, rather than a second sign painter with
// its own opinion about type.
import { createSignwriter } from "../engine/signage";
import { buildRoomShell, fitInside, type RoomBox, type RoomFixture } from "./shell";
import { createStageWindows, type StageOpening } from "./corridor-windows";
import type { BacklotStage } from "./manifest";
import type { Kit } from "./furniture";

// ---------------------------------------------------------------- the plan

/**
 * Metres. Fifteen of floor, four point eight across, two point five to the
 * ceiling.
 *
 * The depth is the content and the width is what the doors need to stand in.
 * Eleven of the twelve weeks hang along the length at one metre of pitch, which
 * is ten metres of run; the near end keeps 2.9 m so a reader arrives in a
 * corridor rather than against the first door, and the far end keeps 2.1 m so
 * week 12 has floor to be approached across.
 *
 * Width is nearly free and that is worth saying, because it looks like a number
 * somebody should have argued down. The camera fits the room's box at 52
 * degrees, so the vertical extent it has to hold is `height x cos(52) + depth x
 * sin(52)` — 12.5 m here — against a width term of `width / 2 / aspect`, which
 * is 1.15 m at 1920x1080 and 4.3 m at 390x844. The composition is depth-bound at
 * both marking viewports with room to spare, so a metre of width costs nothing
 * on screen and buys the doors somewhere to be raked out to. Measured at
 * 1920x1080 with the engine's room camera: 70.7 px per metre.
 */
const CORRIDOR: RoomBox = { width: 4.8, depth: 15.0, height: 2.5 };

/** Metres between one `depth` in the manifest and the next. Adjacent depths are
 *  on opposite walls, so the same wall's doors are two of these apart. */
const PITCH = 1.0;
/** Floor between the near end and the first door. */
const ENTRY = 2.9;

/**
 * How far a side door's plane stands off its wall, and how much `+z` its normal
 * carries — which together are the rake.
 *
 * `shell.ts` has the same pair for the machine room's side walls and makes the
 * argument there. 0.85 turns a door about 40 degrees out of its wall, which
 * takes its face from projecting to nothing to keeping 0.884 of its width and
 * 0.616 of its height. The cost is that a door is a thing standing in the
 * corridor rather than a hole in the wall, and that is the correct trade for a
 * god view: the alternative is eleven invisible doors.
 */
const RAKE = 0.5;
const RAKE_TURN = 0.85;

/** The leaf, and the frame round it. Smaller than the ring's, because the ring
 *  is a diagram at 41 px per metre and this is a corridor at 70. */
const LEAF = { width: 1.02, height: 2.05, thickness: 0.09 };
const JAMB = { width: 0.13, depth: 0.24 };
const LINTEL_HEIGHT = 0.22;
const FRAME_HEIGHT = LEAF.height + LINTEL_HEIGHT;
const PLINTH = { height: 0.26, spread: 0.06 };
/** Rails across the leaf above and below the opening: the two members that make
 *  a leaf read as a made thing rather than a slab with a hole in it. */
const RAIL_HEIGHT = 0.1;

/**
 * The opening. One shape for all twelve, on purpose.
 *
 * Eight weeks recorded something and their files are 576x1024 or 768x1344 —
 * both 9:16 — and four recorded nothing and hang a panel drawn to the opening.
 * So the house ratio and every file's own ratio are the same ratio, and twelve
 * openings that are one opening is what makes a row of doors read as twelve of
 * one thing. 0.630 x 1.120 m.
 */
const WINDOW = { tall: 1.12, centre: 1.2, rim: 0.05 };
const WINDOW_ASPECT = 9 / 16;
const WINDOW_WIDE = WINDOW.tall * WINDOW_ASPECT;

/**
 * How far out the figure stands to read one, and how close counts as being at
 * it.
 *
 * The reach has a band to sit in and both ends are on the plan. It has to reach
 * the stand point, which is 1.05 m from the window it is in front of. It must
 * **not** reach the middle of the corridor, which is 1.9 m from every side
 * door — so walking down the corridor is at no door at all, and you have to go
 * to one. The next door on the same wall is 2.80 m from this one's stand point
 * and the nearest door on the other wall 3.39 m, so neither of those is what
 * binds; the middle of the corridor is.
 */
const STAND_OFF = 1.05;
const REACH = 1.3;

/** The step in front of a door. It marks where to stand; it is not a diagram of
 *  the trigger radius, which is why it is smaller than one. */
const THRESHOLD_RADIUS = 0.55;
/** The pool a lit window throws on the floor. */
const SPILL = { wide: LEAF.width + 1.0, deep: 2.2, opacity: 0.55 };

/** How far the name board floats over the lintel, and how far it is pulled in
 *  from the door's own line. The board is laid to the world's axes so that all
 *  twelve read left to right on screen — a god view treats every horizontal
 *  surface alike, and a name turned with its door is a name nobody reads — and a
 *  two-digit week's board is 1.15 m wide, which at the door's own x would hang
 *  0.08 m past the floor. Measured, not guessed. */
const BOARD_LIFT = 0.05;
const BOARD_INSET = 0.12;

/** Millimetres of daylight between two planes stacked on the floor, so the
 *  spill, the step and the floor never fight over a pixel. */
const LIFT = 0.012;

/** How far a leaf swings, and how fast. A door, not a trapdoor. Both are the
 *  ring's numbers: a week door that behaves differently from a hub door is a
 *  bug, and that includes how it moves. */
const OPEN_ANGLE = 1.0;
const SWING_RATE = 4.4;

// ------------------------------------------------------------------ places

/** Where a stage's door stands and which way it faces. `side` is the manifest's,
 *  and the three values are the three cases: the two walls and the finish. */
function placeOf(stage: BacklotStage): { centre: Vector3; normal: Vector3 } {
  if (stage.side === "end") {
    return {
      // Just clear of the far wall, so the frame is in front of it rather than
      // inside it.
      centre: new Vector3(0, 0, -CORRIDOR.depth / 2 + JAMB.depth / 2 + 0.02),
      normal: new Vector3(0, 0, 1),
    };
  }
  const sign = stage.side === "left" ? -1 : 1;
  return {
    centre: new Vector3(sign * (CORRIDOR.width / 2 - RAKE), 0, CORRIDOR.depth / 2 - ENTRY - stage.depth * PITCH),
    normal: new Vector3(-sign, 0, RAKE_TURN).normalize(),
  };
}

// ------------------------------------------------------------------- doors

interface StageDoor {
  stage: BacklotStage;
  group: Group;
  /** The middle of the opening, in world space. Taken from the numbers the panes
   *  are placed with rather than read back off a matrix, because the leaf swings
   *  and this has to be where the window is when it is shut — which is where the
   *  reader is standing to look at it. */
  windowCentre: Vector3;
  normal: Vector3;
  standing: Vector3;
  /** One of the two panes, for `HotspotSpec.surface`: the window is the only
   *  part of a door that carries a colour worth measuring, and a button parked
   *  on the leaf's middle is not it. */
  pane: Object3D;
  board: Object3D | null;
  /** Their texture, my material. `null` puts back the flat fill the frame was
   *  built with, which is what an undressed window is and what a released clip's
   *  window shows for the tick before its still goes back up. */
  fill(texture: Texture | null): void;
  /** Paint it as the door the figure is standing at. */
  setNear(near: boolean): void;
  setOpen(open: boolean, instant: boolean): void;
  swing(delta: number): void;
}

interface DoorShop {
  frame: MeshLambertMaterial;
  plinth: MeshLambertMaterial;
  leafRest: MeshLambertMaterial;
  leafAt: MeshLambertMaterial;
  blank: MeshBasicMaterial;
  rim: MeshBasicMaterial;
  spill: MeshBasicMaterial;
  sill: MeshBasicMaterial;
  /** One geometry per shape, shared by all twelve: twelve leaves that differ
   *  only by transform have no business being twelve buffers. */
  leaf: BoxGeometry;
  jamb: BoxGeometry;
  plinthBox: BoxGeometry;
  lintel: BoxGeometry;
  rail: BoxGeometry;
  pane: PlaneGeometry;
  band: PlaneGeometry;
  threshold: CircleGeometry;
  pool: PlaneGeometry;
}

function openShop(kit: Kit, spillMask: Texture | null, grain: Texture | null): DoorShop {
  const { painter, track } = kit;
  const frame = painter.lit("doorFrame");
  const plinth = painter.lit("doorPlinth");
  if (grain) {
    // A frame in one flat fill is a rectangle; a frame with a grain in it is
    // made of something. The map carries no hue — white with darker streaks — so
    // it multiplies into whatever the token is in whichever theme, and a theme
    // flip needs no redraw.
    grain.wrapS = grain.wrapT = RepeatWrapping;
    grain.repeat.set(1, 5);
    frame.map = grain;
    frame.needsUpdate = true;
    plinth.map = grain;
    plinth.needsUpdate = true;
  }
  const spill = painter.flat("doorLight", { transparent: true, depthWrite: false, opacity: SPILL.opacity });
  if (spillMask) spill.alphaMap = spillMask;
  return {
    frame,
    plinth,
    leafRest: painter.lit("doorLeaf"),
    leafAt: painter.lit("doorAt"),
    // The opening's own ground, and it does **not** follow the theme.
    //
    // It is the same decision, for the same reason, that `palette.ts` records on
    // `gate`: a window is a picture plane. A week that shot something hangs the
    // file the rig recorded and the footer toggle does not repaint a recorded
    // frame, so the plane it hangs on must not repaint either. Painted `--at-bg`
    // this was page furniture in a picture's clothes, and the fit below is what
    // made that visible — in the light theme the 1.66 px the photograph does not
    // cover on weeks 3 and 4 read rgb(237,221,195), relative luminance 0.737,
    // which is a blown edge on two of twelve windows in one theme and reads as a
    // fault rather than as a frame. Found by the windows lane after the fit
    // landed; the fit is a correct decision and this is a consequence of it
    // rather than an argument against it.
    blank: painter.flat("gate"),
    rim: painter.flat("doorLight"),
    spill,
    sill: painter.flat("doorSill"),
    leaf: track(new BoxGeometry(LEAF.width, LEAF.height, LEAF.thickness)),
    jamb: track(new BoxGeometry(JAMB.width, FRAME_HEIGHT, JAMB.depth)),
    plinthBox: track(new BoxGeometry(JAMB.width + PLINTH.spread, PLINTH.height, JAMB.depth + PLINTH.spread)),
    lintel: track(new BoxGeometry(LEAF.width + JAMB.width * 2, LINTEL_HEIGHT, JAMB.depth)),
    rail: track(new BoxGeometry(LEAF.width, RAIL_HEIGHT, LEAF.thickness + 0.02)),
    pane: track(new PlaneGeometry(WINDOW_WIDE, WINDOW.tall)),
    band: track(new PlaneGeometry(WINDOW_WIDE + WINDOW.rim * 2, WINDOW.tall + WINDOW.rim * 2)),
    threshold: track(new CircleGeometry(THRESHOLD_RADIUS, 24)),
    pool: track(new PlaneGeometry(SPILL.wide, SPILL.deep)),
  };
}

function buildStageDoor(kit: Kit, shop: DoorShop, stage: BacklotStage, board: Object3D | null): StageDoor {
  const { centre, normal } = placeOf(stage);

  const stand = new Group();
  stand.position.copy(centre);
  // The door's own +z is the way it faces, so everything below is laid out as if
  // the reader were standing in front of it.
  stand.rotation.y = Math.atan2(normal.x, normal.z);

  for (const side of [-1, 1]) {
    const jamb = new Mesh(shop.jamb, shop.frame);
    jamb.position.set((side * (LEAF.width + JAMB.width)) / 2, FRAME_HEIGHT / 2, 0);
    const foot = new Mesh(shop.plinthBox, shop.plinth);
    foot.position.set((side * (LEAF.width + JAMB.width)) / 2, PLINTH.height / 2, 0);
    stand.add(jamb, foot);
  }
  const lintel = new Mesh(shop.lintel, shop.frame);
  lintel.position.set(0, FRAME_HEIGHT - LINTEL_HEIGHT / 2, 0);
  stand.add(lintel);

  // Hinged on the left as the door is approached, so the leaf swings into the
  // corridor and out of the reader's line rather than across it — the ring's
  // hinge, in a narrower place.
  const pivot = new Group();
  pivot.position.set(-LEAF.width / 2, 0, 0);
  const leaf = new Mesh(shop.leaf, shop.leafRest);
  leaf.position.set(LEAF.width / 2, LEAF.height / 2, 0);
  pivot.add(leaf);

  // The opening, and the band of brand fill round it: the light getting past the
  // edge of whatever is in the window, which is what makes a window read as lit
  // from behind rather than as a hole cut in a door.
  //
  // Two panes, front and back. A corridor door is seen from the corridor, but it
  // also swings — and a leaf that turns 57 degrees and shows a blank box where
  // its window was is a door that breaks as it opens. Turned rather than
  // mirrored, so the same material reads the same way round from either face.
  // The picture's own shape, fitted inside the opening rather than stretched to
  // it.
  //
  // Ten of the twelve files are 9:16 and hang edge to edge; weeks 3 and 4 are
  // 768x1344, which is 4:7, and filling the opening with one of those squeezes it
  // 1.6% — a frame that is no longer quite the file the rig recorded, which is a
  // claim this site makes in so many words. It is **top and bottom**, not the
  // sides: 4:7 is relatively wider than 9:16, so fitting by width leaves height
  // spare. Fitting by height instead would want 0.640 m of picture in a 0.630 m
  // opening and would not fit at all.
  //
  // A second mesh rather than the texture, and that is worth a line because the
  // texture is what everybody reaches for first. There is no UV answer here:
  // `repeat` above 1 samples outside the image and clamps, which smears the edge
  // pixel down the margin, and padding the file itself resamples a recorded
  // frame, which is the thing this whole change is about not doing. So the
  // picture is its own plane, 3 mm in front of the opening's fill, at the size
  // `fitInside` gives it.
  //
  // What it costs: 8.75 mm of the opening's own ground above and below the
  // picture, which is **1.66 px** at the 209 px the push delivers and under a
  // pixel at rest. That number is arithmetic and stays arithmetic — read off the
  // composite it came back 8 px top against 3 px bottom in one theme and 0
  // against 4 in the other for the same window, and 1 px on a week that has no
  // margin at all, which is the half-pixel blend §7 already has a rule about.
  const aspect: [number, number] = "aspect" in stage.window ? stage.window.aspect : [9, 16];
  const fitted = fitInside(aspect, { width: WINDOW_WIDE, height: WINDOW.tall });
  const pictureGeometry = kit.track(new PlaneGeometry(fitted.width, fitted.height));

  const panes: Mesh[] = [];
  const pictures: Mesh[] = [];
  for (const face of [1, -1]) {
    const band = new Mesh(shop.band, shop.rim);
    band.position.set(LEAF.width / 2, WINDOW.centre, face * (LEAF.thickness / 2 + 0.002));
    const pane = new Mesh(shop.pane, shop.blank);
    pane.position.set(LEAF.width / 2, WINDOW.centre, face * (LEAF.thickness / 2 + 0.006));
    const picture = new Mesh(pictureGeometry, shop.blank);
    picture.position.set(LEAF.width / 2, WINDOW.centre, face * (LEAF.thickness / 2 + 0.009));
    // Nothing has landed, so there is nothing to show. The opening's own fill is
    // underneath and is what the window is until something does — and what it
    // stays as if nothing ever does.
    picture.visible = false;
    if (face === -1) {
      band.rotation.y = Math.PI;
      pane.rotation.y = Math.PI;
      picture.rotation.y = Math.PI;
    }
    pivot.add(band, pane, picture);
    panes.push(pane);
    pictures.push(picture);
  }

  // A rail above the opening and one below it, each at the middle of the stile
  // on its side — so they are inside the leaf by construction and there is no
  // "does it fit" branch here for nobody to ever watch run.
  for (const y of [(WINDOW.centre + WINDOW.tall / 2 + LEAF.height) / 2, (WINDOW.centre - WINDOW.tall / 2) / 2]) {
    const rail = new Mesh(shop.rail, shop.frame);
    rail.position.set(LEAF.width / 2, y, 0);
    pivot.add(rail);
  }

  // Light on the floor. Not a light and not a shadow map: a painted pool,
  // brightest at the foot of the door and gone before it reaches the middle of
  // the corridor. Twelve real point lights would be twelve more than the stage's
  // three, and `rooms/palette.ts` records what that does to the light theme.
  const pool = new Mesh(shop.pool, shop.spill);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, LIFT * 1.5, SPILL.deep / 2);
  pool.renderOrder = 1;

  const step = new Mesh(shop.threshold, shop.sill);
  step.rotation.x = -Math.PI / 2;
  step.position.set(0, LIFT * 1.2, STAND_OFF);

  stand.add(pivot, pool, step);

  const windowCentre = centre.clone().addScaledVector(normal, LEAF.thickness / 2 + 0.006).setY(WINDOW.centre);
  const standing = centre.clone().addScaledVector(normal, STAND_OFF).setY(0);

  // One material per door for the picture, made here rather than on first fill,
  // so a window that gets one does not allocate in the frame it gets it. It is
  // `--at-white` so a map comes through as itself: a MeshBasicMaterial
  // multiplies its map by its colour and any other token would tint the picture.
  const skin = kit.painter.flat("neutral");
  let target = 0;

  return {
    stage,
    group: stand,
    windowCentre,
    normal: normal.clone(),
    standing,
    pane: panes[0]!,
    board,
    fill(texture) {
      if (!texture) {
        for (const face of pictures) face.visible = false;
        return;
      }
      skin.map = texture;
      skin.needsUpdate = true;
      for (const face of pictures) {
        face.material = skin;
        face.visible = true;
      }
    },
    setNear(near) {
      leaf.material = near ? shop.leafAt : shop.leafRest;
    },
    setOpen(open, instant) {
      target = open ? -OPEN_ANGLE : 0;
      if (instant) pivot.rotation.y = target;
    },
    swing(delta) {
      const difference = target - pivot.rotation.y;
      if (Math.abs(difference) < 1e-4) return;
      const step_ = SWING_RATE * delta;
      pivot.rotation.y += Math.abs(difference) <= step_ ? difference : Math.sign(difference) * step_;
    },
  };
}

// ------------------------------------------------------------- the corridor

export async function buildCorridor(context: RoomContext): Promise<void> {
  const stages = context.room.stages ?? [];
  // Every stage is an `open-page` interactive carrying that week's real href,
  // already base-resolved by the page. The href is taken from the interactive
  // rather than from the stage so there is one URL rather than two that have to
  // agree, and the manifest's order of interactives is the Tab order.
  const openPage = new Map(
    context.room.interactives
      .filter((interactive) => interactive.kind === "open-page" && interactive.stageId)
      .map((interactive) => [interactive.stageId!, interactive]),
  );

  const signs = createSignwriter(context.colours);
  const doors: StageDoor[] = [];
  const presses = new Map<string, RoomDoorHandle>();
  /** The framing each door's hotspot is holding, by stage id. Kept rather than
   *  rebuilt, because the engine writes the radius onto these objects and a copy
   *  would be the number this file guessed at build time. */
  const focusOf = new Map<string, { radius: number; normal?: Vector3 }>();
  /** The stage the figure is at, which is one or none. It is what frames the
   *  camera, what paints the leaf, and what decides which window is allowed a
   *  decoder — one answer, asked once. See `setLive` below. */
  let atStage: string | null = null;
  /** Filled once the shell is up, because a window cannot be dressed before the
   *  frame it hangs in exists. */
  let windows: ReturnType<typeof createStageWindows> | null = null;

  const shell = buildRoomShell(context, {
    box: CORRIDOR,
    /**
     * Twelve doors, built here rather than after `buildRoomShell` returns, and
     * the reason is the Tab order.
     *
     * `fixtures` runs after the room's pieces and **before** its buttons, so a
     * control the room builds still lands where the manifest puts it. The
     * corridor has no pieces at all — a week's door is not a picture on a wall —
     * so every one of its interactives comes through here, and the way out,
     * which is the only loose one, stays last where a way out belongs.
     */
    fixtures(kit) {
      const shop = openShop(kit, signs.spill(), signs.grain());
      const made: Record<string, RoomFixture> = {};
      for (const stage of stages) {
        const interactive = openPage.get(stage.id);
        if (!interactive) continue;

        // The week's number on a board over the lintel.
        //
        // The number rather than "Week 5" or the lecture's title, and that is a
        // decision about width rather than about brevity: a board is laid to the
        // world's axes so it reads left to right from above, and one carrying
        // the word WEEK is 2.6 m wide against a corridor 4.8 m across — two of
        // them would meet in the middle. A numbered door is what a corridor
        // has. The week's title is on the button, in the live region when the
        // figure arrives, and in the list under the stage.
        let board: Object3D | null = null;
        const sign = signs.lintelSign(String(stage.week));
        if (sign) {
          const material = kit.painter.flat("neutral", { transparent: true, depthWrite: false });
          material.map = sign.texture;
          material.needsUpdate = true;
          const geometry = kit.track(new PlaneGeometry(sign.metresWide, sign.metresTall));
          const plate = new Mesh(geometry, material);
          plate.rotation.x = -Math.PI / 2;
          const { centre } = placeOf(stage);
          plate.position.set(
            centre.x === 0 ? 0 : centre.x - Math.sign(centre.x) * BOARD_INSET,
            FRAME_HEIGHT + BOARD_LIFT,
            centre.z,
          );
          plate.renderOrder = 3;
          board = plate;
        }

        const door = buildStageDoor(kit, shop, stage, board);
        doors.push(door);

        // Seeded with the opening's own half-extent and replaced by the engine
        // the moment the door is registered — the radius that delivers the
        // window's pixel floor depends on the canvas, and the canvas is the
        // engine's. Handed to the hotspot by reference, so both halves hold one
        // object (`RoomFixture.focus`).
        const focus = { radius: Math.max(WINDOW_WIDE, WINDOW.tall) / 2, normal: door.normal.clone() };
        focusOf.set(stage.id, focus);

        made[interactive.id] = {
          object: door.pane,
          position: door.windowCentre,
          radius: REACH,
          focus,
          arrival: `At the week ${stage.week} door: ${stage.title}. Press Enter to open it.`,
          activate: () => presses.get(stage.id)?.press(),
          onProximity: (near) => arrive(door, near),
        };
      }
      return made;
    },
  });

  const fitOut = new Group();
  for (const door of doors) {
    fitOut.add(door.group);
    if (door.board) fitOut.add(door.board);
  }
  context.root.add(fitOut);

  /**
   * Walking up to a week's door, and walking away from it.
   *
   * All of it is one crossing, because all of it is one question: which door is
   * the figure at. The camera comes in, the leaf is painted as the one being
   * stood at, the engine is told so that an Enter with nothing focused reaches
   * this door, and the window is given leave to decode. Two of those used to be
   * somebody else's — `corridor-windows.ts` was going to poll `facingWhich` four
   * times a second the way the machine room's wall of five screens does — and
   * the corridor is not that shape: there is no second screen within reach to be
   * facing instead, so a poll would be a second answer to a question this
   * already answers, one frame out of step.
   */
  function arrive(door: StageDoor, near: boolean): void {
    door.setNear(near);
    presses.get(door.stage.id)?.near(near);
    if (near) {
      atStage = door.stage.id;
      const focus = focusOf.get(door.stage.id);
      void context.focus({
        target: door.windowCentre.clone(),
        // The engine's number, not the seed: it is the radius that delivers the
        // window's pixel floor at the canvas the reader actually has.
        radius: focus?.radius ?? Math.max(WINDOW_WIDE, WINDOW.tall) / 2,
        normal: door.normal.clone(),
      });
      // Nothing plays itself under the preference. `engine/index.ts` returns
      // before it starts a door's clip for the same reader, and this is that
      // rule at this end rather than a second opinion about it.
      windows?.setLive(context.reducedMotion ? null : door.stage.id);
      return;
    }
    // Only the door that took it puts it back. Leaving one door can fire after
    // arriving at the next — the crossings are reported per hotspot, in
    // registration order, not in the order they happened — and an unguarded
    // release there would tear down the framing the next door has just asked
    // for.
    if (atStage !== door.stage.id) return;
    atStage = null;
    context.unfocus();
    windows?.setLive(null);
  }

  // The doors, handed to the engine.
  //
  // This is what makes pressing a week door the same act as pressing a door in
  // the ring: the walk to the standing mark, the leaf, the page asked for with
  // `rel="prefetch" as="document"` at the moment of the press rather than when
  // the figure arrives, and Escape stopping the figure where it stands with the
  // leaf closed and nothing navigated. None of it is reimplemented here.
  for (const door of doors) {
    const interactive = openPage.get(door.stage.id);
    const hotspot = shell.hotspots.get(interactive?.id ?? "");
    const focus = focusOf.get(door.stage.id);
    if (!interactive?.href || !hotspot || !focus) continue;
    const entry: RoomDoor = {
      hotspot,
      name: `week ${door.stage.week}`,
      standing: door.standing,
      href: interactive.href,
      windowMetres: { wide: WINDOW_WIDE, tall: WINDOW.tall },
      // The same object the hotspot's spec is holding. `RoomFixture.focus` says
      // why it is not a copy.
      focus,
      setOpen: (open, instant) => door.setOpen(open, instant),
      ...(door.board ? { board: door.board } : {}),
    };
    presses.set(door.stage.id, context.door(entry));
  }

  // The figure comes in at the near end, in the middle of the corridor, looking
  // down it — outside every door's reach, so nothing is framed until the reader
  // walks to something. The engine's own entry point is outside this room.
  context.player.placeAt(new Vector3(0, 0, CORRIDOR.depth / 2 - 2.1), new Vector3(0, 0, -1));

  // --------------------------------------------------------------- L1 / L2 --
  // The windows. `dress()` is called straight after L0 rather than off the
  // engine's `ready`, because this room is only ever entered by pressing the
  // Lectures door — seconds after the first frame has been presented and
  // measured. Nothing in here competes with the number the budget is written
  // against.
  windows = createStageWindows(
    doors.map(
      (door): StageOpening => ({
        stage: door.stage,
        metres: { wide: WINDOW_WIDE, tall: WINDOW.tall },
        fill: (texture) => door.fill(texture),
      }),
    ),
    { layers: context.layers, painter: shell.painter },
  );
  void windows.dress().catch((error) => console.warn("backlot: a stage window did not land", error));

  const stopFrame = context.onFrame((delta) => {
    for (const door of doors) door.swing(delta);
  });

  context.onDispose(() => {
    stopFrame();
    // The camera belongs to the engine and the hub is about to want it back.
    context.unfocus();
    windows?.dispose();
    windows = null;
    signs.dispose();
  });

  await Promise.resolve();
}
