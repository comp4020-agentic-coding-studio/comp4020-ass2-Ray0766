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
you're actually working with, where its models come from, how you'll keep a
record of what you did, and how long any of this actually takes. This
lecture covers all four; skipping it means finding these limits by
accident, mid-semester, on a deadline.

## The budget question

On a consumer graphics card, the number that decides what you can do is
VRAM — the memory built into the card — not its price, its marketing name,
or its processor speed. VRAM is a hard ceiling: it sets the largest model
you can load, the resolution you can generate at, and the longest clip you
can produce in one pass. Less VRAM does not mean slower; past a point, it
means the model does not run at all. Know your card's VRAM figure before
planning a shot around a model you've only read about.

## Where the models come from

The weight files a workflow engine loads come from public model
repositories: one base release, then a long tail of community finetunes
built on top of it. Every file carries a license, and licenses are not
interchangeable: some permit commercial use outright, some are
research-only or non-commercial, and a few carry a responsible-use clause
restricting specific output regardless of what you're paying to run them.
Read the license before building a shot, an assignment, or a season around
a checkpoint.

## The graph is the artefact

The tool for running a model is a node-based workflow engine: a visual
graph where each box is one operation — load a model, sample an image,
upscale, interpolate — and each wire carries data between them. Today's
frame isn't what's worth keeping; the graph is. Save it, and you have a
recipe you can rerun with a new seed, prompt, or source image, and get a
comparable result on demand.

## Before class

Install a node-based workflow engine and download one base model plus one
small community finetune of it, so you have two checkpoints to compare on
the same prompt.

## This week's exercise

Generate one five-second clip on default settings, then generate it again
after changing exactly one parameter. Keep both graph files, and note in one
line each how long the two renders actually took on your hardware. Bring
both clips, both graphs, and your timing notes to Wednesday's Dailies.
