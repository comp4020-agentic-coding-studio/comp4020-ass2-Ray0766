// Protects the Studio's data layer (src/data/studio.schema.ts +
// src/lib/studio.ts + src/lib/studio-client.ts): everything the console, the
// CompareSet ladders, and the Cut render comes from real production
// manifests copied verbatim from the delivered bundle, and nothing here
// double-checks the page — it checks the data those pages trust.
//
// Seen red, one bug at a time, each injected into the real file/schema/code
// then reverted, output captured verbatim:
//  - schema: renamed week-05.json's "instrument" key to "instruments".
//    "week-05.json matches weekManifestSchema" failed with a ZodError:
//    code "invalid_type", path ["instrument"], "Invalid input: expected
//    string, received undefined".
//  - referenced files: set week-06.json's week06-t1 tier's output.file to
//    "week06-t1-missing.mp4". Failed: "week-06.json tier week06-t1
//    references missing file: week06-t1-missing.mp4 (looked for
//    .../public/studio/week06-t1-missing.mp4): expected false to be true".
//  - size rule: set cut.json's cut-hook.bytes to 2000000. Failed: "cut.json
//    cut-hook's clip stays under 1300000 bytes: expected 2000000 to be less
//    than or equal to 1300000".
//  - tier contiguity: renamed week-07.json's third tier's "tier" field from
//    "t3" to "t5". Failed on the array-equality assertion, showing
//    ["t1","t2","t5","t4"] where ["t1","t2","t3","t4"] was expected.
//  - non-empty notes: set week-09.json's week09-t2 note to "   ". First
//    attempt (checking manifest.tiers, i.e. the schema-parsed result) never
//    went red at all — `note` is itself `nonEmpty` (a trimmed
//    z.string().min(1)) in studio.schema.ts, so a whitespace note already
//    fails schema validation before this describe block's own tier loop
//    ever runs, and the dedicated check never gets registered. Rewritten to
//    read the raw JSON directly, independent of schema parsing; the same
//    injected bug then failed cleanly: "week-09.json tier week09-t2's note
//    is non-empty: expected 0 to be greater than 0".
//  - "Run it in the Studio" links: changed week-05.md's session link from
//    "#week-05:t1" to "#week-05:t9". Failed: "week-05 links to week 5 tier
//    t9, which doesn't exist: expected undefined to be defined".
//  - recorded backend determinism: first attempt set one PROGRESS_STEPS
//    entry's percent to `Math.random() * 100` — that array is built once at
//    module load, so both run() calls in the same test read the same
//    already-computed value and stayed deep-equal; the bug never went red.
//    Rewritten to compute the loading percent fresh inside run()'s loop
//    (`{ ...step, percent: Math.random() * 100 }` per call) instead, which
//    failed as expected: two different "loading" percents (e.g. 92.9 vs
//    63.9, and 33.1 vs 82.4) in "expected [ …(4) ] to deeply equal [ …(4) ]".
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cutLibrarySchema,
  POSTER_MAX,
  referenceEpisodeSchema,
  SINGLE_CLIP_MAX,
  weekManifestSchema,
} from "../src/data/studio.schema";
import { toClientWeek } from "../src/lib/studio-client";
import { createRecordedBackend } from "../src/scripts/studio/backends/recorded";
import { loadContentDir } from "./lib/content";

const DATA_DIR = "src/data/studio";
const PUBLIC_DIR = "public/studio";

const WEEK_FILES = [
  "week-02.json",
  "week-03.json",
  "week-04.json",
  "week-05.json",
  "week-06.json",
  "week-07.json",
  "week-08.json",
  "week-09.json",
] as const;

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), "utf8"));
}

// Parsed once per file, catching rather than throwing at module scope: a
// single corrupted manifest must fail only its own tests below, not abort
// discovery of every other file's tests in this suite.
type WeekManifest = ReturnType<typeof weekManifestSchema.parse>;
interface WeekEntry {
  file: string;
  manifest?: WeekManifest;
  error?: unknown;
}

const weekManifests: WeekEntry[] = WEEK_FILES.map((file) => {
  try {
    return { file, manifest: weekManifestSchema.parse(readJson(file)) };
  } catch (error) {
    return { file, error };
  }
});

describe("every studio manifest validates against its schema", () => {
  for (const file of WEEK_FILES) {
    it(`${file} matches weekManifestSchema`, () => {
      expect(() => weekManifestSchema.parse(readJson(file))).not.toThrow();
    });
  }
  it("cut.json matches cutLibrarySchema", () => {
    expect(() => cutLibrarySchema.parse(readJson("cut.json"))).not.toThrow();
  });
  it("reference.json matches referenceEpisodeSchema", () => {
    expect(() => referenceEpisodeSchema.parse(readJson("reference.json"))).not.toThrow();
  });
});

