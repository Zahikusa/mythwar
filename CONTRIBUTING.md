# Contributing to Mythwar

Welcome! This page is for whoever works on Mythwar next — a new teammate, a returning one, or
an AI agent picking up a run. It collects the rules that are **not obvious from the code** and
that have each cost a bug when forgotten. The README has the commands; DESIGN.md the design;
docs/LENSES.md why each feature exists; docs/MULTIPLAYER.md the netcode.

## Where things live

| Folder | What | Rule of thumb |
|---|---|---|
| `src/sim/` | The deterministic simulation and **all balance numbers** (`data.ts`) | Pure logic, no DOM, no clocks, no `Math.random` |
| `src/ai/` | The AI generals' decisions (feeds commands to the sim like a player) | Must handle every new mechanic |
| `src/render/` | Canvas renderer, creature art, effects | Reads the world and its events; never changes them |
| `src/ui/` | HUD, menus, coach (Mímir), feats, chronicle, personas | DOM; reads the world |
| `src/audio/` | The synthesizer (every sound is generated) | |
| `src/net/` + `server/` | Multiplayer client and the authoritative Node server | Versioned protocol |
| `scripts/` | Test drivers and design tools (smoke, mpsmoke, designcheck, shoot…) | Node + Chrome/Playwright |
| `tests/` | Vitest unit tests | |

## The six rules

1. **The simulation is deterministic, bit for bit, on every engine.** Online play is lockstep:
   the server and every browser (V8, SpiderMonkey, JavaScriptCore) replay the same commands and
   must reach the same state. In `src/sim` use only `+ − × ÷`, `Math.min/max/abs/floor/round/imul`
   and the sim's own seeded RNG (`rng.ts`). No `Math.sin/cos/exp/pow/sqrt` (their last bits may
   differ between engines), no `Date`, no `Math.random`, no iteration over object keys whose
   order could differ. `npm run enginecheck` proves it across engines.
2. **Blows within one tick are simultaneous.** The two sides are updated one after the other, so
   anything that changes a creature *because of* a blow (lifesteal heals, veteran promotions,
   kills) must take effect at a fixed point after everyone has struck — see `heals` and
   `promote()` in `world.ts`. Likewise anything one side *reads* about the other mid-tick: aim
   at a target's `px` (where it stood when the tick began), and count allies slain this tick as
   still there until `cleanup()`. The mirrored-armies tests in `tests/sim.test.ts` (one kind per
   side, and every two-kind army of each age) catch violations: if one fails after your change,
   the change favours a side.
3. **Rules changes change the fingerprint.** `simFingerprint()` hashes every balance table and a
   short scripted battle; online, both devices must have the same one (the server refuses a
   mismatch). That's intended — but say so in your commit/PROGRESS note, and run
   `npm run designcheck` (difficulty ladder, pacing, variety, side fairness) for anything that
   touches balance. Events (`SimEvent`) are not hashed: adding a field to an event is free.
4. **Protocol changes bump `PROTOCOL_VERSION`** (`src/net/protocol.ts`), and every new field a
   client sends is sanitized on the server (`cleanName`, `cleanRank`, `cleanSigil`, …) — the
   server never trusts a client. Server and pages always ship from the same build. (v15 now.)
5. **Single player keeps working with every mechanic.** The AI must use (or at least survive)
   whatever you add; the attract battle on the title screen is AI vs AI and shows it at once.
6. **Saved data outlives builds.** Players keep their settings and an autosaved battle across
   updates — and an older build may still be open in another tab. Settings fields only ever get
   added (an older build drops fields it doesn't know; progress is kept a second time under
   `mythwar.progress.v1` for that, and every save merges what only grows); sanitize every field on
   load. Bump the battle save's `v` (`src/game.ts`, v2 now) when older builds would misread it,
   and keep reading the old ones.

## Verifying a change

| Change | Run at least |
|---|---|
| Anything | `npx tsc --noEmit` and `npx vitest run` |
| UI / app | `npm run smoke` (one flow: `npm run smoke -- --only journal`; + look: `npm run shoot -- <scenario>`, `--list` for names) |
| Netcode, server, protocol, app flows used online | `npm run mpsmoke` (`--shots` for screenshots) |
| Simulation rules / balance | `npm run designcheck`, `npm run sim -- 120 master master` (sides ~50/50) |
| Anything a phone shows (layout, menus, HUD, sheets) | `npm run mobilecheck -- --quick` (3 devices); the whole matrix — 7 iPhones/Androids/iPads × tab/installed × both orientations, ~35 min — before committing a layout change. Look at `screenshots/mobile/`. |
| Rendering cost | `npm run perfcheck` (budget 3 ms of JS per frame) |
| Server start-up, its messages, the release package | `npm run package:check` (packages, then starts the package's own `server.mjs` and plays a lobby round trip) |
| Before committing | `npm run verify` (typecheck, tests, build, smoke, mpsmoke) |
| A rules change, before committing | `npm run verify:all` (verify, then enginecheck, designcheck, puzzlecheck, perfcheck — one build) |

The smoke tests drive the real game in Chrome (`puppeteer-core` with the installed Chrome, Edge
or Chromium — found in the usual places on Windows, macOS and Linux, or set `CHROME=/path`;
Playwright's browsers for Firefox/WebKit live in `node_modules`). Add a check when you add a flow
— `mpsmoke` reads the DOM and the app object (`window.__mythwar`).

## Adding a creature (the checklist)

1. `src/sim/data.ts` — its spec in `UNIT_SPECS` (class, multipliers, traits, projectile).
2. `src/render/creatures/<age>.ts` — its art (`CreatureArt`), registered in `creatures/index.ts`.
3. `src/audio/audio.ts` — its cry in `cry()`.
4. `src/ui/bestiary.ts` — the myth behind it (`MYTHS`).
5. `src/render/creatures/tempers.ts` — its temper and kill gesture; `src/ui/heroes.ts` — the
   names its veterans earn.
6. Run `node scripts/classwar.ts --matrix` (the counter triangle must hold in its age),
   `npm run designcheck`, and look at it: `?gallery` shows every creature's animations.

## Style

- Match the surrounding code: small comments that say *why*, British-flavoured English in the
  game's texts, curly quotes and typographic dashes in player-facing strings.
- Player-facing words are part of the design: short, concrete, in the game's voice.
- Keep `PROGRESS.md` current (what's done, what's next, decisions) and commit small, one change
  per commit, with a message that says what the player gets.
- Patch scripts (Python/Node one-liners) silently eat backslashes (`\n`, `\b`, `\d`) and Python
  on Windows writes CRLF — prefer a real editor for anything with escapes, and check with
  `npx tsc --noEmit` afterwards.
