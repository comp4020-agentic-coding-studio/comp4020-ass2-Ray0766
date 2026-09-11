// Colour, resolved the way the compositor resolves it.
//
// The palette is oklch all the way down, with relative-colour-syntax surfaces
// derived from the brand tokens and a light-dark pair on top of each of those,
// so there is nothing here a colour parser could usefully read — and, worth
// saying plainly, this file writes no colour value of its own in any syntax,
// which is what the no-literals check is looking for. The theme's contrast.ts
// says axe-core cannot read oklch at all. The only honest reading of a token
// is the one the browser takes on its way to painting a pixel: put the token
// on a real element, ask for the computed value, hand that string to a 1×1
// canvas and read the byte back. Everything in the scene is painted from that,
// which is why src/backlot/ holds no colour literal — the scene's colours are
// the page's colours by construction, in either theme.
//
// A translucent token is composited over the page's own surface first. Half
// the palette carries alpha (`--at-border` is the brand at 30%/40%,
// `--at-divider` is the ink at 12%), and the un-composited channels of a
// translucent fill are not a colour anyone ever sees — CLAUDE.md §7 makes the
// same point about the hero scrim.
import { Color, SRGBColorSpace } from "three";
import type { ColourReader } from "./types";

export interface ColourSource extends ColourReader {
  dispose(): void;
}

const BYTE_MAX = 255;

/** The surface every translucent token is composited over: the page's own. */
const PAGE_SURFACE = "--at-bg";

interface Sample {
  linear: [number, number, number];
  hex: number;
}

/** One pixel to paint into, or a hard failure. A browser with no 2D context is
 *  a browser this cannot read a token on, and guessing a colour instead is the
 *  one thing the contract rules out — boot.ts catches it and the reader keeps
 *  the list, which is the whole page anyway. */
function onePixelContext(): CanvasRenderingContext2D {
  const surface = document.createElement("canvas");
  surface.width = 1;
  surface.height = 1;
  const context = surface.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("backlot: no 2d context, so no way to resolve a token the way the compositor does");
  }
  return context;
}

export function createColourReader(root: HTMLElement = document.documentElement): ColourSource {
  // A real element, in the document, inheriting `color-scheme` from the root —
  // which is what makes `light-dark()` pick a side. A detached element resolves
  // custom properties against nothing and every token comes back empty. This is
  // the host; each read gets a fresh child of it, for the reason in `declared`.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.className = "backlot-colour-probe";
  (document.body ?? root).append(host);

  const paint = onePixelContext();

  const cache = new Map<string, Sample>();
  const handlers = new Set<() => void>();
  const scratch = new Color();
  let pageSurface: string | null = null;

  /** The token as a string the canvas can parse, or a hard failure.
   *
   *  A **fresh element per read**, coloured before it is inserted, and this is
   *  not fussiness — it is the fix for a bug that painted the whole scene one
   *  near-white colour under `prefers-reduced-motion: reduce`.
   *
   *  base.css ends with the usual reduced-motion reset:
   *  `*, *::before, *::after { transition-duration: 0.01ms !important }`. That
   *  duration is small but it is not zero, and `transition-property` is left at
   *  its initial `all` — so under the preference every element in the page has
   *  a live transition on every animatable property, `color` among them.
   *  Setting a shared probe's colour therefore starts a `CSSTransition` on
   *  `color`, and `getComputedStyle().color` read in the same task returns the
   *  value it is transitioning *from*, not the value just asked for. Measured:
   *  `getAnimations()` returns `CSSTransition:color`, the same-task read is one
   *  token behind, and the next frame's read is right. With the
   *  remove-then-set this used to do, both halves transitioned from the
   *  inherited colour, so all eleven tokens came back as `--at-text` — a
   *  near-white scene lit for dark surfaces, which clips to white.
   *
   *  A transition never runs on an element's first style computation, so an
   *  element created, coloured and then inserted has no before-change style to
   *  transition from and reports the colour it was asked for. `transition:
   *  none` on top of that is the second line: the theme's `!important` is on
   *  the duration, not on `transition-property`, so declaring no property to
   *  transition still wins. Both were measured working on their own.
   *
   *  The existence check is separate on purpose. `color: var(--nope)` is
   *  invalid at computed-value time, which makes `color` fall back to the
   *  inherited value — so a typo would come back as the body text colour and
   *  paint the scene a plausible wrong shade forever. A missing token is a
   *  question for the palette's owner, not a colour to invent. */
  function declared(token: string): string {
    if (!getComputedStyle(root).getPropertyValue(token).trim()) {
      throw new Error(`backlot: the palette has no ${token}`);
    }
    const probe = document.createElement("span");
    probe.style.transition = "none";
    probe.style.color = `var(${token})`;
    host.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    if (!resolved) throw new Error(`backlot: ${token} resolved to nothing`);
    return resolved;
  }

  function sample(token: string): Sample {
    const cached = cache.get(token);
    if (cached) return cached;

    if (pageSurface === null) pageSurface = declared(PAGE_SURFACE);
    const value = token === PAGE_SURFACE ? pageSurface : declared(token);

    paint.clearRect(0, 0, 1, 1);
    // The page's surface first, then the token over it: an opaque token covers
    // it completely and a translucent one comes out as the colour it will
    // actually be seen as.
    paint.fillStyle = pageSurface;
    paint.fillRect(0, 0, 1, 1);
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const pixel = paint.getImageData(0, 0, 1, 1).data;

    // three does the space conversion, so the number the scene gets and the
    // number the renderer expects come out of the same code as the renderer's
    // own. setRGB with SRGBColorSpace converts into the linear working space.
    scratch.setRGB(pixel[0]! / BYTE_MAX, pixel[1]! / BYTE_MAX, pixel[2]! / BYTE_MAX, SRGBColorSpace);
    const taken: Sample = { linear: [scratch.r, scratch.g, scratch.b], hex: scratch.getHex(SRGBColorSpace) };
    cache.set(token, taken);
    return taken;
  }

  // The status bar's toggle writes `data-theme` on the root, so that attribute
  // is what decides which half of every `light-dark()` the page is showing.
  const observer = new MutationObserver(() => {
    cache.clear();
    pageSurface = null;
    for (const handler of handlers) handler();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  return {
    get(token) {
      return sample(token).linear;
    },
    hex(token) {
      return sample(token).hex;
    },
    onThemeChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose() {
      observer.disconnect();
      handlers.clear();
      cache.clear();
      host.remove();
    },
  };
}
