// The figure: a person, built to survive being looked at from 52 degrees up.
//
// --- two things to know before measuring anything in this scene --------------
//
// Both were paid for here, both produced plausible numbers, and both will be
// repeated by whoever measures the figure next.
//
//   **A single snapshot of a drifting scene is not a measurement.** The idle
//   camera yaws +-1.4 degrees and the fill light breathes +-12%, and in a room
//   the wall's clip is playing as well. The same 40x40 cell on this figure's
//   head, sampled twelve times over thirteen seconds, swung 117.8 to 144.9 and
//   its rank among 1104 cells swung 8 to 2. The number that got reported was the
//   first sample. Measure with `prefers-reduced-motion: reduce` and say so — it
//   pins all three and the reading repeats to the decimal — or take a range.
//
//   **Segmenting a thing by brightness discards the pixels that make it
//   bright.** "The head's own pixels" was found by matching the token's hue
//   within 0.78..1.06 of its level, which throws away everything the room's
//   practicals lifted above the token, and reported 125.7 for a cell that reads
//   145.3. Segment by *moving* the figure a step and diffing: it cannot select
//   for value. Two frames taken with nothing pressed differ by zero counts
//   under reduced motion, so the diff has no floor to clear.
//
// --- why it is shaped the way it is ------------------------------------------
//
// **The height is 1.75 m in world space and stays there.** A room in this
// project is built in real millimetres — 2.6 m doors, a 740 mm desk, a
// 230 x 480 x 470 tower — and a figure scaled up to read better would falsify
// every one of them. Readability is bought with the silhouette instead.
//
// The god view takes cos(52 deg) = 0.616 of every height and none of any width,
// so whatever the figure is in the world it is squatter than that on screen.
// The old capsule was 1.75 over 0.44 — 3.98 : 1 in the world, 2.45 : 1 on
// screen — and 2.45 : 1 with a sphere on top is a bollard. The shape below is
// 1.75 over 0.39 across the shoulders, which is 4.49 : 1 in the world and
// 2.77 : 1 on screen, and more importantly it is not one solid of revolution:
// everything that makes it read as a person is a width, and widths survive.
//
//   - the trunk is **wider than it is deep** (0.30 x 0.186). A cylinder is a
//     circle from above whichever way it is turned; a flattened one is an
//     ellipse, and an ellipse has a long axis you can see turn.
//   - it **tapers from the shoulders to the hips** (0.30 to 0.24), which is the
//     one proportion that separates a person from a post.
//   - **two thin capsule arms** flank the trunk and are what carry the shoulder
//     line out to 0.39. They break the outline into three parts at its widest
//     point, and they have to be *outside* the trunk to do it — the first build
//     had them inside it and the figure read as a barrel.
//   - **the head is a hat, not a sphere.** A sphere from above is a disc with a
//     specular top and reads as a ball bearing; a low crown with a brim is a
//     flat ellipse with a rim round it, which is what a person's head actually
//     looks like from a ceiling. It is also the only part in a second colour.
//   - **a collar of `--at-accent` lying flat across the front of the
//     shoulders** says which way it is facing. Horizontal, so the camera takes
//     none of its length — the blade of a nose this replaces was vertical and
//     lost 38% of itself before it started — and on top of the shoulders, which
//     is the one surface a god view can always see. It wraps 170 degrees of the
//     front and nothing of the back.
//
// It is the reader's position in the world and nothing else — it carries no
// state about doors, rooms or pages. Walking is the only thing it knows how to
// do, and under reduced motion it does not even do that: `walkTo` puts the
// figure at the target and resolves, because the state change still has to
// happen, it just arrives instantly.
import {
  BufferAttribute,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type MeshLambertMaterial,
} from "three";
import type { PlayerApi } from "./types";
import type { Palette } from "./scene";

/** Metres a second. Tuned against the ring's 8 m radius: the middle to a door
 *  in a bit under two seconds, which is a walk and not a teleport. */
const SPEED = 4.6;
/** How close counts as there. Smaller than any hotspot radius. */
const ARRIVED = 0.18;
/** Radians a second the figure turns to meet its heading. */
const TURN_RATE = 9;

