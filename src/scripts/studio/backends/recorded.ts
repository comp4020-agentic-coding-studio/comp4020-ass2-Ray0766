import type { ClientWeek } from "../../../lib/studio-client";
import type { Backend, RunInput, RunProgress, RunResult } from "./types";

// Fixed, wall-clock-independent progress steps: no Math.random and no timer
// keyed off Date.now, so two calls for the same tier resolve the exact same
// sequence and the same RunResult — the recorded backend is deterministic by
// construction, not by coincidence.
const PROGRESS_STEPS: RunProgress[] = [
  { phase: "queued", percent: 0 },
  { phase: "loading", percent: 35 },
  { phase: "loading", percent: 70 },
  { phase: "done", percent: 100 },
];
const STEP_DELAY_MS = 180;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRecordedBackend(weeks: ClientWeek[]): Backend {
  return {
    id: "recorded",
    label: "Recorded",
    capabilities: ["video", "image"],
    async run(input: RunInput, onProgress: (progress: RunProgress) => void): Promise<RunResult> {
      const week = weeks.find((candidate) => candidate.week === input.week);
      const tier = week?.tiers.find((candidate) => candidate.id === input.tierId || candidate.tier === input.tierId);

      if (!week || !tier) {
        throw new Error(`No recorded result for week ${input.week}, tier ${input.tierId}.`);
      }

      for (const step of PROGRESS_STEPS) {
        onProgress(step);
        if (step.phase !== "done") await wait(STEP_DELAY_MS);
      }

      return {
        week: week.week,
        tierId: tier.id,
        tier: tier.tier,
        label: tier.label,
        outputKind: tier.output.kind,
        file: tier.output.file,
        poster: tier.output.poster,
        cuts: tier.output.cuts,
      };
    },
  };
}
