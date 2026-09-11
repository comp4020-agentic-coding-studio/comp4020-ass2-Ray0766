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

import { existsSync, globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

interface Piece {
  id: string;
  caption: string | null;
  image: { src: string | null; width: string | null; height: string | null; alt: string | null } | null;
  links: { href: string | null; text: string | null }[];
}

interface Wall {
  id: string;
  heading: string | null;
  pieces: Piece[];
}

interface Room {
  id: string;
  title: string | null;
  intro: string | null;
  exitHrefs: (string | null)[];
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
  gallery: { id: string; tag: string; hidden: boolean; display: string } | null;
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

  return {
    gallery: gallery
      ? { id: gallery.id, tag: gallery.tagName, hidden: gallery.hidden, display: getComputedStyle(gallery).display }
      : null,
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

const { desktop, phone, toggle } = await read();

const room = backlotManifest.rooms[0]!;
const wallsInManifest = [...new Set(room.pieces.map((piece) => piece.wall))];
const piecesOn = (wall: string) =>
  room.pieces.filter((piece) => piece.wall === wall).sort((a, b) => a.slot - b.slot);

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
        expect(shown.image?.src, `${piece.id} hangs ${frame}, the frame the manifest gives it`).toBe(
          `${prefix}studio/${frame}`,
        );
        expect(
          existsSync(resolve("dist/studio", frame)),
          `${piece.id} points at dist/studio/${frame}, which the build did not produce`,
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

  it("gives exactly one door a room, and the room is built", () => {
    const withRooms = backlotManifest.doors.filter((door) => door.kind === "room");
    expect(withRooms.map((door) => door.roomId)).toEqual(backlotManifest.rooms.map((entry) => entry.id));
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
