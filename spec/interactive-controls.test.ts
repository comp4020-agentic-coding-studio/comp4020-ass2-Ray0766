// Two things a control owes the person using it, checked in a real browser
// because neither is visible in the source and neither survives JSDOM.
//
// 1. It must not take the keyboard away from whoever just pressed it
//    (CLAUDE.md §7). The three-second demo hid the button that was pressed —
//    twice, once for Play and once for Stay/Scroll — and Chrome answers a
//    hidden element's blur by putting `document.activeElement` on `<body>`.
//    Nothing about that shows up in a screenshot, and the next Tab lands
//    somewhere reasonable because Chrome remembers where the removed element
//    was, so it reads as fine right up until someone is actually using the
//    keyboard or a screen reader.
//
//    The demo had a second half to it that made the first half hard to see:
//    `hidden` did not hide. `.at-button` sets its own `display`, an author
//    rule beats the UA stylesheet's `[hidden] { display: none }` whatever the
//    specificity, and three-second-demo.css says so in a comment — then gives
//    the escape rule to `.three-second-demo__controls[hidden]` and
//    `.three-second-demo__decision[hidden]` and not to the button itself. So
//    the pressed Play button stayed on screen at 90x47 for the whole clip
//    while Chrome had already dropped focus off it. Visible and unfocusable at
//    once, which is the worst of the two. Hence the second assertion below:
//    for every control in the widget, the `hidden` attribute and what the
//    compositor did have to agree.
//
// 2. It must say what it will do, not what it did last time. The footer's
//    theme toggle ships `aria-label="Switch to dark theme"` as a literal in
//    the theme's markup and only ever rewrites it inside its own click
//    handler, so on any load where the effective theme is already dark the
//    button promises the theme it is leaving. DefaultDarkTheme.astro forces
//    dark whenever nothing is stored, which makes that the *first* visit —
//    the one a marker gets — and a stored dark preference is wrong the same
//    way. Measured: wrong in four of the six (stored x OS) states, right only
//    when a light preference is stored.

import { describe, expect, it } from "vitest";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

interface Snapshot {
  step: string;
  /** A short name for `document.activeElement`, or "BODY". */
  active: string;
  /** Whether that element is inside the widget and actually rendered. */
  activeIsVisibleControlInWidget: boolean;
}

interface ControlState {
  name: string;
  hidden: boolean;
  rendered: boolean;
}

interface DemoRun {
  viewport: string;
  snapshots: Snapshot[];
  /** Every control in the widget, after the run has finished. */
  controls: ControlState[];
}

interface ToggleRun {
  stored: string | null;
  os: string;
  effective: string;
  label: string;
  /** The theme the label promises to move to, parsed from the label. */
  promises: string | null;
  /** Where pressing it actually went. */
  went: string;
}

const VIEWPORTS = [
  { name: "desktop 1920×1080", width: 1920, height: 1080 },
  { name: "phone 390×844", width: 390, height: 844 },
] as const;

/** Names `document.activeElement` and says whether it is a rendered control
 *  inside the widget. Defined in the page so both facts come from one read. */
const REPORT = `
  const root = document.querySelector("[data-three-second-demo]");
  const active = document.activeElement;
  const name = active
    ? active.tagName +
      (active.dataset && active.dataset.play !== undefined ? "[data-play]" : "") +
      (active.dataset && active.dataset.stay !== undefined ? "[data-stay]" : "") +
      (active.dataset && active.dataset.scroll !== undefined ? "[data-scroll]" : "")
    : "null";
  const inside = !!active && root.contains(active) && active !== root;
  return {
    active: name,
    activeIsVisibleControlInWidget: inside && active.checkVisibility() && !active.hidden,
  };
`;

