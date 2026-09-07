// The desk's thread: what was asked, what the rig answered, and the fact that
// a rig turn and the card on the canvas are one node rather than two.
//
// Everything here is pure. The round trip is the storage functions against a
// fake Storage, and "removed" is `resolveTurn` against a document the node is
// no longer in — which is exactly what the component renders from.

import { describe, expect, it } from "vitest";
import { canvasBundle } from "../src/lib/canvas/build";
import { addTier, emptyCanvasDoc } from "../src/lib/canvas/session";
import {
  appendMessages,
  emptyThread,
  isRefusal,
  isRigTurn,
  parseThread,
  readStoredThread,
  resolveTurn,
  writeThread,
  clearThread,
  THREAD_STORAGE_KEY,
  type RefusalTurn,
  type RigTurn,
  type Thread,
  type UserTurn,
} from "../src/lib/canvas/thread";
import type { CanvasDoc } from "../src/lib/canvas/types";

const built = canvasBundle.doc;

/** Enough of the Storage interface for the three functions under test. */
function fakeStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage & { map: Map<string, string> };
}

function ask(tierId: string, week: number, at: string): UserTurn {
  return {
    id: `ask-${tierId}`,
    role: "user",
    at,
    week,
    tierId,
    label: "a recorded run",
    kind: "prompt",
    prompt: "the prompt the rig was actually given",
    references: 0,
  };
}

function replayed(tierId: string, at: string): RigTurn {
  return {
    id: `rig-${tierId}`,
    role: "rig",
    at,
    kind: "replayed",
    nodeId: `${tierId}-take`,
    planLine: `Replayed ${tierId}`,
  };
}

/** Two runs, the way the desk writes them: ask, answer, ask, answer. */
function twoTurns(): { thread: Thread; doc: CanvasDoc } {
  const thread = appendMessages(
    emptyThread(),
    ask("week05-t3", 5, "2026-09-08T01:00:00.000Z"),
    replayed("week05-t3", "2026-09-08T01:00:01.000Z"),
    ask("week02-t1", 2, "2026-09-08T01:01:00.000Z"),
    replayed("week02-t1", "2026-09-08T01:01:01.000Z"),
  );
  const doc = addTier(addTier(emptyCanvasDoc(), built, "week05-t3"), built, "week02-t1");
  return { thread, doc };
}

// Seen red by having `parseThread` build its message list and then return an
// empty one — the shape of an over-strict accept that drops every turn:
//   AssertionError: both turns come back from storage: expected +0 to be 4
//   AssertionError: expected +0 to be 2
// then reverted.
describe("the thread survives a reload and still points at live nodes", () => {
  it("round-trips two generations through storage", () => {
    const { thread, doc } = twoTurns();
    const storage = fakeStorage();

    writeThread(thread, storage);
    const back = readStoredThread(storage);

    expect(back.messages.length, "both turns come back from storage").toBe(4);
    expect(back.messages.map((message) => message.id)).toEqual(thread.messages.map((message) => message.id));

    for (const message of back.messages.filter(isRigTurn)) {
      const target = resolveTurn(message, doc);
      expect(target.kind, `${message.nodeId} is still on the canvas`).toBe("live");
      if (target.kind === "live") {
        expect(target.node.id).toBe(message.nodeId);
        // The board name is read off the document, never stored in the turn:
        // renaming a board renames it in the thread too.
        expect(target.boardTitle).toBe(built.boards.find((board) => board.id === target.boardId)?.title);
      }
    }
  });

  it("keeps the asking as well as the answering", () => {
    const { thread } = twoTurns();
    const storage = fakeStorage();
    writeThread(thread, storage);
    const back = readStoredThread(storage);
    const asks = back.messages.filter((message) => message.role === "user");
    expect(asks.length).toBe(2);
    expect((asks[0] as UserTurn).prompt).toBe("the prompt the rig was actually given");
  });

  // Seen red by having resolveTurn return the turn's own nodeId as a live
  // target rather than looking it up (`return { kind: "live", … }` before the
  // find):
  //   AssertionError: a turn whose node has gone reads as removed: expected
  //   'live' to be 'removed'
  // then reverted.
  it("says so when the node behind a turn has gone", () => {
    const { thread, doc } = twoTurns();
    const pruned: CanvasDoc = { ...doc, nodes: doc.nodes.filter((node) => node.id !== "week05-t3-take") };

    const turns = thread.messages.filter(isRigTurn);
    expect(resolveTurn(turns[0], pruned).kind, "a turn whose node has gone reads as removed").toBe("removed");
    expect(resolveTurn(turns[1], pruned).kind, "the other turn is untouched").toBe("live");
  });

  it("is emptied by Clear canvas", () => {
    const { thread } = twoTurns();
    const storage = fakeStorage();
    writeThread(thread, storage);
    clearThread(storage);
    expect(storage.map.has(THREAD_STORAGE_KEY)).toBe(false);
    expect(readStoredThread(storage).messages).toEqual([]);
  });

  it("survives a browser that refuses storage rather than throwing", () => {
    const refuses = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;

    expect(readStoredThread(refuses).messages).toEqual([]);
    expect(() => writeThread(emptyThread(), refuses)).not.toThrow();
    expect(() => clearThread(refuses)).not.toThrow();
  });
});

describe("a refusal is a rig turn like any other", () => {
  it("stores the answer key rather than the sentence, so the wording lives in one place", () => {
    const refusal: RefusalTurn = {
      id: "rig-1",
      role: "rig",
      at: "2026-09-08T01:00:00.000Z",
      kind: "refused",
      answer: "prompt-differs",
      recordedInput: "66740",
    };
    const storage = fakeStorage();
    writeThread(appendMessages(emptyThread(), refusal), storage);

    const back = readStoredThread(storage).messages;
    expect(back.length).toBe(1);
    expect(isRefusal(back[0])).toBe(true);
    expect(isRigTurn(back[0]), "a refusal is not a replay").toBe(false);
    expect((back[0] as RefusalTurn).answer).toBe("prompt-differs");
  });
});

describe("a stored thread is read defensively", () => {
  it("drops a version it does not know", () => {
    expect(parseThread({ version: 99, messages: [ask("week05-t3", 5, "x")] })).toBeUndefined();
  });

  it("drops a message it could not have written", () => {
    const thread = parseThread({
      version: 1,
      messages: [
        { id: "a", role: "user", at: "x" },
        { id: "b", role: "rig", at: "x", kind: "replayed" },
        { id: "c", role: "rig", at: "x", kind: "refused", answer: "no-reference" },
      ],
    });
    expect(thread?.messages.map((message) => message.id)).toEqual(["c"]);
  });
});
