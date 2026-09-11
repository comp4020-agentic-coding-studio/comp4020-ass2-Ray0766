// The engine's public surface. Everything the page and the rooms are allowed
// to reach lives behind this one export.
//
// PLACEHOLDER, written with the contract so the page has something to import
// from minute one. The engine owner replaces the body; the signature is
// `src/backlot/engine/types.ts` and does not move.
import type { BacklotEngine, BacklotOptions } from "./types";

export async function createBacklot(_options: BacklotOptions): Promise<BacklotEngine> {
  throw new Error("backlot: the engine is not built yet");
}
