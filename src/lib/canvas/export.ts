// The two files the Studio hands back: the canvas, and the log.
//
// Both are built here rather than in the component, because both are the same
// claim in two shapes — this is what the rig replayed, in the order it was
// asked for — and neither should be assembled twice. No server is involved:
// they are a Blob and an object URL, the same way the per-tier log already
// worked.

import { isRigTurn, type Thread } from "./thread";
import type { CanvasDoc, ID, NodeMeta } from "./types";

export const EXPORT_VERSION = 1 as const;

/** The canvas as a file: the document exactly as the layout module produced
 *  it, plus the asking that produced it. Stamped, so a later version can tell
 *  what it is looking at. */
export interface CanvasExport {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  doc: CanvasDoc;
  thread: Thread;
}

export function buildCanvasExport(doc: CanvasDoc, thread: Thread, at: Date = new Date()): CanvasExport {
  return { version: EXPORT_VERSION, exportedAt: at.toISOString(), doc, thread };
}

/**
 * One production-log line per take the rig replayed, in the order the thread
 * asked for them. This is the per-tier log the desk already writes, extended
 * from one run to the whole session — and it is read off the thread rather
 * than off the canvas, because the canvas has no order and a log is nothing
 * without one.
 */
export function productionLogLines(thread: Thread, doc: CanvasDoc, meta: Record<ID, NodeMeta>): string[] {
  return thread.messages.flatMap((message) => {
    if (!isRigTurn(message)) return [];
    // A turn whose take has been taken off the canvas is not in the log: the
    // log is what is on the canvas, in the order it arrived.
    if (!doc.nodes.some((node) => node.id === message.nodeId)) return [];
    const line = meta[message.nodeId]?.productionLine;
    return line ? [line] : [];
  });
}

/** The log as a file. A header saying what it is and when, then the lines. */
export function productionLogText(lines: string[], at: Date = new Date()): string {
  return [
    `# SLOP8760 Studio — production log`,
    `# ${at.toISOString()}`,
    `# Every line is a run the rig replayed, in the order it was asked for.`,
    `# Nothing here was generated in the browser.`,
    "",
    ...lines,
    "",
  ].join("\n");
}
