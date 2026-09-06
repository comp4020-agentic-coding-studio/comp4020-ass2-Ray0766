import type { ClientTier, ClientWeek } from "../../lib/studio-client";
import { createRecordedBackend } from "./backends/recorded";
import type { RunResult } from "./backends/types";

interface HistoryEntry {
  week: number;
  tierId: string;
  at: string;
}

const HISTORY_KEY = "studio:history";
const HISTORY_MAX = 6;
const HASH_PATTERN = /^#week-(\d{2}):(.+)$/;

function hashFor(week: number, tierId: string): string {
  return `#week-${String(week).padStart(2, "0")}:${tierId}`;
}

function parseHash(hash: string): { week: number; tierId: string } | undefined {
  const match = HASH_PATTERN.exec(hash);
  if (!match) return undefined;
  const week = Number(match[1]);
  if (!Number.isFinite(week)) return undefined;
  return { week, tierId: match[2] };
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Private-browsing/blocked storage: the history strip just stays empty.
  }
}

function pushHistory(week: number, tierId: string): HistoryEntry[] {
  const existing = readHistory().filter((entry) => !(entry.week === week && entry.tierId === tierId));
  existing.unshift({ week, tierId, at: new Date().toISOString() });
  const trimmed = existing.slice(0, HISTORY_MAX);
  writeHistory(trimmed);
  return trimmed;
}

function findTier(week: ClientWeek | undefined, tierId: string): ClientTier | undefined {
  return week?.tiers.find((tier) => tier.id === tierId || tier.tier === tierId);
}

function describeInputKind(kind: string): string {
  const labels: Record<string, string> = {
    seed: "Seed",
    prompt: "Prompt",
    image: "Image",
    "image pair": "Image pair",
    "reference set": "Reference set",
    graph: "Workflow graph",
    upscale: "Upscale graph",
    script: "Script",
  };
  return labels[kind] ?? kind;
}

const root = document.querySelector<HTMLElement>("[data-studio-console]");
const payloadEl = document.querySelector<HTMLScriptElement>("[data-studio-payload]");

