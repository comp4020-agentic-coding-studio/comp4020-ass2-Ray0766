import { execFileSync } from "node:child_process";

// Where this site will be served from.
//
// GitHub Pages serves a project repo under a sub-path
// (https://<owner>.github.io/<repo>/), and Astro needs to know that path at
// build time or every asset URL, internal link and search index entry points at
// the domain root. That failure is invisible locally --- `astro dev` and `astro
// preview` both serve at the root --- and total on the live URL.
//
// A template cannot hardcode the path, because it does not know the repo name
// until a student generates from it. So it is derived: GITHUB_REPOSITORY in
// Actions, the origin remote otherwise --- the origin of the checkout that is
// *this directory's own*, which is a narrower question than the one git answers
// when it is asked for a remote. See `notThisRepo`.
//
// And when neither can be had, the build stops. There is no safe guess here:
// "I don't know the repo" used to mean base `/`, which builds a whole site of
// 404s while printing `Complete!`. Worse, `pnpm test` is `pnpm build && vitest
// run spec` and both halves ask the same git, so they agree with each other and
// the suite is green about a site that cannot load a single stylesheet. The
// only reading of an unknown repo that is honest is that this build cannot be
// made, so it isn't.

/** What git had to say when asked for the origin remote. Five answers, not
 *  the two a `string | undefined` can carry: here it is; here is one, but it is
 *  some enclosing repository's and not this directory's; this is a checkout
 *  with no origin set; this is not a checkout at all; I could not be run at
 *  all. The last is a fact about the toolchain rather than about the tree ---
 *  on this machine it was an unaccepted Xcode licence failing every git call
 *  --- and each of the five needs its own answer, because each needs a
 *  different fix. */
export type GitRemote =
  | { kind: "origin"; url: string }
  | { kind: "foreign-checkout"; url: string; root: string; detail: string }
  | { kind: "no-origin"; detail: string }
  | { kind: "no-checkout"; detail: string }
  | { kind: "git-unusable"; detail: string };

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    // stderr piped rather than ignored: when this fails, what git said is the
    // single most useful line in the message a reader gets.
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Why an `execFileSync` failed, in one line. Git's own stderr where there is
 *  any; the spawn error otherwise, since a git that is not installed at all
 *  fails before it can write a word. */
function why(error: unknown): string {
  const e = error as { stderr?: unknown; message?: unknown; code?: unknown };
  const stderr = typeof e.stderr === "string" ? e.stderr.trim() : "";
  if (stderr) return stderr.replace(/\s*\n\s*/g, " ");
  if (e.code === "ENOENT") return "git is not on PATH (ENOENT)";
  if (typeof e.code === "string") return `git could not be started (${e.code})`;
  return typeof e.message === "string" && e.message.trim() ? e.message.trim() : "no output";
}

/** Ask git for the origin remote. Impure, and kept apart from the resolution
 *  below so that stays testable. */
export function gitOrigin(): GitRemote {
  let url: string;
  try {
    url = runGit(["remote", "get-url", "origin"]);
  } catch (error) {
    const answer = why(error);
    // Having no remote to name is not the same failure as being unable to
    // answer, and the exit code does not reliably separate them: 69 from the
    // Xcode licence wrapper, 128 outside a checkout, 2 for a missing remote,
    // ENOENT with no exit code at all when git is absent. So ask git something
    // any working git answers without touching the repo. If that works, the
    // first failure was git's considered answer; if it doesn't, git is broken.
    try {
      runGit(["--version"]);
    } catch (unusable) {
      return { kind: "git-unusable", detail: why(unusable) };
    }
    // git works, so its refusal was an answer rather than a breakdown. Which
    // answer: no checkout here to read a remote out of, or a checkout whose
    // origin is simply unset? They take different fixes, so they get asked
    // apart rather than sorted by reading git's English.
    try {
      runGit(["rev-parse", "--git-dir"]);
    } catch (outside) {
      return { kind: "no-checkout", detail: why(outside) };
    }
    return { kind: "no-origin", detail: answer };
  }

  // A url is not yet an answer: git found *a* repository, and the one it found
  // may be one this directory is merely sitting inside.
  const foreign = notThisRepo();
  return foreign ? { kind: "foreign-checkout", url, ...foreign } : { kind: "origin", url };
}

