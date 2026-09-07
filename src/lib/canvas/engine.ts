// The seam between the canvas document and whatever draws it. Everything
// below the CanvasEngine interface is a pure document mutation — no DOM, no
// React Flow — and the two things that genuinely need the renderer (the
// viewport and the selection) go through a small port the island supplies.
//
// Swapping React Flow out means writing a new ViewportPort and a new set of
// node components. The desk, the layout module and every document rule here
// stay exactly as they are.

import {
  BOARD_GAP,
  deskBoardTitle,
  growBoard,
  layoutBoard,
  nextUserBoardTitle,
  NODE_W,
  placeBoard,
  wrapNodes,
  type PlaceAnchor,
  type PlacedItem,
  type Rect,
} from "./layout";
import type { Board, CanvasDoc, Edge, ID, Node, Origin, PlaceholderNode, TakeNode } from "./types";

export interface Move {
  id: ID;
  x: number;
  y: number;
}

export interface ViewportPort {
  fitView(): void;
  zoomTo(zoom: number): void;
  setSelection(ids: ID[]): void;
  panTo(x: number, y: number): void;
}

export interface CanvasEngine {
  fitAll(): void;
  zoomTo(zoom: number): void;
  select(ids: ID[]): void;
  move(moves: Move[]): void;
  reparent(nodeIds: ID[], boardId: ID): void;
  createBoard(nodeIds: ID[], at?: { x: number; y: number }): ID | undefined;
  serialize(): CanvasDoc;
  load(doc: CanvasDoc): void;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

function boardOf(doc: CanvasDoc, id: ID): Board | undefined {
  return doc.boards.find((board) => board.id === id);
}

/** A node's position on the canvas rather than inside its board. */
export function worldRect(doc: CanvasDoc, node: Node): Rect {
  const board = boardOf(doc, node.boardId);
  return { x: (board?.x ?? 0) + node.x, y: (board?.y ?? 0) + node.y, w: node.w, h: node.h };
}

/** Which board a dropped card belongs to: the one it covers most of, or none
 *  if it is clear of every board.
 *
 *  This is deliberately an overlap test rather than a test on the card's
 *  centre. With the centre test, a card let go of half over a board counted as
 *  outside it, so it got a board of its own — a board whose rectangle then
 *  overlapped the one the card was sitting on, which §3's "shift right by 120
 *  until it does not" walked past all ten recorded boards. Measured in Chrome:
 *  a drop at world x 500 put Board 1 at x 11229. Deciding by overlap means a
 *  card that touches a board joins it, and a card that touches nothing gets a
 *  board that collides with nothing. */
export function boardUnder(doc: CanvasDoc, rect: Rect): Board | undefined {
  let best: { board: Board; area: number } | undefined;

  for (const board of doc.boards) {
    const width = Math.min(rect.x + rect.w, board.x + board.w) - Math.max(rect.x, board.x);
    const height = Math.min(rect.y + rect.h, board.y + board.h) - Math.max(rect.y, board.y);
    if (width <= 0 || height <= 0) continue;
    const area = width * height;
    // >= so that a user board dropped over a recorded one, which is later in
    // the list, wins a tie: it is the one on top.
    if (!best || area >= best.area) best = { board, area };
  }

  return best?.board;
}

/** Moves nodes inside their own board, growing the board to keep them in it. */
export function moveNodes(doc: CanvasDoc, moves: Move[]): CanvasDoc {
  if (moves.length === 0) return doc;
  const byId = new Map(moves.map((move) => [move.id, move]));

  const nodes = doc.nodes.map((node) => {
    const move = byId.get(node.id);
    return move ? { ...node, x: move.x, y: move.y } : node;
  });

  const touched = new Set(
    moves.flatMap((move) => {
      const node = nodes.find((candidate) => candidate.id === move.id);
      return node ? [node.boardId] : [];
    }),
  );

  const boards = doc.boards.map((board) => {
    if (!touched.has(board.id)) return board;
    const items = nodes.filter((node) => node.boardId === board.id);
    return { ...board, ...growBoard(board, items) };
  });

  // growBoard can push a board's own origin left or up; its nodes are stored
  // relative to that origin, so they move with it unless they are corrected.
  const corrected = nodes.map((node) => {
    const before = doc.boards.find((board) => board.id === node.boardId);
    const after = boards.find((board) => board.id === node.boardId);
    if (!before || !after) return node;
    return { ...node, x: node.x + (before.x - after.x), y: node.y + (before.y - after.y) };
  });

  return { ...doc, boards, nodes: corrected };
}

/** A node dropped inside a different board joins it, keeping the place on
 *  screen where it was let go of. */
export function reparentNodes(doc: CanvasDoc, nodeIds: ID[], targetBoardId: ID): CanvasDoc {
  const target = boardOf(doc, targetBoardId);
  if (!target) return doc;

  const moved = new Set(nodeIds);
  const nodes = doc.nodes.map((node) => {
    if (!moved.has(node.id) || node.boardId === targetBoardId) return node;
    const world = worldRect(doc, node);
    return { ...node, boardId: targetBoardId, x: world.x - target.x, y: world.y - target.y };
  });

  const items = nodes.filter((node) => node.boardId === targetBoardId);
  const grown = growBoard(target, items);
  const boards = doc.boards.map((board) => (board.id === targetBoardId ? { ...board, ...grown } : board));
  const shift = { x: target.x - grown.x, y: target.y - grown.y };

  const corrected = nodes.map((node) =>
    node.boardId === targetBoardId ? { ...node, x: node.x + shift.x, y: node.y + shift.y } : node,
  );

  return { ...doc, boards, nodes: corrected };
}

/** A node — or a whole selection — dropped outside every board gets a board
 *  of its own, wrapped where it landed and walked clear of anything it
 *  overlaps. */
export function createBoardFor(doc: CanvasDoc, nodeIds: ID[], at?: { x: number; y: number }): { doc: CanvasDoc; boardId?: ID } {
  const moving = doc.nodes.filter((node) => nodeIds.includes(node.id));
  if (moving.length === 0) return { doc };

  const dropped: PlacedItem[] = moving.map((node) => {
    const world = worldRect(doc, node);
    return { id: node.id, x: world.x, y: world.y, w: node.w, h: node.h };
  });

  // `at` moves the whole group so its first node lands there, keeping the
  // selection's internal spacing; without it the nodes are already where the
  // drag left them.
  const anchored = at
    ? dropped.map((item) => ({ ...item, x: at.x + (item.x - dropped[0].x), y: at.y + (item.y - dropped[0].y) }))
    : dropped;

  // The collision walk is run against what the visitor actually dropped, not
  // against the board that will be wrapped around it. The wrap adds 68 above
  // the card for the padding and the title bar, so a card let go of 40 below
  // a board still clips it — and with ten recorded boards in a row, "shift
  // right by 120 until it does not" then walks the new board past all ten,
  // roughly 11,000 units from where the pointer was. Measured, in Chrome:
  // Board 1 landed at x 11229 for a drop at x 500.
  const bounds = {
    x: Math.min(...anchored.map((item) => item.x)),
    y: Math.min(...anchored.map((item) => item.y)),
    w: Math.max(...anchored.map((item) => item.x + item.w)) - Math.min(...anchored.map((item) => item.x)),
    h: Math.max(...anchored.map((item) => item.y + item.h)) - Math.min(...anchored.map((item) => item.y)),
  };
  const cleared = placeBoard(doc, bounds, { kind: "at", x: bounds.x, y: bounds.y });
  const shift = cleared.x - bounds.x;
  const wrapped = wrapNodes(anchored.map((item) => ({ ...item, x: item.x + shift })));

  const boardId = `board-${doc.boards.length + 1}-${Date.now().toString(36)}`;
  const board: Board = {
    id: boardId,
    title: nextUserBoardTitle(doc.boards),
    x: wrapped.x,
    y: wrapped.y,
    w: wrapped.w,
    h: wrapped.h,
    kind: "user",
    order: doc.boards.length,
  };

  const local = new Map(wrapped.positions.map((position) => [position.id, position]));
  const nodes = doc.nodes.map((node) => {
    const position = local.get(node.id);
    if (!position) return node;
    return { ...node, boardId, x: position.x, y: position.y, origin: node.origin.kind === "manifest" ? node.origin : { kind: "drag" as const } };
  });

  return { doc: { ...doc, boards: [...doc.boards, board], nodes }, boardId };
}

/** Re-runs a board's grid over whatever is on it now, in its current order,
 *  and resizes the board to match — the layout a recorded board arrives with,
 *  restored. */
export function relayoutBoard(doc: CanvasDoc, boardId: ID): CanvasDoc {
  const board = boardOf(doc, boardId);
  if (!board) return doc;
  const items = doc.nodes.filter((node) => node.boardId === boardId);
  const layout = layoutBoard(items.map((node) => ({ id: node.id, naturalW: node.w, naturalH: node.h })));
  const local = new Map(layout.positions.map((position) => [position.id, position]));

  return {
    ...doc,
    boards: doc.boards.map((candidate) =>
      candidate.id === boardId ? { ...candidate, w: layout.w, h: layout.h } : candidate,
    ),
    nodes: doc.nodes.map((node) => {
      const position = local.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : node;
    }),
  };
}

/** A recorded node always knows where it belongs: its origin names the week,
 *  and the week names the board. */
function homeBoardOf(node: Node): ID | undefined {
  if (node.origin.kind !== "manifest") return undefined;
  const { week } = node.origin;
  if (week === 11) return "cut";
  if (week === 10) return "reference";
  return `week-${String(week).padStart(2, "0")}`;
}

/** Only what a visitor made can be deleted; the recorded material is the
 *  point of the canvas and stays on it. Pressing Delete on a recorded node,
 *  or on a user board holding one, sends it home to the board it came off
 *  instead — which is also the only way back once a node has been dragged
 *  out. */
export function deleteObjects(doc: CanvasDoc, nodeIds: ID[], boardIds: ID[]): CanvasDoc {
  const removableBoards = new Set(
    doc.boards.filter((board) => boardIds.includes(board.id) && board.kind === "user").map((board) => board.id),
  );

  const goingHome = doc.nodes.filter(
    (node) => node.origin.kind === "manifest" && (removableBoards.has(node.boardId) || nodeIds.includes(node.id)),
  );

  let next = doc;
  const touched = new Set<ID>();
  for (const node of goingHome) {
    const home = homeBoardOf(node);
    if (!home || home === node.boardId) continue;
    next = {
      ...next,
      nodes: next.nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, boardId: home } : candidate)),
    };
    touched.add(home);
  }
  for (const home of touched) next = relayoutBoard(next, home);

  const removableNodes = new Set(
    next.nodes
      .filter((node) => node.origin.kind !== "manifest" && (nodeIds.includes(node.id) || removableBoards.has(node.boardId)))
      .map((node) => node.id),
  );

  const nodes = next.nodes.filter((node) => !removableNodes.has(node.id));
  const boards = next.boards.filter((board) => !removableBoards.has(board.id));
  const edges = next.edges.filter((edge) => !removableNodes.has(edge.from) && !removableNodes.has(edge.to));

  return { ...next, nodes, boards, edges };
}

