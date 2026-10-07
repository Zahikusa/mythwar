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
- [ ] MP1 Foundation: deps (`ws`, QR encoder), `src/net/protocol.ts`, world state hash,
      determinism tests (replay, serialize→deserialize mid-game continues identically).
- [ ] MP2 Server: rooms (codes, seats, reconnect tokens, open-games list), authoritative match
      loop (turns, hashes, pause on disconnect/away, forfeit timeout, rematch, leave), static
      file serving, Vite dev-server plugin so `npm run dev` also hosts. Integration tests with
      Node WebSocket clients.
- [ ] MP3 Client netcode: connection (reconnect with backoff, ping/RTT), `NetGame` (plays out
      server turns with a jitter buffer, sends commands with instant local pre-validation,
      verifies hashes, resyncs from snapshots).
- [ ] MP4 Game/App integration: AI-less game, no 2× speed, pause semantics, HUD/Input/Coach
      working with NetGame, results, no autosave for MP.
- [ ] MP5 Mirrored view: the player on the right side (team 1) sees their citadel on the left
      (renderer, input hit-testing, DOM overlays, own colour = blue).
- [ ] MP6 Multiplayer UI: name, host / join by code / open games list, QR code + link, waiting
      room, synced countdown, connection/ping indicator, opponent-away overlay, rematch.
- [ ] MP7 Phone robustness: visibility (app switch / lock) → away + fast resume, wake lock,
      fullscreen, iOS Safari quirks.
- [ ] MP8 `npm run lan`: build + serve on all interfaces, print LAN URLs + terminal QR, Windows
      firewall notes; README + docs/MULTIPLAYER.md.
- [ ] MP9 End-to-end: two Chrome pages (desktop + phone emulation) host/join/play/reconnect/
      finish; artificial latency/jitter/drop option on the server for testing.
- [ ] MP10 Verification + polish.

## Done
(nothing yet)

## Decisions
- Single-player stays exactly as it was (AI, 2× speed, autosave). Multiplayer is a separate mode.

## Open questions for the human
- Phone ↔ phone without any PC: needs one device to run the server. A browser cannot host; a
  future native wrapper (Capacitor) or the public online server would cover that.

## Improvement backlog
(filled once in verification mode)
