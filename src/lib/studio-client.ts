import { withBase } from "astro-theme-university/url";
import type { ReferenceEpisode, Tier, WeekManifest } from "../data/studio.schema";

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

// `reference.json`'s own output paths keep their original "final/" prefix
// (week manifests don't); strip it so both shapes land on the same flat
// public/studio/ layout the copy step actually produced.
function stripFinalPrefix(file: string): string {
  return file.startsWith("final/") ? file.slice("final/".length) : file;
}

function assetUrl(file: string): string {
  return withBase(`/studio/${stripFinalPrefix(file)}`);
}

// `inputs/**` paths are prompt/negative text read at build time (see
// src/lib/studio.ts) and never copied into public/ — only a bare filename
// (no directory, or a "final/"-prefixed one) was copied into public/studio/
// and can become a URL.
function isPublicFile(file: string): boolean {
  return !stripFinalPrefix(file).includes("/");
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

export interface ClientReferenceCard {
  id: string;
  lines: string[];
  timecode: string;
}

export interface ClientReferenceEpisode {
  title: string;
  model: string;
  mode: string;
  duration_s: number;
  video: string;
  poster: string;
  cards: ClientReferenceCard[];
}

// `outputs.master` is metadata only (never copied to public/) and is
// deliberately not surfaced here — only `web` (the playable clip) and
// `poster` (its still) ever become a src.
export function toClientReferenceEpisode(ref: ReferenceEpisode): ClientReferenceEpisode {
  return {
    title: ref.title,
    model: ref.model,
    mode: ref.mode,
    duration_s: ref.duration_s,
    video: assetUrl(ref.outputs.web.file),
    poster: assetUrl(ref.outputs.poster.file),
    cards: ref.cards.map((card) => ({
      id: card.id,
      lines: card.text,
      timecode: card.timecode,
    })),
  };
}
