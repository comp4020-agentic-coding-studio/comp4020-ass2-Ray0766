import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  gitOrigin,
  pagesUrl,
  parseRepoSlug,
  resolveDeployment,
  type GitRemote,
} from "./pages-base.ts";

// This protects template plumbing rather than a decision students make, so it
// runs in template CI without becoming part of their everyday course checks.

describe("parseRepoSlug", () => {
  it.each([
    ["octocat/hello-world", { owner: "octocat", repo: "hello-world" }],
    ["git@github.com:octocat/hello-world.git", { owner: "octocat", repo: "hello-world" }],
    ["https://github.com/octocat/hello-world.git", { owner: "octocat", repo: "hello-world" }],
    ["https://github.com/octocat/hello-world", { owner: "octocat", repo: "hello-world" }],
    ["ssh://git@github.com/octocat/hello-world.git", { owner: "octocat", repo: "hello-world" }],
  ])("parses %s", (input, expected) => {
    expect(parseRepoSlug(input)).toEqual(expected);
  });

  it.each([undefined, null, "", "   ", "not-a-repo", "https://gitlab.com/a/b.git"])(
    "returns null for %s",
    (input) => {
      expect(parseRepoSlug(input)).toBeNull();
    },
  );
});

describe("pagesUrl", () => {
  it("serves a project repo under /<repo>", () => {
    expect(pagesUrl({ owner: "SlopU", repo: "my-course" })).toEqual({
      site: "https://slopu.github.io",
      base: "/my-course",
    });
  });

  it("serves an owner site at the root", () => {
    expect(pagesUrl({ owner: "SlopU", repo: "slopu.github.io" })).toEqual({
      site: "https://slopu.github.io",
      base: "/",
    });
  });
});

describe("resolveDeployment", () => {
  const origin = (url: string) => (): GitRemote => ({ kind: "origin", url });
  const unusable = (): GitRemote => ({
    kind: "git-unusable",
    detail: "You have not agreed to the Xcode license agreements.",
  });
  const noOrigin = (): GitRemote => ({ kind: "no-origin", detail: "error: No such remote 'origin'" });
  const noCheckout = (): GitRemote => ({
    kind: "no-checkout",
    detail: "fatal: not a git repository",
  });

  it("prefers GITHUB_REPOSITORY, and does not ask git at all", () => {
    // The Actions path. Asserting the remote is never consulted, not just that
    // the env wins: a deploy runs where git is present but the checkout is a
    // detached grafted one, and asking it is a habit worth not having.
    let asked = 0;
    const remote = () => {
      asked += 1;
      return { kind: "origin", url: "git@github.com:other/other-repo.git" } as GitRemote;
    };
    expect(resolveDeployment({ GITHUB_REPOSITORY: "octocat/hello-world" }, remote)).toEqual({
      site: "https://octocat.github.io",
      base: "/hello-world",
    });
    expect(asked).toBe(0);
  });

  it("falls back to the git remote", () => {
    expect(resolveDeployment({}, origin("git@github.com:octocat/hello-world.git"))).toEqual({
      site: "https://octocat.github.io",
      base: "/hello-world",
    });
  });

  it("serves an owner site at the root --- the one base / it will ever answer", () => {
    expect(resolveDeployment({}, origin("git@github.com:octocat/octocat.github.io.git"))).toEqual({
      site: "https://octocat.github.io",
      base: "/",
    });
  });

  // The regression this file exists for. Every one of these used to answer
  // `{ site: undefined, base: "/" }`, which builds a site of 404s under the
  // Pages sub-path while the build prints Complete! and the whole suite --- run
  // against the same broken git --- agrees with it.
  describe("refuses to guess a root build", () => {
    it("when git cannot be run", () => {
      expect(() => resolveDeployment({}, unusable)).toThrow(/git could not be run at all/);
    });

    it("when the checkout has no origin remote", () => {
      expect(() => resolveDeployment({}, noOrigin)).toThrow(/named no origin remote/);
    });

    it("when this is not a checkout at all", () => {
      // A zip download of the template. Refused for the same reason as the
      // rest: nothing here knows the repo, and a template exists to be
      // deployed. The message hands over the one line that builds it anyway.
      expect(() => resolveDeployment({}, noCheckout)).toThrow(/not a git checkout/);
      expect(() => resolveDeployment({}, noCheckout)).toThrow(/GITHUB_REPOSITORY=<owner>\/<repo>/);
    });

    it("when origin is not a GitHub repo", () => {
      expect(() => resolveDeployment({}, origin("https://gitlab.com/a/b.git"))).toThrow(
        /not a GitHub repo this can publish to/,
      );
    });
  });

  it("says what went wrong, why it is fatal, and what to do", () => {
    // The message is the deliverable as much as the throw is: a reader meets it
    // on a build that succeeded yesterday, so it has to carry all three.
    const message = getMessage(() => resolveDeployment({}, unusable));
    expect(message).toContain("You have not agreed to the Xcode license agreements.");
    expect(message).toMatch(/404s? on every file/);
    expect(message).toContain("https://<owner>.github.io/<repo>/");
    expect(message).toContain("sudo xcodebuild -license");
    expect(message).toContain("GITHUB_REPOSITORY=<owner>/<repo>");
  });

  it("still asks git when GITHUB_REPOSITORY is set but unreadable", () => {
    expect(
      resolveDeployment(
        { GITHUB_REPOSITORY: "nonsense" },
        origin("git@github.com:octocat/hello-world.git"),
      ),
    ).toEqual({ site: "https://octocat.github.io", base: "/hello-world" });
  });

  it("names an unreadable GITHUB_REPOSITORY when git cannot cover for it", () => {
    const message = getMessage(() => resolveDeployment({ GITHUB_REPOSITORY: "nonsense" }, unusable));
    expect(message).toContain('GITHUB_REPOSITORY is set to "nonsense"');
  });
});