/** Whether the repository git just answered from is somebody else's.
 *
 *  `git remote get-url origin` never fails for want of a repository *here*: git
 *  walks up the directory tree until it finds one. Unpack the template inside
 *  any other checkout --- last semester's repo, a notes repo, anything under a
 *  synced folder that happens to be one, which is where people unpack things ---
 *  and every git question this file asks is answered by that repository instead.
 *  The build then succeeds under *its* name and puts a real path that does not
 *  exist in front of every asset URL on the site. It is the same 404 the rest of
 *  this file refuses, arriving through the one door left open, and nothing
 *  downstream can see it, because the base it produces is well-formed.
 *
 *  Two questions settle it, and git answers both about itself, so neither costs
 *  anything to a symlinked path, to /tmp resolving to /private/tmp, or to a
 *  case-insensitive volume --- all of which a comparison of `--show-toplevel`
 *  against `process.cwd()` has to get right by hand. `--show-prefix` is empty
 *  exactly when the build directory is the repository's own root, which is the
 *  ordinary case (a clone, a generated repo, a linked worktree) and needs no
 *  second question. A non-empty prefix is not yet wrong: a site built from a
 *  subdirectory of its own repo is a normal layout and does deploy under that
 *  repo's name. What separates that from a stowaway is whether the repository
 *  tracks anything here at all. A stowaway tracks nothing. */
function notThisRepo(): { root: string; detail: string } | null {
  let prefix: string;
  try {
    prefix = runGit(["rev-parse", "--show-prefix"]).trim();
  } catch (error) {
    // git named a remote and then could not place this directory inside a work
    // tree. Whatever that is, it is not a repository this site is published as,
    // and guessing it is, is exactly the guess this file exists to refuse.
    return { root: repoRoot(), detail: `git could not place this directory in it: ${why(error)}` };
  }
  if (prefix === "") return null;

  try {
    runGit(["ls-files", "--error-unmatch", "--", "."]);
  } catch {
    return {
      root: repoRoot(),
      detail: `It tracks no file under ${prefix}, so this directory is not part of it`,
    };
  }
  return null;
}

/** The root of the repository git answered from, for naming it in the refusal.
 *  Empty rather than thrown: by here the build is already refused, and failing
 *  to decorate the message is not a second failure worth reporting. */
