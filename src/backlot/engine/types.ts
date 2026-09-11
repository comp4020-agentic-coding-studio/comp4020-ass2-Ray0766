// The contract between the three halves of /backlot/: the engine that draws
// and drives, the rooms that are built inside it, and the page that boots the
// whole thing over a gallery that already works with no JS at all.
//
// Everything here is a type. Nothing in this file imports three, and nothing
// in this file imports the manifest module's values — only its types, which
// erase at build. That keeps the manifest (build-time, inlines every studio
// JSON) out of the island, and keeps this file free to be imported anywhere.
//
// Read this before writing against any of it:
//   - The engine owns the canvas, the camera, the figure, input, resize, the
//     hotspot buttons and the colour reader. A room never touches those.
//   - A room owns what is inside it: geometry, lights, materials, and the
//     meaning of the pieces its manifest entry lists.
//   - The page owns the route, the no-JS gallery, and the two entry links.

import type { Object3D, Group, Texture, Vector3 } from "three";
import type { BacklotManifest, BacklotRoom, BacklotPiece } from "../rooms/manifest";

export type { BacklotManifest, BacklotRoom, BacklotPiece };

// ------------------------------------------------------------------- payload

/**
 * What the Astro page serialises into its JSON script tag, and the only thing
 * client code is given.
 *
 * The page has already resolved every `href` in the manifest through
 * `withBase`, so what arrives here is a URL that works at the deployed
 * sub-path. Asset `file` fields stay bare: prefix them with `assetPrefix`.
 */
export interface BacklotPayload {
  manifest: BacklotManifest;
  /** `withBase("/studio/")` — every piece's `file` hangs off this. */
  assetPrefix: string;
}

// -------------------------------------------------------------------- colour

/**
 * Colour, read off the rendered page rather than written into the scene.
 *
 * The palette is oklch with relative-colour-syntax surfaces on top of it, so
 * there is nothing here a colour parser could usefully read. `get` resolves a
 * token the way the compositor does — paint it into a 1×1 canvas and read the
 * pixel back — which means the scene's colours are the page's colours by
 * construction, in either theme, and src/backlot/ contains no colour literals
 * at all. spec checks for that.
 */
export interface ColourReader {
  /** Linear-sRGB triple, 0..1, for a `--at-*` token or any CSS colour var. */
  get(token: string): [number, number, number];
  /** Hex int, for feeding three's Color/material constructors directly. */
  hex(token: string): number;
  /** Runs when the theme toggle flips `data-theme`; re-read anything you cached. */
  onThemeChange(handler: () => void): () => void;
}

// ------------------------------------------------------------------ hotspots

/**
 * A thing in the world that is also a real `<button>` in the HUD, in
 * registration order — which is Tab order. There is no second, keyboard-only
 * path through the backlot: the buttons are the backlot, and the canvas is how
 * they look.
 */
export interface HotspotSpec {
  /** Stable; matches the manifest id it came from, so the gallery and the 3D agree. */
  id: string;
  /** The button's accessible name. Written as an action: "Open the Lectures door". */
  label: string;
  /** Where it lives, so the button can be parked over it and the figure can walk to it. */
  position: Vector3;
  /** How close the figure has to be for a walk to count as arriving. Metres. */
  radius?: number;
  /** What the live region says when the figure arrives, if anything. */
  arrival?: string;
  /** Enter on the button, click on the canvas, or a walk that arrives — all land here. */
  activate(): void;
  /** Fired when the figure comes within `radius`, and again when it leaves. */
  onProximity?(near: boolean): void;
}

export interface Hotspot {
  readonly id: string;
  readonly button: HTMLButtonElement;
  setLabel(label: string): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export interface HotspotApi {
  register(spec: HotspotSpec): Hotspot;
}

// -------------------------------------------------------------------- layers

/**
 * Loading, in the order a reader needs things.
 *
 *   L0  geometry and lights. Synchronous, no network past the island chunk.
 *       The first frame is this and nothing else, and you can already walk.
 *   L1  `texture()` — the stills and posters.
 *   L2  `video()` — only for the piece the figure is facing. Everything else
 *       stays on its poster.
 *   L3  `model()` — the CC0 low-poly pieces. Dynamically imported loader, so
 *       it costs nothing until it is asked for.
 *
 * Every one of these can come back empty, and empty is a normal outcome, not
 * an error state: a missing texture leaves the frame its flat fill, a missing
 * model leaves the procedural stand-in standing. Nothing reserves space for a
 * thing that has not arrived, and nothing swaps in with a flash.
 */
export interface LayerApi {
  /** L1. Resolves null if the file never arrives — the caller keeps what it has. */
  texture(file: string): Promise<Texture | null>;
  /** L2. A clip that only exists while it is being watched. */
  video(piece: BacklotPiece): VideoHandle;
  /** L3. Resolves null on any failure, including no WebGL budget left for it. */
  model(url: string): Promise<Object3D | null>;
}

export interface VideoHandle {
  /** Creates the element and the texture on first call, not before. */
  play(): Promise<void>;
  pause(): void;
  /** Frees the decoder. Called whenever the figure stops facing this piece. */
  release(): void;
  readonly texture: Texture | null;
  readonly playing: boolean;
}

// -------------------------------------------------------------------- player

export interface PlayerApi {
  /** Live reference — read it, never write it. */
  readonly position: Vector3;
  /** Unit vector the figure is facing. */
  readonly facing: Vector3;
  /** Puts the figure somewhere without animating, e.g. on entering a room. */
  placeAt(position: Vector3, facing?: Vector3): void;
  /** Walks there; resolves on arrival, or immediately under reduced motion. */
  walkTo(position: Vector3): Promise<void>;
  /** Of the given ids, the one the figure is most squarely facing, or null. */
  facingWhich(ids: string[]): string | null;
}

// --------------------------------------------------------------------- rooms

/** What a room builder is handed. It adds to `root` and touches nothing else. */
export interface RoomContext {
  /** The room's own group. The engine adds and removes it; the builder fills it. */
  root: Group;
  /** This room's entry in the manifest, hrefs already base-resolved. */
  room: BacklotRoom;
  /** Prefix for every piece's `file`. */
  assetPrefix: string;
  colours: ColourReader;
  hotspots: HotspotApi;
  layers: LayerApi;
  player: PlayerApi;
  /** Polite live-region announcement. One sentence, no punctuation games. */
  announce(message: string): void;
  /** True when the reader asked for less motion: no idle animation, no drifting light. */
  reducedMotion: boolean;
  /** Per-frame work. Returns an unsubscribe. Keep it cheap. */
  onFrame(handler: (delta: number, elapsed: number) => void): () => void;
  /** Leaves this room for the hub. */
  leave(): void;
  /** Registered teardown, run when the room is unloaded. */
  onDispose(handler: () => void): void;
}

export type RoomBuilder = (context: RoomContext) => void | Promise<void>;

/** Keyed by `BacklotRoom["id"]`. The page passes this in; the engine calls it. */
export type RoomRegistry = Record<string, RoomBuilder>;

// -------------------------------------------------------------------- engine

export interface BacklotOptions {
  /** The `<canvas>` the scene draws into. */
  canvas: HTMLCanvasElement;
  /** The element the hotspot buttons and the live region are appended to. */
  hud: HTMLElement;
  payload: BacklotPayload;
  rooms: RoomRegistry;
}

export interface BacklotEngine {
  /** Resolves when the first frame has been presented — what the budget is measured against. */
  ready: Promise<void>;
  enterRoom(roomId: string): Promise<void>;
  returnToHub(): void;
  dispose(): void;
}
