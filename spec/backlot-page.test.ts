// /backlot/ with JavaScript switched off, which is the page this route
// promises: every door, every frame on every wall and every note that goes with
// one, in the DOM before a byte of the island arrives.
//
// Read in a real browser with `Emulation.setScriptExecutionDisabled`, not by
// grepping the built HTML. Two reasons, both from CLAUDE.md §7. The first is
// that a check matching a bare substring of a built page is fed by the page's
// own inline modules — the status bar's script names `data-studio-fallback` in
// a querySelector, so a `.toContain` on that attribute stayed green after the
// attribute had been renamed in the markup. Reading elements out of a rendered
// document cannot be fooled that way. The second is that "no JS" has to mean no
// JS: a check that boots the island and then reads the DOM is reading the page
// the island left behind, which is a different page.
//
// What this file does not check is how the backlot looks in 3D — that needs the
// engine, and it is in spec/backlot-hotspots.test.ts and
// spec/backlot-contrast.test.ts.

import { createHash } from "node:crypto";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { backlotManifest } from "../src/backlot/rooms/manifest";
import { siteConfig } from "../src/site-config";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base.ts";
import { serveBuild, Tab } from "./lib/chrome.ts";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.endsWith("/") ? base : `${base}/`;

/** A site-root path as the built page writes it. The manifest and site-config
 *  both hold root-relative paths; Pages mounts the site under a sub-path, and
 *  `withBase` resolves in the page rather than in the island. */
const deployed = (path: string) => `${prefix}${path.replace(/^\//, "")}`;

/** Where a deployed path lands in dist/. The link checker in the build proves
 *  internal links resolve; this proves the door hrefs are among them. */
const distPath = (href: string) => resolve("dist", href.slice(prefix.length));

const source = (path: string) => readFileSync(resolve(path), "utf8");

/** The theme types `links` as optional, and a site with none would make every
 *  assertion below vacuously true. Read once, asserted once. */
const navLinks = siteConfig.links ?? [];

interface Frame {
  src: string | null;
  srcset: string | null;
  sizes: string | null;
  width: string | null;
  height: string | null;
  alt: string | null;
}

interface Piece {
  id: string;
  caption: string | null;
  image: Frame | null;
  links: { href: string | null; text: string | null }[];
}

interface Wall {
  id: string;
  heading: string | null;
  pieces: Piece[];
}

/** One teaching week, as the list renders it. */
interface Week {
  id: string;
  label: string | null;
  href: string | null;
  where: string | null;
  caption: string | null;
  image: Frame | null;
  links: { href: string | null; text: string | null }[];
}

interface Room {
  id: string;
  title: string | null;
  intro: string | null;
  exitHrefs: (string | null)[];
  weeks: Week[];
  walls: Wall[];
}

interface Door {
  id: string;
  label: string | null;
  href: string | null;
  where: string | null;
  whereHrefs: (string | null)[];
  blurb: string | null;
}

interface Switch {
  hidden: boolean;
  label: string;
  expanded: string | null;
}

interface Toggle {
  before: Switch | null;
  after: Switch | null;
  back: Switch | null;
  focusStayedOnTheButton: boolean;
  /** Which of the two halves the control needs was not in the page. */
  missing: string | null;
}

interface Reading {
  /** What a search result says this page is — the one line on the page that no
   *  reader of the page ever sees, which is why it went stale unnoticed. */
  description: string | null;
  gallery: { id: string; tag: string; hidden: boolean; display: string } | null;
  /** The JSON the island is handed, as text, straight off the script tag. */
  payload: string | null;
  doors: Door[];
  rooms: Room[];
  stage: {
    hidden: boolean;
    boxed: boolean;
    mode: string | null;
    display: string;
    height: number;
    canvasDisplay: string;
    takeoverDisplay: string;
    galleryOverflow: string | null;
  } | null;
  listButton: { controls: string | null; hidden: boolean; display: string; text: string | null } | null;
}

/** Runs in the page. Everything it reports is read out of the gallery element
 *  itself, so a selector that stops matching reports an empty list rather than
 *  quietly passing on text that happens to be somewhere in the file. */
const PROBE = String.raw`
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
  const gallery = document.querySelector("#studio-list[data-studio-fallback]");
  const stage = document.querySelector("[data-backlot-stage]");
  const button = document.querySelector("[data-studio-list]");

  const doors = gallery
    ? [...gallery.querySelectorAll("section.backlot-doors li.backlot-door")].map((item) => {
        const link = item.querySelector("h3.backlot-door__name > a");
        return {
          id: item.id,
          label: text(link),
          href: link ? link.getAttribute("href") : null,
          where: text(item.querySelector("p.backlot-door__where")),
          whereHrefs: [...item.querySelectorAll("p.backlot-door__where a")].map((a) => a.getAttribute("href")),
          blurb: text(item.querySelector("p.backlot-door__blurb")),
        };
      })
    : [];

  const rooms = gallery
    ? [...gallery.querySelectorAll("section.backlot-room")].map((section) => ({
        id: section.id,
        title: text(section.querySelector("h2")),
        intro: text(section.querySelector("p.backlot-room__intro")),
        exitHrefs: [...section.querySelectorAll("p.backlot-room__exit a")].map((a) => a.getAttribute("href")),
        weeks: [
          ...section.querySelectorAll("section.backlot-weeks > ol.backlot-weeks__list > li.backlot-week"),
        ].map((week) => {
          const link = week.querySelector("h4.backlot-week__name > a");
          const image = week.querySelector("figure.backlot-week__figure img.backlot-week__frame");
          return {
            id: week.id,
            label: text(link),
            href: link ? link.getAttribute("href") : null,
            where: text(week.querySelector("p.backlot-week__where")),
            caption: text(week.querySelector("figure.backlot-week__figure > figcaption.backlot-week__caption")),
            image: image
              ? {
                  src: image.getAttribute("src"),
                  srcset: image.getAttribute("srcset"),
                  sizes: image.getAttribute("sizes"),
                  width: image.getAttribute("width"),
                  height: image.getAttribute("height"),
                  alt: image.getAttribute("alt"),
                }
              : null,
            links: [...week.querySelectorAll("p.backlot-week__links a")].map((a) => ({
              href: a.getAttribute("href"),
              text: text(a),
            })),
          };
        }),
        walls: [...section.querySelectorAll("section.backlot-wall")].map((wall) => ({
          id: wall.id,
          heading: text(wall.querySelector("h3.backlot-wall__heading")),
          pieces: [...wall.querySelectorAll("ol.backlot-wall__pieces > li.backlot-piece")].map((piece) => {
            const image = piece.querySelector("figure.backlot-piece__figure img.backlot-piece__frame");
            return {
              id: piece.id,
              caption: text(piece.querySelector("figure.backlot-piece__figure > figcaption.backlot-piece__caption")),
              image: image
                ? {
                    src: image.getAttribute("src"),
                    srcset: image.getAttribute("srcset"),
                    sizes: image.getAttribute("sizes"),
                    width: image.getAttribute("width"),
                    height: image.getAttribute("height"),
                    alt: image.getAttribute("alt"),
                  }
                : null,
              links: [...piece.querySelectorAll("p.backlot-piece__links a")].map((a) => ({
                href: a.getAttribute("href"),
                text: text(a),
              })),
            };
          }),
        })),
      }))
    : [];

  // The island's own copy of the manifest, read out of the document rather than
  // rebuilt from the module: the point of the assertion it feeds is that the
  // page resolved every href before serialising it, and resolving them again
  // here would be checking the test's arithmetic instead of the page's.
  const payloadTag = document.querySelector("script[data-backlot-payload]");

  const described = document.querySelector('meta[name="description"]');

  return {
    description: described ? described.getAttribute("content") : null,
    gallery: gallery
      ? { id: gallery.id, tag: gallery.tagName, hidden: gallery.hidden, display: getComputedStyle(gallery).display }
      : null,
    payload: payloadTag ? payloadTag.textContent : null,
    doors,
    rooms,
    stage: stage
      ? {
          hidden: stage.hidden,
          boxed: stage.hasAttribute("data-backlot-box"),
          mode: stage.getAttribute("data-backlot-mode"),
          display: getComputedStyle(stage).display,
          height: Math.round(stage.getBoundingClientRect().height),
          canvasDisplay: getComputedStyle(document.querySelector("[data-backlot-canvas]")).display,
          takeoverDisplay: getComputedStyle(document.querySelector("[data-backlot-takeover]")).display,
          galleryOverflow: gallery ? getComputedStyle(gallery).overflowY : null,
        }
      : null,
    listButton: button
      ? {
          controls: button.getAttribute("aria-controls"),
          hidden: button.hidden,
          display: getComputedStyle(button).display,
          text: text(button),
        }
      : null,
  };
`;

