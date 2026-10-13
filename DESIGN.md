# Mythwar: Ages of Legend — Game Design

A three-lane, mythological re-imagining of the Flash classic *Age of War*.
Two citadels face each other across three parallel lanes. Summon mythical
creatures into a lane, kill enemy creatures for gold and XP, evolve through
five mythic ages, and topple the enemy citadel.

## Essential experience
*Outwitting a rival general in a tug-of-war of legends:* reading what is coming down each of
three lanes, answering it with the right creature at the right moment, and feeling your side
climb from fae skirmishes to a clash of gods. Tension (the shared citadel), insight (the counter
triangle, the flaring portals) and escalation (five ages) are the three things every change
should serve. The battle opens with that promise ("Topple their citadel — vs <foe>") and a war
horn, so the goal and the rival are named before the first summon.

## Problem statement
*Make a tug-of-war strategy game that two people — or one person and the machine — can pick up
in a minute on whatever device they have (PC, iPhone, Android), and that keeps rewarding
insight (reading lanes, answering with counters, timing the ages) for many battles.*
How we know it is solved — measured by `npm run designcheck` (scripted "smart" player and
AI-vs-AI battles; see the script for thresholds):
1. **A ladder of challenge:** a competent player beats Novice ≥ 85% of the time, Mythic ≤ 20%,
   and each difficulty is harder than the one before.
2. **Pacing:** evenly matched battles last 8–20 minutes (median) and mostly reach the fourth age.
3. **Variety:** every class is used in every age (12–60% of that age's summons).
4. **Fairness:** neither side of the field is favoured (30–70% in even AI battles).
Plus what the tests already guard: identical simulation on every engine, online battles stay
in sync, and the first battle can be played without reading anything (coach tips).

## Theme
*Legends rising through the ages.* Every channel climbs together when a side ascends: the
battlefield and sky, the citadel, the music's mode and instruments, the creatures and their
projectiles, the god power, the story line on the banner — and the HUD's accent colour (leaf
green, marble gold, glacier blue, lacquer vermilion, starlight).

## Pillars
1. **Simple to pick up** — tap a lane, tap a creature. Everything else is optional depth.
2. **Readable depth** — a 3-way counter triangle, three lanes to balance, shrines
   to contest, turrets, god powers, ages. Every system is visible on screen.
3. **Clean, smooth, mythic** — procedural vector art, soft gradients, glows,
   interpolated 60+ fps animation, juicy feedback.

