// The Studio's canvas island. Everything it draws comes from the document
// the build handed it; everything it changes goes back through the pure
// engine functions, so what the browser does and what the tests assert are
// the same code.

import {
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
  type NodeChange,
  type NodeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  boardUnder,
  createBoardFor,
  deleteObjects,
  MAX_ZOOM,
  MIN_ZOOM,
  moveNodes,
  relayoutBoard,
  renameBoard,
  reparentNodes,
  worldRect,
} from "../../lib/canvas/engine";
import { RF_TYPE, toRfEdges, toRfNodes, type StudioRfNode } from "../../lib/canvas/rf";
import { clearDoc, mergeStoredDoc, readStoredDoc, writeDoc } from "../../lib/canvas/storage";
import type { CanvasBundle, CanvasDoc } from "../../lib/canvas/types";
import type { ClientWeek } from "../../lib/studio-client";
import { BoardNode } from "./BoardNode";
import { InputCard, PlaceholderCard, TakeCard } from "./CardNodes";
import {
  BoardRenameProvider,
  buildTierIndex,
  CanvasActionsProvider,
  PlaybackProvider,
  TierIndexProvider,
  useReducedMotion,
} from "./canvas-context";
import { Desk, useDesk } from "./Desk";

const NODE_TYPES: NodeTypes = {
  [RF_TYPE.board]: BoardNode,
  [RF_TYPE.take]: TakeCard,
  [RF_TYPE.input]: InputCard,
  [RF_TYPE.placeholder]: PlaceholderCard,
};

const HASH_PATTERN = /^#week-(\d{2}):(.+)$/;

/** `#week-05:t3` — the anchor the Dailies already link to. */
function nodeIdForHash(hash: string): string | undefined {
  const match = HASH_PATTERN.exec(hash);
  if (!match) return undefined;
  const tier = match[2];
  return tier.startsWith("week") ? `${tier}-take` : `week${match[1]}-${tier}-take`;
}

/** What the build hands the island. It travels as a plain JSON script tag
 *  rather than as island props: Astro HTML-escapes props, and every `"` in
 *  half a megabyte of manifest text becomes six bytes of `&quot;`. */
export interface CanvasPayload {
  bundle: CanvasBundle;
  /** The same manifests the gallery renders, for the recorded backend the
   *  desk runs its generations through. */
  weeks: ClientWeek[];
  assetPrefix: string;
}

function readPayload(): CanvasPayload | undefined {
  const element = document.querySelector<HTMLScriptElement>("[data-studio-canvas-payload]");
  if (!element?.textContent) return undefined;
  try {
    return JSON.parse(element.textContent) as CanvasPayload;
  } catch {
    return undefined;
  }
}