export function renameBoard(doc: CanvasDoc, boardId: ID, title: string): CanvasDoc {
  const trimmed = title.trim();
  if (!trimmed) return doc;
  return {
    ...doc,
    boards: doc.boards.map((board) => (board.id === boardId && board.kind === "user" ? { ...board, title: trimmed } : board)),
  };
}

/** "Fit board": shrink a board back onto its content. */
export function fitBoardToContent(doc: CanvasDoc, boardId: ID): CanvasDoc {
  const board = boardOf(doc, boardId);
  if (!board) return doc;
  const items = doc.nodes.filter((node) => node.boardId === boardId);
  const world = items.map((node) => ({ id: node.id, x: board.x + node.x, y: board.y + node.y, w: node.w, h: node.h }));
  const wrapped = wrapNodes(world);
  const local = new Map(wrapped.positions.map((position) => [position.id, position]));

  return {
    ...doc,
    boards: doc.boards.map((candidate) =>
      candidate.id === boardId ? { ...candidate, x: wrapped.x, y: wrapped.y, w: wrapped.w, h: wrapped.h } : candidate,
    ),
    nodes: doc.nodes.map((node) => {
      const position = local.get(node.id);
      return position ? { ...node, x: position.x, y: position.y } : node;
    }),
  };
}

export interface DeskGenerationRequest {
  /** A stable id for the node and the board; the caller owns it so the
   *  progress updates and the completion can find them again. */
  id: string;
  refNodeIds: ID[];
  prompt: string;
  at: Date;
  /** The size of the take this will become, so the placeholder is already
   *  the right shape and nothing on the board moves when the clip arrives. */
  naturalW: number;
  naturalH: number;
  /** The recorded take being replayed. */
  resolvesTo: ID;
}

