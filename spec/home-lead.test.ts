import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The home page says what the course is twice: the hero's subtitle, and the
// paragraph under the tag row. They used to be the same sentence --- the
// paragraph was the whole of `courseMeta.description` and the hero was its
// opening sentence, so "a studio course in vertical serialized drama, where the
// machine does the shooting" was the first thing a reader met and then, one
// screen later, the first thing again. Both are sliced out of the one record
// now, the hero taking the first sentence and the paragraph the rest, which
// makes the overlap impossible by construction rather than by care.
//
// Checked anyway, on the built page, because "by construction" lasts exactly
// until somebody inlines one of them. Sentences rather than substrings: the two
// are allowed to share words --- they are about the same course --- and what
// they may not share is a whole claim.
//
// Seen red by putting the old markup back (`<p class="lead">{courseMeta.description}</p>`):
//   AssertionError: the hero's subtitle and the page's opening paragraph both
//   say "A studio course in vertical serialized drama, where the machine does
//   the shooting and only the technique you add to the rig earns a mark."
const html = readFileSync(resolve("dist/index.html"), "utf8");

const text = (pattern: RegExp, what: string): string => {
  const found = pattern.exec(html);
  if (!found?.[1]) throw new Error(`the home page has no ${what}`);
  return found[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
};

/** Sentences, trimmed, with the trailing stop kept so a clause that happens to
 *  end a sentence in one place and not the other is not treated as the same
 *  claim. Short fragments are dropped: "One shot" is a phrase, not a claim. */
const sentences = (prose: string): string[] =>
  prose
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25);

const hero = text(/<p class="home-hero__lead">([\s\S]*?)<\/p>/, "hero lead");
const lead = text(/<p class="lead">([\s\S]*?)<\/p>/, "opening paragraph");

describe("the home page's two ways of saying what the course is", () => {
  it("has both of them, with something in each", () => {
    expect(sentences(hero).length, `the hero lead reads "${hero}"`).toBeGreaterThanOrEqual(1);
    expect(sentences(lead).length, `the opening paragraph reads "${lead}"`).toBeGreaterThanOrEqual(1);
  });

  it("does not say the same thing twice", () => {
    const shared = sentences(hero).filter((sentence) => sentences(lead).includes(sentence));
    expect(
      shared,
      `the hero's subtitle and the page's opening paragraph both say ${shared.map((s) => `"${s}"`).join("; ")}`,
    ).toEqual([]);
  });

  it("does not bury one inside the other either", () => {
    // A paragraph that contains the hero's whole subtitle is the failure this
    // file exists for, and it passes the sentence comparison above whenever the
    // punctuation differs by a character.
    expect(
      lead.includes(hero),
      `the opening paragraph contains the hero's subtitle whole: "${hero}"`,
    ).toBe(false);
    expect(
      hero.includes(lead),
      `the hero's subtitle contains the opening paragraph whole: "${lead}"`,
    ).toBe(false);
  });
});
