const root = document.querySelector<HTMLElement>("[data-three-second-demo]");

if (root) {
  const video = root.querySelector<HTMLVideoElement>(".three-second-demo__video");
  const ring = root.querySelector<SVGElement>("[data-ring]");
  const controls = root.querySelector<HTMLElement>("[data-controls]");
  const playButton = root.querySelector<HTMLButtonElement>("[data-play]");
  const decision = root.querySelector<HTMLElement>("[data-decision]");
  const stayButton = root.querySelector<HTMLButtonElement>("[data-stay]");
  const scrollButton = root.querySelector<HTMLButtonElement>("[data-scroll]");
  const payoff = root.querySelector<HTMLElement>("[data-payoff]");

  if (video && controls && playButton && decision && stayButton && scrollButton && payoff) {
    // Only hide the payoff once the script is confirmed running: with JS
    // off, the caption stays put as the static teaching point.
    payoff.hidden = true;
    controls.hidden = false;

    let started = false;
    let pausedAtThreeSeconds = false;
    let decided = false;

    // A control does not get hidden out from under the person who just
    // pressed it. Chrome answers `hidden` on the focused element by blurring
    // it, `document.activeElement` becomes `<body>`, the focus ring vanishes
    // and a screen reader loses its place — none of which shows up in a
    // screenshot (CLAUDE.md §7). Both buttons here used to do exactly that.
    //
    // So a spent control stays where it is, marked `aria-disabled` (which the
    // theme already styles) and guarded against a second press, which is the
    // pattern CLAUDE.md prescribes over `disabled` for the same reason:
    // `disabled` blurs too.
    const retire = (button: HTMLButtonElement): void => {
      button.setAttribute("aria-disabled", "true");
    };

    playButton.addEventListener("click", () => {
      if (started) return;
      started = true;
      retire(playButton);
      ring?.classList.add("is-active");
      void video.play();
    });

    video.addEventListener("timeupdate", () => {
      if (!pausedAtThreeSeconds && video.currentTime >= 3) {
        pausedAtThreeSeconds = true;
        video.pause();
        // Revealing, not hiding: nothing is focused in here yet, so this
        // takes no keyboard away from anyone. Focus is deliberately not moved
        // onto Stay — the reader asked for a clip, not for the page to grab
        // the cursor three seconds later — so it stays on the Play button
        // they pressed, one Tab away from the pair.
        decision.hidden = false;
      }
    });

    const decide = (): void => {
      if (decided) return;
      decided = true;
      retire(stayButton);
      retire(scrollButton);
      payoff.hidden = false;
      void video.play();
    };

    stayButton.addEventListener("click", decide);
    scrollButton.addEventListener("click", decide);
  }
}
