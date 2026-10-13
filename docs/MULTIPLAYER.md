# Multiplayer (local Wi-Fi)

Play a battle against another person on the same Wi-Fi — PC against phone, iPhone against
Android, tablet against laptop. Nothing to install on the devices: they open the game in the
browser.

## Quick start

One computer in the Wi-Fi (Windows, macOS or Linux) runs the game server. Either:

- **Ready-to-run package** (no build, only [Node.js](https://nodejs.org/) 20+): download
  `mythwar-server-v….zip` from the [latest release](https://github.com/Zahikusa/mythwar/releases/latest),
  unzip it and start it — Windows: double-click `Start Mythwar Server` (offers to install Node.js
  if it's missing); macOS: right-click `Start Mythwar Server.command` → *Open*; Linux: `sh start.sh`.
- **From this repository** (Node.js 24+):

  ```bash
  npm install
  npm run lan
  ```

Either way it prints something like:

```
  Mythwar is running.

  On this computer:   http://localhost:8787/
  Other devices in this Wi-Fi:
    http://192.168.1.105:8787/

  Scan to open on a phone:
    ▄▄▄▄▄▄▄ ...
```

1. **Player 1** opens the game (on the computer, or on a phone via the address / QR code) and
   chooses **Multiplayer → Host a battle**. The battle room shows a **room code** and a
   **QR code**.
2. **Player 2** scans that QR code with the phone's camera (or opens the address and types the
   code, or taps the room under **Open battles on this network**).
3. Both press **Ready**. After a 3-2-1 countdown the battle begins.

Each player always sees their own citadel on the left, in blue.

**Co-op:** in the room, "Battle: Together vs Novice / Adept / Master / Mythic" makes it a
cooperative battle — both players share the left citadel and its gold against an AI that the
server runs (its orders go to both devices like a player's, so nothing can drift). Either ally
can step away (or leave) and the other fights on; the battle waits only when both are gone.

**Handicaps:** a stronger player can take trials in the room ("Your handicap": Glass Citadel,
Godless, No Walls) so a newer friend has a real chance. Both players see each other's handicaps,
and changing them takes both out of Ready, so nobody starts against handicaps they haven't seen.

**Who's who:** each seat shows the player's standing from their own single-player journey
(Recruit → Warden → Champion → Warlord → Conqueror → Legend) and their sigil flies on their keep
in battle. The lobby lists rooms of people you have battled before first, with your record
together, and the **Champions of this network** line under the open battles counts every
head-to-head battle won and lost on this server (and co-op victories), kept across restarts
(battles between two tabs of one browser don't count).

During development `npm run dev` hosts rooms as well (open the "Network" address Vite prints).
`npm run serve` serves an existing build without rebuilding; `node server/main.ts --port 9000`
picks another port.

## If the other device can't connect

- **Firewall (Windows):** the first `npm run lan` asks whether Node.js may communicate on
  networks — allow it for **private networks**. If you dismissed it: Windows Security →
  Firewall & network protection → Allow an app through firewall → Node.js (Private).
  Also check that the Wi-Fi is set to a *Private* network profile, not *Public*.
- **Same network:** both devices must be on the same Wi-Fi. Guest networks and some
  public/hotel Wi-Fis isolate devices from each other ("AP/client isolation"); a phone hotspot
  works fine (the computer joins the phone's hotspot).
- **The right address:** use the `192.168.x.x` / `10.x.x.x` address, not `localhost`. Computers
  with VPNs or virtual adapters may print several; the first one is usually right.
- **The page loads, but the lobby stays on "Connecting to the game server…"** (later "Can't
  reach the game server — still trying…"): the page came through, the live
  connection (WebSocket) didn't. VPN apps, ad blockers that filter traffic, company proxies and
  some guest Wi-Fis do that — switch the VPN off or try another Wi-Fi / the phone's hotspot.
- In the lobby the dot next to *Connected* turns red and a help box appears when the game
  server can't be reached.
- The game on GitHub Pages (`zahikusa.github.io/mythwar`) has no game server behind it; its
  multiplayer screen links to the server download. Open the address the server prints instead.

## What happens when…

| Situation | Behaviour |
|---|---|
| A player switches apps / locks the phone | The battle pauses for both ("… is away"). When they come back it resumes after a 3-2-1 countdown. After **90 s** away they forfeit — or after 20 s the other player may **claim the victory** instead of waiting. |
| Wi-Fi drops for a moment | The client reconnects on its own (backoff 0.25–3 s), receives a snapshot of the battle and carries on. The other player sees the same away pause meanwhile. |
| A player reloads the page | The tab remembers its session: it rejoins the room and the battle where it was. |
| The battle ended while a phone was offline | On reconnect it is shown how the battle ended (final state and result). |
| A player quits while offline | Leaving the battle / room is delivered when the connection returns; they are not pulled back in. (Closing Multiplayer altogether while offline simply lets the seat time out.) |
| The same game is opened in another tab | A duplicated tab starts its own session; if one session is taken over elsewhere, the old tab says so and stops reconnecting. |
| A player presses Pause | The battle pauses for both; either player can resume. Each player has **3 pauses per battle** (so nobody can grief with a pause/resume loop); after that Pause opens the menu just for them and the battle goes on. Being away is not capped. |
| A player leaves the battle | They forfeit; the other player wins. The room stays open for a new opponent. |
| After a battle | Both press **Rematch** to play again in the same room (wins are counted). |
| The game server restarts | Clients notice their session is gone and return to the lobby. |
| Old page against a newer server | The client is told to reload: the protocol version **and** a fingerprint of the game rules (balance tables + a short scripted battle) must match. |

Phones keep their screen on during a battle where the browser allows it (Screen Wake Lock
needs `https` or `localhost`; on a plain `http://192.168…` address the system's auto-lock
applies — the away pause covers that).

### Optional: https on the LAN

With a certificate the server speaks https/wss, which also lets phones keep the screen awake
and install the game as an app. The easiest trusted certificate comes from
[mkcert](https://github.com/FiloSottile/mkcert) (install its root certificate on the phones):

```bash
mkcert 192.168.1.105 localhost          # → 192.168.1.105+1.pem and 192.168.1.105+1-key.pem
npm run build
node server/main.ts --cert "192.168.1.105+1.pem" --key "192.168.1.105+1-key.pem"
```

A self-signed certificate works too, but every device has to click through a warning first.

## How it works

```
 Phone (Safari)          PC (Chrome)            Phone (Chrome)
   NetGame  ◀──turns──┐  NetGame             ┌──turns──▶  NetGame
   replica    ──cmd──▶│                      │◀──cmd──    replica
                      └──── Node server ─────┘
                        rooms · authoritative simulation · 60 Hz clock
```

- **One server, plain browsers.** `server/` is a small Node program: it serves the built game
  and accepts WebSocket connections on `/mp`. Every platform with a modern browser can play;
  nothing is platform-specific.
- **Deterministic lockstep with an authoritative server.** The simulation (`src/sim`) is
  deterministic: same seed + same commands at the same ticks ⇒ the same battle, bit for bit, on
  V8 (Chrome, Node) and JavaScriptCore (Safari). It only uses + − × ÷, `Math.min/max/abs/
  floor/round/imul` (exactly specified) and its own seeded RNG.
- The **server owns the clock**: it runs the battle at 60 ticks/s, applies each player's
  commands right before its next tick and broadcasts a *turn* at least every 2 ticks (33 ms), and
  right after any command, listing the
  commands and the tick they were applied at. Clients replay exactly that.
- Each client plays the ticks out through an **adaptive jitter buffer**: it measures how
  irregularly turns arrive and stays just far enough behind the server to absorb Wi-Fi hiccups,
  easing its playback speed ±5 % so changes are invisible. On a good LAN the delay is ~20–40 ms.
- Orders are checked locally first (gold, queue, cooldowns — counting orders still in flight),
  so feedback is instant; the server's simulation has the final word.
- Every second the server sends a **hash** of its state; a client that ever disagrees (or
  reconnects, or reloads) gets a full **snapshot** (~10–30 kB) and continues from there.
- The server validates every message (shape, ranges, rate limits) and ignores commands from
  the wrong seat, so a modified client can't cheat beyond what the rules allow.

Code map: `src/net/protocol.ts` (messages, constants), `src/net/connection.ts` (socket,
reconnect, ping), `src/net/client.ts` (session, room state), `src/net/netgame.ts` (replica,
jitter buffer, resync), `server/lobby.ts` (rooms, seats, sessions), `server/match.ts`
(authoritative battle), `server/net.ts` (WebSocket transport), `server/main.ts` (LAN server),
`src/ui/mpmenus.ts` + `src/ui/netoverlay.ts` (screens and in-battle notices).

## Testing

```bash
npm test                                   # incl. determinism, server and simulated-network tests
node scripts/mpsmoke.ts --shots            # two Chrome profiles (desktop + phone) play it through
node scripts/mpsmoke.ts --latency 60 --jitter 80   # the same over a bad network
node server/main.ts --latency 80 --jitter 60       # play by hand with simulated lag
node scripts/enginecheck.ts 30 2                   # same battle in Node, Chrome, Firefox, WebKit
node scripts/mpengines.ts                          # online: Chrome / Firefox host vs a WebKit guest
```

`enginecheck` and `mpengines` use Playwright's Firefox and WebKit (JavaScriptCore — the engine
behind every iPhone browser), installed inside the project:
`PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install webkit firefox`. Full-length battles hash
identically on all four engines.

Two browser tabs on one computer are two separate players (the session lives per tab), which is
the quickest way to try a battle alone. Or let an AI join your room:

```bash
node scripts/mpbot.ts                 # hosts a room on localhost:8787 (join it from a phone)
node scripts/mpbot.ts ABCD --difficulty master   # joins room ABCD
node scripts/mpbot.ts --vs-bot --minutes 30      # two bots: a long soak test
```

## Upgrading to online play over the internet

The design already separates everything that matters for that step:

1. **Deploy the same server** (`node server/main.ts`) on any Node host or VPS behind a TLS
   reverse proxy (Caddy, nginx, a PaaS). Pages served over `https` automatically connect with
   `wss://` to the same host.
2. **Static hosting elsewhere?** Build with `VITE_MP_SERVER=wss://game.example.com/mp` (or
   open the page with `?server=game.example.com`) to point the client at the server.
3. **Room codes already work across networks**, and the "open battles on this network" list is
   already scoped: all private addresses count as one LAN, while on a public server players see
   only rooms from their own home network (same public IP / IPv6 prefix). Behind a reverse proxy
   start the server with `--trust-proxy` so it reads the client address from X-Forwarded-For.
   Strangers see each other's names there: `--names <file>` (one word per line) turns any name
   containing a listed word — case- and punctuation-blind — into "Player".
   A matchmaking queue would be the next step.
4. **Latency:** the jitter buffer adapts by itself (tested with 20–140 ms delays); for long
   distances raise `turnTicks` in `attachMultiplayer` to save packets if needed.
5. **Abuse limits are in place:** rooms (2000) and sessions (10000) per server, 32 connections per
   public address, message / command / emote rate limits, strict validation of every message,
   64 kB maximum frame size. Responses are brotli/gzip-compressed.
6. **Scale:** rooms are independent, so several server processes behind sticky sessions (or one
   process per region) scale horizontally. A match costs ~0.04 % of a CPU core and ~19 MB of
   traffic per hour (`node scripts/servercost.ts`; docs/PROFIT.md has the cost model).
7. **Later:** accounts and persistent ratings (the Hall of champions is kept in memory per
   network and keyed by a hashed device id (the name only for clients without one), saved to
   `mythwar-data.json` through the small `ServerStore` interface in `server/store.ts` — with
   accounts a database would sit behind it), spectators (they would simply receive turns),
   replays (seed + command log is a complete replay), and reconnect across devices (the session
   token is already the key).
