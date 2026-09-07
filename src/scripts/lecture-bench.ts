// The generator weeks' bench: as the reader moves down the prose, the rung
// standing beside them in the rail is the one the section in front of them is
// arguing about.
//
// This is the only thing the script does. The rail (src/components/lecture/
// LadderRail.astro) lists every rung with or without it, and the ladder itself
// is in the prose either way, so a reader with the script blocked loses a
// place-marker, not a word of the lecture.
//
// Runs on `astro:page-load` rather than at module scope: the theme enables
// Astro's ClientRouter, so walking week 3 → week 4 with the pager swaps the
// document without re-executing an already-loaded module.

// Keep in step with the bench breakpoint in src/styles/lecture-phases.css,
// which explains why it is 1440 and not something rounder. Below it the rail
// isn't on screen, so there is nothing to mark.
const BENCH_MEDIA = "(min-width: 1440px)";
// The current rung is the last one whose tag has passed this far down the
// viewport: far enough that its heading has actually arrived, not so far that
// a section counts as current while its heading is still off screen.
const CURRENT_LINE = 0.4;

// A client-side navigation swaps the document out from under a running
// observer, so each set-up tears the previous one down first rather than
// leaving it watching elements that have left the page.
let teardown: (() => void) | null = null;

function setUpBench(): void {
  teardown?.();
  teardown = null;

  const main = document.querySelector<HTMLElement>('main[data-phase="generators"]');
  const rail = main?.querySelector<HTMLElement>("[data-ladder-rail]");
  const rungs = main ? [...main.querySelectorAll<HTMLElement>("[data-rung]")] : [];
  if (!main || !rail || rungs.length === 0) return;

  const rows = [...rail.querySelectorAll<HTMLElement>("[data-tier]")];
  const wide = window.matchMedia(BENCH_MEDIA);
  let observer: IntersectionObserver | null = null;

  const mark = (tier: string | null): void => {
    for (const row of rows) row.classList.toggle("is-current", row.dataset.tier === tier);
  };

  const update = (): void => {
    const line = window.innerHeight * CURRENT_LINE;
    let current = rungs[0];
    for (const rung of rungs) {
      if (rung.getBoundingClientRect().top < line) current = rung;
    }
    mark(current.dataset.rung ?? null);
  };

  const start = (): void => {
    if (observer) return;
    // A band across the top 40% of the viewport: an entry fires whenever a
    // rung tag crosses into or out of it, which is exactly when the answer to
    // "which rung is current" can change.
    observer = new IntersectionObserver(update, { rootMargin: "0px 0px -60% 0px" });
    for (const rung of rungs) observer.observe(rung);
    update();
  };

  const stop = (): void => {
    observer?.disconnect();
    observer = null;
    mark(null);
  };

  const onChange = (): void => {
    if (wide.matches) start();
    else stop();
  };

  wide.addEventListener("change", onChange);
  if (wide.matches) start();

  teardown = () => {
    stop();
    wide.removeEventListener("change", onChange);
  };
}

document.addEventListener("astro:page-load", setUpBench);
