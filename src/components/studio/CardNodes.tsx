// The three kinds of card that sit on a board: an input, a take, and the
// placeholder a desk generation leaves while the rig looks its answer up.
//
// Every card is a real recorded thing. The take card shows the poster the rig
// wrote and swaps to the clip when it is the one selected; the input card
// shows what was actually fed in — a seed, a prompt, a still, a workflow
// graph — never a description of one.

import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardData, RfCardNode } from "../../lib/canvas/rf";
import type { InputNode, PlaceholderNode, TakeNode } from "../../lib/canvas/types";
import { useCanvasActions, usePlayback, useReducedMotion, useTier } from "./canvas-context";

const ANCHOR_SIDES = [
  ["left", Position.Left],
  ["right", Position.Right],
  ["top", Position.Top],
  ["bottom", Position.Bottom],
] as const;

/** Edges attach here. Nothing on this canvas is connected by hand, so the
 *  handles are decorative anchors, not controls.
 *
 *  Every side carries both a source and a target handle. With only one type
 *  per side, an edge that runs right to left — the two takes that share a
 *  file live four boards apart, and a four-tier board wraps at three columns
 *  so its t2 input sits to the right of its own take — asks for a source
 *  handle on a side that only has a target one, and React Flow silently
 *  renders no edge at all. Six of the forty-seven were missing before this. */
function EdgeAnchors() {
  return (
    <>
      {ANCHOR_SIDES.map(([side, position]) => (
        <Handle
          key={`s-${side}`}
          type="source"
          position={position}
          id={`s-${side}`}
          isConnectable={false}
          className="studio-handle"
        />
      ))}
      {ANCHOR_SIDES.map(([side, position]) => (
        <Handle
          key={`t-${side}`}
          type="target"
          position={position}
          id={`t-${side}`}
          isConnectable={false}
          className="studio-handle"
        />
      ))}
    </>
  );
}

function CardToolbar({ data, isVideo, playing, onTogglePlay }: {
  data: CardData;
  isVideo: boolean;
  playing: boolean;
  onTogglePlay: () => void;
}) {
  const actions = useCanvasActions();
  const { node, meta } = data;
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!meta.productionLine) return;
    void navigator.clipboard
      ?.writeText(meta.productionLine)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, [meta.productionLine]);

  return (
    <NodeToolbar position={Position.Top} offset={12} className="studio-node-toolbar">
      <button type="button" className="studio-chrome__button" onClick={() => actions.addToDesk(node.id)}>
        Add to desk
      </button>
      {meta.openHref ? (
        <a className="studio-chrome__button" href={meta.openHref}>
          Open{meta.openLabel ? ` — ${meta.openLabel}` : ""}
        </a>
      ) : null}
      {meta.productionLine ? (
        <button type="button" className="studio-chrome__button" onClick={copy}>
          {copied ? "Production line copied" : "Copy production line"}
        </button>
      ) : null}
      {isVideo ? (
        <button type="button" className="studio-chrome__button" onClick={onTogglePlay}>
          {playing ? "Pause" : "Play"}
        </button>
      ) : null}
    </NodeToolbar>
  );
}

