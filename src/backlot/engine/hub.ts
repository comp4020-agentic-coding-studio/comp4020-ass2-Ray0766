// The hub: a circular floor, six doors stood in a ring, and nothing else.
//
// All of it procedural — there is no model in the hub and there is not going to
// be one. Six doors and a cylinder cost nothing to download, which is what buys
// the first frame inside two seconds on Slow 4G, and a god view of a diagram is
// the shape this place actually wants.
//
// The ring's arithmetic, decided here and stated once:
//
//   Door 0 stands at twelve o'clock — dead centre at the top of the frame, the
//   far side of the ring from the reader — and the rest follow clockwise as the
//   default camera sees them. `door.order` is nav order, so the ring reads the
//   way the bar at the top of every page reads: left to right becomes round to
//   the right, starting from the top. Anticlockwise would have put Dailies
//   where a reader looking at a clock expects Policies, and starting at three
//   o'clock would have left nothing at the top of the frame to start from.
//
// In world terms that is `(R·sin θ, 0, −R·cos θ)` with θ = order × 60°: θ = 0
// is −Z, which is straight up the screen under the god camera, and increasing θ
// swings towards +X, which is the reader's right.
//
// --- how big, and why -------------------------------------------------------
//
// The camera is orthographic, so world units are arbitrary and only *ratios*
// decide what anything measures on screen. Three of them do all the work:
//
//   the floor's radius against the ring's   how much empty floor is in shot
//   the doors' height against the ring's    how much of the frame the doors eat
//   the tilt, fixed at 52 degrees           0.788 of a depth, 0.616 of a height
//
// The ring used to reach 45.6% of the viewport's height at 1920x1080 (632x492
// px, measured off the pixels that exactly match the path ring's own token)
// inside a floor disc that reached 68.0%. Most of the difference was floor
// nobody walks on: 3.6 m of it outside the ring on every side.
//
// So the doors moved out to the rim rather than the floor shrinking — the world
// keeps roughly the size it had, which keeps the walk times and the reach
// radii meaning what they meant. With the camera's cylinder fit no longer
// symmetric about a floor-level pivot (see camera.ts), the arithmetic is
//
//   halfHeight = MARGIN x (0.616 x frameHeight + 2 x 0.788 x FLOOR_RADIUS) / 2
//   ring on screen = 2 x 0.788 x RING_RADIUS x canvasHeight / (2 x halfHeight)
//
// which at a 923 px canvas puts the ring at 756 px, or 70.0% of a 1080 px
// viewport. Measured after: 754x753 px. The floor disc comes out at 73.8%,
// bigger than it was, because the frame is no longer spending a fifth of its
// height on air under the near rim.
import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from "three";
import type { BacklotManifest, ColourReader, LayerApi } from "./types";
import type { Palette } from "./scene";
import { createSignwriter, type Signwriter } from "./signage";

// types.ts re-exports BacklotManifest, BacklotRoom and BacklotPiece but not
// BacklotDoor, so the door type is read off the manifest type rather than
// imported from the rooms module directly — the contract file stays the only
// thing the engine reads.
type BacklotDoor = BacklotManifest["doors"][number];

const FLOOR_RADIUS = 12.1;
/** Where the doors stand: out at the rim, with a walkway of floor behind them. */
const RING_RADIUS = 11.5;
const DOOR_WIDTH = 2.6;
const DOOR_HEIGHT = 3.0;
const DOOR_THICKNESS = 0.16;
const JAMB_WIDTH = 0.3;
const JAMB_DEPTH = 0.5;
/** The lintel over the leaf. Part of the frame's height, which is what the
 *  camera fits, so it is named rather than inlined. */
const LINTEL_HEIGHT = 0.4;
const FRAME_HEIGHT = DOOR_HEIGHT + LINTEL_HEIGHT;
/** A block at the foot of each jamb. A frame that meets the floor at a line has
 *  no construction in it; one that meets it at a plinth does. */
const PLINTH_HEIGHT = 0.34;
const PLINTH_SPREAD = 0.08;

/** The opening. Portrait, and both recorded stills are 9:16, so a window built
 *  to a still's real aspect and a window built to the house ratio are the same
 *  window — which is what keeps six doors reading as six of one thing. */
