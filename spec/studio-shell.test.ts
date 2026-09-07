// Guards the full-screen Studio: the empty canvas it opens on, the boards a
// visitor grows on it, the whole rig arriving in one press, the anchor a week
// page sends, and the status bar's theme toggle.
//
// spec/studio-canvas.test.ts still guards the built rig itself — the layout
// module, the manifest conversion, the desk resolver. This file guards what
// the visitor's own canvas does with that rig, which is all new in v2.
//
// Every check below was seen red first, under a bug injected into the real
// module and then reverted; the output is quoted verbatim above each describe.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canvasBundle } from "../src/lib/canvas/build";
import {
  addRigBoard,
  addTier,
  beginReplay,
  completeReplay,
  EMPTY_HINT,
  emptyCanvasDoc,
  hashTarget,
  loadWholeRig,
  restoreSession,
} from "../src/lib/canvas/session";
import type { CanvasDoc } from "../src/lib/canvas/types";
import { initialTheme, nextTheme, themeLabel, THEME_STORAGE_KEY } from "../src/lib/theme";

const built = canvasBundle.doc;
const MERGE = { assetPrefix: "/comp4020-ass2-Ray0766/studio/" };

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const studioHtml = source("dist/studio/index.html");

// ---------------------------------------------------------------------------
// 1. The canvas opens with nothing on it.
// ---------------------------------------------------------------------------

// Seen red by making restoreSession's "nothing stored" branch return the built
// document (`if (!stored) return built;`), which is what v1 did:
//   AssertionError: a first visit opens on an empty canvas: expected 10 to be
//   +0
// and, separately, by rewording EMPTY_HINT into a "have a go!" line:
//   AssertionError: expected 'Pick a week and an input, and have a …' to be
//   'Pick a week and one of its recorded i…'
// then reverted.
describe("the canvas opens empty and says what to do", () => {
  it("a first visit has no boards, no cards and no edges", () => {
    const doc = restoreSession(built, undefined, MERGE);
    expect(doc.boards.length, "a first visit opens on an empty canvas").toBe(0);
    expect(doc.boards.map((board) => board.id)).toEqual([]);
    expect(doc.nodes).toEqual([]);
    expect(doc.edges).toEqual([]);
  });

  it("emptyCanvasDoc is the same empty canvas, stamped with the current version", () => {
    expect(emptyCanvasDoc()).toEqual({ boards: [], nodes: [], edges: [], camera: { x: 0, y: 0, z: 1 }, version: 1 });
  });

  // The hint is drawn by the island, so no built page carries it; what this
  // can check is that the sentence is the one the spec settled on and that the
  // stage is the thing that states it. That it is legible on the stage is a
  // browser check, and is in the receipt.
  it("states the hint the empty stage carries, in the syllabus register", () => {
    expect(EMPTY_HINT).toBe(
      "Pick a week and one of its recorded inputs on the desk; the rig replays that run onto a board here.",
    );
    expect(EMPTY_HINT).not.toContain("!");
    expect(source("src/components/studio/StudioCanvas.tsx")).toContain("EMPTY_HINT");
  });
});

// ---------------------------------------------------------------------------
// 2. The two takes that are one file, found by the visitor.
// ---------------------------------------------------------------------------

