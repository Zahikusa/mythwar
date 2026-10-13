# Mythwar — what it costs to run, and how it could pay for itself

Written for Lens #96 (*Profit*). The numbers are measured, not guessed:
`node scripts/servercost.ts [matches] [minutes] [turnTicks]` runs the real lobby and match code
with simulated players at a human pace (2026-10-13, this repository's build).

## What one online battle costs
| | turns 30/s (`turnTicks` 2, the LAN default) | turns 10/s (`turnTicks` 6, for the internet) |
|---|---|---|
| Server → each player | ~2.6 kB/s on the wire (31 messages/s) | ~1.0 kB/s (11 messages/s) |
| Each player → server | ~0.1 kB/s | ~0.1 kB/s |
| One match, both ways | ~5.5 kB/s ≈ **19 MB per hour** | ~2.3 kB/s ≈ **8 MB per hour** |
| Server CPU | ~0.04 % of one core per running match | the same |

(Wire figures assume one TCP packet per message — the worst case; TLS on a public server adds
~25 bytes per message. The simulation itself is ~2.5 µs per tick.)

## What that means for a public server
- **CPU is not the limit:** one core runs well over a thousand simultaneous battles.
- **Bandwidth is:** a small VPS (about €4–6 a month with 1–2 TB of traffic) carries ~50,000–
  100,000 match-hours a month at the LAN setting, more than twice that at 10 turns per second.
  If a player plays five hours a month, that is **10,000–20,000 monthly players per small
  server**, so roughly €0.0003 per player per month.
- **The real costs are not the machine:** a domain, the time to keep the server updated, and
  moderation once strangers can meet (names, quick messages — today limited to fixed phrases).
- Single player costs nothing to serve: it's a static page (GitHub Pages) that works offline.

## How it could pay for itself — without breaking what players value
What players value here (the lenses say it again and again): **playing with friends** and **a
fair fight**. So:
- **Never sell power.** No creatures, blessings, gold or XP for money; a battle must be won in
  the battle. (Handicaps exist so friends of different skill can play — not for sale either.)
- **Playing with friends stays free** — on the LAN and online. It is the game's reason to exist.
- **Optional, cosmetic, one-time:** a *Supporter* pack — more sigils, banner colours for the keep,
  a gilded frame on the Hall of champions — sold once, not as a subscription or loot box.
- **The stores:** the same game wrapped (Capacitor) for the App Store and Google Play at a small
  one-time price, with the web version free — the store version would also be the one that can
  host a LAN battle from a phone (ROADMAP, *Next* 4).
- **Or simply a tip jar** on the page while the player count is small: at €0.0003 per player per
  month, a handful of supporters pays for a server.

## What would change the picture
- Spectators and replays (ROADMAP, *Later*) multiply the turn traffic per battle — still small,
  but count them before promising them.
- A huge number of idle open lobbies costs list broadcasts (throttled to 4/s per watcher); the
  room and session caps already bound it.
