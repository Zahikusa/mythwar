# Playtesting Mythwar

A one-hour kit for watching real people play — the thing no automated test can do. It covers
the two open questions in PROGRESS.md as well: real phones (iPhone + Android) and a real
gamepad.

## Why (decide before you start)
Pick one or two questions for this session, not ten. Good ones right now:
1. **Can a newcomer get through a first battle against Puck without help?** (Do they find the
   lanes, the cards, the counter badge; do they ascend?)
2. **Does a match between two phones on the Wi-Fi start and finish without trouble?**
   (Joining by QR code, the room, the battle, a phone locked mid-battle, the rematch.)
3. **Is Hippolyta the right second step?** (Too hard after Puck? Too easy?)

## Who and where
- One or two players who have **never seen the game** (fresh eyes find what we no longer see),
  plus one who has played before for the multiplayer test.
- Their own phones if possible (iPhone Safari, Android Chrome), in the place they'd really play
  (sofa, not a desk).
- One person watches and takes notes; nobody helps unless the player is stuck for a minute.

## Setup (5 minutes)
1. On a PC in the same Wi-Fi: `npm run lan` (allow Node.js on *private* networks when Windows
   asks). It prints an address and a QR code.
2. Each phone scans the QR code (or opens the address). For battles against the AI, nothing
   else is needed.
3. For the multiplayer test: one player taps **Multiplayer → Host a battle**, the other scans
   the room's QR code. Both press Ready.
4. Gamepad (optional): pair it with the PC or a phone, press a button on the title screen.

## What to watch (write down the time and what happened)
- Where they look first, and the first thing they try to tap.
- Any moment they stop and frown — and whether Mímir's next tip answers it.
- Whether they notice: the "Counter!" badge, the shrines, holding a lane, ascending, the god
  power, veterans (the gold chevron).
- Multiplayer: how long from "let's play" to the countdown; anything that made them ask "what
  now?"; what happens when a phone is locked for 20 seconds mid-battle.
- Sound on or off? Portrait or landscape?
- If there's time, three rough edges worth a try on purpose (fixed in run #8, never seen on real
  phones yet): close the guest's tab in the battle room and scan the QR again (the seat should
  come back, not "already has two players"); after a battle press **Room**, switch to co-op and
  Ready again (the other phone should say what changed); hold the lane shield on a small phone
  right next to the gate (the tap should hold the lane, and a tap on the gate open its turret).
- And the phone behaviours from runs #9–#10: on Android, press **Back** in a battle (the menu should
  open on that phone only — the other player's battle goes on, no pause spent — and Back again
  closes it; in the battle room, Back once says "Press Back again to leave the room" and a
  second Back leaves it — does that feel right, or should a single Back leave?); in the room, let the guest's phone lock for two minutes, then wake it (it should
  be back in the room by itself if nobody took the seat); after a battle tap **Copy result** on
  a phone and paste it into a message (it should paste the result, not "Copy failed"); a guest
  who came by QR code: did they find **How to play** in the room?
- And from run #10: mid-battle, walk one phone out of the Wi-Fi's reach (or switch its Wi-Fi off
  for ~10 s) — the other screen should say "… is away" within about 5 s and the battle wait,
  then count down 3-2-1 once the phone is back. In co-op, let one phone lock until the ally has
  won: when it wakes it should show the victory, not a frozen battle.

**Don't** explain, defend or coach while they play. "What are you thinking?" is the only
question allowed during the battle.

## After the battle (5 minutes, in this order)
1. "Tell me what happened in that battle." (Their story shows what they understood.)
2. "What was the most fun moment? The most annoying one?"
3. "Was anything confusing?" — then point at one thing they missed and ask if they saw it.
4. "Would you play another one? Against whom?"

## Collect the numbers
On each device: **Settings → Copy playtest journal** copies the last battles as one line each
(mode, foe, result, length, stars, final age, creatures summoned per class, kills, losses, god
powers cast). It never leaves the device unless copied. Paste it under your notes.