## Core loop
- Gold trickles in (+ more from each shrine you hold) and is earned by kills.
- Spend gold to summon creatures into a lane (a queue of 5 in all; each gate trains its own
  creature, so the three lanes train in parallel — since Lens #50).
- Kills give XP. With enough XP (+ a gold tithe) you **Ascend** to the next age:
  new creatures, a new god power, new turrets, more citadel HP.
- Destroy the enemy citadel (shared HP across all lanes) to win.

## Battle length
Standard battles against Adept/Master take ~14–16 minutes for a competent player (even AI
battles ~19). **Quick battles** (an option on the foe screen, single player): XP ×2.2, 300
starting gold, Ragnarök at 10:00 (90 s after both reach the final age), a ×3 siege ramp and
crumbling after 4 minutes of Ragnarök — ~10–11 minutes, all five ages. Par times for the third
star are two thirds of the standard ones; best times are kept for standard battles only.

## Rushing an age (triangularity)
With three quarters of the XP an age needs, a side may ascend anyway for a **double tithe**:
the safe path is to wait for the XP and pay the normal price; the risky one buys the next age's
creatures and citadel a minute or two early, with gold that would have been an army. The Ascend
button shows "Rush · 300g (×2)" with a dashed border — and never chimes for it.

## Lanes
- Three horizontal lanes (far / middle / near), drawn in soft 2.5D perspective.
- Creatures only fight creatures in the same lane. Any lane can reach the citadel.
- Each lane has a **Ley Shrine** at its centre. Only your creatures near it ⇒ you
  capture it over a few seconds. Each held shrine adds gold income.
- **Lane stance — hold the line:** a shield under each lane's ▶ marker (key G) tells that lane's
  creatures to stop just past the shrine (they still fight whatever comes); a war banner marks
  the line. Gather a wave out of the wards' reach, then let it loose together. Both sides see
  each other's banners.
- **Ley sight:** holding a lane's shrine shows the foe's summons waiting for that lane (portraits
  above their gate, the one in training with a progress ring) — information is part of the prize.
- **Ley Surges** (seeded surprise): from ~2 minutes in, every 2–3 minutes the ley lines flare under
  one shrine (never the same lane twice in a row). A 10 s omen (flickering shrine, toast, hum),
  then for 20 s its holder draws 1.5× their passive age income on top. Both sides see the same
  thing at the same time — a race to the shrine, not a dice roll on who wins. No surges in Ragnarök.
- Each lane has one **turret slot** on each citadel.
- A gate's portal **flares** for the last ~1.2 s before a creature steps out of it (both sides),
  so an attentive player sees which lane the enemy's next creature is coming down.

## Creature classes (counter triangle)
| Class | Icon | Role | Strong vs |
|---|---|---|---|
| Guardian | shield | slow, tanky melee | Hunter |
| Hunter | fang | fast melee striker | Mystic |
| Mystic | orb | fragile ranged caster | Guardian |

Damage ×1.5 against the class you counter, ×0.75 against the class that counters you.
To make the triangle hold for whole armies (not just duels — massed ranged units otherwise
dominate because melee fight one at a time), each class has a formation rule:
- **Hunters hunt in packs:** they don't block each other, so a pack strikes one foe together.
- **Guardians sweep:** every blow also hits foes packed around the target (80%). Splash from one
  blow doesn't stack: a foe caught by sweep, cleave or slam takes only the largest share of the
  blow (its own class counter still applies, so a Hunter beside a Mystic target can take more).
- **Mystics hang back:** melee allies walk through them to the front line.
Verified with `node scripts/classwar.ts` (equal-gold army battles per age).
Final age adds a **Legend** (Elder Dragon): expensive, neutral, splash fire.

## Ages
| # | Age | Guardian | Hunter | Mystic | God power |
|---|---|---|---|---|---|
| 1 | Fae Wilds | Treant Warden (regenerates) | Redcap Raider | Pixie Sprite | Briar Snare (root + dmg) |
| 2 | Olympus | Minotaur | Centaur Lancer (charge) | Gorgon (slowing gaze) | Wrath of Zeus (lightning) |
| 3 | Asgard | Frost Jötunn (cleave) | Fenrir Wolf (lifesteal) | Valkyrie (flying) | Fimbulwinter (freeze) |
| 4 | Jade Empire | Oni Brute (enrage) | Byakko Tiger | Kitsune (bouncing foxfire) | Spirit Dragon (sweeping) |
| 5 | Celestial | Titan (slam) | Griffin (flying) | Phoenix (rebirth) | Starfall (meteors) |

Legend (age 5): Elder Dragon.

Turrets per age: a **Bolt** turret (single target, long range) and a **Blast**
turret (splash). Turrets can be sold for 50%.

## Systems added during balancing (see PROGRESS.md decisions log)
- **Gate wards:** every gate has a free, weak built-in ward (scales with age) — gives the
  defender an edge so one lost skirmish doesn't snowball into a 3-minute loss.
- **Blessings:** permanent upgrades bought with gold — Might (+10% damage), Vitality (+10%
  health for new creatures), Bastion (+15% citadel health, +7.5% ward/turret damage); five ranks
  each, prices scale with rank and age but never drop below the Asgard price (cheap permanent
  first-age blessings were the best buy in the game). Each is priced by its worth (Lens #46,
  `npm run economy` and equal-gold tests): a first rank at Asgard costs Might 1,584, Vitality
  1,056, Bastion 792 gold — about two thirds of what it wins you. Gold never piles up (creatures
  absorb it), so a blessing means banking gold in a calm moment; the Mythic general does so.

## Economy (Lens #46, `npm run economy`)
Kills are 55–70% of everyone's income (a fallen creature pays its killer 75% of its cost),
passive income 25–40%, Ley Surges 2–4%. Creatures take ~85–90% of all spending, ascending
~10%, turrets and blessings the rest. Nobody ever sits on gold with a full queue: gold, not the
queue, is the limit. The consequence players must learn — creatures thrown one by one into a
held lane feed the enemy — is said on the how-to page and by a results tip; hold the line is the
tool for it.
- **Ragnarök:** at 18:00, or 3 minutes after both sides reach the final age, the wards fall
  silent, turrets fire at half their rate (since #39: stalemates at defended gates had dragged even
  battles to a 20-minute median), and damage to citadels ramps +150% per minute (raised from +100% in phase 2: the stronger defensive tools had stretched even battles past 20 minutes) — long stalemates end.

## Controls
- **Desktop:** click a lane (or W/S, ↑/↓, Q/A/Z) to select it; click a creature card
  (or 1–4) to summon into it; drag a card onto any lane; Space casts the god power on
  the selected lane (or click the power button, then a lane); T turrets, B blessings,
  U ascend, F 2× speed, Esc pause. Hover cards and creatures for details.
- **Mobile (landscape):** creature cards on the left thumb column, powers on
  the right. Tap lane to select, tap card to summon, or drag a card onto a lane.
  Long-press a card for info. Portrait is supported by rotating the game.

## AI generals
Each difficulty is a general out of myth with a voice: **Puck**, the Wandering Spirit (Novice),
**Hippolyta**, Queen of the Amazons (Adept), **Odin**, the All-Father (Master), **Ares**, God of
War (Mythic). They speak a line in a speech bubble at the start, when they ascend, cast, take a
shrine, when either citadel is nearly down, and at the end (at most one every 25 s; the
"Opponent's messages" setting silences them). They also answer the player's deeds — the player
ascending, striking them with a god power, taking a shrine back from them — and that is where
their place on the interpersonal circumplex (Lens #78) shows:

| | friendly | hostile |
|---|---|---|
| **dominant** | Hippolyta (respects, then commands); Mímir the mentor | Ares (threatens); Odin (cold, aloof — between the two) |
| **submissive** | Puck (admires, whimpers) | — (left open: no sulking villain yet) |

## AI
Same command API as the player. Four difficulties: Novice, Adept, Master, Mythic.
Evaluates per-lane threat, picks counters, contests shrines, saves to ascend,
builds turrets, buys blessings, aims god powers, and piles into the weakest lane during
Ragnarök. Difficulty scales reaction time, decision quality and income (Novice 50%,
Adept 90%, Master 100%, Mythic 120%). Novice *follows the player up the ages*: it ascends
readily, but never into an age the player hasn't reached — beginners see the war escalate with
them without being out-tiered for not ascending yet. Mythic also plans ahead: it holds summons back to mount
a turret as soon as foes push past midfield, and keeps buying blessings instead of hoarding
gold for them (calibrated against the scripted bots in `scripts/bots.ts`).

## Accessibility (Lens #48)
- **Colour:** class is never colour alone (every class colour comes with its shield/fang/orb icon
  or name); team is blue vs red, and Settings → *Colour-blind friendly* turns the foe orange
  (blue vs orange stays apart for protan-, deutan- and tritanopes; red turns grey for
  protanopes). Check with `node scripts/shoot.ts <scenario> --cvd protanopia|deuteranopia|
  tritanopia [--settings '{"colorblind":true}']`.
- **Motion:** screen shake, vibration and the title's camera drift share one switch, off by
  default when the OS asks for reduced motion; CSS animations stop under the same preference.
- **Input:** everything has a key (1–4 summon, W/S, arrows, Q/A/Z or the mouse wheel for lanes,
  Space power, G hold, T turrets, B blessings, U ascend, Backspace undo, Esc/P pause, H or ? for
  the key list); every action also works by tap; buttons carry aria-labels and a visible
  keyboard focus ring.

## Riddles of war (Lens #52)
Small hand-made battles with one question each (foe screen → Riddles): a fixed purse (no income,
kills pay nothing), no gate wards or turrets, the foe's creatures already on the field, and one
goal — clear the field before any foe reaches your citadel. No "Counter!" badge (reading the lane
is the riddle), no records or feats; solved riddles are remembered. Riddles of ages the player
hasn't reached in battle stay sealed. Each is brute-forced by `npm run puzzlecheck` (every mix
of creatures within the purse, every power timing): The Redcap Pack 3/28 answers win, The
Labyrinth's Guard 1/28, The Giants' Wall 2/23, Fimbulwinter 26/138 — none without the power;
since Lens #66 one for each later age too: The White Tigers (Jade) 2/17, Sky and Stone
(Celestial, Starfall once) 26/297 — none without the power.
