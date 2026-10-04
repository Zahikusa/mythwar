# Mythwar: Ages of Legend — Game Design

A three-lane, mythological re-imagining of the Flash classic *Age of War*.
Two citadels face each other across three parallel lanes. Summon mythical
creatures into a lane, kill enemy creatures for gold and XP, evolve through
five mythic ages, and topple the enemy citadel.

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
- Each lane has one **turret slot** on each citadel.

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
- **Guardians sweep:** every blow also hits foes packed around the target (80%).
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
  each, prices scale with rank and age. A late-game gold sink.
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
Ragnarök. Difficulty scales reaction time, decision quality and income (Novice 70%,
Adept 90%, Master 100%, Mythic 120%).
