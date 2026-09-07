import data from "../data/reading.json";

export interface ReadingEntry {
  week: number;
  title: string;
  /** Authors for a paper, the publisher for a document that has no named author. */
  by: string;
  /** The year the source states. Living documentation states none, and gets null
   *  rather than the year someone happened to read it. */
  year: number | null;
  url: string;
  /** Verbatim, from the page it cites. Never assembled out of fragments. */
  quote: string | null;
  /** Why there is no quote, when there is no quote. Exactly one of the two is set. */
  quoteNote: string | null;
}

export const readingNote: string = data.note;

export const readingEntries: ReadingEntry[] = data.entries as ReadingEntry[];

/** The reading for one teaching week, in the order the file lists it. A week
 *  with nothing behind it is a mistake rather than an empty section, so this
 *  throws instead of rendering a heading with no list under it. */
export function readingFor(week: number): ReadingEntry[] {
  const entries = readingEntries.filter((entry) => entry.week === week);
  if (entries.length === 0) throw new Error(`reading.json has no entries for week ${week}`);
  return entries;
}
