// Nothing in src/backlot/ is exported for nobody.
//
// This exists because one round produced three dead things and only one of them
// was visible to any tool. All three are described below **as they were found**,
// which is the only tense this file is allowed to use about anything outside it
// — the three have long since been dealt with one way or another, and nothing
// here tracks that or should be read as claiming it:
//
//   `reachFor` in a spec file        a local, orphaned when the published rects
//                                    replaced the radius it computed. TypeScript
//                                    names this one — as a *hint*, which does not
//                                    fail a build, so nothing would have
//                                    mentioned it again.
//   `Signwriter.floorName`           a public method on an interface, fully
//                                    implemented, called by nothing. TypeScript
//                                    has **no notion of an unused interface
//                                    member**: no setting of --noUnusedLocals at
//                                    any level would ever have named it.
//   `name(label, board)`             a parameter with one value at its one call
//                                    site. The false branch drew the floor
//                                    marking, the markings came out, the branch
//                                    stayed. That is CLAUDE.md §7's "a branch
//                                    nobody has watched execute is a comment",
//                                    except this one could not be watched,
//                                    because nothing could reach it.
//
// Two of those three are invisible to the compiler at every level, so the answer
// cannot be a diagnostic setting. It has to be a check that walks what the
// engine exports and asks what reaches it.
//
// The scope comes off the filesystem, never a list. spec/palette.test.ts already
// paid for that lesson — fourteen stylesheets named by hand, five never checked,
// and an accent painted as an outline found on the first run after it became a
// glob. A dead-code check with a hand-kept scope would be the joke writing
// itself.
//
// ---------------------------------------------------------------------------
// The two judgements, which are mine and are here rather than in a receipt
// ---------------------------------------------------------------------------
//
// **What counts as a use.** Reachability from the page, not "somebody imports
// it". The walk starts at src/backlot/page/boot.ts — the module the backlot page
// actually loads — and follows imports. An export imported only by a module that
// is itself unreachable is not used by anything that ships, and saying so is the
// whole point: a dead module's imports would otherwise keep a whole subtree
// alive and the check would find nothing the day it mattered most. It costs
// nothing in precision, because the unreachable module is reported too, and its
// own name is the more useful thing to read first.
//
// And a name used inside the module that declares it is not dead, whatever the
// `export` keyword in front of it suggests. That is at most needlessly public —
// a smaller complaint, already covered by TypeScript's unused-local hint, and
// not what any of the three cases above were. Every runtime export this check
// named on its first run was of that kind, and reporting them would have buried
// the two findings no other tool can make.
//
// A spec file is not a use. Nothing under spec/ ships, so an export that only
// spec imports is an export the site does not have — with one exception below,
// which is a **type**: a type costs no bytes, and spec importing one is spec
// holding the engine to its own contract, which is the arrangement this repo
// wants. Runtime exports get no such pass.
//
// **What it does about a legitimately unreferenced export.** An allowlist, and
// it is a list of *reasons* rather than of names — every entry says why, and
// every entry is **checked to still be needed**. An allowlist that silently
// keeps forgiving something that has since been wired up is a hand-kept scope
// again, one level down; this one fails when an entry stops being necessary, so
// it cannot rot in the quiet direction either.
//
// ---------------------------------------------------------------------------
// Seen red
// ---------------------------------------------------------------------------
//
// By deleting a use rather than by adding a dead export, which is the direction
// the failure actually arrives from. Five, each a source edit reverted — this check reads source, not the bundle, so nothing here needs a
// minified anchor.
//
// Dropping the `createSignwriter` import from src/backlot/engine/hub.ts:
//
//   AssertionError: src/backlot/engine/signage.ts exports createSignwriter and
//   nothing that ships imports it. Either something should, or it should not be
//   exported — a public name nobody reaches is a promise to a caller that does
//   not exist.: expected [ Array(1) ] to deeply equal []
//   (1 failed | 7 passed)
//
// Turning the dynamic `await import("./graph-texture")` in machine-room.ts into
// a resolved literal:
//
//   AssertionError: 1 module(s) under src/backlot/ cannot be reached from the
//   page: src/backlot/rooms/graph-texture.ts.: expected [ Array(1) ] to deeply
//   equal []
//   (1 failed | 7 passed)
//
// And on the interface half, by deleting every call to a live member —
// `entry.handle.setRect(…)` in hotspots.ts:
//
//   AssertionError: Hotspot.setRect is declared in the backlot's own types and
//   nothing that ships reads it. TypeScript has no notion of an unused interface
//   member, so this is the only thing that will ever say so. All of them:
//   Hotspot.setRect.: expected [ 'Hotspot.setRect' ] to deeply equal []
//   (1 failed | 7 passed)
//
// And the two the review found, both of which the name-matching version passed:
//
// Cutting the one real consumer of `buildRoomShell` in machine-room.ts, leaving
// only the re-export in rooms/index.ts that nothing imports from:
//
//   AssertionError: src/backlot/rooms/shell.ts exports buildRoomShell and
//   nothing that ships reads it.: expected [ Array(1) ] to deeply equal []
//   (2 failed | 6 passed — the members only that export reached go with it)
//
// Deleting both real calls to `hub.find(…)` in index.ts:
//
//   AssertionError: Hub.find is declared in the backlot's own types and nothing
//   that ships reads it. All of them: HubDoor.standing, HubDoor.outward,
//   Hub.find.: expected [ …(3) ] to deeply equal []
//   (1 failed | 7 passed)
//
// That second one is the whole argument for the checker. `find` appears 72 times
// as a property name inside src/backlot/ — fourteen of them `Array.prototype.find`
// — so the version that matched names stayed green with both of `Hub.find`'s
// callers gone.
//
// Two of the first three took a second attempt, and both failures were the
// check's own instrument rather than the injection. The first version of the member walk
// counted *every* identifier, so an interface's own signature and the object
// literal implementing it both read as uses and the member half was vacuous; and
// the first probe for it deleted `signs.spill()`, which hub.ts also has a local
// variable called, so the name stayed alive and the injection was a no-op. Both
// were caught by the red not arriving, which is the only thing that catches
// them.

import { globSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Found, never listed. */
const SOURCES = globSync("src/backlot/**/*.ts").sort();

/** The module the backlot page loads. Everything that ships is reachable from
 *  here or from a page that imports into it; anything that is not is dead
 *  whatever else imports it. */
const ENTRY = "src/backlot/page/boot.ts";

/** Reasons, not names. Each entry is checked to still be necessary, so the list
 *  cannot quietly keep forgiving something that has since been wired up — and
 *  the count is checked too, so it can only ever shrink.
 *
 *  **What this comment is allowed to say**, because it has twice said something
 *  else and been wrong both times. It may say what the list contains and why
 *  each entry is on it — that is checkable against the data three lines below,
 *  and the staleness test checks it on every run. It may carry numbers the file
 *  itself holds, like the ceiling's history.
 *
 *  It may **not** narrate what has happened elsewhere in the repo. "So-and-so
 *  has since been deleted", "lane 1 took it", "they are out of this list and not
 *  yet out of the engine" — nothing here can verify any of those, and all three
 *  were written. Twice the sentence claimed a deletion that had not happened,
 *  and both times it was written in the same breath as deciding the deletion
 *  should happen: the deciding is what got remembered and the doing did not.
 *  Lane 2 caught the first, the staleness guard caught the second. A file whose
 *  data and whose prose disagree is the "compiles and lies" shape one level up
 *  from the code, and the prose is always the half that is wrong.
 *
 *  So an entry says what the member is, why nothing reaches it, and whose file
 *  it is in. When it stops being needed the staleness test says so and it comes
 *  out. Nothing here tells a story about that happening. */
const ALLOWED: Record<string, string> = {

  // Public members of the engine's own interfaces that nothing reads. They
  // arrived together when this check stopped matching names and started
  // resolving symbols, which is the honest consequence of fixing an instrument:
  // it finds what the blunt one could not. Every one is a debt with an owner,
  // none is a dispensation, and the ceiling below is what keeps it that way.
  //
  // No count in this sentence on purpose. The count is ALLOWED_CEILING, which is
  // one number in one place that a test compares against the list itself.
  "src/backlot/engine/types.ts#Hotspot.id":
    "on the handle and read by nothing — the button carries its id as a data attribute and that is what " +
    "everything actually reads. Owner: lane 1.",
  "src/backlot/engine/types.ts#VideoHandle.pause":
    "the clip handle's own controls, neither of them read; `element.pause()` elsewhere is HTMLMediaElement's " +
    "and a different symbol, which is exactly what the old name-matching check could not tell apart. " +
    "Owner: lane 1.",
  "src/backlot/engine/types.ts#VideoHandle.playing": "as VideoHandle.pause. Owner: lane 1.",
  "src/backlot/engine/types.ts#PlayerApi.facing":
    "figure state published and never read. Owner: lane 1.",
  "src/backlot/engine/player.ts#Figure.moving": "as PlayerApi.facing. Owner: lane 1.",
  "src/backlot/rooms/shell.ts#RoomShell.frames":
    "the shell's returned handles, neither read. Owner: lane 2.",
  "src/backlot/rooms/shell.ts#RoomShell.hotspots": "as RoomShell.frames. Owner: lane 2.",
  "src/backlot/rooms/graph-texture.ts#GraphScreen.aspect":
    "returned by createGraphScreen and read by nothing. Owner: lane 2.",
  "src/backlot/rooms/graph-texture.ts#GraphScreen.redraw": "as GraphScreen.aspect. Owner: lane 2.",
  "src/backlot/engine/input.ts#Input.update":
    "never called; `player.update` and `hub.update` are different symbols. Owner: lane 1.",
};

/** The list may only shrink, and this is the line that makes that true — with
 *  one exception, named here because the file has already taken it, and a rule a
 *  file quietly breaks is worse than a rule it does not have.
 *
 *  **The ceiling may be raised only in the same change that sharpens the
 *  instrument, and never to make room for something the current instrument
 *  found.** It went from 5 to 14 in one change, and that change was this check
 *  giving up name matching for symbol resolution, and the members it then found
 *  were every one of them invisible to the version running an hour earlier. That is a re-baseline, not a dispensation — the debts did not
 *  appear, the eyesight did. A raise for any other reason is somebody making
 *  room, which is the thing the ceiling exists to stop.
 *
 *  Every raise keeps the number it came from, here, so the history reads without
 *  going to the log: **5 -> 2 -> 14 -> 13 -> 12 -> 10**. That is a number this
 *  file carries and a test compares against the list, which is why it belongs in
 *  a comment; what took each entry off does not, and is not written down here.
 *
 *  Every fall in that sequence was the mechanism rather than anybody's memory:
 *  an entry whose reason had come to describe a deletion, or one the staleness
 *  test named because something had started reading it. Neither needed a person
 *  to notice, which is the whole design.
 *
 *  Read this before raising it, because the first person here under time
 *  pressure will want to. An allowlist anybody can extend is the hand-kept scope
 *  this whole file exists to argue against — it goes quiet exactly when the code
 *  grows, and it goes quiet without saying so, which is the failure
 *  spec/palette.test.ts already paid for one level up. A list that can only
 *  shrink is a different object: every entry is a debt with an owner's name on
 *  it, and the only way to make the number go down is to deal with one.
 *
 *  If something new turns up here, the answer is to fix it, hand it to whoever
 *  owns that file, or argue that the check is wrong and change the check. It is
 *  not to make room. */
const ALLOWED_CEILING = 10;

// ---------------------------------------------------------------------------
// The program, and why this is not a name search
// ---------------------------------------------------------------------------
//
// The first version of this matched names: a set of every `.something` read
// anywhere, and a set of every bare identifier. Both halves were broken and an
// independent review broke them in one sitting.
//
//   A re-export nobody consumes laundered a whole module. `rooms/index.ts` says
//   `export { buildRoomShell } from "./shell"` and nothing imports that name
//   from `../rooms` — but the walker recorded a re-export as taking `*`, so that
//   one line marked **every runtime export of shell.ts** used, permanently.
//
//   Ordinary property names shielded interface members. `propertyReads` was flat
//   and global, so `.find`, `.id`, `.width` and `.dispose` on arrays, DOM nodes
//   and three.js objects all landed in it. Of 239 exported members, `id`
//   appeared 256 times, `width` 98, `find` 72. Deleting both real calls to
//   `Hub.find` — public, implemented, called by nothing — left the suite green,
//   because fourteen unrelated `Array.prototype.find` calls supplied the name.
//
// The second of those is the `Signwriter.floorName` shape walking back in
// through the check written to catch it, which is as clear a signal as this
// repo gets that the instrument was wrong. A name is not an identity. So this
// asks the **type checker** instead: every read is resolved to the symbol it
// actually refers to, aliases followed, and an export or a member is used when
// something reads *that symbol*. `.find` on an array is a different symbol from
// `Hub.find`, and a re-export is not a read of anything.
const PROGRAM = (() => {
  const config = ts.readConfigFile("tsconfig.json", (path) => readFileSync(path, "utf8"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve("."));
  return ts.createProgram(parsed.fileNames, parsed.options);
})();
const CHECKER = PROGRAM.getTypeChecker();

const root = resolve(".").replace(/\\/g, "/");
const asProjectPath = (fileName: string) => relative(root, fileName).replace(/\\/g, "/");

/** A symbol's identity, stable inside one program: where it is declared. */
function identify(symbol: ts.Symbol | undefined): string | null {
  if (!symbol) return null;
  const resolved =
    symbol.flags & ts.SymbolFlags.Alias ? (() => {
      try {
        return CHECKER.getAliasedSymbol(symbol);
      } catch {
        return symbol;
      }
    })() : symbol;
  const declaration = resolved.declarations?.[0];
  if (!declaration) return null;
  return `${asProjectPath(declaration.getSourceFile().fileName)}@${declaration.pos}`;
}

/** Is this identifier the *name* of a declaration, an import specifier or an
 *  export specifier rather than a read of something?
 *
 *  Import and export specifiers are deliberately not reads. Importing a name and
 *  never using it is not a use — TypeScript's own unused-import hint covers that
 *  — and re-exporting one is not a use either, which is the whole of E1: a name
 *  passed along for nobody should not keep anything alive. */
function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node };
  if (!parent) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent)) return true;
  if (ts.isNamespaceImport(parent) || ts.isNamespaceExport(parent)) return true;
  if (parent.name !== node) return false;
  return (
    ts.isVariableDeclaration(parent) ||
    ts.isFunctionDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isEnumMember(parent) ||
    ts.isParameter(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isBindingElement(parent)
  );
}

