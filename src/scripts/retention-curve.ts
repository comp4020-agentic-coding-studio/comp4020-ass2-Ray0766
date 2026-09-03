import { CURVE_CAPTIONS, markerPosition, type CurveShape } from "../lib/retention-curve";

const root = document.querySelector<HTMLElement>("[data-retention-curve]");

if (root) {
  const toggle = root.querySelector<HTMLElement>("[data-shape-toggle]");
  const scrubber = root.querySelector<SVGRectElement>("[data-scrubber]");
  const markerDot = root.querySelector<SVGCircleElement>("[data-marker-dot]");
  const markerTime = root.querySelector<SVGTextElement>("[data-marker-time]");
  const caption = root.querySelector<HTMLElement>("[data-caption]");
  const paths = root.querySelectorAll<SVGPathElement>("[data-shape-path]");
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-shape-button]");

  if (toggle && scrubber && markerDot && markerTime && caption && paths.length && buttons.length) {
    toggle.hidden = false;
    scrubber.toggleAttribute("data-hidden", false);

    let activeShape: CurveShape = "sharp";

    const setShape = (shape: CurveShape) => {
      activeShape = shape;
      paths.forEach((path) => {
        path.toggleAttribute("data-hidden", path.dataset.shapePath !== shape);
      });
      buttons.forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.shapeButton === shape ? "true" : "false");
      });
      caption.textContent = `${CURVE_CAPTIONS[shape]} Illustrative curve, not data.`;
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        setShape(button.dataset.shapeButton as CurveShape);
      });
    });

    const showMarker = (time: number) => {
      const { x, y } = markerPosition(activeShape, time);
      markerDot.setAttribute("cx", x.toFixed(1));
      markerDot.setAttribute("cy", y.toFixed(1));
      markerTime.setAttribute("x", x.toFixed(1));
      markerTime.setAttribute("y", (y - 10).toFixed(1));
      markerTime.textContent = `Time: ${Math.round(time)}%`;
      markerDot.classList.add("is-visible");
      markerTime.classList.add("is-visible");
      scrubber.setAttribute("aria-valuenow", String(Math.round(time)));
    };

    const hideMarker = () => {
      markerDot.classList.remove("is-visible");
      markerTime.classList.remove("is-visible");
    };

    const timeFromPointer = (event: PointerEvent): number => {
      const bounds = scrubber.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      return Math.min(100, Math.max(0, ratio * 100));
    };

    scrubber.addEventListener("pointermove", (event) => {
      showMarker(timeFromPointer(event));
    });

    scrubber.addEventListener("pointerleave", hideMarker);

    scrubber.addEventListener("focus", () => {
      showMarker(Number(scrubber.getAttribute("aria-valuenow")) || 50);
    });

    scrubber.addEventListener("blur", hideMarker);

    scrubber.addEventListener("keydown", (event) => {
      const current = Number(scrubber.getAttribute("aria-valuenow")) || 50;
      let next = current;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        next = Math.max(0, current - 5);
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        next = Math.min(100, current + 5);
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = 100;
      } else {
        return;
      }
      event.preventDefault();
      showMarker(next);
    });
  }
}
