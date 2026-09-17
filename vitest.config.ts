import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `pnpm test` is `vitest run spec`, and that argument is a path filter,
    // not a directory: any file whose path contains "spec" matches. A git
    // worktree parked under .claude/worktrees/ therefore hands its own
    // spec/ files to this checkout's runner, which then fails on fixtures
    // that only exist on the other branch. Excluding .claude/ keeps the
    // suite reporting on the tree it was actually run against.
    exclude: [...configDefaults.exclude, ".claude/**"],
    // Browser files share the GPU. Concurrent WebGL scenes stretched input
    // and screenshot intervals in the full run; the decoder check then passed
    // alone with identical assertions. Keep one file on this machine at a time.
    // CI gets concurrency from separate runners, not competing local browsers.
    maxWorkers: 1,
  },
});
