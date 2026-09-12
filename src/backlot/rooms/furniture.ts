// The machine room's fit-out, as geometry.
//
// Everything in here is built out of primitives at layer 0, so the room is
// walkable before a texture, a video or a model exists. Sizes are the real
// thing's sizes in metres — a desk at 740 mm, a mid-tower at 230 × 480 × 470,
// a three-slot card at 61 mm across three 20.32 mm slots, a 240 mm radiator —
// because a room built to invented proportions reads wrong from the first
// step, and the shapes cost nothing to get right.
//
// Shape is all any of it claims. No caption anywhere names a part: the site
// nowhere states what the convener's rig is, it quotes a real card only where a
// real source quoted one, and a part number invented to prop up a fictional
// desk is what CLAUDE.md §3 rules out.
import {
  BoxGeometry,
  CatmullRomCurve3,
  DoubleSide,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import type { Painter, Role } from "./palette";

/** What a builder is handed: somewhere to get colour, and somewhere to put a
 *  geometry so the room can free it again. */
export interface Kit {
  painter: Painter;
  track<T extends BufferGeometry>(geometry: T): T;
}

function slab(kit: Kit, size: [number, number, number], role: Role): Mesh {
  const geometry = kit.track(new BoxGeometry(...size));
  return new Mesh(geometry, kit.painter.lit(role));
}

function at<T extends Mesh>(mesh: T, x: number, y: number, z: number): T {
  mesh.position.set(x, y, z);
  return mesh;
}

// ----------------------------------------------------------------- the desk

export const DESK = {
  /** Where the desk stands, and which way the monitor faces (+z: back at the
   *  reader, the wall of takes beyond it). Off centre and a third of the way
   *  back, so the fit-out reads as a line across the middle of the shot rather
   *  than a clump in one corner of an empty floor. */
  centre: new Vector3(-0.85, 0, 0.1),
  top: 0.74,
  width: 1.8,
  depth: 0.8,
};

export function buildDesk(kit: Kit): Group {
  const desk = new Group();
  desk.position.copy(DESK.centre);

  const top = slab(kit, [DESK.width, 0.045, DESK.depth], "deskTop");
  desk.add(at(top, 0, DESK.top - 0.0225, 0));

  // Two end frames rather than four legs: it leaves the space under the desk
  // open, which is where the tower has to be visible from.
  const legGeometry = kit.track(new BoxGeometry(0.05, DESK.top - 0.045, 0.05));
  const legMaterial = kit.painter.lit("deskFrame");
  for (const x of [-DESK.width / 2 + 0.06, DESK.width / 2 - 0.06]) {
    for (const z of [-DESK.depth / 2 + 0.07, DESK.depth / 2 - 0.07]) {
      desk.add(at(new Mesh(legGeometry, legMaterial), x, (DESK.top - 0.045) / 2, z));
    }
    const railGeometry = kit.track(new BoxGeometry(0.04, 0.04, DESK.depth - 0.14));
    desk.add(at(new Mesh(railGeometry, legMaterial), x, 0.06, 0));
  }

  return desk;
}

// -------------------------------------------------------------- the monitor

export const MONITOR = {
  /** Diagonal of a 27" panel at 16:10, as width in metres. */
  screenWidth: 0.62,
  /** Centre of the panel, relative to the desk group. */
  centre: new Vector3(0, 1.155, -0.09),
  tilt: -0.08,
};

export interface MonitorBuild {
  group: Group;
  /** World-space centre of the panel, which is where the shell hangs the desk
   *  piece and where the practical in front of it goes. */
  screenCentre: Vector3;
  screenNormal: Vector3;
}

/**
 * The stand and the casing. The panel itself is a frame the shell builds, on
 * the mount surface the room hands in — so the monitor is sized from the
 * manifest's own aspect for the graph, the same way every wall piece is, rather
 * than from a number written twice.
 */
export function buildMonitor(kit: Kit, panelHeight: number): MonitorBuild {
  const group = new Group();
  group.position.copy(MONITOR.centre);

  // The casing leans with the panel; the stand does not, or the foot leaves the
  // desk as soon as the panel is angled.
  const back = new Group();
  back.rotation.x = MONITOR.tilt;
  group.add(back);
  const casing = slab(kit, [MONITOR.screenWidth * 0.62, panelHeight * 0.55, 0.04], "bezel");
  back.add(at(casing, 0, 0, -0.05));

  // Black, like the casing and the bezel: this is the only part of the room a
  // light ever gets within half a metre of, and a warm grey at that distance
  // clips to white the moment the camera frames the panel.
  const stem = new Mesh(
    kit.track(new CylinderGeometry(0.026, 0.032, 0.2, 12)),
    kit.painter.lit("bezel"),
  );
  group.add(at(stem, 0, -panelHeight / 2 - 0.105, -0.04));

  const foot = slab(kit, [0.24, 0.016, 0.17], "bezel");
  group.add(at(foot, 0, -panelHeight / 2 - 0.213, -0.04));

  // The desk group carries no rotation, so the panel's world centre is the two
  // offsets added.
  return {
    group,
    screenCentre: DESK.centre.clone().add(MONITOR.centre),
    screenNormal: new Vector3(0, Math.sin(-MONITOR.tilt), Math.cos(MONITOR.tilt)).normalize(),
  };
}

// ---------------------------------------------------------------- the tower

/**
 * What fraction of `caseGlow`'s own value the bar down the front is lit at.
 *
 * It is the one thing in the fit-out that could out-shine the pictures, because
 * it is self-lit geometry taking a token straight rather than a surface waiting
 * on the room's exposure. The brightest cell of the front wall is the first
 * rung's still at 139 (40 × 40 mean, 0–255, composite, 1920×1080 dark), so the
 * bar is held under that by construction and the receipt carries the reading
 * rather than the intention.
 */
const BAR_LEVEL = 0.55;

/**
 * And what fraction of `caseShell`'s the steel is.
 *
 * `caseShell` is `--at-tertiary`, which is the token `machine-room.ts` sets the
 * room's exposure against — it aims that token at 0.68 linear so the brightest
 * lit surface has headroom. The case is the only *large* face in the fit-out
 * painted with it, so at level 1 the top panel is the room's highlight by
 * arithmetic rather than by choice: measured at 147 against the front wall's
 * brightest cell at 139. A machine that out-shines the pictures is the room
 * pointing at the wrong thing, and a case is a dark object anyway.
 */
const SHELL_LEVEL = 0.5;

/**
 * The two levels under that: the mesh in the top and front panels, and the
 * painted steel inside the case.
 *
 * Both were `--at-black` to begin with, and `--at-black` is albedo zero — it
 * takes no light at all, so a vent came out as a hole punched in the top panel
 * and the shroud came out as the black the glass was showing instead of the
 * card. A dark grey that still shades reads as mesh; a dark grey under the card
 * is what the card's light lands on, which is the whole of what "light through
 * the side panel" means across the 40-odd px of glass this camera sees.
 */
const MESH_LEVEL = 0.12;
const INSIDE_LEVEL = 0.2;

/**
 * A current mid-tower: 230 wide, 480 tall, 470 deep, glass on one side. The
 * numbers are the class of machine, not a machine.
 *
 * It used to live under the desk, which is where a tower goes and where this
 * camera cannot see it: at 52° above the floor the desk top covers everything
 * under it. So it stands beside the desk — that part was right.
 *
 * What was wrong was which way it faced. Turned a quarter, the glass side was
 * square to the camera, and a 0.47 × 0.48 panel seen square is a square: the
 * thing read as a lit picture frame lying on the floor, not as a machine. This
 * camera also foreshortens every vertical by sin 52° and lays every depth back
 * by cos 52°, so a face's *depth* climbs the screen — which means the only
 * orientation that reads upright is the one a machine is actually photographed
 * in. Three quarters on: the 230 mm front panel square-ish to the camera, the
 * glass raked toward it, and the top panel — the largest face this camera sees
 * — carrying the vent that says what the box is.
 *
 * Measured off the render at 1920×1080, not off the trigonometry — the pixels
 * in a box beside it that differ from the floor, by column and by row: 83 px
 * across and 119 px tall, against 93 × 95 before. Square, then upright.
 */
export const TOWER = {
  width: 0.23,
  height: 0.48,
  depth: 0.47,
  /** Relative to the desk group. */
  centre: new Vector3(1.4, 0, 0.5),
  /**
   * Three quarters on. Positive turn puts the front panel's normal at
   * (sin, 0, cos) — toward the camera and a little to the right — and the glass
   * at −x then faces the camera and the desk, which is the side the cable run
   * comes from and the one side the chair is not standing in front of.
   */
  turn: 0.55,
  /** A PCI slot's pitch, so a three-slot card is three of them. */
  slotPitch: 0.02032,
  /** How proud of the front panel the light bar stands — clear of the 6 mm
   *  intake mesh in front of it, so the two never z-fight. */
  barRelief: 0.01,
};

export interface TowerBuild {
  group: Group;
  /** The light inside it, so the room can hold it steady or leave it alone. */
  interior: PointLight;
}

export function buildTower(kit: Kit): TowerBuild {
  const group = new Group();
  group.position.copy(TOWER.centre);
  group.rotation.y = TOWER.turn;

  const half = { x: TOWER.width / 2, y: TOWER.height / 2, z: TOWER.depth / 2 };
  // Two-sided, and that is the whole difference between a box and a case. The
  // faces used to point inward so the camera saw straight past them into the
  // guts, which is why the tower had no exterior and no edges to read a shape
  // off. Outward faces alone would seal the guts in; two-sided gives the case a
  // lit outside and leaves the far wall's inner face there to be seen through
  // the glass.
  const shellMaterial = kit.painter.lit("caseShell", { side: DoubleSide }, SHELL_LEVEL);

  // Five steel faces and one panel of glass.
  const sideGeometry = kit.track(new PlaneGeometry(TOWER.depth, TOWER.height));
  const endGeometry = kit.track(new PlaneGeometry(TOWER.width, TOWER.height));
  const capGeometry = kit.track(new PlaneGeometry(TOWER.width, TOWER.depth));

  // lookAt() for the upright faces; a fixed rotation for the two horizontal
  // ones, because lookAt straight up or straight down has no up vector left to
  // work with and lands the plane edge-on.
  const uprights: { geometry: PlaneGeometry; position: Vector3; faces: Vector3 }[] = [
    { geometry: sideGeometry, position: new Vector3(half.x, half.y, 0), faces: new Vector3(1, 0, 0) },
    { geometry: endGeometry, position: new Vector3(0, half.y, half.z), faces: new Vector3(0, 0, 1) },
    { geometry: endGeometry, position: new Vector3(0, half.y, -half.z), faces: new Vector3(0, 0, -1) },
  ];
  for (const face of uprights) {
    const mesh = new Mesh(face.geometry, shellMaterial);
    mesh.position.copy(face.position);
    mesh.lookAt(face.position.clone().add(face.faces));
    group.add(mesh);
  }
  for (const cap of [
    { y: 0.002, turn: Math.PI / 2 },
    { y: TOWER.height, turn: -Math.PI / 2 },
  ]) {
    const mesh = new Mesh(capGeometry, shellMaterial);
    mesh.rotation.x = cap.turn;
    group.add(at(mesh, 0, cap.y, 0));
  }

  // The vent in the top panel, where the radiator under it exhausts. The top is
  // 0.23 × 0.47 and this camera lays it back rather than hiding it, so at
  // 1920×1080 it is the biggest single face of the case on screen — 73 × 55 px.
  // A dark mesh across the middle of it is the cheapest thing that makes a box
  // read as a machine from above, and above is where this camera is. It is also
  // what keeps the top panel off the top of the room's luminance table: it
  // covers 58% of the face that points straight at both overheads.
  //
  // Proud of the panel by 2 mm rather than sunk into it, which is the one part
  // of this that is not what a case does. A shell face is a plane and a plane
  // has no thickness to recess into: the first version sank the mesh 6 mm and
  // the panel simply hid it, so the tower shipped with no vent and I only found
  // out by looking. 2 mm is 0.2 px from this camera.
  const meshMaterial = kit.painter.lit("caseShell", {}, MESH_LEVEL);
  const vent = new Mesh(kit.track(new BoxGeometry(TOWER.width - 0.044, 0.004, TOWER.depth - 0.13)), meshMaterial);
  group.add(at(vent, 0, TOWER.height + 0.002, -0.03));

  // The front panel's intake mesh, inside a 15 mm frame of steel, and proud for
  // the same reason as the vent.
  const intakePanel = new Mesh(
    kit.track(new BoxGeometry(TOWER.width - 0.03, TOWER.height - 0.06, 0.006)),
    meshMaterial,
  );
  group.add(at(intakePanel, 0, half.y, half.z + 0.002));

  // The strip of light down the front, standing clear of the intake so it
  // catches nothing and is simply on. 22 mm is a real light bar's width, and it
  // measures 4 px of its own colour by 45 px on the render — a line you can
  // see. Anything narrower is the mistake the 8 mm cables were last round.
  const bar = new Mesh(kit.track(new BoxGeometry(0.022, 0.36, 0.008)), kit.painter.flat("caseGlow", {}, BAR_LEVEL));
  group.add(at(bar, -half.x + 0.032, 0.23, half.z + TOWER.barRelief));


  // The glass, last, so what is behind it is already in the scene. It writes no
  // depth: a transparent panel that does would hide the card behind it at every
  // angle where the sort happens to put the panel first.
  //
  // Smoked, not clear. `bezel` is `--at-black`, which takes no light, so at 30%
  // it is a flat 30% darkening of everything behind it and nothing else — which
  // is what a tempered side panel does and, across that much raked glass, the
  // only cue available that there is a pane there at all. Clear gold at 16%
  // made the case read as a crate with its side off.
  const glass = new Mesh(
    sideGeometry,
    kit.painter.lit("bezel", { transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide }),
  );
  glass.position.set(-half.x, half.y, 0);
  glass.lookAt(glass.position.clone().add(new Vector3(-1, 0, 0)));
  glass.renderOrder = 2;
  group.add(glass);

  // The motherboard tray, on the far side from the glass. Not `board`: that
  // role is `--at-divider`, which is 239,239,239 under the dark theme, and a
  // near-white tray is the brightest thing the glass was showing — the case
  // read as an open crate with something pale in it rather than as a case with
  // a dark interior and one lit card.
  const board = new Mesh(kit.track(new PlaneGeometry(0.3, 0.24)), meshMaterial);
  board.position.set(half.x - 0.012, 0.3, -0.02);
  board.lookAt(board.position.clone().add(new Vector3(-1, 0, 0)));
  group.add(board);

  // The card: three slots thick, 336 long, 140 across. It hangs off the board
  // and reaches most of the way to the glass, which is what a machine like this
  // looks like through one.
  const cardThickness = TOWER.slotPitch * 3;
  const card = slab(kit, [0.14, cardThickness, 0.336], "casePanel");
  group.add(at(card, 0.03, 0.245, -0.03));
  const backplate = slab(kit, [0.142, 0.004, 0.34], "caseInterior");
  group.add(at(backplate, 0.03, 0.245 - cardThickness / 2 - 0.002, -0.03));
  // Three fans on the underside of the card, which is the side you see through
  // glass with the card mounted the usual way up.
  const cardFanGeometry = kit.track(new CylinderGeometry(0.044, 0.044, 0.012, 14));
  const fanMaterial = kit.painter.lit("fan");
  for (const z of [-0.13, -0.01, 0.11]) {
    group.add(at(new Mesh(cardFanGeometry, fanMaterial), 0.03, 0.245 - cardThickness / 2 - 0.008, z));
  }

  // A 240 mm AIO under the vent, its two fans below the radiator, and the pump
  // on the socket with the two tubes that make it an AIO rather than a cooler.
  const radiator = slab(kit, [0.118, 0.027, 0.25], "casePanel");
  group.add(at(radiator, 0.03, TOWER.height - 0.045, -0.04));
  const aioFanGeometry = kit.track(new CylinderGeometry(0.058, 0.058, 0.025, 16));
  for (const z of [-0.1, 0.02]) {
    group.add(at(new Mesh(aioFanGeometry, fanMaterial), 0.03, TOWER.height - 0.072, z));
  }
  const pump = new Mesh(kit.track(new CylinderGeometry(0.038, 0.038, 0.03, 16)), kit.painter.lit("casePanel"));
  pump.rotation.z = Math.PI / 2;
  group.add(at(pump, half.x - 0.05, 0.33, -0.06));
  for (const offset of [-0.03, 0.03]) {
    const curve = new CatmullRomCurve3([
      new Vector3(half.x - 0.062, 0.33 + offset, -0.06),
      new Vector3(half.x - 0.09, 0.39, -0.09 + offset),
      new Vector3(0.03 + offset, TOWER.height - 0.085, -0.15),
    ]);
    const tube = new Mesh(kit.track(new TubeGeometry(curve, 14, 0.011, 8, false)), kit.painter.lit("cable"));
    group.add(tube);
  }

  // The shroud over the supply, which is what closes the bottom of the case —
  // and, from this camera, most of what the glass actually shows. A ray through
  // the glass drops 0.563 m crossing the case's 0.23 m of width, so it is under
  // the card that the eye ends up, not on it.
  const shroud = new Mesh(
    kit.track(new BoxGeometry(TOWER.width - 0.02, 0.09, TOWER.depth - 0.03)),
    kit.painter.lit("caseShell", {}, INSIDE_LEVEL),
  );
  group.add(at(shroud, 0, 0.048, 0));

  // Front intake, behind the panel: seen through the glass at a rake, not
  // through the steel.
  const intakeGeometry = kit.track(new CylinderGeometry(0.06, 0.06, 0.024, 16));
  for (const y of [0.19, 0.31]) {
    const fan = new Mesh(intakeGeometry, fanMaterial);
    fan.rotation.x = Math.PI / 2;
    group.add(at(fan, 0, y, half.z - 0.038));
  }

  // Lit from inside, steady. Nothing in this room breathes.
  const interior = kit.painter.lamp(new PointLight(undefined, 1.4, 0.8, 1.6), "caseGlow");
  // Behind the card rather than in the middle of the case, so what the glass
  // shows is the card and the radiator lit from behind rather than a lamp.
  interior.position.set(0.05, 0.36, -0.12);
  group.add(interior);

  return { group, interior };
}

// ---------------------------------------------------------------- the cables

/**
 * From the back of the desk across the open floor to the tower.
 *
 * Two things had to change before this read at all. It ran behind the desk,
 * where the desk top hides it from a camera 52° above the floor; it now crosses
 * the gap between the desk and the tower, which is the one stretch of floor
 * nothing else is standing on. And it was 8 mm — 0.9 px at the room's scale,
 * which is not a cable, it is nothing. A power lead, a display lead and a USB
 * lead taped together is about 24 mm, so that is what this is: 2.8 px, a line
 * you can see.
 */
const CABLE_RADIUS = 0.012;

export function buildCables(kit: Kit): Group {
  const cables = new Group();
  const material = kit.painter.lit("cable");
  const toTower = TOWER.centre.x;
  const runs: Vector3[][] = [
    // Monitor and power, off the desk's right end and along the floor.
    [
      new Vector3(0.62, DESK.top - 0.05, 0.12),
      new Vector3(0.8, 0.52, 0.2),
      new Vector3(0.96, 0.2, 0.3),
      new Vector3(toTower - 0.28, 0.035, 0.46),
      new Vector3(toTower - 0.1, 0.05, 0.52),
    ],
    // The slack loop every desk has, on the floor where it is seen.
    [
      new Vector3(toTower - 0.12, 0.035, 0.58),
      new Vector3(toTower - 0.42, 0.035, 0.72),
      new Vector3(toTower - 0.5, 0.035, 0.44),
      new Vector3(toTower - 0.24, 0.035, 0.36),
    ],
    // Wall power, out of the back of the tower and away to the right.
    [
      new Vector3(toTower + 0.1, 0.08, 0.4),
      new Vector3(toTower + 0.34, 0.035, 0.3),
      new Vector3(toTower + 0.62, 0.035, 0.14),
    ],
  ];
  for (const run of runs) {
    const curve = new CatmullRomCurve3(run);
    cables.add(new Mesh(kit.track(new TubeGeometry(curve, 40, CABLE_RADIUS, 7, false)), material));
  }
  return cables;
}

// ----------------------------------------------------------------- the chair

/** Beside the desk rather than behind it: the camera looks down the room, so
 *  anything tucked in behind another prop is a prop nobody sees. */
export const CHAIR = { centre: new Vector3(1.25, 0, 0.8), turn: 0.55 };

export interface ChairBuild {
  /** Positioned and turned. The jacket hangs off this, whatever is under it. */
  group: Group;
  /** Just the procedural chair. A model that arrives hides this and nothing
   *  else, so the jacket stays where it is and a failed load is a no-op. */
  stand: Group;
  /** The top edge of the backrest, in the chair's own space — what the jacket
   *  is draped over. */
  backTop: Vector3;
}

export function buildChair(kit: Kit): ChairBuild {
  const group = new Group();
  group.position.copy(CHAIR.centre);
  group.rotation.y = CHAIR.turn;
  const stand = new Group();
  group.add(stand);

  const seat = slab(kit, [0.48, 0.07, 0.46], "board");
  stand.add(at(seat, 0, 0.45, 0));

  const back = slab(kit, [0.44, 0.5, 0.06], "board");
  back.rotation.x = -0.14;
  stand.add(at(back, 0, 0.74, 0.22));

  const column = new Mesh(
    kit.track(new CylinderGeometry(0.035, 0.045, 0.4, 12)),
    kit.painter.lit("deskFrame"),
  );
  stand.add(at(column, 0, 0.21, 0));

  const armGeometry = kit.track(new BoxGeometry(0.035, 0.035, 0.34));
  const castorGeometry = kit.track(new CylinderGeometry(0.026, 0.026, 0.022, 10));
  const frameMaterial = kit.painter.lit("deskFrame");
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const arm = new Mesh(armGeometry, frameMaterial);
    arm.position.set(Math.sin(angle) * 0.15, 0.04, Math.cos(angle) * 0.15);
    arm.rotation.y = angle;
    stand.add(arm);
    const castor = new Mesh(castorGeometry, frameMaterial);
    castor.rotation.z = Math.PI / 2;
    stand.add(at(castor, Math.sin(angle) * 0.29, 0.026, Math.cos(angle) * 0.29));
  }

  return { group, stand, backTop: new Vector3(0, 0.96, 0.26) };
}

