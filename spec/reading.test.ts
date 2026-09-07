// The reading list is the one place this course points a student at somebody
// else's work, and it used to be stated twice per week --- prose on the
// lecture page, a list on the deck's Reading slide --- which is how week 1
// ended up citing a blog post my own source whitelist says not to cite while
// its deck cited the licence text, and how week 9 ended up with two different
// Khan Academy URLs. src/data/reading.json is now the single list and both
// pages render it, so this checks the properties that made drift possible.
//
// On reachability. The brief for this check asked for "every url reachable",
// and it is not asserted here on purpose. Measured 2026-09-07 with
// `npx linkinator@6 reading-urls.html` over all 52 distinct URLs: 48 returned
// 200 and four returned 403 --- w3.org/WAI, danbooru.donmai.us, openai.com
// and tech.ebu.ch. Re-driven in real Chrome, w3.org returns 200 (linkinator
// is blocked by user-agent) and the other three serve Cloudflare bot
// challenges ("Just a moment...", "Attention Required! | Cloudflare"). All
// four are live pages that were fetched and confirmed when the whitelist was
// compiled. A live-network assertion here would therefore be red forever, for
// three sources that are fine, and would make `pnpm check` fail on a train.
// What is checked instead is the part that is this repo's fault: that the URL
// actually shipped into the page. The sweep is `pnpm check:links`, which
// builds that URL index for you; re-run it by hand when the list changes and
// put the result in the round's receipt.
//
// Seen red before it was trusted, three injections, output verbatim:
//   - deleted the MiniMax H3 prompt-guide entry from week 5 in reading.json,
//     leaving the built pages carrying five →
//     AssertionError: week 5: the lecture page does not carry reading.json's
//     list: expected [ …(5) ] to deeply equal [ …(4) ]
//   - cut week 3 down to a single entry →
//     AssertionError: week 3 has 1 reading entry; a week cites at least two:
//     expected 1 to be greater than or equal to 2
//   - lengthened week 1's Wan2.2 quotation →
//     AssertionError: reading.json week 1 "Wan2.2": the quotation is 23 words;
//     a card holds 20: expected 23 to be less than or equal to 20
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readingEntries, readingFor } from "../src/lib/reading";

const WEEKS = Array.from({ length: 12 }, (_, i) => i + 1);

/** A card holds one sentence, not a paragraph. */
const MAX_QUOTE_WORDS = 20;

/** Chinese quotations carry no spaces, so the word count alone cannot bound
 *  them; this is the second half of the same rule. */
const MAX_QUOTE_CHARS = 160;

function built(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

/** The hrefs of the reading card list on a built page, in document order. */
function readingLinks(html: string, path: string): string[] {
  const list = /<ul class="reading"[\s\S]*?<\/ul>/.exec(html);
  if (!list) throw new Error(`${path} has no rendered reading list`);
  return [...list[0].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

describe("reading: one list, rendered twice", () => {
  it("covers all twelve weeks and nothing else", () => {
    expect([...new Set(readingEntries.map((entry) => entry.week))].sort((a, b) => a - b)).toEqual(WEEKS);
  });

  for (const week of WEEKS) {
    const entries = readingFor(week);

    it(`week ${week} cites at least two sources`, () => {
      expect(entries.length, `week ${week} has ${entries.length} reading entry; a week cites at least two`).toBeGreaterThanOrEqual(2);
    });

    it(`week ${week}'s lecture and deck list the same reading`, () => {
      const lecture = `dist/lectures/week-${String(week).padStart(2, "0")}/index.html`;
      const deck = `dist/decks/week-${String(week).padStart(2, "0")}/index.html`;
      const urls = entries.map((entry) => entry.url);
      const fromLecture = readingLinks(built(lecture), lecture);
      const fromDeck = readingLinks(built(deck), deck);
      expect(fromLecture, `week ${week}: the lecture page does not carry reading.json's list`).toEqual(urls);
      expect(
        fromDeck,
        `week ${week}: the lecture page and the deck list different reading`,
      ).toEqual(fromLecture);
    });

    it(`week ${week} cites each source once`, () => {
      const urls = entries.map((entry) => entry.url);
      expect([...new Set(urls)], `week ${week} repeats a source`).toEqual(urls);
    });
  }

  for (const entry of readingEntries) {
    it(`week ${entry.week} "${entry.title}" is quoted or says why not`, () => {
      const has = (value: string | null) => typeof value === "string" && value.length > 0;
      expect(
        has(entry.quote) !== has(entry.quoteNote),
        `reading.json week ${entry.week} "${entry.title}" must carry exactly one of quote and quoteNote --- a source with no quotation says so on the card rather than being paraphrased into quotation marks`,
      ).toBe(true);

      if (entry.quote) {
        const words = entry.quote.split(/\s+/).filter(Boolean).length;
        expect(
          words,
          `reading.json week ${entry.week} "${entry.title}": the quotation is ${words} words; a card holds ${MAX_QUOTE_WORDS}`,
        ).toBeLessThanOrEqual(MAX_QUOTE_WORDS);
        expect(
          entry.quote.length,
          `reading.json week ${entry.week} "${entry.title}": the quotation is ${entry.quote.length} characters`,
        ).toBeLessThanOrEqual(MAX_QUOTE_CHARS);
      }
    });
  }

  it("every cited URL reached the built site", () => {
    // The half of "reachable" this repo controls: a URL sitting in the data
    // file and never rendered is a source the reader cannot follow, and that
    // failure is silent in a browser.
    const missing: string[] = [];
    for (const week of WEEKS) {
      const tag = String(week).padStart(2, "0");
      const pages = [`dist/lectures/week-${tag}/index.html`, `dist/decks/week-${tag}/index.html`].map(built);
      for (const entry of readingFor(week)) {
        for (const [index, html] of pages.entries()) {
          if (!html.includes(entry.url)) missing.push(`${entry.url} (week ${week}, ${index === 0 ? "lecture" : "deck"})`);
        }
      }
    }
    expect(missing, `reading URLs that never reached dist/:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every URL is https, except the one whose host does not offer it", () => {
    // The Xinhua reprint of the 2024 white paper serves http only; the primary
    // host blocks fetching entirely, which is why the reprint is cited at all.
    const insecure = readingEntries.filter((entry) => !entry.url.startsWith("https://")).map((entry) => entry.url);
    expect(insecure).toEqual(["http://www.news.cn/ci/20250416/6f4afd7ffda245b4b46a2664ca4e98db/c.html"]);
  });
});
