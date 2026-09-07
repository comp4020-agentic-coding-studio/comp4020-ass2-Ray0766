// Compare: what goes in the lightbox, in what order, and how several clips
// stay on one clock.
//
// The Studio's whole teaching move is "these two differ by one thing" — the
// ladder on a lecture page says it in prose, and this says it by putting the
// takes next to each other at the same height with one transport under them.
// Everything here is pure: the panel list is a selection turned into an order,
// and the sync is a reducer over `currentTime` readings, so the thing that
// actually has to be right (nothing drifts more than a frame) is checked
// without a browser.

import type { CanvasDoc, ID, TakeNode } from "./types";

/** Two is a comparison; six is a contact sheet, and at 1920 the sixth panel is
 *  240px wide. */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

/** The rig records at 24 fps (every manifest says so), so a frame is the unit
 *  a viewer can actually see two clips disagree by. */
export const COMPARE_FPS = 24;
export const FRAME_SECONDS = 1 / COMPARE_FPS;

/** The takes in a selection, in the order they were selected, as far as the
 *  lightbox will show. Anything that is not a take — an input card, a
 *  placeholder still running — is not comparable and is dropped rather than
 *  shown as a gap. */
export function comparePanels(doc: CanvasDoc, selection: ID[]): TakeNode[] {
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  const takes: TakeNode[] = [];
  for (const id of selection) {
    const node = byId.get(id);
    if (node?.type === "take") takes.push(node);
    if (takes.length === COMPARE_MAX) break;
  }
  return takes;
}

export function canCompare(doc: CanvasDoc, selection: ID[]): boolean {
  const takes = comparePanels(doc, selection);
  return takes.length >= COMPARE_MIN;
}

/** Every take on one board, in the order the board holds them — which for a
 *  recorded board is the manifest's own tier order. */
export function boardTakes(doc: CanvasDoc, boardId: ID): ID[] {
  return doc.nodes
    .filter((node): node is TakeNode => node.type === "take" && node.boardId === boardId)
    .map((node) => node.id)
    .slice(0, COMPARE_MAX);
}

export interface ClipReading {
  id: ID;
  /** Where the clip actually is, as the element reports it. */
  currentTime: number;
  /** Its own length; clips in a comparison are rarely the same length. */
  duration: number;
}

export interface ClipCorrection {
  id: ID;
  seekTo: number;
}

/** Where the shared clock can go: no further than the longest clip. */
export function clampClock(clock: number, readings: ClipReading[]): number {
  const longest = readings.reduce((max, clip) => Math.max(max, clip.duration), 0);
  return Math.min(Math.max(0, clock), longest);
}

/**
 * The clips that have drifted, and where to put them.
 *
 * A clip shorter than the clock is held on its last frame rather than
 * restarted or hidden: the comparison is "at this moment in the take", and a
 * take that has ended has ended. Only clips further than one frame from where
 * they should be are corrected, because seeking a video that is already right
 * is what makes playback stutter.
 */
export function driftCorrections(
  readings: ClipReading[],
  clock: number,
  tolerance: number = FRAME_SECONDS,
): ClipCorrection[] {
  return readings.flatMap((clip) => {
    const target = Math.min(clock, clip.duration);
    return Math.abs(clip.currentTime - target) > tolerance ? [{ id: clip.id, seekTo: target }] : [];
  });
}

/** Whether a set of readings is in sync — the property the corrections exist
 *  to restore, stated once so the spec and the loop agree on what it means. */
export function inSync(readings: ClipReading[], clock: number, tolerance: number = FRAME_SECONDS): boolean {
  return driftCorrections(readings, clock, tolerance).length === 0;
}

/** Arrow keys walk the panels and stop at the ends; there is no wrap, because
 *  a comparison has a leftmost and a rightmost and losing that is disorienting
 *  when the pictures are nearly identical. */
export function nextPanel(index: number, delta: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index + delta));
}
