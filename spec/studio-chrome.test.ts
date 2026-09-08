// The Studio's chrome after it stopped being a panel: two floating clusters
// over the stage, four controls always on screen instead of nine, and the
// other four behind one popover.
//
// The canvas is a `client:visible` island, so none of this is in the built
// HTML — these read the modules the browser is handed. Which means CLAUDE.md
// §7 applies with force: a `.includes("More")` here would be fed by this
// file's own comments and by every `querySelector` string in the module. So
// nothing below matches a bare word. The popover is found by its marker
// attribute, sliced out by counting its own tags, and the controls are
// asserted to be inside that slice and absent from the rest of the toolbar.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const canvas = source("src/components/studio/StudioCanvas.tsx");

/** The JSX element carrying `marker`, from its opening `<tag` to the `</tag>`
 *  that closes it, by counting opens and closes rather than trusting
 *  indentation. Returns undefined when nothing carries the marker, which is
 *  what makes deleting the element a failure rather than a pass. */
function elementWith(text: string, marker: string, tag = "div"): string | undefined {
  const at = text.indexOf(marker);
  if (at === -1) return undefined;
  const open = text.lastIndexOf(`<${tag}`, at);
  if (open === -1) return undefined;
  const openTag = new RegExp(`<${tag}[\\s>]`, "g");
  const closeTag = new RegExp(`</${tag}>`, "g");
  let depth = 0;
  let cursor = open;
  while (cursor < text.length) {
    openTag.lastIndex = cursor;
    closeTag.lastIndex = cursor;
    const nextOpen = openTag.exec(text);
    const nextClose = closeTag.exec(text);
    if (!nextClose) return undefined;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + 1;
      continue;
    }
    depth -= 1;
    if (depth === 0) return text.slice(open, nextClose.index + nextClose[0].length);
    cursor = nextClose.index + 1;
  }
  return undefined;
}

/** The body of a `const <name> = useCallback((…) => { … }` declaration, by
 *  counting braces from the arrow. */
