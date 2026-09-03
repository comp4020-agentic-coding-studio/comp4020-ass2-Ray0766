import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The release calendar is the one place a prospective student sees the
// whole twelve-week shape at a glance. If the data selector regresses (wrong
// collection, wrong week filter, a broken gap calculation), this fails loud
// on the built page rather than silently under-listing weeks or duplicating
// the break.
const html = readFileSync(resolve("dist/index.html"), "utf8");

describe("home page release calendar", () => {
  it("renders one row per teaching week", () => {
    const weekRows = html.match(/<article class="release-calendar__week/g) ?? [];
    expect(weekRows).toHaveLength(12);
  });

  it("renders exactly one teaching break row", () => {
    const breakRows = html.match(/class="release-calendar__break"/g) ?? [];
    expect(breakRows).toHaveLength(1);
  });
});
