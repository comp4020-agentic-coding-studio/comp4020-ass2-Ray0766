// The theme's own virtual modules, made visible to this project's typechecker.
//
// astro-theme-university ships `virtual.d.ts` declaring these, but nothing in
// this repo's tsconfig reaches inside the package to pick it up: the theme's
// own layouts typecheck against it, and a layout of ours importing the same
// modules does not. src/layouts/StudioLayout.astro is the first file here that
// needs them, because it is the first layout this project writes itself rather
// than wrapping one of the theme's.
//
// A reference to the file itself would be a relative path through
// node_modules, which is a pnpm symlink and moves between a checkout and a
// worktree. Restating the two declarations is three lines and does not move.

declare module "virtual:astro-theme-university/fonts" {
  /** cssVariables of every registered font (theme fonts + site-registered).
   *
   *  The theme declares these `string[]`, but `<Font>`'s own `cssVariable`
   *  prop is the union Astro generates from the registered families
   *  (.astro/fonts.d.ts), so a plain `string` is not assignable to it. Typed
   *  as that union here: it is the same set by construction — the theme builds
   *  this array out of the families it registers with Astro. */
  export const fontVariables: import("astro:assets").CssVariable[];
  /** The subset of fontVariables that BaseLayout preloads. */
  export const preloadFontVariables: import("astro:assets").CssVariable[];
}

declare module "virtual:astro-theme-university/llms" {
  /** Href of the generated llms.txt, or null when llmsTxt generation is off. */
  export const llmsTxtHref: string | null;
}
