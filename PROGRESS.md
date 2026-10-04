# PROGRESS

Status: complete, in verification mode (since run #1, 2026-10-04 ~01:15; run #2 03:33–07:30:
sim fairness fixes, large-screen HUD zoom, portal flares, frozen-sprite perf, mobile/text polish,
see backlog #122–#178)

See DESIGN.md for the game design.

## Run #2 in short (for the morning)
- **Fairness:** the AI (team 1) used to win ties — it got the first melee blow when two units met
  and won simultaneous citadel falls. Fixed; all mirror duels now draw (tests). Splash no longer
  stacks; Jötunn cleave buffed to compensate. AI no longer death-spirals when an age behind.
- **New for players:** gate portals flare ~1 s before a creature steps out (read the enemy's next
  lane); creature labels say what beats them; gold shown in turret/blessing panels.
- **Screens:** HUD + menus scale up on 1440p/4K desktops; many phone fixes (small phones, safe
  areas when upright, ≥ 10 px text, bigger buttons, HUD hidden under menus, queue clear of gate).
- **Robustness:** corrupt saves/settings, tiny windows, tutorial hand-off, drags surviving pause,
  focused buttons behind menus, hidden-tab audio, service-worker cache growth — all fixed and
  smoke-tested (`npm run verify`: 75 unit tests + 102 browser checks).
- **Perf:** frozen creatures 145 → 13 ms/frame for 30 frozen (headless software raster).
- **Try:** `npm run dev`, play Adept; on a phone check the items under "Open questions".

## Requirements check (TASK.md)
- **Age of War concept** — two citadels, summon units for gold, kill for gold + XP, evolve through
  ages (5), turrets per age, a special power per age, destroy the enemy base. ✔
- **3 lanes, both players send units on any lane** — lane select by tap/click/keys, drag cards
  onto lanes; each lane has its own fights, gate, turret slot and shrine; shared citadel HP. ✔
- **Mythological creatures** — 16 creatures across Fae Wilds, Olympus, Asgard, Jade Empire,
  Celestial (+ Elder Dragon), each with its own trait. ✔
- **Visually appealing, smooth, clean** — procedural vector art, per-age themed backdrops with
  cross-fades, interpolated 60 Hz sim, walk/attack/death/spawn animations, particles, god-power
  set pieces, citadel collapse. Screenshots in docs/. ✔
- **Depth but simple to pick up, intuitive** — counter triangle + formation rules, shrines,
  turrets, blessings, god powers, ages, Ragnarök; first-battle how-to, contextual coach tips,
  Counter! badge, lane danger/strength indicators, tooltips/hover/press-and-hold labels. ✔
- **AI with sensible difficulty levels** — Novice / Adept / Master / Mythic, calibrated with
  headless sims and scripted naive players. ✔
- **Separately optimized for desktop and mobile** — desktop bottom bar + hotkeys + hover;
  phones get thumb columns, big touch targets, drag/long-press, rotated portrait, fullscreen +
  landscape lock, haptics, PWA install, battery-saver fallback. ✔

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
- Balance snapshot (run #2, after the fairness fixes #125–127 and the AI siege-saving fix #156):
  master mirror 24-16, avg ~21 min, no games under 8 min (Ragnarök ends stalemates);
  mythic>master 20-10, master>adept 28-2, adept>novice 30-0.

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
  `node scripts/calib.ts counter adept 90`): a bot that follows the Counter! badge beats Novice
  ~83%, Adept ~11%, Master 0/30 (run #2 numbers, n=90; run #1 build measured 89% / 19% with the
  same n). Bots don't use turrets/blessings/shrines/powers, so real players should do better.
  Default difficulty: Novice. (See #172.)

- Coach tips (`src/ui/coach.ts`), lane danger pulses, "Counter!" card badge.
- PWA: manifest (landscape, fullscreen), offline service worker; phones go fullscreen and
  lock landscape on battle start; notch safe-areas respected.
- Citadel collapse finale; README.md; `node scripts/soak.ts 60 16` (no errors in all ages,
  headless software-rendered fps 44–85 at 16× speed).

## Improvement backlog
(verification mode: complete ≥2 per run, verify with `npm run verify`, commit, add findings.
Screenshot scenarios: `node scripts/shoot.ts --list`.)
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
32. [ ] (deferred until real-device profiling) Creature sprite caching. Software-raster cost is
    ~8 ms/frame for an empty field and ~+0.2 ms per creature; real battles stay ≤ ~25
    creatures. Quantized sprite frames would cost smoothness and ~10–40 MB; the automatic
    battery-saver fallback (#78) covers slow devices for now.
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
47. [x] Lane-highlight gradients cached per lane/colour (pulse via globalAlpha). Shrine glows
    already use cached sprites; the Fimbulwinter band only exists during the power.
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
    report it dominating late Ragnarök games. Run #2 data: master AIs that may field dragons vs
    ones that never do, 200 final-age games with sides swapped: dragon side won 106/200 (53%),
    ~0.3 dragons per game — not dominant in AI play; a human hoarding for it is untested.
62. [x] Age badges pulse when that side has the XP to ascend (enemy badge tooltip warns too).
    Also: the top bar had pointer-events:none, so badge/shrine tooltips never appeared — the
    badges, shrine pips and Ragnarök label now accept hover.
63. [x] Results show kills per lane ("… top / mid / bottom"); `TeamStats.killsByLane`, older
    saves are back-filled on load.
64. [x] During Ragnarök, Master/Mythic AIs push the enemy's weakest-defended lane when calm.
    (Tried Bastion-buying before/while Ragnarök too: it only lengthened mirror games, so not
    kept.) Mirror length 19.8 → 21.0 min over 30 games (within noise); ladder unchanged
    (master>adept 21-9, mythic>master 15-5).
65. [x] On ascension the score restarts at the new age's first chord ~1.4 s later (after the
    fanfare) instead of switching scale mid-progression.
66. [x] Victory pose: the winners brandish weapons (wind-up pose) in time with their hop.
68. [x] Difficulty cards show stat chips: reaction speed, how often it counters, income %.
69. [x] Settings has an About block (version injected from package.json via Vite `define`;
    package version bumped to 1.0.0).
70. [x] Settings panel more opaque (0.94) over the live backdrop.
72. [x] Free-floating coach tips overlapped toasts (both top-centre); tips now sit lower.
73. [x] Event toasts queue (max 3, shorter while queued); failed-action feedback still replaces
    immediately.
74. [x] iOS Safari pinch/rotate gestures and double-tap zoom are blocked (`gesture*` and quick
    second `touchend` preventDefault in main.ts; inputs exempt). Not verifiable on a real iPhone
    here — buttons use pointer events so the click suppression doesn't affect them.
77. [x] Held shrines shed occasional golden glints (shrines = income).
78. [x] Automatic battery-saver fallback: 4 consecutive seconds under 40 fps mid-battle switch
    to low quality once (DPR 1, fewer particles) with a toast; smoke-checked.
79. [x] Art: Titan gains a starry cosmic cape and gold pauldrons, Fenrir a shaggy neck ruff,
    the Jötunn's club becomes a jagged ice cluster.
80. [x] Living skies: Asgard's aurora is drawn live (two swaying, breathing layers from a cached
    ribbon canvas) and night themes get a few twinkling stars.
81. [x] Ascension raises a pillar of light (with rising motes) over the ascending keep.
82. [x] First battle ever: "Begin Battle" opens the 5-page how-to first (Skip / "To battle!"
    lead straight into the fight); `settings.tutorialSeen` finally used. Smoke-checked.
83. [x] Queue head-of-line blocking: a trained creature whose gate is jammed (own units
    fighting in the gateway) now waits as `ready` while training moves on, and steps out as
    soon as there's room — summons for other lanes are no longer held up. Ready chips get a
    gold border + "waiting for room" tooltip. Unit-tested; save format compatible (optional
    field).
84. [x] Backspace/Delete cancels the most recent summon (refund); on the controls card;
    smoke-checked.
85. [x] Touch: press and hold on a creature shows the same name/class/HP label as desktop
    hover (`view.inspect`); smoke-checked on phone viewports.
86. [x] Enter presses the current menu screen's primary (gold) button (Play/Continue, Begin,
    Next, Resume, Rematch, Done); smoke flow now continues a save via Enter.
