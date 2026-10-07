# PROGRESS — Local (Wi-Fi) multiplayer

Status: in progress (started run #4, 2026-10-07)

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
- [~] MP7 Phone robustness: away on visibilitychange/pagehide, reconnect nudge, wake lock
      (only on https/localhost), reload rejoins. Still to check: rotated portrait phone in MP.
- [ ] MP8 Docs: README + docs/MULTIPLAYER.md (setup, firewall, architecture, internet upgrade).
- [x] MP9 End-to-end: `scripts/mpsmoke.ts` (desktop + phone profiles, all flows), in verify.
- [ ] MP10 Verification + polish (bad-network run of mpsmoke, review all new code).

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

## Decisions
- Single-player stays exactly as it was (AI, 2× speed, autosave). Multiplayer is a separate mode.
- Seats: the host is seat 0 (team 0). Everyone sees their own citadel on the left in blue.
- Either player can pause and either can resume (3 s countdown). Pauses are unlimited (LAN
  friends); an away player (app in background, link lost) pauses the battle for up to 90 s,
  then forfeits. Leaving mid-battle forfeits. No W/L records for online games (yet).
- Turns every 2 ticks (33 ms); hash every 60 ticks; commands apply on the server's next tick.
- Session token lives in sessionStorage (per tab): two tabs = two players (easy local testing),
  a reload of the same tab rejoins.

## Open questions for the human
- Phone ↔ phone without any PC: needs one device to run the server. A browser cannot host; a
  future native wrapper (Capacitor) or the public online server would cover that.

## Improvement backlog
(filled once in verification mode)