/** One browser: the page with scripts off at both marking viewports, then the
 *  same page with scripts on, where the status bar's control is driven. */
async function read() {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const url = `${site.origin}${prefix}backlot/`;
  try {
    await tab.scripts(false);
    await tab.viewport(1920, 1080);
    await tab.goto(url);
    const desktop = await tab.evaluate<Reading>(PROBE);

    await tab.viewport(390, 844);
    await tab.goto(url);
    const phone = await tab.evaluate<Reading>(PROBE);

    // The shared control, driven rather than inferred. It is
    // src/scripts/studio/status-bar.ts, written for /studio/, and all this page
    // does is carry the two hooks it looks for; that it therefore works here is
    // exactly the kind of thing that reads as true and is not.
    await tab.scripts(true);
    await tab.viewport(1920, 1080);
    await tab.goto(url);
    await tab.settle();
    const toggle = await tab.evaluate<Toggle>(String.raw`
      const button = document.querySelector("[data-studio-list]");
      const list = document.querySelector("[data-studio-fallback]");
      // Reported rather than thrown. When the gallery's hook was renamed in the
      // page, this probe crashed on a null and vitest reported "no tests" for
      // the whole file — a suite that cannot collect says nothing about what
      // broke, and the assertions below are the ones that should speak.
      if (!button || !list) {
        return {
          before: null,
          after: null,
          back: null,
          focusStayedOnTheButton: false,
          missing: button ? "the gallery" : "the status bar's control",
        };
      }
      const state = () => ({
        hidden: list.hidden,
        label: button.textContent.trim(),
        expanded: button.getAttribute("aria-expanded"),
      });
      button.focus();
      const before = state();
      button.click();
      const after = state();
      const focusStayedOnTheButton = document.activeElement === button;
      button.click();
      return { before, after, back: state(), focusStayedOnTheButton, missing: null };
    `);

    return { desktop, phone, toggle };
  } finally {
    await tab.close();
    await site.close();
  }
}

/**
 * Every anchor the routing depends on, driven as a fragment with JS off.
 *
 * The engine writes `#corridor`, `#machine-room` and `#week-05` into the address
 * bar, and with no JavaScript the only thing that can act on those is the
 * browser's own fragment navigation. That needs an element whose id **is** the
 * string — which makes these ids a contract between the island and this page,
 * and nothing was checking it.
 *
 * Three things are asserted and only the first is visible from the spelling:
 *
 *   - the id resolves, and to exactly one element. Native scrolling takes the
 *     first match silently, so a duplicated id is a fragment landing on the
 *     wrong thing with nothing to see.
 *   - the element is rendered. An id inside a `hidden` subtree scrolls nowhere
 *     and looks identical to a fragment that matched nothing.
 *   - the page actually moves to it. Measured rather than inferred: the two are
 *     not the same question, and the whole scheme rests on the second.
 *
 * And a fourth, which is the one a reader would have noticed first: the landing
 * is clear of the nav. The nav is sticky and 117 px tall, the theme's
 * `scroll-padding-top` is derived from it, and a fragment that comes to rest
 * anywhere above that puts the reader on a card whose own heading is behind the
 * bar — the picture and the note are on screen and which week you are looking at
 * is not. `#week-05` did exactly that, at both viewports, and every check here
 * was green: "on screen" cannot see it.
 *
 * **No reduced-motion preference, and that is now the whole point.** The theme
 * sets `scroll-behavior: smooth` (`base.css:27`) and drops it to `auto` under
 * the preference (`:478`), so asking for reduced motion used to be how this read
 * a finished scroll instead of the first frame of an animation. It was also how
 * it read a *different page from the marker's*: this page turns the animation
 * off for itself (`backlot.css`, `:root:has(.backlot-stage)`), because a smooth
 * scroll across eight thousand pixels of `content-visibility` lands where the
 * document used to end. Under the preference that rule is invisible — delete it
 * and a reduced-motion run stays green while a marker's browser lands 106 px
 * past the end of the document. So the readings are taken the way a marker
 * takes them, and the two-readings-apart shape below is what covers the
 * animation worry instead.
 *
 * **Two readings, and the first one is the evidence.** The rest position alone
 * says the page ended up somewhere; it does not say whether it got there or
 * merely drifted there. So each fragment is read as soon as the navigation
 * returns and again 1.2 s later, with the document's own height recorded at
 * both — the bug was a scroll computed against a layout that then shrank 638 px,
 * and a check holding only the final number cannot tell a landing that was right
 * from one that was corrected on the way.
 *
 * A differing query on every case, because two URLs that differ only by the
 * fragment are a same-document navigation and `goto` waits for a load event that
 * never comes.
 */
interface Anchor {
  fragment: string;
  matches: number;
  rendered: boolean;
  /** On screen after the fragment was applied. */
  scrolledTo: boolean;
  top: number;
  /** The same box, read as soon as the navigation returned. */
  topAtLanding: number;
  /** The card's own heading, which is the thing the nav hides. */
  headingTop: number;
  headingTopAtLanding: number;
  /** What is painted over the middle of that heading. */
  hitsOwnHeading: boolean;
  hit: string | null;
  navBottom: number;
  /** `scroll-padding-top`, resolved — the landing the theme asks for. */
  padding: number;
  /** The page has nowhere left to scroll, so the target rests below the fold
   *  through no fault of the anchor. */
  atEnd: boolean;
  docAtLanding: number;
  docAtRest: number;
}

const ANCHOR_READ = `
  const fragment = FRAGMENT;
  const all = [...document.querySelectorAll("[id]")].filter((one) => one.id === fragment);
  const target = all[0] ?? null;
  const box = target ? target.getBoundingClientRect() : null;
  // Every one of these sections leads with its own heading, and it is the
  // heading the sticky nav eats. Room sections head with an h2, week cards with
  // an h4; asking for either keeps this about "the name of the thing you landed
  // on" rather than about a tag.
  const heading = target ? target.querySelector("h2, h3, h4") : null;
  const hbox = heading ? heading.getBoundingClientRect() : null;
  const nav = document.querySelector("nav.at-nav");
  // elementFromPoint in the middle of the heading, which is the reader's own
  // question --- is the word covered --- rather than an arithmetic stand-in for
  // it. It answered div.at-nav-inner on the run that started all this.
  const hit =
    hbox && hbox.width > 0
      ? document.elementFromPoint(Math.round(hbox.left + hbox.width / 2), Math.round(hbox.top + hbox.height / 2))
      : null;
  const scroller = document.documentElement;
  return {
    fragment,
    matches: all.length,
    rendered: !!target && target.getClientRects().length > 0,
    // On screen, which is the question — not "at the top", which was
    // the first version and is a threshold I could not have defended.
    // The browser scrolls as far as it can and then stops: the last two
    // week cards are near the end of an 8,963 px document, so they come
    // to rest 774 px and 663 px down with the page fully scrolled, and
    // asking for the top failed them for having nowhere left to go.
    //
    // It still has teeth. A fragment that matches nothing leaves the
    // page at y=0 with these cards 7,000 to 8,000 px down, and week 12's
    // card is off screen even at the very bottom of the unscrolled page.
    scrolledTo: !!box && box.bottom > 0 && box.top < window.innerHeight,
    top: box ? Math.round(box.top) : 0,
    headingTop: hbox ? Math.round(hbox.top) : 0,
    hitsOwnHeading: !!target && !!hit && target.contains(hit),
    hit: hit ? hit.tagName.toLowerCase() + (typeof hit.className === "string" && hit.className ? "." + hit.className.trim().split(/\\s+/).join(".") : "") : null,
    navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : 0,
    padding: Math.round(parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0),
    atEnd: Math.round(window.scrollY) >= scroller.scrollHeight - window.innerHeight - 1,
    doc: scroller.scrollHeight,
  };
`;

