// What the two desks hand each other when the breakpoint swaps them.
//
// /studio/ has two desks that are never both live: the canvas island's desk
// above 640px, the plain form below it. Each keeps its own week, tier and
// prompt — React state on one side, three closure variables on the other — and
// until now neither had ever heard of the other. Picking week 8 on a wide
// screen, typing into the prompt, and dragging the window under 640 produced
// week 2's untouched recorded prompt, because mountPhoneDesk initialises from
// weeks[0] and nothing had ever told it otherwise.
//
// This is not a store and deliberately not one. Neither side's state moves out
// of it; there is no third copy to go stale, and nothing here survives a
// reload. It is a pair of doors: each side registers how to be read and how to
// be told, and phone-swap.ts — which is already the one place that knows a
// crossing is happening — carries the three fields from the side going out to
// the side coming in. Symmetric, because which side is the source depends
// entirely on which way the window is being dragged.
//
// Three fields and no more. A run in progress belongs to the rig that started
// it and does not travel: the recorded backend, the progress reporting and the
// resolved node all live on one side, and half-carrying them would be worse
// than not carrying them.

export interface DeskSnapshot {
  week: number;
  tierId: string;
  /** The prompt box as it stands, edits included. */
  prompt: string;
}

export interface DeskSide {
  /** The three fields as this side holds them now. */
  read(): DeskSnapshot;
  /** Take them on.
   *
   *  Both sides reset the tier when the week changes and reset the prompt when
   *  the tier changes — that is what makes the shortest path through a desk
   *  the honest one — so an implementation has to apply week, then tier, then
   *  the prompt text, or it will hand back the recorded input and drop the
   *  edit it was given. */
  apply(snapshot: DeskSnapshot): void;
}

export type DeskWhich = "canvas" | "phone";

const sides = new Map<DeskWhich, DeskSide>();

/** Registers one side, and hands back the removal so a React effect can clean
 *  up after itself. A second registration for the same side replaces the
 *  first, which is what a remount should do. */
export function registerDesk(which: DeskWhich, side: DeskSide): () => void {
  sides.set(which, side);
  return () => {
    if (sides.get(which) === side) sides.delete(which);
  };
}

/** The side, or undefined while it has not mounted yet — which is the normal
 *  state of the phone form until the first crossing, and the reason the
 *  crossing reads early and writes late. */
export function deskSide(which: DeskWhich): DeskSide | undefined {
  return sides.get(which);
}
