// The canvas a visitor actually has in front of them.
//
// The build still hands the island the whole rig — ten boards, every recorded
// input and take, every edge between them. What changed is what that document
// is *for*: it is a template now, not an opening view. The canvas opens with
// nothing on it, and every board on it arrives because someone asked the rig
// to replay a run. "Load the whole rig" is the moment the template lands whole.
//
// Two consequences worth stating, because they are the point rather than side
// effects. A board built this way is a subset of its recorded board, laid out
// by the same grid over the nodes on it now — so once every tier of a week has
// been replayed, the board *is* the recorded board, to the unit. And an edge is
// drawn when both of its ends are on the canvas, which is how the Week 2
// teaching point arrives as something the visitor produced: replay week02-t1,
// replay week06-t4, and the dashed "same file" edge appears between two boards
// that were built minutes apart.
//
// Everything here is a pure function over those two documents. No DOM, no
// React, no storage.

import { layoutBoard, placeBoard, type LayoutItem } from "./layout";
import { mergeStoredDoc, type MergeOptions, type StoredShape } from "./storage";
import type { Board, CanvasDoc, Edge, ID, Node, PlaceholderNode } from "./types";
import { CANVAS_VERSION } from "./types";

/** The one line the empty stage carries. A syllabus says what to do next; it
 *  does not invite you to have a go. */
export const EMPTY_HINT =
  "Pick a week and one of its recorded inputs on the desk; the rig replays that run onto a board here.";

export function emptyCanvasDoc(): CanvasDoc {
  return { boards: [], nodes: [], edges: [], camera: { x: 0, y: 0, z: 1 }, version: CANVAS_VERSION };
}

/** A node's layout item is recoverable from the geometry it already has: every
 *  card is NODE_W wide, so passing its own width and height back through
 *  `nodeHeight` returns that height unchanged, text cards included. */
function itemsFor(nodes: Node[]): LayoutItem[] {
  return nodes.map((node) => ({ id: node.id, naturalW: node.w, naturalH: node.h }));
}

/** Every edge the built rig knows about whose two ends are both on the canvas,
 *  plus the desk edges the visitor's own generations drew. */
export function derivedEdges(built: CanvasDoc, doc: CanvasDoc): Edge[] {
  const present = new Set(doc.nodes.map((node) => node.id));
  const here = (edge: Edge) => present.has(edge.from) && present.has(edge.to);
  const fromRig = built.edges.filter(here);
  const taken = new Set(fromRig.map((edge) => edge.id));
  const own = doc.edges.filter((edge) => edge.kind === "desk" && !taken.has(edge.id) && here(edge));
  return [...fromRig, ...own];
}

function withEdges(built: CanvasDoc, doc: CanvasDoc): CanvasDoc {
  return { ...doc, edges: derivedEdges(built, doc) };
}

/** The board a tier's cards belong to, read off the built rig rather than
 *  spelled out again here. */
export function boardIdOfTier(built: CanvasDoc, tierId: string): ID | undefined {
  return built.nodes.find((node) => node.id === `${tierId}-take`)?.boardId;
}

function nodeIdsOfTier(tierId: string): ID[] {
  return [`${tierId}-input`, `${tierId}-take`];
}

/**
 * Re-runs a board's grid over what is on it now, in the built rig's own node
 * order, and resizes the board to match. Nodes the visitor put there
 * themselves keep their order after the recorded ones, so a board that holds
 * only recorded cards ends up laid out exactly as the build laid it out.
 */
function relayout(doc: CanvasDoc, built: CanvasDoc, boardId: ID): CanvasDoc {
  const board = doc.boards.find((candidate) => candidate.id === boardId);
  if (!board) return doc;

  const on = doc.nodes.filter((node) => node.boardId === boardId);
  const rigOrder = new Map(built.nodes.map((node, index) => [node.id, index]));
  const ordered = [...on].sort((a, b) => (rigOrder.get(a.id) ?? Infinity) - (rigOrder.get(b.id) ?? Infinity));

  const layout = layoutBoard(itemsFor(ordered));
  const local = new Map(layout.positions.map((position) => [position.id, position]));

  const boards = doc.boards.map((candidate) =>
    candidate.id === boardId ? { ...candidate, w: layout.w, h: layout.h } : candidate,
  );

  return {
    ...doc,
    // A board that grew wider would otherwise reach into whatever sits to its
    // right, and the boards to its right are the ones the visitor opened
    // earlier. Push them, rather than letting two boards overlap.
    boards: shiftRightOf(boards, board, layout.w - board.w),
    nodes: doc.nodes.map((node) => {
      const position = local.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : node;
    }),
  };
}

