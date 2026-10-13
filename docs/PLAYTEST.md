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
- And the phone behaviours from run #9: on Android, press **Back** in a battle (the menu should
  open on that phone only — the other player's battle goes on, no pause spent — and Back again
  closes it); in the room, let the guest's phone lock for two minutes, then wake it (it should
  be back in the room by itself if nobody took the seat); after a battle tap **Copy result** on
  a phone and paste it into a message (it should paste the result, not "Copy failed"); a guest
  who came by QR code: did they find **How to play** in the room?

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
