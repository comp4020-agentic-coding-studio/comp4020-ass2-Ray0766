// Compare: the panel list, and the reducer that keeps several clips on one
// clock.
//
// The sync is the part worth checking without a browser, because "within one
// frame" is arithmetic and a screenshot cannot see it. What a browser has to
// answer — that Escape returns focus to the control that opened the lightbox —
// is driven in Chrome and is in the receipt; here the check is that the
// lightbox is a native <dialog>, which is what makes that true.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canvasBundle } from "../src/lib/canvas/build";
import {
  boardTakes,
  canCompare,
  clampClock,
  COMPARE_FPS,
  COMPARE_MAX,
  comparePanels,
  driftCorrections,
  FRAME_SECONDS,
  inSync,
  nextPanel,
  type ClipReading,
} from "../src/lib/canvas/compare";
import { addRigBoard, addTier, emptyCanvasDoc } from "../src/lib/canvas/session";

const built = canvasBundle.doc;

const threeTakes = () =>
  ["week05-t3", "week02-t1", "week06-t4"].reduce((doc, tierId) => addTier(doc, built, tierId), emptyCanvasDoc());

// Seen red by having comparePanels return the takes in document order rather
// than in the order they were selected (`doc.nodes.filter(...)`):
//   AssertionError: the panels are in the order the takes were picked:
//   expected [ 'week05-t3-take', …(2) ] to deeply equal
//   [ 'week02-t1-take', …(2) ]
//   AssertionError: expected [ 'week05-t3-take', …(2) ] to deeply equal
//   [ 'week06-t4-take', …(2) ]
// then reverted.
describe("selecting takes opens the lightbox with a panel each, in selection order", () => {
  const doc = threeTakes();

  // Deliberately not the order the document holds them in (week 5 was added
  // first), or the check would pass on a panel list that ignored selection.
  it("three takes give three panels, in the order they were picked", () => {
    const picked = ["week02-t1-take", "week06-t4-take", "week05-t3-take"];
    const panels = comparePanels(doc, picked);
    expect(panels.length).toBe(3);
    expect(panels.map((node) => node.id), "the panels are in the order the takes were picked").toEqual(picked);
  });

  it("a different pick order is a different panel order", () => {
    const reversed = ["week06-t4-take", "week02-t1-take", "week05-t3-take"];
    expect(comparePanels(doc, reversed).map((node) => node.id)).toEqual(reversed);
  });

  it("ignores anything that is not a take", () => {
    const panels = comparePanels(doc, ["week05-t3-input", "week05-t3-take", "nothing", "week02-t1-take"]);
    expect(panels.map((node) => node.id)).toEqual(["week05-t3-take", "week02-t1-take"]);
  });

  it("needs two, and shows at most five", () => {
    expect(canCompare(doc, ["week05-t3-take"]), "one take is not a comparison").toBe(false);
    expect(canCompare(doc, ["week05-t3-take", "week02-t1-take"])).toBe(true);

    const whole = addRigBoard(emptyCanvasDoc(), built, "week-02");
    const everyTake = whole.nodes.filter((node) => node.type === "take").map((node) => node.id);
    expect(everyTake.length, "week 2 has five tiers, so this is the cap exactly").toBe(5);
    expect(comparePanels(whole, [...everyTake, "week05-t3-take"]).length).toBe(COMPARE_MAX);
  });

  it("a board's own Compare takes every take on it, in the board's order", () => {
    const whole = addRigBoard(emptyCanvasDoc(), built, "week-02");
    expect(boardTakes(whole, "week-02")).toEqual([
      "week02-t1-take",
      "week02-t2-take",
      "week02-t3-take",
      "week02-t4-take",
      "week02-t5-take",
    ]);
  });
});