const cutLibrary = cutLibrarySchema.parse(readJson("cut.json"));
const referenceEpisode = referenceEpisodeSchema.parse(readJson("reference.json"));

// Mirrors the resolution rule src/lib/studio-client.ts's assetUrl/isPublicFile
// actually apply: a bare filename (after stripping a "final/" prefix, the one
// difference between week manifests and reference.json/cut.json) was copied
// flat into public/studio/ by the asset-copy step; anything with a "/" in it
// (always an "inputs/..." path) is read at build time from src/data/studio/
// itself and never copied to public/.
function stripFinal(file: string): string {
  return file.startsWith("final/") ? file.slice("final/".length) : file;
}

function resolveRef(file: string): string {
  const stripped = stripFinal(file);
  return stripped.includes("/") ? resolve(DATA_DIR, stripped) : resolve(PUBLIC_DIR, stripped);
}

function assertExists(file: string, context: string): void {
  const path = resolveRef(file);
  expect(existsSync(path), `${context} references missing file: ${file} (looked for ${path})`).toBe(true);
}

// Every dynamic-test loop below needs the same guard: a manifest that failed
// to parse gets one clearly-attributed failing test instead of an exception
// that would abort building the rest of this describe block's tests.
function guardParsed(entry: WeekEntry): WeekManifest | undefined {
  if (entry.manifest) return entry.manifest;
  it(`${entry.file} failed to parse, so its checks below can't run`, () => {
    throw entry.error;
  });
  return undefined;
}

function tierRefs(tier: WeekManifest["tiers"][number]): string[] {
  const input = tier.input as Record<string, unknown>;
  const refs: string[] = [];
  if (typeof input.file === "string") refs.push(input.file);
  if (Array.isArray(input.file)) refs.push(...(input.file as string[]));
  if (Array.isArray(input.value)) {
    refs.push(...(input.value as unknown[]).filter((v): v is string => typeof v === "string"));
  }
  if (typeof input.prompt_file === "string") refs.push(input.prompt_file);
  if (typeof input.neg_file === "string") refs.push(input.neg_file);
  refs.push(tier.output.file);
  if (tier.output.poster) refs.push(tier.output.poster);
  if (tier.output.cuts) refs.push(...tier.output.cuts);
  return refs;
}

describe("every referenced file resolves to a real file on disk", () => {
  for (const entry of weekManifests) {
    const manifest = guardParsed(entry);
    if (!manifest) continue;
    const { file } = entry;
    for (const tier of manifest.tiers) {
      it(`${file} tier ${tier.id}'s input/output files all exist`, () => {
        for (const ref of tierRefs(tier)) assertExists(ref, `${file} tier ${tier.id}`);
      });
    }
  }

  it("cut.json's clips and subtitle drafts all exist", () => {
    for (const cut of cutLibrary.cuts) {
      assertExists(cut.file, `cut.json clip ${cut.id}`);
      assertExists(cut.poster, `cut.json clip ${cut.id}`);
    }
    for (const draft of cutLibrary.subtitle_drafts) {
      assertExists(draft.file, `cut.json subtitle draft ${draft.set}`);
    }
  });

  // outputs.master is metadata only and is never copied to public/ (see
  // src/lib/studio-client.ts's toClientReferenceEpisode) — only web and
  // poster are ever rendered, so only those are checked here.
  it("reference.json's rendered outputs (web, poster) exist", () => {
    assertExists(referenceEpisode.outputs.web.file, "reference.json outputs.web");
    assertExists(referenceEpisode.outputs.poster.file, "reference.json outputs.poster");
  });
});

describe("size rules: a single clip stays under 1.3 MB, a poster under 300 KB", () => {
  for (const entry of weekManifests) {
    const manifest = guardParsed(entry);
    if (!manifest) continue;
    const { file } = entry;
    for (const tier of manifest.tiers) {
      if (tier.output.bytes !== undefined && !tier.output.cuts) {
        it(`${file} tier ${tier.id}'s clip stays under ${SINGLE_CLIP_MAX} bytes`, () => {
          expect(tier.output.bytes).toBeLessThanOrEqual(SINGLE_CLIP_MAX);
        });
      }
      if (tier.output.poster_bytes !== undefined) {
        it(`${file} tier ${tier.id}'s poster stays under ${POSTER_MAX} bytes`, () => {
          expect(tier.output.poster_bytes).toBeLessThanOrEqual(POSTER_MAX);
        });
      }
      if (tier.output.cuts_bytes) {
        it(`${file} tier ${tier.id}'s cuts sequence stays under its own packaging.limit_bytes`, () => {
          const limit = manifest.packaging?.limit_bytes;
          expect(limit, `${file} tier ${tier.id} has cuts_bytes but no packaging.limit_bytes`).toBeDefined();
          const total = tier.output.cuts_bytes!.reduce((sum, n) => sum + n, 0);
          expect(total).toBeLessThanOrEqual(limit!);
        });
      }
    }
  }

  for (const cut of cutLibrary.cuts) {
    it(`cut.json ${cut.id}'s clip stays under ${SINGLE_CLIP_MAX} bytes`, () => {
      expect(cut.bytes).toBeLessThanOrEqual(SINGLE_CLIP_MAX);
    });
    it(`cut.json ${cut.id}'s poster stays under ${POSTER_MAX} bytes`, () => {
      expect(cut.poster_bytes).toBeLessThanOrEqual(POSTER_MAX);
    });
  }
});

