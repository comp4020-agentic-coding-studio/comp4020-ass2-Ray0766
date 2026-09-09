# Process overview

## What I built

SLOP8760, Slop Opera: twelve weeks of serialized AI video drama — twelve lectures with decks, twelve Dailies, ten assessed pieces summing to 100, a Studio canvas of recorded ladders. The machine shoots; only technique gets credit.

## How I got here

**What a good course looks like.** Assignment 1's feedback was the account, not the site, so the harness came first ([518f35d](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/518f35d229a451a7bf275859561ca721ccdd0c03)): every line points at a failure. Six decisions preceded any check, among them constructive alignment (Biggs), Dailies as the formative loop (Sadler) and plain register ([5fc4e14](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/5fc4e14734b4aa7da433196109bb1bddd32e4838)). Two beat the obvious: an instrument ladder over a topic syllabus, because a topic dates with its model while a rung stays markable; anime before photoreal, since stylisation absorbs a generator's errors. Five of six are guarded, each seen red first ([eaf6928](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/eaf6928ca68cdc4ee011372e12896e1b886455a8)); the first curriculum went with the ladder and the checks it falsified were rewritten, never weakened ([e1284cb](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e1284cb8822fe68eb81405a0ed19e349cecbd13e)).

The pass that taught me most landed green, the agent reporting done ([e21b122](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e21b1224609ae9766997161bb04981931f04d09b)). In a browser it had five faults no check saw — the hero below. The agent's "done" and my checks measured the same thing; neither was the page. I committed it broken, then directed the repair sentinel-first:

> Write spec/builder-text.test.ts first … red for the right reason, naming exactly the pages above.

It named five pages before a word changed ([06aba39](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/06aba39c3e910a66a40942031b681ed16b932348)); each fix carried its rule into CLAUDE.md ([7125d5d](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/7125d5d035baa3e6684e5993f9c5b0d86ef73631)).

![The home hero at 390px: before and after](docs/hero-390-before-after.png)

**A list is not a loop.** A complete submission list had passed for a complete feedback loop. The Dailies page now names what gets screened, on what scale and what next, in the manifests' own labels ([06776fc](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/06776fc90f98acc28cd6c2469e6ce245b49ff2f2)), checked against them ([6c763cf](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/6c763cfd97f7de0ba07b044d83e2c1da2e85213a)). Scheduling feedback is not evidence a student can use it.

**What I threw away.** The rig. The ten boards were the opening view; now they are a template the canvas grows towards ([47c93d7](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/47c93d79f304c5342b669666c4209a75c882b6bb)). What went was my arrangement: Week 2's "same file" edge is no longer a line I placed but one a visitor produces, replaying two weeks minutes apart.

**How I knew it was right.** Before the deck rewrite, a second model compiled a confirmed whitelist; the building agent could state nothing outside it ([c91079a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/c91079a0453974da0547b65700eacb6533759e3a)): "Anything not on this list is not stated as fact." My own Week 1 render-time estimate became Wan2.2's published figure, read as a floor, not a promise ([e05618a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e05618aaec49aec02e3fce877993817e3887ee14)). The sentinel is arithmetic, two sources a slide and sixty words ([b8f4de6](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/b8f4de63d98d1b3069657094e067b780fb08422e)); it bounds density, not accuracy.

**What the harness could not see.** A third model read the built site; I checked every finding and rejected three. The ink each phase fill needs is computed and checked as arithmetic — and referenced by nothing, so three of four weight-bar segments carried black text at 2.40–3.62:1 on the two pages a marker opens ([14457c8](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/14457c87b6e13c6a4ac0bd23333119b6d001e502)). The browser check written to catch it went red for its own reason: headless Chrome fires no focus events, so the page's focus bookkeeping had never run under it ([76c8180](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/76c8180d39cad5b94d5eb2f726ffbbc105cc3632)). Same shape as the resize that emptied the canvas mid-drag ([447e825](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/447e825357e55355fc6b59a7ea64c75d5383e565)). §7 now says a branch nobody has watched execute is a comment — and a check is a branch.

**What I left out.** Voice stays read, not checked beyond banned phrases: a check scoring register is one I would write to pass. Live generation stays off a static site ([5c7365a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/5c7365a9f9def8995fa86be717e7bd6ebca016c9)); the canvas is the front half, its back half left out on purpose.

Disclosure: built with Claude Code on my subscription; other models compiled the source list and audited the result; the judgement was mine.