async function sweep(): Promise<{ demo: DemoRun[]; toggle: ToggleRun[] }> {
  const { base } = resolveDeployment(process.env, gitOrigin);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const demo: DemoRun[] = [];
  const toggle: ToggleRun[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      await tab.viewport(viewport.width, viewport.height);
      await tab.goto(`${site.origin}${prefix}lectures/week-09/`);
      await tab.settle();

      const snapshots: Snapshot[] = [];
      const snap = async (step: string) =>
        snapshots.push({ step, ...(await tab.evaluate<Omit<Snapshot, "step">>(REPORT)) });

      await tab.evaluate(`
        const play = document.querySelector("[data-play]");
        play.scrollIntoView({ block: "center", behavior: "instant" });
        play.focus();
        return null;
      `);
      await snap("Play focused");
      await tab.press("Enter");
      await tab.evaluate(`return new Promise((done) => setTimeout(() => done(null), 250));`);
      await snap("after Enter on Play");

      // The decision appears on the video's own clock, so wait for it rather
      // than for a number of milliseconds.
      await tab.evaluate(`return (async () => {
        const decision = document.querySelector("[data-decision]");
        const deadline = performance.now() + 12000;
        while (decision.hidden && performance.now() < deadline) {
          await new Promise((done) => setTimeout(done, 100));
        }
        return null;
      })();`);
      await tab.evaluate(`document.querySelector("[data-stay]").focus(); return null;`);
      await snap("Stay focused");
      await tab.press("Enter");
      await tab.evaluate(`return new Promise((done) => setTimeout(() => done(null), 250));`);
      await snap("after Enter on Stay");

      const controls = await tab.evaluate<ControlState[]>(`
        const root = document.querySelector("[data-three-second-demo]");
        return [...root.querySelectorAll("button")].map((button) => ({
          name: button.dataset.play !== undefined ? "Play" : button.dataset.stay !== undefined ? "Stay" : "Scroll",
          hidden: button.hidden,
          rendered: button.checkVisibility(),
        }));
      `);

      demo.push({ viewport: viewport.name, snapshots, controls });
    }

    await tab.viewport(1920, 1080);
    for (const stored of [null, "dark", "light"] as const) {
      for (const os of ["dark", "light"] as const) {
        await tab.colourScheme(os);
        // Seeded on the origin, then loaded fresh, so the page's own theme
        // scripts run against the stored value the way a return visit does.
        await tab.goto(`${site.origin}${prefix}policies/`);
        await tab.evaluate(
          stored === null
            ? `localStorage.removeItem("at-theme"); return null;`
            : `localStorage.setItem("at-theme", ${JSON.stringify(stored)}); return null;`,
        );
        await tab.goto(`${site.origin}${prefix}policies/`);
        await tab.settle();

        const before = await tab.evaluate<{ effective: string; label: string }>(`
          const button = document.querySelector(".at-footer-theme-toggle");
          button.scrollIntoView({ block: "center", behavior: "instant" });
          button.focus();
          return {
            effective: document.documentElement.dataset.theme,
            label: button.getAttribute("aria-label") || "",
          };
        `);
        await tab.press("Enter");
        const went = await tab.evaluate<string>(
          `return new Promise((done) => setTimeout(() => done(document.documentElement.dataset.theme), 250));`,
        );

        const promises = /Switch to (dark|light) theme/.exec(before.label)?.[1] ?? null;
        toggle.push({ stored, os, effective: before.effective, label: before.label, promises, went });
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return { demo, toggle };
}

const { demo, toggle } = await sweep();

describe.each(demo)("the three-second demo at $viewport", ({ snapshots, controls }) => {
  // The two steps that press something. The other two are there to prove the
  // control was focusable in the first place, so a widget that never took
  // focus at all cannot pass by never losing it.
  for (const step of ["after Enter on Play", "after Enter on Stay"]) {
    it(`keeps the keyboard ${step.replace("after ", "")}`, () => {
      const before = snapshots[snapshots.findIndex((s) => s.step === step) - 1]!;
      expect(before.activeIsVisibleControlInWidget, `${before.step}: nothing was focused to begin with`).toBe(
        true,
      );

      const after = snapshots.find((s) => s.step === step)!;
      expect(
        after.activeIsVisibleControlInWidget,
        `${step}, document.activeElement is ${after.active}. A control must not take focus away from ` +
          `the person who just used it (CLAUDE.md §7): hand it to a control that is still on screen, ` +
          `or leave it on the one that was pressed with aria-disabled rather than hiding it.`,
      ).toBe(true);
    });
  }

  // Only the one direction is a lie about this attribute. A control that is
  // not painted while carrying no `hidden` of its own is usually just inside a
  // container that is hidden, which is how the decision pair spends most of
  // its life and is not a fault.
  it("never leaves a control hidden but still painted", () => {
    const lying = controls
      .filter((control) => control.hidden && control.rendered)
      .map((control) => `${control.name}: hidden=true, and the compositor painted it anyway`);
    expect(
      lying,
      "`.at-button` sets its own display, which beats the UA stylesheet's [hidden] rule, so a control " +
        "can carry the attribute and stay on screen — focus dropped, button visible. " +
        "three-second-demo.css already has the escape rule for the two containers.",
    ).toEqual([]);
  });
});

describe("the footer theme toggle", () => {
  it.each(toggle)(
    "says what it will do with $stored stored and a $os OS preference",
    ({ stored, os, effective, label, promises }) => {
      expect(promises, `the label "${label}" does not name a theme`).not.toBeNull();
      expect(
        promises,
        `on ${os} OS with ${stored === null ? "nothing" : `"${stored}"`} stored the page renders ` +
          `${effective}, and the button says "${label}". It is offering the theme already on screen. ` +
          `The label has to come from the theme in effect at load, not from a literal in the markup.`,
      ).toBe(effective === "dark" ? "light" : "dark");
    },
  );

  it.each(toggle)("goes where it promised with $stored stored and a $os OS preference", ({ label, promises, went }) => {
    expect(went, `the button said "${label}" and the page became ${went}`).toBe(promises);
  });
});
