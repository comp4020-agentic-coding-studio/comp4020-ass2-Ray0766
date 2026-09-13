// What the backlot contains, stated once, at build time.
//
// Two rules hold this file together, and they are the reason it exists rather
// than each builder naming its own things:
//
//   1. The ring is the nav. Door labels, their order and where they go are read
//      off `siteConfig.links` — the same array the theme's Nav renders — not
//      retyped here. Adding a nav link and forgetting the backlot is a build
//      error (see `doorKinds` below), not a ring that quietly disagrees with
//      the bar above it.
//   2. A room's walls are the Studio's own manifests. The machine room hangs
//      real recorded files, and their captions are the notes already written in
//      src/data/studio/*.json — so a note fixed there is fixed on the wall too,
//      and no sentence about the rig exists in two places.
//
// This module is build-time only: it imports src/lib/studio.ts, which inlines
// every studio JSON with import.meta.glob. The page below /pages/backlot/
// serialises the parsed result into a JSON script tag the way /studio/ does;
// client code imports the TYPES from here and never the values. spec keeps
// that honest.

import { siteConfig } from "../../site-config";
import { studioWeeks } from "../../lib/studio";

// --------------------------------------------------------------------- types

/** A frame hanging on a wall, or the screen sitting on the desk. */
export interface BacklotPiece {
  /** Stable id; also the hotspot's id and the gallery anchor. */
  id: string;
  /** Which surface it is mounted on. The builder owns the metres. */
  wall: "front" | "left" | "right" | "desk";
  /** Position along that wall, 0-based, left to right as the room is entered. */
  slot: number;
  /** What the piece is, which decides how it loads. */
  kind: "still" | "clip" | "graph";
  /** File under public/studio/. Bare name: the page prefixes it with withBase("/studio/"). */
  file: string;
  /** Poster for a clip — the still that hangs there until the clip is asked for. */
  poster?: string;
  /** Real pixel dimensions of the poster/still, so a frame can be built before the texture lands. */
  aspect: [number, number];
  /** One line, in the convener's register, read off the Studio manifests. */
  caption: string;
  /** The Studio anchor this piece is the same file as, e.g. "week-05:t1". */
  studioAnchor?: string;
}

/** Something in a room that answers a button as well as a walk. */
export interface BacklotInteractive {
  id: string;
  /** The piece it acts on, when it acts on one. */
  pieceId?: string;
  /** The corridor stage it acts on, when it acts on one. */
  stageId?: string;
  kind: "play-clip" | "read-graph" | "look-at" | "leave-room" | "open-page";
  /** Button text, and what the live region says when the figure reaches it. */
  label: string;
  /** For "open-page": site-root-relative, base-resolved by the page. */
  href?: string;
}

export interface BacklotRoom {
  id: string;
  title: string;
  /** The real page this room stands in for; the room always keeps a way to it. */
  href: string;
  /** The room's own sentence: what a reader gets from it with no 3D at all. */
  intro: string;
  pieces: BacklotPiece[];
  /** Doors down a corridor, where the room has them. The machine room has none. */
  stages?: BacklotStage[];
  interactives: BacklotInteractive[];
}

/**
 * One teaching week, as one door down the Lectures corridor.
 *
 * Everything a reader reads off a stage comes from the lecture itself. The week
 * number and the title are the lecture's own frontmatter and the href is the
 * route the site already builds for it, so a week renamed in
 * `src/content/lectures/` is renamed on its door in the same commit, and there
 * is no second place to forget.
 */
export interface BacklotStage {
  /** The lecture's own id, e.g. "week-05". Hotspot id and gallery anchor. */
  id: string;
  /** From the lecture's frontmatter. */
  week: number;
  /** From the lecture's frontmatter, never retyped here. */
  title: string;
  /** "/lectures/week-05/" -- site-root-relative; the page base-resolves it. */
  href: string;
  /**
   * Odd weeks left, even weeks right, looking down the corridor -- for weeks 1
   * to 11, which is six on the left and five on the right. **Week 12 is "end"**:
   * the last week of the course faces you down the corridor, on the end wall,
   * and is the last thing seen. The parity rule governs the sides; it does not
   * govern the finish.
   */
  side: "left" | "right" | "end";
  /** 0-based along the corridor. Deeper is later in the course. */
  depth: number;
  window: DoorWindow;
}

