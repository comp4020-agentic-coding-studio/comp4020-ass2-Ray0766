# Process overview

## What I built

SLOP8760, Slop Opera: twelve weeks of vertical AI drama, with lectures, decks, Dailies, ten assessed pieces and a Studio that replays recorded production ladders. The machine shoots; only technique gets credit.

## How I got here

Assignment 1's feedback was the account, not the site, so the harness came first ([518f35d](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/518f35d229a451a7bf275859561ca721ccdd0c03)). Six decisions went into CLAUDE.md before any check: constructive alignment, weekly feedback, a plain register among them ([5fc4e14](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/5fc4e14734b4aa7da433196109bb1bddd32e4838)). I then rebuilt the curriculum as an instrument ladder: each week changes what a student can control ([e1284cb](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e1284cb8822fe68eb81405a0ed19e349cecbd13e)). A catalogue of models would age with its names; a ladder lets the room assess what a particular addition bought.

An early pass landed green, the agent reporting done ([e21b122](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e21b1224609ae9766997161bb04981931f04d09b)). In a browser it had five faults no check saw. I committed it broken and directed the repair sentinel-first:

> Write spec/builder-text.test.ts first … red for the right reason, naming exactly the pages above.

It named five pages before a word changed ([06aba39](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/06aba39c3e910a66a40942031b681ed16b932348)); each fix carried its rule into CLAUDE.md ([7125d5d](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/7125d5d035baa3e6684e5993f9c5b0d86ef73631)).

![The home hero at 390px: before and after](docs/hero-390-before-after.png)

The ladder exposed a teaching failure of its own. Dailies named submissions without saying how feedback would work. I rewrote them to say what screens, on what scale and what follows, and added a check comparing the recorded rungs with the session labels ([06776fc](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/06776fc90f98acc28cd6c2469e6ce245b49ff2f2), [6c763cf](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/6c763cfd97f7de0ba07b044d83e2c1da2e85213a)). Matching labels still cannot establish that the exercise teaches the intended skill.

The interface had the same gap. Phase ink tokens already passed contrast arithmetic, but the weight bar never used them: its labels rendered black against three phase fills at 2.40–3.62:1. I connected each segment to its ink and added browser checks sampling the rendered background, computed colour and label opacity in both themes; the commit records forty failures before the repair ([14457c8](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/14457c87b6e13c6a4ac0bd23333119b6d001e502)). Correct tokens had proved nothing about the pixels a reader encountered.

Resizing the Studio failed differently. A desktop Week 8 prompt became the phone form's untouched Week 2 prompt, and focus fell to the body: the guard tracked the canvas stage, and the desk was its sibling. The swap now carries week, tier and prompt across, and the focus boundary is the whole composition. Testing exposed a harness fault too: headless Chrome fires no focus events, so the page's own bookkeeping had never run under the check I was trusting ([76c8180](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/76c8180d39cad5b94d5eb2f726ffbbc105cc3632)). CLAUDE.md now requires watching a branch execute before treating it as protection.

Citations needed the same restraint: replacing an unsupported render-time estimate in Week 1's deck left it standing in the lecture until a later correction ([c91079a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/c91079a0453974da0547b65700eacb6533759e3a), [e05618a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e05618aaec49aec02e3fce877993817e3887ee14)). Two sources a slide and sixty words bound density, not accuracy ([b8f4de6](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/b8f4de63d98d1b3069657094e067b780fb08422e)): only reading a claim beside its source does that.

I also gave up presenting the whole rig at once. Ten boards made the opening view look complete but offered little beyond Fit all. The session model treats that arrangement as a template: boards and edges appear as recorded runs are requested ([47c93d7](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/47c93d79f304c5342b669666c4209a75c882b6bb)). The visitor produces the link between two runs instead of receiving my diagram.

Week 7 also lost a sentence I liked: its assessment epigraph already made the same point, and what replaced it describes where a screening stalls ([a7476f9](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/a7476f99ec3287c3e37085a115fbf945025c4bfe)).

Live generation stays outside a static site: recorded runs let students compare inputs and outputs without an account or a bill. The browser checks cover particular viewports and actions; what a source means, and whether a week teaches what it claims, I read myself.

AI assistance: Claude Code implemented the site; other models compiled sources; Codex audited the result and helped draft this account.