/** Opens a board for a desk generation and puts a placeholder on it, with an
 *  edge from every reference. §3: under the board that holds all the
 *  references, or past the rightmost one when they span boards. */
export function beginDeskGeneration(
  doc: CanvasDoc,
  request: DeskGenerationRequest,
): { doc: CanvasDoc; nodeId: ID; boardId: ID } {
  const boardIds = new Set(
    request.refNodeIds.flatMap((id) => {
      const node = doc.nodes.find((candidate) => candidate.id === id);
      return node ? [node.boardId] : [];
    }),
  );

  const nodeId = `desk-${request.id}`;
  const boardId = `desk-board-${request.id}`;
  const height = Math.round((NODE_W * request.naturalH) / request.naturalW);
  const layout = layoutBoard([{ id: nodeId, naturalW: request.naturalW, naturalH: request.naturalH }]);

  const anchor: PlaceAnchor =
    boardIds.size === 1 ? { kind: "below", boardId: [...boardIds][0] } : { kind: "right-of-all" };
  const placed = placeBoard(doc, layout, anchor);

  const board: Board = {
    id: boardId,
    title: deskBoardTitle(request.prompt, request.at),
    x: placed.x,
    y: placed.y,
    w: layout.w,
    h: layout.h,
    kind: "user",
    order: doc.boards.length,
  };

  const origin: Origin = {
    kind: "desk",
    refNodeIds: request.refNodeIds,
    prompt: request.prompt,
    at: request.at.toISOString(),
  };

  const placeholder: PlaceholderNode = {
    id: nodeId,
    boardId,
    type: "placeholder",
    x: layout.positions[0].x,
    y: layout.positions[0].y,
    w: NODE_W,
    h: height,
    locked: false,
    origin,
    expectedAspect: request.naturalW / request.naturalH,
    resolvesTo: request.resolvesTo,
  };

  const edges: Edge[] = request.refNodeIds.map((from) => ({
    id: `desk-${request.id}-${from}`,
    from,
    to: nodeId,
    kind: "desk",
    label: "reference",
  }));

  return {
    doc: { ...doc, boards: [...doc.boards, board], nodes: [...doc.nodes, placeholder], edges: [...doc.edges, ...edges] },
    nodeId,
    boardId,
  };
}

