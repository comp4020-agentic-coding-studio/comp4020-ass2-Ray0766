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
// until somebody inlines one of them.
//
// **Compared as word runs, not as sentences, and that is the second version of
// this file.** The first asked whether the two shared a whole sentence, string
// for string, which is a test of punctuation rather than of meaning --- an
// independent review defeated it twice in a minute:
//
//   - the hero's whole sentence put back in the paragraph with ONE character
//     changed ("the rig earns a mark" -> "the Rig earns a mark"): 3 passed.
//   - the same claim split across two sentences ("This is a studio course in
//     vertical serialized drama. The machine does the shooting, and only the
//     technique you add to the rig earns a mark."): 3 passed.
//
// Both put the same claim on the page twice, which is the whole thing this file
// exists to prevent. So the comparison is now case-folded, punctuation-stripped
// and run-based: a shared run of six words or more is a shared claim, whatever
// the punctuation between them. The two are allowed to share words --- they are
// about the same course --- and the longest run they actually share today is
// three ("to the rig"), so six is twice the current margin rather than a number
// picked to make this pass.
//
// Seen red, four ways, after the rewrite --- see the receipt for the counts.
const html = readFileSync(resolve("dist/index.html"), "utf8");

/** The paragraph's own text, tolerant of extra classes and attributes on the
 *  element: the first version keyed on `<p class="lead">` exactly, so adding a
 *  second class made it throw "the home page has no opening paragraph" --- a red
 *  for the wrong reason, which is its own kind of blind. */
const text = (pattern: RegExp, what: string): string => {
  const found = pattern.exec(html);
  if (!found?.[1]) throw new Error(`the home page has no ${what}`);
  const prose = found[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (!prose) throw new Error(`the home page's ${what} is empty`);
  return prose;
};

/** Case folded, punctuation dropped, so "the rig earns a mark" and "the Rig
 *  earns a mark" are the same claim --- which is the hole the first version had. */
const words = (prose: string): string[] =>
  prose
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** The longest run of words the two share, and the run itself for the message. */
function longestSharedRun(a: string[], b: string[]): { length: number; run: string } {
  let best = 0;
  let run = "";
  // Rolling comparison rather than a suffix structure: both texts are a few
  // dozen words, and a clever version of this would be a second thing to be
  // wrong about.
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) {
        best = k;
        run = a.slice(i, i + k).join(" ");
      }
    }
  }
  return { length: best, run };
}

/** A shared run this long is a shared claim. Today's actual longest is 3. */
const CLAIM = 6;

const hero = text(/<p class="home-hero__lead"[^>]*>([\s\S]*?)<\/p>/, "hero lead");
const lead = text(/<p class="lead"[^>]*>([\s\S]*?)<\/p>/, "opening paragraph");
const shared = longestSharedRun(words(hero), words(lead));

describe("the home page's two ways of saying what the course is", () => {
  it("has both of them, with enough words in each to be a claim", () => {
    expect(words(hero).length, `the hero lead reads "${hero}"`).toBeGreaterThanOrEqual(CLAIM);
    expect(words(lead).length, `the opening paragraph reads "${lead}"`).toBeGreaterThanOrEqual(CLAIM);
  });

  it("does not put the same claim in both", () => {
    expect(
      shared.length,
      `the hero's subtitle and the page's opening paragraph share ${shared.length} words in a row ` +
        `--- "${shared.run}" --- and ${CLAIM} or more of them in a row is the same claim said twice. ` +
        `Compared case-folded and without punctuation, because changing one letter or splitting the ` +
        `sentence in two is not a fix. Hero: "${hero}". Paragraph: "${lead}".`,
    ).toBeLessThan(CLAIM);
  });

  it("does not bury one inside the other either", () => {
    expect(
      words(lead).join(" ").includes(words(hero).join(" ")),
      `the opening paragraph contains the hero's subtitle whole: "${hero}"`,
    ).toBe(false);
    expect(
      words(hero).join(" ").includes(words(lead).join(" ")),
      `the hero's subtitle contains the opening paragraph whole: "${lead}"`,
    ).toBe(false);
  });

  // The comparison above can only work if it is comparing something. A run of
  // zero words would pass every assertion in this file.
  it("actually compared the two, and says what they share today", () => {
    expect(shared.length, `hero: "${hero}" / paragraph: "${lead}"`).toBeGreaterThanOrEqual(1);
    expect(shared.run.length).toBeGreaterThan(0);
  });
});
