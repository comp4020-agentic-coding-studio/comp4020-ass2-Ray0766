// Week 7's graph reader: point at a node, or focus it, and the panel names its
// class, its kind and its inputs.
//
// Everything else on the widget is static — the map, the tier switch (a radio
// group), and the table of every node under each map — so with this module
// blocked the page still reads every graph. What it adds is the one thing a
// picture cannot carry: what a particular node was given.
//
// The map is upgraded rather than shipped interactive. Served, it is a
// `role="img"` picture with a label, which is what it is to a reader with no
// script. Once this runs it becomes a listbox of nodes with roving tabindex,
// so it is one tab stop with arrow keys inside it rather than nineteen tab
// stops in the middle of a lecture.

const NODE = "[data-node]";

function panelFor(root: HTMLElement) {
  const panel = root.querySelector<HTMLElement>("[data-panel]");
  const className = root.querySelector<HTMLElement>("[data-panel-class]");
  const kind = root.querySelector<HTMLElement>("[data-panel-kind]");
  const inputs = root.querySelector<HTMLElement>("[data-panel-inputs]");
  if (!panel || !className || !kind || !inputs) return null;
  return {
    show(node: HTMLElement) {
      panel.hidden = false;
      className.textContent = `${node.dataset.nodeId} · ${node.dataset.classType}`;
      kind.textContent = node.dataset.kindLabel ?? "";
      inputs.textContent = node.dataset.inputs ?? "";
    },
  };
}

function setUpMap(map: SVGElement, show: (node: HTMLElement) => void): void {
  // Left to right, then down: the order the graph is read in, which is not the
  // order the export happens to list its nodes in.
  const nodes = [...map.querySelectorAll<HTMLElement>(NODE)].sort((a, b) => {
    const box = (node: HTMLElement) => node.querySelector("rect")!;
    const ax = Number(box(a).getAttribute("x"));
    const bx = Number(box(b).getAttribute("x"));
    return ax === bx ? Number(box(a).getAttribute("y")) - Number(box(b).getAttribute("y")) : ax - bx;
  });
  if (nodes.length === 0) return;

  map.setAttribute("role", "listbox");
  map.setAttribute("aria-label", "Nodes in this graph");

  let selected = 0;

  const select = (index: number, moveFocus: boolean): void => {
    selected = (index + nodes.length) % nodes.length;
    nodes.forEach((node, at) => {
      const current = at === selected;
      node.setAttribute("aria-selected", current ? "true" : "false");
      node.setAttribute("tabindex", current ? "0" : "-1");
      node.classList.toggle("is-selected", current);
    });
    show(nodes[selected]);
    if (moveFocus) nodes[selected].focus();
  };

  nodes.forEach((node, index) => {
    node.setAttribute("role", "option");
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-selected", "false");
    node.setAttribute(
      "aria-label",
      `${node.dataset.classType}, ${(node.dataset.kindLabel ?? "").toLowerCase()}`,
    );
    node.addEventListener("pointerenter", () => show(node));
    node.addEventListener("focus", () => select(index, false));
    node.addEventListener("click", () => select(index, true));
  });

  map.addEventListener("keydown", (event) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(nodes.length - 1, true);
    else select(selected + step, true);
  });

  select(0, false);
}

function setUpGraphReader(): void {
  const root = document.querySelector<HTMLElement>("[data-graph-reader]");
  if (!root) return;
  // A panel per tier: the tier switch is CSS, so the panel that belongs to the
  // graph on screen is the one that shows with it.
  for (const tier of root.querySelectorAll<HTMLElement>(".graph-reader__tier")) {
    const panel = panelFor(tier);
    const map = tier.querySelector<SVGElement>("[data-map]");
    if (panel && map) setUpMap(map, panel.show);
  }
}

document.addEventListener("astro:page-load", setUpGraphReader);
