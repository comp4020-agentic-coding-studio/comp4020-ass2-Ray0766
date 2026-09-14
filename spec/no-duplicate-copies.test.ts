import { globSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This repo lives under ~/Desktop, which iCloud Drive syncs. When two devices
// touch the same file, iCloud resolves it by writing a second copy beside the
// original with a number appended to the stem --- "week-08 2.mdx" next to
// "week-08.mdx". Astro's content collections glob by extension, so that copy
// becomes a second entry with a colliding key, and a deck copy becomes a
// twelfth-and-a-half deck; both are silent until something downstream
// disagrees with itself. Nothing in the build looks for them, so this does.
const CONFLICT_COPY = / \d+\.[^/]+$/;

// And the same thing to a file with no extension, which the pattern above cannot
// see: "name 2" rather than "name 2.ts". It matters for exactly one file and that
// file is the reason this whole section exists --- see below.
const CONFLICT_COPY_BARE = / \d+$/;

// Only the trees a copy can actually change the site from. dist/ is rebuilt,
// node_modules/ is not mine, and .claude/ is worktrees.
const SEARCHED = ["src", "public", "spec"];

const files = SEARCHED.flatMap((dir) => globSync(`${dir}/**/*`, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => `${entry.parentPath}/${entry.name}`);

/**
 * The repo root, one level only.
 *
 * `receipts/rig-3d/inject.py` writes `.injected` here while an injection is live
 * and deletes it on revert, so a probe about to measure can refuse rather than
 * measure a deliberately broken build. iCloud copies it like anything else, and
 * **the dangerous shape is the copy outliving the original**: the injection
 * rolled back, `.injected` gone, `.injected 3` left behind carrying the warning.
 * A reader matching the exact name then reads "clean" against a tree that is
 * fine, which is harmless --- but a reader matching the exact name while
 * `.injected 4` is the *live* marker reads clean against a broken build, which is
 * not.
 *
 * It has happened four times in one day: `.injected 2`, then `.injected 3` and
 * `.injected 4` together with no `.injected` at all, and once more during a gate
 * run. Nothing in `pnpm check` saw any of it --- the root is not in `SEARCHED`
 * and a bare `.injected 3` matches neither pattern above.
 */
// `readdirSync` rather than a glob, and that is not a style choice: a `*` glob
// does not match a name beginning with a full stop, and `.injected` is the only
// file this is about. A glob here would have been permanently green about the
// one thing it exists for.
const rootEntries = readdirSync(".", { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

/** Any spelling of the marker, not the exact name. A guard that knows one
 *  spelling of "stop" is not a guard. */
const MARKER = /^\.injected/;

describe("iCloud conflict copies", () => {
  it("finds none under src/, public/ or spec/", () => {
    const copies = files.filter((path) => CONFLICT_COPY.test(path)).sort();
    expect(copies, `iCloud conflict copies --- delete them, keep the original:\n${copies.join("\n")}`).toEqual([]);
  });

  it("finds no stranded injection marker in the repo root", () => {
    const strays = rootEntries
      .filter((name) => MARKER.test(name))
      .filter((name) => CONFLICT_COPY.test(name) || CONFLICT_COPY_BARE.test(name))
      .sort();
    expect(
      strays,
      `${strays.join(", ")} --- an iCloud copy of receipts/rig-3d/inject.py's injection marker. If an ` +
        `injection is live, revert it; if one is not, this is a stranded copy and the build may or may not ` +
        `be the one you think. Either way run\n` +
        `  python3 /Users/ray/Desktop/Study/ANU-Master/8020/receipts/rig-3d/inject.py sweep\n` +
        `which rebuilds the marker from the vault and deletes it when nothing is injected.`,
    ).toEqual([]);
  });

  it("searched a tree that actually has files in it", () => {
    // A glob that silently matches nothing would make the check above pass
    // forever. Assert the search found the repo before trusting its verdict.
    expect(files.length).toBeGreaterThan(100);
    // And the root listing separately, because it is a different read with a
    // different failure: a `*` glob does not match a dotfile, so a glob here
    // would be permanently green about the one file it exists for.
    expect(rootEntries, "the root glob matched no files, so the marker check is about nothing").toContain(
      "package.json",
    );
  });
});
