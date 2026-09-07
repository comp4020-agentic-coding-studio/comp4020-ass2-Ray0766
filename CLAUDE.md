# Your harness — SLOP8760 course site

Rules for building and maintaining the SLOP8760 course site ("Slop Opera:
Serialized AI Video Drama"). `README.md` documents the platform — content
collections, the generated API, the deck format; this file is what I add on
top of it, and it grows as the work teaches me things. Read both before you
plan or build.

## 0. What a good course looks like

Six decisions this course is built on, before any check enforces them:

1. One idea, carried through — the machine shoots; only technique gets
   credit. Every lecture names the one technique it adds to the rig.
   (enforced: structure check)
2. What is assessed is what was taught (Biggs, constructive alignment): an
   assessment may only ask for an artefact an earlier week's exercise
   produced, and may only cite weeks before its due date. (enforced:
   alignment check)
3. The course is a list of instruments (after *How to Make (Almost)
   Anything*): twelve weeks, twelve distinct additions; no week repeats
   another. (enforced: distinctness and required sections)
4. A ramp, not a tour: the anime-first generators phase fully before
   photoreal is permitted, shot before episode; a week points back, never
   forward, except to an assessment. (enforced: order check)
5. Dailies are the formative loop (Sadler): every exercise is screened the
   same week, and the Dailies page says what to bring. (enforced: coupling
   check)
6. Plain register, narrow audience (after CS 007): the voice contract.
   (partly enforced — banned phrases and the builder-text sentinel; the rest
   is read, not checked, on purpose.)

## 1. What gets marked

- The deployed site, not this repo. A marker browses it like a prospective
  student for about ten minutes at two viewports, 1920×1080 and 390×844:
  home, two non-adjacent weeks, the assessment page, a deck, a policy page.
  Every one of those has to read well at both sizes.
- The brief's hard lines, each of which should have a check under `spec/`:
  twelve teaching weeks with real dates; at least one session linking a real
  deck; assessment weights summing to 100; the course code `SLOP8760`
  everywhere the template expects it.
- Process is the largest share of the mark. `PROCESS.md` is one 400–600 word
  narrative that cites commits; there is no separate reflection file this
  time (the week-7 retro is spoken). This file is read as process evidence too.

## 2. Voice contract

The course is written straight. It is a real studio course about a fake
premise (serialized AI video drama at a fake university), so the register
stays deadpan and institutional throughout — a syllabus, not a pitch deck.
Any joke lives in the subject matter itself; never in the telling of it: no
winking at the reader, no "as you can imagine", no exclamation marks doing
the work a sentence should do.

AI-cliché phrasing is banned outright. Catch one while writing and add it to
this list on the spot, in the same commit as the fix:

- "delve" / "delve into"
- "in today's fast-paced world" (or any "in today's ... world/landscape")

Decks and pages state the same structure; a slide is content and is checked
like a page.

## 3. Two layers of truth

Everything about production craft — what a technique does, why it works, what
it costs — is real. A student who reads the material and does nothing else
should come away with correct beliefs about generative-video and short-form
drama production.

Fiction is confined to the institution and its people: Slop University, its
departments, the convener and tutor, its administrative furniture. Never
invent a model name, a benchmark score, or a specific tool claim to make the
fiction feel more real — if a craft statement needs a real product or number,
find the real one or state the technique generically.

## 4. Platform discipline

- Never hand-edit anything under `dist/` or `src/content/**/*.json` — build
  output. Fix the source and rebuild.
- The repo sits under `~/Desktop`, inside iCloud Drive's sync range, so it
  grows conflict copies — `week-08 2.mdx` beside `week-08.mdx`. A copy in a
  content collection is a second entry with a colliding key, and in
  `src/decks/` a thirteenth deck; both build. So **never `git add -A`**: add
  named paths, and let `spec/no-duplicate-copies.test.ts` name any copy that
  has appeared.
- A build-time-only module (reads JSON/text off disk to feed a page) must not
  resolve its own file paths at runtime via `import.meta.url`/`readFileSync`:
  the prerender step bundles the module into a chunk that no longer sits next
  to the files it wants to read, and the build fails with an ENOENT that only
  shows up once some page actually imports the module. Use
  `import.meta.glob(..., { eager: true })` (add `query: "?raw"` for plain
  text) so Vite inlines the file contents at build time instead. Learned from
  `src/lib/studio.ts`, which shipped this way in one commit and broke the
  build in the next, the moment `/studio/` started importing it.
- No root-absolute links (`href="/sessions/"`) in `.astro` files. Dev serves
  at `localhost:4321/comp4020-ass2-Ray0766/` and Pages mounts the site at the
  same sub-path; a root link works locally and 404s live. Use the theme's link
  handling or a relative link.
- Every `date` and `due` falls inside the teaching period in `courseMeta`.
  Rhythm, decided 2026-09-01: lecture Monday, Dailies Wednesday, due Friday.
  `spec/data-integrity.test.ts` enforces the window; don't add a date outside
  it and don't weaken the test.
- Colour comes from the theme's `--at-*` tokens (derived from the Slop
  palette); no new base colours. Styles live in `.css` files the linters can
  see, not in `.astro` `<style>` blocks.
