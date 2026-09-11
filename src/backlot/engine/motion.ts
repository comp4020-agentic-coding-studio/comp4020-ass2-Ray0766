// Whether the reader asked for less motion, read live rather than once.
//
// Once is not enough: macOS flips this preference without a reload, and the
// branch it gates is the whole difference between a scene that drifts and one
// that holds still. A value captured at boot would leave a reader who turned
// the preference on mid-visit watching the camera breathe at them, and it
// would leave me unable to watch either branch run without restarting the
// page — which is how a conditional branch ends up shipped unobserved
// (CLAUDE.md §7).

export interface MotionPreference {
  /** True when the reader asked for less motion. */
  readonly reduced: boolean;
  /** Fires on a change. Returns an unsubscribe. */
  onChange(handler: (reduced: boolean) => void): () => void;
  dispose(): void;
}

export function createMotionPreference(): MotionPreference {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handlers = new Set<(reduced: boolean) => void>();

  const announce = () => {
    for (const handler of handlers) handler(query.matches);
  };
  query.addEventListener("change", announce);

  return {
    get reduced() {
      return query.matches;
    },
    onChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose() {
      query.removeEventListener("change", announce);
      handlers.clear();
    },
  };
}
