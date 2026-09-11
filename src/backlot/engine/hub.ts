// The hub: a circular floor, six doors stood in a ring, and nothing else.
//
// All of it procedural — there is no model in the hub and there is not going to
// be one. Six boxes and a cylinder cost nothing to download, which is what buys
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
import { BoxGeometry, CircleGeometry, Group, Mesh, RingGeometry, Vector3 } from "three";
import type { BacklotManifest } from "./types";
import type { Palette } from "./scene";

// types.ts re-exports BacklotManifest, BacklotRoom and BacklotPiece but not
// BacklotDoor, so the door type is read off the manifest type rather than
// imported from the rooms module directly — the contract file stays the only
// thing the engine reads.
type BacklotDoor = BacklotManifest["doors"][number];

const FLOOR_RADIUS = 11;
/** Where the doors stand. Far enough apart at six that two never overlap. */
const RING_RADIUS = 7.4;
const DOOR_WIDTH = 1.8;
const DOOR_HEIGHT = 2.5;
const DOOR_THICKNESS = 0.14;
const JAMB_WIDTH = 0.24;
const JAMB_DEPTH = 0.46;
/** How far the figure stands off the door when it walks to one. */
const STAND_OFF = 1.6;
/** The step in front of a door. Smaller than the reach on purpose: it marks
 *  where to stand, it is not a diagram of the trigger radius. */
const THRESHOLD_RADIUS = 1.05;
/** Close enough for a walk to count as arriving, and to push the door open. */
export const DOOR_REACH = 1.9;
/** How far a leaf swings. Radians. */
const OPEN_ANGLE = 1.15;
/** Radians a second the leaf swings. A door, not a trapdoor. */
const SWING_RATE = 4.4;

export interface HubDoor {
  door: BacklotDoor;
  /** The middle of the leaf, which is where its button is parked. */
  anchor: Vector3;
  /** Where the figure stands to use it. */
  standing: Vector3;
  /** Outwards from the centre of the ring, on the ground. */
  outward: Vector3;
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
  /** What the camera has to keep in shot. */
  readonly bounds: { centre: Vector3; radius: number; height: number };
  /** Nothing walks off the floor. */
  readonly walkableRadius: number;
  /** The middle of the ring: where Esc puts the figure back. */
  readonly middle: Vector3;
  dispose(): void;
}

export function createHub(doors: BacklotDoor[], palette: Palette): Hub {
  const group = new Group();

  const floor = new Mesh(new CircleGeometry(FLOOR_RADIUS, 72), palette.lit("--at-bg-alt"));
  floor.rotation.x = -Math.PI / 2;

  const rim = new Mesh(new RingGeometry(FLOOR_RADIUS - 0.16, FLOOR_RADIUS, 72), palette.flat("--at-border"));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.01;

  // The path the doors stand on, so the ring reads as a ring from above even
  // where a door is not standing.
  const path = new Mesh(new RingGeometry(RING_RADIUS - 0.07, RING_RADIUS + 0.07, 96), palette.flat("--at-divider"));
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.014;

  group.add(floor, rim, path);

  // One geometry per shape, shared across all six doors: six leaves that differ
  // only by transform have no business being six buffers.
  const leafGeometry = new BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICKNESS);
  const jambGeometry = new BoxGeometry(JAMB_WIDTH, DOOR_HEIGHT + 0.34, JAMB_DEPTH);
  const lintelGeometry = new BoxGeometry(DOOR_WIDTH + JAMB_WIDTH * 2, JAMB_WIDTH, JAMB_DEPTH);
  const thresholdGeometry = new CircleGeometry(THRESHOLD_RADIUS, 28);

  const frameMaterial = palette.lit("--at-tertiary");
  const restMaterial = palette.lit("--at-primary");
  const nearMaterial = palette.lit("--at-primary-hover");
  const thresholdMaterial = palette.flat("--at-divider");

  interface Swinging extends HubDoor {
    pivot: Group;
    leaf: Mesh;
    target: number;
  }

  const built: Swinging[] = [];

  for (const door of [...doors].sort((first, second) => first.order - second.order)) {
    const angle = (door.order / doors.length) * Math.PI * 2;
    const outward = new Vector3(Math.sin(angle), 0, -Math.cos(angle));

    const stand = new Group();
    stand.position.copy(outward).multiplyScalar(RING_RADIUS);
    // The door's own +Z points back at the middle of the ring, so a reader
    // walking out from the centre meets its face.
    stand.rotation.y = Math.atan2(-outward.x, -outward.z);

    const left = new Mesh(jambGeometry, frameMaterial);
    left.position.set(-(DOOR_WIDTH + JAMB_WIDTH) / 2, (DOOR_HEIGHT + 0.34) / 2, 0);
    const right = new Mesh(jambGeometry, frameMaterial);
    right.position.set((DOOR_WIDTH + JAMB_WIDTH) / 2, (DOOR_HEIGHT + 0.34) / 2, 0);
    const lintel = new Mesh(lintelGeometry, frameMaterial);
    lintel.position.set(0, DOOR_HEIGHT + 0.34 - JAMB_WIDTH / 2, 0);

    // Hinged on the left as the door is approached, so the leaf swings into the
    // ring and out of the reader's line rather than across it.
    const pivot = new Group();
    pivot.position.set(-DOOR_WIDTH / 2, 0, 0);
    const leaf = new Mesh(leafGeometry, restMaterial);
    leaf.position.set(DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0);
    pivot.add(leaf);

    const threshold = new Mesh(thresholdGeometry, thresholdMaterial);
    threshold.rotation.x = -Math.PI / 2;
    threshold.position.set(0, 0.016, STAND_OFF);

    stand.add(left, right, lintel, pivot, threshold);
    group.add(stand);

    const anchor = new Vector3().copy(outward).multiplyScalar(RING_RADIUS).setY(DOOR_HEIGHT * 0.62);
    const standing = new Vector3().copy(outward).multiplyScalar(RING_RADIUS - STAND_OFF);

    built.push({ door, anchor, standing, outward, pivot, leaf, target: 0 });
  }

  return {
    group,
    doors: built,
    find(id) {
      return built.find((entry) => entry.door.id === id);
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
      height: DOOR_HEIGHT + 0.34,
    },
    walkableRadius: FLOOR_RADIUS - 0.6,
    middle: new Vector3(0, 0, 0),
    dispose() {
      for (const geometry of [leafGeometry, jambGeometry, lintelGeometry, thresholdGeometry]) geometry.dispose();
      floor.geometry.dispose();
      rim.geometry.dispose();
      path.geometry.dispose();
      group.clear();
    },
  };
}
