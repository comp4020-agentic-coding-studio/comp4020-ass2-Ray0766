// Nothing in src/backlot/ is exported for nobody.
//
// This exists because one round produced three dead things and only one of them
// was visible to any tool:
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
// the failure actually arrives from. Three, one per shape, each a source edit
// reverted — this check reads source, not the bundle, so nothing here needs a
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
// Two of those three took a second attempt, and both failures were the check's
// own instrument rather than the injection. The first version of the member walk
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
/** Everything else that ships, because the thing that loads the backlot is a
 *  page rather than a module: `src/pages/backlot/index.astro` imports the
 *  manifest in its frontmatter, and a scan that stopped at src/backlot/ called
 *  `backlotManifest` dead on its first run. Astro frontmatter is TypeScript
 *  between two `---` fences, so it parses with the same compiler. */
const SITE = [...globSync("src/**/*.ts"), ...globSync("src/**/*.astro")]
  .filter((path) => !path.startsWith("src/backlot/"))
  .sort();
const SPECS = globSync("spec/**/*.ts").sort();

/** The module the backlot page loads. Everything that ships is reachable from
 *  here; anything that is not is dead whatever else imports it. */
const ENTRY = "src/backlot/page/boot.ts";

/** Reasons, not names. Each entry is checked to still be necessary, so the list
 *  cannot quietly keep forgiving something that has since been wired up — and
 *  the count is checked too, so it can only ever shrink. That is what makes it a
 *  queue rather than a policy: an allowlist nobody can add to is a list of
 *  things somebody has to deal with, and an allowlist anybody can add to is the
 *  hand-kept scope this file exists to argue against.
 *
 *  Every entry here is a finding from this check's first honest run. None of
 *  them is mine to fix — they are the engine's and the room's — so they are
 *  named, dated and queued rather than quietly forgiven. */
const ALLOWED: Record<string, string> = {
  "src/backlot/rooms/manifest.ts#BacklotPiece.studioAnchor":
    "written into every front-wall and left-wall piece and read by nothing that ships. It is the anchor a " +
    "gallery entry would link to, so the likely answer is that something should read it rather than that it " +
    "should go. Owner: the manifest, which is read-only this round.",
  "src/backlot/engine/types.ts#Hotspot.setLabel":
    "declared on the public handle and implemented in hotspots.ts, called by nothing. Same shape as " +
    "Signwriter.floorName. Owner: lane 1.",
  "src/backlot/rooms/furniture.ts#MonitorBuild.screenNormal":
    "returned by buildMonitor and read by nothing. Owner: lane 2.",
  "src/backlot/rooms/furniture.ts#ChairBuild.backTop":
    "returned by buildChair and read by nothing. Owner: lane 2.",
  "src/backlot/engine/camera.ts#GodCamera.pixelsPerMetre":
    "implemented in camera.ts and called by nothing. It is the number a legibility check would want, which " +
    "makes it the one here most likely to be kept and used. Owner: lane 1.",
};

/** The list may only shrink, and this is the line that makes that true.
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
const ALLOWED_CEILING = 5;

function read(path: string): string {
  const text = readFileSync(resolve(path), "utf8");
  if (!path.endsWith(".astro")) return text;
  // Frontmatter only. The template below it is not TypeScript and the compiler
  // would give up on the first tag, which would silently make every page look
  // like it imports nothing.
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return match ? match[1]! : "";
}
const parse = (path: string) => ts.createSourceFile(path, read(path), ts.ScriptTarget.ESNext, true);

/** Resolve a relative import to a path in SOURCES, or null for a package. */
function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier).replace(/\\/g, "/");
  const root = resolve(".").replace(/\\/g, "/");
  const asRelative = relative(root, base).replace(/\\/g, "/");
  for (const candidate of [
    asRelative,
    `${asRelative}.ts`,
    asRelative.replace(/\.js$/, ".ts"),
    `${asRelative}/index.ts`,
  ]) {
    if (SOURCES.includes(candidate)) return candidate;
  }
  return null;
}

