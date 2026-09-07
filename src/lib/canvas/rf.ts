// The adapter between the canvas document and React Flow's own node/edge
// shapes. It is the only file that knows both vocabularies: everything above
// it works in CanvasDoc terms, everything below it is the engine's business.

import type { Edge as RfEdge, Node as RfNode } from "@xyflow/react";
import type { CanvasDoc, Edge, Node, NodeMeta } from "./types";

export interface BoardData extends Record<string, unknown> {
  title: string;
  kind: "recorded" | "user";
  week?: number;
  /** How many takes are on it, so the title bar knows whether there is
   *  anything to compare. */
  takes: number;
}

export interface CardData extends Record<string, unknown> {
  node: Node;
  meta: NodeMeta;
}

/** React Flow ships built-in node types called `input`, `output`, `default`
 *  and `group`, and its stylesheet styles `.react-flow__node-<type>`. A
 *  custom type named `input` inherits that styling — a white pane with a
 *  border, drawn behind every prompt card. Prefixing keeps the document's own
 *  vocabulary (`input`, `take`, `placeholder`) and stays clear of theirs. */
export const RF_TYPE = {
  board: "studioBoard",
  input: "studioInput",
  take: "studioTake",
  placeholder: "studioPlaceholder",
} as const;

export type RfBoardNode = RfNode<BoardData, "studioBoard">;
export type RfCardNode = RfNode<CardData, "studioTake" | "studioInput" | "studioPlaceholder">;
export type StudioRfNode = RfBoardNode | RfCardNode;

/** Boards first: React Flow needs a parent to exist before its children. */
export function toRfNodes(doc: CanvasDoc, meta: Record<string, NodeMeta>, readOnly: boolean): StudioRfNode[] {
  const boards: StudioRfNode[] = doc.boards.map((board) => ({
    id: board.id,
    type: RF_TYPE.board,
    position: { x: board.x, y: board.y },
    data: {
      title: board.title,
      kind: board.kind,
      week: board.week,
      takes: doc.nodes.filter((node) => node.boardId === board.id && node.type === "take").length,
    },
    width: board.w,
    height: board.h,
    draggable: !readOnly,
    selectable: true,
    // Three layers, and they have to be explicit: React Flow paints its edge
    // SVG below `.react-flow__nodes` in the DOM, so a board pane at the same
    // z-index as the edges covers every edge that crosses it — which, since
    // every lineage edge runs between two cards on a board, was all of them.
    zIndex: 0,
    className: `studio-board studio-board--${board.kind}`,
  }));

  const cards: StudioRfNode[] = doc.nodes.map((node) => ({
    id: node.id,
    type: RF_TYPE[node.type],
    parentId: node.boardId,
    position: { x: node.x, y: node.y },
    data: { node, meta: meta[node.id] ?? {} },
    width: node.w,
    height: node.h,
    // extent: "parent" is deliberately not set — it would make dragging a
    // node out of its board impossible, and dragging out is how a visitor
    // makes a board of their own (spec §7).
    draggable: !readOnly,
    selectable: true,
    zIndex: 2,
  }));

  return [...boards, ...cards];
}

function worldX(doc: CanvasDoc, nodeId: string): number {
  const node = doc.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return 0;
  const board = doc.boards.find((candidate) => candidate.id === node.boardId);
  return (board?.x ?? 0) + node.x;
}

/** Handles are picked from where the two cards actually are, so an edge that
 *  runs back up the canvas (the two takes that share a file live boards
 *  apart) leaves the right-hand side and arrives on the left, instead of
 *  looping around the card it starts on. */
function handlesFor(doc: CanvasDoc, edge: Edge): { sourceHandle: string; targetHandle: string } {
  if (edge.kind === "desk") return { sourceHandle: "s-bottom", targetHandle: "t-top" };
  return worldX(doc, edge.from) > worldX(doc, edge.to)
    ? { sourceHandle: "s-left", targetHandle: "t-right" }
    : { sourceHandle: "s-right", targetHandle: "t-left" };
}

export function toRfEdges(doc: CanvasDoc, showSources: boolean): RfEdge[] {
  if (!showSources) return [];

  return doc.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    ...handlesFor(doc, edge),
    type: "default",
    zIndex: 1,
    focusable: false,
    selectable: false,
    className: `studio-edge studio-edge--${edge.kind}`,
    labelShowBg: false,
  }));
}