const WINDOW_HEIGHT = 2.45;
const WINDOW_ASPECT = 9 / 16;
/** Never wider than the leaf has stile to spare. */
const WINDOW_MAX_WIDTH = DOOR_WIDTH - 0.9;
/**
 * And a nameplate's own width, which is not the picture ratio.
 *
 * Nothing has to fill an Assessment, People or Policies window at any
 * particular proportion, because there is nothing behind it but the word —
 * which is why the manifest makes those three a separate `DoorWindow` kind
 * rather than a picture nobody has. Three picture windows at 9:16 and three
 * sign plates at 3:4 say what each door actually is, and the shape carries the
 * same distinction the manifest already draws. Still portrait, still a vertical
 * window; 0.4 m of stile each side of a 2.6 m leaf.
 */
const PLATE_WIDTH = 1.8;
/** Middle of the opening. Set rather than derived from the leaf's half height,
 *  so there is room for a rail above it as well as below. */
const WINDOW_CENTRE = 1.6;
/** The band of brand fill around the opening: the light getting past the edge
 *  of the plate, and the thing that makes a window read as lit from behind. */
const WINDOW_RIM = 0.07;
/** Rails across the leaf above and below the opening. */
const RAIL_HEIGHT = 0.16;

/** How far the figure stands off the door when it walks to one. */
const STAND_OFF = 2.0;
/** The step in front of a door. Smaller than the reach on purpose: it marks
 *  where to stand, it is not a diagram of the trigger radius. */
const THRESHOLD_RADIUS = 1.15;
/** How far into the ring the pool of light from a window reaches. */
const SPILL_DEPTH = 5.6;
const SPILL_WIDTH = DOOR_WIDTH + 2.4;
/** How far above the frame the name board floats, and how far it sits back over
 *  the lintel. Small: it reads as fixed to the head of the door, not hung. */
const SIGN_LIFT = 0.05;

/**
 * The radius the six names are painted at, inside the ring the doors stand on.
 *
 * Two things put them here rather than at the foot of the door. A name is laid
 * out to the world's axes (see below), so a long word beside an angled door
 * sprawls across the ring and runs under the leaf — at the foot of the 60°
 * door, "Assessment" reached a corner 0.2 m outside the ring. And the figure
 * stands 2 m off the door, which is exactly where the foot of the door is: a
 * reader walking up to a door would be standing on its name. At 7.2 the six of
 * them make an inner ring of words, each 4.3 m in front of its own door and
 * 3.8 m clear of its neighbours.
 */
const NAME_RADIUS = 7.2;

/** Close enough for a walk to count as arriving, and to push the door open. */
export const DOOR_REACH = 2.1;
/** How far a leaf swings. Radians. */
const OPEN_ANGLE = 1.15;
/** Radians a second the leaf swings. A door, not a trapdoor. */
const SWING_RATE = 4.4;

/** Millimetres of daylight between two planes stacked on the floor, so the
 *  spill, the name and the threshold never fight over a pixel. */
const LIFT = 0.012;

export interface HubDoor {
  door: BacklotDoor;
  /** The middle of the leaf, which is where its button is parked. */
  anchor: Vector3;
  /** Where the figure stands to use it. */
  standing: Vector3;
  /** Outwards from the centre of the ring, on the ground. */
  outward: Vector3;
  /**
   * The window itself, as an object in the scene.
   *
   * Handed out so the hotspot deck can publish where the picture or the plate
   * actually is on screen, which is the only way a check can sample a colour on
   * it: a door's button is parked *near* the door, and a strip through the
   * button's centre crosses two of them. It is one of the two panes rather than
   * both, and they are coplanar to within 12 mm, so either projects to the same
   * rectangle. It hangs off the pivot, so the rect follows the leaf as it opens.
   */
  pane: Object3D;
}