interface Module {
  path: string;
  /** Exported names, and whether the export is types-only. */
  exports: { name: string; typeOnly: boolean }[];
  /** Every interface this module exports, with its member names. */
  interfaces: { name: string; members: string[] }[];
  /** What it imports, resolved, with the names taken. */
  imports: { from: string; names: string[]; typeOnly: boolean }[];
}

/** Is this whole import clause types-only?
 *
 *  `ImportClause.isTypeOnly` is deprecated on TypeScript 6 and the replacement
 *  is `phaseModifier`, which is `undefined | TypeKeyword | DeferKeyword`. The
 *  rename is not cosmetic and the difference is the whole reason to use it: a
 *  clause now has a *phase*, and `import defer` is a runtime import that has one
 *  too. Mapping "has a phase modifier" onto "is a type" would quietly call a
 *  deferred runtime import a type and let a genuinely dead runtime export
 *  through the type-only pass below. Only `TypeKeyword` means types.
 *
 *  Written out here rather than inlined twice, because a file whose subject is
 *  things no tool can see should not be adding to the diagnostics that can. */
const typeOnlyClause = (clause: ts.ImportClause | undefined): boolean =>
  clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;

function describeModule(path: string): Module {
  const file = parse(path);
  const exports: Module["exports"] = [];
  const interfaces: Module["interfaces"] = [];
  const imports: Module["imports"] = [];

  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

  // Dynamic imports first, and they are not a detail: `machine-room.ts` reaches
  // the graph texture with `await import("./graph-texture")`, and a walker that
  // only followed static declarations reported that module as unreachable —
  // 5.4 kB of code the page demonstrably loads, called dead by a check whose
  // whole job is to be believed about that. A false positive here costs more
  // than a false negative, because the only sane response to one is to stop
  // trusting the check.
  const walkDynamic = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const target = resolveImport(path, node.arguments[0].text);
      if (target) imports.push({ from: target, names: ["*"], typeOnly: false });
    }
    ts.forEachChild(node, walkDynamic);
  };
  ts.forEachChild(file, walkDynamic);

  for (const node of file.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(path, node.moduleSpecifier.text);
      if (!target) continue;
      const clause = node.importClause;
      const names: string[] = [];
      let typeOnly = typeOnlyClause(clause);
      if (clause?.name) names.push("default");
      if (clause?.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            names.push((element.propertyName ?? element.name).text);
          }
          // A clause is types-only only if the clause itself says so or every
          // name in it does; a mixed clause is treated as a runtime use, which
          // is the safe direction.
          typeOnly =
            typeOnlyClause(clause) || clause.namedBindings.elements.every((element) => element.isTypeOnly);
        } else {
          names.push("*");
        }
      }
      imports.push({ from: target, names, typeOnly });
      continue;
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(path, node.moduleSpecifier.text);
      if (target) imports.push({ from: target, names: ["*"], typeOnly: node.isTypeOnly });
      continue;
    }

    if (!exported(node)) continue;

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) exports.push({ name: declaration.name.text, typeOnly: false });
      }
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    ) {
      exports.push({ name: node.name.text, typeOnly: false });
    } else if (ts.isInterfaceDeclaration(node)) {
      exports.push({ name: node.name.text, typeOnly: true });
      interfaces.push({
        name: node.name.text,
        members: node.members
          .map((member) => (member.name && ts.isIdentifier(member.name) ? member.name.text : ""))
          .filter(Boolean),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      exports.push({ name: node.name.text, typeOnly: true });
    } else if (ts.isEnumDeclaration(node)) {
      exports.push({ name: node.name.text, typeOnly: false });
    }
  }

  return { path, exports, interfaces, imports };
}

const MODULES = new Map(SOURCES.map((path) => [path, describeModule(path)]));

