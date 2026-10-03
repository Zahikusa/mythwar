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
- [ ] M0 Scaffold (Vite, TS, Vitest, .gitignore, docs)
- [ ] M1 Simulation core: data, lanes, units, combat, counters, projectiles, base, economy,
      queue, ages, turrets, god powers, shrines, events. Unit tests.
- [ ] M2 AI (4 difficulties) + headless AI-vs-AI runner, sanity tests (games end, harder wins)
- [ ] M3 Renderer skeleton: game loop w/ interpolation, background, lanes, bases, placeholder units
- [ ] M4 HUD + menus (title, difficulty, pause, end screen), input (lane select, cards, drag)
- [ ] M5 Creature art & animation for all 16 creatures, turrets, citadels per age
- [ ] M6 FX: particles, projectiles, god-power visuals, ascend transition, shake, floating text
- [ ] M7 Audio (synth SFX + ambient music), settings
- [ ] M8 Mobile: landscape thumb layout, portrait rotation, touch drag, perf scaling
- [ ] M9 Onboarding: how-to-play, first-game hints, tooltips
- [ ] M10 Balance pass via headless sims, polish, screenshot review on desktop + mobile

## Done
(nothing yet)

## Next
- M1 simulation core

## Decisions log
- 5 ages × 3 classes + 1 Legend (Elder Dragon) in the last age.
- XP threshold **and** a gold tithe to ascend (strategic choice vs. spending on units).
- Shared citadel HP; one turret slot per lane per side; shrines in lane centres give income.
- Mobile portrait: rotate the whole game container 90° (forced landscape) rather than a separate
  portrait layout — side-view creatures don't work on vertical lanes.

## Open questions for the human
(none)
