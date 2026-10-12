# Mythwar through the 100 lenses

Phase 2 of the project: one design iteration per lens of Jesse Schell's *The Art of Game
Design: A Book of Lenses* (first-edition numbering, as on the 100-card deck). Each entry: the
lens's questions asked of Mythwar, what they revealed, the change made and how it was checked.
The checklist with one-line results lives in `PROGRESS.md`.

## #1 The Lens of the Essential Experience
*What experience do I want the player to have? What is essential to it? How does the game
capture that essence?*
- Essence (now written down in `DESIGN.md`): outwitting a rival general in a tug-of-war of
  legends — read the lanes, answer with the right creature, climb from fae skirmishes to a clash
  of gods. Tension, insight, escalation.
- Gap found: the first seconds of a battle didn't frame any of it. The menu closed and the
  creatures' march began in silence; the rival had no name on the battlefield until the pause
  menu, the goal was only in the how-to.
- Change: every new battle (single player and fresh online battles; not a resumed save or a
  rejoin) opens with a banner "Topple their citadel — vs Adept · Fae Wilds" and a synthesized
  war-horn call (two horn blasts over a drum, `audio.ui('horn')`). The first coach tip waits
  for the banner as it already does for other banners.
- Checked: typecheck, unit tests, screenshot of `?play=adept` at 0:02 (banner over the lanes,
  readable on desktop); full `npm run verify`.

## #2 The Lens of Surprise
*What will surprise players when they play? Do the rules give players ways to surprise each
other — and themselves?*
- Mythwar had almost no surprise after the first few battles: one map, fixed shrines, every
  battle unfolds in the same rhythm (powers and ages are the only spikes, and both are
  predictable). The only randomness was hidden (power targeting).
- Change: **Ley Surges.** From ~2 minutes in, every 2–3 minutes the ley lines flare under one
  shrine (seeded, never the same lane twice in a row, none during Ragnarök): a 10 s omen
  (flickering pillar of light, a toast, a swelling hum, a blinking shrine pip in the top bar), then
  for 20 s whoever holds that shrine draws 1.5× their passive age income on top (gold income in
  the HUD turns gold while you do). The end says what it paid. It is a *fair* surprise — both
  sides learn of it at the same moment — which turns into a race and a skirmish at the shrine.
- Determinism: surges draw from their own RNG stream (seeded from the battle seed), so no other
  random outcome shifts; state is in snapshots (older saves get a fresh schedule) and in the
  multiplayer hash.
- AI: lanes with a surge get a "need" bonus scaled by the AI's lane skill (Novice mostly
  ignores it, Mythic goes for it); a coach tip explains the first one; how-to page 4, README and
  DESIGN.md mention it.
- Checked: 3 new unit tests (omen → start → end, payout = 1.5× income × 20 s, lane never
  repeats, survives save/load, none in Ragnarök); scripted smart bot vs Master 23/100 (documented
  25%) — calibration intact; screenshot of an active surge (`?demo&ff=120&seed=5`); full verify.
  Also vs Adept 59/100 (documented 67%; the scripted bot ignores surges, the Adept AI doesn't)
  and vs Mythic 7/100 (5%).

## #3 The Lens of Fun
*What parts of my game are fun? Why? What parts need to be more fun?*
- The most fun moments are the reversals: a god power landing on a packed lane, the right
  counter shredding a wave, the dragon breathing over a column. They were acknowledged only by
  the individual "+N gold" popups (merged when close together) — the game didn't *notice* that
  something great just happened.
- Change: **rout callouts.** When the player's side fells 4+ foes in one lane within 2.5 s the
  lane shows "Rout! ×4", growing as the tally climbs ("Slaughter! ×6", "Annihilation! ×9"),
  with a rising brass stab (higher and fuller per tier) and a vibration pattern on phones. One
  callout per lane updates in place instead of stacking. Not in attract mode.
- Checked: new screenshot scenario `node scripts/shoot.ts rout` (Wrath of Zeus on a packed lane →
  "Annihilation! ×9" centred over the fallen); full verify.