/** What one node reads, as symbol identities.
 *
 *  A property access is asked twice, and the second question is the one that
 *  matters. `getSymbolAtLocation` on `x.p` answers with whatever declared `p` on
 *  the *value* — which for an object literal implementing an interface is the
 *  literal's own property, not the interface's. So the type of `x` is asked for
 *  its property `p` as well, which is what connects `engine.dispose()` to
 *  `BacklotEngine.dispose` and `entry.handle.setLabel(...)` to `Hotspot.setLabel`.
 *  Without it this reported thirty-four live members as dead, which is a check
 *  nobody would use twice.
 *
 *  Destructuring is the same question in different syntax. `const { canvas, hud }
 *  = options` declares two locals and reads two properties, and only the first
 *  half is an identifier the naive walk would have looked at. */
function readsAt(node: ts.Node): string[] {
  const found: string[] = [];
  const push = (symbol: ts.Symbol | undefined) => {
    const id = identify(symbol);
    if (id) found.push(id);
  };

  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
    push(CHECKER.getSymbolAtLocation(node.name));
    const owner = CHECKER.getTypeAtLocation(node.expression);
    push(CHECKER.getPropertyOfType(owner, node.name.text));
  }

  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const property = node.propertyName ?? node.name;
    if (ts.isIdentifier(property)) {
      const owner = CHECKER.getTypeAtLocation(node.parent);
      push(CHECKER.getPropertyOfType(owner, property.text));
    }
  }

  if (ts.isShorthandPropertyAssignment(node)) {
    push(CHECKER.getShorthandAssignmentValueSymbol(node));
  }

  if (ts.isIdentifier(node) && !isDeclarationName(node)) {
    push(CHECKER.getSymbolAtLocation(node));
  }
  return found;
}

