// Reads the week 7 graphs the way the lecture reads them: four kinds of node,
// laid out left to right in the order the data actually flows.
//
// The graphs are the real exports that produced the week's takes, in ComfyUI's
// API format — `{ "prompt": { "<id>": { class_type, inputs } } }`, where an
// input whose value is `["<id>", <slot>]` is a link from another node. One
// tier is not a graph at all: t3 is an upscale pipeline with no generation in
// it, recorded as a list of tool invocations, and it is laid out as the chain
// it is.
//
// They live in public/studio/ because the Studio serves them, so they are
// pulled in with import.meta.glob rather than readFileSync: a build-time
// module that resolves its own paths at runtime breaks the moment the
// prerender step bundles it somewhere else (CLAUDE.md §4).
import kindTable from "../data/graph-kinds.json";

export type NodeKind = "loader" | "conditioning" | "sampler" | "fix" | "other";

export const KIND_ORDER: NodeKind[] = ["loader", "conditioning", "sampler", "fix", "other"];

export const KIND_LABELS: Record<NodeKind, string> = {
  loader: "Loader",
  conditioning: "Conditioning",
  sampler: "Sampler",
  fix: "Fix pass",
  other: "Other",
};

// The Slop palette is one warm family — a gold, a bronze, a darker gold and a
// warm grey — and at a tint light enough to keep 11px labels readable in both
// themes, four of them are barely four colours. So every node carries its kind
// as a letter as well, which is what the legend decodes; the colour is the
// second reading, not the only one.
export const KIND_INITIALS: Record<NodeKind, string> = {
  loader: "L",
  conditioning: "C",
  sampler: "S",
  fix: "F",
  other: "O",
};

const KINDS = kindTable.kinds as Record<string, NodeKind>;

export function kindOf(classType: string): NodeKind {
  return KINDS[classType] ?? "other";
}

const graphFiles = import.meta.glob<Record<string, unknown>>("../../public/studio/*.graph.json", {
  eager: true,
  import: "default",
});

function readGraph(name: string): Record<string, unknown> {
  const raw = graphFiles[`../../public/studio/${name}`];
  if (!raw) throw new Error(`Graph not found: ${name}`);
  return raw;
}

// --- layout ---------------------------------------------------------------

/** Node box and the grid it sits in, in SVG user units. */
export const BOX = { width: 140, height: 50, columnGap: 34, rowGap: 12, pad: 8 };

export interface GraphInput {
  name: string;
  /** A literal value, or the id of the node this input is linked from. */
  value: string;
  from?: string;
}

export interface GraphNode {
  id: string;
  classType: string;
  kind: NodeKind;
  /** True when no node of this class_type is in the tier this one is compared against. */
  isNew: boolean;
  lines: string[];
  inputs: GraphInput[];
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  path: string;
}

export interface GraphView {
  tier: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  /** Class types present here and absent from the baseline tier. */
  newClasses: string[];
}

/**
 * Splits a class_type at its capitals and packs the pieces back into lines
 * short enough for a node box: "SamplerCustomAdvanced" reads as
 * "SamplerCustom / Advanced" rather than being cut mid-word or spilling over
 * the next column.
 */
