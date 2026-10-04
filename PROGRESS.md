# PROGRESS

Status: complete, in verification mode (since run #1, 2026-10-04 ~01:15)

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
- [x] M6 FX: particles, projectiles, god-power visuals, ascend transition, shake, floating text
- [x] M7 Audio (synth SFX + ambient music), settings
- [x] M8 Mobile: landscape thumb layout, portrait rotation, touch drag, perf scaling
- [x] M9 Onboarding: how-to-play, first-game hints, tooltips
- [x] M10 Balance pass via headless sims, polish, screenshot review on desktop + mobile

## Done
- Sim core (`src/sim`): world.ts (step, combat, projectiles, turrets, gate wards, shrines, ragnarök),
  powers.ts (5 god powers), data.ts (all balance numbers), types.ts (state, events, commands).
- AI (`src/ai/ai.ts`): lane threat assessment, counters, ascend saving, turrets, blessings, powers.
- `npm run sim -- 20 master adept` headless balance runs; `node scripts/trace.ts <seed>` timeline.
- Balance snapshot (after the formation rules, see backlog #19): master vs master games ~18 min
  (Ragnarök ends stalemates); mythic>master 20-10, master>adept 24-6, adept>novice 19-1.

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
- `npm run verify` = typecheck + unit tests + build + smoke (non-zero exit on any failure);
  run it before every commit.
- `npm run smoke`: end-to-end Chrome test (desktop + phone): lane select, tap/drag summon, keys,
  turrets, power targeting, ascend, blessings, pause/resume, victory screen, no console errors.
- All HUD/menu buttons use pointer-based `onTap` (synthesized clicks are dropped during
  multi-touch on phones — found by the smoke test).

- Difficulty calibration vs scripted naive players (`node scripts/bots.ts 10`,
  `node scripts/calib.ts counter adept 30`): a bot that follows the Counter! badge beats Novice
  ~90%, Adept ~27%, Master ~10%, Mythic 0% (bots don't use turrets/blessings/shrines, so real
  players should do better). Default difficulty: Novice.

- Coach tips (`src/ui/coach.ts`), lane danger pulses, "Counter!" card badge.
- PWA: manifest (landscape, fullscreen), offline service worker; phones go fullscreen and
  lock landscape on battle start; notch safe-areas respected.
- Citadel collapse finale; README.md; `node scripts/soak.ts 60 16` (no errors in all ages,
  headless software-rendered fps 44–85 at 16× speed).

## Improvement backlog
(verification mode: complete ≥2 per run, verify, commit, add new findings)
1. [x] `src/audio/audio.ts schedule()`: after the tab was backgrounded, `nextBar` lagged far behind
   `currentTime`, so the loop scheduled every missed bar at once (audio burst). Now clamped.
2. [x] `src/input.ts onKey`: focused HUD buttons + Space. Turned out Chrome already suppresses
   the activation (onKey preventDefaults Space; verified with a smoke check that passes with and
   without the fix); the blur is kept as a guard for other browsers. Smoke check added.
3. [x] Results show the player's most-summoned creature ("Your champion: X ×n");
   `TeamStats.summonedBy` added.
4. [x] Battered gates now throw stone chips + dust (throttled per lane) on `baseHit`.
5. [x] Desktop hover labels on creatures (name, class colour, HP) via `view.mouse`.
6. [x] Panels cache element refs; the blessing buy button no longer rewrites its innerHTML
   every frame (it did while the panel was open).
7. [x] `drawUnits` sorts by a precomputed `renderKey` in a reused buffer.
8. [x] Results screen "Army strength over time" line chart (`Game.history`, sampled every 5 s):
   validated chart colours, legend + direct labels, hover crosshair/tooltip; side-by-side with
   the stats table on short phone screens.
9. [x] Escape routing (`src/app.ts escape()`): Escape in How-to/Settings opened from the pause
   menu used to resume the battle; on title sub-screens it did nothing. Now steps back.
10. [x] Pausing left an open turret/blessing panel alive under the pause menu, swallowing
    Escape. `pause()` now closes panels. (Both found by new smoke checks.)
11. [x] Unit tests for Blessings (cost/rank cap, might/vitality/bastion effects) and Ragnarök
    (timing, silent wards, damage ramp, early start in the final age). 38 tests.
12. [x] Code cleanup: removed `void x;` hacks, unused imports/params.
13. [x] `glowSprite` would build an invalid gradient colour from a hex string; now accepts
    hex / rgb() / triples.
14. [x] Kill rewards: gold coins arc from slain foes to the gold counter, which pulses.
15. [x] Haptics on phones (summon, error, ascend, citadel hit, result) via `navigator.vibrate`,
    gated by the "Screen shake & vibration" setting.
16. [x] Renderer kept every visited theme backdrop cached at full DPR (up to ~165 MB on 4K);
    now only the current/previous theme are kept.
17. [x] `prefers-reduced-motion`: shake/vibration default off on first run; looping CSS
    pulses disabled.
18. [x] Autosave: `World.serialize/deserialize`, `AiController.snapshot/restore`,
    `Game.toSave/fromSave` (`src/save.ts`); saved every 5 s of play, on tab hide and pagehide;
    title shows "Continue — <age> · <time>" and resumes paused. Leaving/finishing a battle
    clears it. Unit test: a restored battle continues bit-identically; smoke flow covers it.
21. [x] Ultrawide screens (2560×1080) drew creatures ~1.6× too large (art scale followed lane
    width only). `artScaleOf()` in layout.ts now caps it by field height; rings, health bars and
    hit boxes use the same body scale; renderer/HUD/input share the helper.
22. [x] Small desktop windows (~1024 px): four final-age cards collided with the action buttons;
    added a compact desktop breakpoint (≤1180 px).
23. [x] A battle whose winner was already decided (e.g. fast-forwarded) could be autosaved and
    "continued" with no results screen. `persist()` and `Game.fromSave` now refuse them (test).
24. [x] Ward/turret projectiles now launch from the gate crystal / turret head heights
    (derived from the citadel.ts gate geometry incl. lane band).
25. [x] Ascend button shows "need N g" once the XP is there but gold is short.
26. [x] Enemy god powers flash the targeted lane red (pulsing band) besides the toast.
29. [x] Cards were rebuilt (with their pop-in animation) on every resize — mobile browsers
    resize when the URL bar moves; now only when the layout mode changes. (Found while
    investigating a screenshot-harness artefact; `crop.mjs` now uses captureBeyondViewport:false.)
27. [x] Checked, no change needed: on an 844×390 phone the Spirit Dragon flies at y≈146 px on
    the far lane, well below the top HUD (≈75 px); desktop ≈296 px.
28. [x] Results chart marks both sides' ascensions (coloured ticks + numerals; `Game.ageUps`,
    saved with autosaves).
30. [x] Healing had no feedback: regrowth/lifesteal now emit rising green sparkles (every 5%
    of max HP healed).
31. [x] DESIGN.md controls were out of date (Space casts directly; Q/A/Z, B, F keys).
32. [ ] Performance: `node scripts/perf.mjs` stress (127 creatures) costs ~42 ms/frame with
    headless software raster vs ~0.6 ms for a typical field; real battles stay ≤ ~25 creatures
    (~7 ms). If real phones struggle, cache creature animation frames as sprites (LRU by
    def/team/scale/frame) — needs on-device profiling first.
33. [x] Desktop controls card: "?" button in the top bar and ?/H/F1 keys.
34. [x] Title backdrop battles use adept or master AIs and start at random moments (0:40–7:00),
    with the matching age backdrop.
35. [x] Victors hop in celebration once the battle is decided; Ragnarök adds rising embers.
36. [x] Lane strength bar (blue vs red creature value) under each lane tab when both sides
    have creatures in that lane.
37. [x] Card tooltips show effective HP / DPS including Might/Vitality (+x% marked).
38. [x] Effects/master volume sliders play a preview sound on release. (Overall loudness on
    real devices still unverified — no speakers here.)
39. [x] Rotated-portrait phones: menu CSS used viewport media queries, which saw the portrait
    viewport while the stage is landscape — the difficulty screen overflowed with no title or
    buttons. #stage is now a size container; menus/HUD use `@container stage (...)` and
    cqw/cqh units. Screenshot scenarios `mobile-port-title/diff` added.
40. [x] Forfeits: leaving/restarting from the pause menu after ≥ 60 s records a defeat (noted
    under the pause buttons).
41. [x] How-to page 1 shows your (blue-glow, facing right) creatures versus the enemy's
    (red, facing left); `portrait()` can render facing left.
42. [x] `node scripts/shoot.ts --list` prints all screenshot scenarios (filter = substring).
43. [x] Power screenshot scenarios for Spirit Dragon / Starfall pointed at a battle that had
    already ended; re-pointed and both powers verified visually.
44. [x] Event effects (spawn flashes, shockwaves, strikes) are sized by the creature body scale,
    so they stay proportional on ultrawide screens.
45. [x] Pausing now freezes particles/ghosts/coins too (renderer gets dt = 0 while paused).
46. [x] Citadel keep + curtain wall are pre-rendered per (team, age) into a cropped offscreen
    canvas; only window glow, banner, flashes and smoke draw live (`drawCitadelKeep(...,
    'static' | 'dynamic')`). Software-raster frame cost on an empty field ~10.5 → ~7.9 ms
    (`node scripts/perf2.mjs`, which also supports skipping passes via `renderer.skip`).
47. [ ] Lane highlight / shrine / fimbul overlays allocate canvas gradients every frame; cache
    per layout.
49. [x] Melee blows draw a slash arc across the target (yellow on counter hits); creatures
    also recoil slightly when struck.
50. [x] Lane-strength bar refs cached.
51. [x] Enemy god-power casts play a rising two-note warning before the power's own sound.
52. [x] Coach tip "packs" explains Hunter packs vs Guardian sweeps when the player first
    fields 3+ Hunters in one lane.
53. [x] Smoke flow drives title → difficulty → Begin Battle on a rotated portrait phone.
54. [x] 1366×768 laptops: card portraits overlapped the names; portraits now scale with the
    bottom-bar height (`desktop-laptop` screenshot scenario).
55. [x] Grass tufts (theme foliage colours) hug both edges of every lane path.
56. [x] Checked, no change: the blue/red team pair passes the dataviz CVD check (worst
    adjacent ΔE 18, protan) and teams also differ by facing direction and ground rings.
57. [x] Turret buttons show "dmg/s · splash · slows · range" under the name; buttons stay
    side by side so the phone panel fits without scrolling.
58. [x] `?play=` auto-starts on phones requested fullscreen without a gesture (console
    warning); `immersive()` now checks `navigator.userActivation`.
59. [x] Phone panels are near-opaque so the gold pill no longer bleeds through.
60. [x] Phone results show a small champion portrait beside the verdict (was hidden).
61. [ ] `src/sim/data.ts`: Elder Dragon beats equal gold of any class by 59–86% value
    (scripts/classwar battle); fine as a one-at-a-time capstone, but re-check if players
    report it dominating late Ragnarök games.
62. [x] Age badges pulse when that side has the XP to ascend (enemy badge tooltip warns too).
    Also: the top bar had pointer-events:none, so badge/shrine tooltips never appeared — the
    badges, shrine pips and Ragnarök label now accept hover.
63. [ ] Results: add per-lane breakdown (kills per lane) to help players see where they won.
48. [ ] Sim: `World.enemiesInLane`/`alliesInLane` allocate arrays and are called by powers and
    the AI each decision; fine now, but a per-tick lane index would scale better.
19. [x] Balance investigation (`node scripts/classwar.ts`, equal-gold army battles): massed
    Mystics beat *everything* at army scale (ranged units focus fire, melee fight one at a time),
    so "spam Mystics" was a dominant strategy. Added formation rules — Hunters hunt in packs
    (don't block each other), Guardians' blows sweep packed foes (80%) — and trimmed Fenrir
    lifesteal 0.35→0.25. The triangle now holds at army scale in all ages (unit-tested).
    Adept softened (think 1.6 s, 90% income) since counters matter more; a "follow the Counter!
    badge" bot beats Novice 9/10, Adept ~27%, Master ~10%.
20. [x] Queue chips are reconciled (kept/moved/removed) instead of rebuilt, so only new chips
    pop in; cancel uses the chip's live index. Smoke checks for chips + cancel added.

## Decisions log
- Formation rules (packs/sweep/hang-back) instead of raw stat tuning: stats alone cannot fix
  ranged focus-fire dominance without breaking the 1v1 triangle.
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
