// Guards the lineage canvas: the pure layout module (src/lib/canvas/layout.ts)
// against its fixtures, and the build-time manifest -> CanvasDoc conversion
// (src/lib/canvas/doc.ts) against the manifests it reads. Nothing here needs a
// browser; what needs a browser is listed in the receipt and driven there.
//
// Seen red, one bug at a time, each injected into the real module then
// reverted, output captured verbatim — see the block above each describe.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { weekManifestSchema } from "../src/data/studio.schema";
import { canvasBundle } from "../src/lib/canvas/build";
import { recordedInputOf } from "../src/lib/canvas/doc";
import { createBoardFor, deleteObjects, reparentNodes, worldRect } from "../src/lib/canvas/engine";
import { layoutBoard, placeBoard, wrapNodes, type PlaceAnchor } from "../src/lib/canvas/layout";
import { RF_TYPE, toRfEdges } from "../src/lib/canvas/rf";
import { DESK_MESSAGES, resolveDeskRequest, tierIdOfNode } from "../src/lib/canvas/resolve";
import { mergeStoredDoc } from "../src/lib/canvas/storage";
import type { CanvasDoc, TakeNode } from "../src/lib/canvas/types";
import { toClientWeek } from "../src/lib/studio-client";

const FIXTURE_DIR = "src/lib/canvas/fixtures";
const DATA_DIR = "src/data/studio";
const PUBLIC_DIR = "public/studio";

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

// ---------------------------------------------------------------------------
// The build-time conversion: manifests in, canvas document out.
// ---------------------------------------------------------------------------

const WEEK_FILES = [
  "week-02.json",
  "week-03.json",
  "week-04.json",
  "week-05.json",
  "week-06.json",
  "week-07.json",
  "week-08.json",
  "week-09.json",
] as const;

interface RawTier {
  id: string;
  tier: string;
  sameAs?: string;
}

function readManifestRaw(name: string): unknown {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), "utf8"));
}

function readManifest(name: string): { week: number; tiers: RawTier[] } {
  return readManifestRaw(name) as { week: number; tiers: RawTier[] };
}

const { doc } = canvasBundle;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Seen red: dropped the input node from weekBoardDraft, pushing only the
// take. Failed on all eight weeks, e.g. "week-05.json puts both its input and
// its take on the canvas for every tier: expected 5 to be 10".
describe("every tier in every manifest reaches the canvas", () => {
  for (const file of WEEK_FILES) {
    const manifest = readManifest(file);
    const boardId = `week-${pad2(manifest.week)}`;

    it(`${file} puts both its input and its take on the canvas for every tier`, () => {
      const nodes = doc.nodes.filter((node) => node.boardId === boardId);
      expect(nodes.length).toBe(manifest.tiers.length * 2);
      for (const tier of manifest.tiers) {
        expect(doc.nodes.find((node) => node.id === `${tier.id}-input`), `${tier.id} input`).toBeDefined();
        expect(doc.nodes.find((node) => node.id === `${tier.id}-take`), `${tier.id} take`).toBeDefined();
      }
    });

    it(`${file} draws one lineage edge per tier`, () => {
      for (const tier of manifest.tiers) {
        const edges = doc.edges.filter((edge) => edge.id === `lineage-${tier.id}`);
        expect(edges.length, `lineage edges for ${tier.id}`).toBe(1);
        expect(edges[0].from).toBe(`${tier.id}-input`);
        expect(edges[0].to).toBe(`${tier.id}-take`);
      }
    });
  }

  it("the ten recorded boards are the eight weeks, the Cut and the reference episode", () => {
    expect(doc.boards.map((board) => board.id)).toEqual([
      "week-02",
      "week-03",
      "week-04",
      "week-05",
      "week-06",
      "week-07",
      "week-08",
      "week-09",
      "cut",
      "reference",
    ]);
    expect(doc.boards.every((board) => board.kind === "recorded")).toBe(true);
  });

  it("the recorded boards run left to right, 120 apart, tops aligned", () => {
    const boards = [...doc.boards].sort((a, b) => a.order - b.order);
    for (let i = 1; i < boards.length; i += 1) {
      expect(boards[i].x, `${boards[i].id} starts 120 past ${boards[i - 1].id}`).toBe(
        boards[i - 1].x + boards[i - 1].w + 120,
      );
      expect(boards[i].y).toBe(boards[0].y);
    }
  });

  it("the Cut board carries the master and its four windows", () => {
    const cut = JSON.parse(readFileSync(resolve(DATA_DIR, "cut.json"), "utf8")) as { cuts: { id: string }[] };
    const nodes = doc.nodes.filter((node) => node.boardId === "cut");
    expect(nodes.length).toBe(cut.cuts.length + 1);
    for (const clip of cut.cuts) {
      expect(doc.edges.find((edge) => edge.id === `lineage-${clip.id}`), `${clip.id} lineage`).toBeDefined();
    }
  });

  it("the reference board carries one input per segment and one finished episode", () => {
    const ref = JSON.parse(readFileSync(resolve(DATA_DIR, "reference.json"), "utf8")) as { segments: unknown[] };
    const nodes = doc.nodes.filter((node) => node.boardId === "reference");
    expect(nodes.length).toBe(ref.segments.length + 1);
    expect(nodes.filter((node) => node.type === "take").length).toBe(1);
  });
});

