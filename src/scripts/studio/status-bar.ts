// The slim bar under the stage: the credit line, the theme toggle and the way
// back to the list.
//
// Two controls, and neither of them is new behaviour. The theme toggle is the
// footer's toggle moved onto the one page that has no footer — same key, same
// attribute, same label, all of it in src/lib/theme.ts so the spec can check
// it against the theme package's own source. "Show as a list" reveals the
// static gallery that is already in the DOM as the no-JS body: the canvas
// island hides it on mount, and this puts it back.

import { nextTheme, themeLabel, THEME_STORAGE_KEY, type Theme } from "../../lib/theme";

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing, a full quota: the page still switches, it just stops
    // remembering — the same bargain the canvas document strikes.
  }
  const label = themeLabel(theme);
  for (const button of document.querySelectorAll("[data-studio-theme]")) {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
}

function setupTheme(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-studio-theme]");
  if (!button) return;
  button.addEventListener("click", () => {
    applyTheme(nextTheme(document.documentElement.dataset.theme));
  });
}

function setupList(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-studio-list]");
  const list = document.querySelector<HTMLElement>("[data-studio-fallback]");
  if (!button || !list) return;

  // With JS off the list is the page and this button would do nothing, so it
  // ships hidden and only this script puts it on screen.
  button.hidden = false;

  const sync = () => {
    const shown = !list.hidden;
    button.setAttribute("aria-expanded", String(shown));
    button.textContent = shown ? "Hide the list" : "Show as a list";
  };

  // The island is what hides the list, and it does that whenever it finishes
  // mounting — which is after this runs on a slow connection. Watching the
  // attribute means the button's label is right in both orders, rather than
  // right only in the one that happens to win the race.
  new MutationObserver(sync).observe(list, { attributes: true, attributeFilter: ["hidden"] });
  sync();

  button.addEventListener("click", () => {
    list.hidden = !list.hidden;
    sync();
    // Focus stays on the button that was pressed; only the page moves — and
    // a reader who asked for less motion still arrives, just without the ride.
    if (list.hidden) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  });
}

function setup(): void {
  setupTheme();
  setupList();
}

document.addEventListener("astro:page-load", setup);
