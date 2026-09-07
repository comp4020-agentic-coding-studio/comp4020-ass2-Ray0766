// The two files the Studio hands back, and the zoom the edge labels stop at.
//
// The export is checked by round trip rather than by eye: it goes out through
// the builder, back in through the loader the Studio already uses for
// localStorage, and every board has to land where it was. The validator below
// is written against src/lib/canvas/types.ts on purpose — if the document type
// grows a field, this stops agreeing with it and says so.

import { describe, expect, it } from "vitest";
import { canvasBundle } from "../src/lib/canvas/build";
import { buildCanvasExport, EXPORT_VERSION, productionLogLines, productionLogText } from "../src/lib/canvas/export";
import { edgeLabelsVisible, EDGE_LABEL_MIN_ZOOM } from "../src/lib/canvas/rf";
import { addTier, emptyCanvasDoc, restoreSession } from "../src/lib/canvas/session";
import { appendMessages, emptyThread, type RigTurn, type UserTurn } from "../src/lib/canvas/thread";
import type { Board, CanvasDoc, Edge, Node } from "../src/lib/canvas/types";

const built = canvasBundle.doc;
const MERGE = { assetPrefix: "/comp4020-ass2-Ray0766/studio/" };

// ---------------------------------------------------------------------------
// A validator written against the types, not against an example.
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === "string";

function validBoard(raw: unknown): raw is Board {
  if (!isRecord(raw)) return false;
  return (
    isString(raw.id) &&
    isString(raw.title) &&
    isNumber(raw.x) &&
    isNumber(raw.y) &&
    isNumber(raw.w) &&
    isNumber(raw.h) &&
    (raw.kind === "recorded" || raw.kind === "user") &&
    isNumber(raw.order) &&
    (raw.week === undefined || isNumber(raw.week))
  );
}

function validNode(raw: unknown): raw is Node {
  if (!isRecord(raw)) return false;
  const base =
    isString(raw.id) &&
    isString(raw.boardId) &&
    isNumber(raw.x) &&
    isNumber(raw.y) &&
    isNumber(raw.w) &&
    isNumber(raw.h) &&
    typeof raw.locked === "boolean" &&
    isRecord(raw.origin) &&
    (raw.origin.kind === "manifest" || raw.origin.kind === "desk" || raw.origin.kind === "drag");
  if (!base) return false;

  if (raw.type === "take") {
    return (
      (raw.media === "image" || raw.media === "video") &&
      isString(raw.file) &&
      isNumber(raw.naturalW) &&
      isNumber(raw.naturalH) &&
      isString(raw.tierId) &&
      isString(raw.takeId)
    );
  }
  if (raw.type === "input") return isString(raw.kind) && isString(raw.label) && isString(raw.tierId);
  if (raw.type === "placeholder") return isNumber(raw.expectedAspect) && isString(raw.resolvesTo);
  return false;
}

function validEdge(raw: unknown): raw is Edge {
  if (!isRecord(raw)) return false;
  return (
    isString(raw.id) &&
    isString(raw.from) &&
    isString(raw.to) &&
    (raw.kind === "lineage" || raw.kind === "same-file" || raw.kind === "desk") &&
    isString(raw.label)
  );
}

function validDoc(raw: unknown): raw is CanvasDoc {
  if (!isRecord(raw)) return false;
  if (raw.version !== 1) return false;
  if (!isRecord(raw.camera) || !isNumber(raw.camera.x) || !isNumber(raw.camera.y) || !isNumber(raw.camera.z)) {
    return false;
  }
  return (
    Array.isArray(raw.boards) &&
    raw.boards.every(validBoard) &&
    Array.isArray(raw.nodes) &&
    raw.nodes.every(validNode) &&
    Array.isArray(raw.edges) &&
    raw.edges.every(validEdge)
  );
}

// ---------------------------------------------------------------------------

function session() {
  const doc = ["week05-t3", "week02-t1", "week06-t4"].reduce(
    (current, tierId) => addTier(current, built, tierId),
    emptyCanvasDoc(),
  );
  const thread = appendMessages(
    emptyThread(),
    { id: "ask-1", role: "user", at: "2026-09-08T02:00:00.000Z", week: 5, tierId: "week05-t3", label: "l", kind: "prompt", prompt: "p", references: 0 } satisfies UserTurn,
    { id: "rig-1", role: "rig", at: "2026-09-08T02:00:01.000Z", kind: "replayed", nodeId: "week05-t3-take", planLine: "Replayed A" } satisfies RigTurn,
    { id: "ask-2", role: "user", at: "2026-09-08T02:01:00.000Z", week: 2, tierId: "week02-t1", label: "l", kind: "seed", prompt: "p", references: 0 } satisfies UserTurn,
    { id: "rig-2", role: "rig", at: "2026-09-08T02:01:01.000Z", kind: "replayed", nodeId: "week02-t1-take", planLine: "Replayed B" } satisfies RigTurn,
    { id: "ask-3", role: "user", at: "2026-09-08T02:02:00.000Z", week: 6, tierId: "week06-t4", label: "l", kind: "image", prompt: "p", references: 0 } satisfies UserTurn,
    { id: "rig-3", role: "rig", at: "2026-09-08T02:02:01.000Z", kind: "replayed", nodeId: "week06-t4-take", planLine: "Replayed C" } satisfies RigTurn,
  );
  return { doc, thread };
}

