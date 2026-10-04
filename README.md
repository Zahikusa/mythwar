# Mythwar: Ages of Legend

A three-lane, mythological re-imagining of the Flash classic *Age of War*.
Summon creatures of legend into three lanes, out-counter your foe, hold the Ley Shrines,
ascend through five mythic ages — Fae Wilds, Olympus, Asgard, the Jade Empire and the
Celestial realm — and topple the enemy citadel.

Everything is procedural: all creatures, citadels and effects are drawn in code (Canvas 2D)
and all sound and music is synthesized with WebAudio. No asset files.

![Title screen over a live AI battle](docs/title.jpg)

| Jade Empire battle | Starfall in the Celestial age |
|---|---|
| ![Battle](docs/battle-jade.jpg) | ![Starfall](docs/starfall.jpg) |

| Phone (landscape thumb layout) | All 16 creatures (idle / walk / attack) |
|---|---|
| ![Mobile](docs/mobile.jpg) | ![Creatures](docs/creatures.jpg) |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (open via any static web server)
npm run preview    # serve the production build
```

To try it on a phone, run `npm run dev` and open the **Network** URL it prints on a phone
in the same Wi-Fi (landscape recommended; portrait is rotated automatically).

The build is a static site with a web manifest and offline service worker, so it can be
installed as an app on phones ("Add to Home Screen"), which also locks landscape.

## How to play

- **Goal:** destroy the enemy citadel. Its health is shared by all three lanes — so is yours.
- **Summon:** pick a lane (click/tap it or the ▶ marker at your gate), then tap a creature card.
  Or drag a card straight onto a lane.
- **Counter:** Guardians (shield) beat Hunters (fang), Hunters beat Mystics (orb), Mystics beat
  Guardians. Hunters strike as packs, Guardians' sweeping blows break packs, and Mystics hang
  back behind the front line. The card marked **Counter!** answers what's in your selected lane.
- **Economy:** gold trickles in and comes from kills. Capture the **Ley Shrine** in a lane's centre
  (stand there with no foes nearby) for extra income until the enemy takes it back.
- **Read the enemy:** a gate's portal flares just before a creature steps out — watch the enemy
  gates to see which lane their next creature is coming down.
- **Ascend:** XP comes from kills, blows against the enemy citadel and time; with enough XP and a gold tithe you advance to the next age (new
  creatures, turrets, god power, stronger citadel). The final age adds the Elder Dragon.
- **God powers:** one per age, recharging. Tap it, then a lane.
- **Turrets & blessings:** a turret per lane on your gates; blessings are permanent upgrades.
- **Ragnarök:** at 18:00 (or 3 minutes after both sides reach the final age) the gate wards fall
  silent and damage to citadels grows every minute.

### Controls (desktop)

| Key | Action |
|---|---|
| 1 – 4 | Summon creature |
| W / S, ↑ / ↓, Q / A / Z | Select lane |
| Space | God power on the selected lane |
| U | Ascend |
| T / B | Turret / blessing panel |
| F | Toggle 2× speed |
| Esc / P | Pause |
| ? / H | Controls card |

On phones the creature cards sit under your left thumb and actions under your right; a
long-press on a card shows its details. Held upright, the game rotates into landscape.

## Difficulty

Novice, Adept, Master and Mythic AI opponents. They read lane threats, counter your creatures,
contest shrines, save up to ascend, build turrets, buy blessings and aim god powers. AI gold income
(over time and from shrines): Novice 70%, Adept 90%, Master 100%, Mythic 120%. Mythic also
mounts turrets before you reach its gates and keeps its blessings coming.

A scripted "smart" player (follows the Counter! badge, casts powers, builds turrets, buys
blessings, saves to ascend) wins about 100% / 67% / 21% / 2% of games against Novice / Adept /
Master / Mythic over 300+ games each (`node scripts/calib.ts smart mythic 300`).

## Development

```bash
npm test                         # unit tests (simulation + AI)
npm run sim -- 20 master adept   # headless AI-vs-AI balance runs
node scripts/trace.ts 1003       # timeline of one headless match
node scripts/bots.ts 10          # AI difficulty vs scripted players (naive → "smart")
npm run smoke                    # end-to-end browser test (needs local Chrome)
npm run shoot -- desktop         # screenshots into screenshots/ (--list, --size 2560x1440)
node scripts/soak.ts 60 16       # long fast battles in Chrome: errors + fps
npm run verify                   # typecheck + unit tests + build + smoke (use before commits)
node scripts/playthrough.mjs 90  # casual scripted play through the real UI, screenshots/play/
node scripts/perf2.mjs 1600 900  # per-frame render cost (supports skipping render passes)
node scripts/classwar.ts         # equal-gold army battles per class and age
node scripts/calib.ts counter adept 90  # a scripted "follow the Counter! badge" bot vs an AI
node scripts/icons.mjs           # re-render PNG app icons (incl. maskable) from public/icon.svg
```

Battles autosave; "Continue" on the title screen resumes them.

Debug URLs: `?demo&ff=300&seed=5` (AI vs AI, fast-forwarded), `?play=adept`, `?screen=howto`,
`?gallery` (every creature's idle / walk / attack animation), `?mode=mobile`.

Code map: `src/sim` (deterministic simulation and all balance data), `src/ai` (opponent),
`src/render` (canvas renderer, creature art, effects), `src/ui` (HUD, menus, tips),
`src/audio` (synth), `DESIGN.md` (game design), `PROGRESS.md` (development log).