/** Every symbol read by something that ships, and every symbol read by the
 *  suite, kept apart so a type can be forgiven for having only the suite and a
 *  runtime export cannot. */
const readByShipping = new Set<string>();
const readBySpec = new Set<string>();

for (const file of PROGRAM.getSourceFiles()) {
  if (file.isDeclarationFile) continue;
  const path = asProjectPath(file.fileName);
  const ships = path.startsWith("src/");
  const suite = path.startsWith("spec/");
  if (!ships && !suite) continue;
  const into = ships ? readByShipping : readBySpec;
  const walk = (node: ts.Node) => {
    for (const id of readsAt(node)) into.add(id);
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(file, walk);
}

/** Which module reads a symbol, so "used only inside its own file" can be told
 *  from "used nowhere". The first is needlessly public, which TypeScript's own
 *  unused-local hint already covers; only the second is dead. */
const readOutsideOwnFile = new Set<string>();
for (const file of PROGRAM.getSourceFiles()) {
  if (file.isDeclarationFile) continue;
  const path = asProjectPath(file.fileName);
  if (!path.startsWith("src/") && !path.startsWith("spec/")) continue;
  const walk = (node: ts.Node) => {
    for (const id of readsAt(node)) {
      if (!id.startsWith(`${path}@`)) readOutsideOwnFile.add(id);
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(file, walk);
}

const read = (path: string) => readFileSync(resolve(path), "utf8");

/** Resolve a relative import to a path in SOURCES, or null for a package. */
function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier).replace(/\\/g, "/");
  const asRelative = relative(root, base).replace(/\\/g, "/");
  for (const candidate of [asRelative, `${asRelative}.ts`, asRelative.replace(/\.js$/, ".ts"), `${asRelative}/index.ts`]) {
    if (SOURCES.includes(candidate)) return candidate;
  }
  return null;
}

/** Everything under src/ that the compiler knows about, plus the pages, which
 *  are where the backlot is actually loaded from: `src/pages/backlot/index.astro`
 *  imports the manifest in its frontmatter and never goes near the island. */
const SITE = globSync("src/**/*.astro").sort();

const astroFrontmatter = (path: string) => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(path));
  return match ? match[1]! : "";
};

