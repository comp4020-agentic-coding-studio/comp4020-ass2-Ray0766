---
title: The Rig
description:
  Setting up the rig you will run for the rest of the semester — the VRAM
  budget that sets your ceiling, where model weights and their licenses come
  from, and the workflow graph as a repeatable recipe.
week: 1
date: 2027-02-22
teachers:
  - vera-lin
slides: /decks/week-01/
related:
  - sessions/week-01
draft: false
---

Before any shot gets made, four things have to be settled: the hardware
you're working with, where its models come from, how you'll keep a record of
what you did, and how long any of this actually takes. Skipping one means
finding its limit by accident, mid-semester, on a deadline.

## The budget question

On a consumer graphics card, the number that decides what you can do is
VRAM — the memory built into the card — not its price or its processor
speed. VRAM is a hard ceiling: it sets the largest model, the resolution,
and the longest clip you can produce in one pass. Less VRAM does not mean
slower; past a point, it means the model does not run at all. Know your
card's VRAM figure before planning a shot around an unfamiliar model.

## Where the models come from

Model weight files come from public repositories: one base release, then a
long tail of community finetunes built on it. Every file carries a license,
and licenses are not
interchangeable: some permit commercial use outright, some are research-only
or non-commercial, and a few carry a responsible-use clause restricting
specific output regardless of cost. Read the license before building a shot
around a checkpoint.

## The graph is the artefact

The tool for running a model is a node-based workflow engine: a visual graph
of operations connected by wires carrying data. Today's frame isn't what's
worth keeping; the graph is. Save it, and you have
a recipe you can rerun with a new seed or source image for a comparable
result.

## Render time is not shooting time

On the fastest consumer card sold today, a five-second take renders in tens
of seconds on the lighter models and over a minute on the heavier ones;
mid-range hardware measures the same take in minutes. Call it five seconds
of compute per second of footage at the optimistic end — before counting the
takes you throw away. A shot that survives Dailies is rarely attempt one.

## Before class

Install a node-based workflow engine and download one base model plus one
small community finetune, giving two checkpoints to compare on the same
prompt.

## This week's exercise

Generate one five-second clip on default settings, then generate it again
after changing exactly one parameter. Keep both graph files and log both
render times. Bring both clips and graphs, with your timing notes, to
Wednesday's Dailies.
