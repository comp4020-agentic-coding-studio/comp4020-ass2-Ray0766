// Three small contexts the cards read: what the toolbar buttons do, which
// clip is allowed to be playing, and whether the reader asked for less
// motion. Kept out of node `data` on purpose — data changes rebuild every
// node, and selecting one take should not re-render forty cards.

import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ClientTier, ClientWeek } from "../../lib/studio-client";

export interface CanvasActions {
  addToDesk(nodeId: string): void;
}

const ActionsContext = createContext<CanvasActions>({ addToDesk: () => undefined });
export const CanvasActionsProvider = ActionsContext.Provider;
export function useCanvasActions(): CanvasActions {
  return useContext(ActionsContext);
}

/** The manifests, indexed by tier id, so a card can show its own recorded
 *  prompt without the build writing that text into the page a second time. */
export interface TierEntry {
  week: ClientWeek;
  tier: ClientTier;
}

const TierIndexContext = createContext<Map<string, TierEntry>>(new Map());
export const TierIndexProvider = TierIndexContext.Provider;

export function useTierIndex(): Map<string, TierEntry> {
  return useContext(TierIndexContext);
}

export function useTier(tierId: string | undefined): TierEntry | undefined {
  const index = useTierIndex();
  return tierId ? index.get(tierId) : undefined;
}

export function buildTierIndex(weeks: ClientWeek[]): Map<string, TierEntry> {
  const index = new Map<string, TierEntry>();
  for (const week of weeks) for (const tier of week.tiers) index.set(tier.id, { week, tier });
  return index;
}

type RenameBoard = (boardId: string, title: string) => void;

const RenameContext = createContext<RenameBoard>(() => undefined);
export const BoardRenameProvider = RenameContext.Provider;
export function useBoardRename(): RenameBoard {
  return useContext(RenameContext);
}

export interface Playback {
  playingId: string | undefined;
  setPlayingId: Dispatch<SetStateAction<string | undefined>>;
}

const PlaybackContext = createContext<Playback>({ playingId: undefined, setPlayingId: () => undefined });
export const PlaybackProvider = PlaybackContext.Provider;
export function usePlayback(): Playback {
  return useContext(PlaybackContext);
}

/** Read live rather than once: the OS setting can change while the page is
 *  open, and a canvas that keeps easing after it changed is the bug this
 *  media query exists to prevent. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}
