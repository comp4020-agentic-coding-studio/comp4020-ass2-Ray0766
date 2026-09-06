import {
  cutLibrarySchema,
  referenceEpisodeSchema,
  weekManifestSchema,
  type CutLibrary,
  type ReferenceEpisode,
  type Tier,
  type WeekManifest,
} from "../data/studio.schema.ts";

// Vite inlines these at build time (import.meta.glob), instead of reading
// off disk with node:fs — a runtime readFileSync resolved against
// import.meta.url breaks once this module is bundled into the prerender
// output, because the emitted chunk no longer lives next to src/data/studio/.
const DATA_PREFIX = "../data/studio/";
const jsonFiles = import.meta.glob<Record<string, unknown>>("../data/studio/*.json", {
  eager: true,
  import: "default",
});
const promptFiles = import.meta.glob<string>("../data/studio/inputs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

function readJson(fileName: string): Record<string, unknown> {
  const raw = jsonFiles[`${DATA_PREFIX}${fileName}`];
  if (!raw) throw new Error(`Studio manifest not found: ${fileName}`);
  return raw;
}

function readText(relativePath: string): string {
  const text = promptFiles[`${DATA_PREFIX}${relativePath}`];
  if (text === undefined) throw new Error(`Studio prompt/negative file not found: ${relativePath}`);
  return text.trimEnd();
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
  const parsed = weekManifestSchema.parse(readJson(fileName));
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

export const cutLibrary: CutLibrary = cutLibrarySchema.parse(readJson("cut.json"));

export const referenceEpisode: ReferenceEpisode = referenceEpisodeSchema.parse(readJson("reference.json"));

export function findTier(weekNumber: number, tierId: string) {
  const week = studioWeeks.find((w) => w.week === weekNumber);
  return week?.tiers.find((t) => t.id === tierId || t.tier === tierId);
}
