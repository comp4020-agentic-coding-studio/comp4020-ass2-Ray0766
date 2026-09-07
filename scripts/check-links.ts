#!/usr/bin/env node
// Checks that every source URL in src/data/reading.json still resolves.
//
// Hand-run only: `pnpm check:links`. It is deliberately outside `pnpm check`
// and outside CI, because it is the one check in this repo whose result
// depends on the open internet — a reading that is fine today goes red when
// someone else's server has a bad afternoon, and a check that goes red for
// reasons the repo cannot fix is a check people learn to ignore. Run it when
// the reading list changes, and before shipping.
//
// linkinator scans the links *on* a page rather than a list of URLs, so this
// writes the reading list out as a throwaway HTML index (in the OS temp
// directory, never in the repo) and points linkinator at that. Recursion is
// off by default, so what gets checked is exactly the reading list's own URLs,
// once each.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import reading from "../src/data/reading.json" with { type: "json" };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function main(): void {
  const urls = [...new Set(reading.entries.map((entry) => entry.url))].sort();
  const dir = mkdtempSync(join(tmpdir(), "slop-reading-"));

  try {
    const page = join(dir, "reading.html");
    writeFileSync(
      page,
      `<!doctype html><meta charset="utf-8"><title>reading list</title>\n${urls
        .map((url) => `<p><a href="${escape(url)}">${escape(url)}</a></p>`)
        .join("\n")}\n`,
    );

    console.log(`Checking ${urls.length} reading URL(s) with linkinator…`);
    execFileSync(
      "pnpm",
      [
        "dlx",
        "linkinator",
        page,
        "--timeout",
        "20000",
        "--retry",
        "--verbosity",
        "INFO",
      ],
      { stdio: "inherit" },
    );
  } catch {
    // linkinator has already printed which URLs failed and why.
    process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
