// Compare, as a verb: two to five takes side by side at equal height, under
// one transport.
//
// It is a native `<dialog>` opened with `showModal()` rather than a div with a
// hand-rolled focus trap. The platform then owns the three things this has to
// get right and a div would have to reimplement: nothing outside the dialog is
// reachable, Escape closes it, and focus returns to whatever had it when the
// dialog opened — which is the control that opened it, and is what §2 asks for.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  COMPARE_FPS,
  clampClock,
  driftCorrections,
  nextPanel,
  type ClipReading,
} from "../../lib/canvas/compare";
import type { NodeMeta, TakeNode } from "../../lib/canvas/types";
import type { ClientTier } from "../../lib/studio-client";

export interface ComparePanelData {
  node: TakeNode;
  meta: NodeMeta;
  tier?: ClientTier;
}

export interface CompareLightboxProps {
  panels: ComparePanelData[];
  onClose(): void;
}

export function CompareLightbox({ panels, onClose }: CompareLightboxProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const media = useRef(new Map<string, HTMLVideoElement>());
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Nothing autoplays here, for anybody. That is what `prefers-reduced-motion:
  // no autoplay` asks for, and making it the rule rather than a branch means
  // there is no second behaviour to keep in step with this one.
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [durations, setDurations] = useState<Record<string, number>>({});

  const videos = panels.filter((panel) => panel.node.media === "video");
  const longest = Object.values(durations).reduce((max, value) => Math.max(max, value), 0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // Esc reaches the dialog before React sees it, so the close has to come
    // back through here or the island would keep rendering a closed dialog.
    const onCancel = () => onClose();
    element.addEventListener("close", onCancel);
    return () => element.removeEventListener("close", onCancel);
  }, [onClose]);

  useEffect(() => {
    panelRefs.current[0]?.focus();
  }, []);

  const readings = useCallback((): ClipReading[] => {
    return [...media.current.entries()].flatMap(([id, element]) =>
      Number.isFinite(element.duration)
        ? [{ id, currentTime: element.currentTime, duration: element.duration }]
        : [],
    );
  }, []);

  /** One clock, and every clip pulled back onto it when it drifts more than a
   *  frame. The decision is the pure reducer's; this only applies it. */
  const sync = useCallback(
    (to: number) => {
      const current = readings();
      const target = clampClock(to, current);
      for (const correction of driftCorrections(current, target)) {
        const element = media.current.get(correction.id);
        if (element) element.currentTime = correction.seekTo;
      }
      setClock(target);
    },
    [readings],
  );

  // The transport. rAF rather than `timeupdate`, which Chrome fires about four
  // times a second — a quarter of a second is six frames of drift.
  useEffect(() => {
    if (!playing) {
      for (const element of media.current.values()) element.pause();
      return;
    }
    for (const element of media.current.values()) void element.play().catch(() => undefined);

    let frame = 0;
    const tick = () => {
      const current = readings();
      // The leader is whichever clip is furthest along and still running: a
      // clip that has ended stops being the clock rather than pinning it.
      const lead = current.reduce((max, clip) => Math.max(max, clip.currentTime), 0);
      const target = clampClock(lead, current);
      for (const correction of driftCorrections(current, target)) {
        const element = media.current.get(correction.id);
        if (element) element.currentTime = correction.seekTo;
      }
      setClock(target);
      if (current.length && current.every((clip) => clip.currentTime >= clip.duration - 1 / COMPARE_FPS)) {
        setPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [playing, readings]);

  const toggle = useCallback(() => {
    if (!videos.length) return;
    setPlaying((current) => !current);
  }, [videos.length]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const next = nextPanel(cursor, event.key === "ArrowRight" ? 1 : -1, panels.length);
        setCursor(next);
        panelRefs.current[next]?.focus();
      }
      // Space is play/pause everywhere in the dialog except inside the scrub,
      // where the range input's own Space would fight it.
      if (event.key === " " && !(event.target as HTMLElement).matches("input[type=range]")) {
        event.preventDefault();
        toggle();
      }
    },
    [cursor, panels.length, toggle],
  );

  return (
    <dialog
      ref={dialog}
      className="studio-compare"
      aria-label={`Comparing ${panels.length} takes`}
      onKeyDown={onKeyDown}
      onClose={onClose}
    >
      <div className="studio-compare__head">
        <h2 className="studio-compare__title">Comparing {panels.length} takes</h2>
        <button type="button" className="at-button at-button--outline" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>

      <div className="studio-compare__panels" data-count={panels.length}>
        {panels.map((panel, index) => {
          const { node, meta, tier } = panel;
          const caption = [meta.takeId ?? node.takeId, tier?.label].filter(Boolean).join(" · ");
          return (
            <div
              key={node.id}
              className="studio-compare__panel"
              tabIndex={index === cursor ? 0 : -1}
              role="group"
              aria-label={caption}
              ref={(element) => {
                panelRefs.current[index] = element;
              }}
              onFocus={() => setCursor(index)}
            >
              <figure className="studio-compare__figure">
                {node.media === "video" ? (
                  <video
                    ref={(element) => {
                      if (element) media.current.set(node.id, element);
                      else media.current.delete(node.id);
                    }}
                    src={node.file}
                    poster={node.poster}
                    playsInline
                    preload="metadata"
                    muted
                    onLoadedMetadata={(event) => {
                      // Read before the updater, not inside it: React runs a
                      // functional setState after the handler returns, and by
                      // then `event.currentTarget` is null. It threw on the
                      // first press of Compare in Chrome and the dialog never
                      // opened at all.
                      const seconds = event.currentTarget.duration;
                      setDurations((current) => ({ ...current, [node.id]: seconds }));
                    }}
                  />
                ) : (
                  <img src={node.file} alt={`Recorded take ${node.takeId}`} />
                )}
                <figcaption>
                  <span className="studio-compare__address">{meta.takeId ?? node.takeId}</span>
                  {tier?.label ? <span className="studio-compare__label">{tier.label}</span> : null}
                  {meta.note ? <span className="studio-compare__note">{meta.note}</span> : null}
                  {meta.counterExample ? (
                    <span className="studio-compare__counter">Counter-example</span>
                  ) : null}
                </figcaption>
              </figure>
            </div>
          );
        })}
      </div>

      {videos.length ? (
        <div className="studio-compare__transport">
          <button type="button" className="at-button" onClick={toggle} aria-pressed={playing}>
            {playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            className="studio-compare__scrub"
            aria-label="Position in every take"
            min={0}
            max={Math.max(longest, 0.1)}
            step={1 / COMPARE_FPS}
            value={clock}
            onChange={(event) => {
              setPlaying(false);
              sync(Number(event.target.value));
            }}
          />
          <span className="studio-compare__clock">{clock.toFixed(2)}s</span>
        </div>
      ) : null}

      <p className="studio-compare__hint">
        Left and right arrows move between takes. Space plays and pauses every clip at once; the scrub moves them
        together. Nothing starts on its own.
      </p>
    </dialog>
  );
}
