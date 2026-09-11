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
   *  reader, the wall of takes beyond it). */
  centre: new Vector3(-0.4, 0, 1.4),
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

/** A current mid-tower: 230 wide, 480 tall, 470 deep, glass on the side that
 *  faces the room. The numbers are the class of machine, not a machine. */
export const TOWER = {
  width: 0.23,
  height: 0.48,
  depth: 0.47,
  /** Relative to the desk group. */
  centre: new Vector3(0.66, 0, 0.02),
  /** A PCI slot's pitch, so a three-slot card is three of them. */
  slotPitch: 0.02032,
};

export interface TowerBuild {
  group: Group;
  /** The light inside it, so the room can hold it steady or leave it alone. */
  interior: PointLight;
}

export function buildTower(kit: Kit): TowerBuild {
  const group = new Group();
  group.position.copy(TOWER.centre);

  const half = { x: TOWER.width / 2, y: TOWER.height / 2, z: TOWER.depth / 2 };
  const shellMaterial = kit.painter.lit("caseShell");

  // Five opaque faces and one panel of glass. A closed box with a glass side is
  // the only way the inside reads as an inside rather than as a decal.
  const sideGeometry = kit.track(new PlaneGeometry(TOWER.depth, TOWER.height));
  const endGeometry = kit.track(new PlaneGeometry(TOWER.width, TOWER.height));
  const capGeometry = kit.track(new PlaneGeometry(TOWER.width, TOWER.depth));

  // lookAt() for the upright faces; a fixed rotation for the two horizontal
  // ones, because lookAt straight up or straight down has no up vector left to
  // work with and lands the plane edge-on.
  const uprights: { geometry: PlaneGeometry; position: Vector3; faces: Vector3 }[] = [
    { geometry: sideGeometry, position: new Vector3(-half.x, half.y, 0), faces: new Vector3(1, 0, 0) },
    { geometry: endGeometry, position: new Vector3(0, half.y, -half.z), faces: new Vector3(0, 0, 1) },
    { geometry: endGeometry, position: new Vector3(0, half.y, half.z), faces: new Vector3(0, 0, -1) },
  ];
  for (const face of uprights) {
    const mesh = new Mesh(face.geometry, shellMaterial);
    mesh.position.copy(face.position);
    mesh.lookAt(face.position.clone().add(face.faces));
    group.add(mesh);
  }
  for (const cap of [
    { y: 0.002, turn: -Math.PI / 2 },
    { y: TOWER.height, turn: Math.PI / 2 },
  ]) {
    const mesh = new Mesh(capGeometry, shellMaterial);
    mesh.rotation.x = cap.turn;
    group.add(at(mesh, 0, cap.y, 0));
  }

  // The glass, last, so what is behind it is already in the scene. It writes no
  // depth: a transparent panel that does would hide the card behind it at every
  // angle where the sort happens to put the panel first.
  const glass = new Mesh(
    sideGeometry,
    kit.painter.lit("casePanel", { transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }),
  );
  glass.position.set(half.x, half.y, 0);
  glass.lookAt(glass.position.clone().add(new Vector3(1, 0, 0)));
  glass.renderOrder = 2;
  group.add(glass);

  // The motherboard tray, on the far side from the glass.
  const board = new Mesh(kit.track(new PlaneGeometry(0.3, 0.24)), kit.painter.lit("board"));
  board.position.set(-half.x + 0.012, 0.3, -0.02);
  board.lookAt(board.position.clone().add(new Vector3(1, 0, 0)));
  group.add(board);

  // The card: three slots thick, 336 long, 140 across. It hangs off the board
  // and takes up the middle of the case, which is what a machine like this
  // looks like from the side.
  const cardThickness = TOWER.slotPitch * 3;
  const card = slab(kit, [0.14, cardThickness, 0.336], "casePanel");
  group.add(at(card, -0.02, 0.245, -0.03));
  const backplate = slab(kit, [0.142, 0.004, 0.34], "caseInterior");
  group.add(at(backplate, -0.02, 0.245 - cardThickness / 2 - 0.002, -0.03));
  // Three fans on the underside of the card, which is the side you see through
  // glass with the card mounted the usual way up.
  const cardFanGeometry = kit.track(new CylinderGeometry(0.044, 0.044, 0.012, 14));
  const fanMaterial = kit.painter.lit("fan");
  for (const z of [-0.13, -0.01, 0.11]) {
    group.add(at(new Mesh(cardFanGeometry, fanMaterial), -0.02, 0.245 - cardThickness / 2 - 0.008, z));
  }

  // A 240 mm AIO at the top, its two fans under the radiator, and the pump on
  // the socket with the two tubes that make it an AIO rather than a cooler.
  const radiator = slab(kit, [0.118, 0.027, 0.25], "casePanel");
  group.add(at(radiator, -0.03, TOWER.height - 0.045, -0.04));
  const aioFanGeometry = kit.track(new CylinderGeometry(0.058, 0.058, 0.025, 16));
  for (const z of [-0.1, 0.02]) {
    group.add(at(new Mesh(aioFanGeometry, fanMaterial), -0.03, TOWER.height - 0.072, z));
  }
  const pump = new Mesh(kit.track(new CylinderGeometry(0.038, 0.038, 0.03, 16)), kit.painter.lit("casePanel"));
  pump.rotation.z = Math.PI / 2;
  group.add(at(pump, -half.x + 0.05, 0.33, -0.06));
  for (const offset of [-0.03, 0.03]) {
    const curve = new CatmullRomCurve3([
      new Vector3(-half.x + 0.062, 0.33 + offset, -0.06),
      new Vector3(-half.x + 0.09, 0.39, -0.09 + offset),
      new Vector3(-0.03 + offset, TOWER.height - 0.085, -0.15),
    ]);
    const tube = new Mesh(kit.track(new TubeGeometry(curve, 14, 0.011, 8, false)), kit.painter.lit("cable"));
    group.add(tube);
  }

  // The shroud over the supply, which is what closes the bottom of the case.
  const shroud = slab(kit, [TOWER.width - 0.02, 0.09, TOWER.depth - 0.03], "caseInterior");
  group.add(at(shroud, 0, 0.048, 0));

  // Front intake.
  const intakeGeometry = kit.track(new CylinderGeometry(0.06, 0.06, 0.024, 16));
  for (const y of [0.19, 0.31]) {
    const fan = new Mesh(intakeGeometry, fanMaterial);
    fan.rotation.x = Math.PI / 2;
    group.add(at(fan, 0, y, -half.z + 0.028));
  }

  // Lit from inside, steady. Nothing in this room breathes.
  const interior = kit.painter.lamp(new PointLight(undefined, 1.4, 0.95, 2), "caseGlow");
  interior.position.set(0, 0.3, 0.02);
  group.add(interior);

  return { group, interior };
}

