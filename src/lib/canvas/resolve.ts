// What the desk does with a request, decided before anything is drawn.
//
// The rig replays; it does not generate. So this is a lookup, not a model:
// a reference and a prompt either name a run the rig actually recorded, or
// they do not, and the desk says which in one line. Pure, so the round trip
// — every tier's own input resolving back to that tier, and a changed prompt
// resolving to nothing — is checked without a browser.

import { normaliseWhitespace } from "./doc";
import type { ID, Node } from "./types";

export interface TierRef {
  week: number;
  tierId: string;
  /** The tier's recorded input, whitespace-normalised. */
  recordedInput: string;
}

export type DeskResolution =
  /** The references and the prompt name a recorded run. */
  | { kind: "resolved"; week: number; tierId: string }
  /** They name a tier, but not what the rig was given for it. */
  | { kind: "prompt-differs"; week: number; tierId: string; recordedInput: string }
  /** A clip the rig cut rather than generated: the Cut's windows and the
   *  reference episode have no recorded run behind them to replay. */
  | { kind: "no-recorded-run" }
  /** References from more than one tier. */
  | { kind: "mixed-tiers" }
  /** Nothing on the desk. */
  | { kind: "no-reference" };

export const DESK_MESSAGES = {
  "prompt-differs": "The rig only replays what it recorded. Nearest recorded input for this reference:",
  "no-reference": "Add a recorded input or take from a board first.",
  // Two answers the spec's three do not cover, added rather than stretching
  // one of them over a case it would describe wrongly.
  "no-recorded-run":
    "This take was cut out of the finished episode, not generated from an input, so the rig has no run to replay. Pick a take off a week's board.",
  "mixed-tiers": "These references come from different tiers. The rig replays one recorded run at a time.",
} as const;

export interface ResolveInput {
  references: ID[];
  prompt: string;
  /** node id → the tier it belongs to, for the tiers the recorded backend
   *  actually holds. A node with no entry has no run to replay. */
  tierOf(nodeId: ID): TierRef | undefined;
}

export function resolveDeskRequest({ references, prompt, tierOf }: ResolveInput): DeskResolution {
  if (references.length === 0) return { kind: "no-reference" };

  const tiers = references.map(tierOf);
  if (tiers.every((tier) => tier === undefined)) return { kind: "no-recorded-run" };

  const known = tiers.filter((tier): tier is TierRef => tier !== undefined);
  const first = known[0];
  const sameTier = known.length === tiers.length && known.every((tier) => tier.tierId === first.tierId);
  if (!sameTier) return { kind: "mixed-tiers" };

  // Rule 1 is deliberately narrow: one reference, and the prompt is the one
  // the rig was actually given. Anything else is rule 2, which offers that
  // input rather than inventing a result for the one that was typed.
  if (references.length === 1 && normaliseWhitespace(prompt) === first.recordedInput) {
    return { kind: "resolved", week: first.week, tierId: first.tierId };
  }

  return { kind: "prompt-differs", week: first.week, tierId: first.tierId, recordedInput: first.recordedInput };
}

/** The node a reference points at, for the tier lookup above: an input card
 *  and its take both belong to the same tier. */
export function tierIdOfNode(node: Node | undefined): string | undefined {
  if (!node || node.type === "placeholder") return undefined;
  return node.tierId;
}
