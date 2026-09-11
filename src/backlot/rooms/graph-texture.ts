// The monitor on the desk, showing the week 7 workflow graph.
//
// The layout is not computed here. `src/lib/graph-reader.ts` already lays these
// graphs out — the same longest-path columns, the same boxes, the same wrapped
// class names, the same four-kinds reading — for the week 7 lecture, and the
// monitor draws that layout into a canvas instead of into an SVG. Two readers
// of the same file would drift; one reader with two surfaces cannot.
//
// This module is imported dynamically, at layer 1. `graphView` inlines the
// graph JSON at build time (import.meta.glob), so nothing here is on the path
// to the first frame.
//
// Resolution: the screen is 0.62 m wide and the figure can get to about 0.7 m
// from it, where a 1920-wide viewport puts roughly 1,830 device pixels across
// it. 2048 across is the next size up from that, so the smallest type on the
// monitor is still sampling above 1:1 when a reader walks right up.
import { CanvasTexture, SRGBColorSpace } from "three";
import {
  BOX,
  KIND_INITIALS,
  KIND_LABELS,
  KIND_ORDER,
  graphView,
  type GraphNode,
  type NodeKind,
} from "../../lib/graph-reader";
import type { Painter, Role } from "./palette";

const SCREEN = { width: 2048, height: 1280 };

/** Margins and bands, in screen pixels. */
const LAYOUT = {
  margin: 56,
  headerHeight: 132,
  legendHeight: 64,
  footerHeight: 168,
};

/** The tokens graph-reader.css gives each kind, so the two agree. */
const KIND_ROLE: Record<NodeKind, Role> = {
  loader: "kindLoader",
  conditioning: "kindConditioning",
  sampler: "kindSampler",
  fix: "kindFix",
  other: "kindOther",
};

// A stack, not a face: the monitor is drawn into a canvas the page's font
// loading never touches, so it takes whatever mono the machine already has
// rather than waiting on a webfont that would leave the screen blank.
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export interface GraphScreen {
  readonly texture: CanvasTexture;
  /** Aspect of the drawing, so the monitor can be built to it. */
  readonly aspect: number;
  redraw(): void;
  dispose(): void;
}

/** Chrome's 2D context, or nothing — an OffscreenCanvas-less browser keeps the
 *  monitor's flat fill rather than losing the room. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", { alpha: false });
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  painter: Painter,
  node: GraphNode,
): void {
  const ink = painter.css(KIND_ROLE[node.kind]);

  // graph-reader.css fills a node with 22% of its kind over the page
  // background. Two passes with an alpha is the same recipe a canvas can run.
  ctx.fillStyle = painter.css("panel");
  ctx.fillRect(node.x, node.y, BOX.width, BOX.height);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = ink;
  ctx.fillRect(node.x, node.y, BOX.width, BOX.height);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(node.x + 0.75, node.y + 0.75, BOX.width - 1.5, BOX.height - 1.5);

  // The kind's letter, because four tints of one warm palette are not four
  // colours at this size — the same reason the lecture's map carries it.
  ctx.font = `700 11px ${MONO}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = ink;
  ctx.fillText(KIND_INITIALS[node.kind], node.x + BOX.width - 6, node.y + 5);

  ctx.font = `10px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = painter.css("inkFaint");
  ctx.fillText(node.id, node.x + 6, node.y + 5);

  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = painter.css("ink");
  node.lines.forEach((line, index) => {
    ctx.fillText(line, node.x + 6, node.y + 20 + index * 13);
  });
}

function drawEdge(ctx: CanvasRenderingContext2D, path: string): void {
  // "M x1 y1 C cx1 cy1, cx2 cy2, x2 y2" — the one shape edgePath() emits.
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!numbers || numbers.length < 8) return;
  ctx.beginPath();
  ctx.moveTo(numbers[0], numbers[1]);
  ctx.bezierCurveTo(numbers[2], numbers[3], numbers[4], numbers[5], numbers[6], numbers[7]);
  ctx.stroke();
}

/**
 * Draws one tier's graph onto a canvas and hands back a texture for it.
 *
 * `caption` is the manifest's caption for the piece; nothing else on the screen
 * is written here. Everything else is read out of the graph file.
 */
