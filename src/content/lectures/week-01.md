---
title: The Rig
description:
  Setting up the rig for the semester — a VRAM budget or a credit budget,
  where model weights and their licences come from, and the graph or the
  request log as the artefact that survives the render.
week: 1
date: 2027-02-22
teachers:
  - vera-lin
slides: /decks/week-01/
related:
  - sessions/week-01
draft: false
---

Every shot this semester comes out of a rig, and a rig is one of exactly
two things: a graphics card with a VRAM ceiling, or an account with a
credit balance. Neither is the legitimate one — a booked slot on the
school's shared card and a metered API key are both rigs, and this course
treats them as interchangeable inputs to the same discipline. What doesn't
change between them is what has to be tracked: where the weights or the
model came from, what licence governs the output, and a record detailed
enough that today's result can be found again next week.

## The two shapes of a budget

A local rig is bounded by VRAM, not by price or processor speed — VRAM
sets the largest model, the highest resolution, and the longest clip a
single pass can produce. Running out of it doesn't mean slower; past a
point, it means the model does not run at all. An API rig is bounded by a
credit balance instead: no ceiling on model size, but every call has a
metered cost, and a workflow that loops without a limit burns through a
semester's budget in an afternoon. Know which number is yours before
planning a shot around a model you've only read about.

## Where the weights, or the model, come from

Local model weights come from public repositories — one base release,
then a long tail of community finetunes built on top of it — and every
file carries a licence that is not interchangeable with any other: some
permit commercial use outright, some are research-only or
non-commercial, and a few carry a responsible-use clause restricting
specific output regardless of what was paid for access. An API model
publishes the same information differently, as terms of service rather
than a licence file, but the obligation to read it before building a shot
around it is identical.

## The artefact is the record, not the frame

On a local rig, the thing worth keeping is the workflow graph: a
node-based description of the operations that produced a frame, saved so
the same recipe runs again with a new seed for a comparable result. On an
API rig there's no graph to save, but there is a request log — the exact
parameters sent and the response received — and it does the same job.
Either way, today's frame is not the point. What's worth keeping is
whatever lets someone else rerun the decision that produced it.

## Render time is not shooting time

On the fastest consumer card sold today, a five-second take renders in
tens of seconds on the lighter models and over a minute on the heavier
ones; mid-range hardware measures the same take in minutes, and an API
call adds queue time on top of its metered cost. Call it five seconds of
compute — or a few cents — per second of footage, at the optimistic end,
before counting the takes thrown away. A shot that survives Dailies is
rarely attempt one, on either kind of rig.

## Before class

Pick one rig and commit to it: install a local workflow engine and
download one base model plus one small community finetune, or open an
account with a generative video API and note its per-call cost. Either
way, arrive with two comparable checkpoints or settings to test against
each other.

## This week's exercise

Generate one five-second clip on default settings, then generate it again
after changing exactly one parameter. Keep both graph files or both
request logs, and log both render times and, if relevant, both costs.
Bring both clips, their graphs or logs, and your timing notes to
Wednesday's Dailies.

## Reading

- [ComfyUI documentation](https://docs.comfy.org/) — the reference for
  the graph you'll be saving all semester, not just this week.
- [Hugging Face: repository licences](https://huggingface.co/docs/hub/repositories-licenses)
  — what a model's licence field actually restricts, before you build a
  shot around a checkpoint.
- [Hugging Face: OpenRAIL](https://huggingface.co/blog/open_rail) — the
  responsible-use clause behind a lot of the checkpoints you'll download
  this semester.
