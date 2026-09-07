// What a visitor did to the canvas, kept in localStorage and merged back
// over the built document on the next visit.
//
// The built document is the authority on what the recorded material *is*:
// which file a take shows, which tier it came from, what its address is.
// Storage is the authority on where things sit and what the visitor made.
// Merging that way round means a rebuild that adds a week, fixes a poster or
// changes a layout number reaches someone who has used the canvas before,
// instead of being masked by their own months-old copy of it.

import type { CanvasDoc, Edge, ID, Node } from "./types";
import { CANVAS_VERSION, STORAGE_KEY } from "./types";

export interface StoredShape {
  version: number;
  boards?: unknown[];
  nodes?: unknown[];
  edges?: unknown[];
  camera?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readStoredDoc(storage?: Pick<Storage, "getItem">): StoredShape | undefined {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== CANVAS_VERSION) return undefined;
    return parsed as unknown as StoredShape;
  } catch {
    // Private browsing, a full quota, a storage the browser refuses to hand
    // over: an unsaved but working canvas is the right outcome, not an error.
    return undefined;
  }
}

export function writeDoc(doc: CanvasDoc, storage?: Pick<Storage, "setItem">): void {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    store?.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Same as above; the canvas keeps working, it just stops remembering.
  }
}

export function clearDoc(storage?: Pick<Storage, "removeItem">): void {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to undo */
  }
}

/** A node the visitor's own storage introduced is only accepted if it looks
 *  like one the canvas could have made: a take resolved from a recorded file
 *  under the studio's own asset path, or a placeholder waiting on one. */
function acceptStoredNode(raw: unknown, assetPrefix: string): Node | undefined {
  if (!isRecord(raw)) return undefined;
  const { id, boardId, type, origin } = raw;
  if (typeof id !== "string" || typeof boardId !== "string") return undefined;
  if (!isRecord(origin) || origin.kind === "manifest") return undefined;

  if (type === "take") {
    const file = raw.file;
    if (typeof file !== "string" || !file.startsWith(assetPrefix)) return undefined;
  } else if (type !== "placeholder") {
    return undefined;
  }

  return raw as unknown as Node;
}

export interface MergeOptions {
  /** Everything a stored take may point at has to sit under this path — the
   *  same `/<base>/studio/` prefix the build wrote. */
  assetPrefix: string;
}

/** Built document + what storage remembers = the canvas the visitor sees. */
export function mergeStoredDoc(built: CanvasDoc, stored: StoredShape | undefined, options: MergeOptions): CanvasDoc {
  if (!stored) return built;

  const storedBoards = new Map<ID, Record<string, unknown>>();
  for (const raw of stored.boards ?? []) {
    if (isRecord(raw) && typeof raw.id === "string") storedBoards.set(raw.id, raw);
  }
  const storedNodes = new Map<ID, Record<string, unknown>>();
  for (const raw of stored.nodes ?? []) {
    if (isRecord(raw) && typeof raw.id === "string") storedNodes.set(raw.id, raw);
  }

  // Recorded boards keep their manifest title and their kind; only where they
  // sit and how big they have grown comes back from storage.
  const boards = built.boards.map((board) => {
    const saved = storedBoards.get(board.id);
    if (!saved) return board;
    return {
      ...board,
      x: num(saved.x, board.x),
      y: num(saved.y, board.y),
      w: num(saved.w, board.w),
      h: num(saved.h, board.h),
    };
  });

  const builtBoardIds = new Set(built.boards.map((board) => board.id));
  for (const saved of storedBoards.values()) {
    if (builtBoardIds.has(saved.id as ID)) continue;
    if (saved.kind !== "user") continue;
    if (typeof saved.title !== "string") continue;
    boards.push({
      id: saved.id as ID,
      title: saved.title,
      x: num(saved.x, 0),
      y: num(saved.y, 0),
      w: num(saved.w, 0),
      h: num(saved.h, 0),
      kind: "user",
      order: num(saved.order, boards.length),
    });
  }

  const boardIds = new Set(boards.map((board) => board.id));

  const nodes: Node[] = built.nodes.map((node) => {
    const saved = storedNodes.get(node.id);
    if (!saved) return node;
    const boardId = typeof saved.boardId === "string" && boardIds.has(saved.boardId) ? saved.boardId : node.boardId;
    return { ...node, boardId, x: num(saved.x, node.x), y: num(saved.y, node.y) };
  });

  const builtNodeIds = new Set(built.nodes.map((node) => node.id));
  for (const saved of storedNodes.values()) {
    if (builtNodeIds.has(saved.id as ID)) continue;
    const node = acceptStoredNode(saved, options.assetPrefix);
    if (node && boardIds.has(node.boardId)) nodes.push(node);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const builtEdgeIds = new Set(built.edges.map((edge) => edge.id));
  const edges: Edge[] = [...built.edges];
  for (const raw of stored.edges ?? []) {
    if (!isRecord(raw)) continue;
    const { id, from, to, kind, label } = raw;
    if (typeof id !== "string" || builtEdgeIds.has(id)) continue;
    if (kind !== "desk") continue;
    if (typeof from !== "string" || typeof to !== "string") continue;
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    edges.push({ id, from, to, kind: "desk", label: typeof label === "string" ? label : "" });
  }

  const savedCamera = isRecord(stored.camera) ? stored.camera : undefined;
  const camera = savedCamera
    ? {
        x: num(savedCamera.x, built.camera.x),
        y: num(savedCamera.y, built.camera.y),
        z: num(savedCamera.z, built.camera.z),
      }
    : built.camera;

  return { boards, nodes, edges, camera, version: CANVAS_VERSION };
}