/** Every module the page can reach, by following imports from the entry. */
const reachable = (() => {
  const seen = new Set<string>();
  // The page is a root as much as boot.ts is: `src/pages/backlot/index.astro`
  // imports the manifest at build time and never goes near the island.
  const roots = [ENTRY];
  for (const path of SITE) {
    const file = parse(path);
    for (const node of file.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const target = resolveImport(path, node.moduleSpecifier.text);
      if (target) roots.push(target);
    }
  }
  const queue = [...roots];
  while (queue.length) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const entry of MODULES.get(path)?.imports ?? []) {
      if (!seen.has(entry.from)) queue.push(entry.from);
    }
  }
  return seen;
})();

/** Names imported from each module by something that ships, and separately by
 *  the suite — so a type held by spec alone can be forgiven and a runtime export
 *  cannot. */
const takenByShipping = new Map<string, Set<string>>();
const takenBySpec = new Map<string, Set<string>>();

const record = (into: Map<string, Set<string>>, from: string, names: string[]) => {
  const set = into.get(from) ?? new Set<string>();
  for (const name of names) set.add(name);
  into.set(from, set);
};

for (const path of reachable) {
  for (const entry of MODULES.get(path)?.imports ?? []) record(takenByShipping, entry.from, entry.names);
}
/** Every name a file outside src/backlot/ takes out of it. */
function takesFrom(path: string, into: Map<string, Set<string>>): void {
  const file = parse(path);
  for (const node of file.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const target = resolveImport(path, node.moduleSpecifier.text);
    if (!target) continue;
    const clause = node.importClause;
    const names: string[] = [];
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) names.push((element.propertyName ?? element.name).text);
    } else if (clause?.namedBindings) {
      names.push("*");
    }
    record(into, target, names);
  }
}

for (const path of SITE) takesFrom(path, takenByShipping);
for (const path of SPECS) takesFrom(path, takenBySpec);

const taken = (into: Map<string, Set<string>>, path: string, name: string) => {
  const set = into.get(path);
  return Boolean(set && (set.has(name) || set.has("*")));
};

/** Every property **read** anywhere that ships: `thing.name`, and a destructured
 *  `const { name } = thing`. Deliberately not property *assignments* — the
 *  object literal that implements an interface writes every member of it, so
 *  counting writes would make every member look used and the check would be
 *  about nothing. That is the distinction the compiler does not draw either. */
const propertyReads = (() => {
  const names = new Set<string>();
  for (const path of reachable) {
    const file = parse(path);
    const walk = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) names.add(node.name.text);
      if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
        names.add(node.argumentExpression.text);
      }
      if (ts.isBindingElement(node)) {
        const source = node.propertyName ?? node.name;
        if (ts.isIdentifier(source)) names.add(source.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(file);
  }
  return names;
})();

/** Every name used **as a type** anywhere that ships, including inside the
 *  module that declares it. A type in an exported signature is used without
 *  anybody importing it by name: `createHub(): Hub` is the whole of what makes
 *  `Hub` public, and a rule that asked only about imports called twenty of these
 *  dead on its first run. */
const typeReferences = (() => {
  const names = new Set<string>();
  for (const path of [...reachable, ...SITE]) {
    const file = parse(path);
    const walk = (node: ts.Node) => {
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) names.add(node.typeName.text);
      if (ts.isTypeReferenceNode(node) && ts.isQualifiedName(node.typeName)) names.add(node.typeName.right.text);
      if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)) {
        names.add(node.expression.text);
      }
      if (ts.isIndexedAccessTypeNode(node) && ts.isTypeReferenceNode(node.objectType)) {
        if (ts.isIdentifier(node.objectType.typeName)) names.add(node.objectType.typeName.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(file);
  }
  return names;
})();

