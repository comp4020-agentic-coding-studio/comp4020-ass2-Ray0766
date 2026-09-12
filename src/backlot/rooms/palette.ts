// Every colour in the backlot, named once, as a token.
//
// Nothing here is a colour. The scene asks `ColourReader` for a `--at-*` token
// and gets back whatever the page's compositor made of it, so the room is the
// page's palette by construction and a theme flip repaints it rather than
// leaving a scene painted in last theme's numbers. That is the reason this file
// exists at all: without it every material would carry its own number and the
// two themes would drift apart in a place no stylesheet can see.
//
// The four node kinds take the same tokens `src/styles/graph-reader.css` gives
// them, so the graph on the monitor and the graph in the week 7 lecture colour
// a loader the same way. Those are `--phase-*` rather than `--at-*`; they are
// defined in phase-colours.css, which site.css imports and StudioLayout loads,
// and ColourReader resolves any CSS colour var.
import type { ColourReader } from "../engine/types";
import type { Material, PointLight } from "three";
import { MeshBasicMaterial, MeshLambertMaterial } from "three";

/** Every surface in the room, and the token it is painted from. */
export const TOKENS = {
  // The shell. The floor takes the palette's lightest surface and the walls its
  // middle one, which is the other way round from a real room and right for
  // this one: the camera looks down, so the floor is most of what is on screen,
  // and the walls are backing for pictures that are lit from inside themselves.
  floor: "--at-bg-elevated",
  wall: "--at-bg-alt",
  ceiling: "--at-bg-alt",
  skirting: "--at-border",

  // a frame on a wall
  frameEdge: "--at-divider",
  frameFill: "--at-bg-elevated",

  // the fit-out
  deskTop: "--at-divider",
  deskFrame: "--at-tertiary",
  caseShell: "--at-tertiary",
  casePanel: "--at-border",
  caseInterior: "--at-black",
  caseGlow: "--at-primary",
  board: "--at-divider",
  fan: "--at-divider",
  cable: "--at-divider",
  bezel: "--at-black",
  mug: "--at-bg-elevated",
  coffee: "--at-secondary",
  paper: "--at-bg-elevated",
  paperEdge: "--at-border",
  jacket: "--at-border",

  // light
  screenLight: "--at-white",
  roomLight: "--at-white",

  // ink, for anything drawn into a canvas texture
  ink: "--at-text",
  inkSoft: "--at-text-secondary",
  inkFaint: "--at-text-muted",
  panel: "--at-bg",
  panelAlt: "--at-bg-alt",
  rule: "--at-border",
  neutral: "--at-white",

  // the four kinds of node, as graph-reader.css paints them
  kindLoader: "--phase-rig",
  kindConditioning: "--phase-generators",
  kindSampler: "--phase-episode",
  kindFix: "--phase-holding",
  kindOther: "--at-divider",
} as const;

export type Role = keyof typeof TOKENS;

type Tinted = { color: { setHex(value: number): unknown; multiplyScalar(value: number): unknown } };

/** The page's own surface, which is what the room's exposure is read off. */
const SURFACE = "--at-bg";

/**
 * Where a lit surface should land, in linear light, once the stage's key has
 * fallen on it.
 *
 * The stage's three lights (src/backlot/engine/scene.ts) are fixed and mostly
 * theme-independent — a white directional at 2.0 and a gold point at 40 — but
 * the surfaces they fall on are not: --at-bg is linear 0.0045 under the dark
 * theme and 0.985 under the light one, a factor of 220. Measured in Chrome,
 * both themes. Lit at the same intensity, one of those comes out black and the
 * other comes out clipped at pure white, and a room clipped to white has no
 * shape left in it: the light theme's set was one flat rectangle with the
 * furniture invisible inside it.
 *
 * A room cannot turn the stage's lights down — they belong to the engine and
 * the ring outside still needs them. So it turns its own albedos down instead,
 * by one stop applied to every lit material, which is the same arithmetic seen
 * from the other end. Hue and the ratios between tokens are untouched; only the
 * level moves, and the shape the key light puts on the walls survives.
 */
const TARGET_ALBEDO = 0.13;

/**
 * Hands out materials and light colours, remembers which role each one took,
 * and repaints the lot when the theme flips.
 *
 * A material or a light handed out here is owned here: `dispose()` frees every
 * material it made. Textures are not its business — the frames own those.
 */
