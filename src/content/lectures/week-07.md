---
title: Humans Are Hard
description:
  Why generated human performance is the hardest part of the pipeline — faces,
  expression, and dialogue sync — and the workarounds the industry actually
  uses.
week: 7
date: 2027-04-19
teachers:
  - vera-lin
related:
  - sessions/week-07
draft: false
---

The anime-first ramp of Weeks 1 through 6 was not only a stylistic choice; it
was cover. Stylization absorbs the exact errors a generative model makes most
often, so a slightly wrong hand or a slightly wrong eye reads as house style
rather than failure. Live-action grammar removes that cover. The same
generator and the same error rate now read as mistakes, because a human face
has nowhere to hide them.

## The asymmetry

As a rendered face approaches photorealism, small remaining errors produce a
disproportionately strong negative reaction in a viewer, out of proportion to
how minor the error looks in isolation — the uncanny valley effect. Anime
style sits below that threshold, and an error there gets absorbed as style.
Photorealism sits inside it, and the same category of error — a slightly
wrong blink, a tooth that shifts between frames — gets amplified rather than
forgiven. Nothing about the model changes between Week 6 and this week; only
the tolerance for its mistakes does.

## Where it breaks

Skin, eyes, teeth, and hands are where a realistic generated face fails first
and most visibly: texture that reads slightly waxy, a gaze that doesn't quite
track, teeth that shift shape between frames, fingers that fuse or multiply.
These are not exotic failure modes; they are the default ones, and the only
defense is checking for them specifically rather than trusting a shot that
looks fine at a glance.

## Casting a reference face

Casting, on this rig, happens before a camera opens: it is the choice of one
locked reference face that every later shot of that character gets checked
against, the same discipline Week 4 used for anime leads. A realistic
character without a locked reference will drift face to face in ways a
simpler anime design hides. More takes get thrown away chasing a usable human
performance than a usable anime one, so budget roughly double the render
passes for the same number of finished shots.

## Before class

Secure the rights to one real face you can legally use — your own, a
consenting collaborator's, or a licensed reference set — and prepare one
clean reference frame of it.

## This week's exercise

Generate three takes of that reference face performing one short line of
dialogue. Reject at least one take in writing using the skin/eyes/teeth/hands
checklist, and bring the reference frame, all three takes, and your rejection
note to Wednesday's Dailies.
