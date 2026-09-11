// The canvas's box, watched rather than assumed.
//
// 1920×1080 and 390×844 have to swap either way with no jump, no scrollbar and
// nothing clipped. The page owns the box — the stage is
// `calc(100dvh - nav - status bar)` in backlot.css and the canvas fills it — so
// the engine's whole job here is to notice the box changing and never to write
// a size back into it. Hence `setSize(…, false)`: three would otherwise put an
// inline pixel width on the canvas, which is an engine opinion overriding a
// page rule, and on a `dvh` box that starts a feedback loop the moment a phone
// browser's URL bar slides away.
//
// The stage ships `hidden`, but site.css's `[data-reserve][hidden]` keeps it
// `display: block; visibility: hidden`, so it has a real box from first paint
// and the first frame is rendered at the size the reader will see it at. The
// fallbacks below are for the case where that reservation is not there: better
// a first frame at a plausible size, corrected on the next observation, than a
// first frame at 0×0.

/** Beyond 2× the extra pixels cost more than they show on a scene of flat fills. */
const MAX_PIXEL_RATIO = 2;

export interface Sizer {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** Re-read the box. True when it changed. */
  measure(): boolean;
  dispose(): void;
}

export function createResizer(canvas: HTMLCanvasElement, onChange: (sizer: Sizer) => void): Sizer {
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  function read(): { width: number; height: number } {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      return { width: canvas.clientWidth, height: canvas.clientHeight };
    }
    const stage = canvas.parentElement;
    if (stage && stage.clientWidth > 0 && stage.clientHeight > 0) {
      return { width: stage.clientWidth, height: stage.clientHeight };
    }
    const top = canvas.getBoundingClientRect().top;
    return {
      width: Math.max(document.documentElement.clientWidth, 1),
      height: Math.max(window.innerHeight - Math.max(top, 0), 1),
    };
  }

  const sizer: Sizer = {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get pixelRatio() {
      return pixelRatio;
    },
    measure() {
      const box = read();
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      if (box.width === width && box.height === height && ratio === pixelRatio) return false;
      width = box.width;
      height = box.height;
      pixelRatio = ratio;
      return true;
    },
    dispose() {
      observer.disconnect();
      window.removeEventListener("resize", onWindow);
    },
  };

  const react = () => {
    if (sizer.measure()) onChange(sizer);
  };

  const observer = new ResizeObserver(react);
  observer.observe(canvas);
  const stage = canvas.parentElement;
  if (stage) observer.observe(stage);

  // ResizeObserver does not fire for a device-pixel-ratio change on its own —
  // a window dragged between a retina screen and an external one keeps the same
  // CSS box and needs a different drawing buffer.
  const onWindow = () => react();
  window.addEventListener("resize", onWindow);

  sizer.measure();
  return sizer;
}
