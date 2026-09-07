// The desk: the right-hand column where a visitor collects references off
// the canvas and states what they want made of them.
//
// Nothing is generated here. This half of the desk gathers the request; the
// half that answers it replays what the rig recorded.

import { useCallback, useRef, useState } from "react";
import type { CanvasDoc, ID, Node, NodeMeta } from "../../lib/canvas/types";
import type { ClientWeek } from "../../lib/studio-client";
import type { TierEntry } from "./canvas-context";

export const MAX_REFERENCES = 6;

export interface DeskState {
  references: ID[];
  prompt: string;
  addReference(nodeId: ID): void;
  removeReference(nodeId: ID): void;
  moveReference(nodeId: ID, delta: number): void;
  setPrompt(prompt: string): void;
  nodeById(nodeId: ID): Node | undefined;
  metaById(nodeId: ID): NodeMeta;
}

export interface UseDeskOptions {
  doc: CanvasDoc;
  meta: Record<ID, NodeMeta>;
  weeks: ClientWeek[];
  tierIndex: Map<string, TierEntry>;
  setDoc(doc: CanvasDoc): void;
  reducedMotion: boolean;
}

export function useDesk({ doc, meta, tierIndex }: UseDeskOptions): DeskState {
  const [references, setReferences] = useState<ID[]>([]);
  const [prompt, setPrompt] = useState("");

  const nodeById = useCallback((nodeId: ID) => doc.nodes.find((node) => node.id === nodeId), [doc.nodes]);
  const metaById = useCallback((nodeId: ID) => meta[nodeId] ?? {}, [meta]);

  const addReference = useCallback(
    (nodeId: ID) => {
      setReferences((current) => {
        if (current.includes(nodeId) || current.length >= MAX_REFERENCES) return current;
        return [...current, nodeId];
      });
      // The prompt box starts from what the rig actually ran, so the shortest
      // path through the desk is the honest one: add a take, press Generate,
      // get that take's recorded result back.
      const node = doc.nodes.find((candidate) => candidate.id === nodeId);
      const tierId = node && node.type !== "placeholder" ? node.tierId : undefined;
      const recorded =
        tierIndex.get(tierId ?? "")?.tier.input.promptText ?? meta[nodeId]?.promptText ?? meta[nodeId]?.recordedInput ?? "";
      setPrompt((current) => (current.trim() ? current : recorded));
    },
    [doc.nodes, meta, tierIndex],
  );

  const removeReference = useCallback((nodeId: ID) => {
    setReferences((current) => current.filter((id) => id !== nodeId));
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

  return { references, prompt, addReference, removeReference, moveReference, setPrompt, nodeById, metaById };
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
  if (node.type === "take") return meta.takeId ?? "Recorded take";
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

  // A slot that is reordered from the keyboard has to keep the keyboard: the
  // list re-renders around the button that was just pressed, so focus is put
  // back on the same slot's control, and pressing the key twice moves the
  // slot twice.
  const refocus = useCallback((nodeId: ID, action: string) => {
    window.requestAnimationFrame(() => {
      list.current?.querySelector<HTMLButtonElement>(`[data-slot="${nodeId}"][data-action="${action}"]`)?.focus();
    });
  }, []);

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
            <p className="studio-desk__hint">
              Up to {MAX_REFERENCES}. Add one with a card&rsquo;s Add to desk, or with Enter on a selected card.
            </p>
            {desk.references.length === 0 ? (
              <p className="studio-desk__empty">No references yet.</p>
            ) : (
              <ul className="studio-desk__slots" ref={list}>
                {desk.references.map((nodeId, index) => {
                  const node = desk.nodeById(nodeId);
                  const meta = desk.metaById(nodeId);
                  const thumbnail = thumbnailFor(node);
                  return (
                    <li key={nodeId} className="studio-desk__slot">
                      {thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <span className="studio-desk__slot-mark" aria-hidden="true" />}
                      <span className="studio-desk__slot-name">{describe(node, meta)}</span>
                      <span className="studio-desk__slot-controls">
                        <button
                          type="button"
                          className="at-button at-button--outline"
                          data-slot={nodeId}
                          data-action="up"
                          aria-disabled={index === 0}
                          onClick={() => {
                            if (index === 0) return;
                            desk.moveReference(nodeId, -1);
                            refocus(nodeId, "up");
                          }}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          className="at-button at-button--outline"
                          data-slot={nodeId}
                          data-action="down"
                          aria-disabled={index === desk.references.length - 1}
                          onClick={() => {
                            if (index === desk.references.length - 1) return;
                            desk.moveReference(nodeId, 1);
                            refocus(nodeId, "down");
                          }}
                        >
                          Move down
                        </button>
                        <button type="button" className="at-button at-button--outline" onClick={() => onFocusNode(nodeId)}>
                          Show on canvas
                        </button>
                        <button type="button" className="at-button at-button--outline" onClick={() => desk.removeReference(nodeId)}>
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
          </section>
        </div>
      ) : null}
    </aside>
  );
}
