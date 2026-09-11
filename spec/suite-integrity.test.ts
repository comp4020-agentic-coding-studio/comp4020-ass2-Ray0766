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
