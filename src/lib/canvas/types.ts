// The canvas document. Nothing in this file touches the DOM, React Flow or
// localStorage: it is the shape the build-time converter writes, the layout
// module reasons about, and the engine adapter renders. Swapping the engine
// (§7) means writing a new adapter against these types, not editing them.

export type ID = string;

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface CanvasDoc {
  boards: Board[];
  nodes: Node[];
  edges: Edge[];
  camera: Camera;
  version: 1;
}

export interface Board {
  id: ID;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "recorded" | "user";
  order: number;
  week?: number;
}

/** Where a node came from. `manifest` nodes are the recorded material and are
 *  never deletable; `desk` nodes are generations; `drag` is a node the visitor
 *  pulled out into a board of their own. */
export type Origin =
  | { kind: "manifest"; week: number; tier: string }
  | { kind: "desk"; refNodeIds: ID[]; prompt: string; at: string }
  | { kind: "drag" };

export interface NodeBase {
  id: ID;
  boardId: ID;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  origin: Origin;
}

export interface InputNode extends NodeBase {
  type: "input";
  /** The manifest's own `input.kind`, verbatim — seed, prompt, image, image
   *  pair, reference set, graph, upscale, script, and the two synthesised
   *  kinds the Cut and the reference episode need (window, segment). */
  kind: string;
  label: string;
  value?: string | string[];
  file?: string;
  promptFile?: string;
  tierId: ID;
}

export interface TakeNode extends NodeBase {
  type: "take";
  media: "image" | "video";
  file: string;
  poster?: string;
  naturalW: number;
  naturalH: number;
  tierId: ID;
  takeId: string;
}

export interface PlaceholderNode extends NodeBase {
  type: "placeholder";
  expectedAspect: number;
  resolvesTo: ID;
}

export type Node = InputNode | TakeNode | PlaceholderNode;

export interface Edge {
  id: ID;
  from: ID;
  to: ID;
  kind: "lineage" | "same-file" | "desk";
  label: string;
}

/** Everything a node card needs beyond the geometry: the week's rig, the
 *  citeable address, and where the take is taught. Kept beside the node
 *  rather than inside it so the doc stays the small serialisable thing that
 *  goes into localStorage. */
export interface NodeMeta {
  takeId?: string;
  productionLine?: string;
  /** `Replayed <takeId> · <model> · <mode> · <resolution>` — the desk's plan
   *  line, precomputed at build time so the desk never restates the rig. */
  planLine?: string;
  openHref?: string;
  openLabel?: string;
  note?: string;
  promptText?: string;
  negText?: string;
  /** The tier's own recorded input, whitespace-normalised — what the desk's
   *  resolver compares a typed prompt against. */
  recordedInput?: string;
  week?: number;
  tier?: string;
  model?: string;
  mode?: string;
  resolution?: string;
  seed?: string;
  counterExample?: boolean;
}

export interface CanvasBundle {
  doc: CanvasDoc;
  meta: Record<ID, NodeMeta>;
}

export const CANVAS_VERSION = 1 as const;
export const STORAGE_KEY = "studio:canvas";