/** The two viewports a marker opens, because this landed wrong at both and the
 *  phone one is not a narrower copy of the desktop one: the cards are taller,
 *  the document is 12,000 px rather than 8,500, and the entries the scroll
 *  passes over guess their height in the other direction. */
const ANCHOR_VIEWPORTS = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "phone", width: 390, height: 844 },
] as const;

type AnchorViewport = (typeof ANCHOR_VIEWPORTS)[number]["name"];

async function anchors(): Promise<Record<AnchorViewport, Anchor[]>> {
  const site = await serveBuild("dist", base);
  const tab = await Tab.launch();
  const read = { desktop: [] as Anchor[], phone: [] as Anchor[] };
  const wanted = [
    ...backlotManifest.rooms.map((room) => room.id),
    ...backlotManifest.rooms.flatMap((room) => (room.stages ?? []).map((stage) => stage.id)),
  ];
  try {
    await tab.media({ colourScheme: "dark" });
    await tab.scripts(false);
    for (const viewport of ANCHOR_VIEWPORTS) {
      await tab.viewport(viewport.width, viewport.height);
      for (const [index, fragment] of wanted.entries()) {
        const query = `${viewport.name}-${index}`;
        await tab.goto(`${site.origin}${prefix}backlot/?anchor=${query}#${fragment}`);
        const source = ANCHOR_READ.replace("FRAGMENT", JSON.stringify(fragment));
        const landing = await tab.evaluate<Anchor & { doc: number }>(source);
        await new Promise((done) => setTimeout(done, 1200));
        const rest = await tab.evaluate<Anchor & { doc: number }>(source);
        read[viewport.name].push({
          ...rest,
          topAtLanding: landing.top,
          headingTopAtLanding: landing.headingTop,
          docAtLanding: landing.doc,
          docAtRest: rest.doc,
        });
      }
    }
  } finally {
    await tab.close();
    await site.close();
  }
  return read;
}

const { desktop, phone, toggle } = await read();
const anchored = await anchors();

const room = backlotManifest.rooms[0]!;
const wallsInManifest = [...new Set(room.pieces.map((piece) => piece.wall))];
const piecesOn = (wall: string) =>
  room.pieces.filter((piece) => piece.wall === wall).sort((a, b) => a.slot - b.slot);

/** Every room the manifest gives a corridor to, found rather than named: a
 *  second corridor gets the whole of the block below on the day it appears,
 *  which a `rooms[1]` here would not (CLAUDE.md §7 on hand-kept scope). */
const withStages = backlotManifest.rooms.filter((entry) => (entry.stages?.length ?? 0) > 0);

// ---------------------------------------------------------------------------
// What the list is allowed to hang, now that it hangs thumbnails
// ---------------------------------------------------------------------------

/** Every master under public/studio/, grouped by its bytes.
 *
 *  **Astro content-addresses its derivatives**, so two masters that are the same
 *  bytes share one and it is named after whichever the build reached first:
 *  `hero-key-standin.avif` and `week04-t4.avif` are the same 63,662 bytes, and
 *  the left wall's frame is emitted under `week04-t4`'s name. That is
 *  deduplication working. A check that asserted the derivative carried its own
 *  master's filename would call it a bug and be wrong, which is why this groups
 *  by content rather than trusting a name. */
const mastersByContent = new Map<string, string[]>();
for (const path of globSync("public/studio/*.{avif,webp,png,jpg,jpeg}")) {
  const key = createHash("sha1").update(readFileSync(path)).digest("hex");
  mastersByContent.set(key, [...(mastersByContent.get(key) ?? []), basename(path)]);
}

/** The names a derivative of this master may legitimately be emitted under. */
function namesFor(file: string): string[] {
  const key = createHash("sha1").update(readFileSync(resolve("public/studio", file))).digest("hex");
  const names = mastersByContent.get(key);
  if (!names || names.length === 0) {
    throw new Error(`spec: ${file} is not a master under public/studio/, so nothing can be derived from it`);
  }
  return names.map((one) => one.replace(/\.[^.]+$/, ""));
}

/** Asserts an `<img>` in the list hangs a thumbnail of the right picture rather
 *  than the master itself, with the widths the layout asked for.
 *
 *  The point of the whole change is the bytes: the list was hanging a 120,348 B
 *  master in a 126 px column. So this asserts the served file is **smaller than
 *  the master**, which is the thing that would stop being true if the
 *  optimisation were dropped, and does not assert a size in kilobytes, which is
 *  a number nobody could defend. */
function assertThumbnail(
  shown: { src: string | null; width: string | null; height: string | null } & {
    srcset?: string | null;
    sizes?: string | null;
  },
  master: string,
  widths: number[],
  what: string,
): void {
  expect(shown.src, `${what} hangs nothing`).toBeTruthy();
  expect(
    shown.src!.startsWith(`${prefix}_astro/`),
    `${what} hangs ${shown.src}, which is the master out of public/studio/ rather than a thumbnail of it. ` +
      `The list is a catalogue of 126 px frames and the masters are up to 120 kB.`,
  ).toBe(true);

  const emitted = basename(shown.src!);
  expect(
    namesFor(master).some((name) => emitted.startsWith(`${name}.`)),
    `${what} hangs ${emitted}, which is not derived from ${master} or from any master with the same bytes ` +
      `(${namesFor(master).join(", ")})`,
  ).toBe(true);

  const served = resolve("dist", shown.src!.slice(prefix.length));
  expect(existsSync(served), `${what} points at ${shown.src}, which the build did not produce`).toBe(true);
  const derivative = statSync(served).size;
  const original = statSync(resolve("public/studio", master)).size;
  expect(
    derivative,
    `${what} serves ${derivative} B where the master ${master} is ${original} B — the thumbnail is not ` +
      `smaller than the picture it is a thumbnail of`,
  ).toBeLessThan(original);

  const offered = (shown.srcset ?? "")
    .split(",")
    .map((one) => one.trim().split(/\s+/)[1])
    .filter(Boolean);
  expect(
    offered,
    `${what} offers the widths ${offered.join(", ") || "(none)"}; the layout asks for ` +
      `${widths.map((one) => `${one}w`).join(", ")}`,
  ).toEqual(widths.map((one) => `${one}w`));
  expect(shown.sizes, `${what} has a srcset and no sizes, so the browser assumes 100vw`).toBeTruthy();
}

/** The candidates the page builds, which the layout's own rems decide: a piece's
 *  frame is 7rem and 9rem under 30rem, a week's is 4.5rem, and the root font is
 *  18px. Kept here as the two lists the page keeps, and a change to either has
 *  to be a change to both. */
const PIECE_WIDTHS = [162, 324];
const WEEK_WIDTHS = [81, 162];

// ---------------------------------------------------------------------------
// 1. The page a reader with no JavaScript gets.
// ---------------------------------------------------------------------------

