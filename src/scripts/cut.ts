import type { ClientCutClip, ClientCutLibrary } from "../lib/studio-client";

// The two ids this library's specific "Hook first" move depends on. This
// isn't a generic reorder rule — it's the one edit Week 9 argues for, on
// this one library, so the ids are the real ones rather than a parameter.
const ESTABLISHING_ID = "cut-establishing";
const HOOK_ID = "cut-hook";

const root = document.querySelector<HTMLElement>("[data-cut-editor]");
const payloadEl = document.querySelector<HTMLScriptElement>("[data-cut-payload]");

if (root && payloadEl) {
  const sequenceList = root.querySelector<HTMLOListElement>("[data-cut-sequence]");
  const addSelect = root.querySelector<HTMLSelectElement>("[data-cut-add-select]");
  const addButton = root.querySelector<HTMLButtonElement>("[data-cut-add]");
  const hookFirstButton = root.querySelector<HTMLButtonElement>("[data-cut-hook-first]");
  const resetButton = root.querySelector<HTMLButtonElement>("[data-cut-reset]");
  const subtitleTabs = root.querySelector<HTMLElement>("[data-cut-subtitle-tabs]");
  const video = root.querySelector<HTMLVideoElement>("[data-cut-video]");
  const cornerLabelEl = root.querySelector<HTMLElement>("[data-cut-corner]");
  const subtitleLineEl = root.querySelector<HTMLElement>("[data-cut-subtitle]");
  const downloadButton = root.querySelector<HTMLButtonElement>("[data-cut-download]");

  const essentials = [
    sequenceList,
    addSelect,
    addButton,
    hookFirstButton,
    resetButton,
    subtitleTabs,
    video,
    cornerLabelEl,
    subtitleLineEl,
    downloadButton,
  ];

  let library: ClientCutLibrary | undefined;
  try {
    library = JSON.parse(payloadEl.textContent ?? "null") ?? undefined;
  } catch {
    library = undefined;
  }

  if (essentials.every(Boolean) && library && library.cuts.length > 0) {
    root.hidden = false;

    const originalOrder = library.cuts.map((cut) => cut.id);
    let sequence: string[] = [...originalOrder];
    let subtitleSet: string | undefined = library.subtitleSets[0]?.set;

    function clipFor(id: string): ClientCutClip | undefined {
      return library!.cuts.find((cut) => cut.id === id);
    }

    function lineFor(setName: string | undefined, key: string): string | undefined {
      const set = library!.subtitleSets.find((candidate) => candidate.set === setName);
      return set?.lines.find((line) => line.cut === key)?.text;
    }

    function renderSubtitleTabs(): void {
      subtitleTabs!.replaceChildren(
        ...library!.subtitleSets.map((set) => {
          const group = document.createDocumentFragment();

          const input = document.createElement("input");
          input.type = "radio";
          input.name = "cut-subtitle-set";
          input.id = `cut-subtitle-${set.set}`;
          input.value = set.set;
          input.className = "cut-editor__subtitle-radio";
          input.checked = set.set === subtitleSet;
          input.addEventListener("change", () => {
            subtitleSet = set.set;
            renderPlayer();
          });

          const label = document.createElement("label");
          label.setAttribute("for", input.id);
          label.className = "cut-editor__subtitle-tab";
          label.textContent = set.set;

          group.append(input, label);
          return group;
        }),
      );
    }

    // Every reorder replaces the whole list, which destroys the button that
    // was just pressed — and a destroyed button takes the keyboard user's
    // place on the page with it, so each press sent them back to the top to
    // Tab down again. Focus follows the clip rather than the position: press
    // Down twice and the same clip moves twice, which is what pressing Down
    // twice ought to mean. Falls back outward when the exact control is gone
    // (Up disables itself on the top item; Remove takes the whole item away)
    // rather than to nothing.
    function focusAfterRender(clipId: string | undefined, control: string): void {
      const pick = (selector: string) => sequenceList!.querySelector<HTMLButtonElement>(selector);
      const target =
        (clipId && pick(`button[data-clip="${clipId}"][data-control="${control}"]:not([disabled])`)) ||
        (clipId && pick(`button[data-clip="${clipId}"]:not([disabled])`)) ||
        pick(`button[data-control="${control}"]:not([disabled])`) ||
        pick("button:not([disabled])") ||
        (addButton!.disabled ? hookFirstButton! : addButton!);
      target?.focus();
    }

    function moveItem(from: number, to: number, keepFocus?: { clip: string; control: string }): void {
      if (to < 0 || to >= sequence.length || from === to) return;
      const next = [...sequence];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      sequence = next;
      renderSequence();
      renderPlayer();
      if (keepFocus) focusAfterRender(keepFocus.clip, keepFocus.control);
    }

    function removeItem(index: number, keepFocus?: { clip: string | undefined; control: string }): void {
      sequence = sequence.filter((_, i) => i !== index);
      renderSequence();
      renderPlayer();
      if (keepFocus) focusAfterRender(keepFocus.clip, keepFocus.control);
    }

    function renderSequence(): void {
      sequenceList!.replaceChildren(
        ...sequence.map((id, index) => {
          const clip = clipFor(id);

          const item = document.createElement("li");
          item.className = "cut-editor__item";
          item.draggable = true;
          item.dataset.id = id;

          const label = document.createElement("span");
          label.className = "cut-editor__item-label";
          label.textContent = clip ? `${clip.shot} — ${clip.timecode}` : id;
          item.append(label);

          const controls = document.createElement("div");
          controls.className = "cut-editor__item-controls";

          const upButton = document.createElement("button");
          upButton.type = "button";
          upButton.className = "at-button at-button--outline";
          upButton.textContent = "Up";
          upButton.disabled = index === 0;
          upButton.dataset.clip = id;
          upButton.dataset.control = "up";
          upButton.addEventListener("click", () => moveItem(index, index - 1, { clip: id, control: "up" }));

          const downButton = document.createElement("button");
          downButton.type = "button";
          downButton.className = "at-button at-button--outline";
          downButton.textContent = "Down";
          downButton.disabled = index === sequence.length - 1;
          downButton.dataset.clip = id;
          downButton.dataset.control = "down";
          downButton.addEventListener("click", () => moveItem(index, index + 1, { clip: id, control: "down" }));

          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.className = "at-button at-button--outline";
          removeButton.textContent = "Remove";
          removeButton.dataset.clip = id;
          removeButton.dataset.control = "remove";
          // The clip this button belongs to is about to stop existing, so aim
          // focus at the one that takes its place in the list.
          removeButton.addEventListener("click", () =>
            removeItem(index, { clip: sequence[index + 1] ?? sequence[index - 1], control: "remove" }),
          );

          controls.append(upButton, downButton, removeButton);
          item.append(controls);

          // Drag reordering is an extra affordance on top of the buttons
          // above, which already do the same job with no drag support at all.
          item.addEventListener("dragstart", (event) => {
            event.dataTransfer?.setData("text/plain", String(index));
          });
          item.addEventListener("dragover", (event) => event.preventDefault());
          item.addEventListener("drop", (event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer?.getData("text/plain"));
            if (Number.isFinite(from)) moveItem(from, index);
          });

          return item;
        }),
      );

      addSelect!.replaceChildren(
        ...library!.cuts
          .filter((cut) => !sequence.includes(cut.id))
          .map((cut) => {
            const option = document.createElement("option");
            option.value = cut.id;
            option.textContent = `${cut.shot} — ${cut.timecode}`;
            return option;
          }),
      );
      const hasRemoved = addSelect!.options.length > 0;
      addSelect!.disabled = !hasRemoved;
      addButton!.disabled = !hasRemoved;
    }

    function renderPlayer(): void {
      const activeClip = sequence[0] ? clipFor(sequence[0]) : undefined;

      if (!activeClip) {
        video!.removeAttribute("src");
        video!.removeAttribute("poster");
        cornerLabelEl!.hidden = true;
        subtitleLineEl!.textContent = "";
        downloadButton!.disabled = true;
        return;
      }

      video!.src = activeClip.file;
      video!.poster = activeClip.poster;

      const showCorner = activeClip.key === library!.cornerLabel.onlyOn;
      cornerLabelEl!.hidden = !showCorner;
      cornerLabelEl!.textContent = library!.cornerLabel.text;

      subtitleLineEl!.textContent = lineFor(subtitleSet, activeClip.key) ?? "";
      downloadButton!.disabled = false;
    }

    addButton!.addEventListener("click", () => {
      const id = addSelect!.value;
      if (!id) return;
      sequence = [...sequence, id];
      renderSequence();
      renderPlayer();
      // Adding the last clip back disables Add itself, which would blur it the
      // same way; hand focus to the clip that just arrived instead.
      if (addButton!.disabled) focusAfterRender(id, "up");
    });

    hookFirstButton!.addEventListener("click", () => {
      const withoutEstablishing = sequence.filter((id) => id !== ESTABLISHING_ID);
      const hookIndex = withoutEstablishing.indexOf(HOOK_ID);
      if (hookIndex <= 0) {
        sequence = withoutEstablishing;
      } else {
        const next = [...withoutEstablishing];
        const [hook] = next.splice(hookIndex, 1);
        next.unshift(hook);
        sequence = next;
      }
      renderSequence();
      renderPlayer();
    });

    resetButton!.addEventListener("click", () => {
      sequence = [...originalOrder];
      renderSequence();
      renderPlayer();
    });

    downloadButton!.addEventListener("click", () => {
      const log = {
        generatedAt: new Date().toISOString(),
        subtitleSet,
        sequence: sequence.map((id) => {
          const clip = clipFor(id);
          return { id, shot: clip?.shot, timecode: clip?.timecode };
        }),
        source: "recorded",
      };
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cut-production-log.json";
      link.click();
      URL.revokeObjectURL(url);
    });

    renderSubtitleTabs();
    renderSequence();
    renderPlayer();
  }
}