/** The one thing the checker cannot see: an Astro page. `.astro` is not in the
 *  program, so a name a page imports in its frontmatter resolves to no symbol at
 *  all — and `src/pages/backlot/index.astro` is what actually loads the backlot,
 *  importing the manifest there and never going near the island. Matched by name
 *  rather than by symbol, which is the weaker instrument and is scoped to
 *  exactly the files the strong one cannot reach. */
const readByPages = new Set<string>();
for (const path of SITE) {
  const file = ts.createSourceFile(path, astroFrontmatter(path), ts.ScriptTarget.ESNext, true);
  for (const node of file.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const target = resolveImport(path, node.moduleSpecifier.text);
    if (!target) continue;
    const clause = node.importClause;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        readByPages.add(`${target}#${(element.propertyName ?? element.name).text}`);
      }
    } else if (clause?.namedBindings) {
      readByPages.add(`${target}#*`);
    }
  }
}
const readByPage = (path: string, name: string) =>
  readByPages.has(`${path}#${name}`) || readByPages.has(`${path}#*`);

// ---------------------------------------------------------------------------
// Reachability, which is a question about modules rather than about names
// ---------------------------------------------------------------------------


/** Which backlot modules each file imports, static and dynamic alike. The
 *  dynamic half is not a detail: `machine-room.ts` reaches the graph texture
 *  with `await import("./graph-texture")`, and a walker that followed only
 *  static declarations called 5.4 kB the page demonstrably loads dead. */
function importsOf(path: string, text?: string): string[] {
  const file = ts.createSourceFile(path, text ?? read(path), ts.ScriptTarget.ESNext, true);
  const found: string[] = [];
  const walk = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const target = resolveImport(path, node.moduleSpecifier.text);
      if (target) found.push(target);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const target = resolveImport(path, node.arguments[0].text);
      if (target) found.push(target);
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(file, walk);
  return found;
}

const reachable = (() => {
  const seen = new Set<string>();
  const queue = [ENTRY];
  for (const file of PROGRAM.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const path = asProjectPath(file.fileName);
    if (!path.startsWith("src/") || path.startsWith("src/backlot/")) continue;
    queue.push(...importsOf(path, file.getFullText()));
  }
  for (const path of SITE) queue.push(...importsOf(path, astroFrontmatter(path)));
  while (queue.length) {
    const path = queue.pop()!;
    if (!SOURCES.includes(path) || seen.has(path)) continue;
    seen.add(path);
    queue.push(...importsOf(path));
  }
  return seen;
})();