// Seen red: made the sameAs branch push its edge unconditionally (dropping
// the `if (tier.sameAs)` guard), so every tier claimed to reuse a file.
// Failed on "no other edge claims two takes are the same file: expected 37
// to be 2".
describe("the two tiers that reuse a recorded file say so, exactly once each", () => {
  const pairs = WEEK_FILES.flatMap((file) =>
    readManifest(file).tiers.flatMap((tier) => (tier.sameAs ? [{ from: tier.id, to: tier.sameAs }] : [])),
  );

  it("the manifests declare the two pairs this check exists for", () => {
    expect(pairs).toEqual([
      { from: "week06-t4", to: "week02-t1" },
      { from: "week07-t4", to: "week02-t2" },
    ]);
  });

  for (const pair of pairs) {
    it(`${pair.to} is cited by exactly one same-file edge`, () => {
      const edges = doc.edges.filter((edge) => edge.kind === "same-file" && edge.to === `${pair.to}-take`);
      expect(edges.length).toBe(1);
      expect(edges[0].from).toBe(`${pair.from}-take`);
      expect(edges[0].label).toBe("same file");
    });
  }

  it("no other edge claims two takes are the same file", () => {
    expect(doc.edges.filter((edge) => edge.kind === "same-file").length).toBe(pairs.length);
  });
});

// Seen red: appended "-canvas" to the take node's file in weekBoardDraft.
// Failed 37 times, e.g. "week02-t1-take shows week02-t1.mp4-canvas, which is
// not in public/studio/: expected false to be true".
describe("every take on the canvas is a file that shipped", () => {
  const takes = doc.nodes.filter((node): node is TakeNode => node.type === "take");

  it("there is a take for every tier, every cut window and the episode", () => {
    const tierCount = WEEK_FILES.reduce((sum, file) => sum + readManifest(file).tiers.length, 0);
    expect(takes.length).toBe(tierCount + 4 + 1);
  });

  for (const take of takes) {
    it(`${take.id} shows a file that exists under public/studio/`, () => {
      const name = take.file.split("/").pop() ?? take.file;
      const path = resolve(PUBLIC_DIR, name);
      expect(existsSync(path), `${take.id} shows ${name}, which is not in public/studio/`).toBe(true);
      if (take.poster) {
        const poster = take.poster.split("/").pop() ?? take.poster;
        expect(existsSync(resolve(PUBLIC_DIR, poster)), `${take.id}'s poster ${poster} is missing`).toBe(true);
      }
    });
  }
});