function repoRoot(): string {
  try {
    return runGit(["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return "";
  }
}

export interface RepoSlug {
  owner: string;
  repo: string;
}

export interface Deployment {
  site: string;
  base: string;
}

// git@github.com:owner/repo.git, https://github.com/owner/repo, ssh://git@github.com/owner/repo.git
const REMOTE_URL =
  /^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?\/?$/;

/** Parse `owner/repo` out of a GITHUB_REPOSITORY value or a git remote URL. */
export function parseRepoSlug(input: string | undefined | null): RepoSlug | null {
  const value = input?.trim();
  if (!value) return null;

  const remote = REMOTE_URL.exec(value);
  if (remote?.groups) {
    return { owner: remote.groups.owner!, repo: remote.groups.repo! };
  }

  // GITHUB_REPOSITORY form, e.g. "octocat/hello-world"
  const parts = value.replace(/\.git$/, "").split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

/** The Pages URL a repo publishes to. A repo named `<owner>.github.io` is the
 *  owner's user/org site and serves at the domain root; everything else is a
 *  project site under `/<repo>`. */
export function pagesUrl(slug: RepoSlug): Deployment {
  const owner = slug.owner.toLowerCase();
  const isOwnerSite = slug.repo.toLowerCase() === `${owner}.github.io`;
  return {
    site: `https://${owner}.github.io`,
    base: isOwnerSite ? "/" : `/${slug.repo}`,
  };
}

const SET_IT =
  "set GITHUB_REPOSITORY=<owner>/<repo> for this build --- Actions sets it, which is\n"
  + "    why a deploy never asks git";

/** The message a reader gets instead of a broken site. It has to carry three
 *  things, because the reader is looking at a build that used to succeed: what
 *  could not be determined, why that is fatal rather than a default, and what
 *  to do about it. */
function undeployable(cause: string, fixes: string[]): Error {
  return new Error(
    [
      "Cannot determine the path this site is served from, so this build is refused.",
      "",
      `  ${cause}`,
      "",
      "Astro bakes that path into every asset URL, internal link and search",
      "entry at build time. Assuming the domain root produces a site that is",
      "correct under `astro dev` and `astro preview` and 404s on every file",
      "under https://<owner>.github.io/<repo>/ --- including the module that",
      "boots the backlot. Nothing downstream can detect it, so the build says",
      "so here rather than printing Complete! over an undeployable site.",
      "",
      "Fix one of:",
      ...fixes.map((fix) => `  - ${fix}`),
    ].join("\n"),
  );
}

/** Resolve the deployment from the environment, falling back to the git
 *  remote. `gitRemote` is injected so this stays a pure function under test.
 *  Throws when the repo cannot be determined, rather than guessing a root
 *  build --- see the note at the top of this file. */
export function resolveDeployment(
  env: Record<string, string | undefined>,
  gitRemote: () => GitRemote,
): Deployment {
  const declared = env.GITHUB_REPOSITORY?.trim();
  const fromEnv = parseRepoSlug(declared);
  if (fromEnv) return pagesUrl(fromEnv);

  // A GITHUB_REPOSITORY that is set but unreadable still falls through to git,
  // which may well know the answer. It is worth saying out loud if git doesn't.
  const ignored = declared
    ? `\n  GITHUB_REPOSITORY is set to "${declared}", which is not <owner>/<repo>, so it was ignored.`
    : "";

  const remote = gitRemote();

  if (remote.kind === "git-unusable") {
    throw undeployable(`git could not be run at all: ${remote.detail}${ignored}`, [
      "install git, or repair it --- on macOS an unaccepted Xcode licence fails\n"
        + "    every git call: `sudo xcodebuild -license`, or export\n"
        + "    DEVELOPER_DIR=/Library/Developer/CommandLineTools",
      SET_IT,
    ]);
  }

  if (remote.kind === "foreign-checkout") {
    // Where a downloaded copy of the template actually lands, and the last
    // failure in this file that still built a whole site: git walks up, so a
    // build anywhere inside another checkout is answered by that checkout and
    // published under its name. The base it produces is a real path, just
    // somebody else's, which is why nothing downstream ever objected.
    throw undeployable(
      "this is not a checkout of its own, and git answered from the one it sits\n"
        + `  inside: the repository${remote.root ? ` at ${remote.root}` : ""}, whose origin is\n`
        + `  "${remote.url.trim()}".\n`
        + `  ${remote.detail}.${ignored}`,
      [
        "clone the repo this site deploys to, rather than unpacking a copy inside\n"
          + "    another checkout --- a copy carries no origin of its own, so git answers\n"
          + "    with the enclosing repository's",
        `or ${SET_IT}`,
      ],
    );
  }

  if (remote.kind === "no-checkout") {
    // Reached only when the build lands outside *every* repository --- a copy
    // unpacked where no checkout encloses it. Unpacked inside one, it is the
    // foreign-checkout above instead, which is the commoner accident of the two.
    // Either way there is nothing here that knows the repo it will be published
    // as, and a template exists to be published --- so the one line that makes
    // it buildable is better said now than inferred from a blank live page. The
    // build still works; it just has to be told the one thing it cannot see.
    throw undeployable(
      `this is not a git checkout, so there is no remote to read: ${remote.detail}${ignored}`,
      [
        SET_IT,
        "or clone the repo instead of downloading it, so origin names where it deploys",
      ],
    );
  }

  if (remote.kind === "no-origin") {
    throw undeployable(`git ran, but named no origin remote: ${remote.detail}${ignored}`, [
      "add the remote: git remote add origin https://github.com/<owner>/<repo>.git",
      `or ${SET_IT}`,
    ]);
  }

  const slug = parseRepoSlug(remote.url);
  if (slug) return pagesUrl(slug);

  throw undeployable(
    `origin is "${remote.url.trim()}", which is not a GitHub repo this can publish to${ignored}`,
    ["point origin at the GitHub repo this site deploys to", `or ${SET_IT}`],
  );
}
