// The policies page has to be usable, not just present.
//
// A real course site's late-submission rule is arithmetic a student can do
// before deciding whether to submit at all: a rate, a point where it reaches
// zero, and what counts as a day. This page said the piece "loses a fixed
// percentage of the available marks per day late" and never gave the
// percentage anywhere on the site, which is a sentence that looks like a rule
// and answers none of the three.
//
// Read off the built page rather than the .mdx, because what binds a student
// is what the site published; and read out of the section the heading opens
// rather than out of the whole document, so a number that happens to appear
// somewhere else on the page — a date, a heading anchor — cannot stand in for
// the one this rule is missing (CLAUDE.md §7 on checks fed by their own
// surroundings).
//
// Seen red on the page as it stood, all four assertions at once: no rate, no
// cutoff, no day-counting basis, and the placeholder wording still there.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve("dist/policies/index.html"), "utf8");

/** The prose under one `<h2>`, up to the next heading of the same level. */
function section(heading: RegExp): string {
  const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)];
  const index = headings.findIndex((match) => heading.test(match[1]!.replace(/<[^>]+>/g, "")));
  if (index < 0) throw new Error(`the policies page has no <h2> matching ${heading}`);
  const start = headings[index]!.index! + headings[index]![0].length;
  const end = headings[index + 1]?.index ?? html.length;
  return html
    .slice(start, end)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the late-submission rule", () => {
  const rule = section(/late submission/i);

  it("gives the rate", () => {
    expect(
      rule,
      "the rule has to say how much a day late costs, as a number — a student deciding " +
        "at 2am whether to submit cannot act on 'a fixed percentage'",
    ).toMatch(/\b\d+\s*(?:percentage points|per cent|percent|%)/i);
  });

  it("says where it reaches zero", () => {
    expect(
      rule,
      "the rule has to say how many days late is worth nothing, or the rate alone does not " +
        "tell anyone when to stop",
    ).toMatch(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+days?\b[^.]*\bzero\b/i);
  });

  it("says how a day is counted", () => {
    expect(
      rule,
      "a rate per day is not computable until the page says whether a weekend is a day",
    ).toMatch(/weekend/i);
  });

  it("no longer promises a percentage it does not give", () => {
    expect(
      rule,
      "'a fixed percentage' is the wording this check exists to keep out: it reads as a rule " +
        "and carries no rule",
    ).not.toMatch(/fixed percentage/i);
  });
});

describe("the course description", () => {
  // The description is the home page's opening paragraph, its hero lead (the
  // first sentence, sliced out in index.astro) and its <meta description>. It
  // is the first prose a marker reads, and there is nowhere in any of those
  // three to hang a Source line — so it is the one place on the site that must
  // not carry a claim about the world. CLAUDE.md §3: craft statements are real
  // or they are not made.
  const description = /<meta name="description" content="([^"]*)"/.exec(
    readFileSync(resolve("dist/index.html"), "utf8"),
  )?.[1];

  it("is rendered on the home page", () => {
    expect(description, "the home page has no meta description").toBeTruthy();
  });

  it("makes no unsourced claim about the world", () => {
    const claims = [
      { pattern: /fastest[- ]growing/i, why: "a superlative about a whole industry" },
      { pattern: /\bon earth\b|\bin the world\b|\bworldwide\b|\bglobally\b/i, why: "a global scope" },
      { pattern: /\bmost of the\b/i, why: "a claim about a production share" },
      { pattern: /\b(?:biggest|largest|fastest|first ever)\b/i, why: "a superlative" },
    ];
    const found = claims
      .filter((claim) => claim.pattern.test(description ?? ""))
      .map((claim) => `${claim.why} (${claim.pattern})`);
    expect(
      found,
      `the description is "${description}". Every number and every superlative on this site ` +
        "traces to a source with a Source line next to it; the hero has no room for one, so it " +
        "states the course's own position instead (CLAUDE.md §3).",
    ).toEqual([]);
  });
});