/** Every identifier a module reads inside itself, not counting the declaration
 *  that introduces it. A name used in its own module is not dead code — it is at
 *  most needlessly public, which is a different and much smaller complaint, and
 *  one TypeScript's own unused-local hint already covers. All seven of the
 *  runtime exports this check named on its first run were this: `TOWER`,
 *  `MAX_YAW`, `createPalette` and the rest, every one of them used a few lines
 *  below the `export` keyword. Reporting those as dead would have been a check
 *  that cried about style, and the two things it exists for would have been lost
 *  in the noise. */
const localReads = (() => {
  const perFile = new Map<string, Set<string>>();
  for (const path of SOURCES) {
    const names = new Set<string>();
    const file = parse(path);
    const walk = (node: ts.Node) => {
      // The name in a declaration is not a read of it.
      const declaring =
        (ts.isVariableDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.name;
      ts.forEachChild(node, (child) => {
        if (declaring && child === declaring) return;
        walk(child);
      });
      if (ts.isIdentifier(node)) names.add(node.text);
    };
    ts.forEachChild(file, walk);
    perFile.set(path, names);
  }
  return perFile;
})();

const usedLocally = (path: string, name: string) => Boolean(localReads.get(path)?.has(name));

/** Every identifier **read** anywhere that ships, whatever shape it is read in —
 *  and pointedly not the names that only *declare* something.
 *
 *  The first version of this collected every identifier, which made the member
 *  check vacuous: an interface's own `spill(): Texture` signature and the object
 *  literal that implements it are both identifiers called `spill`, so deleting
 *  the one real call to it left the check green. Caught by the red not arriving,
 *  which is the only thing that catches this. A name in a declaration, a
 *  property signature, a property assignment or a method's own name is skipped;
 *  what is left is a use. */
const identifierReads = (() => {
  const names = new Set<string>();
  const declares = (node: ts.Identifier): boolean => {
    const parent = node.parent as ts.Node & { name?: ts.Node };
    if (!parent || parent.name !== node) return false;
    return (
      ts.isPropertySignature(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isParameter(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)
    );
  };
  for (const path of [...reachable, ...SITE]) {
    const file = parse(path);
    const walk = (node: ts.Node) => {
      if (ts.isIdentifier(node) && !declares(node)) names.add(node.text);
      ts.forEachChild(node, walk);
    };
    ts.forEachChild(file, walk);
  }
  return names;
})();

const key = (path: string, name: string) => `${path}#${name}`;

describe("the backlot exports nothing for nobody", () => {
  it("found the engine and an entry into it", () => {
    // The floor. A glob that matched nothing would make every assertion below
    // true of an empty set, which is the failure this whole file is about.
    expect(SOURCES.length, "no backlot source matched, so this check is about nothing").toBeGreaterThan(10);
    expect(SOURCES, `${ENTRY} is the entry everything is reached from`).toContain(ENTRY);
    expect(reachable.size, "nothing is reachable from the entry, so the walk did not run").toBeGreaterThan(5);
  });

  it("reaches every module it ships", () => {
    const stranded = SOURCES.filter((path) => !reachable.has(path));
    expect(
      stranded,
      `${stranded.length} module(s) under src/backlot/ cannot be reached from the page: ${stranded.join(", ")}. A module the page ` +
        `cannot load is dead whatever imports it, and its own name is the more useful thing to read before ` +
        `any export inside it.`,
    ).toEqual([]);
  });

  it("has a use for every runtime export", () => {
    const dead: string[] = [];
    for (const path of reachable) {
      const module = MODULES.get(path)!;
      for (const entry of module.exports) {
        if (entry.typeOnly) continue;
        if (taken(takenByShipping, path, entry.name)) continue;
        if (usedLocally(path, entry.name)) continue;
        if (ALLOWED[key(path, entry.name)]) continue;
        dead.push(key(path, entry.name));
      }
    }
    expect(
      dead,
      dead.length === 0
        ? ""
        : `${dead[0]!.split("#")[0]} exports ${dead[0]!.split("#")[1]} and nothing that ships imports it. ` +
          `Either something should, or it should not be exported — a public name nobody reaches is a promise ` +
          `to a caller that does not exist. All of them: ${dead.join(", ")}.`,
    ).toEqual([]);
  });

  it("has a use for every exported type, counting the suite as a consumer", () => {
    // A type costs no bytes and spec importing one is spec holding the engine to
    // its own contract, which is the arrangement this repo wants. Runtime
    // exports get no such pass, which is the test above.
    const dead: string[] = [];
    for (const path of reachable) {
      const module = MODULES.get(path)!;
      for (const entry of module.exports) {
        if (!entry.typeOnly) continue;
        if (taken(takenByShipping, path, entry.name)) continue;
        if (taken(takenBySpec, path, entry.name)) continue;
        if (typeReferences.has(entry.name)) continue;
        if (usedLocally(path, entry.name)) continue;
        if (ALLOWED[key(path, entry.name)]) continue;
        dead.push(key(path, entry.name));
      }
    }
    expect(
      dead,
      `${dead.length} exported type(s) are imported by nothing, not even the suite: ${dead.join(", ")}`,
    ).toEqual([]);
  });

  it("has a reader for every member of every interface it exports", () => {
    // The case no compiler setting reaches. `Signwriter.floorName` was a public
    // method, fully implemented, called by nothing — and TypeScript has no
    // notion of an unused interface member at any strictness.
    const dead: string[] = [];
    for (const path of reachable) {
      for (const shape of MODULES.get(path)!.interfaces) {
        for (const member of shape.members) {
          if (propertyReads.has(member)) continue;
          // Also counted: the name read as a plain identifier anywhere that
          // ships. `BacklotEngine.returnToHub` is never reached as
          // `engine.returnToHub()` — it is a local function in index.ts that is
          // also put on the public shape — and calling that dead would be
          // accusing live code. The looser rule misses a member whose name
          // collides with an unrelated local, and that is the right direction
          // for the error to run: this is the only check that will ever say
          // anything here, so it should say nothing rather than something
          // wrong.
          if (identifierReads.has(member)) continue;
          if (ALLOWED[key(path, `${shape.name}.${member}`)]) continue;
          if (ALLOWED[key(path, member)]) continue;
          dead.push(`${shape.name}.${member}`);
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
    // The allowlist is a list of reasons, and a reason that has stopped being
    // true is a hand-kept scope one level down. Every entry has to still be
    // forgiving something, or it comes out.
    const stale: string[] = [];
    for (const entry of Object.keys(ALLOWED)) {
      const [path, name] = entry.split("#") as [string, string];
      if (!SOURCES.includes(path)) {
        stale.push(`${entry} (that file is gone)`);
        continue;
      }
      if (name.includes(".")) {
        const member = name.split(".")[1]!;
        if (propertyReads.has(member) || identifierReads.has(member)) {
          stale.push(`${entry} (something reads it now)`);
        }
        continue;
      }
      if (taken(takenByShipping, path, name) || taken(takenBySpec, path, name)) {
        stale.push(`${entry} (something imports it now)`);
      }
    }
    expect(
      stale,
      `${stale.length} allowance(s) are no longer needed and should come out: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("says what it measured", () => {
    const exported = [...reachable].reduce((count, path) => count + MODULES.get(path)!.exports.length, 0);
    const members = [...reachable].reduce(
      (count, path) => count + MODULES.get(path)!.interfaces.reduce((sum, shape) => sum + shape.members.length, 0),
      0,
    );
    // A run that walked nothing would pass every assertion above in silence.
    expect(exported, "no exports were found to check").toBeGreaterThan(20);
    expect(members, "no interface members were found to check").toBeGreaterThan(20);
    expect(propertyReads.size, "no property reads were collected, so the member check is vacuous").toBeGreaterThan(
      50,
    );
  });
});
