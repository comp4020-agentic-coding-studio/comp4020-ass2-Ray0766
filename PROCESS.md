# Process overview

## What I built

SLOP8760, Slop Opera: a twelve-week studio course in serialized AI video drama — twelve lectures with decks, twelve Dailies, ten pieces summing to 100, a Studio canvas replaying recorded ladders. The machine shoots; only technique gets credit.

## How I got here

**What a good course looks like.** Assignment 1's feedback was the account, not the site, so the harness came first ([518f35d](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/518f35d229a451a7bf275859561ca721ccdd0c03)): every line points at a failure. Six decisions preceded any check: one idea carried through, constructive alignment (Biggs), a list of instruments (after *How to Make (Almost) Anything*), a ramp not a tour, Dailies as the formative loop (Sadler), plain register (CS 007) ([5fc4e14](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/5fc4e14734b4aa7da433196109bb1bddd32e4838)). Two beat the obvious: an instrument ladder over a topic syllabus; anime before photoreal, since stylisation absorbs a generator's errors.

**Which I encoded.** Five of six are guarded by checks, each seen red first, two red on real content: five Dailies with nothing to bring, three pages pointing forward ([eaf6928](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/eaf6928ca68cdc4ee011372e12896e1b886455a8), [f229522](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/f22952287ff613cd6d53ea742af66003aa7f5a44), [d8d7c67](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/d8d7c67c6db2bba4b28f5e5592469e1b3c605ff0)).

The pass that taught me most landed green, the agent reporting done ([e21b122](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e21b1224609ae9766997161bb04981931f04d09b)). Read in a browser at both viewports and themes, it had five faults no check saw — a hero title unreadable on a phone, a deck still on an abandoned draft of the ramp. The agent's "done" and my checks measured the same thing; neither was the page. I committed it broken, then directed the repair sentinel-first:

> Write spec/builder-text.test.ts first … red for the right reason, naming exactly the pages above.

It named five pages before a word changed ([06aba39](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/06aba39c3e910a66a40942031b681ed16b932348)); each fix carried its rule into CLAUDE.md ([7125d5d](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/7125d5d035baa3e6684e5993f9c5b0d86ef73631)).

![The home hero at 390px: before and after](docs/hero-390-before-after.png)

**What I threw away.** The first curriculum went with the instrument ladder; the checks it falsified were rewritten, never weakened ([e1284cb](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/e1284cb8822fe68eb81405a0ed19e349cecbd13e), [682ff2f](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/682ff2f260a85c3f2d25280269f0928d4f93c30b)). Then the rig itself. The ten boards were the opening view; they are a template the canvas grows towards now, and every board arrives because someone asked for it ([2d8ca55](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/2d8ca55a0ac27385514485bdca418648a681bc4e), [47c93d7](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/47c93d79f304c5342b669666c4209a75c882b6bb)). What went was my arrangement: Week 2's "same file" edge is no longer a line I placed, it is one a visitor produces by replaying two weeks minutes apart.

**How I knew it was right.** Before the deck rewrite, a second model compiled a fetched-and-confirmed whitelist; the building agent could state nothing outside it ([c91079a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/c91079a0453974da0547b65700eacb6533759e3a)): "Anything not on this list is not stated as fact." Every factual slide footers its source ([442f660](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/442f66057e75f8e43b5d4897e61bf25028ae546a)); its "Do not state" list records what I chose not to claim. The sentinel is arithmetic: two sources a slide, sixty words ([b8f4de6](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/b8f4de63d98d1b3069657094e067b780fb08422e)).

**The harness grew again.** The phase colours measure 2.7–3.5:1 in Chrome: fills, not ink ([9978808](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/99788086ce068eeebfcbc9734029c55ae4b51511)); the build's axe runs in JSDOM and never sees colour ([d16d5a5](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/d16d5a547413e5c42325c0f525eab3b83bf1ccc6)). Then the resize. Checks green, single-size browser walks green; dragging 1920 past 640 left a nav and a status bar. The canvas went by media query, the phone desk never mounted, having decided at load it wasn't needed, and the list stayed hidden ([447e825](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/447e825357e55355fc6b59a7ea64c75d5383e565)). CLAUDE.md §7 says a phone is not a smaller desktop: the rule was there, the check wasn't.

**What I left out.** Voice stays read, not checked beyond banned phrases: a check scoring register is one I would write to pass. Live generation stays off a static site ([5c7365a](https://github.com/comp4020-agentic-coding-studio/comp4020-ass2-Ray0766/commit/5c7365a9f9def8995fa86be717e7bd6ebca016c9)); the canvas is a system's front half, its back half left out on purpose:

> Nothing is generated in the browser, and every result says so.

Disclosure: this round's decks and canvas were built on my own subscription, with a second model compiling the source list; what to encode and what to throw away is my judgement.
