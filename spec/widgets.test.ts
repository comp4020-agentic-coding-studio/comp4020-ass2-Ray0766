// The lecture widgets (CLAUDE.md §9): each one demonstrates its own week's
// teaching point, and each one has to survive with JavaScript off, because the
// static page is what carries the teaching. These checks read the built pages,
// so they assert what a reader actually receives rather than what the source
// intended.
//
// Three things per widget: it is on the page it belongs to; the JS-off content
// is in the markup rather than waiting to be built by a script; and it carries
// no inline `style` attribute, since §9 puts widget styling in a stylesheet
// where the linters can see it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function page(slug: string): string {
  return readFileSync(resolve(`dist/lectures/${slug}/index.html`), "utf8");
}

/**
 * The markup of the one element carrying `attribute`, closing tag included.
 * Counts nesting rather than searching for the first close tag, so a widget
 * whose root holds figures or divs of its own still gets sliced whole.
 */
export function widgetMarkup(html: string, attribute: string): string {
  const at = html.indexOf(attribute);
  expect(at, `no element carries ${attribute}`).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<", at);
  const tag = /^<([a-z0-9-]+)/i.exec(html.slice(open))![1];
  const openRe = new RegExp(`<${tag}\\b`, "gi");
  const closeRe = new RegExp(`</${tag}>`, "gi");
  let depth = 0;
  let cursor = open;
  for (;;) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    expect(nextClose, `${attribute}'s <${tag}> is never closed`).toBeTruthy();
    if (nextOpen && nextOpen.index < nextClose!.index) {
      depth += 1;
      cursor = nextOpen.index + 1;
      continue;
    }
    depth -= 1;
    cursor = nextClose!.index + 1;
    if (depth === 0) return html.slice(open, nextClose!.index + `</${tag}>`.length);
  }
}

// Seen red before the widget existed: all four assertions failed against the
// built week 2 page, the first with
//   expected '<!DOCTYPE html><html lang="en"><head>…' to contain
//   'data-same-seed'
// and the other three inside widgetMarkup with
//   no element carries data-same-seed: expected -1 to be greater than -1
describe("week 2's SameSeed: one recording, two addresses", () => {
  const html = page("week-02");
  const widget = () => widgetMarkup(html, "data-same-seed");

  it("is on the week 2 lecture page", () => {
    expect(html).toContain("data-same-seed");
  });

  it("names both addresses of both pairs with JS off", () => {
    const markup = widget();
    for (const file of ["week02-t1.mp4", "week06-t4.mp4", "week02-t2.mp4", "week07-t4.mp4"]) {
      expect(markup, `the pair's addresses should both be named in the markup: ${file}`).toContain(file);
    }
  });

  it("plays without the script: a video element with a source is already there", () => {
    expect(widget()).toMatch(/<video[^>]+src="[^"]+\.mp4"/);
  });

  it("carries no inline style attribute", () => {
    expect(widget()).not.toMatch(/\sstyle="/);
  });
});

// Seen red before the widget existed, all four assertions failing against the
// built week 8 page:
//   expected '<!DOCTYPE html><html lang="en"><head>…' to contain
//   'data-drift-audit'
//   no element carries data-drift-audit: expected -1 to be greater than -1  (x3)
describe("week 8's DriftAudit: a take against the reference that was meant to hold it", () => {
  const html = page("week-08");
  const widget = () => widgetMarkup(html, "data-drift-audit");

  it("is on the week 8 lecture page", () => {
    expect(html).toContain("data-drift-audit");
  });

  it("shows both references and both takes as real images with JS off", () => {
    const markup = widget();
    for (const file of ["week08-ref-face.avif", "week08-t1.avif", "week08-ref-scene.avif", "week08-t4.avif"]) {
      expect(markup, `${file} should be an <img> in the markup, not something a script fetches`).toMatch(
        new RegExp(`<img[^>]+src="[^"]*${file.replace(".", "\\.")}"`),
      );
    }
  });

  it("captions each pair with its own tier's note", () => {
    expect(widget()).toContain("watch the coat and the street change at 00:07");
  });

  it("carries no inline style attribute", () => {
    expect(widget()).not.toMatch(/\sstyle="/);
  });
});