export interface Hub {
  group: Group;
  doors: HubDoor[];
  find(id: string): HubDoor | undefined;
  /** Swing a leaf. Under reduced motion it is simply open, with no swing. */
  setOpen(id: string, open: boolean, instant: boolean): void;
  /** Paint a leaf as the one the figure is at. */
  setNear(id: string, near: boolean): void;
  update(delta: number): void;
  /**
   * Fill every door's window from its manifest entry. Layer 1: it is called
   * after the first frame has been presented, and every branch of it may come
   * back empty — a still that never lands, a graph the build never inlined, a
   * browser with no 2D context — in which case the window keeps the flat fill
   * it was built with. Resolves with what each door actually got, which is what
   * the receipt's numbers are taken from.
   */
  dress(): Promise<{ id: string; kind: string; filled: boolean; capPixels: number }[]>;
  /** What the camera has to keep in shot: a floor of `radius`, with things
   *  `height` tall standing no further out than `standRadius`. */
  readonly bounds: { centre: Vector3; radius: number; height: number; standRadius: number };
  /** Nothing walks off the floor. */
  readonly walkableRadius: number;
  /** The middle of the ring: where Esc puts the figure back. */
  readonly middle: Vector3;
  dispose(): void;
}

export interface HubOptions {
  colours: ColourReader;
  /** Layer 1, for the two doors whose window is a recorded file. */
  layers: LayerApi;
}

