// The desk at phone size, where there is no canvas to take references off.
//
// It is the same rig: the same manifests off the same payload, the same
// resolver deciding whether a request names a recorded run, and the same
// recorded backend replaying it. What it is not is React — a canvas a phone
// will never show is not worth 122 kB of runtime, so this is a few kilobytes
// of plain DOM and the island stays behind a media query.

import { resolveDeskRequest, DESK_MESSAGES } from "../../lib/canvas/resolve";
import type { ClientTier, ClientWeek } from "../../lib/studio-client";
import { createRecordedBackend } from "./backends/recorded";

const PHONE = "(max-width: 640px)";

function recordedInputOf(tier: ClientTier): string {
  if (tier.input.promptText) return tier.input.promptText;
  if (typeof tier.input.value === "number") return String(tier.input.value);
  return "";
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const root = document.querySelector<HTMLElement>("[data-studio-form]");
const payloadEl = document.querySelector<HTMLScriptElement>("[data-studio-canvas-payload]");

// Above the phone breakpoint the canvas is the desk, so this never runs and
// never reveals its section — but it has to be able to run later. A window
// dragged down past 640 hides the canvas by media query, and before this was
// a function that could be called twice, what the reader got at 600px was a
// page with no canvas and a desk section still carrying its `hidden`
// attribute: an empty week selector nobody could see. Measured in Chrome.
function mountPhoneDesk(root: HTMLElement, payloadEl: HTMLScriptElement): void {
  const weekSelect = root.querySelector<HTMLSelectElement>("[data-form-week]");
  const tierSelect = root.querySelector<HTMLSelectElement>("[data-form-tier]");
  const kindLine = root.querySelector<HTMLElement>("[data-form-kind]");
  const promptBox = root.querySelector<HTMLTextAreaElement>("[data-form-prompt]");
  const generate = root.querySelector<HTMLButtonElement>("[data-form-generate]");
  const status = root.querySelector<HTMLElement>("[data-form-status]");
  const progress = root.querySelector<HTMLProgressElement>("[data-form-progress]");
  const result = root.querySelector<HTMLElement>("[data-form-result]");
  const video = root.querySelector<HTMLVideoElement>("[data-form-video]");
  const image = root.querySelector<HTMLImageElement>("[data-form-image]");
  const caption = root.querySelector<HTMLElement>("[data-form-caption]");
  const line = root.querySelector<HTMLElement>("[data-form-line]");
  const download = root.querySelector<HTMLButtonElement>("[data-form-download]");
  const restore = root.querySelector<HTMLButtonElement>("[data-form-restore]");
  const recordedBlock = root.querySelector<HTMLElement>("[data-form-recorded]");

  let weeks: ClientWeek[] = [];
  // Every take's citeable address is already in the payload the canvas uses;
  // reading it here rather than recomputing it keeps one definition of what a
  // takeId is, and costs nothing — the JSON is parsed either way.
  const takeIds = new Map<string, string>();
  try {
    const payload = JSON.parse(payloadEl.textContent ?? "{}") as {
      weeks?: ClientWeek[];
      bundle?: { doc?: { nodes?: { type?: string; tierId?: string; takeId?: string }[] } };
    };
    weeks = payload.weeks ?? [];
    for (const node of payload.bundle?.doc?.nodes ?? []) {
      if (node.type === "take" && node.tierId && node.takeId) takeIds.set(node.tierId, node.takeId);
    }
  } catch {
    weeks = [];
  }

  const essentials = [
    weekSelect,
    tierSelect,
    kindLine,
    promptBox,
    generate,
    status,
    progress,
    result,
    video,
    image,
    line,
    download,
    restore,
    recordedBlock,
  ];

  if (weeks.length > 0 && essentials.every(Boolean)) {
    root.hidden = false;

    const backend = createRecordedBackend(weeks);
    let currentWeek = weeks[0];
    let currentTier = currentWeek.tiers[0];
    let running = false;
    let lastFile: string | undefined;

    const tierRefs = new Map<string, { week: number; tierId: string; recordedInput: string }>();
    for (const week of weeks) {
      for (const tier of week.tiers) {
        tierRefs.set(tier.id, { week: week.week, tierId: tier.id, recordedInput: normalise(recordedInputOf(tier)) });
      }
    }

    function renderWeeks(): void {
      weekSelect!.replaceChildren(
        ...weeks.map((week) => {
          const option = document.createElement("option");
          option.value = String(week.week);
          option.textContent = `Week ${week.week} — ${week.instrument}`;
          option.selected = week.week === currentWeek.week;
          return option;
        }),
      );
    }

    function renderTiers(): void {
      tierSelect!.replaceChildren(
        ...currentWeek.tiers.map((tier) => {
          const option = document.createElement("option");
          option.value = tier.id;
          option.textContent = `${tier.tier} — ${tier.label}`;
          option.selected = tier.id === currentTier.id;
          return option;
        }),
      );
    }

    function renderInput(): void {
      kindLine!.textContent = `${currentWeek.model} · ${currentWeek.mode} · ${currentWeek.resolution}`;
      promptBox!.value = recordedInputOf(currentTier);
    }

    function resetResult(): void {
      status!.textContent = "";
      progress!.value = 0;
      result!.hidden = true;
      video!.hidden = true;
      video!.removeAttribute("src");
      image!.hidden = true;
      image!.removeAttribute("src");
      line!.textContent = "";
      download!.hidden = true;
      restore!.hidden = true;
      recordedBlock!.hidden = true;
      recordedBlock!.textContent = "";
      lastFile = undefined;
    }

    function selectWeek(weekNumber: number): void {
      const week = weeks.find((candidate) => candidate.week === weekNumber);
      if (!week) return;
      currentWeek = week;
      currentTier = week.tiers[0];
      renderTiers();
      renderInput();
      resetResult();
    }

    function selectTier(tierId: string): void {
      const tier = currentWeek.tiers.find((candidate) => candidate.id === tierId);
      if (!tier) return;
      currentTier = tier;
      renderInput();
      resetResult();
    }

    // `disabled` would blur the button the moment it was pressed, so the
    // running state is aria-only and this flag is what refuses a second press.
    function setBusy(busy: boolean): void {
      generate!.setAttribute("aria-disabled", String(busy));
      generate!.setAttribute("aria-busy", String(busy));
    }

    async function run(): Promise<void> {
      if (running) return;

      const resolution = resolveDeskRequest({
        references: [currentTier.id],
        prompt: promptBox!.value,
        tierOf: (id) => tierRefs.get(id),
      });

      if (resolution.kind !== "resolved") {
        status!.textContent = DESK_MESSAGES[resolution.kind];
        const differs = resolution.kind === "prompt-differs";
        restore!.hidden = !differs;
        // The nearest recorded input is the whole point of that answer, so it
        // is shown rather than only offered.
        recordedBlock!.hidden = !differs;
        recordedBlock!.textContent = differs ? resolution.recordedInput : "";
        result!.hidden = true;
        // The previous run's plan line would otherwise sit under a refusal,
        // reading as though this request had produced it.
        line!.textContent = "";
        download!.hidden = true;
        progress!.value = 0;
        return;
      }

      running = true;
      setBusy(true);
      restore!.hidden = true;
      status!.textContent = "Queued";
      progress!.value = 0;

      try {
        const recorded = await backend.run({ week: resolution.week, tierId: resolution.tierId }, (step) => {
          progress!.value = step.percent;
          status!.textContent =
            step.phase === "queued" ? "Queued" : step.phase === "loading" ? "Loading recorded result" : "Done";
        });

        if (recorded.outputKind === "video") {
          video!.src = recorded.file;
          if (recorded.poster) video!.poster = recorded.poster;
          video!.hidden = false;
          image!.hidden = true;
        } else {
          image!.src = recorded.file;
          image!.alt = `Recorded result for ${recorded.label}`;
          image!.hidden = false;
          video!.hidden = true;
        }

        caption!.textContent = `Recorded — ${recorded.tier} — ${recorded.label}`;
        result!.hidden = false;
        lastFile = recorded.file;
        const address = takeIds.get(recorded.tierId);
        line!.textContent = [address, currentWeek.model, currentWeek.mode, currentWeek.resolution]
          .filter(Boolean)
          .join(" · ");
        line!.textContent = `Replayed ${line!.textContent}`;
        download!.hidden = false;
      } catch {
        status!.textContent = "No recorded result for this selection.";
      } finally {
        running = false;
        setBusy(false);
      }
    }

    function downloadLog(): void {
      if (!lastFile) return;
      const log = {
        generatedAt: new Date().toISOString(),
        week: currentWeek.week,
        instrument: currentWeek.instrument,
        model: currentWeek.model,
        mode: currentWeek.mode,
        resolution: currentWeek.resolution,
        tier: currentTier.tier,
        label: currentTier.label,
        outputKind: currentTier.output.kind,
        file: lastFile,
        note: currentTier.note,
        source: "recorded",
      };
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `studio-week-${currentWeek.week}-${currentTier.tier}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }

    weekSelect!.addEventListener("change", () => selectWeek(Number(weekSelect!.value)));
    tierSelect!.addEventListener("change", () => selectTier(tierSelect!.value));
    generate!.addEventListener("click", () => void run());
    download!.addEventListener("click", downloadLog);
    restore!.addEventListener("click", () => {
      promptBox!.value = recordedInputOf(currentTier);
      status!.textContent = "";
      restore!.hidden = true;
      recordedBlock!.hidden = true;
      recordedBlock!.textContent = "";
      promptBox!.focus();
    });

    renderWeeks();
    renderTiers();
    renderInput();
    resetResult();
    setBusy(false);
  }
}

// Once, and on whichever side of the breakpoint the reader ends up on.
let mounted = false;
function mountOnce(): void {
  if (mounted || !root || !payloadEl || !window.matchMedia(PHONE).matches) return;
  mounted = true;
  mountPhoneDesk(root, payloadEl);
}

mountOnce();
window.matchMedia(PHONE).addEventListener("change", mountOnce);