// Seen red by having buildCanvasExport drop the camera from the document it
// writes (`doc: { ...doc, camera: undefined }`), which is the sort of thing a
// hand-written serialiser does and a screenshot never shows:
//   AssertionError: the exported document has to validate against CanvasDoc:
//   expected false to be true
// then reverted.
describe("the canvas downloads as a file that can be loaded back", () => {
  const { doc, thread } = session();
  const file = buildCanvasExport(doc, thread, new Date("2026-09-08T02:03:00.000Z"));

  it("is stamped, and carries both the document and the thread", () => {
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.exportedAt).toBe("2026-09-08T02:03:00.000Z");
    expect(file.thread.messages.length).toBe(6);
  });

  it("validates against the document type", () => {
    // Through JSON, because that is what actually leaves the browser.
    const parsed: unknown = JSON.parse(JSON.stringify(file));
    expect(isRecord(parsed)).toBe(true);
    expect(
      validDoc((parsed as Record<string, unknown>).doc),
      "the exported document has to validate against CanvasDoc",
    ).toBe(true);
  });

  it("reproduces the same boards in the same places when loaded back", () => {
    const parsed = JSON.parse(JSON.stringify(file)) as { doc: CanvasDoc };
    const loaded = restoreSession(built, parsed.doc, MERGE);

    // By id, not by array position: the loader rebuilds the list from the
    // built rig, so a canvas whose boards were opened out of manifest order
    // comes back in manifest order. Where each board *is* is what has to
    // survive, and that is what the reader sees.
    const shape = (candidate: CanvasDoc) =>
      candidate.boards
        .map((board) => ({ id: board.id, x: board.x, y: board.y, w: board.w, h: board.h }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const places = (candidate: CanvasDoc) =>
      candidate.nodes
        .map((node) => [node.id, node.x, node.y] as const)
        .sort((a, b) => a[0].localeCompare(b[0]));

    expect(shape(loaded), "every board comes back where it was").toEqual(shape(doc));
    expect(places(loaded), "every card comes back where it was").toEqual(places(doc));
  });
});

describe("the production log is every replayed run, in the order it was asked for", () => {
  const { doc, thread } = session();

  it("follows the thread rather than the canvas", () => {
    const lines = productionLogLines(thread, doc, canvasBundle.meta);
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain("SLOP8760/W05/t3");
    expect(lines[1]).toContain("SLOP8760/W02/t1");
    expect(lines[2]).toContain("SLOP8760/W06/t4");
    // The Studio's own per-tier line, unchanged: this extends it, it does not
    // restate it.
    expect(lines[0]).toBe(canvasBundle.meta["week05-t3-take"]?.productionLine);
  });

  it("leaves out a run whose take is no longer on the canvas", () => {
    const pruned: CanvasDoc = { ...doc, nodes: doc.nodes.filter((node) => node.id !== "week02-t1-take") };
    const lines = productionLogLines(thread, pruned, canvasBundle.meta);
    expect(lines.length).toBe(2);
    expect(lines.some((line) => line.includes("SLOP8760/W02/t1"))).toBe(false);
  });

  it("says what it is at the top and ends with a newline", () => {
    const text = productionLogText(["a · b"], new Date("2026-09-08T02:03:00.000Z"));
    expect(text.startsWith("# SLOP8760 Studio — production log")).toBe(true);
    expect(text).toContain("Nothing here was generated in the browser.");
    expect(text.endsWith("\n")).toBe(true);
  });
});

// Seen red by moving the threshold to zero (`EDGE_LABEL_MIN_ZOOM = 0`), which
// is what "just always show them" looks like in a diff:
//   AssertionError: a 40% zoom draws an 11px label at four pixels: expected
//   true to be false
// then reverted.
describe("edge labels stop being drawn below half zoom", () => {
  it("switches at exactly 0.5", () => {
    expect(EDGE_LABEL_MIN_ZOOM).toBe(0.5);
    expect(edgeLabelsVisible(0.5), "at the threshold the labels are on").toBe(true);
    expect(edgeLabelsVisible(0.4999), "a hair below and they are off").toBe(false);
  });

  it("is off where the label would be a smudge and on where it is readable", () => {
    expect(edgeLabelsVisible(0.4), "a 40% zoom draws an 11px label at four pixels").toBe(false);
    expect(edgeLabelsVisible(0.1), "the zoom floor").toBe(false);
    expect(edgeLabelsVisible(1)).toBe(true);
    expect(edgeLabelsVisible(4), "the zoom ceiling").toBe(true);
  });
});
