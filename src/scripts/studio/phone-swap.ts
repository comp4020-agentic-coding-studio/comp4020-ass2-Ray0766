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

import { deskSide } from "./desk-handoff";

const PHONE = "(max-width: 640px)";

const stage = () => document.querySelector<HTMLElement>(".studio-canvas__stage");
const form = () => document.querySelector<HTMLElement>("[data-studio-form]");
const fallback = () => document.querySelector<HTMLElement>("[data-studio-fallback]");

/** The whole wide composition, not just the board. The desk is a *sibling* of
 *  the stage inside this layout, which is what made the focus hand-over below
 *  dead code for as long as it existed: someone editing the prompt was never
 *  "in the stage", so `cameFromStage` was false on every crossing that
 *  mattered and the branch that hands the keyboard over never once ran. */
const canvasSide = () => document.querySelector<HTMLElement>(".studio-canvas__layout");

/** The first thing on the phone's desk a keyboard can hold. */
const formEntry = () => form()?.querySelector<HTMLElement>("select, textarea, button");

function setup(): void {
  const query = window.matchMedia(PHONE);
  if (!stage() && !fallback()) return;

  // Where the reader was, remembered as they go: by the time the media query
  // fires the browser is about to take focus off an element that is being
  // hidden, and there is nothing left to ask afterwards.
  let wasInCanvasSide = false;
  let wasInForm = false;
  /** Whether the list was showing before the phone took it over, so crossing
   *  back up restores what the reader had rather than a decision of ours. */
  let listWasHidden: HTMLElement["hidden"] | undefined;

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    wasInCanvasSide = canvasSide()?.contains(target) ?? false;
    wasInForm = form()?.contains(target) ?? false;
  });

  query.addEventListener("change", () => {
    const cameFromCanvasSide = wasInCanvasSide;
    const cameFromForm = wasInForm;
    const list = fallback();

    // Read now, write two frames from now. The side going out still holds its
    // week, tier and prompt at this instant; the side coming in may not exist
    // yet, because desk-form.ts mounts the phone desk on its own listener for
    // the same media query and the order the two listeners run in is not ours
    // to decide. Reading early and applying late makes that order irrelevant.
    const carried = deskSide(query.matches ? "canvas" : "phone")?.read();

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
      // The week, the tier and the prompt, unconditionally: whether the reader
      // had the keyboard in the desk or was only reading, the composition
      // arriving should be showing what the one leaving was showing.
      if (carried) deskSide(query.matches ? "phone" : "canvas")?.apply(carried);

      if (query.matches && cameFromCanvasSide && !stage()?.checkVisibility()) {
        formEntry()?.focus();
        wasInCanvasSide = false;
      } else if (!query.matches && cameFromForm && !form()?.checkVisibility()) {
        stage()?.focus();
        wasInForm = false;
      }
    };

    window.requestAnimationFrame(() => window.requestAnimationFrame(handOver));
  });
}

document.addEventListener("astro:page-load", setup);
