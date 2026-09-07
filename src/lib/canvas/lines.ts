// The two lines a card and the desk state about a take, and nothing else.
//
// Its own module because src/lib/canvas/doc.ts imports the course record,
// which imports zod: the island needs these two string joins at runtime and
// has no use for a schema validator that only ever runs at build time.

/** One line of the production log — the same fields the downloadable log
 *  carries, in the order the log states them. This is what "Copy production
 *  line" puts on the clipboard. */
export function productionLine(fields: {
  takeId: string;
  model: string;
  mode: string;
  resolution: string;
  tier: string;
  label: string;
  file: string;
}): string {
  return [
    fields.takeId,
    fields.model,
    fields.mode,
    fields.resolution,
    `${fields.tier} — ${fields.label}`,
    fields.file.split("/").pop() ?? fields.file,
    "recorded",
  ].join(" · ");
}

/** The desk's plan line: what the rig did, in one sentence. */
export function planLine(takeId: string, model: string, mode: string, resolution: string): string {
  return `Replayed ${takeId} · ${model} · ${mode} · ${resolution}`;
}
