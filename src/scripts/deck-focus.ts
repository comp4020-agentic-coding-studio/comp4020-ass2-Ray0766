// Reveal keeps every slide in the DOM. A slide that isn't current is painted
// out, never removed, so sequential focus walks straight through pages nobody
// can see: tabbing into week 1 from the address bar landed on a link in slide
// 3 and never visited slide 1 at all.
//
// `inert` is the one property that takes a subtree out of the tab order and
// out of the accessibility tree together, so a screen reader stops reading
// ahead as well. It goes on the sections rather than on the links, because a
// slide is the unit Reveal shows and hides.

const reveal = document.querySelector<HTMLElement>(".reveal");

// `?print-pdf` lays every slide out at once for export. There is no current
// slide to be the exception, and nothing to tab through either.
const printing = new URLSearchParams(location.search).has("print-pdf");

function slideSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".reveal .slides section"));
}

function confineFocusToCurrentSlide() {
  // `.present` is on the current slide and, inside a vertical stack, on the
  // stack that holds it --- so one pass over the sections at both levels
  // leaves exactly the current slide reachable with its ancestors open. Its
  // fragments are untouched: Reveal hides an unrevealed one with
  // `visibility: hidden`, which is already out of the tab order, and a
  // revealed one has to stay in it.
  for (const section of slideSections()) section.inert = !section.classList.contains("present");
}

function releaseEverySlide() {
  // Overview (Esc) puts every slide on screen at once and expects arrow keys
  // and clicks to reach them, so the confinement lifts while it is up.
  for (const section of slideSections()) section.inert = false;
}

if (reveal && !printing) {
  // Reveal dispatches these on the .reveal wrapper. `ready` covers first paint
  // and the deep link --- #/7 opens on slide 7, not on slide 1.
  reveal.addEventListener("ready", confineFocusToCurrentSlide);
  reveal.addEventListener("slidechanged", confineFocusToCurrentSlide);
  reveal.addEventListener("overviewshown", releaseEverySlide);
  reveal.addEventListener("overviewhidden", confineFocusToCurrentSlide);
  // If Reveal finished initialising before this module ran, `ready` has been
  // and gone; the class it leaves on the wrapper is the record of it.
  if (reveal.classList.contains("ready")) confineFocusToCurrentSlide();
}
