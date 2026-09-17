export {};

// Keep the presentation's own slide state, with controls a reader can see.
// Reveal's documented postMessage API also works when the integration owns
// the instance. There is no second slide index or copy of the slide content.
const root = document.querySelector<HTMLElement>(".reveal");
const routeData = document.querySelector<HTMLElement>("[data-deck-routes]");
const printing = new URLSearchParams(location.search).has("print-pdf");

if (root && routeData && !printing) {
  const routes: { deck: string; lecture: string; label: string }[] = JSON.parse(routeData.getAttribute("data-deck-routes") || "[]");
  const route = routes.find((entry) => entry.deck === location.pathname);
  if (route) {
    const toolbar = document.createElement("nav");
    toolbar.className = "deck-toolbar";
    toolbar.setAttribute("aria-label", "Slide navigation");
    const back = document.createElement("a");
    back.href = route.lecture;
    back.textContent = route.label;
    const paging = document.createElement("div");
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "← Previous";
    const count = document.createElement("output");
    count.setAttribute("aria-label", "Current slide");
    count.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next →";
    paging.append(previous, count, next);
    toolbar.append(back, paging);
    document.body.append(toolbar);
    document.documentElement.classList.add("has-deck-toolbar");

    const command = (method: string, args: unknown[] = []) =>
      window.postMessage(JSON.stringify({ method, args }), location.origin);
    const slides = () => Array.from(root!.querySelectorAll<HTMLElement>(".slides > section"));
    function update() {
      const all = slides();
      const index = all.findIndex((slide) => slide.classList.contains("present"));
      if (index < 0) return;
      count.textContent = `${index + 1} / ${all.length}`;
      // aria-disabled keeps the reader's keyboard on the button they pressed.
      previous.setAttribute("aria-disabled", String(index === 0));
      next.setAttribute("aria-disabled", String(index === all.length - 1));
      root!.scrollTop = 0;
    }
    previous.addEventListener("click", () => {
      if (previous.getAttribute("aria-disabled") !== "true") command("prev");
    });
    next.addEventListener("click", () => {
      if (next.getAttribute("aria-disabled") !== "true") command("next");
    });
    const phone = matchMedia("(max-width: 600px)");
    function fit() {
      // A vertical reading gesture must scroll the current slide on a phone.
      command("configure", [{ touch: !phone.matches }]);
      command("layout");
    }
    root.addEventListener("ready", () => { update(); fit(); });
    root.addEventListener("slidechanged", update);
    phone.addEventListener("change", fit);
    if (root.classList.contains("ready")) { update(); fit(); }
  }
}
