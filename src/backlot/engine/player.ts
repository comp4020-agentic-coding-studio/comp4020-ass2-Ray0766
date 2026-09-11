// The figure: a capsule, a head and a short blade of a nose so which way it is
// pointing is readable from directly above.
//
// It is the reader's position in the world and nothing else — it carries no
// state about doors, rooms or pages. Walking is the only thing it knows how to
// do, and under reduced motion it does not even do that: `walkTo` puts the
// figure at the target and resolves, because the state change still has to
// happen, it just arrives instantly.
import { BoxGeometry, CapsuleGeometry, CircleGeometry, Group, MathUtils, Mesh, SphereGeometry, Vector3 } from "three";
import type { PlayerApi } from "./types";
import type { Palette } from "./scene";

/** Metres a second. Tuned against the ring's 8 m radius: the middle to a door
 *  in a bit under two seconds, which is a walk and not a teleport. */
const SPEED = 4.6;
/** How close counts as there. Smaller than any hotspot radius. */
const ARRIVED = 0.18;
/** Radians a second the figure turns to meet its heading. */
const TURN_RATE = 9;

const BODY_RADIUS = 0.34;
const BODY_LENGTH = 0.82;
const HEAD_Y = BODY_RADIUS * 2 + BODY_LENGTH + 0.06;

export interface Figure extends PlayerApi {
  /** Add this to the scene. */
  group: Group;
  /** Ground direction the controls are asking for; zero length means stop. */
  drive(direction: Vector3): void;
  /** Nothing walks off the edge of the floor. */
  setBounds(radius: number): void;
  update(delta: number, elapsed: number): void;
  /** True while a walk or a drive is moving it. */
  readonly moving: boolean;
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

  const body = new Mesh(new CapsuleGeometry(BODY_RADIUS, BODY_LENGTH, 4, 14), palette.lit("--at-tertiary"));
  body.position.y = BODY_RADIUS + BODY_LENGTH / 2;

  const head = new Mesh(new SphereGeometry(0.24, 16, 12), palette.lit("--at-text"));
  head.position.y = HEAD_Y;

  // A god view flattens a capsule into a dot, so the figure needs one feature
  // that survives being seen from above: a blade on the front, which reads as a
  // heading from straight down and as a nose from the side.
  const nose = new Mesh(new BoxGeometry(0.11, 0.11, 0.3), palette.lit("--at-brand-ink"));
  nose.position.set(0, HEAD_Y, 0.27);

  // Not a shadow — there are no shadow maps in this scene and a fake one would
  // be the wrong colour in one of the two themes. A tinted patch at the feet,
  // painted from the divider token, grounds the figure in both.
  const contact = new Mesh(new CircleGeometry(0.52, 24), palette.flat("--at-divider"));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.012;

  group.add(body, head, nose, contact);

  const position = new Vector3();
  const facing = new Vector3(0, 0, 1);
  const heading = new Vector3(0, 0, 1);
  const driving = new Vector3();
  const step = new Vector3();

  let bounds = Infinity;
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
    position.copy(target).setY(0);
    if (position.length() > bounds) position.setLength(bounds);
    if (direction) face(direction, true);
    group.position.copy(position);
    group.rotation.y = Math.atan2(facing.x, facing.z);
    moving = false;
  }

  return {
    group,
    position,
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
        const direction = step.copy(target).setY(0).sub(position);
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
        step.copy(where).setY(0).sub(position);
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
    setBounds(radius) {
      bounds = radius;
      if (position.length() > bounds) place(position);
    },
    update(delta, elapsed) {
      const still = reducedMotion();
      step.set(0, 0, 0);

      if (driving.lengthSq() > 1e-6) {
        step.copy(driving).clampLength(0, 1).multiplyScalar(SPEED * delta);
      } else if (goal) {
        const remaining = step.copy(goal.target).sub(position);
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
        position.add(step);
        if (position.length() > bounds) position.setLength(bounds);
        face(step, still);
        group.position.copy(position);
      }

      if (!still) {
        const turn = Math.atan2(heading.x, heading.z);
        group.rotation.y = approachAngle(group.rotation.y, turn, TURN_RATE * delta);
        facing.set(Math.sin(group.rotation.y), 0, Math.cos(group.rotation.y));
        // The walk: a small rise and fall on the body only. Under reduced
        // motion this branch never runs and the body sits at its rest height.
        body.position.y = BODY_RADIUS + BODY_LENGTH / 2 + (moving ? Math.abs(Math.sin(elapsed * 9)) * 0.05 : 0);
      } else {
        group.rotation.y = Math.atan2(facing.x, facing.z);
        body.position.y = BODY_RADIUS + BODY_LENGTH / 2;
      }
    },
    dispose() {
      clearGoal();
      for (const mesh of [body, head, nose, contact]) mesh.geometry.dispose();
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