/** Everything that starts to the right of a board's old right edge, and shares
 *  any of its rows, moves over by however much the board grew. */
function shiftRightOf(boards: Board[], grown: Board, delta: number): Board[] {
  if (delta <= 0) return boards;
  const right = grown.x + grown.w;
  return boards.map((board) => {
    if (board.id === grown.id) return board;
    const rows = board.y < grown.y + grown.h && grown.y < board.y + board.h;
    return rows && board.x >= right ? { ...board, x: board.x + delta } : board;
  });
}

/** A board arrives at the origin if it is the first one, and otherwise 120 to
 *  the right of whichever board reaches furthest right — the v2 rule, and the
 *  same BOARD_GAP the recorded strip is spaced by. */
function openBoard(doc: CanvasDoc, built: CanvasDoc, boardId: ID, size: { w: number; h: number }): Board | undefined {
  const source = built.boards.find((board) => board.id === boardId);
  if (!source) return undefined;
  const at = doc.boards.length === 0 ? { x: 0, y: 0 } : placeBoard(doc, size, { kind: "right-of-all" });
  return { ...source, x: at.x, y: at.y, w: size.w, h: size.h, order: doc.boards.length };
}

/** Puts recorded cards on the canvas, opening their board if this is the first
 *  thing on it. Cards already there are left alone, so replaying a run twice
 *  is not two cards showing one file. */
export function addRigNodes(doc: CanvasDoc, built: CanvasDoc, nodeIds: ID[]): CanvasDoc {
  const here = new Set(doc.nodes.map((node) => node.id));
  const adding = built.nodes.filter((node) => nodeIds.includes(node.id) && !here.has(node.id));
  if (adding.length === 0) return doc;

  const boardId = adding[0].boardId;
  const existing = doc.boards.find((board) => board.id === boardId);

  if (existing) {
    return withEdges(built, relayout({ ...doc, nodes: [...doc.nodes, ...adding] }, built, boardId));
  }

  const layout = layoutBoard(itemsFor(adding));
  const board = openBoard(doc, built, boardId, layout);
  if (!board) return doc;

  const local = new Map(layout.positions.map((position) => [position.id, position]));
  const placed = adding.map((node) => {
    const position = local.get(node.id);
    return position ? { ...node, x: position.x, y: position.y } : node;
  });

  return withEdges(built, { ...doc, boards: [...doc.boards, board], nodes: [...doc.nodes, ...placed] });
}

/** One tier: its input card and its take, on that week's board. */
export function addTier(doc: CanvasDoc, built: CanvasDoc, tierId: string): CanvasDoc {
  return addRigNodes(doc, built, nodeIdsOfTier(tierId));
}

/** A whole recorded board, every tier on it — what the hash from a week page
 *  asks for. */
export function addRigBoard(doc: CanvasDoc, built: CanvasDoc, boardId: ID): CanvasDoc {
  return addRigNodes(
    doc,
    built,
    built.nodes.filter((node) => node.boardId === boardId).map((node) => node.id),
  );
}

/** What a desk run leaves on the board while the rig looks its answer up. It
 *  takes the take's own id and the take's own slot, so nothing moves when the
 *  clip arrives — the placeholder is the take, before it has a picture. */
export function beginReplay(doc: CanvasDoc, built: CanvasDoc, tierId: string): { doc: CanvasDoc; nodeId: ID } {
  const nodeId = `${tierId}-take`;
  const next = addTier(doc, built, tierId);
  const take = next.nodes.find((node) => node.id === nodeId);
  if (!take || take.type !== "take") return { doc: next, nodeId };

  const placeholder: PlaceholderNode = {
    id: take.id,
    boardId: take.boardId,
    type: "placeholder",
    x: take.x,
    y: take.y,
    w: take.w,
    h: take.h,
    locked: take.locked,
    origin: take.origin,
    expectedAspect: take.naturalW / take.naturalH,
    resolvesTo: take.id,
  };

  return { doc: { ...next, nodes: next.nodes.map((node) => (node.id === nodeId ? placeholder : node)) }, nodeId };
}