export function createGraphScreen(painter: Painter, file: string, caption: string): GraphScreen | null {
  const canvas = document.createElement("canvas");
  canvas.width = SCREEN.width;
  canvas.height = SCREEN.height;
  const ctx = context2d(canvas);
  if (!ctx) return null;

  let view: ReturnType<typeof graphView>;
  try {
    view = graphView("", file);
  } catch {
    // A graph the build did not inline. The monitor keeps its fill.
    return null;
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const redraw = (): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = painter.css("panel");
    ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);

    // --- header: the caption the manifest already wrote for this piece ---
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = painter.css("ink");
    ctx.font = `600 34px ${MONO}`;
    ctx.fillText(file, LAYOUT.margin, 62);
    ctx.fillStyle = painter.css("inkSoft");
    ctx.font = `24px ${MONO}`;
    ctx.fillText(caption, LAYOUT.margin, 102);

    ctx.strokeStyle = painter.css("rule");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LAYOUT.margin, LAYOUT.headerHeight);
    ctx.lineTo(SCREEN.width - LAYOUT.margin, LAYOUT.headerHeight);
    ctx.stroke();

    // --- legend: the four trades, plus the nodes that are none of them ---
    let legendX = LAYOUT.margin;
    const legendY = LAYOUT.headerHeight + 40;
    for (const kind of KIND_ORDER) {
      const ink = painter.css(KIND_ROLE[kind]);
      ctx.fillStyle = painter.css("panel");
      ctx.fillRect(legendX, legendY - 20, 26, 26);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = ink;
      ctx.fillRect(legendX, legendY - 20, 26, 26);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(legendX + 0.75, legendY - 19.25, 24.5, 24.5);
      ctx.fillStyle = painter.css("ink");
      ctx.font = `700 17px ${MONO}`;
      ctx.textAlign = "center";
      ctx.fillText(KIND_INITIALS[kind], legendX + 13, legendY);
      ctx.textAlign = "left";
      ctx.font = `20px ${MONO}`;
      ctx.fillStyle = painter.css("inkSoft");
      ctx.fillText(KIND_LABELS[kind], legendX + 36, legendY);
      legendX += 36 + ctx.measureText(KIND_LABELS[kind]).width + 44;
    }

    // --- the graph itself, scaled to the band left over ------------------
    const top = LAYOUT.headerHeight + LAYOUT.legendHeight;
    const bandWidth = SCREEN.width - LAYOUT.margin * 2;
    const bandHeight = SCREEN.height - top - LAYOUT.footerHeight;
    const scale = Math.min(bandWidth / view.width, bandHeight / view.height);
    ctx.save();
    ctx.translate(
      LAYOUT.margin + (bandWidth - view.width * scale) / 2,
      top + (bandHeight - view.height * scale) / 2,
    );
    ctx.scale(scale, scale);

    ctx.strokeStyle = painter.css("inkFaint");
    ctx.lineWidth = 1.2;
    for (const edge of view.edges) drawEdge(ctx, edge.path);
    for (const node of view.nodes) drawNode(ctx, painter, node);
    ctx.restore();

    // --- footer: what the sampler was actually given ---------------------
    // Literal inputs only. A link is already a line on the map above, and the
    // prompt is a paragraph that belongs on the wall, not on a strip.
    const settings = view.nodes
      .filter((node) => node.kind === "sampler")
      .flatMap((node) => node.inputs.filter((input) => !input.from).map((input) => `${input.name}=${input.value}`));
    ctx.strokeStyle = painter.css("rule");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LAYOUT.margin, SCREEN.height - LAYOUT.footerHeight + 24);
    ctx.lineTo(SCREEN.width - LAYOUT.margin, SCREEN.height - LAYOUT.footerHeight + 24);
    ctx.stroke();
    ctx.font = `22px ${MONO}`;
    ctx.textAlign = "left";
    let line = "";
    let lineY = SCREEN.height - LAYOUT.footerHeight + 70;
    ctx.fillStyle = painter.css("inkSoft");
    for (const setting of settings) {
      const next = line ? `${line}   ${setting}` : setting;
      if (ctx.measureText(next).width > SCREEN.width - LAYOUT.margin * 2 && line) {
        ctx.fillText(line, LAYOUT.margin, lineY);
        lineY += 34;
        line = setting;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, LAYOUT.margin, lineY);

    texture.needsUpdate = true;
  };

  redraw();
  painter.onRepaint(redraw);

  return {
    texture,
    aspect: SCREEN.width / SCREEN.height,
    redraw,
    dispose() {
      texture.dispose();
    },
  };
}
