import { withBase } from "astro-theme-university/url";
import type { Tier, WeekManifest } from "../data/studio.schema";

type TierWithText = Tier & { promptText?: string; negText?: string };
type WeekWithText = Omit<WeekManifest, "tiers"> & { tiers: TierWithText[] };

export interface ClientTierInput {
  kind: string;
  value?: number;
  files?: string[];
  promptText?: string;
  negText?: string;
}

export interface ClientTierOutput {
  kind: "video" | "image";
  file: string;
  poster?: string;
  cuts?: string[];
}

export interface ClientTier {
  id: string;
  tier: string;
  label: string;
  note: string;
  sameAs?: string;
  counterExample?: boolean;
  input: ClientTierInput;
  output: ClientTierOutput;
}

export interface ClientWeek {
  week: number;
  instrument: string;
  model: string;
  mode: string;
  resolution: string;
  seed?: number | number[];
  tiers: ClientTier[];
}

function assetUrl(file: string): string {
  return withBase(`/studio/${file}`);
}

// `inputs/**` paths are prompt/negative text read at build time (see
// src/lib/studio.ts) and never copied into public/ — only a bare filename
// (no directory) was copied into public/studio/ and can become a URL.
function isPublicFile(file: string): boolean {
  return !file.includes("/");
}

function toClientInput(input: Record<string, unknown>, promptText?: string, negText?: string): ClientTierInput {
  const files: string[] = [];
  const rawFile = input.file;
  const rawValue = input.value;

  if (typeof rawFile === "string" && isPublicFile(rawFile)) files.push(assetUrl(rawFile));
  if (Array.isArray(rawFile)) {
    for (const entry of rawFile) if (typeof entry === "string" && isPublicFile(entry)) files.push(assetUrl(entry));
  }
  if (Array.isArray(rawValue)) {
    for (const entry of rawValue) if (typeof entry === "string" && isPublicFile(entry)) files.push(assetUrl(entry));
  }

  return {
    kind: input.kind as string,
    value: typeof rawValue === "number" ? rawValue : undefined,
    files: files.length ? files : undefined,
    promptText,
    negText,
  };
}

function toClientOutput(output: Tier["output"]): ClientTierOutput {
  return {
    kind: output.kind,
    file: assetUrl(output.file),
    poster: output.poster ? assetUrl(output.poster) : undefined,
    cuts: output.cuts?.map(assetUrl),
  };
}

export function toClientWeek(week: WeekWithText): ClientWeek {
  return {
    week: week.week,
    instrument: week.instrument,
    model: week.model,
    mode: week.mode,
    resolution: week.resolution,
    seed: week.seed,
    tiers: week.tiers.map((tier) => ({
      id: tier.id,
      tier: tier.tier,
      label: tier.label,
      note: tier.note,
      sameAs: tier.sameAs,
      counterExample: tier.counterExample,
      input: toClientInput(tier.input as Record<string, unknown>, tier.promptText, tier.negText),
      output: toClientOutput(tier.output),
    })),
  };
}
