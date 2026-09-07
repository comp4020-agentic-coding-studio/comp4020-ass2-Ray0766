// The one place the canvas document is actually built for the site. Pages
// import `canvasBundle` and serialise it; nothing else calls
// buildCanvasBundle in production, so there is exactly one canvas and it is
// the same one the spec builds from the same manifests.

import { cutLibrary, referenceEpisode, studioInputText, studioWeeks } from "../studio";
import { toClientWeek } from "../studio-client";
import { buildCanvasBundle, type ReferenceSegmentSource } from "./doc";

/** reference.json's segments name the clip each one came from but not the
 *  prompt behind it; the four prompts sit beside the manifest as
 *  inputs/seg<A–D>/prompt.md, one per segment, which is how the delivered
 *  bundle filed them. */
export function referenceSegmentSources(): ReferenceSegmentSource[] {
  const segments = (referenceEpisode as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return [];

  return segments.flatMap((raw) => {
    const segment = raw as { seg?: unknown; shots?: unknown; seed?: unknown; timecode?: unknown };
    if (typeof segment.seg !== "string") return [];
    const promptFile = `inputs/seg${segment.seg}/prompt.md`;
    return [
      {
        seg: segment.seg,
        shots: typeof segment.shots === "string" ? segment.shots : "",
        seed: typeof segment.seed === "number" ? segment.seed : 0,
        timecode: typeof segment.timecode === "string" ? segment.timecode : "",
        promptFile,
        promptText: studioInputText(promptFile),
      },
    ];
  });
}

export const canvasBundle = buildCanvasBundle({
  weeks: studioWeeks.map(toClientWeek),
  cut: cutLibrary,
  reference: referenceEpisode,
  referenceSegments: referenceSegmentSources(),
});
