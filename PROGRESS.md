# PROGRESS — Local (Wi-Fi) multiplayer

Status: complete, in verification mode (since run #4, 2026-10-07 ~18:30)

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
- **Verified by:** 120 unit tests (incl. a simulated network), `scripts/mpsmoke.ts` (two Chrome
  profiles, desktop + phone, every flow; also `--latency 60 --jitter 80` and `--portrait`), a
  bot-vs-bot soak (`scripts/mpbot.ts --vs-bot`). Not tested on physical phones (see below).

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
- Measured: snapshots ≤ 12 kB in long battles; server sim 2.5 µs/tick (≈0.015% of a core per
  match). `mpsmoke` passes plain, with `--latency 60 --jitter 80`, and with `--portrait`.

## Decisions
- Single-player stays exactly as it was (AI, 2× speed, autosave). Multiplayer is a separate mode.
- Seats: the host is seat 0 (team 0). Everyone sees their own citadel on the left in blue.
- Either player can pause and either can resume (3 s countdown). Pauses are unlimited (LAN
  friends); an away player (app in background, link lost) pauses the battle for up to 90 s,
  then forfeits. Leaving mid-battle forfeits. No W/L records for online games (yet).
- Turns every 2 ticks (33 ms); hash every 60 ticks; commands apply on the server's next tick.
- Session token lives in sessionStorage (per tab): two tabs = two players (easy local testing),
  a reload of the same tab rejoins.
- Builds must match exactly: hello carries `simFingerprint()` (all balance tables + a 30 s
  scripted battle); a mismatch stops reconnecting and asks for a reload.
- While the battle is held (opponent away, countdown, reconnecting) the pause button / Esc opens
  the menu just locally, so the waiting player can always leave.

## Open questions for the human
- Real devices: everything was tested in Chrome (desktop + emulated phones, simulated lag), not
  on a physical iPhone/Android. Please try `npm run lan` → scan the QR code with an iPhone and an
  Android phone. Windows will show a firewall prompt for Node.js on first run: allow *private*
  networks. Safari's JavaScriptCore is expected to simulate identically (only exact IEEE math is
  used); if not, the build fingerprint / hash checks will report it (resync or refusal).
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
5. [ ] Online results aren't recorded anywhere (AI records are per difficulty); keep a small
   per-opponent tally (name → W/L) and show it in the room.
6. [ ] `src/ui/mpmenus.ts`: no way to rename yourself once in a room (only in the lobby).
7. [ ] `server/lobby.ts` `openRooms()`: for a public internet server the "open battles on this
   network" list must be scoped (e.g. by the client's public IP) — documented, not built.