// --- the silhouette, in metres ----------------------------------------------
// Every one of these is a real measurement off a standing adult, and the height
// they add up to is 1.75 exactly. The ratio that matters to the eye is the
// first one: shoulders to hips.
const HEIGHT = 1.75;
/**
 * The torso, and then the shoulder line the brief actually specifies.
 *
 * 0.36-0.40 m across the shoulders is the silhouette, and on a person the
 * outside of that silhouette is the arms, not the chest. So the trunk is 0.30
 * and the arms hang outside it: 0.152 + 0.043 = 0.195 either side, 0.39 across.
 *
 * The first build had the trunk at 0.38 with the arms at 0.152 — **inside** the
 * trunk's own half-width of 0.19, and behind it in depth as well, so the arms
 * were geometry that never appeared in the outline at all and the figure read
 * as a barrel. Seen at 5x in `b1-zoom.png` before this was changed.
 */
const TRUNK_WIDE = 0.3;
/** Front to back, as a fraction of across. A shoulder is not square, and this
 *  is the whole reason the figure has a direction when it is seen from directly
 *  above: a cylinder is a circle from any angle, a flattened one is an ellipse
 *  with a long axis you can watch turn. */
const DEPTH_RATIO = 0.62;
const HIP_WIDE = 0.24;
const SHOULDER_Y = 1.45;
const HIP_Y = 0.94;
/** Radius of an arm, and how far out from the middle it hangs. */
const ARM_RADIUS = 0.043;
const ARM_X = 0.152;
/** The top of the arm, a little below the shoulder seam. */
const ARM_TOP = 1.4;
const ARM_LENGTH = 0.44;
const LEG_RADIUS = 0.068;
const LEG_X = 0.078;
/** Neck, crown and brim.
 *
 *  The head has to be **smaller than the shoulders and separated from them**,
 *  or from above it is one mass and the figure has no neck. The first build put
 *  a 0.27 m brim straight on a 0.38 m shoulder, which is a head 71% as wide as
 *  the body sitting directly on it; this is 0.26 against 0.39, with 0.10 m of
 *  neck showing between them.
 *
 *  The brim is the part that does the work. A vertical feature loses 38% of
 *  itself to this camera and a horizontal one loses none, so the thing that
 *  says "head" from a ceiling is the disc round it, not the dome on top. */
const NECK_RADIUS = 0.05;
const NECK_BOTTOM = 1.42;
const HEAD_WIDE = 0.19;
const HEAD_BOTTOM = 1.55;
const BRIM_RADIUS = 0.13;
const BRIM_Y = 1.59;
/** The collar: a yoke lying **flat** across the front of the shoulders, from
 *  the neck out to the edge of the trunk, wrapping 170 degrees of the front and
 *  nothing of the back. Flat because this camera takes none of a horizontal
 *  length and 38% of a vertical one, and because a mark on the top of the
 *  shoulders is the one place on a figure that a god view can always see. */
const COLLAR_INNER = 0.075;
const COLLAR_OUTER = 0.15;
const COLLAR_Y = 1.458;
const COLLAR_ARC = 170;
/** How far the contact patch reaches, and how dark it is directly under the
 *  feet. Kept inside the accent ring's 0.36 inner radius at the rim so the two
 *  marks do not fight. */
const SHADOW_RADIUS = 0.4;
const SHADOW_ALPHA = 0.5;
/** How fast the patch gives up. Above 1 it holds a dark core and lets go at the
 *  edge, which is what stops it reading as a disc somebody laid on the floor. */
const SHADOW_FALLOFF = 1.7;

/**
 * How far the clothes are held under `--at-tertiary`, everywhere.
 *
 * This is not the room exposure, which multiplies it; it is the figure's own
 * resting albedo, and it exists because the brightness line is written against
 * the machine room's **tower** — a 40x40 cell on the tower reads 68.6 mean luma
 * in the dark theme — and the tower is the darkest named thing in the room. The
 * number is measured, not chosen; the run is in receipts/rig-3d/b1-figure.md.
 */
const CLOTHES_LEVEL = 0.72;