// `gitOrigin` is the half a stubbed `gitRemote` can never reach, and the whole
// fix turns on it telling the four states apart. So each branch is watched
// running against a real git rather than read.
describe("gitOrigin", () => {
  const cwd = process.cwd();
  const path = process.env.PATH;

  afterEach(() => {
    process.chdir(cwd);
    process.env.PATH = path;
  });

  const scratch = () => mkdtempSync(join(tmpdir(), "pages-base-"));

  it("reads the origin of a checkout that has one", () => {
    const remote = gitOrigin();
    expect(remote.kind).toBe("origin");
    if (remote.kind !== "origin") return;
    expect(parseRepoSlug(remote.url)).not.toBeNull();
  });

  it("calls a checkout with no origin a checkout with no origin", () => {
    const dir = scratch();
    execFileSync("git", ["init", "-q", "."], { cwd: dir, stdio: "ignore" });
    process.chdir(dir);
    expect(gitOrigin().kind).toBe("no-origin");
  });

  it("calls a bare directory not a checkout", () => {
    process.chdir(scratch());
    expect(gitOrigin().kind).toBe("no-checkout");
  });

  it("calls a git that cannot run a git that cannot run, and quotes it", () => {
    // Exactly the shape of the failure this machine had: a git wrapper that
    // exits non-zero whatever it is asked, because the Xcode licence is
    // unaccepted. Nothing about it is a fact about the checkout, so it must
    // not be read as one.
    const dir = scratch();
    const shim = join(dir, "git");
    writeFileSync(
      shim,
      "#!/bin/sh\necho \"You have not agreed to the Xcode license agreements.\" >&2\nexit 69\n",
    );
    chmodSync(shim, 0o755);
    process.env.PATH = dir;

    const remote = gitOrigin();
    expect(remote.kind).toBe("git-unusable");
    if (remote.kind !== "git-unusable") return;
    // Git's own words, not a paraphrase: this is the line that would have named
    // the cause the first time round.
    expect(remote.detail).toContain("You have not agreed to the Xcode license agreements.");
  });

  it("calls an absent git a git that cannot run", () => {
    process.env.PATH = scratch();
    const remote = gitOrigin();
    expect(remote.kind).toBe("git-unusable");
    if (remote.kind !== "git-unusable") return;
    expect(remote.detail).toContain("ENOENT");
  });
});

/** The thrown message, or a failure that says nothing was thrown --- a test
 *  that reads `""` here would pass every `toContain` it is given. */
function getMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected this to throw, and it returned");
}