function callbackBody(text: string, name: string): string | undefined {
  const at = text.indexOf(`const ${name} = useCallback(`);
  if (at === -1) return undefined;
  const brace = text.indexOf("{", text.indexOf("=>", at));
  if (brace === -1) return undefined;
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(brace, i + 1);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 1. The More popover: it exists, it holds the four demoted controls, and it
//    can be worked without a pointer.
//
// Seen red first, three ways, each bug injected into StudioCanvas.tsx and
// reverted:
//   - panel deleted (the four controls put back in the toolbar):
//     "no element carries data-studio-more-panel: expected undefined to be defined"
//   - Escape branch removed from onMoreKeyDown:
//     "Escape does not close the popover: expected false to be true"
//   - ArrowUp/ArrowLeft branch removed:
//     "the arrows do not walk the popover both ways: expected false to be true"
// ---------------------------------------------------------------------------

describe("the More popover holds the four demoted controls and answers the keyboard", () => {
  const panel = elementWith(canvas, "data-studio-more-panel");
  const toolbar = elementWith(canvas, 'role="toolbar"');

  const DEMOTED = ["Show sources", "Fit board", "Download", "Clear canvas"];
  const ALWAYS = ["Load the whole rig", "Compare", "More"];

  it("is in the module, as an element and not just as a word", () => {
    expect(panel, "no element carries data-studio-more-panel").toBeDefined();
    expect(toolbar, "no element carries role=toolbar").toBeDefined();
    // The popover is inside the toolbar it belongs to, not floating loose.
    expect(toolbar!.includes("data-studio-more-panel"), "the popover is not inside the toolbar").toBe(true);
  });

  it("renders only when it is open, and says so on the control that opens it", () => {
    const opener = /<button[^>]*\sdata-studio-more[\s>]/.test(canvas);
    expect(opener, "no button carries data-studio-more").toBe(true);
    expect(/aria-expanded=\{moreOpen\}/.test(canvas), "the opener does not publish its state").toBe(true);
    expect(/\{moreOpen \? \(/.test(canvas), "the panel is not gated on moreOpen").toBe(true);
  });

  it("holds every demoted control, and the toolbar holds none of them", () => {
    const outsideThePanel = toolbar!.replace(panel!, "");
    for (const label of DEMOTED) {
      expect(panel!.includes(label), `${label} is not in the popover`).toBe(true);
      expect(outsideThePanel.includes(label), `${label} is still on screen at rest`).toBe(false);
    }
  });

  it("leaves the three that stay on screen where they are", () => {
    const outsideThePanel = toolbar!.replace(panel!, "");
    for (const label of ALWAYS) {
      expect(outsideThePanel.includes(label), `${label} is no longer on the toolbar`).toBe(true);
    }
  });

  it("closes on Escape and gives the ring back to the control that opened it", () => {
    const walk = callbackBody(canvas, "onMoreKeyDown");
    const close = callbackBody(canvas, "closeMore");
    expect(walk, "onMoreKeyDown is gone").toBeDefined();
    expect(close, "closeMore is gone").toBeDefined();
    expect(/event\.key === "Escape"[\s\S]{0,240}closeMore\(\)/.test(walk!), "Escape does not close the popover").toBe(
      true,
    );
    // Not <body>: the button that opened it is where the reader was.
    expect(/moreButton\.current\?\.focus\(\)/.test(close!), "closing does not restore focus to More").toBe(true);
    expect(/setMoreOpen\(false\)/.test(close!), "closing does not close it").toBe(true);
  });

  it("walks its items with the arrows, both ways, off the live DOM", () => {
    const walk = callbackBody(canvas, "onMoreKeyDown")!;
    const forward = /"ArrowDown" \|\| event\.key === "ArrowRight"/.test(walk);
    const back = /"ArrowUp" \|\| event\.key === "ArrowLeft"/.test(walk);
    expect(forward, "the arrows do not walk the popover forwards").toBe(true);
    expect(back, "the arrows do not walk the popover both ways").toBe(true);
    // Read from the panel each press, because Download and Clear canvas each
    // replace themselves with a confirm pair while the panel is open.
    expect(
      /morePanel\.current\?\.querySelectorAll<HTMLElement>\("button, a"\)/.test(walk),
      "the walk uses a written-out list rather than what is rendered",
    ).toBe(true);
    expect(/items\[next\]\?\.focus\(\)/.test(walk), "the walk does not move focus").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The zoom pill: four controls, each with a label a screen reader can use
//    and a title a pointer can hover, and the shortcuts still named.
// ---------------------------------------------------------------------------

describe("the zoom pill carries its own labels", () => {
  const pill = elementWith(canvas, 'aria-label="Zoom"');

  it("is four labelled controls on one pill", () => {
    expect(pill, "no element carries the zoom pill").toBeDefined();
    const buttons = pill!.match(/<button/g) ?? [];
    expect(buttons.length, "the pill is not four controls").toBe(4);
    // Scoped to the buttons: the group element carries an aria-label of its
    // own, and counting that would let a control ship without one.
    const controls = pill!.split("<button").slice(1);
    expect(controls.length, "the pill is not four controls").toBe(4);
    for (const control of controls) {
      const head = control.slice(0, control.indexOf(">"));
      expect(/\saria-label=/.test(head), `a control on the pill has no aria-label: ${head.trim().slice(0, 60)}`).toBe(
        true,
      );
      expect(/\stitle=/.test(head), `a control on the pill has no title: ${head.trim().slice(0, 60)}`).toBe(true);
    }
  });

  it("still names the two keyboard shortcuts the stage answers", () => {
    expect(/title="Return to 100% \(Shift\+0\)"/.test(pill!), "Shift+0 is no longer named").toBe(true);
    expect(/title="Fit every board on screen \(Shift\+1\)"/.test(pill!), "Shift+1 is no longer named").toBe(true);
    // And the stage still answers them.
    expect(/event\.shiftKey && event\.key === "!"/.test(canvas), "Shift+1 no longer fits").toBe(true);
    expect(/event\.shiftKey && event\.key === "\)"/.test(canvas), "Shift+0 no longer returns to 100%").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. A card says nothing on screen until it is picked up — and still says all
//    of it to a screen reader, always.
//
// The failure this guards against is the easy one: "hide the caption" written
// as `display: none`, which is not hiding, it is deleting. The take id is the
// address of a recorded file and the one thing on the card that cannot be
// inferred from the picture, so it has to survive being off screen.
//
// Seen red first, three ways, each bug injected into the real files and
// reverted:
//   - `display: none` added to the hiding rule:
//     "studio-canvas.css takes .studio-card__foot out of the accessibility
//      tree; off screen is not the same as gone: expected [ 'display: none;' ]
//      to deeply equal []"
//   - the clip-path recipe swapped for `visibility: hidden`: the same message
//     with 'visibility: hidden;' in it, and
//     "the caption is not hidden with the visually-hidden recipe: expected
//      false to be true"
//   - the take id gated on selection in CardNodes.tsx
//     (`{selected ? <p …>{node.takeId}</p> : null}`):
//     "TakeCard renders something only when it is selected: expected true to
//      be false"
// ---------------------------------------------------------------------------

describe("a card's naming is hidden from the eye and never from the reader", () => {
  const cards = source("src/components/studio/CardNodes.tsx");
  const css = source("src/styles/studio-canvas.css");

  /** The JSX a component returns: from its own top-level `return (` to the
   *  matching `);`. Anchored to the component body's two-space indent, because
   *  an effect's `return () => cleanup()` also reads as "return (" and
   *  matching the first one found the wrong half of the file. */
  function returned(name: string): string | undefined {
    const at = cards.indexOf(`export function ${name}(`);
    if (at === -1) return undefined;
    const open = cards.indexOf("\n  return (", at);
    if (open === -1) return undefined;
    let depth = 0;
    for (let i = cards.indexOf("(", open); i < cards.length; i += 1) {
      if (cards[i] === "(") depth += 1;
      if (cards[i] === ")") {
        depth -= 1;
        if (depth === 0) return cards.slice(open, i + 1);
      }
    }
    return undefined;
  }

  const take = returned("TakeCard");
  const input = returned("InputCard");

  it("renders the take id and the input's label with no condition on them", () => {
    expect(take, "TakeCard is gone").toBeDefined();
    expect(input, "InputCard is gone").toBeDefined();
    expect(take!.includes("{node.takeId}"), "the take id is no longer on the card").toBe(true);
    expect(input!.includes("{node.label}"), "the input's label is no longer on the card").toBe(true);
    // The whole point: nothing in what these return branches on selection, so
    // there is no state in which the DOM is missing the address.
    expect(take!.includes("selected"), "TakeCard renders something only when it is selected").toBe(false);
    expect(input!.includes("selected"), "InputCard renders something only when it is selected").toBe(false);
  });

  // Rules are split on the brace rather than searched as text, so a comment
  // that happens to say "display: none" cannot feed this (CLAUDE.md §7).
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    body: match[2],
  }));

  const NAMING = [".studio-card__foot", ".studio-card__kind", ".studio-card__address"];
  const REMOVES = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|content-visibility\s*:\s*hidden)\s*;/g;

  for (const klass of NAMING) {
    it(`never takes ${klass} out of the accessibility tree`, () => {
      const offenders = rules
        .filter((rule) => rule.selector.includes(klass))
        .flatMap((rule) => [...rule.body.matchAll(REMOVES)].map((match) => match[0].trim().replace(/^;\s*/, "")));
      expect(
        offenders,
        `studio-canvas.css takes ${klass} out of the accessibility tree; off screen is not the same as gone`,
      ).toEqual([]);
    });
  }

  it("hides the caption with the clip recipe, and puts it back on selection", () => {
    const hide = rules.find((rule) => /^\.studio-card__foot,/m.test(rule.selector));
    expect(hide, "nothing hides the card's foot any more").toBeDefined();
    expect(/clip-path:\s*inset\(50%\)/.test(hide!.body), "the caption is not hidden with the visually-hidden recipe").toBe(
      true,
    );
    const show = rules.find(
      (rule) => rule.selector.includes(".selected") && rule.selector.includes(".studio-card__foot"),
    );
    expect(show, "selecting a card no longer shows what it is").toBeDefined();
    expect(/clip-path:\s*none/.test(show!.body), "the selected card does not un-clip its caption").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The status bar is one line, and stays one line.
//
// It is the floor of the stage: --studio-status-height is subtracted from the
// viewport to size the canvas and again to hold the canvas's space open before
// the island lands, so the number and the bar have to agree or the page jumps.
// A bar that is allowed to wrap does not have one height at all.
//
// Seen red first, three ways, each bug injected into studio-shell.css and
// reverted:
//   - the token put back to 3.5rem:
//     "the status bar is 3.5rem; one line is 2.5rem at the most: expected 3.5
//      to be less than or equal to 2.5"
//   - `flex-wrap: wrap` put back on .studio-status:
//     "the status bar may wrap onto a second line: expected true to be false"
//   - the credit's `white-space: nowrap` removed:
//     "the credit line is not clipped to one line: expected false to be true"
// ---------------------------------------------------------------------------

describe("the status bar is one line under the stage", () => {
  const shell = source("src/styles/studio-shell.css");

  const rules = [...shell.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    body: match[2],
  }));

  function rule(selector: string) {
    return rules.find((candidate) => candidate.selector === selector);
  }

  const MAX_REM = 2.5;

  it(`is at most ${MAX_REM}rem tall, by the one number three things read`, () => {
    // Read out of the declaration, not out of the comment above it: the value
    // is captured from a `--studio-status-height:` at the start of a line.
    const declared = /^\s*--studio-status-height:\s*([\d.]+)rem\s*;/m.exec(shell);
    expect(declared, "--studio-status-height is gone, or is no longer in rem").not.toBeNull();
    const rem = Number(declared![1]);
    expect(rem, `the status bar is ${rem}rem; one line is ${MAX_REM}rem at the most`).toBeLessThanOrEqual(MAX_REM);
  });

  it("does not wrap, so the one number is the whole answer", () => {
    const bar = rule(".studio-status");
    expect(bar, ".studio-status is gone").toBeDefined();
    expect(/flex-wrap:\s*wrap/.test(bar!.body), "the status bar may wrap onto a second line").toBe(false);
    expect(/min-block-size:\s*var\(--studio-status-height\)/.test(bar!.body), "the bar no longer reads the token").toBe(
      true,
    );
  });

  it("clips the credit rather than letting it push the controls down", () => {
    const credit = rule(".studio-status__credit");
    expect(credit, ".studio-status__credit is gone").toBeDefined();
    expect(/white-space:\s*nowrap/.test(credit!.body), "the credit line is not clipped to one line").toBe(true);
    expect(/text-overflow:\s*ellipsis/.test(credit!.body), "the clipped credit gives no sign it was clipped").toBe(true);
    // Clipped, never deleted: the sentence about nothing being generated in
    // the browser is still read out.
    expect(/display:\s*none/.test(credit!.body), "the credit is removed rather than clipped").toBe(false);
  });

  it("still hands the stage the height it did not take", () => {
    const canvasCss = source("src/styles/studio-canvas.css");
    const uses = canvasCss.match(/var\(--studio-status-height\)/g) ?? [];
    expect(uses.length, "the stage no longer sizes itself against the bar").toBeGreaterThanOrEqual(2);
  });
});
