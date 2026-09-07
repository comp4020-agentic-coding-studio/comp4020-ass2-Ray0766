// What was asked and what the rig answered, in order.
//
// The canvas already holds every result; this holds the asking. A rig turn
// therefore stores a node id and nothing else about the node: the poster it
// shows, the board it names and whether it is still there are all read off the
// document at render time, so one node is one node whether you are looking at
// the thread or at the canvas. That is also what makes "removed" honest — a
// turn whose node is gone says so rather than showing a picture of something
// that is no longer on the canvas.
//
// The thread is stored under its own key rather than inside the document. The
// document type is the contract the layout module, the engine adapter and the
// spec all work against, and a thread is not part of it.

import type { CanvasDoc, ID, Node } from "./types";

export const THREAD_VERSION = 1 as const;
export const THREAD_STORAGE_KEY = "studio:thread";

/** What the visitor put on the desk: the week, the run they picked, and the
 *  prompt as it stood when they pressed Generate. */
export interface UserTurn {
  id: string;
  role: "user";
  at: string;
  week: number;
  tierId: string;
  /** The tier's own label, e.g. "first frame + last frame (FL2VA)". */
  label: string;
  /** The manifest's own input kind, verbatim. */
  kind: string;
  /** A picture the rig was handed, where it was handed one. */
  thumbnail?: string;
  prompt: string;
  /** How many cards were on the desk, so a multi-turn ask reads as one. */
  references: number;
}

/** A run the rig replayed. */
export interface RigTurn {
  id: string;
  role: "rig";
  at: string;
  kind: "replayed";
  nodeId: ID;
  /** `Replayed SLOP8760/W05/t3/66740 · MiniMax H3 · T2VA · 576x1024` */
  planLine: string;
}

/** One of the five answers. A refusal is a rig turn like any other: same
 *  column, same register, no apology. */
export interface RefusalTurn {
  id: string;
  role: "rig";
  at: string;
  kind: "refused";
  /** The key into DESK_MESSAGES, so the wording lives in one place. */
  answer: string;
  /** Only for "prompt-differs": what the rig was actually given. */
  recordedInput?: string;
}

export type ThreadMessage = UserTurn | RigTurn | RefusalTurn;

export interface Thread {
  version: typeof THREAD_VERSION;
  messages: ThreadMessage[];
}

export function emptyThread(): Thread {
  return { version: THREAD_VERSION, messages: [] };
}

export function appendMessages(thread: Thread, ...messages: ThreadMessage[]): Thread {
  return { ...thread, messages: [...thread.messages, ...messages] };
}

/** A rig turn's node, if it is still on the canvas. The two views of one node
 *  are the thread's whole point, so this is the only way the thread reads it. */
export type TurnTarget =
  | { kind: "live"; node: Node; boardId: ID; boardTitle: string; boardWeek?: number }
  | { kind: "removed" };

export function resolveTurn(turn: RigTurn, doc: CanvasDoc): TurnTarget {
  const node = doc.nodes.find((candidate) => candidate.id === turn.nodeId);
  if (!node) return { kind: "removed" };
  const board = doc.boards.find((candidate) => candidate.id === node.boardId);
  return {
    kind: "live",
    node,
    boardId: node.boardId,
    boardTitle: board?.title ?? node.boardId,
    boardWeek: board?.week,
  };
}

export function isRigTurn(message: ThreadMessage): message is RigTurn {
  return message.role === "rig" && (message as RigTurn).kind === "replayed";
}

export function isRefusal(message: ThreadMessage): message is RefusalTurn {
  return message.role === "rig" && (message as RefusalTurn).kind === "refused";
}

// ---------------------------------------------------------------------------
// Storage. Same bargain as the document's: a browser that refuses to hand over
// localStorage gets an unsaved but working thread, never an error.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Only a message this module could have written comes back. A stored thread
 *  is the one part of the Studio a visitor can edit by hand, and a turn with a
 *  prompt but no tier — or a rig turn pointing at nothing — would render as a
 *  hole rather than as a message. */
export function acceptMessage(raw: unknown): ThreadMessage | undefined {
  if (!isRecord(raw)) return undefined;
  const { id, role, at } = raw;
  if (typeof id !== "string" || typeof at !== "string") return undefined;

  if (role === "user") {
    if (typeof raw.tierId !== "string" || typeof raw.prompt !== "string") return undefined;
    if (typeof raw.week !== "number") return undefined;
    return raw as unknown as UserTurn;
  }

  if (role !== "rig") return undefined;
  if (raw.kind === "replayed") {
    if (typeof raw.nodeId !== "string" || typeof raw.planLine !== "string") return undefined;
    return raw as unknown as RigTurn;
  }
  if (raw.kind === "refused") {
    if (typeof raw.answer !== "string") return undefined;
    return raw as unknown as RefusalTurn;
  }
  return undefined;
}

export function parseThread(raw: unknown): Thread | undefined {
  if (!isRecord(raw) || raw.version !== THREAD_VERSION) return undefined;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.flatMap((entry) => {
        const message = acceptMessage(entry);
        return message ? [message] : [];
      })
    : [];
  return { version: THREAD_VERSION, messages };
}

export function readStoredThread(storage?: Pick<Storage, "getItem">): Thread {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    const raw = store?.getItem(THREAD_STORAGE_KEY);
    if (!raw) return emptyThread();
    return parseThread(JSON.parse(raw) as unknown) ?? emptyThread();
  } catch {
    return emptyThread();
  }
}

export function writeThread(thread: Thread, storage?: Pick<Storage, "setItem">): void {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    store?.setItem(THREAD_STORAGE_KEY, JSON.stringify(thread));
  } catch {
    /* the desk keeps working, it just stops remembering */
  }
}

export function clearThread(storage?: Pick<Storage, "removeItem">): void {
  try {
    const store = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    store?.removeItem(THREAD_STORAGE_KEY);
  } catch {
    /* nothing to undo */
  }
}
