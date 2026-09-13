// The suite ran. All of it.
//
// This exists because of one run of `vitest run spec` that printed
// "Tests 1210 passed" with spec/backlot-contrast.test.ts contributing **zero**
// of them: a backtick inside a `String.raw` probe closed the template early,
// the file failed to transform, and 68 checks — every rendered-pixel contrast
// reading on the backlot's HUD — simply were not there. The file-level FAIL was
// in the output and the number I read was not. That is the purest form of the
// failure this repo keeps meeting: green about nothing.
//
// A test cannot assert that a file which failed to load contains anything, so
// this does not try. It parses every spec file with the TypeScript compiler the
// repo already depends on — no execution, no browsers — and fails on a syntax
// error before the runner ever gets to it, naming the file and the line. Then it
// counts the declarations in each, so a file that parses and has been emptied is
// caught too.
//
// Three of this round's checks were written with probes in `String.raw`
// templates, and backticks inside their comments have closed those templates
// three separate times. It is a cheap mistake to make and an expensive one to
// notice.
//
// Four, now, and the fourth is the reason this file should not be deleted the
// day it looks like overhead. It was introduced while *fixing* a check that an
// independent review had shown could not go red — a comment explaining how to
// resolve a token, with the function name in backticks, inside a String.raw
// probe. The file stopped parsing, contributed zero tests, and the runner's
// summary line would have said the suite passed. This check named the file and
// the line before the runner got there. It has now paid for itself three times
// in one round, twice on somebody's careful work and once on somebody's fix to
// a check about checks that cannot go red.

// Seen red by putting a backtick back inside one of those probe comments and
// reverting:
//   AssertionError: a spec file that does not parse contributes zero tests and
//   the summary line still says everything passed. An unmatched backtick inside
//   a String.raw probe is how this happens here.: expected [ …(2) ] to deeply
//   equal []
//   + "spec/backlot-contrast.test.ts:295 ',' expected."
// With the same bug in place the runner on its own said
// `spec/backlot-contrast.test.ts (0 test)` on one line and
// `Tests 1210 passed` on another, which is the pair this file exists to break up.

// ---------------------------------------------------------------------------
// And the typecheck fails on a hint, which is the cheap half of a different
// problem
// ---------------------------------------------------------------------------
//
// `pnpm typecheck` is `astro check`, and `pnpm check` is that plus the suite.
// Until now `astro check` printed its hints and exited 0, so a hint was a thing
// nothing ever failed on. It now runs with `--minimumFailingSeverity hint` and
// a hint stops the run.
//
// **The reasoning is here rather than only in a commit, because package.json is
// JSON and cannot hold a comment, and because the wrong lesson is easy to draw
// from this change.** It is a cheap half-measure, and the expensive half it does
// not replace is `spec/backlot-exports.test.ts`.
//
// This round produced three dead symbols. Failing on hints would have caught
// exactly one:
//
//   src/backlot/engine/hub.ts   NAME_RADIUS           orphaned when the floor
//                                                     names came out. ts(6133),
//                                                     "declared but its value is
//                                                     never read" — a hint, and
//                                                     the only one of the three
//                                                     any compiler setting sees.
//   src/backlot/engine/signage.ts  Signwriter.floorName   declared on the
//                                                     interface, fully
//                                                     implemented, called by
//                                                     nothing. TypeScript has no
//                                                     notion of an unused
//                                                     interface member, so no
//                                                     value of --noUnusedLocals
//                                                     would ever have mentioned
//                                                     it.
//   src/backlot/engine/signage.ts  name(label, board)   a parameter with one
//                                                     value at one call site.
//                                                     The `false` branch drew
//                                                     the floor markings, the
//                                                     floor markings went, and
//                                                     the branch stayed. The
//                                                     parameter is read inside
//                                                     the function, so it is not
//                                                     unused by any definition a
//                                                     compiler has.
//
// So the ceiling of this setting is one in three, and the two it cannot see are
// the two that would have gone on shipping. What found all three was a check
// that walks the exported surface and fails on a name nothing reachable from the
// page reads — `spec/backlot-exports.test.ts`, which also found `Hotspot.setLabel`,
// the exact shape of `floorName`, on its first honest run.
//
// **Nobody should delete the expensive half on the strength of the cheap one.**
// A hint is the compiler noticing a name in a file that nothing in that file
// mentions again; it is silent about a name that is mentioned once, by the
// declaration that keeps it alive. Those are different questions and only one of
// them has a compiler flag.
//
// The check below asserts the flag is on. It is a check about a script rather
// than about code, which is a small thing to test — but the flag is one word in
// a JSON file with no comment next to it, and the failure mode of losing it is
// that everything goes on passing.
//
// Seen red by putting `"typecheck": "astro check"` back:
//
//   AssertionError: package.json runs the typecheck as `astro check`, which
//   prints hints and exits 0 — so a hint is a thing nothing ever fails on. It
//   needs --minimumFailingSeverity hint.: expected 'astro check' to contain
//   '--minimumFailingSeverity hint'
//
// And the flag itself was seen to work, rather than assumed: an unused import
// added to this file made `astro check` report "0 errors, 0 warnings, 1 hint"
// and exit **0**, and `astro check --minimumFailingSeverity hint` report the
// same line and exit **1**. Both runs are in receipts/rig-3d/a3-checks.md.

