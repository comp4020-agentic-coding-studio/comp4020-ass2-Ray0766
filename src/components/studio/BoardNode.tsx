// A board is a container with a title bar. Dragging the bar moves the board
// and everything on it (React Flow moves children with their parent); double
// click or F2 renames a board the visitor made, and leaves a recorded board's
// manifest title alone.

import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import type { RfBoardNode } from "../../lib/canvas/rf";
import { useBoardRename, useCanvasActions } from "./canvas-context";

export function BoardNode({ id, data, selected }: NodeProps<RfBoardNode>) {
  const rename = useBoardRename();
  const actions = useCanvasActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  const input = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLButtonElement>(null);
  const canRename = data.kind === "user";

  useEffect(() => setDraft(data.title), [data.title]);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  function commit(): void {
    setEditing(false);
    rename(id, draft);
    // The title button is what was pressed to get here; a rename that ends
    // with focus on <body> loses the keyboard's place on the canvas.
    window.requestAnimationFrame(() => title.current?.focus());
  }

  function cancel(): void {
    setDraft(data.title);
    setEditing(false);
    window.requestAnimationFrame(() => title.current?.focus());
  }

  return (
    <div className="studio-board__frame" data-selected={selected ? "true" : undefined}>
      <div className="studio-board__bar">
        {editing ? (
          <input
            ref={input}
            className="studio-board__rename"
            value={draft}
            aria-label={`Rename ${data.title}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") cancel();
              event.stopPropagation();
            }}
          />
        ) : canRename ? (
          <button
            ref={title}
            type="button"
            className="studio-board__title"
            aria-describedby={`${id}-rename-hint`}
            onDoubleClick={() => setEditing(true)}
            onKeyDown={(event) => {
              if (event.key === "F2" || event.key === "Enter") {
                event.preventDefault();
                setEditing(true);
              }
            }}
          >
            {data.title}
          </button>
        ) : (
          // A recorded board keeps its manifest title, so there is nothing to
          // press here. As a button it was ten tab stops that did nothing.
          <span className="studio-board__title">{data.title}</span>
        )}
        {data.week ? <span className="studio-board__week">Week {data.week}</span> : null}
        {/* The per-week ladder comparison, where the ladder actually is. The
            lecture pages keep their own; this one is the takes themselves. */}
        {data.takes >= 2 ? (
          <button
            type="button"
            className="studio-board__compare at-button at-button--outline"
            onClick={() => actions.compareBoard(id)}
          >
            Compare this board
          </button>
        ) : null}
      </div>
      {canRename ? (
        <p className="studio-board__hint" id={`${id}-rename-hint`}>
          Press Enter or F2 to rename this board.
        </p>
      ) : null}
    </div>
  );
}