// Seen red by having derivedEdges return every built edge rather than only the
// ones whose two ends are on the canvas (`const fromRig = built.edges;`):
//   AssertionError: week 2's board alone draws no same-file edge yet: expected
//   2 to be +0
//   AssertionError: week06-t4 and week02-t1 draw exactly one same-file edge:
//   expected 2 to be 1
// then reverted.
describe("a same-file edge appears when the visitor has both of its ends", () => {
  const sameFile = (doc: CanvasDoc) => doc.edges.filter((edge) => edge.kind === "same-file");

  it("draws nothing while only one of the pair is on the canvas", () => {
    const doc = addTier(emptyCanvasDoc(), built, "week02-t1");
    expect(sameFile(doc).length, "week 2's board alone draws no same-file edge yet").toBe(0);
  });

  it("draws exactly one the moment the second arrives, across the two boards", () => {
    const first = addTier(emptyCanvasDoc(), built, "week02-t1");
    const doc = addTier(first, built, "week06-t4");

    const edges = sameFile(doc);
    expect(edges.length, "week06-t4 and week02-t1 draw exactly one same-file edge").toBe(1);
    expect(edges[0].from).toBe("week06-t4-take");
    expect(edges[0].to).toBe("week02-t1-take");
    expect(edges[0].label).toBe("same file");

    expect(doc.boards.map((board) => board.id)).toEqual(["week-02", "week-06"]);
    expect(doc.boards[1].x, "the second week opens 120 past the first").toBe(
      doc.boards[0].x + doc.boards[0].w + 120,
    );
  });

  it("puts a second tier of the same week on the same board, laid out by the same grid", () => {
    const doc = addTier(addTier(emptyCanvasDoc(), built, "week02-t1"), built, "week02-t2");
    expect(doc.boards.map((board) => board.id)).toEqual(["week-02"]);
    expect(doc.nodes.length).toBe(4);
    expect(doc.nodes.every((node) => node.boardId === "week-02")).toBe(true);
  });

  // A board that has been replayed all the way through is the recorded board,
  // to the unit — the property that lets "Load the whole rig" be the same
  // arrangement rather than a second one.
  it("a fully replayed week board matches the built board's own geometry", () => {
    const tiers = built.nodes
      .filter((node) => node.boardId === "week-02" && node.type === "take")
      .map((node) => (node.type === "take" ? node.tierId : ""));
    const doc = tiers.reduce((current, tierId) => addTier(current, built, tierId), emptyCanvasDoc());
    const board = built.boards.find((candidate) => candidate.id === "week-02");

    expect(doc.boards[0].w).toBe(board?.w);
    expect(doc.boards[0].h).toBe(board?.h);
    for (const node of doc.nodes) {
      const original = built.nodes.find((candidate) => candidate.id === node.id);
      expect({ id: node.id, x: node.x, y: node.y }).toEqual({ id: node.id, x: original?.x, y: original?.y });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Load the whole rig.
// ---------------------------------------------------------------------------

// Seen red by having loadWholeRig keep the visitor's own boards where they
// were rather than starting from the built strip
// (`boards: [...doc.boards, ...built.boards]`):
//   AssertionError: expected [ …(12) ] to deeply equal [ …(10) ]
//   AssertionError: Board 1 overlaps week-02: expected false to be true
// then reverted. The empty-canvas case stayed green under that injection,
// which is right — with nothing to keep, the two are the same list.
describe("Load the whole rig lands the §3 arrangement, whatever was there before", () => {
  const shape = (doc: CanvasDoc) =>
    doc.boards.map((board) => ({ id: board.id, x: board.x, y: board.y, w: board.w, h: board.h }));

  it("from an empty canvas, the boards are the built strip to the unit", () => {
    expect(shape(loadWholeRig(emptyCanvasDoc(), built)), "Load the whole rig lands the boards where §3 put them").toEqual(
      shape(built),
    );
    expect(loadWholeRig(emptyCanvasDoc(), built).nodes.length).toBe(built.nodes.length);
    expect(loadWholeRig(emptyCanvasDoc(), built).edges.length).toBe(built.edges.length);
  });

  it("from a canvas the visitor already grew, the same strip in the same places", () => {
    const grown = addTier(addTier(emptyCanvasDoc(), built, "week05-t3"), built, "week09-t1");
    expect(shape(loadWholeRig(grown, built))).toEqual(shape(built));
  });

  it("keeps a board the visitor made, walked clear of the strip", () => {
    const doc = loadWholeRig(
      {
        ...emptyCanvasDoc(),
        boards: [{ id: "board-1", title: "Board 1", x: 0, y: 0, w: 384, h: 500, kind: "user", order: 0 }],
        nodes: [
          {
            id: "desk-1",
            boardId: "board-1",
            type: "placeholder",
            x: 32,
            y: 68,
            w: 320,
            h: 400,
            locked: false,
            origin: { kind: "desk", refNodeIds: [], prompt: "", at: "2026-09-08T00:00:00.000Z" },
            expectedAspect: 0.5625,
            resolvesTo: "week02-t1-take",
          },
        ],
      },
      built,
    );

    const own = doc.boards.find((board) => board.id === "board-1");
    expect(own, "the visitor's own board survives Load the whole rig").toBeDefined();
    expect(doc.boards.filter((board) => board.kind === "recorded").length).toBe(built.boards.length);
    for (const board of doc.boards) {
      if (board.id === "board-1") continue;
      const clear =
        own!.x + own!.w <= board.x || board.x + board.w <= own!.x || own!.y + own!.h <= board.y || board.y + board.h <= own!.y;
      expect(clear, `Board 1 overlaps ${board.id}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The anchor a week page sends.
// ---------------------------------------------------------------------------

// Seen red by having hashTarget return the tier's own id as the board id
// (`return { boardId: tierId, … }`), which is what a board-per-tier canvas
// would have meant:
//   AssertionError: expected { boardId: 'week05-t3', …(3) } to deeply equal
//   { boardId: 'week-05', …(3) }
//   AssertionError: #week-05:t3 opens exactly one board: expected +0 to be 1
// then reverted.
describe("a #week-NN:tier anchor opens one board and preselects the desk", () => {
  it("reads the week, the tier and the board off the anchor", () => {
    expect(hashTarget("#week-05:t3", built)).toEqual({
      boardId: "week-05",
      nodeId: "week05-t3-take",
      tierId: "week05-t3",
      week: 5,
    });
  });

  it("ignores an anchor that names no recorded tier", () => {
    expect(hashTarget("#week-05:t9", built)).toBeUndefined();
    expect(hashTarget("#nothing", built)).toBeUndefined();
  });

  it("adds exactly one board, carrying that week's whole ladder", () => {
    const target = hashTarget("#week-05:t3", built);
    const doc = addRigBoard(emptyCanvasDoc(), built, target!.boardId);

    expect(doc.boards.length, "#week-05:t3 opens exactly one board").toBe(1);
    expect(doc.boards[0].id).toBe("week-05");
    expect(doc.boards[0].x).toBe(0);
    expect(doc.nodes.some((node) => node.id === target!.nodeId)).toBe(true);
    expect(doc.nodes.every((node) => node.boardId === "week-05")).toBe(true);
  });

  it("adds to a canvas that already has boards rather than clearing it", () => {
    const grown = addTier(emptyCanvasDoc(), built, "week02-t1");
    const doc = addRigBoard(grown, built, "week-05");
    expect(doc.boards.map((board) => board.id)).toEqual(["week-02", "week-05"]);
    expect(doc.nodes.some((node) => node.id === "week02-t1-take")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. The status bar's theme toggle.
// ---------------------------------------------------------------------------

// Seen red twice. Giving the status bar its own storage key
// (`THEME_STORAGE_KEY = "studio-theme"`):
//   AssertionError: the status bar must write the key the theme's own footer
//   toggle reads: expected 'studio-theme' to be 'at-theme'
// and making the toggle one-way (`nextTheme` returning "dark" always), which
// is the bug a single-direction browser check would miss:
//   AssertionError: expected 'dark' to be 'light'
// then reverted.
describe("the status bar's theme toggle is the footer's toggle, moved", () => {
  const themeFooter = source("node_modules/astro-theme-university/components/Footer.astro");

  it("writes the key the theme package itself writes", () => {
    expect(
      THEME_STORAGE_KEY,
      "the status bar must write the key the theme's own footer toggle reads",
    ).toBe("at-theme");
    expect(themeFooter).toContain(`localStorage.setItem("${THEME_STORAGE_KEY}"`);
  });

  it("switches both ways, and each press is the opposite of the page's state", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme(nextTheme("light"))).toBe("light");
    // Unset, or a value nothing wrote: the theme's own rule is "dark unless it
    // already is dark", so both land on dark.
    expect(nextTheme(undefined)).toBe("dark");
    expect(nextTheme("banana")).toBe("dark");
  });

  it("says what the next press will do, in the theme's own words", () => {
    expect(themeLabel("dark")).toBe("Switch to light theme");
    expect(themeLabel("light")).toBe("Switch to dark theme");
    expect(themeFooter).toContain('dark ? "Switch to light theme" : "Switch to dark theme"');
  });

  it("opens on what was stored, and otherwise on what the OS asks for", () => {
    expect(initialTheme("light", true)).toBe("light");
    expect(initialTheme("dark", false)).toBe("dark");
    expect(initialTheme(null, true)).toBe("dark");
    expect(initialTheme(null, false)).toBe("light");
  });

  it("is on the built page, and the footer's toggle is not", () => {
    expect(studioHtml).toContain("studio-status__theme");
    expect(studioHtml.includes("at-footer-theme-toggle"), "/studio/ still renders the footer's toggle").toBe(false);
    expect(studioHtml.includes("at-footer"), "/studio/ still renders the footer").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The full-screen shell: what has to survive the layout change.
// ---------------------------------------------------------------------------

describe("the full-screen page keeps the no-JS body and the site's furniture", () => {
  it("keeps the skip link and the theme's nav", () => {
    expect(studioHtml).toContain('href="#main"');
    expect(studioHtml).toContain("at-nav");
  });

  // The marker is checked as markup, not as a substring: Astro inlines the
  // status bar's own module into the page, and that module names the same
  // attribute in a querySelector — so a plain `.toContain` passes on the
  // script that looks for the element even when the element is gone. Found by
  // injecting exactly that (renaming the attribute in the page and watching
  // this check stay green).
  it("keeps the gallery in the DOM as the no-JS body, with Show as a list to reveal it", () => {
    expect(studioHtml).toContain("studio-gallery");
    expect(studioHtml).toContain("Show as a list");
    expect(/<div[^>]*\sdata-studio-fallback[\s>]/.test(studioHtml), "no element carries data-studio-fallback").toBe(
      true,
    );
  });

  it("holds the stage's space open from first paint", () => {
    expect(studioHtml).toContain('data-studio-canvas');
    expect(source("src/styles/studio-canvas.css")).toContain('[data-reserve="studio-canvas"]');
  });
});

// A placeholder is the take before it has a picture: same id, same slot, so
// the board does not move when the clip arrives.
describe("a replay resolves in place", () => {
  it("leaves the take's own slot untouched between placeholder and take", () => {
    const started = beginReplay(emptyCanvasDoc(), built, "week05-t3");
    const pending = started.doc.nodes.find((node) => node.id === "week05-t3-take");
    expect(pending?.type).toBe("placeholder");

    const done = completeReplay(started.doc, built, "week05-t3");
    const take = done.nodes.find((node) => node.id === "week05-t3-take");
    expect(take?.type).toBe("take");
    expect({ x: take?.x, y: take?.y, w: take?.w, h: take?.h }).toEqual({
      x: pending?.x,
      y: pending?.y,
      w: pending?.w,
      h: pending?.h,
    });
  });
});
