// Protects decision 3 in CLAUDE.md: the course is a list of instruments,
// twelve distinct additions, no week repeats another. Compares every pair
// of lecture titles+descriptions by Jaccard similarity over their
// significant words (lowercase words longer than three letters, minus a
// small stoplist of connectors) and fails a pair sharing more than 40%.
//
// No real pair comes close (the highest is week-02/week-09 at 27%), so this
// was seen red by injecting a synthetic duplicate: temporarily rewrote
// week-01's title and description to reuse week-02's "one shot"/"workflow
// graph as a repeatable recipe" wording, ran this suite, then reverted.
// Failure text: "week-01 and week-02 share 72% of significant words:
// expected 0.7222222222222222 to be less than or equal to 0.4"
import { describe, expect, it } from "vitest";
import { loadContentDir } from "./lib/content";

const STOPLIST = new Set([
  "this", "that", "with", "from", "into", "your", "their", "what", "have",
  "will", "which", "where", "there", "these", "those", "than", "then",
  "also", "such", "more", "most", "some", "same", "only", "just", "over",
  "under", "being", "doing", "been", "were", "while", "about", "without",
  "against", "between", "through", "across", "toward", "towards", "onto",
  "upon", "again", "every", "each", "much", "many", "very", "still", "even",
  "both", "during", "among", "because",
]);

function significantWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter((word) => word.length > 3 && !STOPLIST.has(word)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

const THRESHOLD = 0.4;

const lectures = loadContentDir("src/content/lectures").map((lecture) => ({
  slug: lecture.slug,
  words: significantWords(`${lecture.frontmatter.title} ${lecture.frontmatter.description}`),
}));

const scored: { a: string; b: string; score: number }[] = [];
for (let i = 0; i < lectures.length; i += 1) {
  for (let j = i + 1; j < lectures.length; j += 1) {
    scored.push({
      a: lectures[i].slug,
      b: lectures[j].slug,
      score: jaccard(lectures[i].words, lectures[j].words),
    });
  }
}

describe("distinct: no two lectures share more than 40% of their significant words", () => {
  for (const { a, b, score } of scored) {
    it(`${a} vs ${b} (${(score * 100).toFixed(0)}%)`, () => {
      expect(score, `${a} and ${b} share ${(score * 100).toFixed(0)}% of significant words`).toBeLessThanOrEqual(
        THRESHOLD,
      );
    });
  }
});
