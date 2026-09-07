// Every number the canvas places is decided here, and only here. The engine
// adapter asks for positions and draws them; it never invents geometry of its
// own. That is what makes the layout testable to the unit against fixtures
// (spec/studio-canvas.test.ts) without a browser.

import type { Board, CanvasDoc, ID } from "./types";

/** A node card is always this wide in world units; the height follows the
 *  aspect of whatever it is showing. */
export const NODE_W = 320;
/** A text card (a seed, a prompt, a workflow graph) has no aspect of its own. */
export const TEXT_NODE_H = 180;
export const GAP = 24;
export const BOARD_PADDING = 32;
export const TITLE_BAR = 36;
/** Boards never touch: this is the clearance between them, in every direction
 *  a board is placed and the step a collision is resolved by. */
export const BOARD_GAP = 120;

export interface LayoutItem {
  id: ID;
  /** Pixel size of the recorded file. Omit both for a text card. */
  naturalW?: number;
  naturalH?: number;
}

export interface PlacedItem {
  id: ID;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayout {
  w: number;
  h: number;
  positions: PlacedItem[];
}

/** n ≤ 4 → one row; 5–9 → three columns; 10 and up → four. A ladder of five
 *  takes reads as 3 + 2, not as a five-wide strip nothing can see at once. */
export function columnsFor(count: number): number {
  if (count <= 0) return 1;
  if (count <= 4) return count;
  if (count <= 9) return 3;
  return 4;
}

export function nodeHeight(item: LayoutItem): number {
  if (!item.naturalW || !item.naturalH) return TEXT_NODE_H;
  return Math.round((NODE_W * item.naturalH) / item.naturalW);
}

/** Lays a board's nodes out as a grid, in the order given, and reports the
 *  box that holds them. Positions are board-local: (0, 0) is the board's own
 *  top-left corner, so the title bar and the padding are already inside the
 *  numbers a child node gets. */
export function layoutBoard(items: LayoutItem[]): BoardLayout {
  if (items.length === 0) {
    return { w: BOARD_PADDING * 2, h: TITLE_BAR + BOARD_PADDING * 2, positions: [] };
  }

  const cols = columnsFor(items.length);
  const heights = items.map(nodeHeight);
  const rowCount = Math.ceil(items.length / cols);

  // Row height is the tallest card in that row: a row of mixed aspects lines
  // its next row up under the tallest one, so no card ever overlaps another.
  const rowHeights: number[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const slice = heights.slice(row * cols, row * cols + cols);
    rowHeights.push(Math.max(...slice));
  }

  const rowTops: number[] = [];
  let cursor = TITLE_BAR + BOARD_PADDING;
  for (const height of rowHeights) {
    rowTops.push(cursor);
    cursor += height + GAP;
  }

  const positions = items.map((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      id: item.id,
      x: BOARD_PADDING + col * (NODE_W + GAP),
      y: rowTops[row],
      w: NODE_W,
      h: heights[index],
    };
  });

  const w = BOARD_PADDING * 2 + cols * NODE_W + (cols - 1) * GAP;
  const contentH = rowHeights.reduce((sum, height) => sum + height, 0) + (rowCount - 1) * GAP;
  const h = TITLE_BAR + BOARD_PADDING * 2 + contentH;

