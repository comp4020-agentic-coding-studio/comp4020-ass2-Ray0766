import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Builder-facing scaffolding text (instructions written for whoever is
// building the site) leaking into a page a student actually reads. Strip the
// chrome every page repeats (nav, the search dialog, the footer) before
// checking the body, so a phrase that is legitimately fine in navigation
// doesn't false-positive, and so this only ever flags real page content.
const BANNED_PHRASES = [
  "site-config",
  "related:",
  "STARTER",
  "TEMPLATE",
  "should sum to",
  "Full biography to follow",
  "placeholder",
  "the course claims to run",
];

function bodyTextOf(html: string): string {
  const withoutChrome = html
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ");
  return withoutChrome.replace(/<[^>]+>/g, " ");
}

const pages = globSync("dist/**/index.html");

describe("no builder-facing text ships to students", () => {
  it("found pages to check", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const phrase of BANNED_PHRASES) {
    it(`never says "${phrase}" in a page body`, () => {
      const offenders = pages.filter((path) =>
        bodyTextOf(readFileSync(resolve(path), "utf8")).includes(phrase),
      );
      expect(offenders, `"${phrase}" found in: ${offenders.join(", ")}`).toEqual([]);
    });
  }
});