/**
 * What is behind a door's vertical window.
 *
 * Three of the six have a recorded image the course actually made, so they get
 * one. The other three do not, and the rule that matters here is that they get
 * a lit nameplate rather than a picture: an invented still standing in for
 * /people/ or /policies/ would be the site inventing an artefact to make the
 * fiction look furnished, which is the one thing CLAUDE.md §3 rules out. A
 * nameplate carries the nav's own word and nothing else.
 */
export type DoorWindow =
  /**
   * A real file under public/studio/, with its real pixel size, and the clip it
   * is a frame of where one exists.
   *
   * The still is what hangs in the window. The clip decodes only once the camera
   * has come in far enough for the window to be worth watching — the same rule
   * the machine room's front wall follows, where only the screen the figure is
   * facing holds a decoder. A door seen from the middle of the ring is 29 px
   * across and a video there would be a decoder running for nobody.
   */
  | { kind: "still"; file: string; aspect: [number, number]; clip?: string }
  /** A ComfyUI workflow graph, drawn to a texture at window size. */
  | { kind: "graph"; file: string }
  /** No image exists, so the door is lit and says its own name. */
  | { kind: "nameplate" }
  /**
   * A week that has not been shot yet.
   *
   * Not the same thing as a nameplate, and the difference is the whole point: a
   * nameplate door has nothing behind it to show, but a teaching week that
   * recorded nothing **has a slot for the thing it has not made**. So the window
   * is there, in the same frame and the same pool of light as a week that did
   * shoot, and it is a dark 9:16 panel carrying the week's number. A reader who
   * walks up to it reads "this week has not been shot", which is true, rather
   * than "this door is broken", which is not.
   *
   * The shape is the course's own 9:16 output size, so the empty frame is the
   * same frame the shot weeks hang -- an empty slot in a row of full ones reads
   * as empty; a differently shaped one reads as a mistake.
   */
  | { kind: "unshot"; week: number; aspect: [number, number] };

export interface BacklotDoor {
  /** Stable id, from the href, e.g. "lectures". Hotspot id and gallery anchor. */
  id: string;
  /** Exactly siteConfig.links[n].text. Never rewritten here. */
  label: string;
  /** Exactly siteConfig.links[n].href. Site-root-relative; the page base-resolves it. */
  href: string;
  /** Ring position, 0-based, in nav order. The engine turns this into an angle. */
  order: number;
  /** "page" walks out of the backlot; "room" opens into one that is built here. */
  kind: "page" | "room";
  roomId?: string;
  /** One line under the door in the static gallery. */
  blurb: string;
  /** What is in the door's window. */
  window: DoorWindow;
}

export interface BacklotManifest {
  doors: BacklotDoor[];
  rooms: BacklotRoom[];
}

// --------------------------------------------------------------------- doors

/**
 * Which nav links open a built room instead of leaving the site's 3D floor,
 * and the line that sits under each door in the static gallery.
 *
 * Keyed by href so a label rewrite in site-config.ts carries straight through:
 * the door's name comes from the nav either way, and only the blurb lives here.
 * Every nav link needs an entry — the assertion below is the whole point of the
 * table, since a ring that silently drops a nav link is the failure this is
 * built to make impossible.
 */
