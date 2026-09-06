import { z } from "astro/zod";

// Size-rule constants, shared with spec/studio.test.ts.
export const SINGLE_CLIP_MAX = 1_300_000;
export const POSTER_MAX = 300_000;

const nonEmpty = z.string().trim().min(1);

// Every `kind` string below is copied verbatim from the real production
// manifests — the field names differ by kind (`value` vs `file`) because
// the real data isn't normalised, and this schema doesn't normalise it either.
const tierInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("seed"), value: z.number(), prompt_file: nonEmpty }),
  z.object({ kind: z.literal("prompt"), prompt_file: nonEmpty, neg_file: nonEmpty.optional() }),
  z.object({
    kind: z.literal("image"),
    file: nonEmpty,
    prompt_file: nonEmpty.optional(),
    neg_file: nonEmpty.optional(),
  }),
  z.object({ kind: z.literal("image pair"), file: z.array(nonEmpty).length(2), prompt_file: nonEmpty }),
  z.object({ kind: z.literal("reference set"), value: z.array(nonEmpty).min(1), prompt_file: nonEmpty }),
  z.object({ kind: z.literal("graph"), file: nonEmpty, prompt_file: nonEmpty.optional() }),
  z.object({ kind: z.literal("upscale"), file: nonEmpty }),
  z.object({ kind: z.literal("script"), file: nonEmpty, prompt_file: nonEmpty }),
]);

const tierOutputSchema = z.object({
  kind: z.enum(["video", "image"]),
  file: nonEmpty,
  poster: nonEmpty.optional(),
  cuts: z.array(nonEmpty).optional(),
  bytes: z.number().positive().optional(),
  crf: z.number().optional(),
  limit_bytes: z.number().positive().optional(),
  poster_bytes: z.number().positive().optional(),
  cuts_bytes: z.array(z.number().positive()).optional(),
});

const tierSchema = z.object({
  id: nonEmpty,
  tier: nonEmpty,
  sameAs: nonEmpty.optional(),
  label: nonEmpty,
  input: tierInputSchema,
  output: tierOutputSchema,
  note: nonEmpty,
  counterExample: z.boolean().optional(),
});

export const weekManifestSchema = z.object({
  week: z.number().int().min(1).max(12),
  instrument: nonEmpty,
  model: nonEmpty,
  mode: nonEmpty,
  seed: z.union([z.number(), z.array(z.number())]).optional(),
  resolution: nonEmpty,
  fps: z.number().positive().optional(),
  prompt: z.string(),
  tiers: z.array(tierSchema).min(3).max(5),
  packaging: z
    .object({ crf: z.number().optional(), limit_bytes: z.number().positive(), note: z.string().optional() })
    .optional(),
});

const cutClipSchema = z.object({
  id: nonEmpty,
  shot: nonEmpty,
  start_s: z.number().nonnegative(),
  end_s: z.number().positive(),
  duration_s: z.number().positive(),
  master_frames: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  timecode: nonEmpty,
  file: nonEmpty,
  poster: nonEmpty,
  resolution: nonEmpty,
  crf: z.number(),
  bytes: z.number().positive(),
  limit_bytes: z.number().positive(),
  poster_bytes: z.number().positive(),
  crf_tag: z.number().optional(),
  frames_probe: z.number().optional(),
});

export const cutLibrarySchema = z
  .object({
    kind: z.literal("cut library"),
    source: nonEmpty,
    source_resolution: nonEmpty,
    fps: z.number().positive(),
    burned_text: z.boolean(),
    note: z.string().optional(),
    cuts: z.array(cutClipSchema).min(1),
    subtitle_drafts: z
      .array(
        z.object({
          set: nonEmpty,
          file: nonEmpty,
          lines: z.array(z.object({ cut: nonEmpty, text: nonEmpty })).min(1),
        }),
      )
      .min(1),
    corner_label: z.object({ text: nonEmpty, only_on: nonEmpty }),
    subtitle_source: z.string().optional(),
    selfcheck_verdict: nonEmpty,
  })
  .loose();

const referenceOutputSchema = z
  .object({
    file: nonEmpty,
    bytes: z.number().positive(),
    resolution: nonEmpty.optional(),
    limit_bytes: z.number().positive().optional(),
    crf: z.number().optional(),
    crf_tag: z.number().optional(),
    video_stream: z.string().optional(),
  })
  .loose();

// `reference.json` is a full production log; only the fields the reference-
// episode block in Week 10 renders are validated strictly. Everything else
// (segments, takes, bgm, pipeline, selfcheck, ...) is real data this schema
// doesn't need to shape-check, so it passes through unvalidated.
export const referenceEpisodeSchema = z
  .object({
    title: nonEmpty,
    kind: z.literal("reference episode"),
    model: nonEmpty,
    mode: nonEmpty,
    fps: z.number().positive(),
    duration_s: z.number().positive(),
    frames: z.number().positive(),
    resolution: z.object({
      generated: nonEmpty,
      upscaled: nonEmpty,
      master: nonEmpty,
      web: nonEmpty,
    }),
    cards: z
      .array(
        z.object({
          id: nonEmpty,
          text: z.array(nonEmpty).min(1),
          start_s: z.number().nonnegative(),
          end_s: z.number().positive(),
          timecode: nonEmpty,
          first_frame: z.number().optional(),
          last_frame: z.number().optional(),
          png: z.string().optional(),
          note: z.string().optional(),
        }),
      )
      .min(1),
    outputs: z.object({
      master: referenceOutputSchema,
      web: referenceOutputSchema,
      poster: referenceOutputSchema,
    }),
  })
  .loose();

export type WeekManifest = z.infer<typeof weekManifestSchema>;
export type CutLibrary = z.infer<typeof cutLibrarySchema>;
export type ReferenceEpisode = z.infer<typeof referenceEpisodeSchema>;
export type Tier = z.infer<typeof tierSchema>;
