// The Studio's canvas island. Everything it draws comes from the document the
// build handed it; everything it changes goes back through the pure engine and
// session functions, so what the browser does and what the tests assert are
// the same code.
//
// v2: the canvas opens empty. The built document is still the whole rig, but
// it is a template now — the visitor asks the desk for a run and the board it
// belongs to arrives with it. "Load the whole rig" is the moment the template
// lands whole; "Clear canvas" is the way back to nothing.

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
import {
  addRigBoard,
  derivedEdges,
  emptyCanvasDoc,
  EMPTY_HINT,
  hashTarget,
  loadWholeRig,
  restoreSession,
} from "../../lib/canvas/session";
import { clearDoc, readStoredDoc, writeDoc } from "../../lib/canvas/storage";
import { planLine, productionLine } from "../../lib/canvas/lines";
import type { CanvasBundle, CanvasDoc, NodeMeta } from "../../lib/canvas/types";
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
import { Desk, useDesk, type DeskState } from "./Desk";

const NODE_TYPES: NodeTypes = {
  [RF_TYPE.board]: BoardNode,
  [RF_TYPE.take]: TakeCard,
  [RF_TYPE.input]: InputCard,
  [RF_TYPE.placeholder]: PlaceholderCard,
};

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

  const [doc, setDocState] = useState<CanvasDoc>(emptyCanvasDoc);
  const [showSources, setShowSources] = useState(true);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [playingId, setPlayingId] = useState<string | undefined>(undefined);
  const [selection, setSelection] = useState<{ nodes: string[]; boards: string[] }>({ nodes: [], boards: [] });
  const [readOnly, setReadOnly] = useState(false);
  const [progressMeta, setProgressMeta] = useState<Record<string, NodeMeta>>({});
  const [fitPending, setFitPending] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const desk = useRef<HTMLDivElement>(null);

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

  // What the visitor had last time. Nothing stored is an empty canvas, which
  // is also what a first visit gets.
  useEffect(() => {
    const restored = restoreSession(bundle.doc, readStoredDoc(), { assetPrefix });
    docRef.current = restored;
    setDocState(restored);
  }, [bundle.doc, assetPrefix]);

  const tierIndex = useMemo(() => buildTierIndex(weeks), [weeks]);

  // A generation made from references gets a card of its own, and that card
  // needs the same furniture a recorded one has — the address, the production
  // line, the plan line, where it is taught. All of it is derivable from the
  // tier it replayed, so it is derived here rather than written into
  // localStorage: a reloaded canvas rebuilds it.
  const effectiveMeta = useMemo(() => {
    const derived: Record<string, NodeMeta> = {};
    for (const node of doc.nodes) {
      if (node.type !== "take" || node.origin.kind !== "desk") continue;
      const entry = tierIndex.get(node.tierId);
      if (!entry) continue;
      const recorded = bundle.meta[`${node.tierId}-take`] ?? {};
      derived[node.id] = {
        week: entry.week.week,
        tier: entry.tier.tier,
        model: entry.week.model,
        mode: entry.week.mode,
        resolution: entry.week.resolution,
        note: entry.tier.note,
        takeId: node.takeId,
        productionLine: productionLine({
          takeId: node.takeId,
          model: entry.week.model,
          mode: entry.week.mode,
          resolution: entry.week.resolution,
          tier: entry.tier.tier,
          label: entry.tier.label,
          file: entry.tier.output.file,
        }),
        planLine: planLine(node.takeId, entry.week.model, entry.week.mode, entry.week.resolution),
        openHref: recorded.openHref,
        openLabel: recorded.openLabel,
      };
    }
    return { ...bundle.meta, ...derived, ...progressMeta };
  }, [doc.nodes, bundle.meta, tierIndex, progressMeta]);

  const rfNodes = useMemo(() => toRfNodes(doc, effectiveMeta, readOnly), [doc, effectiveMeta, readOnly]);
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
      // deletable and sends it home instead. An edge whose far end went with
      // it stops being drawn, which is the same rule the canvas grows by.
      const removals = changes.filter((change) => change.type === "remove");
      if (removals.length) {
        const ids = new Set(removals.map((change) => change.id));
        const next = deleteObjects(
          docRef.current,
          docRef.current.nodes.filter((node) => ids.has(node.id)).map((node) => node.id),
          docRef.current.boards.filter((board) => ids.has(board.id)).map((board) => board.id),
        );
        setDoc({ ...next, edges: derivedEdges(bundle.doc, next) });
        return;
      }
      onNodesChangeInternal(changes);
    },
    [onNodesChangeInternal, setDoc, bundle.doc],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams<StudioRfNode>) => {
      const boards = selected.filter((node) => node.type === RF_TYPE.board).map((node) => node.id);
      const cards = selected.filter((node) => node.type !== RF_TYPE.board).map((node) => node.id);
      setSelection({ nodes: cards, boards });
    },
    [],
  );

  const deskRef = useRef<DeskState | undefined>(undefined);
  // Refs rather than dependencies: the stage's keydown listener is registered
  // once, and must not be torn down and rebuilt on every document change.
  const cardOrderRef = useRef<string[]>([]);
  const cursorRef = useRef<string | undefined>(undefined);
  const focusCardRef = useRef<((nodeId: string) => void) | undefined>(undefined);

  const setProgress = useCallback((nodeId: string, progress: NodeMeta | undefined) => {
    setProgressMeta((current) => {
      if (!progress) {
        const { [nodeId]: _gone, ...rest } = current;
        return rest;
      }
      return { ...current, [nodeId]: progress };
    });
  }, []);

  const deskState = useDesk({
    getDoc: () => docRef.current,
    setDoc,
    built: bundle.doc,
    weeks,
    meta: effectiveMeta,
    tierIndex,
    setProgress,
  });
  deskRef.current = deskState;

  const onNodeDragStop = useCallback(
    (event: MouseEvent | TouchEvent, dragged: StudioRfNode, group: StudioRfNode[]) => {
      const current = docRef.current;

      // Let go of a card over the desk and it becomes a reference rather than
      // moving: the third way in, alongside Add to desk and Enter. React Flow
      // has already moved the card on screen by now, so the nodes are pushed
      // back from the document, which never changed.
      const pointer = "clientX" in event ? { x: event.clientX, y: event.clientY } : undefined;
      const deskRect = desk.current?.getBoundingClientRect();
      if (
        pointer &&
        deskRect &&
        pointer.x >= deskRect.left &&
        pointer.x <= deskRect.right &&
        pointer.y >= deskRect.top &&
        pointer.y <= deskRect.bottom
      ) {
        for (const node of group) {
          if (node.type !== RF_TYPE.board) deskRef.current?.addReference(node.id);
        }
        setNodes(rfNodes);
        return;
      }

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
    [setDoc, rfNodes, setNodes],
  );

  // Reading order for the arrow keys: board by board, and within a board the
  // order layoutBoard placed them in — which is tier by tier, input then take.
  const cardOrder = useMemo(() => {
    const boardOrder = new Map(doc.boards.map((board, index) => [board.id, board.order ?? index]));
    return doc.nodes
      .map((node, index) => ({ id: node.id, board: boardOrder.get(node.boardId) ?? 0, index }))
      .sort((a, b) => a.board - b.board || a.index - b.index)
      .map((entry) => entry.id);
  }, [doc]);

  const fitAll = useCallback(() => {
    void flow.fitView({ duration: reducedMotion ? 0 : 400, padding: 0.08 });
  }, [flow, reducedMotion]);

  const zoomHundred = useCallback(() => {
    void flow.zoomTo(1, { duration: reducedMotion ? 0 : 300 });
  }, [flow, reducedMotion]);

  // React Flow fits what it has already been given, and a document set this
  // tick reaches it on the next one. Fitting is therefore asked for, not
  // called, and happens once the new nodes are on screen.
  useEffect(() => {
    if (!fitPending) return;
    const frame = window.requestAnimationFrame(() => {
      setFitPending(false);
      fitAll();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitPending, nodes, fitAll]);

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

  const loadRig = useCallback(() => {
    setDoc(loadWholeRig(docRef.current, bundle.doc));
    setFitPending(true);
  }, [setDoc, bundle.doc]);

  const clearCanvas = useCallback(() => {
    const empty = emptyCanvasDoc();
    docRef.current = empty;
    setDocState(empty);
    clearDoc();
    setConfirmingClear(false);
    // The button that was pressed is replaced by the pair of confirm buttons
    // and back again; put focus where the reader left it.
    window.requestAnimationFrame(() => clearButton.current?.focus());
  }, []);

  // A week page's "Run it in the Studio" link is `/studio/#week-05:t3`. It
  // opens that week's board — one board, not the whole rig — selects the tier
  // it names and preselects the desk on it, and adds to whatever the visitor
  // already had rather than replacing it.
  useEffect(() => {
    const apply = () => {
      const target = hashTarget(window.location.hash, bundle.doc);
      if (!target) return;
      setDoc(addRigBoard(docRef.current, bundle.doc, target.boardId));
      deskRef.current?.selectWeek(target.week);
      deskRef.current?.selectTier(target.tierId);
      window.requestAnimationFrame(() => focusNode(target.nodeId));
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [focusNode, setDoc, bundle.doc]);

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
      // The stage itself is the tab stop; the arrow keys walk the cards
      // inside it. React Flow's own per-node focus was 214 tab stops before
      // the desk — reachable, but nobody is pressing Tab that many times.
      if (event.target !== element) return;

      const cards = cardOrderRef.current;
      const current = cursorRef.current ? cards.indexOf(cursorRef.current) : -1;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const next = cards[Math.min(cards.length - 1, current + 1)];
        if (next) focusCardRef.current?.(next);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const previous = cards[Math.max(0, current <= 0 ? 0 : current - 1)];
        if (previous) focusCardRef.current?.(previous);
      }
      // Enter on the card the arrows landed on adds it to the desk.
      if (event.key === "Enter" && cursorRef.current) {
        event.preventDefault();
        deskRef.current?.addReference(cursorRef.current);
      }
      if (event.key === "Escape") {
        cursorRef.current = undefined;
        setNodes((all) => all.map((node) => ({ ...node, selected: false })));
      }
    }

    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [fitAll, zoomHundred, setNodes]);

  cardOrderRef.current = cardOrder;
  focusCardRef.current = (nodeId: string) => {
    cursorRef.current = nodeId;
    focusNode(nodeId);
  };

  const rename = useCallback((boardId: string, title: string) => setDoc(renameBoard(docRef.current, boardId, title)), [setDoc]);

  const fitSelectedBoard = useCallback(() => {
    const boardId = selection.boards[0];
    if (!boardId) return;
    setDoc(relayoutBoard(docRef.current, boardId));
  }, [selection.boards, setDoc]);

  const empty = doc.boards.length === 0;

  return (
    <CanvasActionsProvider value={{ addToDesk: deskState.addReference }}>
      <TierIndexProvider value={tierIndex}>
      <BoardRenameProvider value={rename}>
        <PlaybackProvider value={{ playingId, setPlayingId }}>
          <div className="studio-canvas__layout">
            <div
              className="studio-canvas__stage"
              ref={stage}
              tabIndex={0}
              role="group"
              aria-label="Lineage canvas"
              aria-describedby="studio-canvas-keys"
            >
              <p className="studio-canvas__keys" id="studio-canvas-keys">
                Arrow keys move between cards, Enter adds the current card to the desk, Escape clears the
                selection. Shift+1 fits every board, Shift+0 returns to 100%.
              </p>
              {empty ? <p className="studio-canvas__empty">{EMPTY_HINT}</p> : null}
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
                nodesFocusable={false}
                edgesFocusable={false}
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
                    <button type="button" className="at-button at-button--outline" onClick={loadRig}>
                      Load the whole rig
                    </button>
                    {confirmingClear ? (
                      <>
                        <button ref={confirmButton} type="button" className="at-button" onClick={clearCanvas}>
                          Clear, discarding every board
                        </button>
                        <button
                          type="button"
                          className="at-button at-button--outline"
                          onClick={() => {
                            setConfirmingClear(false);
                            window.requestAnimationFrame(() => clearButton.current?.focus());
                          }}
                        >
                          Keep them
                        </button>
                      </>
                    ) : (
                      <button
                        ref={clearButton}
                        type="button"
                        className="at-button at-button--outline"
                        onClick={() => {
                          setConfirmingClear(true);
                          // The two confirm buttons replace this one, so focus
                          // would otherwise fall to <body> the moment it is
                          // pressed. Put it on the choice that now matters.
                          window.requestAnimationFrame(() => confirmButton.current?.focus());
                        }}
                      >
                        Clear canvas
                      </button>
                    )}
                  </div>
                </Panel>
              </ReactFlow>
            </div>
            <div className="studio-desk__column" ref={desk}>
              <Desk desk={deskState} readOnly={readOnly} onFocusNode={focusNode} startOpen={!readOnly} />
            </div>
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
    // The stage ships hidden with its space held open (studio-canvas.css keys
    // the reservation on [hidden]); revealing it here releases the
    // reservation, so the page never jumps when the island lands. The static
    // gallery is the no-JS body and goes the other way: the status bar's
    // "Show as a list" is what brings it back.
    document.querySelector("[data-studio-canvas]")?.removeAttribute("hidden");
    document.querySelector("[data-studio-fallback]")?.setAttribute("hidden", "");
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