87. [x] One-time coach tip explains gold-bordered "waiting at a jammed gate" queue chips.
90. [x] Coach tip "wards": after 3 of the player's creatures die near the enemy gate, explain
    gate wards/turrets and suggest pushing in groups or using the god power.
91. [x] Quick mute: M key and a speaker button (desktop top bar); persisted as
    `settings.muted`; moving the master slider unmutes. Smoke-checked.
94. [x] Smoke check: rotating/resizing mid-battle keeps layout and lane input working
    (desktop, phone, rotated phone).
95. [x] Phone queue chips enlarged 30 → 38 px (they're DOM above the canvas, so taps never
    leak to the lane underneath). Cards/actions are already ≥ 70 px.
96. [x] Checked, no change: the battle keeps rendering behind the results (collapsing citadel,
    celebrating victors), which already shows the decisive moment.
97. [x] HUD cleanup: dropped a leftover `void RAGNAROK_TIME` hack/import; lane-tab queue
    counters cached instead of `querySelector` per frame.
98. [x] Gold popups from kills close together (space/time) merge into one growing "+N"
    (e.g. a god power killing six creatures shows "+114").
99. [x] Phone Ascend sub-label: 10 px bold, compact ("150g" / "need 97g"); the age name stays
    in the tooltip/banner.
