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
- Spend gold to summon creatures into a lane (training queue of 5).
- Kills give XP. With enough XP (+ a gold tithe) you **Ascend** to the next age:
  new creatures, a new god power, new turrets, more citadel HP.
- Destroy the enemy citadel (shared HP across all lanes) to win.

## Lanes
- Three horizontal lanes (far / middle / near), drawn in soft 2.5D perspective.
- Creatures only fight creatures in the same lane. Any lane can reach the citadel.
- Each lane has a **Ley Shrine** at its centre. Only your creatures near it ⇒ you
  capture it over a few seconds. Each held shrine adds gold income.
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
  first-age blessings were the best buy in the game). A late-game gold sink.
- **Ragnarök:** at 18:00, or 3 minutes after both sides reach the final age, the wards fall
  silent and damage to citadels ramps +100% per minute — long stalemates end.

## Controls
- **Desktop:** click a lane (or W/S, ↑/↓, Q/A/Z) to select it; click a creature card
  (or 1–4) to summon into it; drag a card onto any lane; Space casts the god power on
  the selected lane (or click the power button, then a lane); T turrets, B blessings,
  U ascend, F 2× speed, Esc pause. Hover cards and creatures for details.
- **Mobile (landscape):** creature cards on the left thumb column, powers on
  the right. Tap lane to select, tap card to summon, or drag a card onto a lane.
  Long-press a card for info. Portrait is supported by rotating the game.

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