const doorKinds: Record<string, { kind: "page" | "room"; roomId?: string; blurb: string; window: DoorWindow }> = {
  "/lectures/": {
    kind: "room",
    roomId: "corridor",
    blurb:
      "Twelve teaching weeks, four phases, one technique added to the rig each week. This one opens into " +
      "the corridor they run down; every door off it is that week's page.",
    // Week 5's third rung: the four-sentence prompt, which is the clearest single
    // frame the teaching ladder produced.
    window: { kind: "still", file: "week05-t3.avif", aspect: [576, 1024], clip: "week05-t3.mp4" },
  },
  "/sessions/": {
    kind: "page",
    blurb: "The Wednesday screening: what to bring, and what gets said about it.",
    // The reference episode, which is the thing Dailies screens. Its clip is
    // 4.9 MB against the front wall's 250-690 kB, because it is a whole episode
    // rather than one rung of a ladder. It streams, and it only starts once a
    // reader has walked up to this door — but it is the heaviest thing the
    // backlot can ask for and the receipt says so rather than the size hiding
    // behind "it only loads on demand".
    window: { kind: "still", file: "reference-episode.avif", aspect: [1080, 1920], clip: "reference-episode.mp4" },
  },
  "/studio/": {
    kind: "room",
    roomId: "machine-room",
    blurb: "The machine the recordings came off. Push this one and you are inside it.",
    // The same graph that is on the monitor inside, drawn small enough to read as
    // a workflow from across the floor and not pretending to be readable there.
    window: { kind: "graph", file: "week07-t1.graph.json" },
  },
  "/assessments/": {
    kind: "page",
    blurb: "Ten pieces, weights summing to 100, each asking for something an earlier week produced.",
    window: { kind: "nameplate" },
  },
  "/people/": {
    kind: "page",
    blurb: "Who teaches the course, and when they are in the room.",
    window: { kind: "nameplate" },
  },
  "/policies/": {
    kind: "page",
    blurb: "Late work, equipment and compute, academic integrity, and where to get help.",
    window: { kind: "nameplate" },
  },
};

function doorIdFromHref(href: string): string {
  const id = href.replace(/^\/|\/$/g, "");
  if (!id) throw new Error(`backlot: nav link "${href}" has no slug to make a door id from`);
  return id;
}

// The theme types `links` as optional — a site is allowed to have no nav at
// all. This one is not: the ring is the nav, so a nav that isn't there is a
// backlot with nothing in it, and that should stop the build rather than
// render an empty floor.
const navLinks = siteConfig.links;
if (!navLinks?.length) {
  throw new Error("backlot: siteConfig.links is empty, so there are no doors to stand up");
}

export const backlotDoors: BacklotDoor[] = navLinks.map((link, order) => {
  const entry = doorKinds[link.href];
  if (!entry) {
    throw new Error(
      `backlot: nav link "${link.text}" (${link.href}) has no door. Add it to doorKinds in ` +
        `src/backlot/rooms/manifest.ts — the ring is the nav, so a nav link without a door is a ring that lies.`,
    );
  }
  return {
    id: doorIdFromHref(link.href),
    label: link.text,
    href: link.href,
    order,
    kind: entry.kind,
    ...(entry.roomId ? { roomId: entry.roomId } : {}),
    blurb: entry.blurb,
    window: entry.window,
  };
});

// --------------------------------------------------------------------- walls

/** Look a tier up by week and rung, and fail loudly if the Studio moved it. */
function tier(weekNumber: number, tierId: string) {
  const week = studioWeeks.find((candidate) => candidate.week === weekNumber);
  if (!week) throw new Error(`backlot: no studio manifest for week ${weekNumber}`);
  const found = week.tiers.find((candidate) => candidate.tier === tierId);
  if (!found) throw new Error(`backlot: week ${weekNumber} has no tier ${tierId}`);
  return { week, tier: found };
}

const anchorFor = (weekNumber: number, tierId: string) =>
  `week-${String(weekNumber).padStart(2, "0")}:${tierId}`;

/**
 * A tier's poster frame. The schema makes it optional because a tier whose
 * output is already a still doesn't need one — so a wall that hangs the poster
 * has to say what it means for there not to be one, rather than hanging
 * `undefined` and finding out in the browser.
 */
function posterOf(rung: { id: string; output: { poster?: string } }): string {
  if (!rung.output.poster) {
    throw new Error(`backlot: ${rung.id} has no poster frame to hang`);
  }
  return rung.output.poster;
}

/**
 * The front wall: week 5's prompt ladder, five rungs, as five 9:16 screens.
 *
 * Five is the rung count, not a number picked for the wall — the room hangs the
 * ladder the course actually recorded, in order, including t5, which is the
 * counter-example. A ladder with its counter-example taken down is a different
 * teaching point.
 */