// React Flow renders no edge at all — no error, no warning — when the handle
// id an edge names does not exist on the node with that type. Six of the
// forty-seven were missing in Chrome before every side of a card carried both
// a source and a target handle, and all six were edges running right to left.
//
// Seen red: put handlesFor's right-to-left branch back to `sourceHandle:
// "s-right"`. Failed with "same-file-week06-t4 runs right to left: expected
// 's-right' to be 's-left'".
describe("every edge names a handle that its cards actually carry", () => {
  const ANCHORS = ["left", "right", "top", "bottom"];
  const rfEdges = toRfEdges(doc, true);

  it("emits one React Flow edge per document edge", () => {
    expect(rfEdges.length).toBe(doc.edges.length);
  });

  it("only ever names s-<side> for a source and t-<side> for a target", () => {
    for (const edge of rfEdges) {
      expect(ANCHORS.map((side) => `s-${side}`)).toContain(edge.sourceHandle);
      expect(ANCHORS.map((side) => `t-${side}`)).toContain(edge.targetHandle);
    }
  });

  it("leaves from whichever side actually faces the other card", () => {
    const worldX = (id: string) => {
      const node = doc.nodes.find((candidate) => candidate.id === id)!;
      const board = doc.boards.find((candidate) => candidate.id === node.boardId)!;
      return board.x + node.x;
    };
    for (const edge of doc.edges) {
      if (edge.kind === "desk") continue;
      const rf = rfEdges.find((candidate) => candidate.id === edge.id)!;
      const backwards = worldX(edge.from) > worldX(edge.to);
      expect(rf.sourceHandle, `${edge.id} runs ${backwards ? "right to left" : "left to right"}`).toBe(
        backwards ? "s-left" : "s-right",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The desk's resolver. The rig replays; it does not generate. So the whole of
// "Generate" is this lookup, and the thing worth checking is that it round
// trips — every tier's own recorded input resolves back to that tier, and
// anything else resolves to nothing at all.
// ---------------------------------------------------------------------------

const clientWeeks = WEEK_FILES.map((file) => {
  const manifest = weekManifestSchema.parse(readManifestRaw(file));
  return toClientWeek({
    ...manifest,
    tiers: manifest.tiers.map((tier) => {
      const input = tier.input as Record<string, unknown>;
      const promptFile = typeof input.prompt_file === "string" ? input.prompt_file : undefined;
      const negFile = typeof input.neg_file === "string" ? input.neg_file : undefined;
      return {
        ...tier,
        ...(promptFile ? { promptText: readFileSync(resolve(DATA_DIR, promptFile), "utf8").trimEnd() } : {}),
        ...(negFile ? { negText: readFileSync(resolve(DATA_DIR, negFile), "utf8").trimEnd() } : {}),
      };
    }),
  });
});

// `recordedInput` is what the resolver compares against (normalised);
// `rawPrompt` is what the desk actually pre-fills the box with — the prompt
// file as written, newlines and all. The round trip has to start from the raw
// one, or it would only prove the resolver can compare a string to itself.
const tierRefs = new Map<string, { week: number; tierId: string; recordedInput: string; rawPrompt: string }>();
for (const week of clientWeeks) {
  for (const tier of week.tiers) {
    tierRefs.set(tier.id, {
      week: week.week,
      tierId: tier.id,
      recordedInput: recordedInputOf(tier),
      rawPrompt: tier.input.promptText ?? (typeof tier.input.value === "number" ? String(tier.input.value) : ""),
    });
  }
}

const tierOf = (nodeId: string) => {
  const node = doc.nodes.find((candidate) => candidate.id === nodeId);
  const tierId = tierIdOfNode(node);
  return tierId ? tierRefs.get(tierId) : undefined;
};

// Seen red twice.
//  - Dropped the whitespace normalisation from rule 1: 36 of the 37 tiers
//    failed with "expected { kind: 'prompt-differs', …(3) } to deeply equal
//    { kind: 'resolved', week: 2, …(1) }". The one that stayed green is
//    week02-t1, whose recorded input is a bare seed with no whitespace in it
//    to normalise — which is why the round trip starts from the raw prompt
//    file rather than from the normalised string.
//  - Made rule 1 ignore the prompt entirely: all 37 "refuses a prompt the rig
//    was never given" checks failed with "expected 'resolved' to be
//    'prompt-differs'".
describe("every tier's own recorded input resolves back to that tier", () => {
  for (const [tierId, ref] of tierRefs) {
    it(`${tierId}'s own recorded input resolves back to it`, () => {
      expect(resolveDeskRequest({ references: [`${tierId}-take`], prompt: ref.rawPrompt, tierOf })).toEqual({
        kind: "resolved",
        week: ref.week,
        tierId,
      });
    });

    it(`${tierId} refuses a prompt the rig was never given`, () => {
      const result = resolveDeskRequest({
        references: [`${tierId}-take`],
        prompt: `${ref.rawPrompt} and then she turns around`,
        tierOf,
      });
      expect(result.kind).toBe("prompt-differs");
      if (result.kind === "prompt-differs") expect(result.recordedInput).toBe(ref.recordedInput);
    });
  }

  it("takes the input card as readily as the take card", () => {
    const ref = tierRefs.get("week05-t3")!;
    expect(resolveDeskRequest({ references: ["week05-t3-input"], prompt: ref.rawPrompt, tierOf })).toEqual({
      kind: "resolved",
      week: 5,
      tierId: "week05-t3",
    });
  });

  it("normalises whitespace, so a re-wrapped paste still matches", () => {
    const ref = tierRefs.get("week05-t3")!;
    const rewrapped = `\n  ${ref.recordedInput.split(" ").join("\n")}  \n`;
    expect(resolveDeskRequest({ references: ["week05-t3-take"], prompt: rewrapped, tierOf }).kind).toBe("resolved");
  });

  it("says so when there is nothing on the desk", () => {
    expect(resolveDeskRequest({ references: [], prompt: "anything", tierOf }).kind).toBe("no-reference");
  });

  it("says so for a clip the rig cut rather than generated", () => {
    expect(resolveDeskRequest({ references: ["cut-hook-take"], prompt: "", tierOf }).kind).toBe("no-recorded-run");
    expect(resolveDeskRequest({ references: ["reference-episode-take"], prompt: "", tierOf }).kind).toBe(
      "no-recorded-run",
    );
  });

  it("says so when the references come from different tiers", () => {
    expect(
      resolveDeskRequest({ references: ["week05-t3-take", "week05-t4-take"], prompt: "", tierOf }).kind,
    ).toBe("mixed-tiers");
  });

  it("has a line for every answer it can give", () => {
    for (const kind of ["prompt-differs", "no-reference", "no-recorded-run", "mixed-tiers"] as const) {
      expect(DESK_MESSAGES[kind].length, `${kind} needs a line`).toBeGreaterThan(0);
    }
  });
});

// Two things the browser does silently, both found by looking at the rendered
// page rather than by any check, and both invisible to every other check here.
// These guard the fixes, because the failure they cause is a canvas that
// looks finished and is missing something.
describe("the two React Flow collisions with the theme stay fixed", () => {
  const canvasCss = readFileSync(resolve("src/styles/studio-canvas.css"), "utf8");
  const themeCss = readFileSync(resolve("node_modules/astro-theme-university/styles/base.css"), "utf8");

  // Seen red: deleted the override block from studio-canvas.css. Failed with
  // "the theme still resets svg max-width, so the edge layer still needs the
  // override: expected false to be true".
  it("the edge layer opts out of the theme's svg max-width reset", () => {
    const themeResets = /img,\s*picture,\s*video,\s*svg\s*\{[^}]*max-width:\s*100%/.test(themeCss);
    if (!themeResets) return; // The reset is gone; the override can go with it.
    const override = /\.react-flow__edges svg\s*\{[^}]*max-width:\s*none/.test(canvasCss);
    expect(override, "the theme still resets svg max-width, so the edge layer still needs the override").toBe(true);
  });

  // Seen red: set RF_TYPE.input back to "input". Failed with "input must not
  // collide with a React Flow built-in node type: expected [ 'default',
  // 'input', 'output', …(1) ] to not include 'input'".
  it("no node type collides with a React Flow built-in", () => {
    const builtIns = ["default", "input", "output", "group"];
    for (const type of Object.values(RF_TYPE)) {
      expect(builtIns, `${type} must not collide with a React Flow built-in node type`).not.toContain(type);
    }
  });
});

// ---------------------------------------------------------------------------
// The page with JS off. `pnpm test` builds first, so this reads what actually
// shipped, and it reads it with the island's serialised props stripped out —
// otherwise the props would satisfy every check below without a single one of
// these facts being visible to a reader.
// ---------------------------------------------------------------------------

const studioHtml = readFileSync(resolve("dist/studio/index.html"), "utf8").replace(/<astro-island[^>]*>/g, "");
const base = "/comp4020-ass2-Ray0766";

// Seen red: dropped the takeId line from the gallery's tier markup. Thirty-
// seven of the forty-three take checks failed with "expected false to be
// true"; the six that stayed green are the Cut's and the episode's, which the
// two boardSection blocks render separately.
describe("with JS off the page still states every take and answers every anchor", () => {
  const takes = doc.nodes.filter((node): node is TakeNode => node.type === "take");

  for (const take of takes) {
    it(`${take.takeId} is stated in the page with JS off`, () => {
      expect(studioHtml.includes(take.takeId)).toBe(true);
    });
  }

  for (const file of WEEK_FILES) {
    const manifest = readManifest(file);
    it(`week ${manifest.week}'s tiers all carry their #week-NN:tier anchor`, () => {
      for (const tier of manifest.tiers) {
        const anchor = `week-${pad2(manifest.week)}:${tier.tier}`;
        expect(studioHtml.includes(`id="${anchor}"`), `no element with id ${anchor}`).toBe(true);
      }
    });
  }

  // Seen red: put a bare `src="/studio/week02-t1.avif"` in the gallery's meta
  // line — a link that works on localhost and 404s on Pages, and one the
  // theme's own link checker let through. Failed with "expected
  // [ '/studio/week02-t1.avif', …(9) ] to deeply equal []".
  it("has no root-absolute link that skips the base path", () => {
    const offenders = [...studioHtml.matchAll(/(?:href|src)="(\/[^"]*)"/g)]
      .map((match) => match[1])
      .filter((url) => !url.startsWith(`${base}/`) && url !== base);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Moving things around: the document mutations behind drag-out, reparent and
// delete. These are what the browser's pointer events end up calling.
// ---------------------------------------------------------------------------

function clone(): CanvasDoc {
  return structuredClone(doc);
}

// Seen red: had reparentNodes keep the node's board-local x/y instead of
// recomputing them against the new board's origin. Failed with "expected
// { x: 3472, y: 200, w: 320, h: 569 } to deeply equal { x: 1936, y: 200,
// w: 320, h: 569 }" — the node jumped a board's width from where it landed.
describe("a node dropped into another board stays where it was let go of", () => {
  it("keeps its place on screen and joins the new board", () => {
    const before = clone();
    const node = before.nodes.find((candidate) => candidate.id === "week02-t1-take")!;
    const target = before.boards.find((board) => board.id === "week-03")!;

    // Put it where the pointer left it: inside Week 3's board.
    const dropped = { x: target.x + 400, y: target.y + 200 };
    before.nodes = before.nodes.map((candidate) =>
      candidate.id === node.id ? { ...candidate, x: dropped.x - before.boards[0].x, y: dropped.y - before.boards[0].y } : candidate,
    );

    const after = reparentNodes(before, [node.id], "week-03");
    const moved = after.nodes.find((candidate) => candidate.id === node.id)!;
    expect(moved.boardId).toBe("week-03");
    expect(worldRect(after, moved)).toEqual({ x: dropped.x, y: dropped.y, w: node.w, h: node.h });
  });
});

// Seen red: made createBoardFor place the board with placeBoard's "row"
// anchor instead of "at", so a drag-out flew off to the right of every board
// instead of staying under the pointer. Failed with "expected 13640 to be
// 1968".
describe("a node dropped outside every board gets a board of its own", () => {
  it("wraps it with the board padding and calls it Board 1", () => {
    const before = clone();
    const node = before.nodes.find((candidate) => candidate.id === "week02-t1-take")!;

    const { doc: after, boardId } = createBoardFor(before, [node.id], { x: 2000, y: 2000 });
    expect(boardId).toBeDefined();

    const board = after.boards.find((candidate) => candidate.id === boardId)!;
    expect(board.kind).toBe("user");
    expect(board.title).toBe("Board 1");
    expect(board.x).toBe(1968);
    expect(board.y).toBe(1932);
    expect(board.w).toBe(320 + 64);

    const moved = after.nodes.find((candidate) => candidate.id === node.id)!;
    expect(moved.boardId).toBe(boardId);
    expect({ x: moved.x, y: moved.y }).toEqual({ x: 32, y: 68 });
  });

  it("sends the recorded node home again when its board is deleted", () => {
    const before = clone();
    const { doc: dragged, boardId } = createBoardFor(before, ["week02-t1-take"], { x: 2000, y: 2000 });
    const after = deleteObjects(dragged, [], [boardId!]);

    expect(after.boards.find((board) => board.id === boardId)).toBeUndefined();
    const returned = after.nodes.find((node) => node.id === "week02-t1-take")!;
    expect(returned.boardId).toBe("week-02");
    expect(after.nodes.filter((node) => node.boardId === "week-02").length).toBe(10);
  });
});

// Seen red: had mergeStoredDoc take the stored node wholesale rather than
// only its position, so a stored copy of week05-t3 could point anywhere.
// Failed with "expected 'https://example.invalid/evil.mp4' to be
// '/studio/week05-t3.mp4'".
describe("storage remembers where things sit, never what a take is", () => {
  const assetPrefix = (doc.nodes.find((node): node is TakeNode => node.type === "take")!.file.match(/^.*\/studio\//) ??
    ["/studio/"])[0];

  it("takes positions from storage and identity from the build", () => {
    const built = clone();
    const original = built.nodes.find((node): node is TakeNode => node.id === "week05-t3-take")!;
    const merged = mergeStoredDoc(
      built,
      {
        version: 1,
        nodes: [{ id: "week05-t3-take", boardId: "week-05", x: 999, y: 111, file: "https://example.invalid/evil.mp4" }],
      },
      { assetPrefix },
    );

    const node = merged.nodes.find((candidate): candidate is TakeNode => candidate.id === "week05-t3-take")!;
    expect({ x: node.x, y: node.y }).toEqual({ x: 999, y: 111 });
    expect(node.file).toBe(original.file);
  });

  it("refuses a stored take pointing outside the studio's own assets", () => {
    const built = clone();
    const merged = mergeStoredDoc(
      built,
      {
        version: 1,
        boards: [{ id: "board-x", title: "Board 1", x: 0, y: 3000, w: 384, h: 669, kind: "user", order: 99 }],
        nodes: [
          {
            id: "desk-evil",
            boardId: "board-x",
            type: "take",
            file: "https://example.invalid/evil.mp4",
            origin: { kind: "desk", refNodeIds: [], prompt: "", at: "" },
          },
        ],
      },
      { assetPrefix },
    );

    expect(merged.boards.find((board) => board.id === "board-x")).toBeDefined();
    expect(merged.nodes.find((node) => node.id === "desk-evil")).toBeUndefined();
  });

  it("ignores a stored document written by an older version", () => {
    const built = clone();
    const merged = mergeStoredDoc(built, { version: 0, nodes: [] }, { assetPrefix });
    expect(merged.nodes.length).toBe(built.nodes.length);
  });
});
