// Swapping the page's two bodies at the 640px breakpoint.
//
// /studio/ has two mutually exclusive compositions: the canvas above 640, the
// plain desk form and the list below it. Which one is live is decided by CSS
// media queries and by two pieces of JavaScript that each ran once, at load —
// and a window dragged across the breakpoint runs neither of them again.
//
// Measured in Chrome, loading at 1920 and resizing to 600: the canvas went
// (media query), the desk form was still carrying the `hidden` attribute with
// an empty week selector (desk-form.ts had decided at load that it was not
// needed), the static list was still hidden (the island hides it when it
// mounts), and `document.activeElement` was `<body>` and stayed there all the
// way back up. The reader was left with a nav, a status bar and nothing else.
//
// So the swap is symmetric and happens on the crossing, not only at load.
// desk-form.ts now mounts on either side; this module does the other two
// halves: which body is showing, and who has the keyboard.

const PHONE = "(max-width: 640px)";

const stage = () => document.querySelector<HTMLElement>(".studio-canvas__stage");
const form = () => document.querySelector<HTMLElement>("[data-studio-form]");
const fallback = () => document.querySelector<HTMLElement>("[data-studio-fallback]");

/** The first thing on the phone's desk a keyboard can hold. */
const formEntry = () => form()?.querySelector<HTMLElement>("select, textarea, button");

function setup(): void {
  const query = window.matchMedia(PHONE);
  if (!stage() && !fallback()) return;

  // Where the reader was, remembered as they go: by the time the media query
  // fires the browser is about to take focus off an element that is being
  // hidden, and there is nothing left to ask afterwards.
  let wasInStage = false;
  let wasInForm = false;
  /** Whether the list was showing before the phone took it over, so crossing
   *  back up restores what the reader had rather than a decision of ours. */
  let listWasHidden: HTMLElement["hidden"] | undefined;

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    wasInStage = stage()?.contains(target) ?? false;
    wasInForm = form()?.contains(target) ?? false;
  });

  query.addEventListener("change", () => {
    const cameFromStage = wasInStage;
    const cameFromForm = wasInForm;
    const list = fallback();

    // Below the breakpoint the list is the page, not an option, so it is
    // shown whatever the island did to it on mount. Above it, the reader gets
    // back whichever state they were in.
    if (list) {
      if (query.matches) {
        listWasHidden = list.hidden;
        list.hidden = false;
      } else if (listWasHidden !== undefined) {
        list.hidden = listWasHidden;
        listWasHidden = undefined;
      }
    }

    // Two frames, because `focus()` on an element that is still `display:
    // none` does nothing at all and the new composition is not laid out yet.
    //
    // The trigger is the old region being gone, not `document.activeElement`
    // being `<body>`: Chrome drops the focus during the style recalc that
    // hides the stage, which happens after the media query's own event, so at
    // the moment this asks, focus is still on an element about to vanish.
    const handOver = () => {
      if (query.matches && cameFromStage && !stage()?.checkVisibility()) {
        formEntry()?.focus();
        wasInStage = false;
      } else if (!query.matches && cameFromForm && !form()?.checkVisibility()) {
        stage()?.focus();
        wasInForm = false;
      }
    };

    window.requestAnimationFrame(() => window.requestAnimationFrame(handOver));
  });
}

document.addEventListener("astro:page-load", setup);
