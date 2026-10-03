# PROGRESS

Status: in development (run #1 started 2026-10-03)

See DESIGN.md for the game design.

## Tech decisions
- Vite + TypeScript (no framework, no game engine). Canvas 2D battlefield, DOM/CSS HUD overlay.
- Pure deterministic simulation (`src/sim`) with fixed 60 Hz step and seeded RNG, fully
  decoupled from rendering ⇒ unit tests + headless AI-vs-AI balance runs (`npm run sim`).
- Imports use explicit `.ts` extensions so Node 24 can run scripts natively (type stripping);
  `erasableSyntaxOnly` ⇒ no enums / parameter properties.
- All art is procedural vector drawing (no image assets). Audio is synthesized with WebAudio.
- Screenshots via puppeteer-core driving the locally installed Chrome (`scripts/shoot.ts`).

## Milestones
- [x] M0 Scaffold (Vite, TS, Vitest, .gitignore, docs)
- [x] M1 Simulation core: data, lanes, units, combat, counters, projectiles, base, economy,
      queue, ages, turrets, god powers, shrines, events. Unit tests.
- [x] M2 AI (4 difficulties) + headless AI-vs-AI runner, sanity tests (games end, harder wins)
- [x] M3 Renderer skeleton: game loop w/ interpolation, background, lanes, bases, placeholder units
- [x] M4 HUD + menus (title, difficulty, pause, end screen), input (lane select, cards, drag)
- [x] M5 Creature art & animation for all 16 creatures, turrets, citadels per age
- [ ] M6 FX: particles, projectiles, god-power visuals, ascend transition, shake, floating text
- [x] M7 Audio (synth SFX + ambient music), settings
- [ ] M8 Mobile: landscape thumb layout, portrait rotation, touch drag, perf scaling
- [ ] M9 Onboarding: how-to-play, first-game hints, tooltips
- [ ] M10 Balance pass via headless sims, polish, screenshot review on desktop + mobile

## Done
- Sim core (`src/sim`): world.ts (step, combat, projectiles, turrets, gate wards, shrines, ragnarök),
  powers.ts (5 god powers), data.ts (all balance numbers), types.ts (state, events, commands).
- AI (`src/ai/ai.ts`): lane threat assessment, counters, ascend saving, turrets, blessings, powers.
- `npm run sim -- 20 master adept` headless balance runs; `node scripts/trace.ts <seed>` timeline.
- Balance snapshot (master vs master): ages at ~2/4.5/8.5/13.5 min, games ~20 min (Ragnarök
  ends stalemates). mythic>master 8-4, master>adept 9-3, adept>novice 12-0.

- Renderer (`src/render`): themed pre-rendered backdrops per age (cross-fade on ascend), citadel
  keep/gates/turrets per age style, shrines, 16 procedural animated creatures
  (`render/creatures/*.ts`), projectiles, particle FX, god-power visuals, ghosts on death.
- HUD (`src/ui/hud.ts` + `hud.css`): cards w/ portraits & tooltips, queue, lane tabs, power,
  ascend, turret & blessing panels, toasts/banners; drag-and-drop cards/power onto lanes.
- Menus (`src/ui/menus.ts`): title over a live AI battle, difficulty (with W/L records),
  how-to-play (5 pages), settings (localStorage), pause, results.
- Mobile: thumb columns (cards left, actions right); portrait phones get the stage rotated 90°.
- Debug URLs: `?demo&ff=300&seed=5` (AI vs AI, fast-forward), `?play=adept`, `?screen=howto`,
  `?gallery` (all creature animations), `?mode=mobile`, `?theme=2`.
- `node scripts/shoot.ts [filter]` (after `npm run build`) → screenshots/*.png.

- Audio (`src/audio/audio.ts`): synthesized SFX (rate-limited, stereo-panned by lane position),
  generative per-age score (pad + bass + arpeggio, war drums scale with battle intensity).
- `npm run smoke`: end-to-end Chrome test (desktop + phone): lane select, tap/drag summon, keys,
  turrets, power targeting, ascend, blessings, pause/resume, victory screen, no console errors.
- All HUD/menu buttons use pointer-based `onTap` (synthesized clicks are dropped during
  multi-touch on phones — found by the smoke test).

- Difficulty calibration vs scripted naive players (`node scripts/bots.ts 10`,
  `node scripts/calib.ts reactive adept 30`): a lane-reactive bot beats Novice ~90%, Adept ~37%,
  Master ~20%, Mythic 0%; a random spammer beats Novice ~47%. Default difficulty: Novice.

## Next
- First-game onboarding hints
- Game-over citadel collapse effect; polish pass; balance re-check

## Decisions log
- Added **gate wards** (free built-in weak turret per lane, scales with age): without them, the
  first side to win a lane fight snowballed to victory in 3–5 min (no defender's advantage).
- Added **Blessings** (Might / Vitality / Bastion, 5 ranks each, cost scales with age): late-game
  gold piled up to 50k+ with nothing to buy because the training queue caps throughput.
- Added **Ragnarök** (from 18 min, or 3 min after both reach the final age): wards go silent and
  citadel damage ramps +100%/min. Mirror matches otherwise stalemated at age 5 for 40+ minutes.
- Power scale per age [1, 1.65, 2.75, 4.5, 7.4] vs cost scale [1, 2.1, 4.4, 9.2, 19]: value per
  gold (~power²/cost) grows ~1.3x per age. Earlier, steeper scaling made the first ascender win.
- Shrines give ~20% of base income each (at 50%+ they caused runaway snowballs).
- 5 ages × 3 classes + 1 Legend (Elder Dragon) in the last age.
- XP threshold **and** a gold tithe to ascend (strategic choice vs. spending on units).
- Shared citadel HP; one turret slot per lane per side; shrines in lane centres give income.
- Mobile portrait: rotate the whole game container 90° (forced landscape) rather than a separate
  portrait layout — side-view creatures don't work on vertical lanes.

## Open questions for the human
(none)
