# PROGRESS

Status: **Phase 2 in progress** — 100 design iterations, one per lens of Jesse Schell's
*The Art of Game Design* (started run #5, 2026-10-12). Phase 1 (local Wi-Fi multiplayer) is
complete; its log follows below the lens plan.

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
- [ ] #4 Curiosity — peek at the next age (creatures/power) from the Ascend button
- [ ] #5 Endogenous Value — make gold/XP value felt (kill gold popups, bounty)
- [ ] #6 Problem Solving — surface the problem: enemy lane composition at your gate
- [ ] #7 The Elemental Tetrad — story is the weakest element: lore line per age on ascension
- [ ] #8 Holographic Design — whole-game pass: fix the most jarring inconsistency found
- [ ] #9 Unification — one theme everywhere (copy, names, AI foes)
- [ ] #10 Resonance — what resonates (gods/myths) → amplify
- [ ] #11 Infinite Inspiration — bestiary / codex with myth origins
- [ ] #12 The Problem Statement — problem statement in DESIGN.md + check features against it
- [ ] #13 The Eight Filters — run the filters; fix the weakest
- [ ] #14 Risk Mitigation — biggest risk → mitigate (real devices / network diagnostics)
- [ ] #15 The Toy — a toy-like sandbox / practice mode
- [ ] #16 The Player — who plays; first-run defaults / recommendations
- [ ] #17 Pleasure — completion pleasure: feats/achievements
- [ ] #18 Flow — suggest the right next difficulty
- [ ] #19 Needs — esteem: ranks/titles
- [ ] #20 Judgment — fair judgment: battle grade on results
- [ ] #21 Functional Space — lane space: pressure indicators
- [ ] #22 Dynamic State — show public state the player lacks (enemy XP / ascension)
- [ ] #23 Emergence — an emergent interaction between existing traits/powers
- [ ] #24 Action — a new meaningful verb (e.g. lane stance: hold / advance)
- [ ] #25 Goals — short-term goals inside a battle
- [ ] #26 Rules — rules clarity: in-game reference
- [ ] #27 Skill — measure/show skill (counter rate on results)
- [ ] #28 Expected Value — show values that inform choices (cards, blessings)
- [ ] #29 Chance — review randomness; add or tune
- [ ] #30 Fairness — mirror-symmetry test; AI income transparency
- [ ] #31 Challenge — challenge modifiers
- [ ] #32 Meaningful Choices — make an existing choice more meaningful
- [ ] #33 Triangularity — a risky high-reward option
- [ ] #34 Skill vs. Chance — balance check
- [ ] #35 Head and Hands — dexterity vs thought: input convenience
- [ ] #36 Competition — competitive comparison (stats on results)
- [ ] #37 Cooperation — cooperative element
- [ ] #38 Competition vs. Cooperation — balance of the two
- [ ] #39 Time — battle length options / pacing
- [ ] #40 Reward — rewards: unlocks / celebrations
- [ ] #41 Punishment — punishment & comeback
- [ ] #42 Simplicity/Complexity — progressive disclosure
- [ ] #43 Elegance — remove a wart
- [ ] #44 Character — AI foes as characters (personas, taunts)
- [ ] #45 Imagination — leave room for imagination (lore lines)
- [ ] #46 Economy — economy analysis & fix
- [ ] #47 Balance — per-creature balance from sims
- [ ] #48 Accessibility — colour-blind friendly team/class cues, text size
- [ ] #49 Visible Progress — progress across battles
- [ ] #50 Parallelism — parallel lanes: overview
- [ ] #51 The Pyramid — a pinnacle goal
- [ ] #52 The Puzzle — puzzle-like challenge scenarios
- [ ] #53 Control — input responsiveness / cancel
- [ ] #54 Physical Interface — gamepad support
- [ ] #55 Virtual Interface — HUD information
- [ ] #56 Transparency — declutter the interface
- [ ] #57 Feedback — feedback for counters/hits
- [ ] #58 Juiciness — more juice
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