export function wrapClassType(classType: string, limit = 15, maxLines = 3): string[] {
  const words = classType.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [classType];
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + word.length <= limit) lines[lines.length - 1] = last + word;
    else lines.push(word);
  }
  if (lines.length <= maxLines) return lines;
  // Too many pieces to show whole: keep the first lines and mark the cut.
  return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`];
}

function linksOf(inputs: Record<string, unknown>): { name: string; from: string }[] {
  return Object.entries(inputs).flatMap(([name, value]) =>
    Array.isArray(value) && typeof value[0] === "string" ? [{ name, from: value[0] }] : [],
  );
}

/** Longest-path layering: a node sits one column right of its furthest source. */
function columnsOf(ids: string[], sources: Map<string, string[]>): Map<string, number> {
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const walk = (id: string): number => {
    const seen = depth.get(id);
    if (seen !== undefined) return seen;
    // A ComfyUI graph is a DAG; the guard is here so a hand-edited one that
    // isn't produces a drawing rather than a stack overflow.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const from = sources.get(id) ?? [];
    const value = from.length === 0 ? 0 : Math.max(...from.map(walk)) + 1;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  };
  for (const id of ids) walk(id);
  return depth;
}

function edgePath(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + BOX.width;
  const y1 = from.y + BOX.height / 2;
  const x2 = to.x;
  const y2 = to.y + BOX.height / 2;
  const bend = Math.max(16, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function layout(
  entries: { id: string; classType: string; inputs: Record<string, unknown> }[],
  baseline: Set<string>,
): GraphView {
  const ids = entries.map((entry) => entry.id);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sources = new Map(ids.map((id) => [id, linksOf(byId.get(id)!.inputs).map((link) => link.from)]));
  const column = columnsOf(ids, sources);

  // Rows: group by column, then order each column by the average row of the
  // nodes feeding it, so the wires cross as little as they can without a
  // proper layout pass.
  const byColumn = new Map<number, string[]>();
  for (const id of ids) {
    const at = column.get(id) ?? 0;
    byColumn.set(at, [...(byColumn.get(at) ?? []), id]);
  }
  const row = new Map<string, number>();
  for (const at of [...byColumn.keys()].sort((a, b) => a - b)) {
    const members = byColumn.get(at)!;
    const ordered =
      at === 0
        ? members
        : [...members].sort((a, b) => {
            const mean = (id: string) => {
              const from = (sources.get(id) ?? []).map((source) => row.get(source) ?? 0);
              return from.length ? from.reduce((sum, value) => sum + value, 0) / from.length : 0;
            };
            return mean(a) - mean(b);
          });
    ordered.forEach((id, index) => row.set(id, index));
  }

  const nodes: GraphNode[] = entries.map((entry) => {
    const at = column.get(entry.id) ?? 0;
    const down = row.get(entry.id) ?? 0;
    return {
      id: entry.id,
      classType: entry.classType,
      kind: kindOf(entry.classType),
      isNew: baseline.size > 0 && !baseline.has(entry.classType),
      lines: wrapClassType(entry.classType),
      inputs: Object.entries(entry.inputs).map(([name, value]) =>
        Array.isArray(value) && typeof value[0] === "string"
          ? { name, value: `from ${value[0]}`, from: value[0] }
          : { name, value: String(value) },
      ),
      x: BOX.pad + at * (BOX.width + BOX.columnGap),
      y: BOX.pad + down * (BOX.height + BOX.rowGap),
    };
  });

  const placed = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = nodes.flatMap((node) =>
    linksOf(byId.get(node.id)!.inputs).flatMap((link) => {
      const from = placed.get(link.from);
      return from ? [{ from: link.from, to: node.id, path: edgePath(from, node) }] : [];
    }),
  );

  const columns = Math.max(...nodes.map((node) => (column.get(node.id) ?? 0) + 1));
  const rows = Math.max(...nodes.map((node) => (row.get(node.id) ?? 0) + 1));
  const newClasses = [...new Set(nodes.filter((node) => node.isNew).map((node) => node.classType))];

  return {
    tier: "",
    nodes,
    edges,
    width: BOX.pad * 2 + columns * BOX.width + (columns - 1) * BOX.columnGap,
    height: BOX.pad * 2 + rows * BOX.height + (rows - 1) * BOX.rowGap,
    newClasses,
  };
}

// --- the two shapes on disk ----------------------------------------------

interface ApiGraph {
  prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
}

interface UpscalePipeline {
  tier: string;
  kind: string;
  source: string;
  pipeline: { step: number; tool: string; args: string[] }[];
  output: { file: string; resolution?: string };
}

/** The API export has a `prompt` map of nodes; the upscale pipeline does not. */
function isApiGraph(raw: Record<string, unknown>): boolean {
  return typeof raw.prompt === "object" && raw.prompt !== null;
}

export function classTypesOf(file: string): Set<string> {
  const raw = readGraph(file);
  if (!isApiGraph(raw)) return new Set();
  return new Set(Object.values((raw as unknown as ApiGraph).prompt).map((node) => node.class_type));
}

/**
 * One tier's drawing. `baselineFile` is the graph this tier is read against —
 * the bare supplied graph — so a class of node the baseline never had is
 * marked as this tier's own addition.
 */
export function graphView(tier: string, file: string, baselineFile?: string): GraphView {
  const raw = readGraph(file);
  const baseline = baselineFile && baselineFile !== file ? classTypesOf(baselineFile) : new Set<string>();

  if (isApiGraph(raw)) {
    const graph = raw as unknown as ApiGraph;
    const entries = Object.entries(graph.prompt).map(([id, node]) => ({
      id,
      classType: node.class_type,
      inputs: node.inputs,
    }));
    return { ...layout(entries, baseline), tier };
  }

  // The upscale pipeline: a chain of tool invocations, every one of them a fix
  // pass by the lecture's reading — nothing in it generates anything.
  const pipeline = raw as unknown as UpscalePipeline;
  const entries = pipeline.pipeline.map((step, index) => ({
    id: String(step.step),
    classType: step.tool,
    inputs: {
      ...(index === 0 ? { input: pipeline.source } : { input: [String(pipeline.pipeline[index - 1].step), 0] }),
      args: step.args.join(" "),
      ...(index === pipeline.pipeline.length - 1 ? { output: pipeline.output.file } : {}),
    } as Record<string, unknown>,
  }));
  const view = layout(entries, new Set());
  // Tools are not ComfyUI classes, so nothing in the kind table matches them
  // by name; the whole pipeline is the fourth kind and is drawn as such.
  return { ...view, tier, nodes: view.nodes.map((node) => ({ ...node, kind: "fix", isNew: false })), newClasses: [] };
}
