// Which boards are a week's ladder, and what rung each card sits on.
//
// A recorded week board is a ladder: five takes that differ by one thing each,
// in the order the manifest teaches them. A board the visitor assembled out of
// cards from three different weeks is not, and marking its cards `t1`…`t5`
// would be a claim about a progression that is not there. So the rungs are a
// property of the board, worked out from what is on it, rather than a label
// carried by the card.

import { phaseForWeek, type Phase } from "../phases";
import type { CanvasDoc, ID } from "./types";

/** `t1` … `t5`. The Cut's windows and the reference episode's segments carry
 *  their own keys in the same field and are not rungs on anything. */
const RUNG = /^t(\d+)$/;

/** The week every card on a board came from, or undefined when they came from
 *  more than one — or from none, which is a board of the visitor's own. */
export function boardWeek(doc: CanvasDoc, boardId: ID): number | undefined {
  let week: number | undefined;
  for (const node of doc.nodes) {
    if (node.boardId !== boardId) continue;
    if (node.origin.kind !== "manifest") return undefined;
    if (week === undefined) week = node.origin.week;
    else if (week !== node.origin.week) return undefined;
  }
  return week;
}

export function boardPhase(doc: CanvasDoc, boardId: ID): Phase["key"] | undefined {
  const week = boardWeek(doc, boardId);
  return week === undefined ? undefined : phaseForWeek(week).key;
}

/** The rung each card on a board sits on, or an empty map when the board is
 *  not one week's ladder. */
export function ladderRungs(doc: CanvasDoc, boardId: ID): Map<ID, string> {
  const rungs = new Map<ID, string>();
  if (boardWeek(doc, boardId) === undefined) return rungs;
  for (const node of doc.nodes) {
    if (node.boardId !== boardId || node.origin.kind !== "manifest") continue;
    if (RUNG.test(node.origin.tier)) rungs.set(node.id, node.origin.tier);
  }
  return rungs;
}

/** The takes of a ladder board, in tier order — which is what "Compare this
 *  board" walks and what the board's own grid lays out. */
export function ladderOrder(doc: CanvasDoc, boardId: ID): ID[] {
  const rungs = ladderRungs(doc, boardId);
  return doc.nodes
    .filter((node) => node.type === "take" && rungs.has(node.id))
    .map((node) => node.id)
    .sort((a, b) => Number(RUNG.exec(rungs.get(a) ?? "")?.[1] ?? 0) - Number(RUNG.exec(rungs.get(b) ?? "")?.[1] ?? 0));
}
