---
title: Repeatable Magic
description:
  Turning a one-off trick into a repeatable technique, with reference frames,
  seed reuse, and workflow templates that hold a look across many shots.
week: 3
date: 2027-03-08
teachers:
  - vera-lin
related:
  - sessions/week-03
draft: false
---

A shot you can't get twice is a lucky accident, not a technique, and this
course only credits technique. This week is about locking down everything
between a prompt and a result so that the same inputs reliably produce the
same output — because the Shot Portfolio due in three weeks is graded on
exactly that reproducibility.

## Seed as address

A generation seed is not a style knob — it's an address. On the same model,
sampler, and software version, the same seed with the same parameters
returns to the same result, which means a seed plus a full parameter list is
the only thing that actually specifies a shot. Change one parameter and keep
the seed, and you're testing that parameter in isolation; change the seed
and you've generated a different shot regardless of what else stayed the
same. Log both, every time, or the shot you liked yesterday is unfindable
tomorrow.

## Golden reference, and the reshoot-or-patch decision

Keep one shot from each technique you settle on as a golden reference — the
exact output a correctly run version of that technique should produce.
Every later shot using that technique gets checked against it the way a
test suite checks against a known-good result. When a new shot drifts from
the reference, there are two options: regenerate from scratch with the
locked seed and parameters, or patch the specific broken region.
Regeneration is cheaper when the whole shot is off; patching is cheaper when
one small area is wrong and the rest is worth keeping. Guessing wrong costs
the render time twice.

## Before class

Bring one shot from Weeks 1–2 that you'd be willing to call a technique,
along with its full seed and parameter log.

## This week's exercise

Pick one technique from your last two weeks of work and reproduce it twice:
once by rerunning the exact log, and once by handing that log to a
classmate to run themselves. Bring all three results — original, your
rerun, their rerun — plus the log itself to Wednesday's Dailies.