100. [x] Enemy god-power icon beside the enemy age name: dim while recharging (tooltip with
    seconds left), glowing when ready — skilled players can bait or brace for it.
76. [x] PNG icons (apple-touch-icon 180, manifest 192/512) rendered from icon.svg by
    `node scripts/icons.mjs`; iOS meta tags; service-worker cache bumped to v2.
92. [x] Card tooltips also show on keyboard focus (focus-visible).
93. [x] Backdrop drawn 1:1 (no resampling); during shake the exposed margin is pre-filled.
    (No measurable change in headless software raster; avoids resampling on real GPUs.)
101. [x] Settings → "Reset records" (two-tap confirm).
102. [x] Title shows a crown "laurel" per difficulty the player has beaten (tooltip: wins and
    fastest victory).
103. [x] Pause screen shows a one-line battle summary (foe, time, ages, foes slain).
104. [x] Preferred game speed (1×/2×) is remembered across battles (`settings.speed`).
105. [x] Pause summary stays on one line (ellipsis) on narrow screens.
106. [x] Coach tips wait while a centre banner (ascension, Ragnarök, verdict) is showing.
107. [x] Blessing chips (swords / heart / tower + rank) beside both sides' age names on desktop,
    so your and the enemy's upgrades are readable at a glance (tooltips explain each).
108. [x] The blessings panel lists the enemy's blessings (covers phones, where the top-bar chips
    are hidden).
109. [x] Turrets button shows a "!" badge when a turret is from an earlier age.
110. [x] Blocked cards say why ("One at a time" for the Elder Dragon, "Queue full").
111. [x] Decided against right-click quick-cast (too easy to waste a 60 s power by accident);
    Space already casts instantly on the selected lane.
112. [x] Results: "Copy result" copies a one-line summary (verdict, foe, time, age, kills).
113. [x] Creature-specific death flourishes: leaves (Treant), ice shards (Jötunn), feathers
    (Valkyrie, Griffin), foxfire (Kitsune), marble + light (Titan), embers (Phoenix, Dragon)...
114. [x] Phoenix rebirth: a flame flare plus a fading white-hot glow on the bird (`reborn`).
115. [x] Heavy impacts (splash shots, Zeus bolts, Starfall meteors) leave a fading scorch decal
    under the creatures.
116. [x] HUD shrine pips pulse when a shrine changes hands.
117. [x] Frozen creatures are drawn frost-tinted (ctx.filter; ignored where unsupported) inside
    their ice block.