  return { w, h, positions };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export type PlaceAnchor =
  /** The next recorded board in the row: past everything, tops aligned. */
  | { kind: "row" }
  /** A desk generation, under the one board that holds all its references. */
  | { kind: "below"; boardId: ID }
  /** A desk generation whose references span boards: past the rightmost one. */
  | { kind: "right-of-all" }
  /** A drag-out, wrapping the node where the visitor let go of it. */
  | { kind: "at"; x: number; y: number };

type Placeable = Pick<Board, "w" | "h">;
type DocBoards = Pick<CanvasDoc, "boards">;

function rightmost(boards: Board[]): Board | undefined {
  return boards.reduce<Board | undefined>(
    (best, board) => (!best || board.x + board.w > best.x + best.w ? board : best),
    undefined,
  );
}

function anchorPoint(doc: DocBoards, anchor: PlaceAnchor): { x: number; y: number } {
  const { boards } = doc;

  if (anchor.kind === "at") return { x: anchor.x, y: anchor.y };

  if (anchor.kind === "below") {
    const source = boards.find((board) => board.id === anchor.boardId);
    if (!source) return { x: 0, y: 0 };
    return { x: source.x, y: source.y + source.h + BOARD_GAP };
  }

  const last = rightmost(boards);
  if (!last) return { x: 0, y: 0 };

  if (anchor.kind === "right-of-all") {
    return { x: last.x + last.w + BOARD_GAP, y: last.y };
  }

  // "row": recorded boards run left to right with their tops aligned to the
  // first board placed, not to whichever one happens to be furthest right.
  const top = boards.reduce((min, board) => Math.min(min, board.y), boards[0].y);
  return { x: last.x + last.w + BOARD_GAP, y: top };
}

/** Resolves where a new board goes, then walks it right in BOARD_GAP steps
 *  until it stops overlapping anything already on the canvas. */
export function placeBoard(doc: DocBoards, board: Placeable, anchor: PlaceAnchor): { x: number; y: number } {
  const start = anchorPoint(doc, anchor);
  const candidate: Rect = { x: start.x, y: start.y, w: board.w, h: board.h };

  // A single step does not necessarily clear a board — a wide board takes
  // several — so the bound is the distance to the right of everything, not
  // the number of boards. Past that edge nothing can overlap.
  const maxRight = doc.boards.reduce((max, existing) => Math.max(max, existing.x + existing.w), start.x);
  const steps = Math.max(0, Math.ceil((maxRight - start.x) / BOARD_GAP)) + 1;

  for (let guard = 0; guard <= steps; guard += 1) {
    if (!doc.boards.some((existing) => overlaps(candidate, existing))) break;
    candidate.x += BOARD_GAP;
  }

  return { x: candidate.x, y: candidate.y };
}

export interface DroppedItem extends PlacedItem {}

export interface WrappedBoard {
  x: number;
  y: number;
  w: number;
  h: number;
  positions: PlacedItem[];
}

/** A node (or a multi-selection) dropped outside every board gets a board of
 *  its own, wrapped around where it landed with the same padding and title
 *  bar layoutBoard uses — so a user board and a recorded board have identical
 *  geometry, and nothing jumps at the moment the board appears. */
export function wrapNodes(items: DroppedItem[]): WrappedBoard {
  if (items.length === 0) {
    return { x: 0, y: 0, w: BOARD_PADDING * 2, h: TITLE_BAR + BOARD_PADDING * 2, positions: [] };
  }

  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.w));
  const maxY = Math.max(...items.map((item) => item.y + item.h));

  const x = minX - BOARD_PADDING;
  const y = minY - TITLE_BAR - BOARD_PADDING;
  const w = maxX - minX + BOARD_PADDING * 2;
  const h = maxY - minY + TITLE_BAR + BOARD_PADDING * 2;

  return {
    x,
    y,
    w,
    h,
    positions: items.map((item) => ({ id: item.id, x: item.x - x, y: item.y - y, w: item.w, h: item.h })),
  };
}

/** Boards only grow. A node dragged toward an edge pushes that edge out;
 *  nothing shrinks until "Fit board" asks for it. */
export function growBoard(board: Rect, items: PlacedItem[]): Rect {
  let { x, y, w, h } = board;

  for (const item of items) {
    const left = item.x;
    const top = item.y;
    const right = item.x + item.w + BOARD_PADDING;
    const bottom = item.y + item.h + BOARD_PADDING;
    if (left < BOARD_PADDING) {
      const shift = BOARD_PADDING - left;
      x -= shift;
      w += shift;
    }
    if (top < TITLE_BAR + BOARD_PADDING) {
      const shift = TITLE_BAR + BOARD_PADDING - top;
      y -= shift;
      h += shift;
    }
    if (right > w) w = right;
    if (bottom > h) h = bottom;
  }

  return { x, y, w, h };
}

/** "Fit board": the smallest box that still holds every node with the board's
 *  own padding, returned with the nodes' new board-local positions. */
export function fitBoard(board: Rect, items: PlacedItem[]): WrappedBoard {
  if (items.length === 0) {
    return { x: board.x, y: board.y, w: BOARD_PADDING * 2, h: TITLE_BAR + BOARD_PADDING * 2, positions: [] };
  }
  const world = items.map((item) => ({ ...item, x: item.x + board.x, y: item.y + board.y }));
  return wrapNodes(world);
}

/** `Board 1`, `Board 2`, … counted over the user boards already on the canvas. */
export function nextUserBoardTitle(boards: Board[]): string {
  return `Board ${boards.filter((board) => board.kind === "user").length + 1}`;
}

/** A desk board is titled by what was asked for and when: the prompt's first
 *  twenty characters, then the clock. */
export function deskBoardTitle(prompt: string, at: Date): string {
  const head = prompt.trim().slice(0, 20);
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${head} · ${hh}:${mm}`;
}
