import type { ClientWeek } from "../../../lib/studio-client";

export interface RunInput {
  week: number;
  tierId: string;
}

export interface RunProgress {
  phase: "queued" | "loading" | "done";
  percent: number;
}

export interface RunResult {
  week: number;
  tierId: string;
  tier: string;
  label: string;
  outputKind: "video" | "image";
  file: string;
  poster?: string;
  cuts?: string[];
}

// A live backend plugs in later behind this same interface; this round
// ships only Backend["recorded"] below.
export interface Backend {
  id: string;
  label: string;
  capabilities: string[];
  run(input: RunInput, onProgress: (progress: RunProgress) => void): Promise<RunResult>;
}

export type WeekLookup = (weekNumber: number) => ClientWeek | undefined;