// ---------------------------------------------------------------- the jacket

/**
 * A jacket over the back of the chair: a sheet swept along a profile that goes
 * up the front of the backrest, over its top edge and down the back, with the
 * folds growing as it falls.
 *
 * This is the one thing in the room a box cannot be made to look like, and it
 * is the piece a CC0 model would replace. Whatever happens to the model, this
 * is what stands.
 */
export function buildJacket(kit: Kit): Group {
  const jacket = new Group();

  // Short down the front, because the seat is there, and long down the back,
  // because nothing is. Chair space: the backrest's top edge is at about
  // (0, 0.99, 0.185) once its own lean is applied, and the sheet folds there.
  jacket.position.set(0, 0.012, 0.172);
  const profile = new CatmullRomCurve3([
    new Vector3(0, 0.5, -0.085),
    new Vector3(0, 0.66, -0.08),
    new Vector3(0, 0.84, -0.055),
    new Vector3(0, 0.945, -0.022),
    new Vector3(0, 0.975, 0.012),
    new Vector3(0, 0.93, 0.048),
    new Vector3(0, 0.68, 0.082),
    new Vector3(0, 0.4, 0.098),
    new Vector3(0, 0.22, 0.104),
  ]);

  const across = 18;
  const along = 30;
  const geometry = kit.track(new PlaneGeometry(1, 1, across, along));
  const position = geometry.attributes.position;
  const point = new Vector3();
  for (let i = 0; i <= along; i += 1) {
    const t = i / along;
    profile.getPoint(t, point);
    // Wider at the shoulders than at the hem, and the folds deepen as the
    // cloth falls away from the edge it is hanging on.
    const width = 0.22 + 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.6));
    const fold = 0.016 * Math.min(1, Math.abs(t - 0.5) * 2.6);
    for (let j = 0; j <= across; j += 1) {
      const u = j / across;
      const index = i * (across + 1) + j;
      const sway = Math.cos(u * Math.PI * 5) * fold;
      position.setXYZ(index, (u - 0.5) * 2 * width, point.y + sway * 0.35, point.z + sway);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const cloth = new Mesh(geometry, kit.painter.lit("jacket", { side: DoubleSide }));
  jacket.add(cloth);

  // Two sleeves hanging down the front, which is what makes it read as a
  // jacket rather than a towel.
  for (const side of [-1, 1]) {
    const sleeve = new CatmullRomCurve3([
      new Vector3(side * 0.21, 0.9, 0.03),
      new Vector3(side * 0.27, 0.74, 0.09),
      new Vector3(side * 0.26, 0.55, 0.11),
      new Vector3(side * 0.22, 0.38, 0.09),
    ]);
    jacket.add(
      new Mesh(kit.track(new TubeGeometry(sleeve, 18, 0.042, 9, false)), kit.painter.lit("jacket")),
    );
  }

  return jacket;
}

