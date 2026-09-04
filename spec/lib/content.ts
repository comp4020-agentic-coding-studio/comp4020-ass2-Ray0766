// Shared helpers for spec/ checks that read src/content directly rather than
// the built API. Not a *.test.ts file, so vitest never runs this on its own.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ContentFile {
  /** Filename without extension, e.g. "week-08". */
  slug: string;
  /** Path relative to the repo root, for failure messages. */
  path: string;
  frontmatter: Record<string, string>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Splits a plain "key: value" / folded multi-line frontmatter block from its
 * body. Handles the two shapes actually used under src/content: a value on
 * the same line as its key, or a value folded onto indented continuation
 * lines (as lecture `description:` blocks are written). Good enough for the
 * fields these checks read (title, description, week) — not a general YAML
 * parser, and not meant to become one.
 */
export function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) throw new Error("no frontmatter block found");
  const [, fmBlock, body] = match;
  const frontmatter: Record<string, string> = {};
  let currentKey: string | null = null;
  for (const line of fmBlock.split(/\r?\n/)) {
    const keyMatch = /^([A-Za-z0-9_]+):\s?(.*)$/.exec(line);
    if (keyMatch && !/^\s/.test(line)) {
      currentKey = keyMatch[1];
      frontmatter[currentKey] = keyMatch[2].trim();
    } else if (currentKey && /^\s+\S/.test(line)) {
      frontmatter[currentKey] = frontmatter[currentKey]
        ? `${frontmatter[currentKey]} ${line.trim()}`
        : line.trim();
    } else if (line.trim() !== "") {
      currentKey = null;
    }
  }
  return { frontmatter, body };
}

export function loadContentDir(dir: string): ContentFile[] {
  const abs = resolve(dir);
  return readdirSync(abs)
    .filter((name) => /\.mdx?$/.test(name))
    .sort()
    .map((name) => {
      const path = `${dir}/${name}`;
      const raw = readFileSync(`${abs}/${name}`, "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      return { slug: name.replace(/\.mdx?$/, ""), path, frontmatter, body };
    });
}

const WEEK_MENTION_RE = /\bWeeks?\s+(\d+)(?:\s*(?:[-–]|to|through)\s*(\d+))?\b/gi;

/** Every week number a stretch of prose mentions, with "Weeks N to/through M" ranges expanded. */
export function weekMentions(text: string): number[] {
  const weeks: number[] = [];
  for (const match of text.matchAll(WEEK_MENTION_RE)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    for (let week = start; week <= end; week += 1) weeks.push(week);
  }
  return weeks;
}