export function completeReplay(doc: CanvasDoc, built: CanvasDoc, tierId: string): CanvasDoc {
  const nodeId = `${tierId}-take`;
  const take = built.nodes.find((node) => node.id === nodeId);
  if (!take) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === nodeId && node.type === "placeholder"
        ? { ...take, boardId: node.boardId, x: node.x, y: node.y, w: node.w, h: node.h }
        : node,
    ),
  };
}

/**
 * "Load the whole rig": the built document, exactly as §3 laid it out. Boards
 * the visitor made themselves survive — walked clear of the strip rather than
 * dropped — but recorded cards they had dragged into one go home, because the
 * rig they just asked for holds every recorded card already and two cards
 * showing one file is the one thing this canvas must never do.
 */
export function loadWholeRig(doc: CanvasDoc, built: CanvasDoc): CanvasDoc {
  const rigBoards = new Set(built.boards.map((board) => board.id));
  const rigNodes = new Set(built.nodes.map((node) => node.id));

  const next: CanvasDoc = {
    boards: [...built.boards],
    nodes: [...built.nodes],
    edges: [...built.edges, ...doc.edges.filter((edge) => edge.kind === "desk")],
    camera: doc.camera,
    version: CANVAS_VERSION,
  };

  for (const board of doc.boards) {
    if (rigBoards.has(board.id) || board.kind !== "user") continue;
    const own = doc.nodes.filter((node) => node.boardId === board.id && !rigNodes.has(node.id));
    if (own.length === 0) continue;
    const at = placeBoard(next, board, { kind: "at", x: board.x, y: board.y });
    next.boards.push({ ...board, x: at.x, y: at.y, order: next.boards.length });
    next.nodes.push(...own.map((node) => ({ ...node, x: node.x + (at.x - board.x), y: node.y + (at.y - board.y) })));
  }

  return withEdges(built, next);
}

/** `#week-05:t3` — the anchor the week pages and the Dailies already link to.
 *  Week 11's Cut windows and week 10's episode carry their board's own key
 *  rather than a tier number, which is why the second half is taken verbatim
 *  when it already names a board. */
const HASH_PATTERN = /^#?week-(\d{2}):(.+)$/;

export interface HashTarget {
  boardId: ID;
  nodeId: ID;
  tierId: string;
  week: number;
}

export function hashTarget(hash: string, built: CanvasDoc): HashTarget | undefined {
  const match = HASH_PATTERN.exec(hash);
  if (!match) return undefined;
  const tier = match[2];
  const tierId = tier.startsWith("week") ? tier : `week${match[1]}-${tier}`;
  const nodeId = `${tierId}-take`;
  const boardId = boardIdOfTier(built, tierId);
  if (!boardId) return undefined;
  return { boardId, nodeId, tierId, week: Number(match[1]) };
}

/**
 * What the visitor had last time. The built rig is still the authority on what
 * a recorded card *is*; storage only says which of them were on the canvas and
 * where everything sat. Nothing stored at all is an empty canvas, which is
 * also what a first visit gets.
 */
export function restoreSession(
  built: CanvasDoc,
  stored: StoredShape | undefined,
  options: MergeOptions,
): CanvasDoc {
  if (!stored) return emptyCanvasDoc();

  const ids = (raw: unknown[] | undefined): Set<string> =>
    new Set(
      (raw ?? []).flatMap((entry) =>
        typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string"
          ? [(entry as { id: string }).id]
          : [],
      ),
    );

  const storedBoards = ids(stored.boards);
  const storedNodes = ids(stored.nodes);

  const present: CanvasDoc = {
    ...built,
    boards: built.boards.filter((board) => storedBoards.has(board.id)),
    nodes: built.nodes.filter((node) => storedNodes.has(node.id)),
    edges: [],
  };

  return withEdges(built, mergeStoredDoc(present, stored, options));
}