## Afterwards
Put the three biggest findings (with the times from your notes) into PROGRESS.md under
"Open questions for the human" or as backlog items — each as *what happened → what we change*.

## Phones: the native-app check (about 10 minutes, no players needed)

What the automated check (`npm run mobilecheck`, Playwright's WebKit and Chromium) cannot see:
the real browser bars, the home bar, the keyboard and the install dialogs. One iPhone and one
Android phone, the public address (https://zahikusa.github.io/mythwar/). Tick each line; write
down the model, the iOS/Android version and anything that looks wrong (a photo helps).

**iPhone, Safari tab (3 min)**
- [ ] Title, upright and sideways: drag anywhere — nothing bounces, scrolls or zooms (pinch,
      double-tap, long press on text: no zoom, no selection, no "Copy" bubble).
- [ ] Safari's bars never cover a button: the bottom of the title, the cards in a battle, the
      results' buttons. Sideways with the bars shown and hidden (iOS 26: the floating bar).
- [ ] Settings, Bestiary, the lobby: only the middle scrolls (with momentum); the title and
      the Done/Back button stay put. Pulling past the end does not move the page.
- [ ] The lobby, upright: tap "Your name" — the keyboard opens and an upright box at the top
      shows what you type (the field itself is on the turned game); Done closes it. Close the
      keyboard — the game sits exactly where it was (no gap, nothing shifted).
- [ ] The lobby, sideways: tap the room code — with the keyboard up, the code field (and Join)
      shows in the strip above it; the title and Back come back when the keyboard goes.
- [ ] Sound: play music in another app, then start a battle — note whether your music keeps
      playing under the game's or stops. Flip the ring/silent switch to silent: note whether
      the game goes quiet. (Native games: the music keeps playing, silent mutes the game.)
- [ ] The "Get the app" offer on the title opens the sheet; the steps match what Safari
      shows (iOS 26: ⋯ → Share → Add to Home Screen → Open as Web App); the arrow points at
      the right button. Swipe the sheet down: it goes.

**iPhone, installed (2 min)** — follow the sheet's steps, then open Mythwar from the Home Screen.
- [ ] Launch: dark from the first frame (no white flash), no browser bars, the welcome card.
- [ ] Before installing, tap "Copy my progress" in the sheet (after a battle in Safari); in the
      app's welcome tap "Paste my progress" → iOS's Paste bubble → your feats are there.
- [ ] Sideways on a phone with a notch: nothing important under the notch or the home bar,
      on both sides (turn the phone the other way round too); beside the notch a blurred copy of
      the scene, not black bars.
- [ ] Upright: the game turns sideways cleanly; the status bar doesn't cover anything.
- [ ] Flight mode, close the app fully, open it again: it starts (offline).
- [ ] The swipe back from the screen's left edge steps back like the game's Back.

**Android, Chrome tab (3 min)**
- [ ] The same "nothing moves" checks; pull down on the title: no refresh.
- [ ] Back (button or edge swipe): closes a battle sheet first, opens the menu in a battle,
      leaves the results to the main menu; on the title the first Back says "Press Back again
      to leave", the second leaves.
- [ ] "Get the app" → "Install app" opens Chrome's real install dialog (if Chrome offers it;
      otherwise the sheet shows the ⋮ menu steps and "Play full screen").
- [ ] Settings → Vibration off: no buzz on a summon; on again: buzz.

**Android, installed (2 min)**
- [ ] Opens full screen, sideways, no status bar; Back on the title leaves only on the second press.
- [ ] Open the game in a Chrome tab again: the title says "You have the app — open Mythwar
      from your home screen" (getInstalledRelatedApps).

**Shared link (1 min)** — send the link to yourself in WhatsApp/Instagram/Telegram and open it
there:
- [ ] The title offers "Open in Safari/Chrome"; on Android "Open in Chrome" opens Chrome; on
      iPhone the steps match the app's menu.
