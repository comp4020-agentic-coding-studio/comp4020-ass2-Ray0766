// Guards the lineage canvas: the pure layout module (src/lib/canvas/layout.ts)
// against its fixtures, and the build-time manifest -> CanvasDoc conversion
// (src/lib/canvas/doc.ts) against the manifests it reads. Nothing here needs a
// browser; what needs a browser is listed in the receipt and driven there.
//
// Seen red, one bug at a time, each injected into the real module then
// reverted, output captured verbatim — see the block above each describe.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { layoutBoard, placeBoard, wrapNodes, type PlaceAnchor } from "../src/lib/canvas/layout";

const FIXTURE_DIR = "src/lib/canvas/fixtures";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

interface LayoutFixture {
  name: string;
  call: "layoutBoard";
  items: { id: string; naturalW?: number; naturalH?: number }[];
  expected: { w: number; h: number; positions: { id: string; x: number; y: number; w: number; h: number }[] };
}

interface PlaceFixture {
  name: string;
  call: "placeBoard";
  boards: Parameters<typeof placeBoard>[0]["boards"];
  board: { w: number; h: number };
  anchor: PlaceAnchor;
  expected: { x: number; y: number };
}

interface WrapFixture {
  name: string;
  call: "wrapNodes";
  items: { id: string; x: number; y: number; w: number; h: number }[];
  expected: {
    x: number;
    y: number;
    w: number;
    h: number;
    positions: { id: string; x: number; y: number; w: number; h: number }[];
  };
}

// Seen red: changed columnsFor's 5-9 branch from 3 to 4. Failed on
// board-five-mixed with "expected 1416 to be 1072" for the board width, and
// every position on the second row off by a column.
describe("layoutBoard places a board's nodes to the unit", () => {
  for (const file of ["board-four-takes.json", "board-five-mixed.json"]) {
    const spec = fixture<LayoutFixture>(file);
    it(spec.name, () => {
      expect(layoutBoard(spec.items)).toEqual(spec.expected);
    });
  }
});

// Seen red: made placeBoard's "below" anchor return the source board's y +
// its height with no BOARD_GAP. Failed with "expected { x: 0, y: 669 } to
// deeply equal { x: 0, y: 789 }".
describe("placeBoard resolves an anchor and clears every board it lands on", () => {
  for (const file of ["place-desk-below-source.json", "place-collision-shift.json"]) {
    const spec = fixture<PlaceFixture>(file);
    it(spec.name, () => {
      expect(placeBoard({ boards: spec.boards }, spec.board, spec.anchor)).toEqual(spec.expected);
    });
  }
});

// Seen red: dropped TITLE_BAR from the wrap's top edge, so the board would
// have opened with its title bar sitting on top of the node. Failed with
// "expected { x: 1968, y: 368, w: 728, …(2) } to deeply equal { x: 1968,
// y: 332, w: 728, …(2) }".
describe("wrapNodes builds a padded board around what was dropped", () => {
  const spec = fixture<WrapFixture>("wrap-drag-out.json");
  it(spec.name, () => {
    expect(wrapNodes(spec.items)).toEqual(spec.expected);
  });
});