// Seen red by loosening the tolerance to a whole second
// (`tolerance: number = 1`), which is the shape of "close enough" and is six
// frames of visible disagreement at 24 fps:
//   AssertionError: a clip 3 frames behind is corrected: expected +0 to be 1
//   AssertionError: every clip is within a frame of the clock after the
//   corrections are applied: expected false to be true
// then reverted.
describe("the sync reducer keeps every clip within one frame at 24 fps", () => {
  const at = (currentTime: number, duration = 5): ClipReading => ({ id: `c${currentTime}`, currentTime, duration });

  it("leaves clips that are already within a frame alone", () => {
    const readings = [at(2), { ...at(2), id: "b", currentTime: 2 + FRAME_SECONDS * 0.9 }];
    expect(driftCorrections(readings, 2)).toEqual([]);
    expect(inSync(readings, 2)).toBe(true);
  });

  it("corrects a clip that has drifted further than a frame", () => {
    const drifted = { id: "b", currentTime: 2 + FRAME_SECONDS * 3, duration: 5 };
    const corrections = driftCorrections([at(2), drifted], 2);
    expect(corrections.length, "a clip 3 frames behind is corrected").toBe(1);
    expect(corrections[0]).toEqual({ id: "b", seekTo: 2 });
  });

  it("brings a whole set back inside one frame in a single pass", () => {
    const clock = 3;
    const readings: ClipReading[] = [
      { id: "a", currentTime: 3.0, duration: 6 },
      { id: "b", currentTime: 3.5, duration: 6 },
      { id: "c", currentTime: 2.1, duration: 6 },
      { id: "d", currentTime: 3 + FRAME_SECONDS / 2, duration: 6 },
    ];

    const applied = new Map(readings.map((clip) => [clip.id, clip.currentTime]));
    for (const correction of driftCorrections(readings, clock)) applied.set(correction.id, correction.seekTo);
    const after = readings.map((clip) => ({ ...clip, currentTime: applied.get(clip.id) as number }));

    expect(
      inSync(after, clock),
      "every clip is within a frame of the clock after the corrections are applied",
    ).toBe(true);
    for (const clip of after) {
      expect(Math.abs(clip.currentTime - clock)).toBeLessThanOrEqual(FRAME_SECONDS);
    }
  });

  it("holds a clip that has ended on its last frame rather than restarting it", () => {
    const short = { id: "short", currentTime: 2, duration: 2 };
    const long = { id: "long", currentTime: 4, duration: 6 };
    const corrections = driftCorrections([short, long], 4);
    expect(corrections.map((correction) => correction.id), "the short clip is already at its end").toEqual([]);
    expect(clampClock(9, [short, long]), "the clock stops at the longest clip").toBe(6);
  });

  it("states the frame it is working to", () => {
    expect(COMPARE_FPS).toBe(24);
    expect(FRAME_SECONDS).toBeCloseTo(1 / 24, 10);
  });
});

describe("the arrows walk the panels and stop at the ends", () => {
  it("does not wrap", () => {
    expect(nextPanel(0, -1, 3)).toBe(0);
    expect(nextPanel(0, 1, 3)).toBe(1);
    expect(nextPanel(2, 1, 3)).toBe(2);
  });
});

// Seen red by swapping the lightbox's <dialog> for a <div role="dialog">,
// which is how a lightbox loses Escape and the focus return without anything
// looking different in a screenshot:
//   AssertionError: the lightbox has to be a native <dialog>: Escape and the
//   focus return are the platform's, not ours: expected false to be true
// then reverted.
describe("the lightbox is a native dialog, which is what returns focus on Escape", () => {
  const source = readFileSync(resolve("src/components/studio/CompareLightbox.tsx"), "utf8");

  // Anchored to the start of a line so it matches the JSX tag and not this
  // module's own comment about it, which is what a first version of this check
  // matched — and which stayed green when the tag was swapped for a div.
  it("opens with showModal, so the platform owns the trap and the return", () => {
    expect(
      /^\s*<dialog\b/m.test(source) && source.includes("showModal()"),
      "the lightbox has to be a native <dialog>: Escape and the focus return are the platform's, not ours",
    ).toBe(true);
  });

  it("never autoplays, which is what prefers-reduced-motion asks of it", () => {
    expect(/useState\(false\);?\s*\/\/|const \[playing, setPlaying\] = useState\(false\)/.test(source)).toBe(true);
    expect(source.includes("autoPlay"), "no clip starts on its own").toBe(false);
  });
});