describe("every week has 3-5 tiers, numbered t1..tN with no gaps", () => {
  for (const entry of weekManifests) {
    const manifest = guardParsed(entry);
    if (!manifest) continue;
    const { file } = entry;
    it(`${file} tiers are contiguous`, () => {
      expect(manifest.tiers.length).toBeGreaterThanOrEqual(3);
      expect(manifest.tiers.length).toBeLessThanOrEqual(5);
      const expected = manifest.tiers.map((_, i) => `t${i + 1}`);
      expect(manifest.tiers.map((tier) => tier.tier)).toEqual(expected);
    });
  }
});

// Reads the raw JSON directly rather than the schema-parsed manifest: note is
// itself `nonEmpty` (a trimmed z.string().min(1)) in studio.schema.ts, so a
// whitespace-only note already fails schema validation before a check built
// on the parsed manifest would ever see it — that check would report the
// bug as a parse failure in the schema describe block above, never here, and
// this describe block would go quietly green with nothing under test.
// Reading raw JSON keeps this an independent guard on the invariant, not one
// that rides on the schema also enforcing it.
describe("every tier note is a real, non-empty sentence", () => {
  for (const file of WEEK_FILES) {
    const raw = readJson(file) as { tiers: { id: string; note: unknown }[] };
    for (const tier of raw.tiers) {
      it(`${file} tier ${tier.id}'s note is non-empty`, () => {
        const note = typeof tier.note === "string" ? tier.note : "";
        expect(note.trim().length).toBeGreaterThan(0);
      });
    }
  }
});

// The Dailies (src/content/sessions/week-0[3-9].md) are the only content
// that links a specific tier deep-link into the Studio (the lectures link
// the week's static section as a whole, with no ":tier" suffix). Confirmed
// by grepping src/content for "#week-" before writing this check.
const RUN_LINK_RE = /studio\/#week-(\d{2}):(\S+?)\)/g;

describe('"Run it in the Studio" links resolve to a real week + tier pair', () => {
  const sessionFiles = loadContentDir("src/content/sessions");
  const manifestsByWeek = new Map(
    weekManifests.flatMap((entry) => (entry.manifest ? [[entry.manifest.week, entry.manifest] as const] : [])),
  );
  let linksChecked = 0;

  for (const content of sessionFiles) {
    for (const match of content.body.matchAll(RUN_LINK_RE)) {
      const week = Number(match[1]);
      const tierId = match[2];
      linksChecked += 1;
      it(`${content.slug} links to week ${week} tier ${tierId}, which exists`, () => {
        const manifest = manifestsByWeek.get(week);
        expect(manifest, `${content.slug} links to week ${week}, which has no studio manifest`).toBeDefined();
        const tier = manifest!.tiers.find((candidate) => candidate.tier === tierId || candidate.id === tierId);
        expect(tier, `${content.slug} links to week ${week} tier ${tierId}, which doesn't exist`).toBeDefined();
      });
    }
  }

  it("at least one real link was actually checked", () => {
    expect(linksChecked).toBeGreaterThan(0);
  });
});

describe("the recorded backend is deterministic", () => {
  const clientWeeks = weekManifests.flatMap((entry) => (entry.manifest ? [toClientWeek(entry.manifest)] : []));
  const backend = createRecordedBackend(clientWeeks);

  it("run() resolves the same RunResult and the same progress sequence for the same tier, twice", async () => {
    const progressA: unknown[] = [];
    const progressB: unknown[] = [];
    const resultA = await backend.run({ week: 5, tierId: "week05-t3" }, (p) => progressA.push(p));
    const resultB = await backend.run({ week: 5, tierId: "week05-t3" }, (p) => progressB.push(p));
    expect(resultA).toEqual(resultB);
    expect(progressA).toEqual(progressB);
  });

  it("run() rejects a week/tier pair that doesn't exist", async () => {
    await expect(backend.run({ week: 5, tierId: "not-a-real-tier" }, () => {})).rejects.toThrow();
  });
});
