// The desk: the right-hand column where a visitor collects references off the
// canvas, says what they want made of them, and gets back what the rig
// actually recorded.
//
// Nothing is generated here and nothing pretends to be. Generate is a lookup:
// it hands { week, tierId } to the recorded backend the Studio already had
// (src/scripts/studio/backends/recorded.ts) and drops the file that backend
// returns onto a new board, labelled Recorded, with an edge from every
// reference and the production line underneath.

import { useCallback, useMemo, useRef, useState } from "react";
import { planLine } from "../../lib/canvas/doc";
import { beginDeskGeneration, completeDeskGeneration } from "../../lib/canvas/engine";
import { DESK_MESSAGES, resolveDeskRequest, tierIdOfNode, type DeskResolution } from "../../lib/canvas/resolve";
import type { CanvasDoc, ID, Node, NodeMeta, TakeNode } from "../../lib/canvas/types";
import { createRecordedBackend } from "../../scripts/studio/backends/recorded";
import type { RunResult } from "../../scripts/studio/backends/types";
import type { TierEntry } from "./canvas-context";

export const MAX_REFERENCES = 6;
const RECENT_MAX = 5;

export interface DeskState {
  references: ID[];
  prompt: string;
  answer: DeskResolution | undefined;
  running: boolean;
  lastResult: RunResult | undefined;
  lastPlan: string | undefined;
  recent: TakeNode[];
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
  meta: Record<ID, NodeMeta>;
  tierIndex: Map<string, TierEntry>;
  setProgress(nodeId: ID, progress: NodeMeta | undefined): void;
}

export function useDesk({ getDoc, setDoc, meta, tierIndex, setProgress }: UseDeskOptions): DeskState {
  const [references, setReferences] = useState<ID[]>([]);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<DeskResolution | undefined>(undefined);
  const [lastResult, setLastResult] = useState<RunResult | undefined>(undefined);
  const [lastPlan, setLastPlan] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  // The guard that actually refuses a second press, so Generate never needs
  // `disabled` — which would blur the button the keyboard just used.
  const busy = useRef(false);

  const weeks = useMemo(() => [...new Set([...tierIndex.values()].map((entry) => entry.week))], [tierIndex]);
  const backend = useMemo(() => createRecordedBackend(weeks), [weeks]);

  const nodeById = useCallback((nodeId: ID) => getDoc().nodes.find((node) => node.id === nodeId), [getDoc]);
  const metaById = useCallback((nodeId: ID) => meta[nodeId] ?? {}, [meta]);

  const recordedInputOfNode = useCallback(
    (nodeId: ID) => {
      const tierId = tierIdOfNode(nodeById(nodeId));
      const entry = tierId ? tierIndex.get(tierId) : undefined;
      if (!entry) return undefined;
      const { input } = entry.tier;
      return input.promptText ?? (typeof input.value === "number" ? String(input.value) : undefined);
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
      // The prompt box starts from what the rig was actually given, so the
      // shortest path through the desk is the honest one: add a take, press
      // Generate, get that take's recorded result back.
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

  const resolution = useCallback(
    (): DeskResolution =>
      resolveDeskRequest({
        references,
        prompt,
        tierOf: (nodeId) => {
          const tierId = tierIdOfNode(nodeById(nodeId));
          const entry = tierId ? tierIndex.get(tierId) : undefined;
          if (!entry) return undefined;
          const recorded = recordedInputOfNode(nodeId) ?? "";
          return { week: entry.week.week, tierId: entry.tier.id, recordedInput: recorded.replace(/\s+/g, " ").trim() };
        },
      }),
    [references, prompt, nodeById, tierIndex, recordedInputOfNode],
  );

  const useRecordedInput = useCallback(() => {
    const current = resolution();
    if (current.kind !== "prompt-differs") return;
    const entry = tierIndex.get(current.tierId);
    const input = entry?.tier.input;
    setPrompt(input?.promptText ?? (typeof input?.value === "number" ? String(input.value) : ""));
    setAnswer(undefined);
  }, [resolution, tierIndex]);

  const generate = useCallback(async () => {
    if (busy.current) return;
    const request = resolution();
    setAnswer(request);
    if (request.kind !== "resolved") return;

    const recordedNodeId = `${request.tierId}-take`;
    const recorded = getDoc().nodes.find((node) => node.id === recordedNodeId);
    if (!recorded || recorded.type !== "take") return;

    busy.current = true;
    setRunning(true);

    const id = `${Date.now().toString(36)}`;
    const started = beginDeskGeneration(getDoc(), {
      id,
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
        completeDeskGeneration(getDoc(), started.nodeId, {
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
  }, [resolution, getDoc, setDoc, references, prompt, backend, setProgress, tierIndex]);

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
  // this strip is the newest five of it rather than a second list to keep in
  // step with the first.
  const recent = useMemo(() => {
    return getDoc()
      .nodes.filter((node): node is TakeNode => node.type === "take" && node.origin.kind === "desk")
      .sort((a, b) => (a.origin.kind === "desk" && b.origin.kind === "desk" ? b.origin.at.localeCompare(a.origin.at) : 0))
      .slice(0, RECENT_MAX);
    // getDoc is stable; the document identity is what actually changes, and
    // the island re-renders this component when it does.
  }, [getDoc]);

  return {
    references,
    prompt,
    answer,
    running,
    lastResult,
    lastPlan,
    recent,
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
}

export function Desk({ desk, readOnly, onFocusNode }: DeskProps) {
  const [open, setOpen] = useState(true);
  const list = useRef<HTMLUListElement>(null);
  const generateButton = useRef<HTMLButtonElement>(null);

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
          <section className="studio-desk__section" aria-labelledby="desk-slots">
            <h4 id="desk-slots" className="studio-desk__label">
              Reference slots
            </h4>
            <p className="studio-desk__hint" id="desk-slots-hint">
              Up to {MAX_REFERENCES}. Add one with a card&rsquo;s Add to desk, with Enter on a selected card, or by
              dragging a card onto the desk. On a slot, the up and down arrow keys reorder it.
            </p>
            {desk.references.length === 0 ? (
              <p className="studio-desk__empty">No references yet.</p>
            ) : (
              <ul className="studio-desk__slots" ref={list}>
                {desk.references.map((nodeId, index) => {
                  const node = desk.nodeById(nodeId);
                  const meta = desk.metaById(nodeId);
                  const thumbnail = thumbnailFor(node);
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
                        {thumbnail ? (
                          <img src={thumbnail} alt="" loading="lazy" />
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

          <section className="studio-desk__section">
            <label className="studio-desk__label" htmlFor="desk-prompt">
              Prompt
            </label>
            <textarea
              id="desk-prompt"
              className="studio-desk__prompt"
              rows={8}
              value={desk.prompt}
              readOnly={readOnly}
              onChange={(event) => desk.setPrompt(event.target.value)}
            />

            <div className="studio-desk__run">
              <button
                ref={generateButton}
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