118. [ ] Lane paths could show faint footprint/wear along the middle over time (cosmetic).
119. [x] Title backdrop has a slow cinematic camera drift (off when shake/reduced motion is off).
120. [x] Desktop action buttons show their keys (Space / U / T / B) like the cards' 1–4.
121. [x] Phones vibrate briefly when a god power is cast.
122. [x] Gate portals flare (team colour + white core) for the last 1.2 s of a creature's
    training and glow while a trained one waits for room — for both sides, so the enemy's next
    lane is readable. One-time coach tip "portals" explains it the first time an enemy portal
    flares after 0:50. (DESIGN.md updated.)
123. [x] Large desktop screens (above 1920×1080) zoom the HUD and menu screens (CSS `zoom`,
    `hudZoom()` in layout.ts, 1–1.6 in 0.05 steps; bottom inset scales with it). JS-positioned
    parts (tooltip, coach tip, lane tabs, drag ghost) divide their left/top by the zoom and
    measure with getBoundingClientRect (Chrome: zoomed) instead of offsetWidth (unzoomed).
    Portraits render at DPR × zoom so they stay crisp. Smoke flow "large desktop (QHD)";
    screenshot `menu-diff-qhd`. The results-chart hover now also works on rotated phones.
124. [x] `src/ui/menus.ts`: Esc out of the first-run how-to never cleared `afterHowto`; later
    Pause → How to Play → Skip/"To battle!" started a new battle, discarding the live one.
    `show()` now drops the hand-off whenever the how-to closes. Smoke flow "tutorial hand-off".
125. [x] `src/sim/world.ts` unit update order: team 0 always moved first, so team 1 (the AI)
    started attacking one tick earlier when two melee units met — won 9/16 mirror duels vs 4.
    Now both sides decide "foe in reach" (and enrage) from start-of-tick positions, and a unit
    slain in the tick its swing completes still lands it. All 16 mirror duels are draws; tests
    for mirror duels and side-swapped duels (all 120 pairs).
126. [x] `world.ts checkWin`: both citadels falling in the same tick went to team 1; now the side
    with more total siege damage wins (test).
127. [x] `world.ts meleeHit`: Guardian sweep stacked with Jötunn cleave / Titan slam (neighbours
    took 1.3–1.4× the target's damage). Splash shares no longer stack (largest applies); to
    keep the Jötunn's edge vs packs, cleave now strikes the second foe at full force (army
    G-v-H age 3: +0.09, ×2 budget +0.13). Ladder after #125–127: master>adept 16-4,
    adept>novice 20-0, mythic>master 14-2, master mirror 9-7 (avg 21 min). Tests added.
128. [x] `src/ui/hud.ts`: drags survived Esc / pause / leaving (releasing still summoned while
    paused; the ghost could linger into the next battle). `cancelDrag()` from
    cancelTargeting/attach/detach; drops while paused/over are ignored. Smoke-checked.
129. [x] Enter/Space activated a focused HUD button behind a menu (click Pause, press Enter →
    stayed paused). The HUD is `inert` while any menu is open; Enter ignores key repeat.
    Smoke-checked.
130. [x] `src/app.ts`: a malformed autosave threw while labelling "Continue" → the game never
    loaded. Label is validated (bad saves are dropped), `Game.fromSave` checks the difficulty,
    settings are sanitized field by field. Smoke check plants corrupt storage.
131. [x] The AudioContext is suspended while the page is hidden (resumed when visible).
132. [x] `lastBuzz` reset when a battle starts.
133. [x] Card tooltip and drag ghost rendered under the coach bubble; the HUD layer now sits above
    coach tips (z 16) and below menus (20).
134. [x] Battle shortcuts ignore Ctrl/Alt/Meta combos (Ctrl+F, Ctrl+P, Ctrl+1–4 are the browser's).
135. [x] A11y: panel close buttons and how-to dots have accessible names, cards have a "Summon X
    (class), N gold" label; Tab-focused cards / power button activate with Enter (only
    mouse-focused HUD buttons are blurred on key presses). Smoke: Tab to a card + Enter.
