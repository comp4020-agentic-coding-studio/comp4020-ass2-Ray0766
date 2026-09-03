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

    let pausedAtThreeSeconds = false;

    playButton.addEventListener("click", () => {
      playButton.hidden = true;
      ring?.classList.add("is-active");
      video.play();
    });

    video.addEventListener("timeupdate", () => {
      if (!pausedAtThreeSeconds && video.currentTime >= 3) {
        pausedAtThreeSeconds = true;
        video.pause();
        decision.hidden = false;
      }
    });

    const decide = () => {
      decision.hidden = true;
      payoff.hidden = false;
      video.play();
    };

    stayButton.addEventListener("click", decide);
    scrollButton.addEventListener("click", decide);
  }
}
