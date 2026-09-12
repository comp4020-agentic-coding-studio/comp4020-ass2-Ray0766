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
  /** Remember what the god view has to keep in shot: a cylinder, in world units.
   *  `standRadius` is how far out the *tall* things are, which is not the same
   *  as how far out the floor goes: the hub's doors stand inside its rim, and a
   *  fit that assumes a door might be standing on the rim reserves frame above
   *  the far edge for one that is not there. Defaults to `radius`. */
  frame(centre: Vector3, radius: number, height: number, standRadius?: number): void;
  /** The same, for a box. A room is framed this way rather than as a cylinder:
   *  a disc round a square room wastes the corners, and the frustum is centred
   *  on the content rather than on the floor. */
  frameBox(min: Vector3, max: Vector3): void;
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
  /** The thing being framed, as a rectangle in canvas pixels, or null when the
   *  camera is on its resting view. The HUD keeps its buttons out of it: this
   *  is the one moment in the backlot where a reader is being asked to read
   *  something, and a control over the top of it is a control in the way. */
  framedRect(width: number, height: number): { left: number; top: number; right: number; bottom: number } | null;
}

export function createGodCamera(): GodCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, DOLLY * 3);
  const rig = new Group();
  rig.add(camera);

  /** What the resting view has to hold. A cylinder for the hub, which is a ring
   *  you look down into; a box for a room, which is not. They fit differently
   *  on purpose — see `fitGod`. */
  const base = {
    kind: "cylinder" as "cylinder" | "box",
    centre: new Vector3(),
    radius: 1,
    /** Where the tall things stand, which is at most `radius`. */
    standRadius: 1,
    height: 1,
    min: new Vector3(),
    max: new Vector3(),
  };
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
  const slide = new Vector3();

  const across = new Vector3();
  const upward = new Vector3();
  const rectCorner = new Vector3();
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

  /** The god view's half-height, and how far the camera has to slide along its
   *  own up axis to put the content in the middle of the frame.
   *
   *  The two shapes are *sampled* differently — a cylinder round its rim at both
   *  levels, a box at its eight corners — and then fitted the same way: to their
   *  own camera-space extent, with the frustum slid to match.
   *
   *  That used to be true only of the box. The hub's cylinder was fitted
   *  symmetrically about a floor-level pivot, which reserves as much frame under
   *  the near rim as the doors need above the far one and spends it on empty
   *  air. It was worth 85 -> 108 px per metre when it was taken out of the
   *  machine room's fit, and the hub had gone on paying it: the ring the doors
   *  stand on reached 45.6% of the viewport's height, of which this was about
   *  nine points. There is no shape this is right for. The one thing the
   *  symmetric fit did buy — that the god view does not slide when the mouse
   *  nudges it — is bought instead by `base` being fixed geometry rather than a
   *  measured bound, so `shiftY` is the same number on every frame.
   *
   *  Measured rather than derived either way: the projected footprint of a
   *  tilted shape is not its plan. */
  function fitGod(): { half: number; shiftY: number } {
    intoCamera.copy(camera.matrixWorld).invert();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const take = (x: number, y: number, z: number) => {
      corner.set(x, y, z).applyMatrix4(intoCamera);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    };

    if (base.kind === "cylinder") {
      for (let step = 0; step < 16; step++) {
        const angle = (step / 16) * Math.PI * 2;
        // The floor goes out to `radius`; whatever stands up goes out to
        // `standRadius`. Sampling the top level at the rim reserved frame above
        // the far edge of the hub's floor for a door standing where no door
        // stands, which was 0.47 m of the ring's own height.
        for (const [level, out] of [
          [0, base.radius],
          [base.height, base.standRadius],
        ] as const) {
          take(
            base.centre.x + Math.cos(angle) * out,
            base.centre.y + level,
            base.centre.z + Math.sin(angle) * out,
          );
        }
      }
    } else {
      for (const x of [base.min.x, base.max.x]) {
        for (const y of [base.min.y, base.max.y]) {
          for (const z of [base.min.z, base.max.z]) take(x, y, z);
        }
      }
    }

    // Grow whichever axis is short. Never shrink: shrinking is what clips.
    const half = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect) * MARGIN;
    return { half, shiftY: (maxY + minY) / 2 };
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
    const fitted = fitGod();
    const godHalf = fitted.half;
    if (fitted.shiftY !== 0) {
      // An orthographic camera slid along its own up axis just moves the
      // frustum, so the fit taken a moment ago still holds and there is nothing
      // to iterate.
      slide.set(0, 1, 0).applyQuaternion(godRotation);
      godPosition.addScaledVector(slide, fitted.shiftY);
      camera.position.copy(godPosition);
      camera.updateMatrixWorld(true);
    }

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

    frame(centre, radius, height, standRadius) {
      base.kind = "cylinder";
      base.centre.copy(centre);
      base.radius = Math.max(radius, 0.001);
      base.standRadius = Math.min(base.radius, Math.max(standRadius ?? radius, 0.001));
      base.height = Math.max(height, 0.001);
      apply();
    },

    frameBox(min, max) {
      base.kind = "box";
      base.min.copy(min);
      base.max.copy(max);
      base.centre.set((min.x + max.x) / 2, 0, (min.z + max.z) / 2);
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

    framedRect(width, height) {
      if (!framing || travel <= 0 || width <= 0 || height <= 0) return null;
      // The radius is the thing's own half-width, so the four corners of a
      // camera-aligned square of that size are the rectangle the framing
      // promised to fill. Projected rather than derived from the frustum, so it
      // stays right while the camera is still travelling.
      across.set(1, 0, 0).applyQuaternion(camera.quaternion);
      upward.set(0, 1, 0).applyQuaternion(camera.quaternion);
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (const sideways of [-framing.radius, framing.radius]) {
        for (const vertical of [-framing.radius, framing.radius]) {
          rectCorner
            .copy(framing.target)
            .addScaledVector(across, sideways)
            .addScaledVector(upward, vertical)
            .project(camera);
          const x = (rectCorner.x * 0.5 + 0.5) * width;
          const y = (-rectCorner.y * 0.5 + 0.5) * height;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      return { left, top, right, bottom };
    },
  };
}