export interface Figure extends PlayerApi {
  /** Add this to the scene. */
  group: Group;
  /** Ground direction the controls are asking for; zero length means stop. */
  drive(direction: Vector3): void;
  /** Nothing walks off the edge of the floor. A disc, for the hub's ring. */
  setBounds(radius: number): void;
  /** And a box, for a room: a disc inscribed in a rectangular room cannot reach
   *  its corners, and the pieces on a wall are exactly where the corners are. */
  setWalkableBox(min: Vector3, max: Vector3): void;
  update(delta: number, elapsed: number): void;
  /** True while a walk or a drive is moving it. */
  readonly moving: boolean;
  /**
   * Hold the figure's lit surfaces under their own tokens, by a factor.
   *
   * The figure is the engine's and is the same object in both places, but the
   * two places are not lit the same: the hub has the stage's three lights and a
   * room adds practicals on top of them. An albedo that reads correctly under
   * the first is over-lit under the second — measured, and the whole of the
   * failure this exists to fix: a 40x40 cell on the head reads 50.5 in the hub
   * and 145.3 in the machine room, off the same material.
   *
   * The factor multiplies each surface's **own** base level rather than
   * replacing it, so the clothes stay under the hat by the same ratio wherever
   * the figure is standing.
   *
   * Only the lit surfaces move. The contact patch and the accent ring are
   * unlit and do not: they are the mark that says which thing on the floor is
   * you, and dimming the figure must not dim the one part of it that is there
   * to be found.
   */
  setExposure(level: number): void;
  dispose(): void;
}

export interface FigureOptions {
  palette: Palette;
  /** Where a hotspot id is, so `facingWhich` can answer without knowing about hotspots. */
  locate(id: string): Vector3 | null;
  reducedMotion(): boolean;
}

