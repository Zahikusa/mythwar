# Mythwar and your data

Plain words on what the game keeps, where, and who can see it (Lens #98). Short version: **no
accounts, no analytics, no ads, no third parties** — your progress lives on your device, and an
online battle shares only what the other player needs to see.

## On your device (the browser's storage)
| What | Where | Why |
|---|---|---|
| Settings, your name and sigil, records and stars per general, feats, solved riddles, your record against each online opponent (by name, last 40), the playtest journal (last 30 battles) | `localStorage` → `mythwar.settings.v1` | So the game remembers you |
| The battle in progress | `localStorage` → `mythwar.battle.v1` | *Continue* after closing the tab |
| The multiplayer session token | `sessionStorage` (this tab only) | Rejoin your room after a reload |
| A random device id (24 hex digits, nothing derived from you) | `localStorage` → `mythwar.device` | The Hall of champions knows you by it, not by your name |
| The game's files (GitHub Pages version) | the service worker's cache | Play offline |

Nothing of this leaves the device by itself. Three buttons copy something to the clipboard, and
only when you press them: *Copy my code* (progress code), *Copy playtest journal*, *Copy result*.
*Reset records* in Settings clears your records, online records and the playtest journal, and
gives the browser a new device id (its old Hall line is no longer linked to it);
clearing the site's data in the browser removes everything.

## When you play online
The game server — the computer that runs `npm run lan` (or, later, a public server) — receives:
- **your name, standing and sigil** (shown to the other player and in the lobby),
- **your orders in battle** and your connection's round-trip time (shown to the other player),
- **your device's network address**, used only to group the open-battle list by network and to
  limit how much one address can open (abuse protection),
- **the random device id** above (never shown to anyone).

The server **keeps**, in memory and in `mythwar-data.json` next to it (`--no-save` to turn
that off): the **Hall of champions** — per network, each player's name, sigil, battles won and
lost, co-op victories and on how many days they played. Local networks are stored as `lan`; a
public network address and the device ids are never written down — only salted hashes of them,
which can't be turned back. Delete the file to forget everything.

Its log (the terminal window) shows names, room codes and results — no addresses.

Quick messages are fixed phrases ("Good luck!", "Well played!") — strangers can't send each other
free text. Names are free text; a public server can refuse names with listed words
(`--names <file>`), and would need more moderation than that (ROADMAP, *Next*).

## The GitHub Pages version
The single-player page is hosted by GitHub Pages; GitHub sees the requests for the game's files
like for any website. The page itself sends nothing anywhere.
