# Mythwar: Ages of Legend

A three-lane, mythological re-imagining of the Flash classic *Age of War*.
Summon creatures of legend into three lanes, out-counter your foe, hold the Ley Shrines,
ascend through five mythic ages — Fae Wilds, Olympus, Asgard, the Jade Empire and the
Celestial realm — and topple the enemy citadel.

Everything is procedural: all creatures, citadels and effects are drawn in code (Canvas 2D)
and all sound and music is synthesized with WebAudio. No asset files.

<a href="https://zahikusa.github.io/mythwar/"><img src="docs/play-qr.svg" width="132" align="right" alt="QR code: open the game on a phone"></a>

**▶ Play now: [zahikusa.github.io/mythwar](https://zahikusa.github.io/mythwar/)** — in any browser
on a PC, Mac, iPhone, Android phone or tablet. Nothing to install; scan the QR code with a phone.
For battles against a friend in the same Wi-Fi, see [Multiplayer](#multiplayer-same-wi-fi).

![Title screen over a live AI battle](docs/title.jpg)

| Jade Empire battle | Starfall in the Celestial age |
|---|---|
| ![Battle](docs/battle-jade.jpg) | ![Starfall](docs/starfall.jpg) |

| Phone (landscape thumb layout) | All 16 creatures (idle / walk / attack) |
|---|---|
| ![Mobile](docs/mobile.jpg) | ![Creatures](docs/creatures.jpg) |

## Install it as an app

The game at [zahikusa.github.io/mythwar](https://zahikusa.github.io/mythwar/) installs like an
app (own icon, fullscreen, landscape) and then also works offline. It updates itself.

- **iPhone / iPad:** open it in Safari → Share → *Add to Home Screen*.
- **Android:** open it in Chrome → ⋮ → *Add to Home screen* / *Install app*.
- **Windows / Mac:** Chrome or Edge → the install icon at the right of the address bar.

## Multiplayer (same Wi-Fi)

Battle a friend — PC, iPhone, Android, tablet, in any combination. One computer in the Wi-Fi
runs the small game server, and every device plays in its browser:

1. Download **mythwar-server-….zip** from the [latest release](https://github.com/Zahikusa/mythwar/releases/latest)
   on a Windows PC, Mac or Linux computer and unzip it.
2. Start it: **Windows** — double-click `Start Mythwar Server` (it offers to install
   [Node.js](https://nodejs.org/) if needed; if Windows warns about the file: *More info → Run
   anyway*; when the firewall asks, allow **private** networks). **macOS** — right-click
   `Start Mythwar Server.command` → *Open*. **Linux** — `sh start.sh`.
3. Scan the QR code it shows with each phone (or open the printed address in any browser).
4. **Multiplayer → Host a battle** on one device; the other scans the room's QR code or enters
   its code. Both press **Ready**.

From a checkout of this repository, `npm install` and `npm run lan` do the same (build + serve
on port 8787).

Battles survive app switches, Wi-Fi blips and reloads; leaving forfeits.
Details, troubleshooting (firewall!) and how it works: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

| Battle room: code + QR invite | The guest's phone: every player sees their own citadel on the left |
|---|---|
| ![Room](docs/mp-room.jpg) | ![Phone](docs/mp-phone.jpg) |

## How to play

- **Goal:** destroy the enemy citadel. Its health is shared by all three lanes — so is yours.
- **Summon:** pick a lane (click/tap it or the ▶ marker at your gate), then tap a creature card.
  Or drag a card straight onto a lane.
- **Counter:** Guardians (shield) beat Hunters (fang), Hunters beat Mystics (orb), Mystics beat
  Guardians. Hunters strike as packs, Guardians' sweeping blows break packs, and Mystics hang
  back behind the front line. The card marked **Counter!** answers what's in your selected lane.
- **Economy:** gold trickles in and comes from kills. Capture the **Ley Shrine** in a lane's centre
  (stand there with no foes nearby) for extra income until the enemy takes it back. Now and then a
  **Ley Surge** flares under one shrine: its holder earns a flood of gold for 20 seconds.
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
(over time and from shrines): Novice 50%, Adept 90%, Master 100%, Mythic 120%. Mythic also
mounts turrets before you reach its gates and keeps its blessings coming.

A scripted "smart" player (follows the Counter! badge, casts powers, builds turrets, buys
blessings, saves to ascend) wins about 100% / 67% / 25% / 5% of games against Novice / Adept /
Master / Mythic over 300+ games each (`node scripts/calib.ts smart mythic 300`).

## Development

```bash
npm install
npm run dev                      # http://localhost:5173 (+ multiplayer; phones: open the Network URL)
npm run build                    # static build in dist/
npm run preview                  # serve the production build
npm run lan                      # build + LAN server with QR code on port 8787
npm run package                  # the release's server package → release/mythwar-server-v<version>.zip
npm test                         # unit tests (simulation + AI)
npm run sim -- 20 master adept   # headless AI-vs-AI balance runs
node scripts/trace.ts 1003       # timeline of one headless match
node scripts/bots.ts 10          # AI difficulty vs scripted players (naive → "smart")
npm run smoke                    # end-to-end browser test (needs local Chrome)
npm run shoot -- desktop         # screenshots into screenshots/ (--list, --size 2560x1440)
node scripts/soak.ts 60 16       # long fast battles in Chrome: errors + fps
npm run verify                   # typecheck + unit tests + build + smoke + multiplayer smoke
node scripts/mpsmoke.ts --shots  # two browsers play an online battle (screenshots/mp/)
node scripts/enginecheck.ts      # the simulation is identical in V8, SpiderMonkey and JavaScriptCore
node scripts/mpbot.ts            # an AI opponent that joins online rooms
node scripts/playthrough.mjs 90  # casual scripted play through the real UI, screenshots/play/
node scripts/perf2.mjs 1600 900  # per-frame render cost (supports skipping render passes)
node scripts/classwar.ts         # equal-gold army battles per class and age
node scripts/calib.ts counter adept 90  # a scripted "follow the Counter! badge" bot vs an AI
node scripts/icons.mjs           # re-render PNG app icons (incl. maskable) from public/icon.svg
```

Battles autosave; "Continue" on the title screen resumes them.

Debug URLs: `?demo&ff=300&seed=5` (AI vs AI, fast-forwarded), `?play=adept`, `?screen=howto`,
`?gallery` (every creature's idle / walk / attack animation), `?mode=mobile`.

### Publishing

- Every push to `master` runs the typecheck and unit tests and publishes the game on GitHub Pages
  (`.github/workflows/pages.yml`, built with `npm run build:pages` — that build has no game
  server, so its multiplayer lobby links to the server download instead).
- A version tag publishes the server package as a GitHub release (`.github/workflows/release.yml`):
  raise `version` in package.json, commit, then `git tag v1.1.0 && git push origin master v1.1.0`.

Code map: `src/sim` (deterministic simulation and all balance data), `src/ai` (opponent),
`src/net` + `server/` (multiplayer client and server),
`src/render` (canvas renderer, creature art, effects), `src/ui` (HUD, menus, tips),
`src/audio` (synth), `DESIGN.md` (game design), `PROGRESS.md` (development log).
