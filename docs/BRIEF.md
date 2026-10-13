# Mythwar — brief for the client

One page: what TASK.md asked for, what was built, how to see it with your own eyes, and what
still needs you. (Details: PROGRESS.md for the log — older parts in docs/PROGRESS-archive.md — docs/LENSES.md for the reasoning per lens.)

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

## Since then — a review round (run #8)

Six independent reviews of the finished work (netcode, app flows, simulation, persistence,
accessibility, docs) and two walk-throughs (two players' flows; saved data across versions) found
about 70 concrete defects; each is fixed and checked, most with a test that failed first
(docs/PROGRESS-archive.md, items 38–107; later ones in PROGRESS.md). The ones you'd notice: **one misbehaving client could crash the LAN
server** — fixed, and a fault in one battle no longer ends the others; a phone that drops the page
gets its seat back when it re-scans the QR; "Room" on the results lets you change mode or
handicaps for the rematch; reconnecting is quicker after a Wi-Fi switch; a save in one tab never
undoes another's progress. **The rules changed slightly** (team 1 had a one-tick edge in mixed
fights — now perfectly even), and the **protocol is v15**: server and pages from one build.

## And then — a friend's first visit (run #9)

A walk-through of a first-time guest — scans the QR code on a phone, waits in the room, plays,
sees the results — and screenshots of every online screen found the rough edges a friend would
hit first (docs/PROGRESS-archive.md, items 138–205). Now: **the phone's Back button no longer closes the
game** (in a battle it opens the menu), and a tab that did close rejoins its running battle by
scanning the code again; a phone that **locked while waiting in the room** takes its seat back
when it wakes; **Copy result / Copy link work on LAN phones** (plain http has no clipboard API);
the room has **How to play**; the start countdown, the "is away" notice and the opening banner no
longer cover each other; the chronicle tells a forfeit as a forfeit. No rules or protocol change.
On the host's side, the server now names the network adapter behind each address it prints (and
which one the QR code uses), explains Windows' *Public* Wi-Fi trap, and checks the Node version;
the release package's starters say plainly when the zip wasn't unpacked. **But the downloadable
release is still v1.0.0 from 2026-10-08** — publishing a new one is your step (PROGRESS.md, Open
questions).

## And then — when the Wi-Fi misbehaves (run #10)

Three independent reviews (the client's netcode, the server's rooms and battles, and the run's
own changes) went looking for what goes wrong on a real network. Fixed (docs/PROGRESS-archive.md and PROGRESS.md, items
215–272): **a phone that reconnected after a citadel fell froze in the battle** with no results
and no menu — now it sees how the battle ended; a phone that **walks out of the Wi-Fi mid-battle**
holds the battle after 4 s of silence instead of the battle running on for 12 s without it; a
player whose phone was gone when the battle ended keeps their seat (and the winner their win)
for a minute from the result; a host whose phone reconnects is listed in the lobby again; going
away and back inside each resume countdown can no longer hold a battle forever; a page refused
by a server running another version goes to the lobby that says "reload" instead of
"Reconnecting…" forever. On a phone (Android's Back button, an iPhone's swipe back), Back in the battle room says "Press Back again to leave the
room" and a second Back leaves. The end-to-end test now cuts the phone's network silently (a
relay that freezes its links), so the server's own detection of a dead link is exercised.
A look at screenshots of every online screen found that **on a phone the battle room's messages
and its "Waiting for a second player…" line were off screen** — now right under the header; a
phone that wakes up in the room reconnects at once instead of after ~6 s; a win because the
other player left or stayed away is called a walkover and earns no feats. And a pass over
phone-browser quirks: **a swipe that started on a button didn't scroll** (Settings, results,
lobby); a long press on Ascend now previews instead of ascending; an iPhone in Low Power Mode no
longer leaves the game in battery-saver mode for good; an iPhone on iOS 15 or older gets a plain
"needs a newer browser" message instead of a broken game (the minimum is iOS 16.2).
No rules change; the protocol is unchanged.

## Phase 3 — a native-app feel on phones (run #12)

| You asked for | What there is | See it yourself |
|---|---|---|
| A. No scrolling page | Every menu is title / scrolling middle / buttons — only the middle scrolls, with momentum; the page itself never moves (no bounce, pull-to-refresh, zoom, selection or callout); the game fits the *visible* area (Safari's bars, the keyboard, a turn) | `npm run mobilecheck` (8 phones and tablets × tab and installed × both ways; real swipes and pinches on the Androids); `screenshots/mobile/` |
| B. Installed = native | Launch images (no white flash), notch and home bar handled — a blurred continuation of the scene fills the strips beside the notch, a new version is offered as a restart (never mid-battle), offline start tested | Add it to an iPhone's Home Screen and open it |
| C. Guide every player | The game knows where it runs (iPhone Safari incl. iOS 26, other iPhone browsers, Android browsers, WhatsApp/Instagram/…, computers, the LAN page) and offers the one right step: Android's real install dialog, pictured iPhone steps with an arrow to the button, "Open in Chrome/Safari" from app browsers, a QR code on computers; once after the first battle, a permanent entry in the menu and Settings, a welcome in the installed app (with one-tap "Paste my progress" — the iPhone app has its own storage) | "Get the app" on the title screen |
| D. Phone navigation | One Back model everywhere (sheets first, results → menu, the title asks before leaving), swipe-down sheets, every touch target ≥ 44 px, an upright box for typing while the game is turned, a Vibration switch | `npm run smoke -- --only phone-back` |
| E. Small screens | iPhone SE (also in a 292-px-tall Chrome tab on a small Samsung) up to iPads | the contact sheets in `screenshots/mobile/` |
| F. An Android APK | Decided against for now (Chrome already makes the installed game a real Android app; a TWA needs your asset-links file; signing in CI is yours to set up) — reasons in PROGRESS.md | — |

**Not verified by me:** real phones. Please run the 10-minute check in docs/PLAYTEST.md
("Phones: the native-app check") — Safari's real bars (iOS 26's floating one), the keyboard and
the install dialogs can only be seen there.

## Things that need your decision
1. **Try it on two real phones** (docs/PLAYTEST.md). If anything feels off, that beats any
   further lens.
2. **https on the LAN?** Phones only keep the screen awake and install the app over https; a
   self-signed certificate means a browser warning once per device. Your call.
3. **Next step after the LAN:** a public server (docs/ROADMAP.md, *Next*). It needs a host and a
   domain — a cost and a choice only you can make.