export function createHub(doors: BacklotDoor[], palette: Palette, options: HubOptions): Hub {
  const { colours, layers } = options;
  const signs: Signwriter = createSignwriter(colours);
  const group = new Group();

  const floor = new Mesh(new CircleGeometry(FLOOR_RADIUS, 96), palette.lit("--at-bg-alt"));
  floor.rotation.x = -Math.PI / 2;

  const rim = new Mesh(new RingGeometry(FLOOR_RADIUS - 0.16, FLOOR_RADIUS, 96), palette.flat("--at-border"));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = LIFT * 0.8;

  // The path the doors stand on, so the ring reads as a ring from above even
  // where a door is not standing.
  const path = new Mesh(new RingGeometry(RING_RADIUS - 0.07, RING_RADIUS + 0.07, 128), palette.flat("--at-divider"));
  path.rotation.x = -Math.PI / 2;
  path.position.y = LIFT;

  group.add(floor, rim, path);

  // One geometry per shape, shared across all six doors: six leaves that differ
  // only by transform have no business being six buffers.
  const leafGeometry = new BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS);
  const jambGeometry = new BoxGeometry(JAMB_WIDTH, FRAME_HEIGHT, JAMB_DEPTH);
  const plinthGeometry = new BoxGeometry(JAMB_WIDTH + PLINTH_SPREAD, PLINTH_HEIGHT, JAMB_DEPTH + PLINTH_SPREAD);
  const lintelGeometry = new BoxGeometry(DOOR_WIDTH + JAMB_WIDTH * 2, LINTEL_HEIGHT, JAMB_DEPTH);
  const railGeometry = new BoxGeometry(DOOR_WIDTH, RAIL_HEIGHT, DOOR_THICKNESS + 0.03);
  const thresholdGeometry = new CircleGeometry(THRESHOLD_RADIUS, 32);
  const spillGeometry = new PlaneGeometry(SPILL_WIDTH, SPILL_DEPTH);

  const frameMaterial = palette.lit("--at-tertiary");
  const plinthMaterial = palette.lit("--at-border");
  const restMaterial = palette.lit("--at-bg-elevated");
  const nearMaterial = palette.lit("--at-primary");
  const thresholdMaterial = palette.flat("--at-divider");
  const rimMaterial = palette.flat("--at-primary");
  /** What a window is before its own picture lands, and what it stays as if the
   *  picture never does. */
  const blankMaterial = palette.flat("--at-bg");

  // A frame in one flat fill is a rectangle; a frame with a grain in it is made
  // of something. The map carries no hue — it is white with darker streaks — so
  // it multiplies into whatever the token is in whichever theme, and a theme
  // flip needs no redraw.
  const grain = signs.grain();
  if (grain) {
    grain.wrapS = grain.wrapT = RepeatWrapping;
    grain.repeat.set(1, 6);
    frameMaterial.map = grain;
    frameMaterial.needsUpdate = true;
    plinthMaterial.map = grain;
    plinthMaterial.needsUpdate = true;
  }

  const spillAlpha = signs.spill();
  const spillMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.62 });
  spillMaterial.color.setHex(colours.hex("--at-primary"));
  if (spillAlpha) spillMaterial.alphaMap = spillAlpha;
  const unwatchSpill = colours.onThemeChange(() => spillMaterial.color.setHex(colours.hex("--at-primary")));

  interface Built extends HubDoor {
    pivot: Group;
    leaf: Mesh;
    target: number;
    /** The two faces of the window: a door is seen from the front on the far
     *  side of the ring and from the back on the near side, and a lit window is
     *  a window from both. */
    panes: Mesh[];
    windowMetres: { wide: number; tall: number };
    /** Made when the picture lands, so nothing is allocated for a window that
     *  never gets one. */
    lit: MeshBasicMaterial | null;
  }

  const built: Built[] = [];
  /** Everything made once per door, so nothing is left on the GPU on teardown. */
  const perDoor: BufferGeometry[] = [];

  for (const door of [...doors].sort((first, second) => first.order - second.order)) {
    const angle = (door.order / doors.length) * Math.PI * 2;
    const outward = new Vector3(Math.sin(angle), 0, -Math.cos(angle));

    const stand = new Group();
    stand.position.copy(outward).multiplyScalar(RING_RADIUS);
    // The door's own +Z points back at the middle of the ring, so a reader
    // walking out from the centre meets its face.
    stand.rotation.y = Math.atan2(-outward.x, -outward.z);

    for (const side of [-1, 1]) {
      const jamb = new Mesh(jambGeometry, frameMaterial);
      jamb.position.set((side * (DOOR_WIDTH + JAMB_WIDTH)) / 2, FRAME_HEIGHT / 2, 0);
      const plinth = new Mesh(plinthGeometry, plinthMaterial);
      plinth.position.set((side * (DOOR_WIDTH + JAMB_WIDTH)) / 2, PLINTH_HEIGHT / 2, 0);
      stand.add(jamb, plinth);
    }
    const lintel = new Mesh(lintelGeometry, frameMaterial);
    lintel.position.set(0, FRAME_HEIGHT - LINTEL_HEIGHT / 2, 0);
    stand.add(lintel);

    // Hinged on the left as the door is approached, so the leaf swings into the
    // ring and out of the reader's line rather than across it.
    const pivot = new Group();
    pivot.position.set(-DOOR_WIDTH / 2, 0, 0);
    const leaf = new Mesh(leafGeometry, restMaterial);
    leaf.position.set(DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0);
    pivot.add(leaf);

    // The opening, at the aspect of whatever is behind it. Both recorded stills
    // are 9:16 and so is the house ratio, so in practice every door's window is
    // the same window — but a still with some other shape gets its own shape
    // rather than being cropped to this one, which is what "at its real aspect"
    // has to mean in geometry and not only in the loader.
    // A picture's window is the picture's own shape; a plate's window is a
    // plate's shape. A still that is not 9:16 keeps its own ratio rather than
    // being cropped to the house one, which is what "at its real aspect" has to
    // mean in geometry and not only in the loader.
    const aspect =
      door.window.kind === "still" ? door.window.aspect[0] / door.window.aspect[1] : WINDOW_ASPECT;
    const plate = door.window.kind === "nameplate";
    const wide = plate ? PLATE_WIDTH : Math.min(WINDOW_HEIGHT * aspect, WINDOW_MAX_WIDTH);
    const tall = plate ? WINDOW_HEIGHT : wide / aspect;
    const windowGeometry = new PlaneGeometry(wide, tall);
    const rimGeometry = new PlaneGeometry(wide + WINDOW_RIM * 2, tall + WINDOW_RIM * 2);
    perDoor.push(windowGeometry, rimGeometry);
    const middleY = WINDOW_CENTRE;

    const panes: Mesh[] = [];
    for (const side of [1, -1]) {
      const band = new Mesh(rimGeometry, rimMaterial);
      band.position.set(DOOR_WIDTH / 2, middleY, side * (DOOR_THICKNESS / 2 + 0.002));
      const pane = new Mesh(windowGeometry, blankMaterial);
      pane.position.set(DOOR_WIDTH / 2, middleY, side * (DOOR_THICKNESS / 2 + 0.006));
      if (side === -1) {
        band.rotation.y = Math.PI;
        // Turned rather than mirrored: the same material reads left to right
        // from the back of the leaf as it does from the front, which matters
        // because three of the six doors are only ever seen from behind.
        pane.rotation.y = Math.PI;
      }
      pivot.add(band, pane);
      panes.push(pane);
    }

    // A rail above the opening and one below it: the two members that make a
    // leaf read as a made thing rather than as a slab with a hole in it.
    // Placed at the middle of the stile each side of the window, so they are
    // inside the leaf by construction and there is no "does it fit" branch to
    // leave unwatched (CLAUDE.md §7).
    for (const y of [(middleY + tall / 2 + DOOR_HEIGHT) / 2, (middleY - tall / 2) / 2]) {
      const rail = new Mesh(railGeometry, frameMaterial);
      rail.position.set(DOOR_WIDTH / 2, y, 0);
      pivot.add(rail);
    }

    // Light on the floor. Not a shadow map and not a light: a painted pool,
    // brightest at the foot of the door and gone by the time it reaches the
    // standing mark. A real point light per door would light the jambs too, and
    // was not added — scene.ts tunes three lights so an up-facing surface lands
    // at 0.94 of its own token in *both* themes, and six more of them clip the
    // light theme's floor to white, which is the failure rooms/palette.ts exists
    // to undo.
    const spill = new Mesh(spillGeometry, spillMaterial);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, LIFT * 1.5, SPILL_DEPTH / 2);
    spill.renderOrder = 1;

    const threshold = new Mesh(thresholdGeometry, thresholdMaterial);
    threshold.rotation.x = -Math.PI / 2;
    threshold.position.set(0, LIFT * 1.2, STAND_OFF);

    stand.add(pivot, spill, threshold);
    group.add(stand);

    // The door's name, painted on the floor in the light from its own window.
    //
    // This is where a door's name is readable, and it is not a second guess at
    // the plate in the window: at 52 degrees a vertical face keeps 0.616 of its
    // height and — for four of the six doors — half of its width, so a word
    // across a 1.29 m opening is about 3 px of cap however it is set. The floor
    // keeps 0.788 and is never turned away. Laid out to the world's axes rather
    // than to the door's, so all six read left to right on screen: this is a
    // god view of a ring, and a name that is upside down at six o'clock is a
    // name nobody reads.
    // The name over the door.
    //
    // This is where a sign goes — every stage door, every corridor, every room
    // numbered by somebody who wanted it found — and it took failing at it on
    // the door's face to see that. A word on a vertical face is foreshortened to
    // cos(52) = 0.616 and then turned away by the ring: at 60 degrees of yaw the
    // letters shear about 54 degrees and their across-the-run extent halves, and
    // POLICIES does not resolve as a word at any size the opening can carry.
    // The lintel's top face is **horizontal**, so the camera keeps sin(52) =
    // 0.788 of it at *every* angle on the ring, and it is never turned away.
    // Same cap height as the floor marking and the same layout, because a god
    // view treats every horizontal surface alike.
    //
    // Laid out to the world's axes rather than to the door, so all six read left
    // to right: this is a god view of a ring, and a name that is upside down at
    // six o'clock is a name nobody reads. That floats the board free of the
    // lintel's own footprint on the four turned doors, which is the price and
    // is worth it — a board over a door that you can read beats a board aligned
    // to a door that you cannot.
    const sign = signs.lintelSign(door.label);
    if (sign) {
      const material = palette.flat("--at-white");
      material.map = sign.texture;
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
      const signGeometry = new PlaneGeometry(sign.metresWide, sign.metresTall);
      perDoor.push(signGeometry);
      const board = new Mesh(signGeometry, material);
      board.rotation.x = -Math.PI / 2;
      board.position.copy(outward).multiplyScalar(RING_RADIUS).setY(FRAME_HEIGHT + SIGN_LIFT);
      board.renderOrder = 3;
      group.add(board);
    }

    const anchor = new Vector3().copy(outward).multiplyScalar(RING_RADIUS).setY(DOOR_HEIGHT * 0.62);
    const standing = new Vector3().copy(outward).multiplyScalar(RING_RADIUS - STAND_OFF);

    built.push({
      door,
      anchor,
      standing,
      outward,
      pivot,
      leaf,
      target: 0,
      panes,
      pane: panes[0]!,
      windowMetres: { wide, tall },
      lit: null,
    });
  }

  /** Put a texture in a door's window. The material is made here rather than up
   *  front so a window that never gets a picture never allocates one. */
  function fill(entry: Built, texture: Texture): void {
    // `--at-white` so the map comes through as itself: a MeshBasicMaterial
    // multiplies its map by its colour, and any other token would tint the
    // picture. Single-sided, because the back pane is turned rather than
    // mirrored and each face only ever shows its own side.
    const material = palette.flat("--at-white");
    material.map = texture;
    material.needsUpdate = true;
    entry.lit = material;
    for (const pane of entry.panes) pane.material = material;
  }

  return {
    group,
    doors: built,
    find(id) {
      return built.find((entry) => entry.door.id === id);
    },

    async dress() {
      const report: { id: string; kind: string; filled: boolean; capPixels: number }[] = [];
      for (const entry of built) {
        const spec = entry.door.window;
        let filled = false;
        let capPixels = 0;
        if (spec.kind === "still") {
          const texture = await layers.texture(spec.file);
          if (texture) {
            fill(entry, texture);
            filled = true;
          }
        } else if (spec.kind === "graph") {
          const drawing = await signs.workflow(spec.file, entry.windowMetres);
          if (drawing) {
            fill(entry, drawing.texture);
            filled = true;
          }
        } else {
          const plate = signs.nameplate(entry.door.label, entry.windowMetres);
          if (plate) {
            fill(entry, plate.texture);
            filled = true;
            capPixels = plate.capPixels;
          }
        }
        report.push({ id: entry.door.id, kind: spec.kind, filled, capPixels });
      }
      return report;
    },

    setOpen(id, open, instant) {
      const entry = built.find((candidate) => candidate.door.id === id);
      if (!entry) return;
      entry.target = open ? -OPEN_ANGLE : 0;
      if (instant) entry.pivot.rotation.y = entry.target;
    },
    setNear(id, near) {
      const entry = built.find((candidate) => candidate.door.id === id);
      if (entry) entry.leaf.material = near ? nearMaterial : restMaterial;
    },
    update(delta) {
      const step = SWING_RATE * delta;
      for (const entry of built) {
        const difference = entry.target - entry.pivot.rotation.y;
        if (Math.abs(difference) < 1e-4) continue;
        entry.pivot.rotation.y += Math.abs(difference) <= step ? difference : Math.sign(difference) * step;
      }
    },
    bounds: {
      centre: new Vector3(0, 0, 0),
      radius: FLOOR_RADIUS,
      // The frame, plus the room the name board over it needs. The board is flat
      // and adds no height of its own, but it is laid to the world's axes, so on
      // the far door its back edge is about half a metre further out than the
      // frame — which the god view lifts by 0.788 of that and would otherwise
      // guillotine. Costs about 1% of the ring's share of the frame; measured.
      height: FRAME_HEIGHT + 0.6,
      // The outside face of a jamb, or the board's own overhang, whichever is
      // further out.
      standRadius: RING_RADIUS + Math.max(JAMB_DEPTH / 2, 0.5),
    },
    walkableRadius: FLOOR_RADIUS - 0.6,
    middle: new Vector3(0, 0, 0),
    dispose() {
      unwatchSpill();
      for (const geometry of [
        leafGeometry,
        jambGeometry,
        plinthGeometry,
        lintelGeometry,
        railGeometry,
        thresholdGeometry,
        spillGeometry,
      ]) {
        geometry.dispose();
      }
      for (const geometry of perDoor) geometry.dispose();
      perDoor.length = 0;
      spillMaterial.dispose();
      signs.dispose();
      floor.geometry.dispose();
      rim.geometry.dispose();
      path.geometry.dispose();
      group.clear();
    },
  };
}