export class Painter {
  readonly #colours: ColourReader;
  readonly #tinted: { target: Tinted; role: Role; stopped: boolean; level: number }[] = [];
  #gain = 1;
  readonly #materials: Material[] = [];
  readonly #repaint: (() => void)[] = [];
  #stopListening: (() => void) | null = null;

  constructor(colours: ColourReader) {
    this.#colours = colours;
    this.#gain = this.#stop();
    this.#stopListening = colours.onThemeChange(() => this.repaint());
  }

  /** One stop for the whole room, from the page's own surface. Never above 1:
   *  a dark theme is already under-exposed and the practicals lift it. */
  #stop(): number {
    const [r, g, b] = this.#colours.get(SURFACE);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return Math.min(1, TARGET_ALBEDO / Math.max(luminance, 1e-4));
  }

  /** What the lit surfaces are being scaled by right now. */
  get gain(): number {
    return this.#gain;
  }

  /** The token's value right now, as three takes it. */
  hex(role: Role): number {
    return this.#colours.hex(TOKENS[role]);
  }

  /** The same value as something a canvas 2D context will accept. */
  css(role: Role): string {
    return `#${this.hex(role).toString(16).padStart(6, "0")}`;
  }

  /** Keeps `target.color` on `role` across theme flips. Returns the target.
   *  `stopped` surfaces take the room's exposure; a light and a self-lit
   *  picture do not, because neither of them is a surface the key falls on.
   *
   *  `level` is the other half of that, and it exists because a self-lit thing
   *  has nothing else holding it down: a surface's brightness is the exposure's
   *  to decide, but a light bar takes the token's own value and would sit at
   *  whatever the palette happens to make of it. A composition that has to keep
   *  one thing under another needs a number it can say out loud, and this is
   *  that number — hue and the token stay where they are, only the level moves,
   *  and a theme flip re-applies it. */
  tint<T extends Tinted>(target: T, role: Role, stopped = false, level = 1): T {
    target.color.setHex(this.hex(role));
    const scale = (stopped ? this.#gain : 1) * level;
    if (scale !== 1) target.color.multiplyScalar(scale);
    this.#tinted.push({ target, role, stopped, level });
    return target;
  }

  /** Lit. Lambert, because the engine's own scene is Lambert and a second
   *  lighting model would put a second shader set in a chunk measured against
   *  200 kB (src/backlot/engine/scene.ts says the same thing).
   *
   *  `level` is a second stop on top of the room's own, for the one case the
   *  room-wide one cannot answer: `machine-room.ts` exposes for `--at-tertiary`
   *  and puts it at 0.68 linear, so *any* large face painted with that token is
   *  the room's highlight by construction — and the composition has already
   *  decided the highlight is the pictures on the walls. */
  lit(
    role: Role,
    options: ConstructorParameters<typeof MeshLambertMaterial>[0] = {},
    level = 1,
  ): MeshLambertMaterial {
    const material = new MeshLambertMaterial(options);
    this.#materials.push(material);
    return this.tint(material, role, true, level);
  }

  /** Unlit. For anything that is its own light source: a screen, a picture, the
   *  bar down the front of the tower. `level` holds it under something else. */
  flat(
    role: Role,
    options: ConstructorParameters<typeof MeshBasicMaterial>[0] = {},
    level = 1,
  ): MeshBasicMaterial {
    const material = new MeshBasicMaterial(options);
    this.#materials.push(material);
    return this.tint(material, role, false, level);
  }

  lamp<T extends PointLight>(light: T, role: Role): T {
    return this.tint(light, role);
  }

  /** Anything that paints itself — a canvas texture — redraws from here. */
  onRepaint(handler: () => void): void {
    this.#repaint.push(handler);
  }

  repaint(): void {
    this.#gain = this.#stop();
    for (const { target, role, stopped, level } of this.#tinted) {
      target.color.setHex(this.hex(role));
      const scale = (stopped ? this.#gain : 1) * level;
      if (scale !== 1) target.color.multiplyScalar(scale);
    }
    for (const handler of this.#repaint) handler();
  }

  dispose(): void {
    this.#stopListening?.();
    this.#stopListening = null;
    for (const material of this.#materials) material.dispose();
    this.#materials.length = 0;
    this.#tinted.length = 0;
    this.#repaint.length = 0;
  }
}