export function TakeCard({ id, data, selected }: NodeProps<RfCardNode>) {
  const node = data.node as TakeNode;
  const { meta } = data;
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const { playingId, setPlayingId } = usePlayback();
  const reducedMotion = useReducedMotion();
  const isVideo = node.media === "video";
  const playing = playingId === id;

  // One clip at a time: selecting a take asks for playback, selecting another
  // hands it over, and a reader who asked for less motion is offered the
  // controls rather than given a moving picture.
  useEffect(() => {
    if (!isVideo) return;
    if (selected && !reducedMotion) setPlayingId((current) => (current === id ? current : id));
    else if (playing) setPlayingId((current) => (current === id ? undefined : current));
  }, [selected, isVideo, reducedMotion, id, playing, setPlayingId]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  }, [playing]);

  // Off-screen is not watching: a clip that scrolls or pans out of the stage
  // stops, so panning across ten boards never leaves audio running behind.
  useEffect(() => {
    const element = frame.current;
    if (!element || !playing) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => !entry.isIntersecting)) setPlayingId((current) => (current === id ? undefined : current));
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [playing, id, setPlayingId]);

  const togglePlay = useCallback(() => {
    setPlayingId((current) => (current === id ? undefined : id));
  }, [id, setPlayingId]);

  return (
    <div className="studio-card studio-card--take" ref={frame}>
      <EdgeAnchors />
      <CardToolbar data={data} isVideo={isVideo} playing={playing} onTogglePlay={togglePlay} />
      <div className="studio-card__media">
        {isVideo && playing ? (
          <video ref={video} src={node.file} poster={node.poster} controls playsInline preload="metadata" />
        ) : isVideo ? (
          <img src={node.poster ?? node.file} alt={`Recorded take ${node.takeId}`} loading="lazy" />
        ) : (
          <img src={node.file} alt={`Recorded take ${node.takeId}`} loading="lazy" />
        )}
      </div>
      <div className="studio-card__foot">
        {/* The rung, and only on a board that is one week's ladder — see
            src/lib/canvas/ladder.ts. A board of cards from three weeks has no
            progression to number. */}
        {data.rung ? <p className="studio-card__rung">{data.rung}</p> : null}
        <p className="studio-card__badge">Recorded</p>
        <p className="studio-card__address">{node.takeId}</p>
        {meta.counterExample ? <p className="studio-card__counter">Counter-example</p> : null}
      </div>
    </div>
  );
}

export function InputCard({ data }: NodeProps<RfCardNode>) {
  const node = data.node as InputNode;
  const { meta } = data;
  // A week's card reads its prompt out of the manifests the island already
  // holds; the reference episode's segments carry theirs in meta, because no
  // manifest tier owns them.
  const entry = useTier(node.tierId);
  const promptText = entry?.tier.input.promptText ?? meta.promptText;
  const negText = entry?.tier.input.negText ?? meta.negText;
  const files = Array.isArray(node.value) ? node.value : undefined;
  const pictures = files?.filter((file) => !file.endsWith(".graph.json")) ?? [];
  const graph = files?.find((file) => file.endsWith(".graph.json"));

  return (
    <div className="studio-card studio-card--input">
      <EdgeAnchors />
      <CardToolbar data={data} isVideo={false} playing={false} onTogglePlay={() => undefined} />
      <p className="studio-card__kind">
        {/* The same rung its take carries: one step of the ladder, seen from
            the input end. */}
        {data.rung ? <span className="studio-card__rung">{data.rung}</span> : null} {node.label}
      </p>
      {pictures.length ? (
        <div className="studio-card__strip" data-count={pictures.length}>
          {pictures.map((file) => (
            <img key={file} src={file} alt="" loading="lazy" />
          ))}
        </div>
      ) : null}
      {graph ? (
        <a className="studio-card__link" href={graph}>
          Download workflow graph
        </a>
      ) : null}
      {promptText ? <p className="studio-card__text">{promptText}</p> : null}
      {negText ? <p className="studio-card__text studio-card__text--neg">Negative: {negText}</p> : null}
      {!promptText && typeof node.value === "string" ? <p className="studio-card__text">{node.value}</p> : null}
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  loading: "Loading recorded result",
  done: "Done",
};

/** What a desk generation leaves behind while the rig looks its answer up.
 *  It is sized to the aspect of the take it will become, so nothing on the
 *  board moves when the clip arrives. */
export function PlaceholderCard({ data }: NodeProps<RfCardNode>) {
  const node = data.node as PlaceholderNode;
  const { meta } = data;
  const phase = meta.progressPhase ?? "queued";
  const percent = meta.progressPercent ?? 0;

  return (
    <div className="studio-card studio-card--placeholder">
      <EdgeAnchors />
      <p className="studio-card__kind">{PHASE_LABELS[phase] ?? phase}</p>
      <p className="studio-card__status" role="status">
        {PHASE_LABELS[phase] ?? phase} — {percent}%
      </p>
      <progress className="studio-card__progress" max={100} value={percent} />
      <p className="studio-card__address">{node.resolvesTo}</p>
    </div>
  );
}
