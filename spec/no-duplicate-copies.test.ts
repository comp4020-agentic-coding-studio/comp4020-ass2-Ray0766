import { globSync, readdirSync, readFileSync } from "node:fs";
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
 *
 * **And the bare `.injected` is not an exception, which is a correction.** This
 * check shipped exempting it --- "the legitimate `.injected` on its own stays
 * green, so this only ever names strays" --- under a commit subject saying
 * `pnpm check` now sees the marker that says the build is a lie. It did not: a
 * reviewer ran the whole suite against a deliberately broken build and got 48
 * files, 1,930 passed, 10 skipped, identical to the clean baseline, and that
 * number was then quoted back at me as evidence of a clean tree while an
 * injection was live.
 *
 * There is no such thing as a legitimate marker. The marker exists *because*
 * the build is a lie; it says so in its own first line. A suite that passes over
 * one has measured a build nobody should trust and reported on it in the same
 * words it uses for the real tree, and those are the words that get pasted into
 * a commit message. So: any `.injected*` in the root is red, the live one
 * included, and the message says which kind it found. The cost is that a full
 * `pnpm check` cannot be green while an injection is live --- which is the
 * intended reading of that run, not a side effect of it. A red run under an
 * injection is still perfectly usable as the red you went looking for: the
 * failure names itself and sits beside the one you were after.
 */
// `readdirSync` rather than a glob, and that is not a style choice: a `*` glob
// does not match a name beginning with a full stop, and `.injected` is the only
// file this is about. A glob here would have been permanently green about the
// one thing it exists for.
const rootEntries = readdirSync(".", { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

/** Any spelling of the marker, not the exact name and not only the copies. A
 *  guard that knows one spelling of "stop" is not a guard, and one that knows
 *  every spelling but the one the tool actually writes is not either.
 *
 *  Seen red three ways, each reverted:
 *
 *    a live injection, applied by the tool itself against the built stylesheet
 *    (`.backlot-piece{` -> `.backlot-piece,.backlot-week{`, matched 1 time):
 *      AssertionError: .injected --- receipts/rig-3d/inject.py's injection
 *      marker. An injection is live. **Nothing in this run is evidence about
 *      this tree** [...] index.DeCt-lYM.css as of 2026-09-15T05:49:37
 *    a stranded bare copy, `.injected 3` in the root with no `.injected`:
 *      AssertionError: .injected 3 --- [...] No plain .injected, only
 *      .injected 3 --- an iCloud copy of the marker outliving the original.
 *    and the control, the root with neither: 3 passed.
 *
 *  The first of those is the one that was green before this, and it is the one
 *  the whole thing exists for. */
const MARKER = /^\.injected/;

describe("iCloud conflict copies", () => {
  it("finds none under src/, public/ or spec/", () => {
    const copies = files.filter((path) => CONFLICT_COPY.test(path)).sort();
    expect(copies, `iCloud conflict copies --- delete them, keep the original:\n${copies.join("\n")}`).toEqual([]);
  });

  it("finds no injection marker in the repo root, of any spelling", () => {
    const markers = rootEntries.filter((name) => MARKER.test(name)).sort();
    const live = markers.includes(".injected");
    const copies = markers.filter((name) => CONFLICT_COPY.test(name) || CONFLICT_COPY_BARE.test(name));
    // The marker names what is patched. Print it: whoever reads this red needs
    // to know which file to revert, and the file is four lines long.
    let said = "";
    if (live) {
      // A revert landing between the listing and this read is a real race ---
      // one lane reverting while another runs the suite --- and the answer to
      // it is the sweep line below, not a stack trace where the message goes.
      try {
        said = readFileSync(".injected", "utf8").trim();
      } catch {
        said = "(the marker went away while this was reading it, which means a revert landed mid-run)";
      }
    }

    expect(
      markers,
      `${markers.join(", ")} --- receipts/rig-3d/inject.py's injection marker.\n\n` +
        (live
          ? `An injection is live. **Nothing in this run is evidence about this tree**: it is a ` +
            `measurement of a build that was broken on purpose, and it reports in the same words a ` +
            `clean run does. The marker says:\n\n${said}\n\n` +
            `Revert it when the red you went looking for has been read, and take the numbers again.`
          : `No plain .injected, only ${copies.join(" and ")} --- an iCloud copy of the marker outliving ` +
            `the original. Which direction that happened in decides whether the build is the one you ` +
            `think it is, and from here the two look identical.`) +
        `\n\nEither way:\n` +
        `  python3 /Users/ray/Desktop/Study/ANU-Master/8020/receipts/rig-3d/inject.py sweep\n` +
        `rebuilds the marker from the vault, which is the honest record of what is patched, and deletes ` +
        `it when nothing is.`,
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
