// /studio/ has two desks and the 640px breakpoint swaps them. This drives a
// window across it, both ways, and asks the three questions a reader would.
//
// It has to be a real browser. The crossing is a `matchMedia` change, the two
// compositions are separated by a media query, and the thing that goes wrong
// is `document.activeElement` — none of which JSDOM has. It is also the only
// way to catch the shape of failure this replaces: a hand-over that was
// written, shipped, and never once executed, because the condition guarding it
// (`stage.contains(target)`, against a desk that is the stage's sibling) could
// not be true. Reading the source, it looked handled.
//
// What was measured before the fix, at both viewports and in both themes:
// picking week 8 on a wide screen and typing into the prompt, then dragging
// under 640, produced week 2's untouched recorded prompt and `<body>` holding
// the keyboard — and dragging back up left the keyboard on `<body>` too.

import { describe, expect, it } from "vitest";

import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab, type ColourScheme } from "./lib/chrome.ts";

/** A week that is not the one either side starts on, so "it carried" cannot be
 *  confused with "it happened to be right". weeks[0] is week 2 on both sides. */
const CARRIED_WEEK = 8;
const EDIT = " — carried across the breakpoint";

interface Reading {
  theme: ColourScheme;
  step: string;
  width: number;
  /** The wide desk's week, tier and prompt, read off its own controls. */
  canvas: { week: string | null; tier: string | null; prompt: string | null };
  /** The phone form's, likewise. */
  phone: { week: string | null; tier: string | null; prompt: string | null };
  active: string;
  activeInPhoneForm: boolean;
  activeInCanvasSide: boolean;
}

const READ = (step: string) => `
  const norm = (value) => (value === null || value === undefined ? null : String(value).replace(/\\s+/g, " ").trim());
  const canvasWeek = document.querySelector('input[name="desk-week"]:checked');
  const canvasTier = document.querySelector('input[name="desk-tier"]:checked');
  const canvasPrompt = document.querySelector("#desk-prompt");
  const phoneWeek = document.querySelector("[data-form-week]");
  const phoneTier = document.querySelector("[data-form-tier]");
  const phonePrompt = document.querySelector(".studio-form__prompt");
  const form = document.querySelector("[data-studio-form]");
  const side = document.querySelector(".studio-canvas__layout");
  const active = document.activeElement;
  return {
    step: ${JSON.stringify(step)},
    width: innerWidth,
    canvas: {
      week: canvasWeek ? canvasWeek.value : null,
      tier: canvasTier ? canvasTier.value : null,
      prompt: canvasPrompt ? norm(canvasPrompt.value) : null,
    },
    phone: {
      week: phoneWeek ? norm(phoneWeek.value) : null,
      tier: phoneTier ? norm(phoneTier.value) : null,
      prompt: phonePrompt ? norm(phonePrompt.value) : null,
    },
    active: active ? active.tagName + (active.id ? "#" + active.id : "") : "null",
    activeInPhoneForm: !!active && !!form && form.contains(active) && active !== document.body,
    activeInCanvasSide: !!active && !!side && side.contains(active) && active !== document.body,
  };
`;

const settleFrames = `return new Promise((done) => setTimeout(() => done(null), 900));`;

