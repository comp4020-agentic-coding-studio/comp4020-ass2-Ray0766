// The colour-theme switch, as three pure functions.
//
// /studio/ is the one page with no footer, so the footer's theme toggle is not
// on it and the status bar carries one instead. That toggle has to be the same
// switch, not a second one that happens to look like it: the same
// `localStorage` key, the same `data-theme` attribute on <html>, the same
// label. The theme package states that mechanism inside a `<script>` in its
// own Footer component, where nothing else can call it — so it is restated
// here, once, and `spec/studio-shell.test.ts` reads the theme's own source to
// check the two have not drifted apart.

/** The theme package's key, verbatim. A different key here would be a second
 *  preference: the footer's toggle on every other page and this one would each
 *  remember their own, and the page would flip theme as you navigate. */
export const THEME_STORAGE_KEY = "at-theme";

export type Theme = "light" | "dark";

/** What pressing the toggle asks for. The theme's own rule is "dark unless it
 *  is already dark", which makes an unset or unrecognised value mean light. */
export function nextTheme(current: string | null | undefined): Theme {
  return current === "dark" ? "light" : "dark";
}

/** The button says what it will do, not what the page currently is. */
export function themeLabel(theme: Theme): string {
  return theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
}

/** What the page opens on: what was stored, or the OS preference. */
export function initialTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}
