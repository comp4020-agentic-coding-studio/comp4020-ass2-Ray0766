// The god view, and the one thing that is allowed to leave it.
//
// Orthographic rather than perspective because the ring is a diagram as much
// as a place — six doors at one radius should read as six doors at one radius,
// not as two near ones and four small ones. The mouse may nudge it a few
// degrees; there is no OrbitControls here and there is not going to be, both
// because the god view stops being a god view the moment a reader can tip it
// over and because `examples/` helpers drag weight the island cannot afford.
//
// The exception is `focusOn`. The fixed frame resolves about 37 px per metre
// across the hub at 1920×1080, which is fine for a ring of doors and hopeless
// for anything with writing on it: a workflow graph on a monitor panel is a
// few dozen pixels across and no texture resolution fixes that, because the
// pixels are not there on the screen. So the camera comes in, frames the thing
// at whatever size its radius asks for, and always goes back.
//
// Both views are computed as a pose — a pivot, a direction and a half-height —
// and the camera is the two poses blended. That is what makes coming in and
// going back one code path with one number in it, rather than two cameras that
// have to agree.
import {
  Group,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";

/** Degrees above the floor for the god view. Steep enough to read as a plan,
 *  shallow enough that a door reads as a door standing up. */
const TILT_DEGREES = 52;
/** And for a framing: almost square on to the face, with just enough tilt that
 *  it still reads as a place rather than a scan. */
const FOCUS_TILT_DEGREES = 12;
/** Ortho, so this changes nothing about scale — it only has to clear the far
 *  side of anything the camera might be asked to frame. */
const DOLLY = 60;
/** The mouse's whole authority over the camera. Four degrees of yaw. */
export const MAX_YAW = MathUtils.degToRad(4);
/** And a degree and a half of height, which reads as leaning in. */
export const MAX_PITCH = MathUtils.degToRad(1.5);
/** Room to breathe around the god view, and cover for the yaw. */
const MARGIN = 1.045;
/** More room around a framing: a thing pressed against the frame is harder to
 *  read than the same thing with a margin round it. */
const FOCUS_MARGIN = 1.14;
/** How long the camera takes to come in, and to go back. Seconds. */
const TRAVEL = 0.62;

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
const UP = new Vector3(0, 1, 0);

export interface GodCamera {
  camera: OrthographicCamera;
  /** Add this to the scene, not the camera. */
  rig: Group;
  /** Both in −1..1. Scaled to MAX_YAW / MAX_PITCH, and faded out by a framing. */
  aim(yaw: number, pitch: number): void;
  /** Remember what the god view has to keep in shot: a cylinder, in world units. */
  frame(centre: Vector3, radius: number, height: number): void;
  /** Viewport pixels to frustum. Safe to call with a zero box; it does nothing. */
  resize(width: number, height: number): void;
  /** Where a viewport point lands on the floor, or null if it misses it. */
  groundAt(x: number, y: number, width: number, height: number, out: Vector3): Vector3 | null;
  /** The ground direction "away from the reader", in the camera's current frame. */
  forward(out: Vector3): Vector3;
  /** The ground direction "to the reader's right". */
  right(out: Vector3): Vector3;

  /** Come in until `radius` fills the frame. Resolves when the camera is there;
   *  under `instant` it is there on the next `apply`, not after a journey. */
  focusOn(target: Vector3, radius: number, normal: Vector3 | undefined, instant: boolean): Promise<void>;
  /** Back to the fixed god view. Settles any promise `focusOn` left open. */
  release(instant: boolean): void;
  /** Advance a framing in progress. Cheap when nothing is moving. */
  update(delta: number): void;
  /** Finish whatever travel is in flight, now. What a reader turning the
   *  motion preference on mid-journey should get. */
  settleNow(): void;
  /** True from the moment a framing is asked for until it is fully released. */
  readonly framed: boolean;
  /** The centre of the current framing, so the caller can notice a walk away. */
  readonly framedTarget: Vector3 | null;
  readonly framedRadius: number;
  /** CSS pixels per world metre for a canvas of this height. The number the
   *  "can you read it" question is actually about. */
  pixelsPerMetre(canvasHeight: number): number;
}

export function createGodCamera(): GodCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, DOLLY * 3);
  const rig = new Group();
  rig.add(camera);

  const base = { centre: new Vector3(), radius: 1, height: 1 };
  let aspect = 1;
  let aimYaw = 0;
  let aimPitch = 0;

  /** 0 is the god view, 1 is fully framed. Everything else is the blend. */
  let travel = 0;
  let wanted = 0;
  let framing: { target: Vector3; radius: number; normal: Vector3 | null } | null = null;
  let arrival: (() => void) | null = null;

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const corner = new Vector3();
  const intoCamera = new Matrix4();
  const look = new Matrix4();
  const offset = new Vector3();
  const pivot = new Vector3();
  const flat = new Vector3();

  const godPosition = new Vector3();
  const godRotation = new Quaternion();
  const focusPosition = new Vector3();
  const focusRotation = new Quaternion();

  let halfHeight = 1;

  /** Smoothstep. The camera should leave and arrive slowly and cross the middle
   *  quickly, which is what stops a move this large from reading as a jump. */
  const ease = (t: number) => t * t * (3 - 2 * t);

  function poseLookingAt(from: Vector3, at: Vector3, into: Quaternion): void {
    look.lookAt(from, at, UP);
    into.setFromRotationMatrix(look);
  }

  /** The god view's half-height: the bounding cylinder's silhouette measured in
   *  camera space, grown so the short axis covers it too. Measured rather than
   *  guessed, because the projected footprint of a tilted cylinder is not its
   *  radius. */
  function godHalfHeight(): number {
    intoCamera.copy(camera.matrixWorld).invert();
    let wide = 0;
    let tall = 0;
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      for (const level of [0, base.height]) {
        corner
          .set(
            base.centre.x + Math.cos(angle) * base.radius,
            base.centre.y + level,
            base.centre.z + Math.sin(angle) * base.radius,
          )
          .applyMatrix4(intoCamera);
        wide = Math.max(wide, Math.abs(corner.x));
        tall = Math.max(tall, Math.abs(corner.y));
      }
    }
    // Grow whichever axis is short. Never shrink: shrinking is what clips.
    return Math.max(tall, wide / aspect) * MARGIN;
  }

  function apply(): void {
    if (aspect <= 0) return;
    const blend = ease(MathUtils.clamp(travel, 0, 1));

    // --- the god pose. The mouse's nudge fades out as a framing comes in.
    const tilt = MathUtils.degToRad(TILT_DEGREES) + aimPitch * MAX_PITCH * (1 - blend);
    const swing = aimYaw * MAX_YAW * (1 - blend);
    pivot.copy(base.centre).setY(0);
    offset.set(Math.sin(swing) * Math.cos(tilt), Math.sin(tilt), Math.cos(swing) * Math.cos(tilt));
    godPosition.copy(pivot).addScaledVector(offset, DOLLY);
    poseLookingAt(godPosition, pivot, godRotation);

    // The fit has to be taken at the god pose, so the camera goes there first
    // and the blend is applied afterwards.
    camera.position.copy(godPosition);
    camera.quaternion.copy(godRotation);
    camera.updateMatrixWorld(true);
    const godHalf = godHalfHeight();

    let near = 0.1;
    if (framing && blend > 0) {
      // --- the framed pose. `normal` is the face's outward direction, so the
      // camera arrives in front of it rather than edge-on. A face pointing
      // straight up has no direction to come at from, and falls back to the
      // god view's.
      flat.set(framing.normal?.x ?? 0, 0, framing.normal?.z ?? 0);
      if (flat.lengthSq() < 1e-6) flat.set(Math.sin(swing), 0, Math.cos(swing));
      flat.normalize();
      const focusTilt = MathUtils.degToRad(FOCUS_TILT_DEGREES);
      offset.set(flat.x * Math.cos(focusTilt), Math.sin(focusTilt), flat.z * Math.cos(focusTilt)).normalize();
      focusPosition.copy(framing.target).addScaledVector(offset, DOLLY);
      poseLookingAt(focusPosition, framing.target, focusRotation);

      const wantedHalf = Math.max(framing.radius, framing.radius / aspect) * FOCUS_MARGIN;

      camera.position.lerpVectors(godPosition, focusPosition, blend);
      camera.quaternion.slerpQuaternions(godRotation, focusRotation, blend);
      halfHeight = MathUtils.lerp(godHalf, wantedHalf, blend);

      // Coming at a panel head-on puts the room's near wall between the camera
      // and the thing being read. An orthographic near plane is a flat cut at a
      // fixed distance, so moving it just in front of the target removes
      // everything in the way and nothing behind it.
      const clearance = framing.radius * 3 + 0.3;
      near = MathUtils.lerp(0.1, Math.max(0.1, DOLLY - clearance), blend);
    } else {
      halfHeight = godHalf;
    }

    camera.updateMatrixWorld(true);
    camera.near = near;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }

  function groundForward(out: Vector3): Vector3 {
    camera.getWorldDirection(out);
    out.y = 0;
    return out.lengthSq() < 1e-6 ? out.set(0, 0, -1) : out.normalize();
  }

  function settle(): void {
    const waiting = arrival;
    arrival = null;
    waiting?.();
  }

  return {
    camera,
    rig,

    aim(yaw, pitch) {
      aimYaw = MathUtils.clamp(yaw, -1, 1);
      aimPitch = MathUtils.clamp(pitch, -1, 1);
      apply();
    },

    frame(centre, radius, height) {
      base.centre.copy(centre);
      base.radius = Math.max(radius, 0.001);
      base.height = Math.max(height, 0.001);
      apply();
    },

    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      aspect = width / height;
      apply();
    },

    groundAt(x, y, width, height, out) {
      if (width <= 0 || height <= 0) return null;
      ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(GROUND, out);
    },

    forward: groundForward,
    right(out) {
      // forward × up: with the camera looking down −Z this is +X, which is the
      // reader's right on screen. Checked against the ring, not derived on paper.
      return groundForward(out).cross(UP).normalize();
    },

    focusOn(target, radius, normal, instant) {
      // A second request while one is in flight replaces it, and the first one's
      // promise settles rather than being left hanging on a camera that is now
      // going somewhere else.
      settle();
      framing = { target: target.clone(), radius: Math.max(radius, 0.02), normal: normal ? normal.clone() : null };
      wanted = 1;
      if (instant) {
        // The state change still happens; it just does not travel.
        travel = 1;
        apply();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        arrival = resolve;
      });
    },

    release(instant) {
      settle();
      wanted = 0;
      if (instant) {
        travel = 0;
        framing = null;
        apply();
      }
    },

    settleNow() {
      if (travel === wanted) return;
      travel = wanted;
      apply();
      if (travel === 1) settle();
      if (travel === 0) framing = null;
    },

    update(delta) {
      if (travel === wanted) return;
      const step = delta / TRAVEL;
      travel = wanted > travel ? Math.min(wanted, travel + step) : Math.max(wanted, travel - step);
      apply();
      if (travel === 1) settle();
      if (travel === 0) framing = null;
    },

    get framed() {
      return framing !== null;
    },
    get framedTarget() {
      return framing?.target ?? null;
    },
    get framedRadius() {
      return framing?.radius ?? 0;
    },

    pixelsPerMetre(canvasHeight) {
      return halfHeight > 0 ? canvasHeight / (2 * halfHeight) : 0;
    },
  };
}