// Seen red twice, each bug injected into the page and then reverted. Listing no
// rooms at all, which is what the skeleton did (`manifest.rooms.slice(0, 0)`):
//   AssertionError: expected [] to deeply equal [ 'machine-room' ]
//   (12 failed | 35 passed)
// and, with the rooms back, hanging no frame on a piece (`{false && frame && (`):
//   AssertionError: front-t1 hangs week05-t1.avif, the frame the manifest gives
//   it: expected undefined to be '/comp4020-ass2-Ray0766/studio/week05-…'
//   AssertionError: left-hero-key-standin hangs hero-key-standin.avif, the frame
//   the manifest gives it: expected undefined to be '/comp4020-ass2-…'

describe("with JavaScript off, the gallery is the page", () => {
  it("is in the document, visible, and is the element the status bar controls", () => {
    expect(desktop.gallery, "no element is #studio-list[data-studio-fallback]").not.toBeNull();
    expect(desktop.gallery!.hidden, "the gallery ships hidden, so a reader with JS off sees nothing").toBe(false);
    expect(desktop.gallery!.display).not.toBe("none");
    expect(desktop.listButton?.controls, "the status bar's control names a different element").toBe(
      desktop.gallery!.id,
    );
  });

  it("is not a box, and has nothing in it but the list", () => {
    // The stage now holds the gallery, so with JavaScript off it is not hidden
    // — it is simply the page. What must not be there is the *box*: no fixed
    // height, no inner scroller, and no canvas. The box is switched on by an
    // inline script during parsing, so a reader with no JavaScript never gets
    // one, and there is nothing to scroll inside anything else.
    expect(desktop.stage!.boxed, "the stage is a fixed box with JavaScript off").toBe(false);
    expect(desktop.stage!.mode, "the stage has a mode with JavaScript off").toBeNull();
    expect(desktop.stage!.galleryOverflow, "the list is an inner scroller with JavaScript off").not.toBe("auto");

    // A bare <canvas> is `display: inline` with a 300x150 intrinsic size, and a
    // `display` declared by an author rule beats the UA's `[hidden]` — measured
    // once as a 1920x923 empty rectangle above the list, and once as a painted
    // control that did nothing.
    expect(desktop.stage!.canvasDisplay, "the canvas is painted with JavaScript off").toBe("none");
    expect(desktop.stage!.takeoverDisplay, "the takeover button is painted with JavaScript off").toBe("none");

    // And the stage is the list's own height, not a viewport.
    expect(desktop.stage!.height).toBeGreaterThan(3000);
  });

  it("shows no control that does nothing", () => {
    // `.at-button` declares a display, which beats `[hidden]`; the same trap
    // three-second-demo.css records. "Show as a list" reveals a list that is
    // already the page here, and only the status bar's module can un-hide it.
    expect(desktop.listButton!.hidden).toBe(true);
    expect(desktop.listButton!.display, "a dead 'Show as a list' is painted with JS off").toBe("none");
  });

  it("lists every door, with the nav's own label and a link to the real page", () => {
    expect(desktop.doors.map((door) => door.id)).toEqual(
      backlotManifest.doors.map((door) => `door-${door.id}`),
    );
    expect(desktop.doors.map((door) => ({ label: door.label, href: door.href }))).toEqual(
      backlotManifest.doors.map((door) => ({ label: door.label, href: deployed(door.href) })),
    );
    expect(desktop.doors.map((door) => door.blurb)).toEqual(backlotManifest.doors.map((door) => door.blurb));
  });

  it("says where each door goes, and the one that opens a room links to the room", () => {
    for (const door of backlotManifest.doors) {
      const card = desktop.doors.find((candidate) => candidate.id === `door-${door.id}`)!;
      expect(card.where, `the ${door.label} door does not say where it goes`).toContain(door.href);
      if (door.kind === "room") {
        expect(card.whereHrefs, `the ${door.label} door does not link to the room behind it`).toEqual([
          `#${door.roomId}`,
        ]);
      }
    }
  });

  it("lists every room in the manifest, with its intro and its way to the Studio", () => {
    expect(desktop.rooms.map((entry) => entry.id)).toEqual(backlotManifest.rooms.map((entry) => entry.id));
    for (const entry of backlotManifest.rooms) {
      const rendered = desktop.rooms.find((candidate) => candidate.id === entry.id)!;
      expect(rendered.title).toBe(entry.title);
      expect(rendered.intro, `${entry.id} is listed without the sentence that says what it is`).toBe(entry.intro);
      expect(rendered.exitHrefs).toContain(deployed(entry.href));
    }
  });

  it("groups the room's pieces by wall, every wall the manifest uses and no others", () => {
    const rendered = desktop.rooms[0]!;
    expect(rendered.walls.map((wall) => wall.id)).toEqual(wallsInManifest.map((wall) => `wall-${wall}`));
    for (const wall of rendered.walls) {
      expect(wall.heading, `the ${wall.id} group has nothing over it`).toBeTruthy();
    }
  });

  for (const wall of wallsInManifest) {
    it(`carries every caption on the ${wall} wall, in slot order`, () => {
      const rendered = desktop.rooms[0]!.walls.find((candidate) => candidate.id === `wall-${wall}`)!;
      expect(rendered.pieces.map((piece) => piece.id)).toEqual(piecesOn(wall).map((piece) => piece.id));
      expect(rendered.pieces.map((piece) => piece.caption)).toEqual(piecesOn(wall).map((piece) => piece.caption));
    });

    it(`hangs the still or the poster of every piece on the ${wall} wall`, () => {
      const rendered = desktop.rooms[0]!.walls.find((candidate) => candidate.id === `wall-${wall}`)!;
      for (const piece of piecesOn(wall)) {
        const shown = rendered.pieces.find((candidate) => candidate.id === piece.id)!;
        const frame = piece.poster ?? piece.file;
        const isPicture = /\.(avif|webp|png|jpe?g)$/.test(frame);
        if (!isPicture) {
          // The desk's workflow graph is JSON; there is no frame to hang, and
          // the link below it is the whole of what it has.
          expect(shown.image, `${piece.id} hangs a picture for a file that is not one`).toBeNull();
          expect(shown.links.map((link) => link.href)).toContain(`${prefix}studio/${piece.file}`);
          continue;
        }
        assertThumbnail(shown.image!, frame, PIECE_WIDTHS, `${piece.id} on the ${wall} wall`);
        expect(
          existsSync(resolve("dist/studio", frame)),
          `${piece.id}'s master ${frame} is not in dist/studio/, so the 3D cannot load it either`,
        ).toBe(true);
        // Intrinsic size on the tag, so the space is the right shape before the
        // lazy image lands and the list does not reflow under a reader who is
        // scrolling it.
        expect([shown.image?.width, shown.image?.height]).toEqual([
          String(piece.aspect[0]),
          String(piece.aspect[1]),
        ]);
      }
    });
  }

  it("links every piece to its file, and every piece the Studio has to its place there", () => {
    const rendered = desktop.rooms[0]!;
    for (const piece of room.pieces) {
      const shown = rendered.walls
        .flatMap((wall) => wall.pieces)
        .find((candidate) => candidate.id === piece.id)!;
      const hrefs = shown.links.map((link) => link.href);
      expect(hrefs, `${piece.id} does not link to its own file`).toContain(`${prefix}studio/${piece.file}`);
      expect(
        existsSync(resolve("dist/studio", piece.file)),
        `${piece.id} links dist/studio/${piece.file}, which the build did not produce`,
      ).toBe(true);
      if (piece.studioAnchor) {
        expect(hrefs, `${piece.id} is in the Studio and the list does not say where`).toContain(
          `${prefix}studio/#${piece.studioAnchor}`,
        );
      }
    }
  });

  it("is the same page at 390x844", () => {
    expect(phone.doors.map((door) => door.href)).toEqual(desktop.doors.map((door) => door.href));
    expect(phone.rooms[0]!.walls.flatMap((wall) => wall.pieces.map((piece) => piece.caption))).toEqual(
      desktop.rooms[0]!.walls.flatMap((wall) => wall.pieces.map((piece) => piece.caption)),
    );
    expect(phone.rooms.flatMap((entry) => entry.weeks.map((week) => week.caption))).toEqual(
      desktop.rooms.flatMap((entry) => entry.weeks.map((week) => week.caption)),
    );
    expect(phone.stage!.boxed, "the stage is a fixed box on a phone with JS off").toBe(false);
    expect(phone.stage!.canvasDisplay, "the canvas is painted on a phone with JS off").toBe("none");
  });

  // The whole promise of this page in one line: with JS off nothing tells the
  // reader that a version they cannot have exists.
  it("never mentions the thing the reader is not getting", () => {
    const words = [
      "3D",
      "WebGL",
      "canvas",
      "JavaScript",
      "enable",
      "browser does not",
      "your browser",
      "fallback",
    ];
    const said = [desktop.gallery, desktop.doors, desktop.rooms];
    const blob = JSON.stringify(said).toLowerCase();
    for (const word of words) {
      expect(blob.includes(word.toLowerCase()), `the gallery says "${word}"`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 1b. The corridor, with JavaScript off: twelve teaching weeks as twelve cards.
// ---------------------------------------------------------------------------
//
// The teaching point of the Lectures corridor is four things — twelve weeks in
// order, which wall each door is on, what is behind each window, and that four
// of the twelve recorded nothing — and it has to be complete with no JavaScript
// at all, because that is what this page promises. None of it is 3D-only: a
// reader who never gets the island gets the same four facts out of a list.
//
// Every assertion below is derived from `room.stages`, so a thirteenth week
// added to `src/content/lectures/` is checked the moment the manifest builds it.
//
// Seen red three times, each bug put into src/pages/backlot/index.astro and then
// reverted.
//
//   Rendering no cards at all (`room.stages && false && ...`):
//     AssertionError: the corridor lists no weeks at all, so the teaching point
//     is 3D-only: expected [] to deeply equal [ 'week-01', 'week-02', …(10) ]
//     (9 failed | 55 passed)
//
//   Dropping the unshot branch, so the four weeks that recorded nothing got the
//   shot sentence (`if (pane.kind === "unshot")` -> `if (false)`) — the build
//   threw instead, from the `Add one` line at the bottom of `windowNote`, which
//   is the failure landing one step earlier than this file and is the right
//   place for it. With the throw removed as well and the shot sentence
//   returned for all twelve:
//     AssertionError: week-01 recorded nothing and its card does not say so. It
//     says: "Behind the window: the still week 1 opens on."
//     (4 failed | 60 passed)
//
//   Writing one week's name into the page by hand rather than reading it off the
//   manifest (`{label}` -> `Week 5: Text to Video`):
//     AssertionError: src/pages/backlot/index.astro writes "Text to Video" for
//     itself. Everything a card says about a week is the manifest's, which reads
//     the lecture's own frontmatter — a second copy here is a week that gets
//     renamed in one place.: expected [ 'the title of week-05…' ] to deeply
//     equal []
describe("with JavaScript off, the corridor is twelve week cards", () => {
  it("has a corridor to be about", () => {
    // The floor. With no room carrying stages every assertion below is about an
    // empty list and would pass on a page with nothing on it.
    expect(
      withStages.map((entry) => entry.id),
      "no room in the manifest has stages, so this whole block is about nothing",
    ).not.toEqual([]);
  });

  for (const entry of withStages) {
    const stages = entry.stages!;
    const rendered = () => desktop.rooms.find((candidate) => candidate.id === entry.id)!;

    it(`${entry.id} lists every week, in the manifest's order`, () => {
      expect(rendered().weeks.map((week) => week.id), "the corridor lists no weeks at all, so the teaching point is 3D-only")
        .toEqual(stages.map((stage) => stage.id));
    });

    it(`${entry.id} names each week with the same sentence its own button carries`, () => {
      // The card's link text and the hotspot's label are one string in the
      // manifest. A page that wrote its own would be a week with two names, and
      // the 3D and the list disagreeing is the failure this page is built to
      // make impossible.
      for (const stage of stages) {
        const control = entry.interactives.find((one) => one.stageId === stage.id)!;
        const card = rendered().weeks.find((week) => week.id === stage.id)!;
        expect(card.label, `${stage.id}'s card does not carry its own button's label`).toBe(control.label);
      }
    });

    it(`${entry.id} links every week to the page the site builds for it`, () => {
      for (const stage of stages) {
        const card = rendered().weeks.find((week) => week.id === stage.id)!;
        expect(card.href, `${stage.id}'s card does not link to its own week`).toBe(deployed(stage.href));
        expect(
          existsSync(resolve(distPath(deployed(stage.href)), "index.html")),
          `${stage.id} links ${deployed(stage.href)}, which is not a page in dist/`,
        ).toBe(true);
      }
    });

    it(`${entry.id} says where each week's door is, and says it differently per wall`, () => {
      // Two halves, and the second is what stops the first being satisfied by a
      // constant. Every card says its position; strip the position and what is
      // left has to be one phrase per side the manifest uses, no more and no
      // fewer — a page that says "on the left" for all twelve passes the first
      // and fails this.
      const phrases = new Map<string, Set<string>>();
      for (const stage of stages) {
        const card = rendered().weeks.find((week) => week.id === stage.id)!;
        expect(card.where, `${stage.id}'s card does not say where it is in the corridor`).toBeTruthy();
        expect(
          card.where,
          `${stage.id} is ${stage.depth + 1} of ${stages.length} down the corridor and its card does not say so`,
        ).toContain(`${stage.depth + 1} of ${stages.length}`);
        const rest = card.where!.replace(new RegExp(`^.*${stage.depth + 1} of ${stages.length}`), "").trim();
        if (!phrases.has(stage.side)) phrases.set(stage.side, new Set());
        phrases.get(stage.side)!.add(rest);
      }
      const sides = [...new Set(stages.map((stage) => stage.side))].sort();
      expect([...phrases.keys()].sort(), "a side in the manifest has no card on it").toEqual(sides);
      for (const [side, said] of phrases) {
        expect([...said], `the ${side} wall is described in more than one way`).toHaveLength(1);
      }
      const all = [...phrases.values()].map((said) => [...said][0]!);
      expect(
        new Set(all).size,
        `${sides.length} walls are described with ${new Set(all).size} phrase(s): ${all.join(" / ")}`,
      ).toBe(sides.length);
    });

    it(`${entry.id} hangs the frame behind every door that has one`, () => {
      for (const stage of stages.filter((one) => one.window.kind === "still")) {
        const pane = stage.window as { kind: "still"; file: string; aspect: [number, number]; clip?: string };
        const card = rendered().weeks.find((week) => week.id === stage.id)!;
        assertThumbnail(card.image!, pane.file, WEEK_WIDTHS, stage.id);
        expect(
          existsSync(resolve("dist/studio", pane.file)),
          `${stage.id}'s master ${pane.file} is not in dist/studio/, so the 3D cannot load it either`,
        ).toBe(true);
        // Intrinsic size on the tag, so the space is the right shape before a
        // lazy image lands and six thousand pixels of list do not reflow under
        // somebody scrolling them.
        expect([card.image?.width, card.image?.height]).toEqual([
          String(pane.aspect[0]),
          String(pane.aspect[1]),
        ]);
        const hrefs = card.links.map((link) => link.href);
        expect(hrefs, `${stage.id} does not link the frame in its window`).toContain(
          `${prefix}studio/${pane.file}`,
        );
        if (pane.clip) {
          expect(hrefs, `${stage.id}'s window is a poster and the card does not offer the clip`).toContain(
            `${prefix}studio/${pane.clip}`,
          );
          expect(
            existsSync(resolve("dist/studio", pane.clip)),
            `${stage.id} links dist/studio/${pane.clip}, which the build did not produce`,
          ).toBe(true);
        }
      }
    });

    it(`${entry.id} says which weeks have not been shot, and hangs nothing for them`, () => {
      const unshot = stages.filter((one) => one.window.kind === "unshot");
      // Derived from the manifest, and it has to be non-empty or the branch
      // below is a comment: four of the twelve recorded nothing today.
      expect(
        unshot.map((one) => one.id),
        "no week in the manifest is unshot, so the sentence this checks is never rendered",
      ).not.toEqual([]);
      const shotCaptions = new Set(
        stages
          .filter((one) => one.window.kind === "still")
          .map((one) => rendered().weeks.find((week) => week.id === one.id)!.caption),
      );
      for (const stage of unshot) {
        const card = rendered().weeks.find((week) => week.id === stage.id)!;
        expect(card.image, `${stage.id} recorded nothing and its card hangs a picture anyway`).toBeNull();
        expect(
          card.links,
          `${stage.id} recorded nothing and its card offers a file to open`,
        ).toEqual([]);
        expect(
          card.caption?.toLowerCase(),
          `${stage.id} recorded nothing and its card does not say so. It says: "${card.caption}"`,
        ).toContain("not been shot");
        expect(
          card.caption,
          `${stage.id}'s card does not say which week it is talking about`,
        ).toContain(String(stage.week));
        expect(
          shotCaptions.has(card.caption),
          `${stage.id} recorded nothing and its card carries the same sentence as a week that did`,
        ).toBe(false);
      }
    });
  }

  it("writes nothing about a week that the manifest already says", () => {
    // The rule this block exists to keep: a week's number, its title, its route
    // and the file behind its door are the lectures collection's and the
    // Studio's, and the page interpolates all four. A second copy here is a week
    // that gets renamed in one place and stays wrong in the other, which is the
    // failure `doorKinds` and `WALL_HEADINGS` are both shaped to prevent.
    //
    // Against the source rather than the render, and that is the one place a
    // substring match is the right instrument: the question is literally whether
    // these characters are typed in this file.
    const page = source("src/pages/backlot/index.astro");
    const written: string[] = [];
    for (const entry of withStages) {
      for (const stage of entry.stages!) {
        if (page.includes(stage.title)) written.push(`the title of ${stage.id}, "${stage.title}"`);
        if (page.includes(stage.href)) written.push(`the route of ${stage.id}, "${stage.href}"`);
        if (stage.window.kind === "still" && page.includes(stage.window.file)) {
          written.push(`the file behind ${stage.id}, "${stage.window.file}"`);
        }
      }
    }
    expect(
      written,
      `src/pages/backlot/index.astro writes ${written[0] ?? "nothing"} for itself. Everything a card says ` +
        `about a week is the manifest's, which reads the lecture's own frontmatter — a second copy here is a ` +
        `week that gets renamed in one place.`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1a-ii. The sentence a search result shows.
// ---------------------------------------------------------------------------
//
// It said "the six doors … and the machine room behind the Studio one" for a
// whole round after the corridor landed, because a meta description is the one
// line on a page that nobody reading the page ever sees. So the counts in it are
// the manifest's, and this checks they are still the manifest's rather than
// checking the wording, which is mine to change.
//
// Seen red by pinning the count in src/pages/backlot/index.astro
// (`${backlotManifest.doors.length}` -> `six`):
//   AssertionError: the page describes itself with "six" doors and the manifest
//   has 6. A description is the one line on this page a reader of it never sees,
//   which is why it went a whole round describing a backlot with one room in it.
describe("the sentence a search result shows keeps up with the manifest", () => {
  it("counts the doors and the weeks the manifest has", () => {
    const said = desktop.description ?? "";
    expect(said, "the page has no meta description at all").not.toBe("");
    const doors = backlotManifest.doors.length;
    const weeks = backlotManifest.rooms.reduce((sum, room) => sum + (room.stages?.length ?? 0), 0);
    expect(
      said,
      `the page describes itself as "${said}" and the manifest has ${doors} doors. A description is the ` +
        `one line on this page a reader of it never sees, which is why it went a whole round describing a ` +
        `backlot with one room in it.`,
    ).toContain(String(doors));
    expect(
      said,
      `the page describes itself as "${said}" and the manifest has ${weeks} teaching weeks`,
    ).toContain(String(weeks));
  });

  it("names every room the manifest builds", () => {
    // Keyed on the room's **id**, not its title, and not on the wording.
    //
    // The failure this guards is a room arriving and the sentence not moving,
    // which is a fact about the manifest. Requiring the title verbatim would be
    // a straitjacket on prose — my first version demanded "lectures corridor"
    // and failed a description that says "corridor of doors behind the Lectures
    // one", which is the sentence I would defend. The id's own words are the
    // distinctive nouns and they come from the manifest either way.
    const said = (desktop.description ?? "").toLowerCase();
    for (const room of backlotManifest.rooms) {
      for (const word of room.id.split("-")) {
        expect(
          said,
          `the description never says "${word}", so it does not mention ${room.id}: ` +
            `"${desktop.description}"`,
        ).toContain(word);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 1b-ii. The anchors the routing writes into the address bar.
// ---------------------------------------------------------------------------
//
// The engine writes `#corridor`, `#machine-room` and `#week-05`, and with no
// JavaScript the browser's own fragment navigation is the only thing that can
// act on them. So these ids are a contract between the island and this page, and
// until the routing existed nothing checked them.
//
// Seen red three ways, each injection matched once and reverted:
//
//   the id taken off the week card (`id={stage.id}` -> `id={`card-${stage.id}`}`):
//     AssertionError: #week-01 matches 0 elements in the page. The engine writes
//     this fragment into the address bar and with no JavaScript the browser's
//     own scrolling is the only thing that acts on it.
//   the same id on two cards (`id={stage.id}` -> `id="week-01"`):
//     AssertionError: #week-01 matches 12 elements. Native scrolling silently
//     takes the first, so a duplicate is a fragment landing on the wrong thing.
//   the corridor section shipped `hidden`:
//     AssertionError: #corridor names an element that is not rendered, so the
//     fragment scrolls nowhere and looks exactly like one that matched nothing.
//
// And the landing half twice more, both patched into the built stylesheet so no
// rebuild could land mid-run and wipe the injection, each matched once and
// reverted. Putting the theme's smooth scroll back on this page
// (`:root:has(.backlot-stage){scroll-behavior:auto}` -> `smooth`), 39 failures:
//     AssertionError: #week-05 put its own heading -61 px down, behind a nav
//     whose bottom edge is at 117. The reader can see the picture and the note
//     and not which week they landed on.
//       landed at top=7473 with the document 8658 px tall, came to rest at
//       top=-106 with it 8069 px tall [...] elementFromPoint in the middle of it
//       answers nothing.
// and putting the week cards back behind `content-visibility`
// (`.backlot-piece{` -> `.backlot-piece,.backlot-week{`), 6 failures:
//     AssertionError: #week-06 sat 33 px from the top of the viewport at the
//     moment the navigation returned, and the theme asks for 135
//       [...] The heading was 100 px down on landing and 100 at rest, and
//       elementFromPoint in the middle of it answers div.at-nav-inner.
//
// All six of those are the **phone**. On desktop the same injection came out
// green in that run: the bug is a race, and there scroll anchoring happened to
// win it. It does not always — the probe at
// receipts/rig-3d/a2-anchor-landing.ts reads the pre-fix build at 1920x1080
// landing #week-05 at top=47 with div.at-nav-inner over its heading. Which is
// the argument for both viewports rather than one, and for reading the landing
// as well as the rest: neither on its own is red every time this is broken.
describe("the fragments the routing writes reach something, with JavaScript off", () => {
  it("has anchors to be about", () => {
    const wanted =
      backlotManifest.rooms.length +
      backlotManifest.rooms.reduce((sum, room) => sum + (room.stages?.length ?? 0), 0);
    // Both viewports, separately: a run that lost one of them would otherwise
    // assert half as much under the same green line.
    for (const viewport of ANCHOR_VIEWPORTS) {
      expect(anchored[viewport.name].map((one) => one.fragment)).toHaveLength(wanted);
      // The landing assertions compare against `scroll-padding-top`, read off
      // the page rather than typed in here. If that read ever comes back as
      // `auto` it parses to zero, and every one of them would quietly become
      // "the card is at the very top of the viewport" — a different check,
      // passing or failing for a different reason. So the number itself is a
      // thing this has to prove it got.
      for (const one of anchored[viewport.name]) {
        expect(
          one.padding,
          `scroll-padding-top read back as ${one.padding} at ${viewport.name}, so there is no landing for ` +
            `the anchors to be measured against`,
        ).toBeGreaterThan(0);
        expect(
          one.navBottom,
          `the nav's bottom edge read back as ${one.navBottom} at ${viewport.name}, so the clearance ` +
            `assertions are about nothing`,
        ).toBeGreaterThan(0);
      }
    }
  });

  for (const anchor of [
    ...backlotManifest.rooms.map((room) => room.id),
    ...backlotManifest.rooms.flatMap((room) => (room.stages ?? []).map((stage) => stage.id)),
  ]) {
    for (const viewport of ANCHOR_VIEWPORTS) {
      it(`#${anchor} names one rendered element, and the page goes to it at ${viewport.name}`, () => {
        const read = anchored[viewport.name].find((one) => one.fragment === anchor)!;
        expect(
          read.matches,
          `#${anchor} matches ${read.matches} element(s) in the page. The engine writes this fragment into ` +
            `the address bar and with no JavaScript the browser's own scrolling is the only thing that acts ` +
            `on it; native scrolling silently takes the first match, so a duplicate lands on the wrong thing.`,
        ).toBe(1);
        expect(
          read.rendered,
          `#${anchor} names an element that is not rendered, so the fragment scrolls nowhere and looks ` +
            `exactly like one that matched nothing.`,
        ).toBe(true);
        expect(
          read.scrolledTo,
          `#${anchor} left the element ${read.top} px from the top of a ${viewport.height} px viewport, ` +
            `so it is off screen and the page did not go to it. Matching an id and being scrolled to are ` +
            `different questions and this is the second.`,
        ).toBe(true);
      });

      it(`#${anchor} lands with its own heading clear of the nav at ${viewport.name}`, () => {
        const read = anchored[viewport.name].find((one) => one.fragment === anchor)!;
        const where =
          `\n  landed at top=${read.topAtLanding} with the document ${read.docAtLanding} px tall, ` +
          `came to rest at top=${read.top} with it ${read.docAtRest} px tall; the nav's bottom edge is ` +
          `${read.navBottom} and scroll-padding-top is ${read.padding}. The heading was ` +
          `${read.headingTopAtLanding} px down on landing and ${read.headingTop} at rest, and ` +
          `elementFromPoint in the middle of it answers ${read.hit ?? "nothing"}.`;

        // The landing itself, and the same reading 1.2 s later. Both, because a
        // fragment scroll computed against a layout that then changes height
        // gets one of them right and not the other: #week-05 landed at 210 and
        // drifted to 47 while the document lost 638 px underneath it.
        // Week 12 sits inside the last viewport of the document, so the browser
        // scrolls to the end and stops. Nothing is wrong with that landing and
        // there is no padding for it to meet; it still has to be readable,
        // which the clearance assertions below cover either way.
        if (!read.atEnd) {
          for (const [when, top, why] of [
            [
              "the moment the navigation returned",
              read.topAtLanding,
              "Either the fragment scroll is being animated — this page turns scroll-behavior off for " +
                "itself, because a smooth scroll across eight thousand pixels of content-visibility lands " +
                "where the document used to end — or the layout moved under it before it got there.",
            ],
            [
              "1.2 s later",
              read.top,
              "The scroll was computed once, against a layout that then changed height, and the browser " +
                "does not recompute it.",
            ],
          ] as const) {
            expect(
              top,
              `#${anchor} sat ${top} px from the top of the viewport at ${when}, and the theme asks for ` +
                `${read.padding} — the scroll-padding it derives from the sticky nav. ${why}${where}`,
            ).toBe(read.padding);
          }
        }

        expect(
          read.headingTop,
          `#${anchor} put its own heading ${read.headingTop} px down, behind a nav whose bottom edge is ` +
            `at ${read.navBottom}. The reader can see the picture and the note and not which week they ` +
            `landed on.${where}`,
        ).toBeGreaterThanOrEqual(read.navBottom);
        expect(
          read.headingTopAtLanding,
          `#${anchor} put its own heading ${read.headingTopAtLanding} px down on landing, behind a nav ` +
            `whose bottom edge is at ${read.navBottom}.${where}`,
        ).toBeGreaterThanOrEqual(read.navBottom);

        // The arithmetic above says the heading is below the bar. This says
        // nothing is painted over it, which is the question the arithmetic is a
        // stand-in for, and it is the reading that named the bug.
        expect(
          read.hitsOwnHeading,
          `#${anchor}: the middle of its heading is painted by ${read.hit ?? "nothing"}, which is not ` +
            `inside the card. Being below a number and being visible are different questions.${where}`,
        ).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 1c. Every href the island is handed is already resolved for the sub-path.
// ---------------------------------------------------------------------------
//
// The island never calls `withBase`, so a root-absolute href in the payload is a
// link that works on localhost and 404s on Pages (CLAUDE.md §4). The stages were
// the one place this had slipped: `BacklotStage.href` says in the manifest that
// the page resolves it, and the page was resolving doors, rooms and interactives
// and not stages.
//
// Walked over the whole payload rather than over the three keys that were known
// to matter, because "the three keys that were known to matter" is how the
// fourth one got missed.
//
// Seen red by taking the stage mapping back out of src/pages/backlot/index.astro
// and rebuilding:
//   AssertionError: 12 href(s) in the payload are not resolved for the
//   sub-path, so they 404 on Pages: manifest.rooms[1].stages[0].href =
//   /lectures/week-01/, manifest.rooms[1].stages[1].href = /lectures/week-02/,
//   …: expected [ 'manifest.rooms[1].stages[0]…', …(11) ] to deeply equal []
// then put back.
describe("the payload the island is handed", () => {
  const walk = (node: unknown, path: string, bad: string[]): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, bad));
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "href" && typeof value === "string" && !value.startsWith(prefix)) {
        bad.push(`${path}.${key} = ${value}`);
      }
      walk(value, `${path}.${key}`, bad);
    }
  };

  it("is in the page at all", () => {
    expect(desktop.payload, "no script[data-backlot-payload] is in the document").not.toBeNull();
    expect(JSON.parse(desktop.payload!)).toHaveProperty("manifest");
  });

  it("resolves every href in it for the sub-path", () => {
    const bad: string[] = [];
    walk(JSON.parse(desktop.payload!), "payload", bad);
    expect(
      bad,
      `${bad.length} href(s) in the payload are not resolved for the sub-path, so they 404 on Pages: ` +
        bad.join(", "),
    ).toEqual([]);
  });

  it("found hrefs to check", () => {
    // The failure mode of the walk above is that it stops finding hrefs and
    // reports a clean run.
    const found: string[] = [];
    const count = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(count);
      if (node === null || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "href" && typeof value === "string") found.push(value);
        count(value);
      }
    };
    count(JSON.parse(desktop.payload!));
    const stages = backlotManifest.rooms.reduce((sum, entry) => sum + (entry.stages?.length ?? 0), 0);
    expect(
      found.length,
      `the walk found ${found.length} hrefs in the payload, which is fewer than the doors and stages the ` +
        `manifest alone has — it has stopped looking at the thing it is about`,
    ).toBeGreaterThanOrEqual(backlotManifest.doors.length + stages);
  });
});

// ---------------------------------------------------------------------------
// 2. The ring is the nav.
// ---------------------------------------------------------------------------

// Seen red twice, then reverted. Dropping the last door from the ring
// (`doorCards.slice(0, -1)`):
//   AssertionError: the doors are the nav, in the nav's order, with the nav's
//   labels: expected [ { label: 'Lectures', …(1) }, …(4) ] to deeply equal
//   [ { label: 'Lectures', …(1) }, …(5) ]
// and pointing one door at a page that is not built (`/backstage/`):
//   AssertionError: the Policies door goes to /comp4020-ass2-Ray0766/backstage/,
//   which is not a page in dist/: expected false to be true
// The build's own link checker caught that second one first, which is the
// belt-and-braces working; this catches the case where a door's href is right
// for the checker and wrong for the ring.
describe("the ring is the nav", () => {
  it("has a nav to be", () => {
    expect(navLinks.length, "siteConfig declares no links, so every door assertion below is about nothing")
      .toBeGreaterThan(0);
  });

  it("is the nav's links, in the nav's order, with the nav's labels and hrefs", () => {
    expect(
      desktop.doors.map((door) => ({ label: door.label, href: door.href })),
      "the doors are the nav, in the nav's order, with the nav's labels",
    ).toEqual(navLinks.map((link) => ({ label: link.text, href: deployed(link.href) })));
  });

  it("is the same list the island is handed, so the 3D and the gallery cannot disagree", () => {
    expect(backlotManifest.doors.map((door) => door.label)).toEqual(navLinks.map((link) => link.text));
    expect(backlotManifest.doors.map((door) => door.href)).toEqual(navLinks.map((link) => link.href));
    expect(backlotManifest.doors.map((door) => door.order)).toEqual(navLinks.map((_, index) => index));
  });

  it("sends every door at a page that exists in dist/", () => {
    for (const door of desktop.doors) {
      const built = resolve(distPath(door.href!), "index.html");
      expect(
        existsSync(built),
        `the ${door.label} door goes to ${door.href}, which is not a page in dist/`,
      ).toBe(true);
    }
  });

  // Widened when the corridor arrived, and widened rather than renumbered. This
  // used to compare the two lists *in order*, which was true while there was one
  // room and was never a fact: `doors` is in nav order and `rooms` is in the
  // manifest's own, and nothing makes those the same sequence. With the corridor
  // in, the nav opens the corridor first and the manifest lists the machine room
  // first, and the equality failed on an ordering that means nothing. What the
  // page actually needs is a bijection — every room reachable through exactly one
  // door, and every door that claims a room opening one that exists.
  //
  // Seen red by pointing a door at a room the manifest does not have
  // (`roomId: "green-room"` on the Dailies entry in doorKinds) and reverting:
  //   AssertionError: the Dailies door opens "green-room", which is not a room
  //   in the manifest: expected undefined to be defined
  it("opens every room through exactly one door, and every room door opens a real one", () => {
    const roomDoors = backlotManifest.doors.filter((door) => door.kind === "room");
    for (const door of roomDoors) {
      expect(
        backlotManifest.rooms.find((entry) => entry.id === door.roomId),
        `the ${door.label} door opens ${JSON.stringify(door.roomId)}, which is not a room in the manifest`,
      ).toBeDefined();
    }
    for (const entry of backlotManifest.rooms) {
      const opening = roomDoors.filter((door) => door.roomId === entry.id);
      expect(
        opening.map((door) => door.label),
        `${entry.id} is opened by ${opening.length} door(s), and a room is reached through exactly one`,
      ).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. "Show as a list", which is not this page's control.
// ---------------------------------------------------------------------------

// Seen red by renaming the gallery's hook to `data-backlot-fallback` in the
// page and reverting:
//   AssertionError: no element is #studio-list[data-studio-fallback]: expected
//   null not to be null
//   AssertionError: the gallery is not in the page, so the control cannot reach
//   it: expected 'the gallery' to be null
//   (18 failed | 29 passed)
// And the point of reading a rendered document rather than the file: with that
// rename in place, `grep -c data-studio-fallback dist/backlot/index.html` still
// answered 1. The status bar's module is inlined into the page and names the
// attribute in its own querySelector, so a `.toContain` on it would have stayed
// green while nothing on the page carried it (CLAUDE.md §7 records this exact
// pair costing a round).
describe("the status bar's control reaches this page's gallery", () => {
  it("flips the list and says what the next press will do", () => {
    expect(toggle.missing, `${toggle.missing} is not in the page, so the control cannot reach it`).toBeNull();
    expect(toggle.after!.hidden, "pressing the control did not flip the list").toBe(!toggle.before!.hidden);
    expect(toggle.back!.hidden, "pressing it again did not put the list back").toBe(toggle.before!.hidden);
    expect(toggle.after!.label).toBe(toggle.after!.hidden ? "Show as a list" : "Hide the list");
    expect(toggle.after!.expanded).toBe(String(!toggle.after!.hidden));
  });

  it("leaves focus on the control that was pressed", () => {
    // A control must not take focus away from the person who just used it
    // (CLAUDE.md §7): pressing a key twice has to mean doing the thing twice.
    expect(toggle.focusStayedOnTheButton).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. No colour literal anywhere in the backlot.
// ---------------------------------------------------------------------------

// Seen red by writing the brand gold into backlot.css as a literal
// (`.backlot-door__order { color: #b97d1c }`) and reverting:
//   AssertionError: Colour comes from --at-* through ColourReader, which
//   resolves a token the way the compositor does — so both themes come out of
//   the same code, and neither is written twice.: expected [ Array(1) ] to
//   deeply equal []
//   + [ "src/styles/backlot.css:267 writes the colour literal \"#b97d1c\"" ]
describe("the backlot holds no colour of its own", () => {
  // Derived, never enumerated: a hand-written file list is a check that goes
  // quiet the day somebody adds a file (CLAUDE.md §7).
  const FILES = [
    ...globSync("src/backlot/**/*.ts"),
    ...globSync("src/styles/backlot*.css"),
  ].sort();

  /** A hex colour in CSS (#rgb, #rgba, #rrggbb, #rrggbbaa), a hex colour as the
   *  number three's Color takes, and every functional colour notation. Anchored
   *  so a `#week-05:t1` anchor or an `0x1f` bitmask is not one. */
  const LITERALS = [
    /#[0-9a-fA-F]{3,4}\b(?![0-9a-fA-F])/g,
    /#[0-9a-fA-F]{6}\b(?![0-9a-fA-F])/g,
    /#[0-9a-fA-F]{8}\b(?![0-9a-fA-F])/g,
    /\b0x[0-9a-fA-F]{6}\b/g,
    /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/g,
  ];

  it("has files to check", () => {
    expect(FILES.length, "nothing matched src/backlot/**/*.ts").toBeGreaterThan(3);
  });

  /** Comments blanked, line for line, so the numbers in a failure still point
   *  at the right line. The rule is about what the code paints: a comment that
   *  says the palette is oklch and that a parser cannot read it is the honest
   *  sentence explaining why none of this is a literal, and a check that makes
   *  that sentence unwriteable is a check that gets the comment reworded rather
   *  than the code fixed (CLAUDE.md §7). A commented-out line of code is not
   *  painting anything either way. */
  const withoutComments = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .replace(/^(\s*)\/\/.*$/gm, (line) => line.replace(/[^\n]/g, " "));

  for (const file of FILES) {
    it(`${file} takes its colour from a token`, () => {
      const text = withoutComments(source(file));
      const offenders: string[] = [];
      for (const pattern of LITERALS) {
        for (const match of text.matchAll(pattern)) {
          const line = text.slice(0, match.index).split("\n").length;
          offenders.push(`${file}:${line} writes the colour literal "${match[0]}"`);
        }
      }
      expect(
        offenders,
        "Colour comes from --at-* through ColourReader, which resolves a token the way the " +
          "compositor does — so both themes come out of the same code, and neither is written twice.",
      ).toEqual([]);
    });
  }
});