// ---------------------------------------------------------------------------
// What each module exports, read off the AST
// ---------------------------------------------------------------------------

interface Exported {
  name: string;
  typeOnly: boolean;
  id: string | null;
}

interface Shape {
  name: string;
  members: { name: string; id: string | null }[];
}

function surfaceOf(path: string): { exports: Exported[]; shapes: Shape[] } {
  const file = PROGRAM.getSourceFile(resolve(path));
  const exports: Exported[] = [];
  const shapes: Shape[] = [];
  if (!file) return { exports, shapes };
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

  for (const node of file.statements) {
    if (!exported(node)) continue;
    const add = (name: ts.Identifier, typeOnly: boolean) =>
      exports.push({ name: name.text, typeOnly, id: identify(CHECKER.getSymbolAtLocation(name)) });
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name, false);
      }
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      add(node.name, false);
    } else if (ts.isInterfaceDeclaration(node)) {
      add(node.name, true);
      shapes.push({
        name: node.name.text,
        members: node.members
          .filter((member) => member.name && ts.isIdentifier(member.name))
          .map((member) => ({
            name: (member.name as ts.Identifier).text,
            id: identify(CHECKER.getSymbolAtLocation(member.name as ts.Identifier)),
          })),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      add(node.name, true);
    } else if (ts.isEnumDeclaration(node)) {
      add(node.name, false);
    }
  }
  return { exports, shapes };
}

const SURFACE = new Map(SOURCES.map((path) => [path, surfaceOf(path)]));

const key = (path: string, name: string) => `${path}#${name}`;