136. [x] `continueSaved` goes through `pause()`, so the pause summary shows (smoke-checked).
137. [x] `src/game.ts fastForward` discarded events: a game over during ff never ended the game
    (a title backdrop could sit on a finished battle). Now ff records ascensions, chart samples
    and `over`, and passes only the gameOver on to listeners (unit test).
138. [x] `ageUp` events carry their sim time (results-chart ticks were up to ~0.5 s late).
139. [x] `World.deserialize` works on a structuredClone of the snapshot (test).
140. [x] `src/ai/ai.ts`: the fallback purchase no longer keeps the ascend reserve under siege.
141. [x] Sim tests added: `tests/traits.test.ts` (regen, charge ×2, slow, lifesteal, enrage cadence,
    bounce, splash; Briar root, Zeus 7 bolts, Spirit Dragon once per foe, Starfall meteors), plus
    the symmetry / simultaneous-fall / splash-stacking tests (#125–127). 69 tests.
142. [x] A window narrower than ~156 px gave a negative field width → `ctx.ellipse` threw →
    the rAF loop died for good. Field size is clamped ≥ 1 and the next frame is scheduled
    before rendering. Smoke check squeezes the window to 120×300 and 1×1.
143. [x] Paused game: screen shake never decayed (dt = 0 → a new random offset every frame) and
    projectiles / the spirit dragon kept emitting trail particles; emission was also per frame
    (144 Hz screens got 2.4× the particles). Trails now emit per second (scaled by the frame
    dt, none while paused) and paused frames don't shake. Smoke check: particle count frozen.
144. [x] Frozen creatures used `ctx.filter` on every fill: 30 frozen creatures cost 145 ms/frame
    (headless software raster) vs 14 ms unfrozen. The frozen pose is now rendered once into a
    sprite cropped to the creature's measured bounds (`artBoundsOf`, alpha-scanned once per
    creature type) and tinted with a source-atop frost wash (works in Safari too, which lacks
    ctx.filter): 12.6 ms/frame. `power-fimbul` scenario re-pointed to seed 2 (seed 3's demo
    battle is over by 5:00 after the sim fairness changes).
145. [x] `glowSprite` keys rgb triples by a packed number (no string per glow draw).
146. [x] Hunter pack fan-out was draw-only: death ghosts/bursts/gold and projectile flights and
    impacts used the unfanned x (dying hunters jumped ~12–15 px). `fanOf()` is now applied to
    deaths, and shots carry their target's fan (impact events carry the projectile id).
147. [x] Timed effects draw in two passes: ground (rings, scorches) under the creatures, slashes /
    flashes / beams over them.
148. [x] Killing blows show their spark and slash (from where the target was last drawn).
149. [x] Keep/gate layer caches keep only the current age per side/gate (were growing to ~10
    full-height canvases); the previous backdrop is released when the cross-fade ends.
150. [x] `citadel.ts`: the keep's dynamic-part early return now restores the collapse save.
151. [x] Title camera zoom is sized to the drift (`max(1.025, 1 + 24/W, 1 + 10/H)`), so no dark
    strip shows at the edges on narrow screens.
152. [x] Power visuals (spirit dragon, Fimbul veil) are drawn with their own lane, so nearer
    lanes' creatures stay in front. (Fimbul veil height uses the capped art scale.)
153. [x] Jötunn breath multiplies the current alpha (fades with spawn/death ghosts).
154. [x] A `(resolution: Ndppx)` media query re-runs the layout when the window moves to a
    screen with another pixel density.
155. [x] A real layout change (size/mode) clears screen-space effects and ghosts instead of
    leaving them at stale positions.
