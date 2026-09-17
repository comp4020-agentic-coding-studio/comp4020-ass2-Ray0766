import { afterEach, expect, it, vi } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { createHotspots } from "../src/backlot/engine/hotspots";

// Only the published measurement is under test here; the approach suite still
// checks the real pixels. No layout or rendering is supplied by this DOM stub.
class ElementStub extends EventTarget {
  dataset: Record<string, string> = {};
  append() {}
  setAttribute() {}
}
afterEach(() => vi.unstubAllGlobals());

it("keeps measurements on their own side of the eleven-pixel word boundary", () => {
  vi.stubGlobal("document", { createElement: () => new ElementStub() });
  const deck = createHotspots(new ElementStub() as unknown as HTMLElement, new OrthographicCamera(), {
    frame: async () => {}, unframe: () => {},
  });
  const door = deck.api.register({
    id: "assessments", label: "Assessment", position: new Vector3(), activate() {},
  });
  // Rounding 10.96 to 11 reports a word that the renderer correctly omits.
  for (const measured of [10.96, 10.999, 11, 11.001, 11.02]) {
    deck.setCap(door.id, measured);
    const published = Number(door.button.dataset.backlotCap);
    expect(published >= 11, `${measured} was published as ${published}`).toBe(measured >= 11);
  }
});
