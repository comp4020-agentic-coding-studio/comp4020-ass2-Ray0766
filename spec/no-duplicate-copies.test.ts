import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This repo lives under ~/Desktop, which iCloud Drive syncs. When two devices
// touch the same file, iCloud resolves it by writing a second copy beside the
// original with a number appended to the stem --- "week-08 2.mdx" next to
// "week-08.mdx". Astro's content collections glob by extension, so that copy
// becomes a second entry with a colliding key, and a deck copy becomes a
// twelfth-and-a-half deck; both are silent until something downstream
// disagrees with itself. Nothing in the build looks for them, so this does.
const CONFLICT_COPY = / \d+\.[^/]+$/;

// Only the trees a copy can actually change the site from. dist/ is rebuilt,
// node_modules/ is not mine, and .claude/ is worktrees.
const SEARCHED = ["src", "public", "spec"];

const files = SEARCHED.flatMap((dir) => globSync(`${dir}/**/*`, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => `${entry.parentPath}/${entry.name}`);

describe("iCloud conflict copies", () => {
  it("finds none under src/, public/ or spec/", () => {
    const copies = files.filter((path) => CONFLICT_COPY.test(path)).sort();
    expect(copies, `iCloud conflict copies --- delete them, keep the original:\n${copies.join("\n")}`).toEqual([]);
  });

  it("searched a tree that actually has files in it", () => {
    // A glob that silently matches nothing would make the check above pass
    // forever. Assert the search found the repo before trusting its verdict.
    expect(files.length).toBeGreaterThan(100);
  });
});