156. [x] AI death spiral: in ~10% of master mirrors one side never ascended (XP ready, but under
    siege it spent every coin on units that the foe's next-age creatures out-tiered) and lost by
    ~4 min. Now an AI that is an age behind with XP ready keeps saving the tithe through a siege
    (and skips panic turrets meanwhile). Short (<8 min) master mirrors 4/40 → 0/40. Ladder:
    master mirror 24-16, master>adept 28-2, adept>novice 30-0, mythic>master 20-10.
    Calibration (counter-following bot, n=90, old → new build): Novice 89% → 83%, Adept 19% →
    11–12%; the saving rule itself doesn't move these (same with it disabled), the shift comes
    from #125–127. Not retuned: within ~1.5 SE and the bot ignores turrets/blessings/shrines.
157. [x] `public/sw.js`: hashed bundles of every earlier build piled up in the offline cache
    (cache-first, one cache name). A fresh page now prunes `/assets/` entries it no longer
    references; cache bumped to v3. Smoke flow "service worker".
158. [x] Text vs mechanics pass (fresh-eyes review): Ragnarök banner said "the gods fall silent"
    (only wards do; powers/turrets work); XP was described as kill-only (also time and citadel
    hits); shrines "pay while your creatures hold them" (they pay until recaptured); the XP bar
    said "Ready to ascend" without the gold → "XP ready"; difficulty Income chip / README income
    lines clarified (time + shrine gold only, all four levels); how-to now says when Ragnarök
    comes and that counters take 25% less in return; controls card lists gate-click, ?/H,
    Backspace/Del; turret DPS includes Bastion (+N%); "top / middle / bottom"; queue chips say
    click or tap per device. Screenshot scenarios `mobile-howto-4/5` (667×375 fits).
159. [x] Rotated portrait now respects safe-area insets (screen top → stage left, bottom → right,
    …); transform and toStage include them. Smoke: faked 47/34 px insets keep the stage clear
    and lane taps still map. (Real iPhone check still pending, see #75.)
160. [x] Difficulty screen on small phones: the 2×2 grid now only applies to tall stages, compact
    menu screens use `justify-content: safe center` (overflow scrolls instead of leaving the
    top); `mobile-diff-se` (667×375) scenario fits.
161. [x] Turret/blessing panel headers show your gold (phones: the panel covers the gold pill).
162. [x] Mobile queue chips start just past the near lane's gate (`--qx` from the layout), so
    tapping the gate for turrets can't hit a chip.
163. [x] Mobile text ≥ 10 px (difficulty chip labels in sentence case to fit, XP text, action
    names, Counter! badge).
164. [x] Mobile pause/speed buttons 36 px tall (action column moved down), panel close 36 px.
165. [x] Mobile toast moved below the gold pill (top 84 px).
166. [x] Phones hide the HUD while a menu (pause, results) is open (`.under-menu`, toggled with
    `inert`): no verdict over the clock, no pause buttons over the side columns.
167. [x] How-to counter triangle: arrowheads no longer touch the "Guardian" label / Mystic orb.
168. [x] Coach tips now live inside the HUD layer (z 15): above lane tabs, below card tooltips.
169. [x] Difficulty chip rows line up across cards (`margin-top: auto`).
170. [x] `scripts/shoot.ts --size WxH` re-shoots any scenario at another viewport (file gets a
    -WxH suffix); checked 1920×1080 desktop and 740×360 phone.
171. [x] Render perf nits: `fx.update` compacts texts/timed in place, the coin cap uses a counter
    (`coinsInFlight`), `unitScreen` runs once per creature per frame (shadow pass result reused).
    (Per-gate portal gradients left as is: 6 per frame.)
172. [ ] Calibration drift: after the fairness fixes (#125–127) the counter-following bot's wins vs
    Adept dropped 19% → ~11% (n=90). Tried Adept variants (think 1.6–1.9 s, income 85–90%): bot
    wins 9–16/90 with no clear trend, i.e. noise at this n — kept unchanged. If human testers find
    Adept too hard, ease `AI_PROFILES.adept` (think time / incomeMult) a notch.
173. [x] Coach tips say "Click" instead of "Tap" on desktop; the drag ghost scales from its corner
    so it stays under the pointer on zoomed HUDs (smoke-checked at QHD).
174. [x] Manifest icons were "any maskable" although the icon has transparent rounded corners and
    art outside the maskable safe zone (Android launchers crop to circles). `scripts/icons.mjs`
    now also renders full-bleed `icon-maskable-192/512.png` (art scaled into the safe zone);
    the rounded icons are "any".
175. [x] Creature hover / press-and-hold labels add the counter rule in class colour: enemies
    "Beaten by Guardians", yours "Strong vs Hunters", the dragon "No class counters it".
176. [x] `scripts/shoot.ts` warns when a demo scenario captured an already-decided battle (demo
    seeds play out differently after sim/AI changes — that's how power-fimbul went stale).
177. [x] `renderer.ts drawFrozen`: the frost sprite is keyed/rendered at the creature's full scale,
    so a creature frozen mid-spawn isn't re-rendered every frame while it grows.
178. [x] Review of run #2's own diff (fresh-eyes agent): (a) `world.ts` the reach check used
    `range + RESOLVE_SLACK`, so when a pack's shared target died mid-tick a pack-mate started a
    swing at the next foe up to 14 units away — now the live distance must be within range
    (scenario test; symmetry/army numbers unchanged); (b) holding Enter on a focused card or the
    power button re-fired on every key repeat (smoke-checked, negative-tested); (c) the service
    worker pruned every unreferenced asset — now only older hashes of bundles the page names
    (lazy chunks survive; smoke-checked); (d) `Game.fromSave` checks `DIFFICULTIES.includes`.
179. [x] Checked, no change needed: an autosave written by the run-1 build (7 min in, 17 creatures,
    a projectile in flight) restores in this build and plays on to a result — the run-2 sim
    changes kept the save format compatible. Smoke: Rematch restores a live HUD everywhere.
75. [ ] Real-device pass needed (no phone here): check performance, audio loudness, haptics,
    fullscreen/orientation lock on Android Chrome and iOS Safari.
71. [x] `:focus-visible` gold focus rings for buttons, toggles and sliders (mouse/touch focus
    stays invisible).
67. [x] Gate towers cache their static layer per (team, lane, age) in small canvases
    (`gateBounds`); only portal glow, arch trim, ward crystal, pennant and hit flash draw live.
88. [x] `startMusic()` created the AudioContext on page load (before any gesture → browser
    warning, suspended context). It now only flags the music on; the context is created by the
    first tap/click/key, which then starts the score.
89. [x] XP bar reads "Ready to ascend" (gold fill) once the requirement is met.
48. [x] Checked, not worth changing: `enemiesInLane` only runs while a god power is active
    (a few calls per second); the AI's assessment already iterates lanes directly.
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
- Side symmetry (run #2): units decide "in reach" from start-of-tick distances and slain units
  still land a swing finishing in the same tick, so update order never decides a fight (all
  mirror duels draw). Master mirrors after the fixes: team 0 won 160 of 300 (53%, ~1 SE) — no
  meaningful side bias left. (Movement order still lets team 0 cover the last sub-step when two
  units meet; it only shifts where they meet by < 1 tick of walking.)
- Splash shares don't stack (largest applies); Jötunn cleave raised to full force to compensate.
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
- No real phone/speakers were available overnight. Everything mobile was verified in Chrome
  device emulation (touch, rotation, layouts) and audio only for "no errors". Worth a quick
  check on a real Android/iOS phone: frame rate in late-game battles, audio loudness/mix,
  vibration, fullscreen + landscape lock (Android), pinch-zoom blocking (iOS).
- Run #2 additions worth a real-device look: upright iPhone in standalone (home-screen) mode —
  the rotated stage now honours the notch/home-bar insets (#159, only emulated); the Android
  launcher icon (new maskable icons, #174); frozen-lane frame rate during Fimbulwinter on a
  mid-range phone (#144, measured only in headless software raster).
- Design call made overnight (#125–127): melee meetings are now strictly side-symmetric and
  Guardian splash no longer stacks with Jötunn cleave / Titan slam; Jötunn's cleave was raised
  to full force to keep Guardians > Hunters at army scale. Revert the cleave buff in
  `src/sim/data.ts` if Asgard Guardians feel too strong.
- Difficulty: Novice is the default for a first game; Adept is tuned to be a fair fight for a
  player who uses counters + turrets. If it feels too easy/hard, `AI_PROFILES` in
  `src/ai/ai.ts` (think time, counterSkill, incomeMult) are the knobs.
