// Manifests in, canvas document out. This runs once, at build time, and its
// result is serialised into the page — so a visitor's browser never parses a
// manifest, and the canvas is already laid out before React arrives.
//
// Every node here is a real recorded input or output. Nothing on this canvas
// is invented: if a field isn't in the manifests, it isn't on a card.

import { withBase } from "astro-theme-university/url";
import { courseMeta } from "../../course-config";
import type { CutLibrary, ReferenceEpisode } from "../../data/studio.schema";
import { studioAssetUrl, type ClientTier, type ClientWeek } from "../studio-client";
import { layoutBoard, placeBoard, type LayoutItem } from "./layout";
import type { Board, CanvasBundle, CanvasDoc, Edge, InputNode, Node, NodeMeta, TakeNode } from "./types";

/** The Cut and the reference episode are taught in these weeks; the boards
 *  carry the number so a node's "Open" control has somewhere to go. */
const CUT_WEEK = 11;
const REFERENCE_WEEK = 10;

export interface ReferenceSegmentSource {
  seg: string;
  shots: string;
  seed: number;
  timecode: string;
  promptFile?: string;
  promptText?: string;
}

export interface CanvasSourceInput {
  weeks: ClientWeek[];
  cut: CutLibrary;
  reference: ReferenceEpisode;
  /** The four segment prompts, read off disk by whoever calls this (the page
   *  through import.meta.glob, the spec through node:fs). */
  referenceSegments?: ReferenceSegmentSource[];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseResolution(resolution: string): { w: number; h: number } | undefined {
  const match = /^(\d+)x(\d+)$/.exec(resolution.trim());
  if (!match) return undefined;
  return { w: Number(match[1]), h: Number(match[2]) };
}

const PICTURE_EXTENSIONS = [".avif", ".webp", ".png", ".jpg", ".jpeg", ".mp4"];

/** A `.graph.json` is a download, not a picture: an input holding only one of
 *  those is a text card, the same as a seed or a prompt. */
function showsPicture(files: string[] | undefined): boolean {
  return Boolean(files?.some((file) => PICTURE_EXTENSIONS.some((ext) => file.endsWith(ext))));
}

/** `SLOP8760/W05/t3/66740` — the citeable address of a take. The seed is the
 *  tier's own where it has one (Week 2 varies it per tier), otherwise the
 *  week's, and `noseed` where the rig recorded none (Weeks 3 and 4). */
export function takeIdFor(week: ClientWeek, tier: ClientTier): string {
  const tierSeed = typeof tier.input.value === "number" ? tier.input.value : undefined;
  const weekSeed = typeof week.seed === "number" ? week.seed : undefined;
  const seed = tierSeed ?? weekSeed;
  return `${courseMeta.code}/W${pad2(week.week)}/${tier.tier}/${seed ?? "noseed"}`;
}

function fileName(url: string): string {
  return url.split("/").pop() ?? url;
}

/** One line of the production log, the same fields the Studio's downloadable
 *  log carries, in the order the log states them. This is what "Copy
 *  production line" puts on the clipboard. */
export function productionLine(week: ClientWeek, tier: ClientTier, takeId: string): string {
  return [
    takeId,
    week.model,
    week.mode,
    week.resolution,
    `${tier.tier} — ${tier.label}`,
    fileName(tier.output.file),
    "recorded",
  ].join(" · ");
}

export function planLine(takeId: string, model: string, mode: string, resolution: string): string {
  return `Replayed ${takeId} · ${model} · ${mode} · ${resolution}`;
}

/** What the desk compares a typed prompt against: the tier's real recorded
 *  input, whitespace-normalised so a re-wrapped paste still matches. */
export function recordedInputOf(tier: ClientTier): string {
  if (tier.input.promptText) return normaliseWhitespace(tier.input.promptText);
  if (typeof tier.input.value === "number") return String(tier.input.value);
  return "";
}

export function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function inputLabel(tier: ClientTier): string {
  const kind = tier.input.kind;
  if (kind === "seed") return `Seed ${tier.input.value}`;
  if (kind === "reference set") return `Reference set · ${tier.input.files?.length ?? 0} stills`;
  if (kind === "image pair") return "First and last frame";
  if (kind === "graph") return "Workflow graph";
  if (kind === "upscale") return "Upscale graph";
  if (kind === "script") return "Script";
  if (kind === "image") return "Source still";
  return "Prompt";
}

// Omit over a union keeps only the keys every member shares, which would
// throw away `media` and `kind` the moment a draft node is written; this
// distributes so each node type keeps its own fields.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NodeDraft = DistributiveOmit<Node, "x" | "y" | "w" | "h"> & { item: LayoutItem };

interface BoardDraft {
  id: string;
  title: string;
  kind: Board["kind"];
  week?: number;
  /** Nodes without geometry yet; layoutBoard fills x/y/w/h in this order. */
  nodes: NodeDraft[];
  edges: Edge[];
}

function weekBoardDraft(week: ClientWeek, meta: Record<string, NodeMeta>): BoardDraft {
  const boardId = `week-${pad2(week.week)}`;
  const size = parseResolution(week.resolution) ?? { w: 576, h: 1024 };
  const draft: BoardDraft = {
    id: boardId,
    title: `Week ${week.week} — ${week.instrument}`,
    kind: "recorded",
    week: week.week,
    nodes: [],
    edges: [],
  };

  for (const tier of week.tiers) {
    const inputId = `${tier.id}-input`;
    const takeId = `${tier.id}-take`;
    const address = takeIdFor(week, tier);
    const picture = showsPicture(tier.input.files);

    const input: DistributiveOmit<InputNode, "x" | "y" | "w" | "h"> & { item: LayoutItem } = {
      id: inputId,
      boardId,
      type: "input",
      kind: tier.input.kind,
      label: inputLabel(tier),
      value: tier.input.files ?? (typeof tier.input.value === "number" ? String(tier.input.value) : undefined),
      tierId: tier.id,
      locked: true,
      origin: { kind: "manifest", week: week.week, tier: tier.tier },
      item: picture ? { id: inputId, naturalW: size.w, naturalH: size.h } : { id: inputId },
    };

    const take: DistributiveOmit<TakeNode, "x" | "y" | "w" | "h"> & { item: LayoutItem } = {
      id: takeId,
      boardId,
      type: "take",
      media: tier.output.kind,
      file: tier.output.file,
      poster: tier.output.poster,
      naturalW: size.w,
      naturalH: size.h,
      tierId: tier.id,
      takeId: address,
      locked: true,
      origin: { kind: "manifest", week: week.week, tier: tier.tier },
      item: { id: takeId, naturalW: size.w, naturalH: size.h },
    };

    draft.nodes.push(input, take);
    draft.edges.push({
      id: `lineage-${tier.id}`,
      from: inputId,
      to: takeId,
      kind: "lineage",
      label: week.mode,
    });

    // The two tiers the rig recorded once and used twice (week06-t4 is
    // week02-t1's file, week07-t4 is week02-t2's) get a dashed edge saying
    // so, rather than two cards quietly showing the same clip.
    if (tier.sameAs) {
      draft.edges.push({
        id: `same-file-${tier.id}`,
        from: takeId,
        to: `${tier.sameAs}-take`,
        kind: "same-file",
        label: "same file",
      });
    }

    const shared: NodeMeta = {
      week: week.week,
      tier: tier.tier,
      model: week.model,
      mode: week.mode,
      resolution: week.resolution,
      seed: address.split("/").pop(),
      note: tier.note,
      counterExample: tier.counterExample,
      openHref: withBase(`/lectures/week-${pad2(week.week)}/#ladder`),
      openLabel: `Week ${week.week} lecture`,
      // The prompt and negative prompt are deliberately not copied here.
      // The island already has the manifests (the recorded backend needs
      // them), and a tier's prompt written into both nodes' meta, alongside
      // its whitespace-normalised twin, is the same text six times: it took
      // the page's inline payload from 125 kB to 372 kB before this was
      // noticed. Cards look their tier up by id instead.
    };

    meta[inputId] = { ...shared };
    meta[takeId] = {
      ...shared,
      takeId: address,
      productionLine: productionLine(week, tier, address),
      planLine: planLine(address, week.model, week.mode, week.resolution),
    };
  }

  return draft;
}

function cutBoardDraft(cut: CutLibrary, meta: Record<string, NodeMeta>): BoardDraft {
  const boardId = "cut";
  const draft: BoardDraft = {
    id: boardId,
    title: "The Cut — four windows on one master",
    kind: "recorded",
    week: CUT_WEEK,
    nodes: [],
    edges: [],
  };

  const masterId = "cut-master-input";
  draft.nodes.push({
    id: masterId,
    boardId,
    type: "input",
    kind: "master",
    label: `Master · ${cut.source_resolution}`,
    value: cut.source,
    tierId: "cut-master",
    locked: true,
    origin: { kind: "manifest", week: CUT_WEEK, tier: "master" },
    item: { id: masterId },
  });
  meta[masterId] = {
    week: CUT_WEEK,
    resolution: cut.source_resolution,
    note: `Every clip below is a window cut out of this one file at ${cut.fps} fps; no clip was generated separately.`,
    openHref: withBase("/cut/"),
    openLabel: "The Cut",
  };

  for (const clip of cut.cuts) {
    const key = clip.id.startsWith("cut-") ? clip.id.slice("cut-".length) : clip.id;
    const size = parseResolution(clip.resolution) ?? { w: 576, h: 1024 };
    const nodeId = `${clip.id}-take`;
    const address = `${courseMeta.code}/W${pad2(CUT_WEEK)}/${key}/noseed`;

    draft.nodes.push({
      id: nodeId,
      boardId,
      type: "take",
      media: "video",
      file: studioAssetUrl(clip.file),
      poster: studioAssetUrl(clip.poster),
      naturalW: size.w,
      naturalH: size.h,
      tierId: clip.id,
      takeId: address,
      locked: true,
      origin: { kind: "manifest", week: CUT_WEEK, tier: key },
      item: { id: nodeId, naturalW: size.w, naturalH: size.h },
    });

    draft.edges.push({
      id: `lineage-${clip.id}`,
      from: masterId,
      to: nodeId,
      kind: "lineage",
      label: clip.timecode,
    });

    meta[nodeId] = {
      week: CUT_WEEK,
      tier: clip.shot,
      resolution: clip.resolution,
      takeId: address,
      note: `${clip.shot} · ${clip.timecode} · ${clip.duration_s}s`,
      productionLine: [address, "ffmpeg", "cut", clip.resolution, clip.shot, fileName(clip.file), "recorded"].join(
        " · ",
      ),
      openHref: withBase("/cut/"),
      openLabel: "The Cut",
    };
  }

  return draft;
}

function referenceBoardDraft(
  reference: ReferenceEpisode,
  segments: ReferenceSegmentSource[],
  meta: Record<string, NodeMeta>,
): BoardDraft {
  const boardId = "reference";
  const draft: BoardDraft = {
    id: boardId,
    title: `Reference episode — ${reference.title}`,
    kind: "recorded",
    week: REFERENCE_WEEK,
    nodes: [],
    edges: [],
  };

  const size = parseResolution(reference.resolution.web) ?? { w: 576, h: 1024 };
  const episodeId = "reference-episode-take";
  const address = `${courseMeta.code}/W${pad2(REFERENCE_WEEK)}/episode/noseed`;

  for (const segment of segments) {
    const nodeId = `reference-seg-${segment.seg}-input`;
    draft.nodes.push({
      id: nodeId,
      boardId,
      type: "input",
      kind: "segment",
      label: `Segment ${segment.seg} · ${segment.shots} · seed ${segment.seed}`,
      value: segment.timecode,
      promptFile: segment.promptFile,
      tierId: `reference-seg-${segment.seg}`,
      locked: true,
      origin: { kind: "manifest", week: REFERENCE_WEEK, tier: segment.seg },
      item: { id: nodeId },
    });
    draft.edges.push({
      id: `lineage-reference-${segment.seg}`,
      from: nodeId,
      to: episodeId,
      kind: "lineage",
      label: reference.mode,
    });
    meta[nodeId] = {
      week: REFERENCE_WEEK,
      tier: segment.seg,
      model: reference.model,
      mode: reference.mode,
      resolution: reference.resolution.generated,
      seed: String(segment.seed),
      note: `${segment.shots}, ${segment.timecode} on the finished timeline.`,
      promptText: segment.promptText,
      recordedInput: segment.promptText ? normaliseWhitespace(segment.promptText) : undefined,
      openHref: withBase(`/lectures/week-${pad2(REFERENCE_WEEK)}/#reference-episode`),
      openLabel: `Week ${REFERENCE_WEEK} lecture`,
    };
  }

  draft.nodes.push({
    id: episodeId,
    boardId,
    type: "take",
    media: "video",
    file: studioAssetUrl(reference.outputs.web.file),
    poster: studioAssetUrl(reference.outputs.poster.file),
    naturalW: size.w,
    naturalH: size.h,
    tierId: "reference-episode",
    takeId: address,
    locked: true,
    origin: { kind: "manifest", week: REFERENCE_WEEK, tier: "episode" },
    item: { id: episodeId, naturalW: size.w, naturalH: size.h },
  });

  meta[episodeId] = {
    week: REFERENCE_WEEK,
    tier: "episode",
    model: reference.model,
    mode: reference.mode,
    resolution: reference.resolution.web,
    takeId: address,
    note: `${reference.duration_s}s, ${reference.frames} frames, four segments concatenated and upscaled to ${reference.resolution.master}.`,
    productionLine: [
      address,
      reference.model,
      reference.mode,
      reference.resolution.web,
      "episode",
      fileName(reference.outputs.web.file),
      "recorded",
    ].join(" · "),
    planLine: planLine(address, reference.model, reference.mode, reference.resolution.web),
    openHref: withBase(`/lectures/week-${pad2(REFERENCE_WEEK)}/#reference-episode`),
    openLabel: `Week ${REFERENCE_WEEK} lecture`,
  };

  return draft;
}

/** Builds the whole canvas: ten recorded boards in manifest order, laid out
 *  in a row with their tops aligned, and the lineage between them. */
export function buildCanvasBundle(source: CanvasSourceInput): CanvasBundle {
  const meta: Record<string, NodeMeta> = {};

  const drafts: BoardDraft[] = [
    ...source.weeks.map((week) => weekBoardDraft(week, meta)),
    cutBoardDraft(source.cut, meta),
    referenceBoardDraft(source.reference, source.referenceSegments ?? [], meta),
  ];

  const doc: CanvasDoc = { boards: [], nodes: [], edges: [], camera: { x: 0, y: 0, z: 1 }, version: 1 };

  drafts.forEach((draft, order) => {
    const layout = layoutBoard(draft.nodes.map((node) => node.item));
    const { x, y } = placeBoard(doc, layout, { kind: "row" });

    doc.boards.push({
      id: draft.id,
      title: draft.title,
      x,
      y,
      w: layout.w,
      h: layout.h,
      kind: draft.kind,
      order,
      week: draft.week,
    });

    draft.nodes.forEach((node, index) => {
      const placed = layout.positions[index];
      const { item: _item, ...rest } = node;
      doc.nodes.push({ ...rest, x: placed.x, y: placed.y, w: placed.w, h: placed.h } as Node);
    });

    doc.edges.push(...draft.edges);
  });

  return { doc, meta };
}
