# Your harness

Rules for building and maintaining the SLOP8760 course site. Read `README.md`
for the platform first; this file is what we're adding on top of it.

## 1. Voice contract

The course is written straight. It is a real studio course about a fake
premise (serialized AI video drama at a fake university), so the register
stays deadpan and institutional throughout — a syllabus, not a pitch deck.
Any joke lives in the subject matter itself (the premise is already absurd),
never in the telling of it: no winking at the reader, no "as you can imagine",
no exclamation marks doing the work a sentence should do.

AI-cliché phrasing is banned outright. Catch one while writing and add it to
this list on the spot, in the same commit as the fix:

- "delve" / "delve into"
- "in today's fast-paced world" (or any "in today's ... world/landscape")

## 2. Two layers of truth

Everything about production craft — what a technique does, why it works, what
it costs — is real. This course teaches actual generative-video and
short-form-drama production technique; a student who reads the material and
does nothing else should come away with correct beliefs about the craft.

Fiction is confined to the institution and its people: Slop University, its
departments, its convenor and tutor, its administrative furniture. Never
invent a model name, a benchmark score, or a specific tool claim to make the
fiction feel more real — if a craft statement needs a specific product or
number to be true, find the real one or state the technique generically.

## 3. Platform discipline

- Never hand-edit anything under `dist/` or `src/content/**/*.json` — those
  are build output. Fix the source and rebuild.
- No root-absolute links (`href="/sessions/"`) inside `.astro` files. They
  skip the base-path rewrite, work on `localhost`, and 404 on the deployed
  site. Use the theme's link handling or a relative/markdown link.
- Every `related:` ref must resolve. A dangling ref is a build failure by
  design — treat that failure as the check working, not as a bug to route
  around.
- Every scheduled date (`date`, `due`) falls inside the teaching period
  (`courseMeta.startDate`–`endDate`). `spec/data-integrity.test.ts` enforces
  this; don't add a date outside it and don't weaken the test.

## 4. Working method

Work one batch at a time — one content collection, or one page — then stop
and report: what changed, and what you're not sure about. If a spec line is
ambiguous, ask rather than guess; a wrong guess costs more than the question.

## 5. Verification

The rendered page is the ground truth, not the source file. Any visual or
interactive change is checked in a real browser at both marking viewports —
1920×1080 and 390×844 — before it counts as done. Passing `pnpm check` proves
the data and the build; it does not prove the page looks right.

## 6. Evidence

- Commit in the student's own voice, in English: what changed and why, not a
  changelog of file operations.
- One decision, one commit. Don't bundle an unrelated fix into a content
  commit because it was sitting there.
- Never commit a red `pnpm check`, with one exception: a contract-first test
  that's supposed to start red gets its own commit, and that commit says so.

## 7. STARTER_CONTENT markers

A `STARTER_CONTENT` comment comes out only when the fragment it marks has
actually been replaced with real content — not when the surrounding file has
been touched for some other reason. Leaving a marker in place is the correct
outcome for anything not yet reached.
