// Every room the backlot can open, keyed by the id its manifest entry carries.
//
// One entry, because the manifest has one room. The two halves behind it are
// separate on purpose: `buildRoomShell` stands any manifest entry up — floor,
// walls, ceiling, a frame per piece, a hotspot per interactive — and
// `buildMachineRoom` is the fit-out that goes inside this particular one. A
// second room would be a second fit-out over the same shell, not a second copy
// of the room-building.
import type { RoomRegistry } from "../engine/types";
import { buildMachineRoom } from "./machine-room";

export { buildRoomShell } from "./shell";

export const roomBuilders: RoomRegistry = {
  "machine-room": buildMachineRoom,
};
