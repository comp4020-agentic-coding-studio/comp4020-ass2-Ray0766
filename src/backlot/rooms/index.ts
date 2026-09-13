// Every room the backlot can open, keyed by the id its manifest entry carries.
//
// Two entries, and the second one is the test of the claim this comment used to
// make on its own. `buildRoomShell` stands any manifest entry up — floor, walls,
// ceiling, a frame per piece, a hotspot per interactive — and `buildMachineRoom`
// and `buildCorridor` are two fit-outs over it rather than two copies of the
// room-building. That held, and the whole of what it cost was one option: a room
// hands in its own metres, because `ROOM` in shell.ts was the machine room's
// plan and a corridor is fifteen metres of floor.
//
// What did **not** hold is a level up, and it is written down in
// `engine/types.ts#RoomDoor` rather than here: a door's *behaviour* — the walk,
// the leaf, the page asked for at the moment of the press, Escape calling the
// whole thing off — lived in the engine keyed on the hub, so a room could build
// a door and not have one. The corridor is what found that.
import type { RoomRegistry } from "../engine/types";
import { buildCorridor } from "./corridor";
import { buildMachineRoom } from "./machine-room";

export { buildRoomShell } from "./shell";

export const roomBuilders: RoomRegistry = {
  "machine-room": buildMachineRoom,
  corridor: buildCorridor,
};