// ------------------------------------------------------- the rest of the desk

/** A mug on the corner: lathe for the body, a torus for the handle, and a disc
 *  of coffee sitting below the rim rather than level with it. */
export function buildMug(kit: Kit): Group {
  const mug = new Group();
  const profile: Vector2[] = [
    new Vector2(0, 0),
    new Vector2(0.032, 0),
    new Vector2(0.035, 0.006),
    new Vector2(0.038, 0.05),
    new Vector2(0.04, 0.092),
    new Vector2(0.037, 0.095),
    new Vector2(0.034, 0.05),
    new Vector2(0.031, 0.008),
    new Vector2(0, 0.008),
  ];
  mug.add(new Mesh(kit.track(new LatheGeometry(profile, 20)), kit.painter.lit("mug")));

  const handle = new Mesh(kit.track(new TorusGeometry(0.022, 0.006, 8, 16, Math.PI * 1.2)), kit.painter.lit("mug"));
  handle.position.set(0.04, 0.052, 0);
  handle.rotation.set(Math.PI / 2, 0, -0.6);
  mug.add(handle);

  const coffee = new Mesh(kit.track(new CylinderGeometry(0.0335, 0.0335, 0.002, 20)), kit.painter.lit("coffee"));
  coffee.position.y = 0.072;
  mug.add(coffee);

  return mug;
}