async function sweep(): Promise<Reading[]> {
  const { base } = resolveDeployment(process.env, gitOrigin);
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const readings: Reading[] = [];

  try {
    for (const theme of ["dark", "light"] as const) {
      await tab.viewport(1920, 1080);
      await tab.colourScheme(theme);
      await tab.goto(`${site.origin}${prefix}studio/`);
      await tab.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; return null;`);
      await tab.settle();
      // The island is client:visible, so give it a beat to hydrate before
      // pressing anything on it.
      await tab.evaluate(settleFrames);

      // Pick the week, then type into the prompt through the native setter so
      // React sees a real input event rather than a value assignment it will
      // overwrite on the next render.
      await tab.evaluate(`
        const radio = [...document.querySelectorAll('input[name="desk-week"]')]
          .find((input) => input.value === "${CARRIED_WEEK}");
        if (!radio) throw new Error("no week ${CARRIED_WEEK} on the desk");
        radio.click();
        return null;
      `);
      await tab.evaluate(settleFrames);
      await tab.evaluate(`
        const box = document.querySelector("#desk-prompt");
        box.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(box, box.value + ${JSON.stringify(EDIT)});
        box.dispatchEvent(new Event("input", { bubbles: true }));
        return null;
      `);
      await tab.evaluate(settleFrames);
      readings.push({ theme, ...(await tab.evaluate<Omit<Reading, "theme">>(READ("edited at 1920"))) });

      await tab.viewport(639, 844);
      await tab.evaluate(settleFrames);
      readings.push({ theme, ...(await tab.evaluate<Omit<Reading, "theme">>(READ("crossed down to 639"))) });

      await tab.viewport(1920, 1080);
      await tab.evaluate(settleFrames);
      readings.push({ theme, ...(await tab.evaluate<Omit<Reading, "theme">>(READ("crossed back up to 1920"))) });
    }
  } finally {
    await tab.close();
    await site.close();
  }

  return readings;
}

const readings = await sweep();
const at = (theme: ColourScheme, step: string) =>
  readings.find((reading) => reading.theme === theme && reading.step === step)!;

describe.each(["dark", "light"] as const)("the studio desks in the %s theme", (theme) => {
  it("starts from a desk that is not on the default week", () => {
    const edited = at(theme, "edited at 1920");
    expect(edited.canvas.week, "the wide desk did not take the week this test picks").toBe(String(CARRIED_WEEK));
    expect(edited.canvas.prompt, "the prompt edit did not reach React's state").toContain(EDIT.trim());
    expect(edited.active, "the edit should have left the keyboard in the prompt box").toBe(
      "TEXTAREA#desk-prompt",
    );
  });

  describe("crossing down to 639", () => {
    it("shows the same week and tier on the phone form", () => {
      const before = at(theme, "edited at 1920");
      const after = at(theme, "crossed down to 639");
      expect(
        { week: after.phone.week, tier: after.phone.tier },
        `the wide desk was on week ${before.canvas.week}, tier ${before.canvas.tier}; the phone form ` +
          `came up on week ${after.phone.week}, tier ${after.phone.tier}. The side going out hands its ` +
          `week, tier and prompt to the side coming in.`,
      ).toEqual({ week: before.canvas.week, tier: before.canvas.tier });
    });

    it("shows the same prompt text on the phone form", () => {
      const before = at(theme, "edited at 1920");
      const after = at(theme, "crossed down to 639");
      expect(
        after.phone.prompt,
        "the phone form is showing its own recorded input rather than the text that was on the desk " +
          "a moment ago, so the edit is gone",
      ).toBe(before.canvas.prompt);
    });

    it("leaves the keyboard inside the phone form", () => {
      const after = at(theme, "crossed down to 639");
      expect(
        after.activeInPhoneForm,
        `document.activeElement is ${after.active}. The composition the reader was working in has just ` +
          `been hidden, so the keyboard has to be handed to the one replacing it (CLAUDE.md §7).`,
      ).toBe(true);
    });
  });

  describe("crossing back up to 1920", () => {
    it("still has the same week, tier and prompt on the wide desk", () => {
      const before = at(theme, "edited at 1920");
      const after = at(theme, "crossed back up to 1920");
      expect({
        week: after.canvas.week,
        tier: after.canvas.tier,
        prompt: after.canvas.prompt,
      }).toEqual({ week: before.canvas.week, tier: before.canvas.tier, prompt: before.canvas.prompt });
    });

    it("leaves the keyboard inside the wide composition", () => {
      const after = at(theme, "crossed back up to 1920");
      expect(
        after.activeInCanvasSide,
        `document.activeElement is ${after.active}. Coming back up, the keyboard belongs on the wide ` +
          `side — the stage is focusable for exactly this.`,
      ).toBe(true);
    });
  });
});
