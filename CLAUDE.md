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
- **A sentinel is verified against the code as it was, and when the thing it
  keys on changes shape that verification expires.** The backlot's first-frame
  check keyed on the stage losing its `hidden` attribute, which was exactly
  right until the gallery moved inside the stage and `hidden` came off — after
  which it fired at HTML parse, read 605ms against a 3700ms line, and was green
  no matter what. The change that broke it was itself correct, and it happened
  in the same round I wrote the rule below. So: prefer a probe that keys on
  something the code sets **on purpose at the moment in question**, and pair it
  with an invariant the bug would violate, so the expiry is caught on the next
  run instead of by somebody remembering. Here that invariant is that the first
  frame cannot precede the arrival of the chunk that draws it, and it fails on
  its own under the old probe.
- **The harness that injects the bug expires too, and it expires more quietly
  than the check does.** Two plate sentinels went from red to 75/75 on a
  re-take with nothing wrong: a sign built from the same recipe had landed 489
  bytes earlier in the bundle, so an injection matching "the first occurrence in
  the file" patched the sign instead of the plate; a third keyed on `s[0] ===
  "P"` and the minified label's name had moved from `s` to `o`, which turned the
  injection into a no-op that reads exactly like a check gone blind. An
  injection that matches a bare pattern is fed by whatever else is in the file,
  in the same way a check that matches a bare substring of source is — anchor it
  inside the function it is breaking, and read the names it needs out of the
  bundle rather than assuming them. The only reason any of it surfaced is that
  reds get re-taken after the tree moves, which is what the expiry rule above
  looks like in practice.
- **A proxy can pass while the thing it stands for fails, and it will not tell
  you.** A door's nameplate was signed off on cap height — 12, 9 and 8 px,
  honestly measured and matching the claim — while the word itself could not be
  read at 1:1 or at 2×. Cap height was silent about stroke separation, which is
  what the condensing had actually spent. The instrument that settles a question
  about reading is a 1:1 capture and somebody saying whether they can read it;
  everything else is a stand-in, and a stand-in gets checked against the real
  thing at least once before it is trusted to stand in.
- **Two ways to measure a moving scene wrongly, both of which produce a
  confident number.** A single snapshot of a scene with an idle camera is not a
  measurement: twelve samples over thirteen seconds swung 27 points, and the one
  that got reported was the first. Measure with motion off and say so, or give a
  range. And segmenting an object by brightness discards exactly the pixels that
  make it bright — a head sampled that way read 125.7 for a cell that reads
  145.3. Segment by moving the object and diffing the frames.
- Watching it go red is also the only thing that catches a check which *cannot*
  go red, and that is a different failure from a check that is merely wrong.
  Three of them in one round, each green and each blind: a reduced-motion check
  screenshotted two frames four seconds apart and asserted they were identical
  — they were, and both were blown out to white, because "did anything move"
  cannot see "everything clipped before it started"; the stage reservation's
  sentinel asserted CLS and stayed green with the reservation deleted, because
  the module hides the list in the same task it reveals the stage, so nothing
  ever moves either way; and `spec/backlot-contrast.test.ts` collected **zero**
  tests for a whole run, under a summary line that said 1210 passed, because a
  backtick closed a `String.raw` probe early. The tell is that the check
  answers a question next to the one being asked. Assert on the number the bug
  would change — the list's own offset at first paint, the sampled channel
  values, the count of tests and files a suite collected — and prove the
  assertion can fail by making it fail.
- The register's rule about the `--at-*` tokens has a trap on the way out of
  the DOM. `astro-theme-university`'s `base.css` sets
  `transition-duration: 0.01ms !important` on everything under
  `prefers-reduced-motion` and leaves `transition-property` at its initial
  `all` — so under that preference every element has a live transition on every
  animatable property, `color` included, and reading a computed colour in the
  same task returns the value it is transitioning **from**. A colour probe that
  set one shared element's `color` to eleven tokens in turn and read each one
  back got the same wrong answer eleven times, and the backlot booted painted
  in `--at-text`. Resolve a token on a fresh element, coloured before it is
  inserted — a transition never runs on an element's first style computation —
  and read anything else you have just set on the next frame, not this one.
- A branch nobody has ever watched execute is not a guard, it is a comment.
  Anything new that only runs in a condition — a fallback, a hand-over, an
  escape rule, a derived token — needs one observation of it actually running
  before it counts as done. Three of these shipped in one round, each of them
  read as handled: `--phase-*-ink` derived a correct ink for all four phases
  while nothing on the site referenced any of them, so `spec/palette.test.ts`
  was green about dead code; `three-second-demo.css` gave `[hidden]` its
  escape rule to the two containers and not to the button, so the pressed Play
  button stayed painted for the whole clip; and `phone-swap.ts` decided
  "the reader was in the canvas" with `stage.contains(target)` against a desk
  that is the stage's *sibling*, so the focus hand-over could not fire on any
  crossing that mattered and never had. The tell is the same each time: the
  code is right, the condition reaching it is false, and reading the source
  tells you nothing. Drive it, or assert on it having happened.
  This applies to the harness too. Headless Chrome has no OS-focused window,
  so it defers focus events forever: `element.focus()` moves
  `document.activeElement` and fires no `focusin` at all. A check that reads
  activeElement passes; page code that listens for focus never runs. `Tab`
  turns on `Emulation.setFocusEmulationEnabled` for exactly this, and a red
  run taken before that was on is not evidence of anything.
- A check that matches a bare substring of source — a tag name, an attribute
  name — is fed by the file's own comments and by the `querySelector` string
  that looks for the thing, so it stays green after the thing is gone. Anchor
  the assertion to a line start or to a structure instead (`/^\s*<dialog\b/m`,
  `/<div[^>]*\sdata-studio-fallback[\s>]/`, a parsed section rather than
  `includes`). Cost so far: `data-studio-fallback` renamed in the page and the
  check stayed green because the status bar's own module names it; `<dialog>`
  swapped for a `<div>` and the check stayed green because the module's opening
  comment says the word.
- A check whose **scope** is a hand-kept list goes quiet exactly when the code
  grows, and it goes quiet without saying so. `spec/palette.test.ts` enumerated
  fourteen stylesheets by name; `backlot.css`, `backlot-hud.css`,
  `decks-index.css`, `phase-colours.css` and `release-calendar.css` were never
  in that list and were therefore never checked, and the day it became a
  `globSync` it found an accent painted as an `outline` on the first run.
  Derive the scope from the filesystem or from the data; if a check really must
  be told what to look at, the list itself is a thing a test has to prove
  complete.
- The keyboard half of the harness has the same shape of trap as the focus
  half: a CDP `Input.dispatchKeyEvent` with `type: "rawKeyDown"` and no `text`
  never runs a focused button's activation behaviour, so a driver can report a
  press that did not happen — one did, and reported a camera move that had not
  occurred. `spec/lib/chrome.ts`'s `press` gets this right; use it rather than
  dispatching by hand, and have any one-off driver assert on the state the
  press was supposed to change rather than on the press having been sent.
- When a check fails, read its output before you change anything. Never make
  a check pass by weakening it or by rewording honest copy; widen the check.
- The phone viewport is not a smaller desktop: a scroll choreography gets its
  own phone composition, not a scaled variant of the desktop one, and the H1
  must be fully readable at both viewports in every resting state.
- Both colour themes are checked. A first visit is forced dark on any OS
  (`src/components/DefaultDarkTheme.astro`), so dark is what a marker sees;
  light is what a reader gets back the moment the footer toggle stores a
  preference, which is why it is checked too.
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
- Three more things a sampler gets wrong, learned on the backlot's focus ring,
  where every one of them produced a plausible number: a fixed pixel offset
  reads a blend, because a `translate(-50%)` puts every band edge on a half
  pixel — the gold measured 136,92,21 against a declared 185,125,28, which is a
  reported 3.17:1 where the truth is 5.82:1; `elementFromPoint` is not a
  clearance test, because an outline and a `box-shadow` paint outside the
  border box and hit-test nowhere, so a neighbouring control's ring can sit on
  the sample point invisibly; and an outline on a large `border-radius`
  composites about a pixel wider than it declares, which is enough to eat a
  2px band down to something no sampler can find. What makes a reading worth
  believing is refusing it: read a column rather than computing band edges,
  accept only a pixel that **equals** a declared colour exactly, and throw the
  sample away otherwise. Four of twenty-seven were refused that way rather than
  reported as numbers.
- An indicator over a surface the palette does not own — a focus ring on a
  canvas — needs two tones, and which two is arithmetic rather than taste. Two
  tones leave no gap only where `9 × (Ldark + 0.05) ≤ Llight + 0.05`; the Slop
  gold against `--at-bg` fails that in the dark theme, leaving scenes with
  relative luminance between 0.0502 and 0.1049 able to defeat both at once, and
  a mid grey in the hub sat at 0.0898. Bracket the brand stroke with `--at-bg`
  and `--at-text`, which the theme already derives as opposites in both themes,
  and the gold stays the stroke you see — still a fill's colour doing a fill's
  job, not ink. Widening a single-tone ring cannot fix this, and the number
  that proves it is the backing's own contrast against the same scene pixel.
- A brand colour is a fill, not ink — and that one rule covers both the gold
  and the four phase colours. The Slop gold is 3.43:1 on the light theme's
  background and 5.81:1 on the dark one; `--phase-episode` is 8.60:1 on light
  and 2.32:1 on dark. Neither is readable on both, so neither is ever text or
  a line: gold fills buttons, badges and the minimap, a phase colour fills the
  3px rule at the start of a board's title line — as a pseudo-element's
  `background`, never as a `border`, so it stays a fill in the source and not
  only in the intent — and anything that is ink or a stroke takes
  `--at-brand-ink` (gold in the dark theme, the brand's own copper
  `--at-secondary` in the light, 5.70:1). `spec/palette.test.ts` computes
  every one of those numbers from the token values and fails the build if a
  stylesheet paints `--at-accent` as `color`, `stroke`, `border` or `outline`.
- Token arithmetic proves the tokens agree with each other. It does not prove
  any page ever asks for one. `phase-colours.css` derives a correct ink for
  each of the four phase fills and `spec/palette.test.ts` checked all four
  green for days, while the weight bar on the home page and `/assessments/`
  painted its labels `var(--at-black)` and nothing on the site referenced a
  `-ink` token at all — black measured 3.62:1 on generators, 3.46:1 on
  holding and 2.40:1 on episode, on the pages a marker opens. So a token
  nothing references is not a passing check, it is dead code with a test on
  it: before trusting the arithmetic, grep for a use of the token, and put the
  real check on the rendered page. `spec/weight-bar-contrast.test.ts` is that
  check — it drives the Chrome already on the machine over the DevTools
  protocol (`spec/lib/chrome.ts`, no new dependency, puppeteer still stays out
  of `package.json`), samples the composited pixel under every label at both
  marking viewports in both themes, and reads the ink off the same element's
  computed style. Three things make a sample worth believing, each learned by
  getting it wrong: keep out of the element's own text and borders and confirm
  `elementFromPoint` still answers the element; inset past a `border-radius`,
  because a rounded corner's antialiased blend with the page behind it is
  exactly the lightest pixel a worst-case search goes hunting for; and read
  every point in one scroll position, since a font or a lazy image landing
  after `load` moves the element without moving the scroll offset. Where the
  fill is flat, assert the sampled pixel equals the declared background — that
  one line catches all three at once.
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
- Two numbers, not one, whenever something heavy loads: what the reader can
  read, and when the heavy thing arrives. On `/backlot/` a
  `<link rel="modulepreload">` in the first bytes of the head takes the 3D's
  first frame from 3586 ms to 2397 ms on Slow 4G and costs 380–460 ms of first
  contentful paint — including the variant that preloads 7.4 kB, which rules
  out bandwidth and leaves ordering. Preloading is not free and it is not local:
  it spends the thing a reader sees first to buy the thing they see second. The
  measurement to distrust here is my own, because a static server on HTTP/1.1
  round-robins six connections and priority barely bites, while Pages serves
  HTTP/2 on one, where a `VeryHigh` stylesheet genuinely outranks a `High`
  module — so this one gets re-taken against the deployed site before it is
  believed either way. Same for `loading="lazy"`: Chrome's threshold is about
  3000px on a slow connection, so it holds back nothing on the first screen and
  the first images down a long page land straight across whatever else is in
  flight.
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