/**
 * A stack of storyboards, squared off badly, which is how a stack of paper
 * someone has been through actually sits — leaned against the end of the desk
 * rather than lying on it.
 *
 * Flat on the desk an A4 sheet is 0.297 × 0.21 m, and at 52° above the floor
 * that foreshortens to about 34 × 15 px: a smudge. Leaned up, the same stack
 * turns its face to the camera. A3 rather than A4 because that is the size a
 * board is drawn at, and because 0.42 m reads and 0.297 m does not.
 */
export function buildStoryboards(kit: Kit, sheets = 12): Group {
  const stack = new Group();
  const geometry = kit.track(new BoxGeometry(0.42, 0.0024, 0.297));
  const paper = kit.painter.lit("paper");
  const edge = kit.painter.lit("paperEdge");
  for (let i = 0; i < sheets; i += 1) {
    const sheet = new Mesh(geometry, i % 4 === 3 ? edge : paper);
    // Deterministic, not random: a stack that reshuffles on every entry is a
    // stack nobody can recognise as the same stack.
    const drift = Math.sin(i * 2.4) * 0.009;
    sheet.position.set(drift, i * 0.0026, Math.cos(i * 1.7) * 0.008);
    sheet.rotation.y = Math.sin(i * 1.1) * 0.04;
    stack.add(sheet);
  }
  return stack;
}