if (root && payloadEl) {
  const weekList = root.querySelector<HTMLElement>("[data-week-list]");
  const weekSelect = root.querySelector<HTMLSelectElement>("[data-week-select]");
  const tierList = root.querySelector<HTMLElement>("[data-tier-list]");
  const tierSelect = root.querySelector<HTMLSelectElement>("[data-tier-select]");
  const inputPanel = root.querySelector<HTMLElement>("[data-input-panel]");
  const generateButton = root.querySelector<HTMLButtonElement>("[data-generate]");
  const runStatus = root.querySelector<HTMLElement>("[data-run-status]");
  const runProgress = root.querySelector<HTMLProgressElement>("[data-run-progress]");
  const resultFrame = root.querySelector<HTMLElement>("[data-result]");
  const resultVideo = root.querySelector<HTMLVideoElement>("[data-result-video]");
  const resultImage = root.querySelector<HTMLImageElement>("[data-result-image]");
  const resultCaption = root.querySelector<HTMLElement>("[data-result-caption]");
  const resolvedList = root.querySelector<HTMLDListElement>("[data-resolved]");
  const downloadButton = root.querySelector<HTMLButtonElement>("[data-download]");
  const historyStrip = root.querySelector<HTMLElement>("[data-history]");
  const compareToggle = root.querySelector<HTMLButtonElement>("[data-compare-toggle]");
  const compareGrid = root.querySelector<HTMLElement>("[data-compare-grid]");

  const essentials = [
    weekList, weekSelect, tierList, tierSelect, inputPanel, generateButton, runStatus, runProgress,
    resultFrame, resultVideo, resultImage, resolvedList, downloadButton, historyStrip, compareToggle,
    compareGrid,
  ];

  let weeks: ClientWeek[] = [];
  try {
    weeks = JSON.parse(payloadEl.textContent ?? "[]");
  } catch {
    weeks = [];
  }

  if (essentials.every(Boolean) && weeks.length > 0) {
    root.hidden = false;

    const backend = createRecordedBackend(weeks);

    const initial = parseHash(location.hash);
    let currentWeek: ClientWeek =
      (initial && weeks.find((week) => week.week === initial.week)) ?? weeks[0];
    let currentTier: ClientTier =
      (initial && findTier(currentWeek, initial.tierId)) ?? currentWeek.tiers[0];
    let running = false;
    let lastResult: RunResult | undefined;

    function renderWeekPicker(): void {
      weekList!.replaceChildren(
        ...weeks.map((week) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "at-button at-button--outline studio-console__week-button";
          button.textContent = `Week ${week.week}`;
          button.dataset.week = String(week.week);
          button.setAttribute("aria-pressed", week.week === currentWeek.week ? "true" : "false");
          button.addEventListener("click", () => selectWeek(week.week));
          return button;
        }),
      );

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

    function renderTierPicker(): void {
      tierList!.replaceChildren(
        ...currentWeek.tiers.map((tier) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "at-button at-button--outline studio-console__tier-button";
          button.textContent = `${tier.tier} — ${tier.label}`;
          button.dataset.tier = tier.id;
          button.setAttribute("aria-pressed", tier.id === currentTier.id ? "true" : "false");
          button.addEventListener("click", () => selectTier(tier.id));
          return button;
        }),
      );

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

    function renderInputPanel(): void {
      const tier = currentTier;
      const nodes: Node[] = [];

      const kindLine = document.createElement("p");
      kindLine.className = "studio-console__input-kind";
      kindLine.textContent = describeInputKind(tier.input.kind);
      nodes.push(kindLine);

      if (typeof tier.input.value === "number") {
        const seedLine = document.createElement("p");
        seedLine.textContent = `Seed: ${tier.input.value}`;
        nodes.push(seedLine);
      }

      if (tier.input.files?.length) {
        const gallery = document.createElement("div");
        gallery.className = "studio-console__input-files";
        for (const file of tier.input.files) {
          if (file.endsWith(".graph.json")) {
            const link = document.createElement("a");
            link.href = file;
            link.className = "at-button at-button--outline";
            link.textContent = "Download workflow graph";
            gallery.append(link);
          } else if (file.endsWith(".mp4")) {
            const video = document.createElement("video");
            video.src = file;
            video.controls = true;
            video.preload = "metadata";
            video.className = "studio-console__input-media";
            gallery.append(video);
          } else {
            const img = document.createElement("img");
            img.src = file;
            img.alt = `Input still for ${tier.label}`;
            img.loading = "lazy";
            img.className = "studio-console__input-media";
            gallery.append(img);
          }
        }
        nodes.push(gallery);
      }

      if (tier.input.promptText) {
        const promptBlock = document.createElement("pre");
        promptBlock.className = "studio-console__input-text";
        promptBlock.textContent = tier.input.promptText;
        nodes.push(promptBlock);
      }

      if (tier.input.negText) {
        const negLabel = document.createElement("p");
        negLabel.className = "studio-console__input-neg-label";
        negLabel.textContent = "Negative prompt";
        nodes.push(negLabel);
        const negBlock = document.createElement("pre");
        negBlock.className = "studio-console__input-text";
        negBlock.textContent = tier.input.negText;
        nodes.push(negBlock);
      }

      inputPanel!.replaceChildren(...nodes);
    }

    function renderResolved(): void {
      const entries: [string, string][] = [
        ["Week", String(currentWeek.week)],
        ["Instrument", currentWeek.instrument],
        ["Model", currentWeek.model],
        ["Mode", currentWeek.mode],
        ["Resolution", currentWeek.resolution],
        ["Tier", `${currentTier.tier} — ${currentTier.label}`],
        ["Input", describeInputKind(currentTier.input.kind)],
        ["Output", currentTier.output.kind],
      ];
      if (currentTier.sameAs) entries.push(["Same recorded result as", currentTier.sameAs]);
      if (currentTier.counterExample) entries.push(["Note", "Deliberate counter-example"]);

      resolvedList!.replaceChildren(
        ...entries.flatMap(([term, definition]) => {
          const dt = document.createElement("dt");
          dt.textContent = term;
          const dd = document.createElement("dd");
          dd.textContent = definition;
          return [dt, dd];
        }),
      );
    }

    function resetRunPanel(): void {
      running = false;
      lastResult = undefined;
      runStatus!.textContent = "Idle";
      runProgress!.value = 0;
      resultFrame!.hidden = true;
      resultVideo!.hidden = true;
      resultVideo!.removeAttribute("src");
      resultImage!.hidden = true;
      resultImage!.removeAttribute("src");
      if (resultCaption) resultCaption.textContent = "";
      downloadButton!.disabled = true;
      setGenerateBusy(false);
    }

    function renderCompareGrid(): void {
      compareGrid!.replaceChildren(
        ...currentWeek.tiers.map((tier) => {
          const figure = document.createElement("figure");
          figure.className = "studio-console__compare-tile";

          const poster = tier.output.poster ?? (tier.output.kind === "image" ? tier.output.file : undefined);
          if (poster) {
            const img = document.createElement("img");
            img.src = poster;
            img.alt = `${tier.tier} — ${tier.label}`;
            img.loading = "lazy";
            figure.append(img);
          }

          const caption = document.createElement("figcaption");
          caption.textContent = `${tier.tier} — ${tier.label}`;
          figure.append(caption);

          return figure;
        }),
      );
    }

    function renderHistory(entries: HistoryEntry[]): void {
      historyStrip!.replaceChildren(
        ...entries.map((entry) => {
          const week = weeks.find((candidate) => candidate.week === entry.week);
          const tier = findTier(week, entry.tierId);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "at-button at-button--outline studio-console__history-button";
          button.textContent = tier ? `Week ${entry.week} · ${tier.tier}` : `Week ${entry.week}`;
          button.addEventListener("click", () => {
            selectWeek(entry.week);
            selectTier(entry.tierId);
          });
          return button;
        }),
      );
    }

    function updateHash(): void {
      history.replaceState(null, "", hashFor(currentWeek.week, currentTier.id));
    }

    function selectWeek(weekNumber: number): void {
      const week = weeks.find((candidate) => candidate.week === weekNumber);
      if (!week || week.week === currentWeek.week) return;
      currentWeek = week;
      currentTier = week.tiers[0];
      renderWeekPicker();
      renderTierPicker();
      renderInputPanel();
      renderResolved();
      renderCompareGrid();
      resetRunPanel();
      updateHash();
    }

    function selectTier(tierId: string): void {
      const tier = findTier(currentWeek, tierId);
      if (!tier || tier.id === currentTier.id) return;
      currentTier = tier;
      renderTierPicker();
      renderInputPanel();
      renderResolved();
      resetRunPanel();
      updateHash();
    }

    // `disabled` is not available to a button that is running because the
    // keyboard just pressed it: disabling the focused element blurs it, focus
    // falls to <body>, and the reader loses both the focus ring and their
    // place on the page for the length of the run. aria-disabled says the same
    // thing to assistive tech, the theme styles it identically to :disabled
    // (components.css matches `[aria-disabled="true"]` alongside `:disabled`),
    // and the `running` guard above is what actually refuses the second press.
    function setGenerateBusy(busy: boolean): void {
      generateButton!.setAttribute("aria-disabled", String(busy));
      generateButton!.setAttribute("aria-busy", String(busy));
    }

    async function generate(): Promise<void> {
      if (running) return;
      running = true;
      setGenerateBusy(true);
      downloadButton!.disabled = true;
      resultFrame!.hidden = true;
      runStatus!.textContent = "Queued";
      runProgress!.value = 0;

      try {
        const result = await backend.run({ week: currentWeek.week, tierId: currentTier.id }, (progress) => {
          runProgress!.value = progress.percent;
          runStatus!.textContent =
            progress.phase === "queued" ? "Queued" : progress.phase === "loading" ? "Loading recorded result" : "Done";
        });

        lastResult = result;

        if (result.outputKind === "video") {
          resultVideo!.src = result.file;
          if (result.poster) resultVideo!.poster = result.poster;
          resultVideo!.hidden = false;
          resultImage!.hidden = true;
        } else {
          resultImage!.src = result.file;
          resultImage!.alt = `Recorded result for ${result.label}`;
          resultImage!.hidden = false;
          resultVideo!.hidden = true;
        }

        if (resultCaption) resultCaption.textContent = `Recorded — ${result.tier} — ${result.label}`;
        resultFrame!.hidden = false;
        downloadButton!.disabled = false;

        renderHistory(pushHistory(currentWeek.week, currentTier.id));
      } catch {
        runStatus!.textContent = "No recorded result for this selection.";
      } finally {
        running = false;
        setGenerateBusy(false);
      }
    }

    function downloadLog(): void {
      if (!lastResult) return;
      const log = {
        generatedAt: new Date().toISOString(),
        week: currentWeek.week,
        instrument: currentWeek.instrument,
        model: currentWeek.model,
        mode: currentWeek.mode,
        resolution: currentWeek.resolution,
        tier: lastResult.tier,
        label: lastResult.label,
        outputKind: lastResult.outputKind,
        file: lastResult.file,
        note: currentTier.note,
        source: "recorded",
      };
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `studio-week-${currentWeek.week}-${lastResult.tier}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }

    generateButton!.addEventListener("click", () => void generate());
    downloadButton!.addEventListener("click", downloadLog);

    weekSelect!.addEventListener("change", () => selectWeek(Number(weekSelect!.value)));
    tierSelect!.addEventListener("change", () => selectTier(tierSelect!.value));

    compareToggle!.addEventListener("click", () => {
      const willShow = compareGrid!.hidden;
      compareGrid!.hidden = !willShow;
      compareToggle!.setAttribute("aria-expanded", willShow ? "true" : "false");
    });

    window.addEventListener("hashchange", () => {
      const parsed = parseHash(location.hash);
      if (!parsed) return;
      const week = weeks.find((candidate) => candidate.week === parsed.week);
      if (!week) return;
      const tier = findTier(week, parsed.tierId);
      currentWeek = week;
      currentTier = tier ?? week.tiers[0];
      renderWeekPicker();
      renderTierPicker();
      renderInputPanel();
      renderResolved();
      renderCompareGrid();
      resetRunPanel();
    });

    renderWeekPicker();
    renderTierPicker();
    renderInputPanel();
    renderResolved();
    renderCompareGrid();
    resetRunPanel();
    renderHistory(readHistory());
    updateHash();
  }
}
