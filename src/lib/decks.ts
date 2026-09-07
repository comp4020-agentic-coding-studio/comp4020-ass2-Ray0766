import type { ImageMetadata } from "astro";
import { parseDeckFrontmatter } from "astromotion";
import { phaseForWeek, type Phase } from "./phases";

// The twelve decks, read once at build time so both the listing page and each
// lecture page describe the same deck the same way.
//
// Vite inlines these with import.meta.glob rather than reading src/decks off
// disk with node:fs, which is what astromotion's own listing-page example
// does. Same reason src/lib/studio.ts does it: a module that resolves its own
// paths at runtime breaks the moment the prerender step bundles it into a
// chunk that no longer sits next to the files it wants to read, and that
// failure only shows up once some page imports it. The glob is also what
// makes the thumbnails real ImageMetadata rather than strings, so the image
// pipeline can resize them.
const sources = import.meta.glob<string>("/src/decks/*.deck.mdx", {
  eager: true,
  query: "?raw",
  import: "default",
});

const thumbnails = import.meta.glob<ImageMetadata>("/src/decks/assets/*.avif", {
  eager: true,
  import: "default",
});

export interface Deck {
  /** Slug as the deck route names it, e.g. "week-01". */
  slug: string;
  /** Route the lecture's `slides:` frontmatter points at, e.g. "/decks/week-01/". */
  route: string;
  /** Teaching week the deck belongs to. */
  week: number;
  phase: Phase;
  title: string;
  description?: string;
  /** Slides in the built deck. */
  slideCount: number;
  /** The frame the deck's own title slide runs behind its title. */
  thumbnail: ImageMetadata;
  thumbnailAlt: string;
}

// Fenced blocks come out before the split: a deck's speaker notes are prose,
// and prose is allowed to contain a line of three dashes. Everything left is
// slide content, where a bare `---` is the separator astromotion splits on.
function countSlides(content: string): number {
  const withoutFences = content.replace(/^```[\s\S]*?^```$/gm, "");
  return withoutFences.split(/^---$/m).length;
}

// The thumbnail is whatever the deck's own title slide already runs behind its
// title, rather than a file named after the week. Reading it out of the deck
// means the listing cannot drift from the deck: rename the frame, and the card
// follows without anyone remembering to update it.
function titleSlideFrame(content: string, slug: string): ImageMetadata {
  const match = /!\[bg[^\]]*\]\(\.\/assets\/([^)]+)\)/.exec(content);
  if (!match) {
    throw new Error(
      `src/decks/${slug}.deck.mdx has no title-slide background for the deck listing to show`,
    );
  }
  const image = thumbnails[`/src/decks/assets/${match[1]}`];
  if (!image) {
    throw new Error(`src/decks/${slug}.deck.mdx points at a missing frame: assets/${match[1]}`);
  }
  return image;
}

function weekOf(slug: string): number {
  const match = /^week-(\d{2})$/.exec(slug);
  if (!match) throw new Error(`can't read a week number out of deck slug "${slug}"`);
  return Number(match[1]);
}

export const decks: Deck[] = Object.entries(sources)
  .map(([path, raw]) => {
    const slug = path.replace("/src/decks/", "").replace(".deck.mdx", "");
    const { data, content } = parseDeckFrontmatter(raw, slug);
    const week = weekOf(slug);
    const title = data.title ?? slug;
    return {
      slug,
      route: `/decks/${slug}/`,
      week,
      phase: phaseForWeek(week),
      title,
      description: data.description,
      slideCount: countSlides(content),
      thumbnail: titleSlideFrame(content, slug),
      thumbnailAlt: `Title slide of the ${title} deck`,
    };
  })
  .sort((a, b) => a.week - b.week);

export function deckForRoute(route: string | undefined): Deck | undefined {
  if (!route) return undefined;
  return decks.find((deck) => deck.route === route);
}