describe("the backlot exports nothing for nobody", () => {
  it("found the engine, an entry into it, and a program to resolve it with", () => {
    // The floor. A glob that matched nothing, or a program that failed to load,
    // would make every assertion below true of an empty set — which is the
    // failure this whole file is about.
    expect(SOURCES.length, "no backlot source matched, so this check is about nothing").toBeGreaterThan(10);
    expect(SOURCES, `${ENTRY} is the entry everything is reached from`).toContain(ENTRY);
    expect(reachable.size, "nothing is reachable from the entry, so the walk did not run").toBeGreaterThan(5);
    expect(readByShipping.size, "no symbol reads were resolved, so the checker did not run").toBeGreaterThan(200);
  });

  it("reaches every module it ships", () => {
    const stranded = SOURCES.filter((path) => !reachable.has(path));
    expect(
      stranded,
      `${stranded.length} module(s) under src/backlot/ cannot be reached from the page: ${stranded.join(", ")}. ` +
        `A module the page cannot load is dead whatever imports it, and its own name is the more useful thing ` +
        `to read before any export inside it.`,
    ).toEqual([]);
  });

  it("has a use for every runtime export", () => {
    const dead: string[] = [];
    for (const path of reachable) {
      for (const entry of SURFACE.get(path)!.exports) {
        if (entry.typeOnly || !entry.id) continue;
        if (readByShipping.has(entry.id)) continue;
        if (readByPage(path, entry.name)) continue;
        if (ALLOWED[key(path, entry.name)]) continue;
        dead.push(key(path, entry.name));
      }
    }
    expect(
      dead,
      dead.length === 0
        ? ""
        : `${dead[0]!.split("#")[0]} exports ${dead[0]!.split("#")[1]} and nothing that ships reads it. ` +
          `Either something should, or it should not be exported — a public name nobody reaches is a promise ` +
          `to a caller that does not exist. All of them: ${dead.join(", ")}.`,
    ).toEqual([]);
  });

  it("has a use for every exported type, counting the suite as a consumer", () => {
    // A type costs no bytes and the suite importing one is the suite holding the
    // engine to its own contract, which is the arrangement this repo wants.
    // Runtime exports get no such pass, which is the test above.
    const dead: string[] = [];
    for (const path of reachable) {
      for (const entry of SURFACE.get(path)!.exports) {
        if (!entry.typeOnly || !entry.id) continue;
        if (readByShipping.has(entry.id) || readBySpec.has(entry.id)) continue;
        if (readByPage(path, entry.name)) continue;
        if (ALLOWED[key(path, entry.name)]) continue;
        dead.push(key(path, entry.name));
      }
    }
    expect(
      dead,
      `${dead.length} exported type(s) are read by nothing, not even the suite: ${dead.join(", ")}`,
    ).toEqual([]);
  });

  it("has a reader for every member of every interface it exports", () => {
    // The case no compiler setting reaches. `Signwriter.floorName` was a public
    // method, fully implemented, called by nothing — and TypeScript has no
    // notion of an unused interface member at any strictness.
    //
    // By symbol, not by name. A flat set of every `.something` read in the
    // project had `find` in it 72 times and `id` 256, so `Hub.find` — public,
    // implemented, called by nothing — was shielded by fourteen unrelated
    // `Array.prototype.find` calls and the check stayed green with both of its
    // real callers deleted.
    const dead: string[] = [];
    for (const path of reachable) {
      for (const shape of SURFACE.get(path)!.shapes) {
        for (const member of shape.members) {
          if (!member.id) continue;
          if (readByShipping.has(member.id) || readBySpec.has(member.id)) continue;
          if (ALLOWED[key(path, `${shape.name}.${member.name}`)]) continue;
          if (ALLOWED[key(path, member.name)]) continue;
          dead.push(`${shape.name}.${member.name}`);
        }
      }
    }
    expect(
      dead,
      dead.length === 0
        ? ""
        : `${dead[0]} is declared in the backlot's own types and nothing that ships reads it. TypeScript has ` +
          `no notion of an unused interface member, so this is the only thing that will ever say so. All of ` +
          `them: ${dead.join(", ")}.`,
    ).toEqual([]);
  });

  it("keeps no more allowances than it started with", () => {
    // The list is a queue. Nothing stops a future reader adding a name to it
    // instead of dealing with the thing, except this.
    expect(
      Object.keys(ALLOWED).length,
      `the allowlist has grown to ${Object.keys(ALLOWED).length}. It is a list of things somebody has to ` +
        `deal with, not a place to put them: ${Object.keys(ALLOWED).join(", ")}`,
    ).toBeLessThanOrEqual(ALLOWED_CEILING);
  });

  it("keeps no allowance it no longer needs", () => {
    // A reason that has stopped being true is a hand-kept scope one level down.
    // Every entry has to still be forgiving something, or it comes out.
    const stale: string[] = [];
    for (const entry of Object.keys(ALLOWED)) {
      const [path, name] = entry.split("#") as [string, string];
      if (!SOURCES.includes(path)) {
        stale.push(`${entry} (that file is gone)`);
        continue;
      }
      const surface = SURFACE.get(path)!;
      const member = name.includes(".")
        ? surface.shapes.find((shape) => shape.name === name.split(".")[0])?.members.find(
            (one) => one.name === name.split(".")[1],
          )
        : undefined;
      const exported = surface.exports.find((one) => one.name === name);
      const id = member?.id ?? exported?.id ?? null;
      if (!id) {
        stale.push(`${entry} (nothing by that name is exported any more)`);
        continue;
      }
      if (readByShipping.has(id) || readBySpec.has(id)) stale.push(`${entry} (something reads it now)`);
    }
    expect(
      stale,
      `${stale.length} allowance(s) are no longer needed and should come out: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("says what it measured", () => {
    const exported = [...reachable].reduce((count, path) => count + SURFACE.get(path)!.exports.length, 0);
    const members = [...reachable].reduce(
      (count, path) => count + SURFACE.get(path)!.shapes.reduce((sum, shape) => sum + shape.members.length, 0),
      0,
    );
    // A run that walked nothing would pass every assertion above in silence.
    expect(exported, "no exports were found to check").toBeGreaterThan(20);
    expect(members, "no interface members were found to check").toBeGreaterThan(20);
    // And the symbols actually resolved: a program that loaded but could not
    // resolve would give every export a null id and skip it.
    const unresolved = [...reachable].flatMap((path) =>
      SURFACE.get(path)!.exports.filter((entry) => !entry.id).map((entry) => key(path, entry.name)),
    );
    expect(unresolved, `${unresolved.length} export(s) could not be resolved to a symbol`).toEqual([]);
    expect(readOutsideOwnFile.size, "no symbol was read across a file boundary").toBeGreaterThan(20);
  });
});