// ---------------------------------------------------------------- the cables

/** From the back of the desk down to the back of the tower, which is the one
 *  place in a room like this where cable is always visible. */
export function buildCables(kit: Kit): Group {
  const cables = new Group();
  const material = kit.painter.lit("cable");
  const runs: Vector3[][] = [
    [
      new Vector3(0, DESK.top - 0.02, -0.05),
      new Vector3(0.2, DESK.top - 0.06, 0.1),
      new Vector3(0.5, 0.52, 0.18),
      new Vector3(0.64, 0.36, 0.24),
      new Vector3(TOWER.centre.x, 0.3, TOWER.depth / 2 + 0.01),
    ],
    [
      new Vector3(TOWER.centre.x - 0.04, 0.16, TOWER.depth / 2 + 0.01),
      new Vector3(0.8, 0.1, 0.34),
      new Vector3(0.95, 0.02, 0.2),
      new Vector3(0.86, 0.02, -0.16),
    ],
    [
      new Vector3(TOWER.centre.x + 0.05, 0.22, TOWER.depth / 2 + 0.01),
      new Vector3(0.82, 0.26, 0.36),
      new Vector3(0.72, 0.13, 0.42),
      new Vector3(0.6, 0.02, 0.3),
    ],
  ];
  for (const run of runs) {
    const curve = new CatmullRomCurve3(run);
    cables.add(new Mesh(kit.track(new TubeGeometry(curve, 40, 0.008, 7, false)), material));
  }
  return cables;
}

// ----------------------------------------------------------------- the chair

export const CHAIR = { centre: new Vector3(0.5, 0, 2.5), turn: 0.42 };

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

/** A stack of storyboards, squared off badly, which is how a stack of paper
 *  someone has been through actually sits. */
export function buildStoryboards(kit: Kit, sheets = 9): Group {
  const stack = new Group();
  const geometry = kit.track(new BoxGeometry(0.297, 0.0022, 0.21));
  const paper = kit.painter.lit("paper");
  const edge = kit.painter.lit("paperEdge");
  for (let i = 0; i < sheets; i += 1) {
    const sheet = new Mesh(geometry, i % 4 === 3 ? edge : paper);
    // Deterministic, not random: a stack that reshuffles on every entry is a
    // stack nobody can recognise as the same stack.
    const drift = Math.sin(i * 2.4) * 0.008;
    sheet.position.set(drift, i * 0.0023, Math.cos(i * 1.7) * 0.007);
    sheet.rotation.y = Math.sin(i * 1.1) * 0.05;
    stack.add(sheet);
  }
  return stack;
}
