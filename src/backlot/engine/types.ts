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
import type {
  BacklotManifest,
  BacklotRoom,
  BacklotPiece,
  BacklotDoor,
  BacklotInteractive,
} from "../rooms/manifest";

export type { BacklotManifest, BacklotRoom, BacklotPiece, BacklotDoor, BacklotInteractive };

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
 * How close the camera has to come for something to be readable.
 *
 * The god view is fixed, and at 1920×1080 it resolves about 85 px per metre —
 * which puts the monitor's panel at 52 px across, measured. A workflow graph
 * drawn at any resolution is unreadable at 52 px, so "walk up and read it" is
 * not a texture problem and no amount of canvas resolution fixes it: the camera
 * has to come in. This is the only thing that moves the camera off its fixed
 * frame, and it always goes back.
 */
export interface FocusRequest {
  /** World-space centre of what has to become readable. */
  target: Vector3;
  /** Radius in metres of the thing being framed. The camera fits this, plus margin. */
  radius: number;
  /** The face's outward normal, so the camera arrives in front of it rather than edge-on. */
  normal?: Vector3;
  /**
   * How much world in front of the target to keep, in metres. Anything nearer
   * the camera than this is cut away by the near plane.
   *
   * It defaults to a multiple of `radius`, which is right wherever the only
   * thing in the way is the room's own near wall — the case camera.ts was
   * written for. It is **not** right down a corridor: the twelve doors are
   * raked about 40 degrees out of their walls, so the camera for week N comes
   * in along a line that crosses the opposite wall 5.0 m out and passes through
   * the door three depths nearer the entrance. Measured with the theme flip as
   * an occlusion detector: **43% of eight of the twelve windows** at 1920x1080
   * was another door's jamb and lintel board. The default clearance is 6.7 m
   * there — the obstruction is inside it, so the near plane sat behind it.
   *
   * A door knows what it has to see past and the camera cannot, which is why
   * this is on the request rather than tuned in the frustum.
   */
  clearance?: number;
}

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
  /**
   * When set, this hotspot is framed when a reader comes to it — by walking the
   * figure up to it, by Tab landing on its button, or by activating it. All
   * three are the same event as far as the camera is concerned, and that is the
   * point: a keyboard reader arrives at a door the same way a walking one does,
   * rather than being told about it. Leaving, or Esc, frames back out; Esc backs
   * out of a framing before it leaves a room.
   *
   * Under `prefers-reduced-motion` the camera cuts rather than travels. The
   * arrival still happens; it just does not move to get there.
   */
  focus?: Omit<FocusRequest, "target">;
  /**
   * The object this hotspot marks, when it marks a surface rather than a point.
   * The engine publishes its projected box through `Hotspot.setRect`, with the
   * caveat documented there.
   *
   * It is here because of what its absence did, not for completeness. Without a
   * rect, a check can only locate a thing by taking a radius around its
   * control: 130 px at 1920×1080, where the nearest stray was 439 px away, but
   * 26 px at 390×844, where the three brightest off-surface cells sat 27, 29
   * and 35 px out — one cell of error, on the screens' own edges. So the room's
   * checks could be shown to go red at one marking viewport and not at the
   * other, which is the failure this whole round has been about.
   */
  surface?: Object3D;
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
  setEnabled(enabled: boolean): void;
  /**
   * Publish where the thing this hotspot marks actually is on screen, as
   * `data-backlot-rect="x,y,w,h"` in CSS pixels on the button.
   *
   * This exists because a colour on a surface in this scene cannot otherwise be
   * measured. The repo's rule is that any new colour is read off the composite
   * rather than off the declaration, and the only handle a check has on a door
   * is its hotspot — which is a control parked *near* the door, not the door's
   * face. A check that sampled a strip through the button's centre would cross
   * two doors and report a number that looks like a measurement.
   *
   * Two things make it worth publishing rather than reconstructing: it comes
   * from the same projection the renderer uses, so it cannot drift from what is
   * drawn; and it updates in the same pass that parks the button, so it is
   * right while the camera is still travelling. Pass `null` for a hotspot that
   * marks a point rather than a surface, and the attribute comes off.
   *
   * The engine may publish further readings on the same button as other
   * `data-backlot-*` attributes, and they carry the same two properties or they
   * do not go up: same projection as the renderer, same pass as the parking.
   * The one that exists is a plate's cap height, because whether a nameplate is
   * showing its word is a decision the engine makes from the projection and
   * nothing sampling the composite can recover — a 37x113 window reads as the
   * door's own light whether the word is on it or not.
   */
  setRect(rect: { x: number; y: number; width: number; height: number } | null): void;
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
  /**
   * L2 for a clip that is not a piece: a window's own.
   *
   * `video` takes a `BacklotPiece` because a room's clips are pictures on a
   * wall. A door's clip and a corridor stage's clip are both named by a
   * `DoorWindow` and there is no piece behind either, and synthesising a fake
   * piece to reach the same three lines would be a shape invented to satisfy a
   * signature. Same decoder and the same one-at-a-time rule: this and `video`
   * share `playing`, so a window's clip and a wall's clip can no more run at
   * once than two of either can.
   *
   * It sits on the shared contract rather than on `Layers` because a room needs
   * it as much as the engine does: the Lectures corridor is twelve windows and
   * six of them have a clip behind the still, and `RoomContext.layers` is this
   * interface.
   */
  videoFile(file: string): VideoHandle;
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

