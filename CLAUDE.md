# Your harness — SLOP8760 course site

Rules for building and maintaining the SLOP8760 course site ("Slop Opera:
Serialized AI Video Drama"). `README.md` documents the platform — content
collections, the generated API, the deck format; this file is what I add on
top of it, and it grows as the work teaches me things. Read both before you
plan or build.

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

## 5. Visual direction (decided 2026-09-01)

- Apple product-page layout grammar — full-bleed hero, oversized type, sticky
  sections — in the Slop palette. One signature scroll moment only: the home
  hero, where a 9:16 loop plays as a phone-shaped card that expands on
  scroll. Everything else is typography and spacing.
- The hero is sticky + `animation-timeline: scroll()` driving a `--p` custom
  property, with an IntersectionObserver fallback and `prefers-reduced-motion`
  rendering the end state directly. No wheel hijacking, no `mix-blend-mode`.
- Write `animation-timeline` and `animation-range` as longhand properties,
  with a comment saying why: Lightning CSS folds them into the `animation`
  shorthand as a value Chrome rejects. Dev looks right, every check stays
  green, and the live animation is dead. Check the effect against
  `pnpm preview`'s minified output, not `pnpm dev`.
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

Three lecture pages (weeks 2, 5, 12) carry a small widget demonstrating that
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
