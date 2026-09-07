// Week 3's screening: show one still at a time with its rung taken off, take
// the reader's call, then put the rung, the prompt and the note back.
//
// Everything this hides is already on the page — with the module blocked the
// whole labelled ladder is there, which is the state this reverts to if any
// piece of it is missing. Nothing is scored and nothing is counted: the panel
// says what the reader called and what the still is, and stops there.

function setUpScreening(root: HTMLElement): void {
  // Written to the page in ladder order; walked in screening order.
  const stills = [...root.querySelectorAll<HTMLElement>("[data-still]")].sort(
    (a, b) => Number(a.dataset.screening) - Number(b.dataset.screening),
  );
  const controls = root.querySelector<HTMLElement>("[data-controls]");
  const reveal = root.querySelector<HTMLButtonElement>("[data-reveal]");
  const next = root.querySelector<HTMLButtonElement>("[data-next]");
  const callBack = root.querySelector<HTMLElement>("[data-call-back]");
  const radios = [...root.querySelectorAll<HTMLInputElement>(".blind-rung__radio")];
  const showLadder = root.querySelector<HTMLButtonElement>("[data-show-ladder]");
  if (!stills.length || !controls || !reveal || !next || !callBack || !radios.length || !showLadder) return;

  let current = 0;

  const show = (index: number): void => {
    current = index;
    stills.forEach((still, at) => {
      still.classList.toggle("is-current", at === index);
      still.classList.remove("is-revealed");
    });
    for (const radio of radios) radio.checked = false;
    callBack.textContent = "";
    // aria-disabled rather than disabled: a disabled button blurs itself, and
    // the reader has just pressed this one (§7).
    reveal.setAttribute("aria-disabled", "false");
  };

  reveal.addEventListener("click", () => {
    if (reveal.getAttribute("aria-disabled") === "true") return;
    const still = stills[current];
    still.classList.add("is-revealed");
    reveal.setAttribute("aria-disabled", "true");
    const called = radios.find((radio) => radio.checked);
    const rung = still.dataset.rung;
    callBack.textContent = called
      ? `You called rung ${called.value}. This is rung ${rung}.`
      : `This is rung ${rung}.`;
  });

  // The screening is a mode, not a replacement: the ladder the page ships is
  // one press away, because comparing five rungs side by side is the thing
  // the ladder is for and a script has no business taking it off the page.
  showLadder.addEventListener("click", () => {
    const screening = root.classList.toggle("is-screening");
    showLadder.setAttribute("aria-pressed", screening ? "false" : "true");
    showLadder.textContent = screening ? "Show the whole ladder" : "Back to the screening";
    if (screening) show(current);
  });

  next.addEventListener("click", () => {
    // Wraps rather than stopping: the five stay reachable in either direction
    // of travel, and a screening that ends in a dead button is a dead button.
    show((current + 1) % stills.length);
  });

  root.classList.add("is-screening");
  controls.hidden = false;
  show(0);
}

function setUpBlindRung(): void {
  const root = document.querySelector<HTMLElement>("[data-blind-rung]");
  if (root) setUpScreening(root);
}

document.addEventListener("astro:page-load", setUpBlindRung);