/**
 * A door a room built, handed to the engine so that pressing it is the same act
 * as pressing a door in the ring.
 *
 * This exists because of what the Lectures corridor found, which is worth
 * stating plainly: **the shell was a shell, and the press was the hub's.**
 * Standing a second room up over `buildRoomShell` cost one option (the box's
 * own metres); making a door in that room behave like a door cost this. A press
 * is not one act — it is a walk, a leaf swinging, a page asked for at the moment
 * of the press, and about two and a half seconds in which a reader has to be
 * able to change their mind — and every one of those lived in `engine/index.ts`
 * keyed on `hub.find`. A room that reimplemented them would have twelve doors
 * that look like the ring's and answer Escape differently, which is the shape of
 * bug this repo keeps paying for.
 *
 * So the engine keeps the meaning of a door and the room keeps the door.
 */
export interface RoomDoor {
  /** The hotspot the room registered for this door: its id is the door's, and
   *  it is how the press takes the button out of service while it runs. */
  hotspot: Hotspot;
  /** What the live region calls it — "week 5", not the button's whole label.
   *  "Opening the week 5 door." is a sentence; the label is a title. */
  name: string;
  /** Where the figure walks to before the leaf swings. */
  standing: Vector3;
  /** Where the press ends up. Already base-resolved by the page. */
  href: string;
  /** The opening's real size in metres. The push is specified in **pixels** —
   *  the window has to clear a floor once the camera is there — and only the
   *  engine knows the canvas, so it turns these two numbers into the radius. */
  windowMetres: { wide: number; tall: number };
  /** The framing this door's hotspot carries, **by reference**. The engine
   *  writes `radius` onto this object on every resize, which is the same field
   *  `HotspotSpec.focus` carries and the field any check reads. */
  focus: { radius: number; normal?: Vector3; clearance?: number };
  /** Swing the leaf, or put it back. Under `instant` it is simply open. */
  setOpen(open: boolean, instant: boolean): void;
  /** The name board over its lintel, if it has one. Not the door's published
   *  surface — that is the window — but a parked button must stay off it, and
   *  the engine keeps one list of those for the whole scene. */
  board?: Object3D;
  /**
   * What this door is called in the URL, if it is named there at all.
   *
   * The backlot writes where you are into the hash so that the browser's Back
   * button lands a reader where they left rather than on the ring: a week's
   * page goes back to the corridor with the figure standing at that week's
   * door. The engine owns the writing and the parsing; **the room owns the
   * spelling**, because the room is what a reader recognises the name of, and
   * because it has to match the anchor the no-JS gallery carries for the same
   * thing so the same URL scrolls to the same place with the island switched
   * off entirely.
   */
  route?: string;
}

/** What the engine hands back for a door a room registered. */
export interface RoomDoorHandle {
  /** A press: the walk to the standing mark, the leaf, the page already asked
   *  for, and Escape able to call the whole thing off part-way. */
  press(): void;
  /** The figure has arrived at this door, or left it. It is what makes an Enter
   *  with nothing focused reach the door the reader is visibly standing at —
   *  the state the live region has just said "press Enter to open it" about.
   *  The room says it rather than the engine working it out a second time: the
   *  room is already running that proximity to frame the camera, and two
   *  proximity tests that disagree by a frame is a bug nobody finds. */
  near(at: boolean): void;
}

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
  /** The nearest registered door containing the figure, or null. Settled by
   *  the engine before onFrame, so its window, keyboard and route agree. */
  readonly currentDoor: string | null;
  layers: LayerApi;
  player: PlayerApi;
  /** Polite live-region announcement. One sentence, no punctuation games. */
  announce(message: string): void;
  /**
   * Bring the camera in until `radius` fills the frame, and resolve once it is
   * there. Under reduced motion it arrives in one frame instead of travelling.
   * A room calls this from a hotspot's proximity so walking up to something is
   * what makes it readable; the hotspot's own `focus` does the same for Enter.
   */
  focus(request: FocusRequest): Promise<void>;
  /** Back to the fixed god view. Walking away does this on its own. */
  unfocus(): void;
  /** True when the reader asked for less motion: no idle animation, no drifting light. */
  reducedMotion: boolean;
  /**
   * True while the **engine** is moving the keyboard rather than the reader.
   *
   * Entering a room hands the keyboard to the room's first control, because a
   * control must not drop a reader on `<body>` — and `focusin` fires
   * synchronously, measured, so anything listening for it runs during the
   * hand-over and cannot tell it from somebody arriving. A room that frames the
   * camera on focus has to know the difference, or a reader who pressed a door
   * arrives nose-first at the first thing in the room having never seen the
   * room. That is the failure `HotspotDeck.track`'s `seed` argument already
   * exists to prevent on the proximity path; this is the same rule on the focus
   * path.
   */
  handingFocus: boolean;
  /** Per-frame work. Returns an unsubscribe. Keep it cheap. */
  onFrame(handler: (delta: number, elapsed: number) => void): () => void;
  /**
   * Hand the engine a door this room built, and take back the press.
   *
   * Calling the returned function is what a press on that door is, and it is the
   * **same** function a door in the ring gets: the walk to the standing mark,
   * the leaf, `rel="prefetch" as="document"` fired at the moment of the press
   * rather than when the figure arrives, and Escape stopping the figure where it
   * stands with the leaf closed again and nothing navigated. Registered doors go
   * when the room does.
   */
  door(entry: RoomDoor): RoomDoorHandle;
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
  /**
   * Tear the engine down: the render loop, the listeners, the hotspot buttons,
   * and the WebGL context itself.
   *
   * The page calls this on `astro:before-swap` and boots again on
   * `astro:page-load`, which is one mechanism rather than two listeners that
   * happen to balance. It is on this interface because the page owns the
   * engine's lifetime; `enterRoom` and `returnToHub` used to be here too and
   * are not, because a room is entered through a hotspot, which reaches the
   * local function rather than the published one. A published method nothing
   * outside can call is an API surface with nothing behind it.
   */
  dispose(): void;
}
