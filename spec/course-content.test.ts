import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface ApiNode {
  id: string;
  type: string;
  meta?: Record<string, unknown>;
  body?: string;
}

interface CourseApi {
  course: {
    startDate: string;
    endDate: string;
  };
  nodes: ApiNode[];
}

const api = JSON.parse(readFileSync(resolve("dist/api/index.json"), "utf8")) as CourseApi;

describe("course content skeleton", () => {
  it("weights every assessment so the semester adds up to exactly 100", () => {
    const assessments = api.nodes.filter((node) => node.type === "assessments");
    expect(assessments.length).toBeGreaterThan(0);
    const total = assessments.reduce((sum, node) => sum + Number(node.meta?.weight ?? 0), 0);
    expect(total).toBe(100);
  });

  it("gives every teaching week a lecture and a Dailies session", () => {
    const weeksOf = (type: string) =>
      new Set(
        api.nodes.filter((node) => node.type === type).map((node) => Number(node.meta?.week)),
      );
    const lectureWeeks = weeksOf("lectures");
    const sessionWeeks = weeksOf("sessions");
    for (let week = 1; week <= 12; week += 1) {
      expect(lectureWeeks.has(week), `week ${week} has no lecture`).toBe(true);
      expect(sessionWeeks.has(week), `week ${week} has no session`).toBe(true);
    }
  });

  it("builds a deck for every lecture that declares slides", () => {
    const withSlides = api.nodes.filter(
      (node) => node.type === "lectures" && typeof node.meta?.slides === "string",
    );
    expect(withSlides.length).toBeGreaterThan(0);
    for (const node of withSlides) {
      const slidesPath = node.meta?.slides as string;
      const deckName = slidesPath.replace(/^\/decks\//, "").replace(/\/$/, "");
      const deckIndex = resolve("dist/decks", deckName, "index.html");
      expect(
        existsSync(deckIndex),
        `${node.id} declares slides "${slidesPath}" but ${deckIndex} was not built`,
      ).toBe(true);
    }
  });
});
