// Walking, steering and Esc.
//
// Four ways in, all of them ending in the same two verbs — drive the figure, or
// send it somewhere:
//
//   keyboard   arrows and WASD, held, camera-relative so "up" is always up the
//              screen however far the mouse has nudged the view; and Enter,
//              which goes through whatever the figure is standing at
//   mouse      click the floor to walk there; moving the pointer turns the
//              camera a few degrees and nothing more
//   touch      one finger down and dragged is a stick; one finger tapped is a
//              walk. The threshold between them is distance and time, measured
//              in CSS pixels so it means the same thing at both viewports
//   Esc        back to the middle of the ring, or out of a room
//
// Written here rather than borrowed. The touch handling on f9.qianturuixuan.com
// was offered as a shortcut; a drag-as-stick against a fixed camera is thirty
// lines, and lifting someone else's would have cost more in reading it than in
// writing this.
//
// Nothing in here listens on the canvas for keys. The keys are on the window so
// they work the moment the page loads, and they step aside for a text field and
// for the modifier combinations a browser owns.
import { Vector3 } from "three";
import type { GodCamera } from "./camera";

/** A drag longer than this is a stick, not a tap — in CSS pixels. */
const TAP_SLOP = 10;
/** And a press longer than this is a hold, however still the finger was. */
const TAP_MILLISECONDS = 400;
/** Finger travel that counts as full deflection. */
const STICK_RANGE = 90;

const WALK_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export interface InputOptions {
  canvas: HTMLCanvasElement;
  camera: GodCamera;
  /** Ground direction the figure should walk in; zero length means stop. */
  drive(direction: Vector3): void;
  /** A click or a tap on the floor. */
  walkTo(point: Vector3): void;
  onEscape(): void;
  /**
   * Enter, pressed with nothing in the HUD holding focus.
   *
   * This is not a second path through the backlot — it ends in the same `use`
   * a click and an Enter on the button do, and it does nothing unless the figure
   * is standing at something. It is here because walking up to a door stopped
   * being the same act as going through it: a reader who walks up now gets the
   * window and the clip and has to be told how to go on, and "press Enter"
   * is only true if Enter works from where they are. Someone walking with the
   * arrow keys has focus on `<body>`, where Enter reached nothing at all.
   */
  onActivate(): void;
  /** −1..1 each. Ignored entirely when the reader asked for less motion. */
  aim(yaw: number, pitch: number): void;
  reducedMotion(): boolean;
}

export interface Input {
  /** Recompute the drive vector against the camera's current heading. */
  update(): void;
  dispose(): void;
}

/**
 * Whether Enter belongs to whatever holds focus rather than to the figure.
 *
 * `<body>` and the root element are what the document reports when nothing is
 * holding focus, which is the only state the window-level Enter below is
 * allowed to act in. Anything else owns its own Enter: a button's activation
 * behaviour is the browser's and runs on the button, and a link in the page
 * under the stage is the reader's.
 *
 * **Exported, and a function rather than a line inside the handler, because the
 * engine has to be able to ask the same question.** A sentence that says "press
 * Enter to open it" is only true if this is false, or if the thing holding focus
 * is that very door's own button — and the engine had no way to ask, so it
 * promised an Enter the reader did not have. Two copies of this test would drift
 * the moment one of them learned about a case the other had not; there is one.
 */
export function enterYieldsToFocus(): boolean {
  const active = document.activeElement;
  return active !== null && active !== document.body && active !== document.documentElement;
}

export function createInput(options: InputOptions): Input {
  const { canvas, camera, drive, walkTo, onEscape, onActivate, aim, reducedMotion } = options;

  const held = new Set<string>();
  const stick = { x: 0, y: 0 };
  const direction = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const ground = new Vector3();

  let pointer: { id: number; x: number; y: number; at: number; dragging: boolean } | null = null;

  function box(): { width: number; height: number; left: number; top: number } {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
  }

  function recompute(): void {
    let x = stick.x;
    let y = stick.y;
    for (const code of held) {
      const axis = WALK_KEYS[code];
      if (!axis) continue;
      x += axis[0];
      y += axis[1];
    }
    if (x === 0 && y === 0) {
      drive(direction.set(0, 0, 0));
      return;
    }
    camera.forward(forward);
    camera.right(right);
    direction.set(0, 0, 0).addScaledVector(forward, y).addScaledVector(right, x);
    drive(direction.clampLength(0, 1));
  }

  /** True when the key belongs to something the reader is typing into, or to a
   *  browser shortcut. Either way it is not ours to take. */
  function busyElsewhere(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey || event.altKey) return true;
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    if (target.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onEscape();
      return;
    }
    if (event.key === "Enter") {
      // Whatever has focus owns its own Enter. A button's activation behaviour
      // is the browser's and runs on the button; taking the key here as well
      // would run the door twice, and taking it while somebody is on a link in
      // the page under the stage would run it instead of the link.
      if (busyElsewhere(event) || enterYieldsToFocus()) return;
      event.preventDefault();
      onActivate();
      return;
    }
    if (busyElsewhere(event) || !(event.code in WALK_KEYS)) return;
    // The stage fills the window, so an un-prevented arrow scrolls the page out
    // from under the scene while the figure walks.
    event.preventDefault();
    if (held.has(event.code)) return;
    held.add(event.code);
    recompute();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!held.delete(event.code)) return;
    recompute();
  };

  // A key held while the window loses focus never gets its keyup, and the
  // figure walks into the wall forever.
  const onBlur = () => {
    held.clear();
    stick.x = 0;
    stick.y = 0;
    recompute();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), dragging: false };
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const rect = box();
    if (!pointer || pointer.id !== event.pointerId) {
      // A mouse crossing the stage turns the camera a little. Not an orbit: the
      // whole range is four degrees, and under reduced motion it is nothing.
      if (event.pointerType === "mouse" && !reducedMotion() && rect.width > 0 && rect.height > 0) {
        aim(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
      }
      return;
    }

    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging && Math.hypot(dx, dy) > TAP_SLOP) pointer.dragging = true;
    if (!pointer.dragging) return;

    if (event.pointerType === "mouse") {
      if (!reducedMotion() && rect.width > 0 && rect.height > 0) {
        aim(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
      }
      return;
    }

    // One finger, dragged: a stick centred where it went down. Up the screen is
    // forward, which is why the y axis is inverted on its way in.
    stick.x = Math.max(-1, Math.min(1, dx / STICK_RANGE));
    stick.y = Math.max(-1, Math.min(1, -dy / STICK_RANGE));
    recompute();
  };

  const endPointer = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const { dragging, at } = pointer;
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (stick.x !== 0 || stick.y !== 0) {
      stick.x = 0;
      stick.y = 0;
      recompute();
    }
    if (dragging || performance.now() - at > TAP_MILLISECONDS) return;

    const rect = box();
    const hit = camera.groundAt(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, ground);
    if (hit) walkTo(ground);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  return {
    update: recompute,
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      held.clear();
    },
  };
}