const frontWall: BacklotPiece[] = ["t1", "t2", "t3", "t4", "t5"].map((tierId, slot) => {
  const { tier: rung } = tier(5, tierId);
  return {
    id: `front-${tierId}`,
    wall: "front" as const,
    slot,
    kind: "clip" as const,
    file: rung.output.file,
    poster: rung.output.poster,
    aspect: [576, 1024] as [number, number],
    caption: `${rung.label} — ${rung.note}`,
    studioAnchor: anchorFor(5, tierId),
  };
});

/**
 * The left wall: the five reference stills week 8 fed the continuity run, in
 * the order the rungs add them. They are inputs, not outputs, so their sizes
 * are all over the place (768×1344 and 1024×1536); the frame fits the still
 * rather than the still filling a frame.
 */
const heroReferences: { file: string; aspect: [number, number]; caption: string }[] = [
  {
    file: "hero-key-standin.avif",
    aspect: [768, 1344],
    caption: "The face reference: the one still every continuity run starts from.",
  },
  {
    file: "hero_full_wet.avif",
    aspect: [1024, 1536],
    caption: "Full body, wet — added at rung 2, and the coat stops changing between takes.",
  },
  {
    file: "hero_half_dry.avif",
    aspect: [1024, 1536],
    caption: "Half dry: the state between the two the model otherwise invents.",
  },
  {
    file: "hero_full_dry.avif",
    aspect: [1024, 1536],
    caption: "Full dry — rung 3 hands the model both ends of the state it has to hold.",
  },
  {
    file: "week08-ref-scene.avif",
    aspect: [768, 1344],
    caption: "The scene reference added last: the street the figure has to stay standing in.",
  },
];

const leftWall: BacklotPiece[] = heroReferences.map((reference, slot) => ({
  id: `left-${reference.file.replace(/\.avif$/, "")}`,
  wall: "left" as const,
  slot,
  kind: "still" as const,
  file: reference.file,
  aspect: reference.aspect,
  caption: reference.caption,
}));

/**
 * The right wall: week 2's five seeds against one prompt, as stills. Posters
 * rather than clips on purpose — the teaching point here is how much the seed
 * alone decides, which is a thing you read across five frames side by side, and
 * five clips playing at once is five clips nobody watches.
 */
const rightWall: BacklotPiece[] = ["t1", "t2", "t3", "t4", "t5"].map((tierId, slot) => {
  const { tier: rung } = tier(2, tierId);
  return {
    id: `right-${tierId}`,
    wall: "right" as const,
    slot,
    kind: "still" as const,
    file: posterOf(rung),
    aspect: [576, 1024] as [number, number],
    caption: `${rung.label} — one prompt, five seeds.`,
    studioAnchor: anchorFor(2, tierId),
  };
});

/** The desk: the week 7 workflow graph, on the monitor, readable up close. */
const deskScreen: BacklotPiece = (() => {
  const { tier: rung } = tier(7, "t1");
  // The input schema is a discriminated union and the field names differ by
  // kind, so this narrows on the kind rather than going looking for a field.
  // It used to read `input.value` and fall back to the filename it expected,
  // which would have hung the right file for the wrong reason on every build
  // and stayed quiet the day week 7's rung stopped being a graph at all.
  if (rung.input.kind !== "graph") {
    throw new Error(`backlot: week 7 t1 is a ${rung.input.kind}, and the monitor shows a graph`);
  }
  const file = rung.input.file;
  return {
    id: "desk-graph",
    wall: "desk",
    slot: 0,
    kind: "graph",
    file,
    aspect: [16, 10],
    caption: `${rung.label} — the graph, saved, not just the frame it produced.`,
    studioAnchor: anchorFor(7, "t1"),
  };
})();

// --------------------------------------------------------------------- rooms

