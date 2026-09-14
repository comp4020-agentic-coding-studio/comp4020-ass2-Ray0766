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
    // Half the cores, because most of this suite is a browser and a moving
    // scene rather than arithmetic.
    //
    // Vitest defaults to one fork per core, and on this eight-core machine a
    // dozen of those forks each drive their own headless Chrome, which is
    // itself several processes, rendering an animated WebGL scene. Oversubscribed
    // like that, a frame that should arrive in 16ms arrives whenever the
    // scheduler gets round to it, and every check whose evidence is "this
    // happened within N ms" or "this pixel looked like that at time T" starts
    // reading the machine instead of the page. The tell was that across seven
    // full runs a rotating zero to two tests went red and never the same one
    // twice, none of them reproducing alone.
    //
    // **This moves no threshold and weakens no check.** Every number in spec/
    // is exactly what it was; what changes is how much other work is competing
    // with the thing being measured while it is measured. A real reader is not
    // running eight browsers, so the contention was never part of what these
    // checks are about.
    //
    // If flakes come back at four, that is worth reading rather than halving
    // again: at some point the answer stops being contention and starts being
    // a check that measures a moving scene with a stopwatch.
    // Vitest 4 dropped `poolOptions.forks.maxForks` for a top-level
    // `maxWorkers`; the old spelling is not a deprecation here, it is a type
    // error, and `pnpm check` runs typecheck first so it never reaches a test.
    maxWorkers: 4,
  },
});