export function createFigure(options: FigureOptions): Figure {
  const { palette, locate, reducedMotion } = options;

  const group = new Group();
  // Everything that stands up, so the walk's rise and fall is one transform on
  // one object rather than eight of them kept in step by hand.
  const standing = new Group();

  // --- the two colours ------------------------------------------------------
  //
  // **Clothes: `--at-tertiary`.** It is rgb(107,97,84) in *both* themes, which
  // is the property that matters more than the value. Half this palette is a
  // `light-dark()` pair — `--at-text` is 238.2 in the dark theme and 21.6 in
  // the light one — and a figure painted in one of those is a black person-shape
  // in one theme and a white one in the other, off the same line of code. The
  // brand ramp (accent 130.8, primary-active 111.8, tertiary 98.2) and
  // `--at-on-accent` (13.0) are the four that hold still across the flip, and
  // tertiary is the darkest of them that is still a colour rather than an ink.
  //
  // **Hat and hair: `--at-on-accent`.** rgb(13,13,13), also stable across the
  // flip, and it is the palette's own answer to "a dark thing that has to stay
  // dark on a gold fill". A lit surface in it lands near 12, against clothes
  // near 50 in the machine room: the head is separated from the shoulders by a
  // factor of four, in the direction that costs brightness rather than spends
  // it. It reads as black hair under a cap, which is what it is.
  //
  // The old head was `--at-text` — the page's *ink* — on a sphere, which put
  // the palette's brightest value on the roundest thing in the scene and made
  // the figure the brightest object in a room that is about its screens.
  const clothes = palette.lit("--at-tertiary");
  const hat = palette.lit("--at-on-accent");
  const collarMaterial = palette.lit("--at-accent");

  /** Each lit surface's own level, before any room exposure. The clothes are
   *  held under their token because the brightness line is written against the
   *  machine room's tower, not against the hub's floor, and the tower is dark. */
  const base: [MeshLambertMaterial, number][] = [
    [clothes, CLOTHES_LEVEL],
    [hat, 1],
    [collarMaterial, CLOTHES_LEVEL],
  ];
  // The base levels are the figure's resting exposure, so apply them now rather
  // than waiting for the first `setExposure` — the hub never calls it on the
  // way in, and a figure that is only held down once it has been somewhere is a
  // figure that is wrong on first paint.
  for (const [material, own] of base) palette.setLevel(material, own);

  const parts: Mesh[] = [];
  const add = (geometry: BufferGeometry, material: Material, at?: [number, number, number]): Mesh => {
    const mesh = new Mesh(geometry, material);
    if (at) mesh.position.set(at[0], at[1], at[2]);
    parts.push(mesh);
    standing.add(mesh);
    return mesh;
  };

  /** Squash a solid of revolution front-to-back. Done on the geometry rather
   *  than with `mesh.scale` so the normals are baked once and the lighting does
   *  not have to be told about a non-uniform scale every frame. */
  const flatten = (geometry: BufferGeometry, ratio = DEPTH_RATIO): BufferGeometry => {
    geometry.scale(1, 1, ratio);
    return geometry;
  };

  // Torso: shoulders down to hips, wider than deep, tapering. `12` radial
  // segments is enough that the silhouette has no flat on it at the size the
  // machine room shows the figure at, and few enough that it is still a handful
  // of triangles.
  add(
    flatten(new CylinderGeometry(TRUNK_WIDE / 2, HIP_WIDE / 2, SHOULDER_Y - HIP_Y, 12, 1)),
    clothes,
    [0, (SHOULDER_Y + HIP_Y) / 2, 0],
  );
  // Neck. Long enough that the hat is not sitting on the shoulders, which is
  // the difference between a person and a bollard with a lid.
  add(flatten(new CylinderGeometry(NECK_RADIUS, NECK_RADIUS + 0.008, HEAD_BOTTOM - NECK_BOTTOM, 8, 1), 0.9), clothes, [
    0,
    (HEAD_BOTTOM + NECK_BOTTOM) / 2,
    0,
  ]);
  // Two legs rather than one column. At 52 degrees most of them is behind the
  // torso, but the gap between them at the floor is the last thing in the
  // outline and it is what keeps the bottom of the figure from reading as a
  // plinth.
  for (const side of [-1, 1]) {
    add(new CapsuleGeometry(LEG_RADIUS, HIP_Y - LEG_RADIUS * 2, 3, 8), clothes, [
      side * LEG_X,
      HIP_Y / 2,
      0,
    ]);
  }
  // Arms.
  for (const side of [-1, 1]) {
    add(new CapsuleGeometry(ARM_RADIUS, ARM_LENGTH, 3, 8), clothes, [
      side * ARM_X,
      ARM_TOP - ARM_RADIUS - ARM_LENGTH / 2,
      0,
    ]);
  }

  // Crown and brim. `CylinderGeometry` with a slightly smaller top is a crown
  // with a flat top, which is what a cap is; the brim is a disc 37% wider than
  // the crown, and from above it is what says head.
  add(
    flatten(new CylinderGeometry(HEAD_WIDE / 2 - 0.008, HEAD_WIDE / 2, HEIGHT - HEAD_BOTTOM, 10, 1), 0.92),
    hat,
    [0, (HEIGHT + HEAD_BOTTOM) / 2, 0],
  );
  add(flatten(new CylinderGeometry(BRIM_RADIUS, BRIM_RADIUS, 0.014, 14, 1), 0.95), hat, [0, BRIM_Y, 0]);

  // The collar, and the whole of the figure's heading.
  //
  // A `RingGeometry` lies in its own XY plane with theta measured anticlockwise
  // from +X; `rotation.x = -PI/2` maps that plane onto the floor and sends the
  // ring's +Y to world **-Z**, so the arc that ends up over the figure's front
  // is the one centred on theta = -90 degrees. Squash the ring's *local Y*
  // before that rotation, not its Z, because local Y is what becomes depth.
  //
  // Both of those are one-line mistakes that render something plausible: the
  // first build used a standing open cylinder round the neck, and the hat brim
  // covered every pixel of it. Nothing in the source said so.
  //
  // A fill and not ink — a band on a garment, never a letter and never a stroke
  // on a control — so the gold is allowed to be the gold here (CLAUDE.md §7).
  const collarGeometry = new RingGeometry(
    COLLAR_INNER,
    COLLAR_OUTER,
    24,
    1,
    MathUtils.degToRad(-90 - COLLAR_ARC / 2),
    MathUtils.degToRad(COLLAR_ARC),
  );
  collarGeometry.scale(1, DEPTH_RATIO, 1);
  const collar = add(collarGeometry, collarMaterial, [0, COLLAR_Y, 0]);
  collar.rotation.x = -Math.PI / 2;

  // --- the two marks on the floor -------------------------------------------

  // A contact shadow, and it is painted rather than cast: there are no shadow
  // maps in this scene and there is no plan for any.
  //
  // What makes it read as contact rather than as a decal is the falloff. It is
  // `--at-black` at 50% directly under the feet going to nothing at 0.40 m, as
  // a per-vertex alpha ramp across four rings of a `RingGeometry` — so it has a
  // dark core, no edge of its own anywhere, and it darkens whatever is under it
  // instead of being a colour. A disc with a rim is a sticker; a gradient with
  // no rim is the floor being occluded.
  //
  // Black rather than a surface token, and that part is measured. What used to
  // be here was a flat `--at-divider` disc — the ink at 12% over the page's
  // background — and on the machine room's floor it came out **brighter than
  // the floor in both themes**: 33.4 against a floor of 27.6 in the dark one
  // and 225.1 against 129.2 in the light one. A patch 96 counts brighter than
  // what it sits on is not a shadow, it is a puddle. A black wash with an alpha
  // ramp takes the same *proportion* out of whatever is under it, which is what
  // a shadow does: 27.6 -> 17.9 dark, 129.2 -> 80.7 light, 35% and 38%, back to
  // the floor's own value by 0.30 m.
  //
  // It is honest about what it costs: on the **hub**'s floor in the dark theme
  // the floor is already 10.3 and there is next to nothing for a shadow to take
  // away. That is where the accent ring below does the work instead.
  const shadowGeometry = new RingGeometry(0.0001, SHADOW_RADIUS, 28, 4);
  const vertices = shadowGeometry.getAttribute("position");
  const tint = new Float32Array(vertices.count * 4);
  for (let index = 0; index < vertices.count; index += 1) {
    const radius = Math.hypot(vertices.getX(index), vertices.getY(index)) / SHADOW_RADIUS;
    tint[index * 4] = 1;
    tint[index * 4 + 1] = 1;
    tint[index * 4 + 2] = 1;
    tint[index * 4 + 3] = Math.pow(Math.max(0, 1 - radius), SHADOW_FALLOFF);
  }
  shadowGeometry.setAttribute("color", new BufferAttribute(tint, 4));
  const shadowMaterial = palette.flat("--at-black", { opacity: SHADOW_ALPHA });
  shadowMaterial.vertexColors = true;
  // Nothing should be sorted behind it or occluded by it: it is a wash on the
  // floor, and the accent ring sits 2 mm above it.
  shadowMaterial.depthWrite = false;
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.renderOrder = -1;

  // And a ring round it, in the brand fill: the mark that says which of the
  // things on the floor is you. Unchanged, and it is what the figure's
  // brightness is spent on instead of its head. Unlit, so it is the same mark
  // wherever the figure walks out of the key light.
  const mark = new Mesh(new RingGeometry(0.36, 0.45, 28), palette.flat("--at-accent"));
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.014;

  group.add(standing, shadow, mark);

  const position3 = new Vector3();
  const facing = new Vector3(0, 0, 1);
  const heading = new Vector3(0, 0, 1);
  const driving = new Vector3();
  const step = new Vector3();

  /** Either a disc about the origin or a box, never both. */
  let bounds: { kind: "disc"; radius: number } | { kind: "box"; min: Vector3; max: Vector3 } = {
    kind: "disc",
    radius: Infinity,
  };

  function hold(at: Vector3): void {
    if (bounds.kind === "disc") {
      if (at.length() > bounds.radius) at.setLength(bounds.radius);
      return;
    }
    at.x = Math.min(Math.max(at.x, bounds.min.x), bounds.max.x);
    at.z = Math.min(Math.max(at.z, bounds.min.z), bounds.max.z);
  }
  let moving = false;
  let goal: { target: Vector3; settle: () => void } | null = null;

  const clearGoal = () => {
    const pending = goal;
    goal = null;
    pending?.settle();
  };

  const face = (direction: Vector3, instant: boolean) => {
    if (direction.lengthSq() < 1e-8) return;
    heading.copy(direction).setY(0).normalize();
    if (instant) facing.copy(heading);
  };

  function place(target: Vector3, direction?: Vector3): void {
    clearGoal();
    position3.copy(target).setY(0);
    hold(position3);
    if (direction) face(direction, true);
    group.position.copy(position3);
    group.rotation.y = Math.atan2(facing.x, facing.z);
    moving = false;
  }

  return {
    group,
    position: position3,
    facing,
    get moving() {
      return moving;
    },
    placeAt(target, direction) {
      place(target, direction);
    },
    walkTo(target) {
      if (reducedMotion()) {
        // The arrival still happens; it just does not take two seconds. The
        // facing is set from where the figure was, so it ends up looking at
        // what it walked towards rather than keeping its old heading.
        const direction = step.copy(target).setY(0).sub(position3);
        place(target, direction.lengthSq() > 1e-6 ? direction : undefined);
        return Promise.resolve();
      }
      return new Promise<void>((settle) => {
        clearGoal();
        goal = { target: target.clone().setY(0), settle };
      });
    },
    facingWhich(ids) {
      let best: string | null = null;
      let bestDot = 0.45; // Roughly a 63° cone: squarely facing, not vaguely towards.
      for (const id of ids) {
        const where = locate(id);
        if (!where) continue;
        step.copy(where).setY(0).sub(position3);
        if (step.lengthSq() < 1e-6) continue;
        const dot = step.normalize().dot(facing);
        if (dot > bestDot) {
          bestDot = dot;
          best = id;
        }
      }
      return best;
    },
    drive(direction) {
      driving.copy(direction).setY(0);
      if (driving.lengthSq() > 1e-6) clearGoal();
    },
    setExposure(level) {
      for (const [material, own] of base) palette.setLevel(material, own * level);
    },
    setBounds(radius) {
      bounds = { kind: "disc", radius };
      place(position3);
    },
    setWalkableBox(min, max) {
      bounds = { kind: "box", min: min.clone(), max: max.clone() };
      place(position3);
    },
    update(delta, elapsed) {
      const still = reducedMotion();
      step.set(0, 0, 0);

      if (driving.lengthSq() > 1e-6) {
        step.copy(driving).clampLength(0, 1).multiplyScalar(SPEED * delta);
      } else if (goal) {
        const remaining = step.copy(goal.target).sub(position3);
        const distance = remaining.length();
        if (distance <= ARRIVED) {
          // `place` settles the pending walk on its way through clearGoal, so
          // the promise resolves exactly where the figure stops.
          place(goal.target);
          return;
        }
        step.copy(remaining).multiplyScalar(Math.min(SPEED * delta, distance) / distance);
      }

      moving = step.lengthSq() > 1e-10;
      if (moving) {
        position3.add(step);
        hold(position3);
        face(step, still);
        group.position.copy(position3);
      }

      if (!still) {
        const turn = Math.atan2(heading.x, heading.z);
        group.rotation.y = approachAngle(group.rotation.y, turn, TURN_RATE * delta);
        facing.set(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
        // The walk: a small rise and fall on everything that stands up, and on
        // neither mark on the floor — a contact shadow that bobs is a figure
        // taking off. Under reduced motion this branch never runs and the
        // figure sits at its rest height.
        standing.position.y = moving ? Math.abs(Math.sin(elapsed * 9)) * 0.05 : 0;
      } else {
        group.rotation.y = Math.atan2(facing.x, facing.z);
        standing.position.y = 0;
      }
    },
    dispose() {
      clearGoal();
      for (const mesh of [...parts, shadow, mark]) mesh.geometry.dispose();
      standing.clear();
      group.clear();
    },
  };
}

/** Turn towards an angle the short way round, so a figure asked to face back
 *  the way it came does not spin the long way through the whole circle. */
function approachAngle(from: number, to: number, maxStep: number): number {
  const difference = MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  if (Math.abs(difference) <= maxStep) return to;
  return from + Math.sign(difference) * maxStep;
}