- Unlayered CSS beats every theme layer: the theme wraps its own rules in
  `@layer`, so an unlayered bare element selector (`h1 { ... }`) always wins
  over a layered theme class regardless of specificity. The type scale is
  scoped to page content (`.at-main > h1/h2/h3`, never bare elements), and a
  theme component is restyled only through its own class.

## 5. Visual direction (hero reversed 2026-09-07, phase shapes 2026-09-07)

- Apple product-page layout grammar — full-bleed hero, oversized type, sticky
  sections — in the Slop palette. One signature scroll moment only: the home
  hero, which stays the only scroll signature on the site.
- One page shape per teaching phase, held for every week inside it: the rig
  weeks are a spec sheet, the generator weeks a bench, the holding weeks a
  board, the episode weeks a call sheet (`data-phase` on the lecture page's
  `<main>`, styled in `src/styles/lecture-phases.css`). This replaces
  "everything else is typography and spacing", which produced twelve lectures
  built from one template: a marker reads two *non-adjacent* weeks, and one
  template makes those two look like the same page with the words swapped,
  however different the words are. Four shapes is the smallest number that
  makes any two weeks a marker samples land in different-looking pages while
  still leaving each phase internally consistent. The teaching skeleton
  (Before class / The ladder / This week's exercise) and the register do not
  vary with the shape.
- The hero's thesis is that the show fills the screen and the words sit on
  top of it. At rest the 9:16 loop is sized to the full stage height with a
  blurred, darkened copy of its own poster covering the rest; scrolling
  **shrinks** it into the phone-shaped card and slides the two title words
  out into the gutters beside it. It used to run the other way — a small card
  that grew — which sold the phone frame rather than the drama in it.
- Layers inside the stage, bottom to top: backdrop, loop, scrim, curtain,
  text. Text is above every media layer.
- Sticky stage + `animation-timeline: scroll()` driving a `--p` custom
  property, and every piece of geometry is a `calc()` off `--p`. There is no
  IntersectionObserver fallback and there never was — an earlier version of
  this section claimed one. The two states that stand in for the scroll,
  `@supports not (animation-timeline: scroll())` and
  `prefers-reduced-motion`, pin `--p` instead of restating each animated
  value, which is what used to let them drift out of step with the
  animation. No wheel hijacking, no `mix-blend-mode`.
- Both of those pin `--p` to **0**, not 1. The end state is a handoff into
  the page: it drops the lead and both buttons on purpose, because by then
  the page is arriving underneath. Frozen as a resting composition it is a
  hero missing two of its links, so a browser that can't run the scroll, and
  a reader who asked for less motion, get the composition that has everything
  in it.
- Text over moving pictures is a contrast problem, and the scrim is sized by
  arithmetic rather than by eye. A browser composites the scrim over the
  video in sRGB's gamma space, so a pixel under alpha `a` comes out at
  channel value `1 - a` no matter how bright it started: at 0.88 even a pure
  white frame lands at 0.0155 relative luminance. A scrim that reaches 0.88
  before the text starts is therefore safe for **any** clip, not just this
  one — which is why the text block is anchored to the bottom and the scrim's
  ramp finishes above it. The title is white for the same reason: the brand
  gold needs a background under 0.017 to clear 4.5:1 and no watchable scrim
  gets there. Gold stays on the buttons, where it is a fill with its own ink.
- The hero stage keeps a dark surface in both themes rather than fading to
  `--at-bg`. Ending on a light page background under the light theme would
  force the title to cross-fade from white to near-black and pass through a
  mid-grey-on-mid-grey midpoint halfway down the runway.
- The entrance plays once on first paint: media up from black over ~900ms,
  title words rising 0.3em, then kicker and lead, then buttons. CSS only,
  `animation-fill-mode: both`, and it never gates `play()`. An element can
  only have one owner for `opacity` or `transform`, and a filled animation
  holds its end value over any `calc()` underneath it forever — so anything
  that both enters on load and moves on scroll splits the two across separate
  properties (`transform` against `translate`) or separate elements (the
  curtain, the two group wrappers). If the video never arrives, the poster
  composition is the hero; verified on Slow 3G with `readyState` still 0.
- Write `animation-timeline` and `animation-range` as longhand properties,
  with a comment saying why: Lightning CSS folds them into the `animation`
  shorthand as a value Chrome rejects. Dev looks right, every check stays
  green, and the live animation is dead. Check the effect against
  `pnpm preview`'s minified output, not `pnpm dev`.
- Phone (≤ 640px) has no runway and nothing scroll-driven: the loop covers
  the viewport and the text sits on it. A resize across that breakpoint
  mid-scroll must land on one composition whole — switching the stage's
  animation off returns `--p` to its registered initial 0, which is what
  makes that true rather than a pile of overrides.
- Phase cards on the home page animate on hover only; the `/lectures/` chips
  are static gradients.

## 6. How to work with me

- One batch at a time — one content collection, or one page — then stop and
  report: what changed, and what you're not sure about.
- If a spec line is ambiguous, ask rather than guess; a wrong guess costs
  more than the question.
- Decorative decisions (spacing, palette steps, the wording of a heading) are
  yours: make them and flag them. Dates, weights, the SLOP code, and anything
  in `spec/` are mine: ask first.

## 7. Verification

- The rendered page is the ground truth, not the source file. Any visual or
  interactive change is driven in a real browser at both marking viewports
  before it counts as done. `pnpm check` proves the data and the build; it
  does not prove the page looks right.
- Use the course `agent-browser` CLI, or a throwaway puppeteer installed under
  `/tmp` and pointed at the dev server — never added to this project's
  `package.json` or lockfile.
- A regression sentinel counts only once it has been seen red under the bug it
  guards against. Inject the bug, watch it fail for the right reason, then
  fix.
- When a check fails, read its output before you change anything. Never make
  a check pass by weakening it or by rewording honest copy; widen the check.
- The phone viewport is not a smaller desktop: a scroll choreography gets its
  own phone composition, not a scaled variant of the desktop one, and the H1
  must be fully readable at both viewports in every resting state.
- Both colour themes are checked, because the OS chooses the default and the
  footer toggle exists.
- The build's axe run is not a contrast check. `astro-theme-university`'s
  `a11y-worker.mjs` runs axe-core over the HTML inside a JSDOM document, and
  JSDOM has no layout and no computed colour, so contrast rules cannot fire;
  the theme's own `contrast.ts` says axe-core cannot read oklch anyway, which
  is why the palette is checked as token arithmetic instead. Neither of those
  reaches a semi-transparent fill over something else, which has no token
  value at all — the hero scrim, a card wash, any overlay on a frame. So any
  new colour gets measured in a real browser, on the composite: read the
  rendered pixel, not the declared one. "58 pages, no accessibility
  violations" is silent about every one of them.
- Walk the page from the address bar with the keyboard alone before calling
  an interactive change done: every control reachable, in document order,
  with a ring you can see. `all: unset` is an opt-out of the focus indicator,
  not a styling shortcut — and when the reset sits in a later cascade layer
  than the `:focus-visible` rule (the theme puts them in `at.components` and
  `at.base` respectively), the ring cannot come back on its own. The element
  still matches `:focus-visible`; it just paints nothing, which is exactly
  the failure a screenshot never shows.
- A control must not take focus away from the person who just used it. The two
  ways this happens are disabling the element that was pressed (`disabled`
  blurs it; use `aria-disabled` plus a re-entrancy guard, which the theme
  already styles the same way) and re-rendering the list it lives in (put
  focus back on the same control of the same item, so pressing a key twice
  means doing the thing twice). Both leave `document.activeElement` on
  `<body>`: the ring vanishes, and a screen reader loses its place. Chrome's
  sequential-focus-start hides how bad it is — the next Tab lands somewhere
  reasonable — so check `document.activeElement` after the press, not where
  Tab goes next.
- A section that ships `hidden` and is revealed by its own module has to have
  its space held open from first paint, or on a slow connection it shoves
  everything below it down the page seconds after the reader started reading.
  Key the reservation on `[hidden]` so it releases itself when the module
  reveals the section, and switch it on from an inline script during parsing
  so JS-off readers get neither a reservation nor a hole. Measure this under
  Slow 3G with the cache disabled: on a fast connection the swap happens
  before first paint and the page looks perfect.

## 8. Evidence

- Commit in my own voice, in English: what changed and why, not a changelog
  of file operations. One decision, one commit. Commit as you go — the trail
  is read, not just the final state.
- Never commit a red `pnpm check`, with one exception: a contract-first test
  that is supposed to start red gets its own commit, and that commit says so.
- "Pushed" is a claim, not a fact. Before reporting it, `git fetch` and
  confirm `origin/main` matches `HEAD`.
- `PROCESS.md` cites commits as markdown links whose link text is the 7–40
  character sha; `pnpm check:evidence` ignores plain-text shas and verifies
  each cited commit exists.

## 9. Interactives

Three lecture pages (weeks 5, 9, 12) carry a small widget demonstrating that
week's own teaching point, embedded inline in the lecture's markdown via MDX.
Any future widget in this family follows the same rules:

- The static page carries the full teaching point with JS off. JS only adds
  the live interaction (a composed sentence updating as you type, a timed
  reveal, a draggable marker) — never the point itself.
- Keyboard operable: native form controls where they suffice; a custom
  control (the retention-curve scrubber, a segmented toggle) gets a real
  `role`/`tabindex`/arrow-key handling, not just a mouse handler.
- `prefers-reduced-motion` is respected — an animation gates out under the
  media query; the underlying state change (a timer firing, a value updating)
  still happens.
- Colour comes from `--at-*` tokens only, same as the rest of the site; no
  inline `style` attributes on these widgets.
- Scripts are `.ts` files under `src/scripts/`, referenced with
  `<script src="...">`; styles are `.css` files under `src/styles/`, one per
  widget.
- No fabricated numbers presented as data — a chart illustrating a shape says
  so in its caption.
- The register stays a syllabus: no exclamation marks, no counters or scores,
  no "try it".

## 10. STARTER_CONTENT markers

A `STARTER_CONTENT` comment comes out only when the fragment it marks has
actually been replaced with real content — not when the surrounding file was
touched for some other reason. Leaving a marker in place is the correct
outcome for anything not yet reached. The placeholder images
(`hero-home.avif`, `card.png`) count as markers: replace them or remove them
on purpose.
