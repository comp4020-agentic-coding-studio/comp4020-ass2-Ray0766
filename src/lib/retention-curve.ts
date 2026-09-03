export type CurveShape = "sharp" | "slow";

export interface CurvePoint {
  time: number;
  share: number;
}

export const PLOT = {
  x0: 50,
  x1: 380,
  y0: 20,
  y1: 170,
};

export const CURVES: Record<CurveShape, CurvePoint[]> = {
  sharp: [
    { time: 0, share: 95 },
    { time: 30, share: 90 },
    { time: 32, share: 55 },
    { time: 35, share: 42 },
    { time: 60, share: 38 },
    { time: 100, share: 30 },
  ],
  slow: [
    { time: 0, share: 95 },
    { time: 25, share: 80 },
    { time: 50, share: 62 },
    { time: 75, share: 45 },
    { time: 100, share: 30 },
  ],
};

export const CURVE_LABELS: Record<CurveShape, string> = {
  sharp: "One sharp drop",
  slow: "Slow decline",
};

export const CURVE_CAPTIONS: Record<CurveShape, string> = {
  sharp: "The sharp drop is where something specific went wrong.",
  slow: "The slow decline is closer to the whole episode being paced too loosely throughout.",
};

function toX(time: number): number {
  return PLOT.x0 + (time / 100) * (PLOT.x1 - PLOT.x0);
}

function toY(share: number): number {
  return PLOT.y0 + (1 - share / 100) * (PLOT.y1 - PLOT.y0);
}

export function curvePath(shape: CurveShape): string {
  return CURVES[shape]
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point.time).toFixed(1)},${toY(point.share).toFixed(1)}`)
    .join(" ");
}

export function shareAtTime(shape: CurveShape, time: number): number {
  const points = CURVES[shape];
  const clamped = Math.min(100, Math.max(0, time));
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (clamped >= a.time && clamped <= b.time) {
      const span = b.time - a.time;
      const ratio = span === 0 ? 0 : (clamped - a.time) / span;
      return a.share + (b.share - a.share) * ratio;
    }
  }
  return points[points.length - 1].share;
}

export function markerPosition(shape: CurveShape, time: number): { x: number; y: number } {
  return { x: toX(time), y: toY(shareAtTime(shape, time)) };
}
