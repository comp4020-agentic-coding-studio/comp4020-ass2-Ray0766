// Ladder marks: which boards are a week's ladder, what rung each card sits on,
// and which phase colour the title bar fills with.
//
// The point of the check is the negative case. Numbering the cards on a board
// the visitor assembled out of three different weeks would be a claim about a
// progression that is not there, and it is exactly the kind of thing that
// looks right in a screenshot.

import { describe, expect, it } from "vitest";
import { canvasBundle } from "../src/lib/canvas/build";
import { boardPhase, boardWeek, ladderOrder, ladderRungs } from "../src/lib/canvas/ladder";
import { createBoardFor } from "../src/lib/canvas/engine";
import { addRigBoard, addTier, emptyCanvasDoc, loadWholeRig } from "../src/lib/canvas/session";
import { phaseForWeek } from "../src/lib/phases";
import type { CanvasDoc } from "../src/lib/canvas/types";

const built = canvasBundle.doc;

// Seen red by having `boardWeek` return the first card's week instead of the
// week they all share (dropping the `else if (week !== …) return undefined`):
//   AssertionError: a board of cards from three weeks is not a ladder:
//   expected 5 to be undefined
// then reverted.
describe("a one-week board is a ladder and a mixed board is not", () => {
  it("orders week 2's takes by tier and marks each rung", () => {
    const doc = addRigBoard(emptyCanvasDoc(), built, "week-02");

    expect(boardWeek(doc, "week-02")).toBe(2);
    expect(ladderOrder(doc, "week-02")).toEqual([
      "week02-t1-take",
      "week02-t2-take",
      "week02-t3-take",
      "week02-t4-take",
      "week02-t5-take",
    ]);

    const rungs = ladderRungs(doc, "week-02");
    expect(rungs.get("week02-t1-take")).toBe("t1");
    expect(rungs.get("week02-t5-take")).toBe("t5");
    // The input card of a tier sits on the same rung as its take: they are one
    // step of the ladder seen from either end.
    expect(rungs.get("week02-t3-input")).toBe("t3");
  });

  it("marks the manifest's own counter-example, and only that one", () => {
    const flagged = built.nodes.filter(
      (node) => node.type === "take" && canvasBundle.meta[node.id]?.counterExample === true,
    );
    expect(flagged.length, "the manifests declare at least one counter-example").toBeGreaterThan(0);

    // Every flagged take is on a ladder board, so the tag and the rung appear
    // together rather than the tag floating on an unnumbered card.
    for (const node of flagged) {
      const doc = addRigBoard(emptyCanvasDoc(), built, node.boardId);
      expect(ladderRungs(doc, node.boardId).has(node.id), `${node.id} carries a rung`).toBe(true);
    }
  });

  it("numbers nothing on a board the visitor assembled from three weeks", () => {
    const grown = ["week05-t3", "week02-t1", "week09-t1"].reduce(
      (doc, tierId) => addTier(doc, built, tierId),
      emptyCanvasDoc(),
    );
    const dragged = createBoardFor(grown, ["week05-t3-take", "week02-t1-take", "week09-t1-take"], {
      x: 4000,
      y: 2000,
    });
    const boardId = dragged.boardId as string;

    expect(boardWeek(dragged.doc, boardId), "a board of cards from three weeks is not a ladder").toBeUndefined();
    expect([...ladderRungs(dragged.doc, boardId).keys()], "a mixed board numbers nothing").toEqual([]);
    expect(ladderOrder(dragged.doc, boardId)).toEqual([]);
    expect(boardPhase(dragged.doc, boardId)).toBeUndefined();
  });

  it("the Cut and the reference episode are boards, not ladders", () => {
    const doc = loadWholeRig(emptyCanvasDoc(), built);
    // They are one week's material, so they take a phase colour…
    expect(boardWeek(doc, "cut")).toBe(11);
    expect(boardPhase(doc, "cut")).toBe("episode");
    // …but their windows and segments are not rungs, so nothing is numbered.
    expect([...ladderRungs(doc, "cut").keys()]).toEqual([]);
    expect([...ladderRungs(doc, "reference").keys()]).toEqual([]);
  });
});

// Seen red by mapping every board to the "rig" phase
// (`return "rig"` at the top of boardPhase):
//   AssertionError: week 3 is in the generators phase: expected 'rig' to be
//   'generators'
//   AssertionError: expected 'rig' to be 'episode'
// — twelve of the fifteen, then reverted.
describe("a board's title bar fills with its week's phase", () => {
  const doc: CanvasDoc = loadWholeRig(emptyCanvasDoc(), built);

  for (const board of built.boards) {
    const week = board.week;
    if (week === undefined) continue;
    it(`${board.id} is in the ${phaseForWeek(week).key} phase`, () => {
      expect(boardPhase(doc, board.id), `week ${week} is in the ${phaseForWeek(week).key} phase`).toBe(
        phaseForWeek(week).key,
      );
    });
  }

  it("covers all four phases across the rig", () => {
    const phases = new Set(built.boards.flatMap((board) => {
      const phase = boardPhase(doc, board.id);
      return phase ? [phase] : [];
    }));
    expect([...phases].sort()).toEqual(["episode", "generators", "holding", "rig"]);
  });
});