export interface ResolvedTake {
  media: "image" | "video";
  file: string;
  poster?: string;
  naturalW: number;
  naturalH: number;
  tierId: string;
  takeId: string;
}

/** Swaps the placeholder for the take the rig recorded. Same node id, so the
 *  edges drawn from each reference at the start are the edges that end up on
 *  the finished take. */
export function completeDeskGeneration(doc: CanvasDoc, nodeId: ID, take: ResolvedTake): CanvasDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.id !== nodeId || node.type !== "placeholder") return node;
      const { expectedAspect: _aspect, resolvesTo: _resolves, ...base } = node;
      return { ...base, type: "take", ...take } satisfies TakeNode;
    }),
  };
}

export function addEdges(doc: CanvasDoc, edges: Edge[]): CanvasDoc {
  const existing = new Set(doc.edges.map((edge) => edge.id));
  return { ...doc, edges: [...doc.edges, ...edges.filter((edge) => !existing.has(edge.id))] };
}

export interface EngineHost {
  getDoc(): CanvasDoc;
  setDoc(doc: CanvasDoc): void;
  viewport: ViewportPort;
}

export function createCanvasEngine(host: EngineHost): CanvasEngine {
  return {
    fitAll() {
      host.viewport.fitView();
    },
    zoomTo(zoom) {
      host.viewport.zoomTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)));
    },
    select(ids) {
      host.viewport.setSelection(ids);
    },
    move(moves) {
      host.setDoc(moveNodes(host.getDoc(), moves));
    },
    reparent(nodeIds, boardId) {
      host.setDoc(reparentNodes(host.getDoc(), nodeIds, boardId));
    },
    createBoard(nodeIds, at) {
      const result = createBoardFor(host.getDoc(), nodeIds, at);
      host.setDoc(result.doc);
      return result.boardId;
    },
    serialize() {
      return host.getDoc();
    },
    load(doc) {
      host.setDoc(doc);
    },
  };
}

export { BOARD_GAP };
