import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  cutLibrarySchema,
  referenceEpisodeSchema,
  weekManifestSchema,
  type CutLibrary,
  type ReferenceEpisode,
  type Tier,
  type WeekManifest,
} from "../data/studio.schema.ts";

const dataDir = fileURLToPath(new URL("../data/studio/", import.meta.url));

function readText(relativePath: string): string {
  return readFileSync(`${dataDir}${relativePath}`, "utf-8").trimEnd();
}

// A tier's `prompt_file`/`neg_file` point at a real file on disk instead of
// inlining the text in the manifest, the same way the source production
// bundle keeps prompts as separate files. This reads that text in once, at
// build time, and attaches it to the parsed tier so the console never fetches
// or reads a file client-side.
function withPromptText(tier: Tier): Tier & { promptText?: string; negText?: string } {
  const input = tier.input as Record<string, unknown>;
  const promptFile = typeof input.prompt_file === "string" ? input.prompt_file : undefined;
  const negFile = typeof input.neg_file === "string" ? input.neg_file : undefined;
  return {
    ...tier,
    ...(promptFile ? { promptText: readText(promptFile) } : {}),
    ...(negFile ? { negText: readText(negFile) } : {}),
  };
}

function loadWeek(fileName: string): WeekManifest & { tiers: ReturnType<typeof withPromptText>[] } {
  const raw = JSON.parse(readFileSync(`${dataDir}${fileName}`, "utf-8"));
  const parsed = weekManifestSchema.parse(raw);
  return { ...parsed, tiers: parsed.tiers.map(withPromptText) };
}

const weekFiles = [
  "week-02.json",
  "week-03.json",
  "week-04.json",
  "week-05.json",
  "week-06.json",
  "week-07.json",
  "week-08.json",
  "week-09.json",
] as const;

export const studioWeeks = weekFiles.map(loadWeek);

export const cutLibrary: CutLibrary = cutLibrarySchema.parse(
  JSON.parse(readFileSync(`${dataDir}cut.json`, "utf-8")),
);

export const referenceEpisode: ReferenceEpisode = referenceEpisodeSchema.parse(
  JSON.parse(readFileSync(`${dataDir}reference.json`, "utf-8")),
);

export function findTier(weekNumber: number, tierId: string) {
  const week = studioWeeks.find((w) => w.week === weekNumber);
  return week?.tiers.find((t) => t.id === tierId || t.tier === tierId);
}