import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Found, never listed: a hand-kept enumeration goes quiet the day somebody
 *  adds a file, which is the same failure one level up. */
const SPEC_FILES = globSync("spec/**/*.test.ts").sort();
const LIB_FILES = globSync("spec/lib/*.ts").sort();

const source = (path: string) => readFileSync(resolve(path), "utf8");

describe("every spec file is a file the runner can load", () => {
  it("found the suite", () => {
    expect(SPEC_FILES.length, "no spec files matched, so this check is about nothing").toBeGreaterThan(10);
  });

  for (const file of [...SPEC_FILES, ...LIB_FILES]) {
    it(`${file} parses`, () => {
      const parsed = ts.createSourceFile(file, source(file), ts.ScriptTarget.ESNext, true);
      // `parseDiagnostics` is not on the public type, and it is the only place
      // the compiler puts syntax errors when it is used this way.
      const diagnostics = (parsed as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
      const trouble = diagnostics.map((diagnostic) => {
        const at = diagnostic.start ?? 0;
        const { line } = parsed.getLineAndCharacterOfPosition(at);
        return `${file}:${line + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
      });
      expect(
        trouble,
        "a spec file that does not parse contributes zero tests and the summary line still says " +
          "everything passed. An unmatched backtick inside a String.raw probe is how this happens here.",
      ).toEqual([]);
    });
  }

  for (const file of SPEC_FILES) {
    it(`${file} declares tests`, () => {
      const text = source(file);
      const declarations = [...text.matchAll(/^\s*(?:it|test)(?:\.each\([\s\S]*?\))?\s*\(/gm)].length;
      expect(
        declarations,
        `${file} declares no tests, so it can only ever report success`,
      ).toBeGreaterThan(0);
    });
  }
});

describe("the typecheck fails on a hint", () => {
  const scripts = (JSON.parse(source("package.json")) as { scripts: Record<string, string> }).scripts;

  it("runs astro check at hint severity", () => {
    expect(
      scripts.typecheck ?? "",
      "package.json runs the typecheck as " +
        JSON.stringify(scripts.typecheck ?? "") +
        ", which prints hints and exits 0 — so a hint is a thing nothing ever fails on. It needs " +
        "--minimumFailingSeverity hint. The flag's ceiling, and the check it does not replace, are argued at the " +
        "top of this file.",
    ).toContain("--minimumFailingSeverity hint");
  });

  it("folds that into the one command anybody runs", () => {
    // `pnpm check` is the gate. A typecheck that fails on hints and a `check`
    // that does not run it is the flag switched on somewhere nobody looks.
    expect(scripts.check ?? "", `package.json's check script is ${JSON.stringify(scripts.check ?? "")}`).toContain(
      "typecheck",
    );
  });

  it("keeps the expensive half of the same job", () => {
    // The cheap half catches one dead symbol in three. The file that catches
    // the other two is named here so that deleting it fails rather than
    // quietly halving what this repo can see.
    expect(
      SPEC_FILES,
      "spec/backlot-exports.test.ts is gone. It is the half of the dead-code question no compiler setting can " +
        "answer — an unused interface member and a parameter with one value at one call site are invisible at " +
        "every level of --noUnusedLocals — and the hint flag above was only ever the cheap third of it.",
    ).toContain("spec/backlot-exports.test.ts");
  });
});
