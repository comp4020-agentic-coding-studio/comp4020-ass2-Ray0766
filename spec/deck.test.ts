// Protects decision 3 in CLAUDE.md (a deck is content and checked like a
// page) by tying the Week 1 deck's phase slide to src/lib/phases.ts rather
// than letting the two drift — the deck states the phase map to a student
// before the site's own phase cards do.
//
// Seen red by temporarily editing src/decks/week-01.deck.mdx's ramp slide,
// changing "Live Action" to "Live-Action", running this suite, then
// reverting. Failure text:
//   "src/decks/week-01.deck.mdx's phase slide doesn't list "Weeks 7–9:
//   **Live Action**""
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PHASES } from "../src/lib/phases";

const deckPath = "src/decks/week-01.deck.mdx";
const deckSource = readFileSync(resolve(deckPath), "utf8");
const rampMatch = /## The ramp\n([\s\S]*?)\n---/.exec(deckSource);
if (!rampMatch) throw new Error(`${deckPath} has no "## The ramp" slide to check`);
const rampSlide = rampMatch[1];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("deck: the Week 1 phase slide matches the site's phase map", () => {
  for (const phase of PHASES) {
    it(`lists "${phase.weeks}: **${phase.title}**"`, () => {
      const line = new RegExp(`^- ${escapeRegExp(phase.weeks)}: \\*\\*${escapeRegExp(phase.title)}\\*\\*`, "m");
      expect(
        rampSlide,
        `${deckPath}'s phase slide doesn't list "${phase.weeks}: **${phase.title}**"`,
      ).toMatch(line);
    });
  }

  it("lists the four phases in the same order as the phase map", () => {
    const positions = PHASES.map((phase) => rampSlide.indexOf(`**${phase.title}**`));
    for (let i = 1; i < positions.length; i += 1) {
      expect(
        positions[i],
        `${PHASES[i].title} should appear after ${PHASES[i - 1].title} on the ramp slide`,
      ).toBeGreaterThan(positions[i - 1]);
    }
  });
});
