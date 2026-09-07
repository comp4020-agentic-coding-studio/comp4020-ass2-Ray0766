// The desk: three steps down the right-hand side, and the rig answers.
//
// Nothing is generated here and nothing pretends to be. Generate is a lookup:
// it hands { week, tierId } to the recorded backend the Studio already had
// (src/scripts/studio/backends/recorded.ts) and puts the file that backend
// returns on that week's board, with the production line underneath.
//
// v2 moved the starting point. The canvas opens empty, so there is nothing on
// it to take a reference off; the desk therefore begins with the rig itself —
// pick a week, pick one of its recorded inputs, generate — and the board grows
// out of that. The reference slots are still here and still work the same way,
// for the second turn onwards: once something is on the canvas, a card can go
// on the desk and the answer lands under the board it came from.

import { useCallback, useMemo, useRef, useState } from "react";
import { planLine } from "../../lib/canvas/lines";
import { beginDeskGeneration, completeDeskGeneration } from "../../lib/canvas/engine";
import { beginReplay, completeReplay } from "../../lib/canvas/session";
import { DESK_MESSAGES, resolveDeskRequest, tierIdOfNode, type DeskResolution } from "../../lib/canvas/resolve";
import type { CanvasDoc, ID, Node, NodeMeta, TakeNode } from "../../lib/canvas/types";
import type { ClientTier, ClientWeek } from "../../lib/studio-client";
import { createRecordedBackend } from "../../scripts/studio/backends/recorded";
import type { RunResult } from "../../scripts/studio/backends/types";
import type { TierEntry } from "./canvas-context";

export const MAX_REFERENCES = 6;
const RECENT_MAX = 5;

/** The desk's own step-2 pick, standing in for a canvas node so the resolver
 *  answers a selection and a reference through exactly the same five rules. */
const SELECTION_REF = "desk:selection";

export interface DeskState {
  weeks: ClientWeek[];
  week: number;
  tierId: string;
  references: ID[];
  prompt: string;
  answer: DeskResolution | undefined;
  running: boolean;
  lastResult: RunResult | undefined;
  lastPlan: string | undefined;
  recent: TakeNode[];
  selectWeek(week: number): void;
  selectTier(tierId: string): void;
  addReference(nodeId: ID): void;
  removeReference(nodeId: ID): void;
  moveReference(nodeId: ID, delta: number): void;
  setPrompt(prompt: string): void;
  useRecordedInput(): void;
  generate(): Promise<void>;
  downloadLog(): void;
  nodeById(nodeId: ID): Node | undefined;
  metaById(nodeId: ID): NodeMeta;
}

export interface UseDeskOptions {
  getDoc(): CanvasDoc;
  setDoc(doc: CanvasDoc): void;
  /** The whole rig, as the build laid it out. A replay copies out of this. */
  built: CanvasDoc;
  weeks: ClientWeek[];
  meta: Record<ID, NodeMeta>;
  tierIndex: Map<string, TierEntry>;
  setProgress(nodeId: ID, progress: NodeMeta | undefined): void;
}

/** What the rig was actually given for a tier: its prompt, or its seed. The
 *  desk compares a typed prompt against this and never against a paraphrase. */
export function recordedInputOfTier(tier: ClientTier): string {
  return tier.input.promptText ?? (typeof tier.input.value === "number" ? String(tier.input.value) : "");
}

