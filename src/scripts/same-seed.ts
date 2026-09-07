// Week 2's SameSeed: switch one pair between the two addresses of the same
// recording. The point is that nothing moves, so the playhead is carried
// across the swap — a take that jumped back to 0 would look like a reload
// rather than like the same file answering to a second name.
//
// With this module blocked the switch never appears and the page still names
// both addresses under a playable take, which is the whole teaching point.

function setUpSeedPair(pair: HTMLElement): void {
  const swtch = pair.querySelector<HTMLElement>("[data-switch]");
  const video = pair.querySelector<HTMLVideoElement>("[data-video]");
  const buttons = [...pair.querySelectorAll<HTMLButtonElement>("[data-address]")];
  if (!swtch || !video || buttons.length < 2) return;

  swtch.hidden = false;

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const address = button.dataset.address;
      if (!address || video.src.endsWith(address)) return;

      const at = video.currentTime;
      const playing = !video.paused && !video.ended;
      video.src = address;
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.currentTime = at;
          if (playing) void video.play();
        },
        { once: true },
      );
      // `load()` is implicit on a src change, but calling it makes the swap
      // happen now rather than at the browser's leisure with preload="none".
      video.load();

      for (const other of buttons) {
        other.setAttribute("aria-pressed", other === button ? "true" : "false");
      }
      // The button stays the element that was pressed: nothing here disables
      // it or re-renders the group, so focus never has to be handed back.
    });
  }
}

function setUpSameSeed(): void {
  for (const pair of document.querySelectorAll<HTMLElement>("[data-same-seed-pair]")) {
    setUpSeedPair(pair);
  }
}

document.addEventListener("astro:page-load", setUpSameSeed);
