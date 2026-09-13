// Which door opens which room. One answer, in one place, for the six files that
// drive a room.
//
// Every one of them used to find the room it was about with
// `doors.find((door) => door.kind === "room")`, and for as long as the Studio
// was the only room in the manifest that was the Studio door and everything
// worked. The day the Lectures door started opening a corridor, `find` returned
// the *first* room door in nav order — the Lectures one — and six files went on
// naming the machine room while pressing something else: 124 failures, "the
// machine room is its interactives", "the brightest thing in the machine room is
// the front wall", "mounted with its five screens", none of them about the room
// they say. The corridor had no builder yet, so what they actually drove was
// nothing at all.
//
// That is CLAUDE.md §7's rule about hand-kept scope met from the other side.
// The scope was derived, and derived wrongly: `kind === "room"` is a fact about
// a door and was being used as an identity. A room is reached through the door
// whose `roomId` is its own id, and there is no shorter true version of that.
//
// It is also why `rooms[0]` is gone from the files that follow. It was the
// machine room by luck of the manifest's own array order, and a manifest that
// lists a room before it would have turned every one of those files into a check
// about somewhere else — silently, and green wherever the two rooms happen to
// agree.

import {
  backlotManifest,
  type BacklotDoor,
  type BacklotRoom,
} from "../../src/backlot/rooms/manifest";

/** Every room the backlot builds, in the manifest's order. */
export const backlotRooms: BacklotRoom[] = backlotManifest.rooms;

/** The room a check names, found by its id rather than by its position.
 *
 *  A file that is about one particular room — the five screens on the machine
 *  room's front wall, the tower it is named after — should say which room, and
 *  fail loudly rather than quietly measure a different one if it is renamed. */
export function roomNamed(id: string): BacklotRoom {
  const room = backlotRooms.find((candidate) => candidate.id === id);
  if (!room) {
    throw new Error(
      `spec: no room in src/backlot/rooms/manifest.ts is "${id}". The manifest has ` +
        `${backlotRooms.map((candidate) => candidate.id).join(", ")}. A check that cannot find the room it ` +
        `is about must say so rather than drive whichever room is first.`,
    );
  }
  return room;
}

/** The one door that opens a room. */
export function doorInto(room: BacklotRoom): BacklotDoor {
  const opening = backlotManifest.doors.filter(
    (door) => door.kind === "room" && door.roomId === room.id,
  );
  if (opening.length !== 1) {
    throw new Error(
      `spec: ${opening.length} doors open ${room.id}, and a room is reached through exactly one. ` +
        `spec/backlot-page.test.ts holds the manifest to that; this is the driver refusing to guess.`,
    );
  }
  return opening[0]!;
}

/** Every room, paired with the door that opens it, in the manifest's order.
 *  Derived, so a third room is driven by everything that maps over this on the
 *  day it lands rather than on the day somebody remembers. */
export const roomsWithDoors: { room: BacklotRoom; door: BacklotDoor }[] = backlotRooms.map((room) => ({
  room,
  door: doorInto(room),
}));