export function useDesk({ getDoc, setDoc, built, weeks, meta, tierIndex, setProgress }: UseDeskOptions): DeskState {
  const [week, setWeek] = useState(weeks[0]?.week ?? 2);
  const [tierId, setTierId] = useState(weeks[0]?.tiers[0]?.id ?? "");
  const [references, setReferences] = useState<ID[]>([]);
  const [prompt, setPrompt] = useState(weeks[0]?.tiers[0] ? recordedInputOfTier(weeks[0].tiers[0]) : "");
  const [answer, setAnswer] = useState<DeskResolution | undefined>(undefined);
  const [lastResult, setLastResult] = useState<RunResult | undefined>(undefined);
  const [lastPlan, setLastPlan] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [recentIds, setRecentIds] = useState<ID[]>([]);
  // The guard that actually refuses a second press, so Generate never needs
  // `disabled` — which would blur the button the keyboard just used.
  const busy = useRef(false);

  const backend = useMemo(() => createRecordedBackend(weeks), [weeks]);

  const nodeById = useCallback((nodeId: ID) => getDoc().nodes.find((node) => node.id === nodeId), [getDoc]);
  const metaById = useCallback((nodeId: ID) => meta[nodeId] ?? {}, [meta]);

  const selectedTier = useMemo(() => tierIndex.get(tierId)?.tier, [tierIndex, tierId]);

  /** Step 2 fills the prompt box with the run's own input, so the shortest
   *  path through the desk is the honest one: pick, press, get that run back. */
  const selectTier = useCallback(
    (next: ID) => {
      setTierId(next);
      setAnswer(undefined);
      const tier = tierIndex.get(next)?.tier;
      if (tier) setPrompt(recordedInputOfTier(tier));
    },
    [tierIndex],
  );

  const selectWeek = useCallback(
    (next: number) => {
      setWeek(next);
      const first = weeks.find((candidate) => candidate.week === next)?.tiers[0];
      if (first) selectTier(first.id);
    },
    [weeks, selectTier],
  );

  const recordedInputOfNode = useCallback(
    (nodeId: ID) => {
      const tier = tierIndex.get(tierIdOfNode(nodeById(nodeId)) ?? "")?.tier;
      return tier ? recordedInputOfTier(tier) : undefined;
    },
    [nodeById, tierIndex],
  );

  const addReference = useCallback(
    (nodeId: ID) => {
      setReferences((current) => {
        if (current.includes(nodeId) || current.length >= MAX_REFERENCES) return current;
        return [...current, nodeId];
      });
      setAnswer(undefined);
      const recorded = recordedInputOfNode(nodeId) ?? metaById(nodeId).promptText ?? "";
      setPrompt((current) => (current.trim() ? current : recorded));
    },
    [metaById, recordedInputOfNode],
  );

  const removeReference = useCallback((nodeId: ID) => {
    setReferences((current) => current.filter((id) => id !== nodeId));
    setAnswer(undefined);
  }, []);

  const moveReference = useCallback((nodeId: ID, delta: number) => {
    setReferences((current) => {
      const index = current.indexOf(nodeId);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const reordered = [...current];
      reordered.splice(index, 1);
      reordered.splice(next, 0, nodeId);
      return reordered;
    });
  }, []);

  const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

  const resolution = useCallback((): DeskResolution => {
    // Slots win when there are any: putting a card on the desk is a deliberate
    // act, and it is what the answer should be about.
    if (references.length > 0) {
      return resolveDeskRequest({
        references,
        prompt,
        tierOf: (nodeId) => {
          const entry = tierIndex.get(tierIdOfNode(nodeById(nodeId)) ?? "");
          if (!entry) return undefined;
          return {
            week: entry.week.week,
            tierId: entry.tier.id,
            recordedInput: normalise(recordedInputOfTier(entry.tier)),
          };
        },
      });
    }

    return resolveDeskRequest({
      references: [SELECTION_REF],
      prompt,
      tierOf: (id) => {
        if (id !== SELECTION_REF || !selectedTier) return undefined;
        return { week, tierId: selectedTier.id, recordedInput: normalise(recordedInputOfTier(selectedTier)) };
      },
    });
  }, [references, prompt, nodeById, tierIndex, selectedTier, week]);

  const useRecordedInput = useCallback(() => {
    const current = resolution();
    if (current.kind !== "prompt-differs") return;
    const tier = tierIndex.get(current.tierId)?.tier;
    if (tier) setPrompt(recordedInputOfTier(tier));
    setAnswer(undefined);
  }, [resolution, tierIndex]);

  const remember = useCallback((nodeId: ID) => {
    setRecentIds((current) => [nodeId, ...current.filter((id) => id !== nodeId)].slice(0, RECENT_MAX));
  }, []);

  const generate = useCallback(async () => {
    if (busy.current) return;
    const request = resolution();
    setAnswer(request);
    if (request.kind !== "resolved") return;

    const recordedNodeId = `${request.tierId}-take`;
    const recorded = built.nodes.find((node) => node.id === recordedNodeId);
    if (!recorded || recorded.type !== "take") return;

    busy.current = true;
    setRunning(true);

    // Two placements, one rule each. With nothing on the desk the answer is
    // this week's board (§v2), growing it if it is already there. With
    // references on the desk the answer belongs under the board they came off
    // (§3), which is what beginDeskGeneration has always done.
    const replay = references.length === 0;
    const started = replay
      ? beginReplay(getDoc(), built, request.tierId)
      : beginDeskGeneration(getDoc(), {
          id: Date.now().toString(36),
          refNodeIds: references,
          prompt,
          at: new Date(),
          naturalW: recorded.naturalW,
          naturalH: recorded.naturalH,
          resolvesTo: recordedNodeId,
        });
    setDoc(started.doc);

    try {
      const result = await backend.run({ week: request.week, tierId: request.tierId }, (progress) => {
        setProgress(started.nodeId, { progressPhase: progress.phase, progressPercent: progress.percent });
      });

      setDoc(
        replay
          ? completeReplay(getDoc(), built, request.tierId)
          : completeDeskGeneration(getDoc(), started.nodeId, {
              media: result.outputKind,
              file: result.file,
              poster: result.poster,
              naturalW: recorded.naturalW,
              naturalH: recorded.naturalH,
              tierId: result.tierId,
              takeId: recorded.takeId,
            }),
      );
      setProgress(started.nodeId, undefined);
      setLastResult(result);
      remember(started.nodeId);

      const entry = tierIndex.get(request.tierId);
      setLastPlan(
        entry
          ? planLine(recorded.takeId, entry.week.model, entry.week.mode, entry.week.resolution)
          : `Replayed ${recorded.takeId}`,
      );
    } catch {
      setLastPlan(undefined);
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [resolution, getDoc, setDoc, built, references, prompt, backend, setProgress, tierIndex, remember]);

  const downloadLog = useCallback(() => {
    if (!lastResult) return;
    const entry = tierIndex.get(lastResult.tierId);
    const log = {
      generatedAt: new Date().toISOString(),
      week: lastResult.week,
      instrument: entry?.week.instrument,
      model: entry?.week.model,
      mode: entry?.week.mode,
      resolution: entry?.week.resolution,
      tier: lastResult.tier,
      label: lastResult.label,
      outputKind: lastResult.outputKind,
      file: lastResult.file,
      note: entry?.tier.note,
      source: "recorded",
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studio-week-${lastResult.week}-${lastResult.tier}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [lastResult, tierIndex]);

  // History is the document itself: what the desk made is on the canvas, and
  // this strip is the newest five of it, in the order they were asked for.
  const recent = useMemo(() => {
    const doc = getDoc();
    return recentIds.flatMap((id) => {
      const node = doc.nodes.find((candidate) => candidate.id === id);
      return node && node.type === "take" ? [node] : [];
    });
  }, [getDoc, recentIds]);

  return {
    weeks,
    week,
    tierId,
    references,
    prompt,
    answer,
    running,
    lastResult,
    lastPlan,
    recent,
    selectWeek,
    selectTier,
    addReference,
    removeReference,
    moveReference,
    setPrompt,
    useRecordedInput,
    generate,
    downloadLog,
    nodeById,
    metaById,
  };
}

const KIND_LABELS: Record<string, string> = {
  seed: "Seed",
  prompt: "Prompt",
  image: "Source still",
  "image pair": "First and last frame",
  "reference set": "Reference set",
  graph: "Workflow graph",
  upscale: "Upscale graph",
  script: "Script",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** The first thing in an input that is actually a picture. A `.graph.json` is
 *  a download, not a thumbnail. */
function inputThumbnail(tier: ClientTier): string | undefined {
  return tier.input.files?.find((file) => !file.endsWith(".graph.json"));
}

function thumbnailFor(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "take") return node.poster ?? node.file;
  if (node.type === "input" && Array.isArray(node.value)) {
    return node.value.find((file) => !file.endsWith(".graph.json"));
  }
  return undefined;
}

function describe(node: Node | undefined, meta: NodeMeta): string {
  if (!node) return "";
  if (node.type === "take") return meta.takeId ?? node.takeId;
  if (node.type === "input") return node.label;
  return "Pending";
}

export interface DeskProps {
  desk: DeskState;
  readOnly: boolean;
  onFocusNode(nodeId: ID): void;
  /** Between 641 and 899 the desk sits under the canvas rather than beside
   *  it, and starts collapsed so the canvas is what the page opens on. */
  startOpen: boolean;
}

export function Desk({ desk, readOnly, onFocusNode, startOpen }: DeskProps) {
  const [open, setOpen] = useState(startOpen);
  const list = useRef<HTMLUListElement>(null);

  const week = desk.weeks.find((candidate) => candidate.week === desk.week);
  const tier = week?.tiers.find((candidate) => candidate.id === desk.tierId);
  const thumbnail = tier ? inputThumbnail(tier) : undefined;

  // A slot reordered from the keyboard has to keep the keyboard: the list
  // re-renders around the handle that was just used, so focus goes back on
  // the same slot's handle and pressing the key twice moves it twice.
  const reorder = useCallback(
    (nodeId: ID, delta: number) => {
      desk.moveReference(nodeId, delta);
      window.requestAnimationFrame(() => {
        list.current?.querySelector<HTMLButtonElement>(`[data-slot="${nodeId}"]`)?.focus();
      });
    },
    [desk],
  );

  const answer = desk.answer;

  return (
    <aside className="studio-desk" aria-label="Desk" data-open={open ? "true" : "false"}>
      <div className="studio-desk__head">
        <h3 className="studio-desk__title">Desk</h3>
        <button
          type="button"
          className="at-button at-button--outline studio-desk__collapse"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Collapse desk" : "Open desk"}
        </button>
      </div>

      {open ? (
        <div className="studio-desk__body">
          <fieldset className="studio-desk__step">
            <legend className="studio-desk__legend">
              <span className="studio-desk__step-number">1</span> Week
            </legend>
            <div className="studio-desk__segments">
              {desk.weeks.map((candidate) => (
                <label key={candidate.week} className="studio-desk__segment">
                  <input
                    type="radio"
                    name="desk-week"
                    value={candidate.week}
                    checked={candidate.week === desk.week}
                    onChange={() => desk.selectWeek(candidate.week)}
                  />
                  <span>{candidate.week}</span>
                </label>
              ))}
            </div>
            <p className="studio-desk__hint">{week ? week.instrument : ""}</p>
          </fieldset>

          <fieldset className="studio-desk__step">
            <legend className="studio-desk__legend">
              <span className="studio-desk__step-number">2</span> Input
            </legend>
            <ul className="studio-desk__tiers">
              {(week?.tiers ?? []).map((candidate) => {
                const picture = inputThumbnail(candidate);
                return (
                  <li key={candidate.id}>
                    <label className="studio-desk__tier">
                      <input
                        type="radio"
                        name="desk-tier"
                        value={candidate.id}
                        checked={candidate.id === desk.tierId}
                        onChange={() => desk.selectTier(candidate.id)}
                      />
                      {picture ? (
                        <img className="studio-desk__tier-thumb" src={picture} alt="" loading="lazy" />
                      ) : (
                        <span className="studio-desk__tier-thumb studio-desk__tier-thumb--text" aria-hidden="true">
                          {candidate.tier}
                        </span>
                      )}
                      <span className="studio-desk__tier-text">
                        <span className="studio-desk__tier-label">{candidate.label}</span>
                        <span className="studio-desk__tier-kind">{kindLabel(candidate.input.kind)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {/* An input the rig was handed as a file rather than as text: the
                prompt box has nothing to show, so the card shows what it
                actually got. */}
            {tier && !tier.input.promptText ? (
              <div className="studio-desk__input-card">
                <p className="studio-desk__label">{kindLabel(tier.input.kind)}</p>
                {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : null}
                {typeof tier.input.value === "number" ? <p>Seed {tier.input.value}</p> : null}
                {tier.input.files?.some((file) => file.endsWith(".graph.json")) ? (
                  <a className="at-button at-button--outline" href={tier.input.files.find((f) => f.endsWith(".graph.json"))}>
                    Download workflow graph
                  </a>
                ) : null}
              </div>
            ) : null}

            <label className="studio-desk__label" htmlFor="desk-prompt">
              Prompt
            </label>
            <textarea
              id="desk-prompt"
              className="studio-desk__prompt"
              rows={6}
              value={desk.prompt}
              readOnly={readOnly}
              onChange={(event) => desk.setPrompt(event.target.value)}
            />
          </fieldset>

          <section className="studio-desk__step">
            <h4 className="studio-desk__legend">
              <span className="studio-desk__step-number">3</span> Generate
            </h4>
            <div className="studio-desk__run">
              <button
                type="button"
                className="at-button"
                aria-disabled={desk.running}
                aria-busy={desk.running}
                onClick={() => void desk.generate()}
              >
                Generate
              </button>
              {desk.lastResult ? (
                <button type="button" className="at-button at-button--outline" onClick={desk.downloadLog}>
                  Download production log
                </button>
              ) : null}
            </div>

            <p className="studio-desk__answer" role="status">
              {answer && answer.kind !== "resolved" ? (
                <>
                  {DESK_MESSAGES[answer.kind]}
                  {answer.kind === "prompt-differs" ? (
                    <>
                      {" "}
                      <span className="studio-desk__recorded">{answer.recordedInput}</span>{" "}
                      <button type="button" className="at-button at-button--outline" onClick={desk.useRecordedInput}>
                        Use the recorded input
                      </button>
                    </>
                  ) : null}
                </>
              ) : desk.lastPlan ? (
                desk.lastPlan
              ) : (
                ""
              )}
            </p>
          </section>

          <section className="studio-desk__section" aria-labelledby="desk-slots">
            <h4 id="desk-slots" className="studio-desk__label">
              Reference slots
            </h4>
            <p className="studio-desk__hint" id="desk-slots-hint">
              Up to {MAX_REFERENCES}. Add one with a card&rsquo;s Add to desk, with Enter on a selected card, or by
              dragging a card onto the desk. A slot on the desk replaces the pick above, and the result lands under
              the board the card came off. On a slot, the up and down arrow keys reorder it.
            </p>
            {desk.references.length === 0 ? (
              <p className="studio-desk__empty">No references yet.</p>
            ) : (
              <ul className="studio-desk__slots" ref={list}>
                {desk.references.map((nodeId, index) => {
                  const node = desk.nodeById(nodeId);
                  const meta = desk.metaById(nodeId);
                  const slotThumb = thumbnailFor(node);
                  const name = describe(node, meta);
                  return (
                    <li
                      key={nodeId}
                      className="studio-desk__slot"
                      onDragOver={(event) => {
                        if (readOnly) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        if (readOnly) return;
                        event.preventDefault();
                        const dragged = event.dataTransfer.getData("text/plain");
                        if (!dragged || dragged === nodeId) return;
                        const from = desk.references.indexOf(dragged);
                        if (from < 0) return;
                        desk.moveReference(dragged, index - from);
                      }}
                    >
                      <button
                        type="button"
                        className="studio-desk__slot-handle"
                        data-slot={nodeId}
                        draggable={!readOnly}
                        aria-label={`Reference ${index + 1} of ${desk.references.length}: ${name}. Arrow keys reorder.`}
                        onDragStart={(event) => event.dataTransfer.setData("text/plain", nodeId)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            reorder(nodeId, -1);
                          }
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            reorder(nodeId, 1);
                          }
                        }}
                      >
                        {slotThumb ? (
                          <img src={slotThumb} alt="" loading="lazy" />
                        ) : (
                          <span className="studio-desk__slot-mark" aria-hidden="true" />
                        )}
                        <span className="studio-desk__slot-name">{name}</span>
                      </button>
                      <span className="studio-desk__slot-controls">
                        <button
                          type="button"
                          className="at-button at-button--outline"
                          onClick={() => onFocusNode(nodeId)}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          className="at-button at-button--outline"
                          onClick={() => desk.removeReference(nodeId)}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {desk.recent.length ? (
            <section className="studio-desk__section" aria-labelledby="desk-recent">
              <h4 id="desk-recent" className="studio-desk__label">
                Recent
              </h4>
              <ul className="studio-desk__recent">
                {desk.recent.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className="at-button at-button--outline"
                      onClick={() => onFocusNode(node.id)}
                    >
                      {node.takeId}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
