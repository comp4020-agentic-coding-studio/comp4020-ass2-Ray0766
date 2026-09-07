// Week 8's DriftAudit: slide the take across the reference it was meant to
// match. Without this module the two stills sit side by side, whole, which is
// the comparison the audit actually asks for — the slider only puts them in
// the same place so the eye has nothing to travel across.
//
// The reveal is carried as `data-wipe` on the pair, in the range input's own
// 5% steps, and the stylesheet holds the stops. Nothing here writes a `style`
// attribute: §9 keeps widget styling where the linters can see it, and every
// other script in this repo drives its visuals through classes and attributes
// for the same reason.

// Names at the top level of a widget script are shared with every other one
// (these are scripts, not modules), so each of them is named for its own
// widget rather than for what it does.
function setUpAuditPair(pair: HTMLElement): void {
  const control = pair.querySelector<HTMLElement>(".drift-audit__control");
  const range = pair.querySelector<HTMLInputElement>("[data-wipe-input]");
  if (!control || !range) return;

  // Only now, with the module confirmed running, do the two stills move on top
  // of each other — a slider that never arrived would have left one of them
  // clipped to nothing.
  pair.classList.add("is-wiping");
  control.hidden = false;

  const apply = () => {
    pair.dataset.wipe = range.value;
  };

  range.addEventListener("input", apply);
  apply();
}

function setUpDriftAudit(): void {
  for (const pair of document.querySelectorAll<HTMLElement>("[data-drift-pair]")) {
    setUpAuditPair(pair);
  }
}

document.addEventListener("astro:page-load", setUpDriftAudit);
