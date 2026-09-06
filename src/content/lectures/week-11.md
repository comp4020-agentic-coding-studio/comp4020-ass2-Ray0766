---
title: "Production, Week Two"
description:
  Finishing an episode — assembling the queue's shots into one cut, sound
  and captions, loudness standards, and the delivery spec a platform
  actually expects.
week: 11
date: 2027-05-17
teachers:
  - vera-lin
related:
  - sessions/week-11
draft: false
---

The queue produces shots; it does not produce an episode. Assembly is
where every shot that cleared the quality gate gets cut into one
sequence, and this lecture is entirely about the three things that turn
a folder of approved clips into a piece someone can actually watch: the
assembly itself, the sound and captions carried through it, and the
delivery spec that gets it onto a platform without the platform
mangling it on the way in.

## Assembly is not re-litigating the gate

A shot that passed the quality gate does not get re-judged during
assembly on its own merits; assembly only decides order, pacing, and
where a cut lands relative to a beat. Reopening a gate decision at this
stage means the gate wasn't doing its job earlier, and it's usually
faster to flag that for next time than to relitigate one shot now.

[The Cut](/cut/) is exactly this decision at a small enough scale to
try by hand: four gated clips, reordered, nothing about any single shot
re-judged in the process.

## Sound and captions, carried through

Dialogue clarity and captions are not a separate pass bolted on at the
end; they're properties every shot in the queue was already supposed to
carry, and assembly's job is making sure nothing got lost matching cuts
against each other. A caption that's present but out of sync, or a
dialogue line that reads clearly in isolation but gets buried once music
is layered under it, is an assembly failure even though no single shot
caused it alone.

## Loudness is a standard, not a feeling

Loudness gets measured against a published broadcast standard rather
than judged by ear, because "sounds about right" varies between
speakers, rooms, and the person listening. Matching a target loudness
level means an episode won't clip on a phone speaker or vanish next to
whatever plays before or after it in a feed — a technical requirement
this course treats the same way it treats a licence clause: non-negotiable,
and checked, not assumed.

## Delivery is a spec, not a save button

Exporting a finished cut means matching whatever a platform's delivery
spec actually asks for — resolution, frame rate, container format,
caption format — rather than exporting on default settings and hoping
it's close enough. A cut that looks correct on your own machine and
fails a platform's delivery check has not shipped; it's failed at the
very last step of a nine-week process, which is the most expensive place
in the whole pipeline to fail.

## Before class

Bring the three shots that cleared the quality gate together with any
notes on where their sound or captions still need work before assembly.

## This week's exercise

Assemble the season's episode: cut the gated shots into one sequence,
check loudness against the published standard, confirm captions are
present and in sync, and export to the platform's delivery spec. This is
the pilot's own production pass, so bring the finished pilot itself to
Wednesday's Dailies.

## Reading

- [EBU R128](https://tech.ebu.ch/publications/r128) — the loudness
  standard this lecture's assembly pass gets checked against.
- [Media Accessibility](https://www.w3.org/WAI/media/av/) — on why
  captions are a delivery requirement, not a nice-to-have layered on
  top.
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html) — the
  tool most delivery-spec exports actually run through.