const machineRoom: BacklotRoom = {
  id: "machine-room",
  title: "The machine room",
  href: "/studio/",
  intro:
    "One room, one machine, and the files that came off it. The prompt ladder from week 5 runs " +
    "along the front wall, the continuity references from week 8 down one side and week 2's five " +
    "seeds down the other, and the monitor on the desk is showing the week 7 workflow graph. " +
    "Nothing here is generated in the browser: every frame is the file the rig recorded.",
  pieces: [...frontWall, ...leftWall, ...rightWall, deskScreen],
  interactives: [
    ...frontWall.map((piece) => ({
      id: `play-${piece.id}`,
      pieceId: piece.id,
      kind: "play-clip" as const,
      label: `Play ${piece.caption.split(" — ")[0]}`,
    })),
    {
      id: "read-graph",
      pieceId: deskScreen.id,
      kind: "read-graph",
      label: "Read the workflow graph on the monitor",
    },
    // The tower is the only thing in this room a reader cannot walk up to. The
    // front wall and the monitor both pull the camera in when the figure
    // approaches or when Tab lands on them; the tower had neither, so a reader
    // on the keyboard could not look at the machine the room is named for. It
    // is listed here rather than registered by the room because the order of
    // this array is the Tab order, and a control the room adds for itself lands
    // after the way out.
    //
    // "Look at the machine", not "the GPU" or "the vents": one room, one
    // machine, and nothing in here names a part.
    {
      id: "look-machine",
      kind: "look-at",
      label: "Look at the machine",
    },
    {
      id: "open-studio",
      kind: "open-page",
      label: "Open the Studio",
      href: "/studio/",
    },
    {
      id: "leave-machine-room",
      kind: "leave-room",
      label: "Back to the backlot",
    },
  ],
};

// ----------------------------------------------------------------- corridor