function StudioCanvasInner({ bundle, weeks, assetPrefix }: CanvasPayload) {
  const flow = useReactFlow();
  const reducedMotion = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);

  const [doc, setDocState] = useState<CanvasDoc>(bundle.doc);
  const [showSources, setShowSources] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [playingId, setPlayingId] = useState<string | undefined>(undefined);
  const [selection, setSelection] = useState<{ nodes: string[]; boards: string[] }>({ nodes: [], boards: [] });
  const [readOnly, setReadOnly] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);

  const docRef = useRef(doc);
  docRef.current = doc;

  const setDoc = useCallback((next: CanvasDoc) => {
    docRef.current = next;
    setDocState(next);
    writeDoc(next);
  }, []);

  // Between 641 and 899 the canvas is a thing to read, not to rearrange: pan,
  // zoom and select still work, nothing moves.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 899px)");
    const update = () => setReadOnly(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // What the visitor did last time, merged over what the build knows now.
  useEffect(() => {
    const merged = mergeStoredDoc(bundle.doc, readStoredDoc(), { assetPrefix });
    docRef.current = merged;
    setDocState(merged);
  }, [bundle.doc, assetPrefix]);

  const rfNodes = useMemo(() => toRfNodes(doc, bundle.meta, readOnly), [doc, bundle.meta, readOnly]);
  const rfEdges = useMemo(() => toRfEdges(doc, showSources), [doc, showSources]);
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState<StudioRfNode>(rfNodes);

  // React Flow owns node positions during a drag; the document owns them the
  // rest of the time. This is the handover in one direction, drag stop is the
  // other.
  useEffect(() => {
    setNodes((current) => {
      const selected = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return rfNodes.map((node) => (selected.has(node.id) ? { ...node, selected: true } : node));
    });
  }, [rfNodes, setNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<StudioRfNode>[]) => {
      // Delete goes through the engine, which knows recorded material is not
      // deletable and sends it home instead.
      const removals = changes.filter((change) => change.type === "remove");
      if (removals.length) {
        const ids = new Set(removals.map((change) => change.id));
        setDoc(
          deleteObjects(
            docRef.current,
            docRef.current.nodes.filter((node) => ids.has(node.id)).map((node) => node.id),
            docRef.current.boards.filter((board) => ids.has(board.id)).map((board) => board.id),
          ),
        );
        return;
      }
      onNodesChangeInternal(changes);
    },
    [onNodesChangeInternal, setDoc],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams<StudioRfNode>) => {
      const boards = selected.filter((node) => node.type === RF_TYPE.board).map((node) => node.id);
      const cards = selected.filter((node) => node.type !== RF_TYPE.board).map((node) => node.id);
      setSelection({ nodes: cards, boards });
    },
    [],
  );

  const tierIndex = useMemo(() => buildTierIndex(weeks), [weeks]);
  const desk = useDesk({ doc, meta: bundle.meta, weeks, tierIndex, setDoc, reducedMotion });

  const onNodeDragStop = useCallback(
    (_event: unknown, dragged: StudioRfNode, group: StudioRfNode[]) => {
      const current = docRef.current;

      if (dragged.type === RF_TYPE.board) {
        const moved = group.filter((node) => node.type === RF_TYPE.board);
        setDoc({
          ...current,
          boards: current.boards.map((board) => {
            const match = moved.find((node) => node.id === board.id);
            return match ? { ...board, x: match.position.x, y: match.position.y } : board;
          }),
        });
        return;
      }

      const cards = group.filter((node) => node.type !== RF_TYPE.board);
      const worlds = cards.map((card) => {
        const board = current.boards.find((candidate) => candidate.id === card.parentId);
        return {
          id: card.id,
          x: (board?.x ?? 0) + card.position.x,
          y: (board?.y ?? 0) + card.position.y,
          w: card.width ?? 0,
          h: card.height ?? 0,
        };
      });

      const primary = worlds.find((world) => world.id === dragged.id) ?? worlds[0];
      if (!primary) return;

      const target = boardUnder(current, primary);

      if (!target) {
        setDoc(createBoardFor(current, worlds.map((world) => world.id), { x: primary.x, y: primary.y }).doc);
        return;
      }

      if (target.id !== dragged.parentId) {
        // Reparent works off world position, so put the dragged cards where
        // the pointer left them first, then hand them to the new board.
        const staged = moveNodes(
          current,
          worlds.map((world) => {
            const board = current.boards.find((candidate) => candidate.id === current.nodes.find((n) => n.id === world.id)?.boardId);
            return { id: world.id, x: world.x - (board?.x ?? 0), y: world.y - (board?.y ?? 0) };
          }),
        );
        setDoc(reparentNodes(staged, worlds.map((world) => world.id), target.id));
        return;
      }

      setDoc(moveNodes(current, cards.map((card) => ({ id: card.id, x: card.position.x, y: card.position.y }))));
    },
    [setDoc],
  );

  const fitAll = useCallback(() => {
    void flow.fitView({ duration: reducedMotion ? 0 : 400, padding: 0.08 });
  }, [flow, reducedMotion]);

  const zoomHundred = useCallback(() => {
    void flow.zoomTo(1, { duration: reducedMotion ? 0 : 300 });
  }, [flow, reducedMotion]);

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = docRef.current.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      const rect = worldRect(docRef.current, node);
      void flow.setCenter(rect.x + rect.w / 2, rect.y + rect.h / 2, {
        zoom: 0.8,
        duration: reducedMotion ? 0 : 500,
      });
      setNodes((current) => current.map((candidate) => ({ ...candidate, selected: candidate.id === nodeId })));
    },
    [flow, reducedMotion, setNodes],
  );

  // Ten boards in a row is roughly 15,000 world units, so "Fit all" bottoms
  // out at the 10% floor and every card becomes a 32px stamp. That is the
  // right overview and the wrong first impression, so the canvas opens on the
  // first board at a size you can read, and Fit all is a control you reach
  // for rather than the landing state.
  const showFirstBoard = useCallback(() => {
    const board = [...docRef.current.boards].sort((a, b) => a.order - b.order)[0];
    if (!board) return;
    void flow.fitBounds(
      { x: board.x, y: board.y, width: board.w, height: board.h },
      { duration: reducedMotion ? 0 : 400, padding: 0.05 },
    );
  }, [flow, reducedMotion]);

  // The Dailies link a tier straight into the Studio; the canvas answers the
  // same anchor the JS-off gallery does.
  useEffect(() => {
    const apply = () => {
      const nodeId = nodeIdForHash(window.location.hash);
      if (nodeId) focusNode(nodeId);
      else showFirstBoard();
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [focusNode, showFirstBoard]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key === "!") {
        event.preventDefault();
        fitAll();
      }
      if (event.shiftKey && event.key === ")") {
        event.preventDefault();
        zoomHundred();
      }
    }

    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [fitAll, zoomHundred]);

  const resetCanvas = useCallback(() => {
    clearDoc();
    docRef.current = bundle.doc;
    setDocState(bundle.doc);
    setConfirmingReset(false);
    // The button that was pressed is replaced by the pair of confirm buttons
    // and back again; put focus where the reader left it.
    window.requestAnimationFrame(() => resetButton.current?.focus());
  }, [bundle.doc]);

  const rename = useCallback((boardId: string, title: string) => setDoc(renameBoard(docRef.current, boardId, title)), [setDoc]);

  const fitSelectedBoard = useCallback(() => {
    const boardId = selection.boards[0];
    if (!boardId) return;
    setDoc(relayoutBoard(docRef.current, boardId));
  }, [selection.boards, setDoc]);

  return (
    <CanvasActionsProvider value={{ addToDesk: desk.addReference }}>
      <TierIndexProvider value={tierIndex}>
      <BoardRenameProvider value={rename}>
        <PlaybackProvider value={{ playingId, setPlayingId }}>
          <div className="studio-canvas__layout">
            <div className="studio-canvas__stage" ref={stage}>
              <ReactFlow<StudioRfNode>
                nodes={nodes}
                edges={rfEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onSelectionChange={onSelectionChange}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                panOnScroll
                zoomOnScroll={false}
                zoomOnDoubleClick={false}
                selectionOnDrag={!readOnly}
                selectionMode={SelectionMode.Partial}
                panOnDrag={readOnly ? true : [1, 2]}
                panActivationKeyCode="Space"
                nodesConnectable={false}
                elementsSelectable
                nodesDraggable={!readOnly}
                deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
                multiSelectionKeyCode="Shift"
                nodeDragThreshold={2}
                proOptions={{ hideAttribution: true }}
                aria-label="Lineage canvas"
              >
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeClassName={(node) => `studio-minimap__node studio-minimap__node--${node.type}`} />
                <Panel position="top-left" className="studio-toolbar">
                  <div role="toolbar" aria-label="Canvas" className="studio-toolbar__group">
                    <button type="button" className="at-button at-button--outline" onClick={fitAll}>
                      Fit all
                    </button>
                    <button type="button" className="at-button at-button--outline" onClick={zoomHundred}>
                      100%
                    </button>
                    <button
                      type="button"
                      className="at-button at-button--outline"
                      aria-pressed={showSources}
                      onClick={() => setShowSources((current) => !current)}
                    >
                      Show sources
                    </button>
                    <button
                      type="button"
                      className="at-button at-button--outline"
                      onClick={fitSelectedBoard}
                      aria-disabled={selection.boards.length !== 1}
                    >
                      Fit board
                    </button>
                    {confirmingReset ? (
                      <>
                        <button type="button" className="at-button" onClick={resetCanvas}>
                          Reset, discarding my boards
                        </button>
                        <button
                          type="button"
                          className="at-button at-button--outline"
                          onClick={() => {
                            setConfirmingReset(false);
                            window.requestAnimationFrame(() => resetButton.current?.focus());
                          }}
                        >
                          Keep them
                        </button>
                      </>
                    ) : (
                      <button
                        ref={resetButton}
                        type="button"
                        className="at-button at-button--outline"
                        onClick={() => setConfirmingReset(true)}
                      >
                        Reset canvas
                      </button>
                    )}
                  </div>
                </Panel>
              </ReactFlow>
            </div>
            <Desk desk={desk} readOnly={readOnly} onFocusNode={focusNode} />
          </div>
        </PlaybackProvider>
      </BoardRenameProvider>
      </TierIndexProvider>
    </CanvasActionsProvider>
  );
}

export default function StudioCanvas() {
  const [payload, setPayload] = useState<CanvasPayload | undefined>(undefined);

  // The server and the first client render both produce the frame below, so
  // hydration matches; the canvas itself only exists once this has run. The
  // frame is also what client:visible observes — an island that renders
  // nothing on the server is never observed, and so never hydrates at all.
  useEffect(() => {
    const parsed = readPayload();
    if (!parsed) return;
    setPayload(parsed);
    // The section ships hidden with its space held open (site.css keys the
    // reservation on [hidden]); revealing it here releases the reservation,
    // so the page never jumps when the island lands.
    document.querySelector("[data-studio-canvas]")?.removeAttribute("hidden");
  }, []);

  if (!payload) {
    return (
      <div className="studio-canvas__layout">
        <div className="studio-canvas__stage" />
        <div className="studio-desk" />
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <StudioCanvasInner {...payload} />
    </ReactFlowProvider>
  );
}
