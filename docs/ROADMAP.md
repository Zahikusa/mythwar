# Mythwar roadmap

Where Mythwar could go after the local Wi-Fi release, in the order that makes sense — with the
bet behind each step and how we'd know it paid off. (Written for Lens #93, *The Crystal Ball*.)

## The one question for the crystal ball
> **Do friends come back for a second evening?**

Everything below depends on it: a game two people play once is a demo; a game they reach for
again is a hobby. It can already be answered on a LAN: the server's Hall of champions counts, per
player, the different days they battled, and `npm run lan` prints *"Hall of champions: N players
remembered, M came back on another day."* The playtest journal (Settings → Copy playtest journal)
adds the single-player side. If M stays near zero after a few weeks, fix that before anything
else (more reasons to return: new riddles, a weekly challenge, rivalries) — not more reach.

## Now — finish the local release
- **Playtest on real phones** (docs/PLAYTEST.md): an iPhone and an Android in the same Wi-Fi,
  a newcomer against Puck, a gamepad. The last untested piece of the task.
- **https on the LAN** for the screen wake lock and installing the app on phones (the server
  already takes `--cert/--key`; a guided `mkcert` setup would make it practical).

## Next — the internet
1. **A public server.** Deploy the same server (docs/MULTIPLAYER.md, "Upgrading to online play over the
   internet"): TLS in front, `--trust-proxy`, the open-battle list already scoped per home network,
   room codes already work across networks. *Bet:* friends who aren't in the same room play
   more often than friends who are. *Measure:* returning players on the public Hall.
2. **Identity without passwords.** A device key (the session token made permanent) instead of
   names as identity: names collide ("Ada" ≠ "Ada"), and the Hall, standings and rival records
   are keyed by name today. Progress codes become account recovery codes.
3. **Storage.** The Hall lives behind `ServerStore` (server/store.ts); a database goes behind the
   same two calls when there is more than one server process.
4. **Phone ↔ phone without a PC.** Today one device must run Node. The public server solves it
   online; for a LAN without a PC, a native wrapper (Capacitor) could host the server on a phone.

## Later — depth for returning players
- **Replays and spectators** — free in a lockstep design: a battle is its seed plus its command
  log. Share a replay of a great comeback; let a third friend watch.
- **Ranked ladder** — the standing titles (#80) are single-player progress; online, an Elo-style
  rating per identity, shown the same way.
- **A weekly challenge** — one seeded battle with a twist (a trial, a starting age, a riddle) the
  same for everyone, with the Hall showing who solved it fastest.
- **A sixth age** (Egypt or the Aztec sun) — only if players reach Celestial often; the playtest
  journal's "final age" column says whether they do.
- **Localisation** (German first) — all text lives in `src/ui` and the personas.

## What we'd stop doing
- More systems for the battle itself: after 90 lenses the battle is deep; new players need
  clarity and returning players need reasons, not mechanics.
