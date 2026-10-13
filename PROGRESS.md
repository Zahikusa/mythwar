# PROGRESS

Status: **Phase 2 in progress** — 100 design iterations, one per lens of Jesse Schell's
*The Art of Game Design* (started run #5, 2026-10-12). Phase 1 (local Wi-Fi multiplayer) is
complete; its log follows below the lens plan.

## Run #6 in short (for the morning)
- Lenses #45–#55 done (one commit each, reasoning in `docs/LENSES.md`). Highlights: battles are
  fought at named places (#45); **economy** probe `npm run economy` found blessings 4×
  underpriced — priced by worth, Mythic banks for them (#46); counter-triangle matrix
  (`classwar --matrix`) fixed Asgard's and Jade's limp counters (#47); **colour-blind setting**
  (foe in orange) + `shoot --cvd` simulation (#48); the title shows the whole ladder (#49);
  **each gate trains its own creature** — lanes train in parallel (#50); **Legend of the Ages**
  capstone feat (#51); **Riddles of war** — 4 hand-made puzzle battles, brute-forced by `npm run
  puzzlecheck` (#52); unaffordable taps **arm** a card to auto-summon (#53); **gamepad** support
  (#54); XP rings on the age badges (#55).
- Bug fixed: loading a progress code erased best star ratings.
- Rules changed (simFingerprint differs from run #5 builds): blessing prices, Fenrir/Jötunn/
  Kitsune/Byakko numbers, parallel training. designcheck passes (now 60 even battles; ladder
  ~100/60/7–20/0%, even battles 18.6–19.7 min); enginecheck: all engines identical.

## Run #5 in short (for the morning)
- Phase 2 started: lenses #1–#40 done, one commit each (`git log --oneline | grep Lens`), full
  reasoning per lens in `docs/LENSES.md`.
- Biggest additions: **co-op rooms** (two friends vs a server-run AI, #37) with tactical calls
  (#38); **handicaps** in rooms (#36); **hold the line** lane stance (#24); **Ley Surges** (#2)
  and **ley sight** (#22); **Quick battles** (#39); **Trials** (#31); **rush an age** (#33);
  **Sandbox** (#15); **Bestiary** (#11); **16+2 feats** (#17); **three-star rating** with live
  goals (#20, #25); **progress codes** PC ↔ phone (#19); Novice follows the player up the ages
  (#13); AIs bank for the Elder Dragon (#32); Zeus/Starfall targeting (#29, #34); brittle frost
  (#23); per-creature cries (#10); lore lines, age-tinted HUD, many smaller clarity fixes.
- Protocol is now v8 (trials, co-op, stance): server and pages must be from the same build
  (simFingerprint also changes with every balance/rule change, e.g. #46–#50).
- New tools: `npm run designcheck` (difficulty ladder, pacing, variety, side fairness — all
  pass: ladder 100/53/13/0% for the scripted player, even AI battles 19.2 min), `npm run
  perfcheck` (per-frame JS budget). Verified throughout with `npm run verify` (unit tests,
  smoke, multiplayer smoke incl. a co-op battle).

## Phase 2 — open issues found along the way
- (Resolved in run #6) The intermittent "IndexSizeError: arc radius is negative": caught with a
  stack at last (drawUnit → creature art → the outlined-circle helper). A creature's draw scale
  went slightly negative because the frame loop allowed a *negative* time step (`last` stamped
  with performance.now() after a slow start, `now` an earlier frame timestamp), running the
  summon-in animation backwards. dt is now clamped at 0, the spawn factor to [0, 1] and the art
  scale to > 0 (defensive). Watch the next smoke runs to confirm.
- The results screen at 1600×900 is close to its height budget (the smoke test clicks "Change
  foe"): new lines on it must share existing ones (done for surge gold, rewards).
- The smoke's "number key summons" check was timing-sensitive after #35 added a wheel step
  before it (a creature could leave the queue between the two reads); it now counts queued +
  summoned and tops up gold first.

- Pacing sits close to its limit: even AI battles 19.4–19.7 min median (limit 20). The
  30-battle median was too noisy to judge (±1 min from a one-point change), so designcheck now
  plays 60. A future lens that lengthens battles must pay it back.
- Pure-Mystic armies are the strongest single composition in `classwar --matrix` (only pure
  Hunters beat them) — the triangle working, but watch it (#47).

- perfcheck reads 1.97 ms of game JS per frame (budget 3 ms; renderer 1.81) — #14 measured
  0.93. Within budget, but find out what grew (Lens #92 Technology at the latest). Measured:
  the run-5 checkpoint (34752bb) does 1.64 ms on this machine today, run 6 ~1.85 ms (likely
  more creatures on the field with parallel training; the attract battle has no new callouts).

## Phase 2 — how each iteration works
- One iteration = one lens (numbering of the book's first edition / the 100-card deck).
  Ask the lens's questions about Mythwar, pick the **one most valuable concrete change** it
  reveals, build it, verify it, commit it as `Lens #N (Name): …`.
- The full reasoning per lens (questions, observations, change, verification) goes to
  `docs/LENSES.md`; the checklist below gets the one-line result.
- Verification per change: `npx tsc --noEmit` + `npx vitest run` always; `npm run smoke` for
  UI/app changes; `npm run mpsmoke` for app/net/sim changes; `npm run sim` / `node
  scripts/calib.ts` for balance changes. Simulation changes alter `simFingerprint()` (builds
  must match online — fine, both devices load the same server build).
- Single player keeps working with every new mechanic: the AI must use/handle it.
- Order: numeric. A lens whose idea turns out not to be worth it still gets a real change
  (a smaller one the lens points at) — never an empty iteration.

## Phase 2 — lens checklist (tentative idea → result)
- [x] #1 Essential Experience — essence written in DESIGN.md; every battle opens with "Topple their citadel — vs <foe>" + war horn
- [x] #2 Surprise — Ley Surges: a foretold, seeded shrine surge every 2–3 min (race for a flood of gold)
- [x] #3 Fun — "Rout! / Slaughter! / Annihilation! ×N" callouts + brass stab when 4+ foes fall in a lane within 2.5 s
- [x] #4 Curiosity — Ascend preview of the next age; never-reached ages are glowing silhouettes and "???"
- [x] #5 Endogenous Value — unaffordable cards show a savings bar and "in Ns" from your current income
- [x] #6 Problem Solving — setting to switch off the "Counter!" advice so experts solve the counter puzzle themselves
- [x] #7 The Elemental Tetrad — story was the weak element: a lore line per age under the opening and ascension banners
- [x] #8 Holographic Design — seams between systems: results count Ley Surge gold, tip for lost surges, tip respects the advice setting
- [x] #9 Unification — theme written down; the HUD (cards, action buttons) takes on each age’s accent colour
- [x] #10 Resonance — the legends are the resonant core: each of the 16 creatures answers the summons with its own synthesized cry
- [x] #11 Infinite Inspiration — a Bestiary (title + pause): every creature with the real myth behind it; unreached ages hidden
- [x] #12 The Problem Statement — problem + 4 measurable success criteria in DESIGN.md; `npm run designcheck` measures them (all pass)
- [x] #13 The Eight Filters — weak filter = audience: newcomers never saw the ages; Novice now follows the player up the ages
- [x] #14 Risk Mitigation — risk register; `npm run perfcheck` guards the per-frame JS budget (0.93 of 3 ms) as effects are added
- [x] #15 The Toy — Sandbox: no foe, endless gold, unbreakable citadels, summon for either side (X)
- [x] #16 The Player — "Start here" / "Next challenge" ribbon on the easiest foe not beaten yet
- [x] #17 Pleasure — pride in accomplishment was missing: 15 Feats, toasts, results line, title chip + list
- [x] #18 Flow — win/loss runs per foe; results offer "Face the <next>" after a win, the easier foe after 3 defeats in a row
- [x] #19 Needs — safety: progress codes carry records/feats/ages between devices (merging, never losing)
- [x] #20 Judgment — three-star rating with reasons (victory, citadel above half, par time); best per foe on its card
- [x] #21 Functional Space — each gate's reach (ward or turret range) drawn as a dashed line that lights up with foes inside
- [x] #22 Dynamic State — ley sight: holding a lane's shrine reveals the foe's queued summons for that lane
- [x] #23 Emergence — brittle: frozen creatures take +50% damage from everything (Fimbulwinter becomes a setup)
- [x] #24 Action — new verb: hold the line (per-lane stance at the shrine, G / shield button, war banner)
- [x] #25 Goals — star goals live in the pause menu, toasts when the citadel or par star slips
- [x] #26 Rules — new rules were only in coach tips: how-to page 6 "Tactics" (hold the line, ley sight, brittle frost)
- [x] #27 Skill — countering measured: "creature damage that countered" on results + a tip for poor counterers
- [x] #28 Expected Value — blessings show their next rank's worth in concrete numbers (dps for your army, health, citadel)
- [x] #29 Chance — Starfall's meteors weighted toward crowds (was uniform per foe: stragglers soaked stars)
- [x] #30 Fairness — mirrored side-bias test for the phase-2 mechanics; the AI's income handicap shown by its name on the results
- [x] #31 Challenge — Trials: Glass Citadel, Godless, No Walls (any foe; feat for all three)
- [x] #32 Meaningful Choices — the dragon is a real choice (equal-gold tests) the AI never made; able AIs now save for it in calm moments
- [x] #33 Triangularity — rush an age with 75% of the XP for a double tithe (risky early age vs safe wait)
- [x] #34 Skill vs. Chance — Wrath of Zeus strikes the foes nearest your citadel first (was random)
- [x] #35 Head and Hands — head game, hands need efficiency: mouse wheel steps the selected lane
- [x] #36 Competition — novices couldn't compete with expert friends: per-player handicaps (trials) in the battle room (protocol v7)
- [x] #37 Cooperation — co-op rooms: two friends share one side against a server-run AI (lockstep, protocol v8)
- [x] #38 Competition vs. Cooperation — both ends of the scale now; co-op gets tactical calls ("Help top!" lights the lane on the ally's screen)
- [x] #39 Time — turrets fire at half rate in Ragnarök (pacing back to 19.2 min); Quick battle option (~10 min)
- [x] #40 Reward — "New best vs <foe>: ★★★" on the results; title laurels show each foe's best stars
- [x] #41 Punishment — a power cast into an empty lane is refused (charge kept) instead of silently wasted
- [x] #42 Simplicity/Complexity — progressive disclosure: newcomers see the hold shields when the coach introduces them (2:30)
- [x] #43 Elegance — results tip and next-foe button no longer say the same thing: the tip points at the missing star
- [x] #44 Character — the AI difficulties are generals with a voice: Puck, Hippolyta, Odin, Ares (taunts at key moments)
- [x] #45 Imagination — every battle is fought at a named place from its seed ("The Battle of Weeping Ford"): banner, pause, results, shared result
- [x] #46 Economy — `npm run economy`; blessings were 4× underpriced (free Might = 80% wins): priced by worth, Mythic banks for them; "fallen creatures feed the foe" told (how-to, results tip)
- [x] #47 Balance — counter matrix (`classwar --matrix`): Asgard G>H (+0.09) and Jade H>M (+0.26) were limp; Fenrir lifesteal ⅕, Jötunn +8% hp, foxfire leaps 40%, Byakko +10% hp → +0.43–0.48 like other ages
- [x] #48 Accessibility — `shoot --cvd` simulation: class cues safe (icons), but the foe turned grey for protanopes; Colour-blind friendly setting (foe in orange)
- [x] #49 Visible Progress — the title shows the whole ladder of generals (unbeaten ones dimmed with ☆☆☆), not only the beaten ones
- [x] #50 Parallelism — one trainer for three gates blocked emergencies (4.9 s waits, p90 12 s): each gate now trains its own creature (queue of 5 in all)
- [x] #51 The Pyramid — capstone feat "Legend of the Ages" (★★★ vs every general) heads the feats with per-general progress; fixed progress codes dropping stars
- [x] #52 The Puzzle — Riddles of war: 4 hand-made one-question battles (fixed purse, foe on the field), brute-forced so only a few answers win
- [x] #53 Control — tapping a card you cannot afford yet arms it: it summons itself once the gold is there (tap again to cancel)
- [x] #54 Physical Interface — gamepads: face buttons summon the cards as they sit on the pad (X A B, Y), D-pad lanes, shoulders power/hold/ascend/undo; menus by D-pad + A/B
- [x] #55 Virtual Interface — the age race was invisible until the foe could ascend: XP rings around both age badges
- [x] #56 Transparency — the foe screen hides the Trials (handicaps) until a first victory
- [x] #57 Feedback — countered blows glance off (grey puff, dull tock); "Effective!" / "Resisted" over your creatures now and then
- [x] #58 Juiciness — a blessing is felt on the field: shockwaves and flashes through the blessed army (Bastion: the gates)
- [ ] #59 Channels and Dimensions — map info to new channels (low-HP heartbeat)
- [ ] #60 Modes — mode clarity (targeting)
- [ ] #61 The Interest Curve — battle pacing / music intensity
- [ ] #62 Inherent Interest — spectacle moments
- [ ] #63 Beauty — art polish
- [ ] #64 Projection — player identity (banner/colour)
- [ ] #65 The Story Machine — battle chronicle on results
- [ ] #66 The Obstacle — obstacles worth overcoming
- [ ] #67 Simplicity and Transcendence — a transcendent power moment
- [ ] #68 The Hero's Journey — a short campaign path
- [ ] #69 The Weirdest Thing — fix the weirdest thing
- [ ] #70 Story — story framing
- [ ] #71 Freedom — custom battle options
- [ ] #72 Indirect Control — guide via visuals
- [ ] #73 Collusion — a guide character
- [ ] #74 The World — world lore
- [ ] #75 The Avatar — the player's avatar (patron god)
- [ ] #76 Character Function — creature roles
- [ ] #77 Character Traits — creature personality
- [ ] #78 The Interpersonal Circumplex — rival personalities
- [ ] #79 The Character Web — relationships between characters
- [ ] #80 Status — status among players
- [ ] #81 Character Transformation — veteran creatures
- [ ] #82 Inner Contradiction — character depth
- [ ] #83 The Nameless Quality — feel polish
- [ ] #84 Friendship — multiplayer friendship tools (copy invite link)
- [ ] #85 Expression — player expression
- [ ] #86 Community — share results
- [ ] #87 Griefing — online griefing (pause abuse)
- [ ] #88 Love — care for the details
- [ ] #89 The Team — contributor guide
- [ ] #90 Documentation — design doc refresh
- [ ] #91 Playtesting — playtest kit / local stats
- [ ] #92 Technology — performance/tech improvement
- [ ] #93 The Crystal Ball — roadmap
- [ ] #94 The Client — what the client (owner) needs
- [ ] #95 The Pitch — pitch / store text
- [ ] #96 Profit — sustainability notes
- [ ] #97 Transformation — what players take away
- [ ] #98 Responsibility — healthy play / privacy
- [ ] #99 The Raven — step back: biggest remaining issue
- [ ] #100 Your Secret Purpose — final reflection

# Phase 1 — Local (Wi-Fi) multiplayer (complete)

Status: complete (verification mode since run #4, 2026-10-07; backlog below still open for spare time)

## Run #4 in short (for the morning)
- **Multiplayer over the local Wi-Fi works end to end:** `npm run lan` → open the printed
  address / scan the QR code on each device → Multiplayer → Host / Join (code, QR, or the
  "open battles on this network" list) → both Ready → 3-2-1 → battle. PC, iPhone, Android in
  any combination (plain browsers; nothing platform-specific). See docs/MULTIPLAYER.md.
- **Architecture:** authoritative Node server (rooms + the same deterministic simulation,
  60 Hz) + lockstep replicas in the browsers fed by "turns"; hashes every second, snapshots for
  reconnect / reload / desync. Ready for an internet server later (wss, room codes, versioned
  protocol + rules fingerprint).
- **Robust:** app switches / screen lock (battle waits, 90 s to return), Wi-Fi blips
  (auto-reconnect + snapshot), reload mid-battle, missed endings, quitting offline, duplicated
  tabs, version mismatches, laggy networks (adaptive jitter buffer).
- **Polish:** shared pause, 3-2-1 countdowns, opponent-away banner with forfeit timer and a
  "Claim victory" after 20 s, quick messages (emotes), ping per seat in the room and a
  connection badge in battle, orders in flight shown at once (gold, faded queue chips),
  per-opponent records, rename in the room, chimes, fullscreen on Ready for phones.
- **Verified by:** 128 unit tests (incl. a simulated network), `scripts/mpsmoke.ts` (two Chrome
  profiles, desktop + phone, every flow; also `--latency 60 --jitter 80` and `--portrait`),
  `scripts/enginecheck.ts` + `scripts/mpengines.ts` (V8, SpiderMonkey and JavaScriptCore/WebKit
  simulate identically; online Chrome/Firefox vs WebKit battles stay in sync), bot-vs-bot soaks
  (`scripts/mpbot.ts --vs-bot --debug`). Not tested on physical phones (see below).

Task (TASK.md): play a polished, stable match against another human on the same WLAN, across
PC ↔ phone and iOS ↔ Android, built so it can later be upgraded to public online multiplayer.

The single-player development log (runs #1–#3) moved to `docs/PROGRESS-singleplayer.md`.

## Architecture decision (run #4)
**Authoritative Node WebSocket server + deterministic lockstep clients.**
- One small Node server (`server/`) serves the built game *and* hosts multiplayer rooms over a
  WebSocket (`/mp`). Run it on any PC in the Wi-Fi (`npm run lan`); every device — Windows/Mac
  browser, iPhone Safari, Android Chrome — just opens the printed URL (or scans the QR code).
  No app store, no install, nothing platform-specific ⇒ PC ↔ phone and iOS ↔ Android for free.
- The server owns the clock: it runs the same deterministic simulation (`src/sim`, imported
  directly — Node 24 strips the TS types), applies both players' commands at a tick of its
  choosing and broadcasts "turns" (`{tick, commands}`) a few times per tick-batch. Clients replay
  the identical simulation from those turns, with a small adaptive jitter buffer, so they see the
  exact same battle with only commands on the wire (tiny bandwidth, works on bad Wi-Fi).
- Because the server has the true state it can: validate every command (no cheating via the
  client), send a full snapshot to a client that reconnects (phone locked, app switched, Wi-Fi
  blip) or that ever desyncs (periodic state hashes are compared), pause the match while a player
  is away and award the win if they never come back.
- Why not WebRTC peer-to-peer: needs a signalling server anyway; LAN ICE between phones relies on
  mDNS candidates, which is flaky (esp. Android ↔ iOS, routers with multicast off); and a
  browser can't keep hosting while a phone is backgrounded. Why not pure state streaming: much
  more bandwidth and the renderer is built around sim events; lockstep keeps every effect.
- Determinism check: the sim only uses + − × ÷, Math.min/max/abs/floor/round/imul (all exactly
  specified in IEEE/ECMAScript, identical in V8 and JavaScriptCore) and its own seeded RNG — no
  Math.sin/exp/pow whose last bits may differ between engines. Hash checks catch anything else.
- Upgrade path to the internet: deploy the same server behind TLS (the client uses `wss://` on
  https pages automatically, or a configured server URL), room codes already work across
  networks; add accounts/matchmaking later. Protocol is versioned.

## Distribution (2026-10-08)
- Public repo https://github.com/Zahikusa/mythwar (`master`). Every push to master runs typecheck +
  unit tests and publishes the game on GitHub Pages: https://zahikusa.github.io/mythwar/ (single
  player on any device, installable, offline). That build (`npm run build:pages`, `.env.pages`)
  has no game server, so its multiplayer lobby explains how to start one and links the download.
- A version tag (`v1.0.0`, must match package.json) publishes `mythwar-server-v<version>.zip`
  as a release (`npm run package`): server bundled into one `server.mjs` (ws included, Node 20+),
  the normal LAN build in `game/`, double-click starters for Windows (offers `winget install`
  of Node.js) and macOS, `start.sh`, README.txt. Tested: unzipped with Expand-Archive, started via
  the .cmd, two bots battled over it with 0 desyncs.

## Milestones
- [x] MP1 Foundation: deps (`ws`, `qrcode-generator`), `src/net/protocol.ts`, `src/sim/hash.ts`,
      determinism tests (replay, snapshot mid-battle continues identically).
- [x] MP2 Server (`server/`): lobby (codes, open-room list, seats, reconnect tokens), match loop
      (turns, hashes, away/pause/resume countdown, forfeit timeout, rematch), validation, ws
      transport (heartbeat, lag simulation), static server, Vite dev/preview plugin.
- [x] MP3 Client netcode: `Connection` (backoff, pings, dead-link detection), `MpClient`
      (session per tab), `NetGame` (jitter buffer with eased playback clock, hash checks,
      snapshot resync, in-flight-aware order checks). Tests on a simulated network.
- [x] MP4 App integration (AI-less Game, no 2x, shared pause, no autosave, results).
- [x] MP5 Mirrored view for team 1 (canvas mirror, readable text, blue = you, input/HUD
      unchanged because the lane layout is symmetric; stereo panning follows).
- [x] MP6 Multiplayer UI (lobby, room + QR invite, countdown, overlays, ping badge, rematch).
- [x] MP7 Phone robustness: away on visibilitychange/pagehide, reconnect nudge, wake lock
      (only on https/localhost), reload rejoins, upright (rotated) phones (`mpsmoke --portrait`).
- [x] MP8 Docs: README + docs/MULTIPLAYER.md (setup, firewall, architecture, internet upgrade).
- [x] MP9 End-to-end: `scripts/mpsmoke.ts` (desktop + phone profiles, all flows), in verify.
- [x] MP10 Verification + polish (bad-network e2e, fresh-eyes review: 7 defects fixed).

## Done
- Server: `server/main.ts` (LAN entry, prints addresses + terminal QR), `server/net.ts`
  (ws attach), `server/lobby.ts`, `server/match.ts`, `server/validate.ts`, `server/static.ts`,
  `server/lan.ts`, `server/qr.ts`. `npm run lan` = typecheck + build + serve on :8787.
- Client: `src/net/{protocol,connection,client,netgame}.ts`; UI `src/ui/{mpmenus,netoverlay}.ts`,
  `src/ui/mp.css`; App wiring in `src/app.ts` (section "Multiplayer").
- Tests: `tests/determinism.test.ts`, `tests/server.test.ts` (fake clock + one real socket),
  `tests/netgame.test.ts` (simulated network: latency, jitter, dead links, desync repair).
  `node scripts/mpsmoke.ts [--shots] [--latency 60 --jitter 80]` (screenshots → screenshots/mp).
- Jitter buffer on a simulated 20–140 ms Wi-Fi: 99% of frames advance exactly one tick.
- Bot soaks (`node scripts/mpbot.ts --vs-bot --debug` against `node server/main.ts --latency 30
  --jitter 40`): a desync turned up after a few minutes; the --debug replay diff showed both
  replicas missing one order — the lag *simulator* reordered messages (one setTimeout per
  message). Fixed (ordered queue); clients now also resync at once on any out-of-order turn.
  After the fix: a full 18-minute bot battle + rematch over 30–70 ms lag with 0 desyncs (the two
  runs still on the old simulator showed 1–6).
- Second fresh-eyes review (run #4, ~20:30): 9 findings, all fixed — forged X-Forwarded-For
  (now the proxy's own rightmost entry; header addresses never get the LAN exemption), per-address
  session/room quotas with idle eviction, room lists throttled to 4/s, a battle starting in a
  hidden tab now counts as away, room list resubscribed after an offline leave, snapshots carry
  fresh away timers and running countdowns, orders pending at a pause are dropped consistently,
  emote ids type-checked, static server compresses asynchronously / caches one version per file /
  can't crash on a vanishing file, IPv6 /64 grouping expands "::".
- Cross-engine: `scripts/enginecheck.ts` (same AI battle in Node, Chrome, Firefox, WebKit —
  identical hashes over 25-minute battles), `scripts/mpengines.ts` (online Chrome/Firefox host vs
  WebKit guest: 0 desyncs). Playwright browsers live in node_modules (PLAYWRIGHT_BROWSERS_PATH=0).
- Measured: snapshots ≤ 12 kB in long battles; server sim 2.5 µs/tick (≈0.015% of a core per
  match). `mpsmoke` passes plain, with `--latency 60 --jitter 80`, and with `--portrait`.

## Decisions
- Single-player stays exactly as it was (AI, 2× speed, autosave). Multiplayer is a separate mode.
- Seats: the host is seat 0 (team 0). Everyone sees their own citadel on the left in blue.
- Either player can pause and either can resume (3 s countdown). Pauses are unlimited (LAN
  friends); an away player (app in background, link lost) pauses the battle for up to 90 s,
  then forfeits (after 20 s the waiting player may claim the win). Leaving mid-battle forfeits. No W/L records for online games (yet).
- Turns every 2 ticks (33 ms); hash every 60 ticks; commands apply on the server's next tick.
- Session token lives in sessionStorage (per tab): two tabs = two players (easy local testing),
  a reload of the same tab rejoins.
- Builds must match exactly: hello carries `simFingerprint()` (all balance tables + a 30 s
  scripted battle); a mismatch stops reconnecting and asks for a reload.
- While the battle is held (opponent away, countdown, reconnecting) the pause button / Esc opens
  the menu just locally, so the waiting player can always leave.

## Open questions for the human
- Gamepad support (Lens #54) is tested with a stubbed standard-layout pad only; please try a real
  controller (PC browser, or paired to a phone).
- Real devices: tested in Chrome (desktop + emulated phones, simulated lag) and with Playwright's
  WebKit (JavaScriptCore, iPhone's engine) and Firefox — full battles hash identically on all
  engines, and Chrome/Firefox vs WebKit online battles stayed in sync — but not on a physical
  iPhone/Android. Please try `npm run lan` → scan the QR code with both phones. Windows shows a
  firewall prompt for Node.js on first run: allow *private* networks.
- Screen wake lock only works on https/localhost; on `http://192.168…` phones may auto-lock
  during long pauses (the battle then waits for them as "away"). An https setup (self-signed
  certificate) would fix that but makes browsers show warnings — not done.
- Phone ↔ phone without any PC: needs one device to run the server. A browser cannot host; a
  future native wrapper (Capacitor) or the public online server would cover that.

## Improvement backlog
(verification mode: complete ≥ 2 per run, verify with `npm run verify`, commit, add findings.)
1. [x] `src/net/netgame.ts` / `src/ui/hud.ts`: the gold counter shows the replica's gold, so after
   a tap it drops only when the order comes back (~50–100 ms, longer on bad Wi-Fi) — show gold
   minus orders in flight.
2. [x] `server/lobby.ts`: two players can have the same name (random names collide, or both
   type "Player") — "Ada vs Ada" is confusing; suffix duplicates in a room.
3. [x] `scripts/mpsmoke.ts`: no end-to-end check of a server restart (clients should land in
   the lobby with the "server restarted" note) or of the version-mismatch screen. (Restart now
   covered end to end; version mismatch by unit tests.)
4. [x] `src/net/netgame.ts`: a device that keeps desyncing (would mean a real engine difference)
   resyncs every second silently; count it and tell the player / log it after a few. (Logged
   with both hashes; a one-time notice after 3.)
5. [x] Online results aren't recorded anywhere (AI records are per difficulty); keep a small
   per-opponent tally (name → W/L) and show it in the room.
6. [x] `src/ui/mpmenus.ts`: no way to rename yourself once in a room (only in the lobby).
7. [x] `server/lobby.ts` `openRooms()`: for a public internet server the "open battles on this
   network" list must be scoped (e.g. by the client's public IP) — documented, not built.
8. [x] `server/main.ts`: no https option. Phones only allow the screen wake lock (and PWA
   install) on https; `--cert/--key` flags (user-supplied or mkcert certificate) would enable it.
9. [x] `server/main.ts` / `server/lobby.ts`: log lines have no timestamps — hard to match a
   player's "it froze at 8 pm" to the log.
10. [x] `scripts/mpsmoke.ts`: the mirrored phone only taps a card; dragging a card onto a lane
    and opening a turret slot by tapping its own (left) gate aren't covered for team 1.
11. [x] `src/ui/hud.ts`: on desktop the opponent's name only appears in the small badge under
    the clock; their HP bar / age badge (right) doesn't say who it is.
12. [x] Upright phones: typing a name / room code while the stage is rotated opens the keyboard
    sideways — the lobby could suggest turning the phone, or un-rotate the lobby.
13. [x] `src/ui/hud.ts`: a summon appears in the queue only when the server echoes it (one RTT
    + buffer later); show orders in flight as faded "pending" chips right away.
14. [x] `src/ui/hud.ts` netinfo: on unstable Wi-Fi the jitter buffer (and so input delay) can
    grow towards 0.5 s silently; the badge only reflects RTT. Flag "unstable" from bufferMs too.
15. [x] `scripts/mpsmoke.ts` drives the UI only in Chrome; WebKit is covered for the
    simulation/netcode (`mpengines`) but not for the touch UI flows (lobby, room, drag).
16. [x] `server/lobby.ts`: no caps on rooms / sessions / connections per IP — fine on a LAN, needed
    before a public server (part of the internet upgrade).
17. [x] `server/match.ts` / `src/ui/netoverlay.ts`: the claim delay (20 s) is a client-side
    constant mirrored on the server; send `claimIn` with the pause state like `forfeitIn`, so the
    server alone decides (and tests can shorten it — mpsmoke waits 20 s today).
18. [x] `server/static.ts`: no gzip/brotli — irrelevant on Wi-Fi, but the ~300 kB bundle would
    load 3× faster from an internet server.
19. [x] README shows no multiplayer screenshots (room with QR code, mirrored phone view).
20. [x] `src/ui/netoverlay.ts`: the Claim victory button gives no click sound / haptic like the
    other buttons.
21. [x] Online battles have no way to say anything: quick emotes ("Good luck!", "Well played!",
    "Oops!", "Wow!") relayed by the server and shown by the sender's citadel.
22. [x] `server/main.ts`: if port 8787 is taken it just exits; it could try the next ports.
23. [x] The room doesn't show either player's connection quality before the battle; show each
    seat's ping so players can spot a weak Wi-Fi spot before starting.
24. [x] Results screen overflowed laptop-height windows (1366×768: title cut off, buttons below
    the fold, single player too) — found by the e2e run; now a side-by-side layout up to 860 px
    high and `justify-content: safe center` so overflow scrolls instead of clipping.
25. [ ] Online results screen: no way to say "Well played!" after the battle (emotes only exist
    in battle); a small emote row on the results would fit the rematch flow.
26. [x] `server/main.ts`: no `--help`; the flags (--port, --cert/--key, --trust-proxy,
    --latency/--jitter, --dir, --quiet) are only documented in the file header / docs.
27. [x] Settings: no switch to hide the opponent's quick messages (rate-limited, but some players
    will want them off).
28. [x] package.json: the new tools (mpbot, enginecheck, mpengines) have no npm script aliases.
29. [ ] `scripts/mpsmoke.ts`: nothing checks that a battle starting while a tab is hidden makes
    that player "away" (fixed in app.ts after the second review, untested end to end).
30. [ ] `src/ui/hud.ts`: the quick-message picker stays open when you tap elsewhere, open a panel
    or pause.
31. [ ] Battle room: no "Copy link" button — on a desktop the invite is easier to paste into a
    chat than to read off the screen.
32. [x] docs/MULTIPLAYER.md troubleshooting doesn't cover "the page loads on the phone but the
    lobby stays on Connecting…" (WebSocket blocked: some guest Wi-Fis / proxies / VPN apps).
