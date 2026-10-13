# Mythwar — brief for the client

One page: what TASK.md asked for, what was built, how to see it with your own eyes, and what
still needs you. (Details: PROGRESS.md for the log, docs/LENSES.md for the reasoning per lens.)

## Phase 1 — a match against another person on the same Wi-Fi

| You asked for | What there is | See it yourself |
|---|---|---|
| Play a match against another human, across devices | Authoritative Node server + lockstep browsers; any device with a browser joins | `npm run lan`, scan the printed QR code with a phone, *Multiplayer → Host a battle* on one device, scan the room's QR code with the other, both *Ready* |
| PC ↔ mobile, iOS ↔ Android | Plain web pages, no app store; the simulation is bit-identical in Chrome, Firefox and Safari's engine | `npm run enginecheck` (same battle hashes in V8, SpiderMonkey, JavaScriptCore); `npm run mpengines` (online Chrome vs Safari-engine battle, 0 desyncs) |
| Stable | Reconnects after Wi-Fi blips, phone locks and app switches (the battle waits, 90 s); reload mid-battle rejoins; desyncs repair themselves; laggy Wi-Fi absorbed by an adaptive buffer | `npm run mpsmoke` (two browsers, a phone profile, every flow: lock, drop, reload, forfeit, rematch, co-op, server restart) |
| Really polished | Mirrored view (you're always left and blue), 3-2-1 countdowns, pause with a fair limit, emotes, rematch, records per opponent, standing titles, sigils, the network's Hall of champions | Play one battle phone vs PC |
| Easy upgrade to online later | wss on https pages, room codes work across networks, open-battle list scoped per network, rate limits, versioned protocol, a storage seam | docs/MULTIPLAYER.md → "Upgrading to online play over the internet"; docs/ROADMAP.md |

**Not verified by me:** a physical iPhone and Android phone (no devices here). Everything that
can be checked without them is checked in Chrome's phone emulation and Safari's WebKit engine.
docs/PLAYTEST.md is a one-hour plan to close this gap — the most valuable next hour.

## Phase 2 — 100 iterations, one per lens of *The Art of Game Design*

- One commit per lens (`git log --oneline | grep Lens`), with the question asked, what was
  found, what changed and how it was checked in docs/LENSES.md.
- The biggest results: a coach (Mímir) and a three-star rating for newcomers; the four AI
  generals as characters with a story (a journey in four chapters, ties between them, things they
  say to you); Ley Surges, holding the line, veterans and hero names in battle; Trials, Riddles,
  Quick battles, a Sandbox and a Bestiary; co-op and handicaps online; accessibility (colour-blind
  mode, keys for everything, gamepads); design tools that measure the game (`npm run designcheck`
  — difficulty ladder, battle length, variety, side fairness; `npm run economy`; `npm run
  puzzlecheck`; `npm run perfcheck`).

## Things that need your decision
1. **Try it on two real phones** (docs/PLAYTEST.md). If anything feels off, that beats any
   further lens.
2. **https on the LAN?** Phones only keep the screen awake and install the app over https; a
   self-signed certificate means a browser warning once per device. Your call.
3. **Next step after the LAN:** a public server (docs/ROADMAP.md, *Next*). It needs a host and a
   domain — a cost and a choice only you can make.