// The lectures, read the way the site reads them. Raw rather than as modules:
// an eager glob of the .mdx themselves pulls every lecture's imported widget
// components into this module's graph, and this module is imported by the page
// at build time. `?raw` takes the twelve files as text and nothing else.
const LECTURE_PREFIX = "../../content/lectures/";
const lectureSources = import.meta.glob<string>("../../content/lectures/*.mdx", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** `title` and `week` out of a lecture's frontmatter, or a build error.
 *
 *  Deliberately narrow: it reads the two scalars this file needs out of the
 *  block between the first pair of `---` lines, and throws if either is
 *  missing. A lecture with no title is a door with no name, and finding that
 *  out in the browser is worse than not building. */
function lectureFront(path: string, text: string): { week: number; title: string; draft: boolean } {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!block) throw new Error(`backlot: ${path} has no frontmatter block`);
  const body = block[1]!;
  const weekMatch = /^week:\s*(\d+)\s*$/m.exec(body);
  const titleMatch = /^title:\s*(.+?)\s*$/m.exec(body);
  if (!weekMatch) throw new Error(`backlot: ${path} has no \`week:\` in its frontmatter`);
  if (!titleMatch) throw new Error(`backlot: ${path} has no \`title:\` in its frontmatter`);
  return {
    week: Number(weekMatch[1]),
    // Quoted where the title contains a comma; unquoted otherwise. Both forms
    // are in the collection today.
    title: titleMatch[1]!.replace(/^["'](.*)["']$/, "$1"),
    draft: /^draft:\s*true\s*$/m.test(body),
  };
}

/**
 * A stage's window.
 *
 * Weeks 2 to 9 recorded something and hang it. **Weeks 1, 10, 11 and 12 did
 * not**, and they get a lit nameplate carrying their own number and title --
 * the same answer the ring already gives People, Policies and Assessment. The
 * alternative is inventing a frame for a week that produced none, or hanging
 * the reference episode's cuts on a week that did not make them; both are the
 * site inventing an artefact to make the fiction look furnished, which
 * CLAUDE.md section 3 rules out. This includes the far end of the corridor:
 * week 12's stage is lit and says its name.
 *
 * The still, the clip and the pixel size are all the week manifest's own. A
 * tier whose output is already an image is hung directly; one whose output is a
 * clip hangs its poster and keeps the clip behind it.
 */
function stageWindow(weekNumber: number): DoorWindow {
  const week = studioWeeks.find((candidate) => candidate.week === weekNumber);
  const rung = week?.tiers[0];
  // 576x1024 is the size weeks 2, 5, 6, 7, 8 and 9 actually shot at, so an
  // unshot week's empty panel is the same frame as a shot week's full one.
  if (!week || !rung) return { kind: "unshot", week: weekNumber, aspect: [576, 1024] };
  const size = /^(\d+)x(\d+)$/.exec(week.resolution ?? "");
  if (!size) throw new Error(`backlot: week ${weekNumber} has no usable resolution to size its window`);
  const aspect: [number, number] = [Number(size[1]), Number(size[2])];
  const moving = /\.(mp4|webm)$/i.test(rung.output.file);
  if (!moving) return { kind: "still", file: rung.output.file, aspect };
  if (!rung.output.poster) {
    throw new Error(`backlot: week ${weekNumber}'s first rung is a clip with no poster to hang`);
  }
  return { kind: "still", file: rung.output.poster, aspect, clip: rung.output.file };
}

/**
 * Which wall a week hangs on.
 *
 * Odd left, even right for weeks 1 to 11 -- six and five -- so the sides
 * alternate as a reader walks in and no week is opposite its own neighbour.
 * **Week 12 is the end wall.** It is the last week of the course and it is the
 * last thing seen: the corridor finishes on it rather than running past it, and
 * a reader who walks to the end has arrived somewhere rather than run out of
 * doors. That is a decision about the finish, not an exception to the parity.
 */
const sideFor = (week: number): "left" | "right" | "end" =>
  week === 12 ? "end" : week % 2 === 1 ? "left" : "right";

/** The twelve, in teaching order, off the collection rather than a list here. */
export const corridorStages: BacklotStage[] = Object.entries(lectureSources)
  .map(([path, text]) => {
    const id = path.slice(LECTURE_PREFIX.length).replace(/\.mdx$/, "");
    return { id, ...lectureFront(path, text) };
  })
  .filter((lecture) => !lecture.draft)
  .sort((a, b) => a.week - b.week)
  .map((lecture, depth) => ({
    id: lecture.id,
    week: lecture.week,
    title: lecture.title,
    href: `/lectures/${lecture.id}/`,
    side: sideFor(lecture.week),
    depth,
    window: stageWindow(lecture.week),
  }));

// Twelve teaching weeks is a hard line of the brief, and the corridor is built
// from whatever the collection holds -- so the two are checked against each
// other here rather than assumed to agree. Same shape as `doorKinds` above: a
// week added, removed or left in draft is a build error, not a corridor that
// quietly disagrees with the course.
if (corridorStages.length !== 12) {
  throw new Error(
    `backlot: the corridor is twelve stages and the lectures collection published ` +
      `${corridorStages.length}. Fix the collection, not this number.`,
  );
}
corridorStages.forEach((stage, index) => {
  if (stage.week !== index + 1) {
    throw new Error(`backlot: expected week ${index + 1} at depth ${index} of the corridor, found ${stage.week}`);
  }
});

const corridor: BacklotRoom = {
  id: "corridor",
  title: "The lectures corridor",
  href: "/lectures/",
  intro:
    "Twelve teaching weeks, twelve doors. Odd weeks on the left, even weeks on the right, and the further " +
    "in you walk the later in the course you are, until week 12 faces you on the end wall. A door with " +
    "something recorded behind it shows it; a week that has not been shot yet keeps the same frame with " +
    "nothing in it, which is the truth about that week. Push one and you are on that week's page.",
  pieces: [],
  stages: corridorStages,
  interactives: [
    ...corridorStages.map((stage) => ({
      id: `stage-${stage.id}`,
      stageId: stage.id,
      kind: "open-page" as const,
      // The same sentence the week's own page titles itself with.
      label: `Week ${stage.week}: ${stage.title}`,
      href: stage.href,
    })),
    {
      id: "leave-corridor",
      kind: "leave-room" as const,
      label: "Back to the backlot",
    },
  ],
};

export const backlotManifest: BacklotManifest = {
  doors: backlotDoors,
  rooms: [machineRoom, corridor],
};
