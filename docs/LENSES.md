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

## #4 The Lens of Curiosity
*What questions does my game put into the player's mind? What am I doing to make them care
about these questions? What can I do to make them invent even more questions?*
- The big question Mythwar can plant is "what waits in the next age?" — five ages of new
  creatures, powers and citadels. But the game never asked it: the Ascend button's tooltip was a
  plain browser title with numbers, and nothing hinted at what ascending would bring.
- Change: **next-age preview.** Hovering, focusing or long-pressing (right-clicking) Ascend shows
  the next age: name and subtitle, its creatures, god power and citadel health, and the XP/tithe
  needed. Ages the player has never reached are a mystery — glowing black silhouettes, "???"
  for names and the power, "Who waits in the next age? Ascend to find out." Reaching an age once
  (`settings.ageSeen`, any mode but attract) reveals it for good. On phones the preview opens
  beside the button, towards the middle (the old placement assumed a left-hand anchor).
- Checked: screenshots `age-preview`, `age-preview-known`, `age-preview-mobile` (new shoot
  scenarios); full verify.

## #5 The Lens of Endogenous Value
*What is valuable to the players? How can I make it more valuable? What is the relationship
between value in the game and the player's motivations?*
- Gold is the currency of every decision, and its value is really *time*: 35 gold at +3/s is a
  pixie in nine seconds. The game showed an unaffordable card only as greyed out with a red price,
  so the player learned nothing about how close they were — and couldn't feel what a shrine or a
  surge (more gold per second) was worth.
- Change: unaffordable cards show a **savings bar** along their bottom edge (how much of the
  price you already have) and an **"in Ns"** estimate next to the price, computed from the
  income you actually have right now (shrines and a running Ley Surge included; online, gold
  committed to orders in flight is already subtracted). Holding a shrine visibly shortens every
  wait.
- Checked: desktop and phone screenshots (cards read "30 7s / 25 6s / 35 9s" with bars at
  matching fills); full verify.

## #6 The Lens of Problem Solving
*What problems does my game ask the player to solve? Are there hidden problems that arise as
part of gameplay? How can my game generate new problems so that players keep coming back?*
- Mythwar's problems: which lane needs help, which class answers what is coming, when to save
  for the next age, when to contest a shrine, where to aim the god power.
- The central one — *which class answers this lane?* — is solved *for* the player by the
  "Counter!" badge on the right card. Great while learning; but once the triangle is known it
  turns the core puzzle into "press the glowing card", and there was no way to take the
  training wheels off.
- Change: a setting **"Counter!" advice on cards** (on by default). Off, the cards stay neutral
  and the player reads the lanes themselves; the how-to's counter page mentions the switch. While
  at it, the compact (phone / short window) settings layout puts the about note under the
  sliders, so the longer toggle list doesn't push the panel under the sticky buttons.
- Checked: desktop + phone settings screenshots; full verify.

## #7 The Lens of the Elemental Tetrad
*Is the game designed with all four elements — mechanics, story, aesthetics, technology — in
mind? Could any element be improved to enhance the others? Are they in harmony?*
- Mechanics (counter triangle, lanes, ages, surges), aesthetics (procedural art, synthesized
  music per age) and technology (deterministic sim, lockstep multiplayer, offline PWA) are
  strong. **Story** was nearly absent: five age names with subtitles and creature blurbs in
  tooltips. Yet the ages *are* a story — a war escalating from a fae skirmish to a clash of gods
  — and the mechanics already climb it.
- Change: each age has a line of the war's story (`AgeDef.lore` in `src/sim/data.ts`), told
  where the escalation happens: under the opening banner ("In a moonlit wood the ley lines wake…
  two citadels claim the same crossing") and under each ascension banner ("The skalds begin to
  sing of this war…"); lore banners stay up 4.5 s instead of 2.8 s. The next-age preview shows the
  lore of ages already reached. The thread ties shrines/ley lines (mechanics) to the setting.
  On phones the banner now hangs below the resource pill and grows downward (the taller banner
  had covered the gold counter).
- Checked: opening-banner screenshots on desktop, landscape phone and upright phone; full
  verify.

## #8 The Lens of Holographic Design
*What elements of the game make the experience enjoyable? What detracts from it? How can I
change game elements to improve the experience?* — seeing everything at once: the experience,
the player, the mechanics, the interface and how they touch.
- Looked at a whole session at once: a scripted casual playthrough through the real UI
  (`scripts/playthrough.mjs`, Fae Wilds → Asgard), title → battle → results → back.
- What detracted were seams *between* systems — exactly what the earlier lenses had just
  added: (1) with the new Counter! advice switched off (#6), the results tip still told the
  player to "follow the Counter! badge"; (2) the Ley Surge (#2) was invisible after the battle:
  the results neither counted its gold nor pointed at it when the enemy won the surges.
- Change: `TeamStats.surgeGold` (saves from before default to 0); the results table shows
  "… from Ley Surges" under "Gold earned" when any surge gold was drawn; the post-defeat tip
  says so when the enemy out-drew the player at the surges; with the advice off, the generic
  tip teaches the triangle itself instead of the badge.
- Checked: unit tests for both new tips; results screenshot with surge gold; full verify.

## #9 The Lens of Unification
*What is my theme? Am I using every means possible to reinforce it?*
- Theme (now in `DESIGN.md`): *legends rising through the ages.* Checked every channel against
  it: battlefield, sky and ambient particles change per age; so do the citadels, the music's
  mode and instruments, the creatures, turrets and their projectiles, the god power and (since
  #7) the story line. Names are on theme too (generated player names are "Swift Griffin" and
  co.).
- The one channel that stayed the same from the fae wood to the halls of the gods was the
  interface: the cards and action buttons were the same purple in every age.
- Change: the HUD takes on the age's accent (`.hud.age-N`, `--age`): a tint in the cards' and
  action buttons' backgrounds and the action buttons' borders — leaf green, marble gold,
  glacier blue, lacquer vermilion, starlight. Subtle enough not to fight the class colours on
  the card borders.
- Checked: card/action strips in all five ages side by side; full verify.

## #10 The Lens of Resonance
*What is it about my game that feels powerful and special? When I describe it to people, what
ideas get them really excited? What is driving my instincts about how it should be?*
- What gets people excited when Mythwar is described is not "three lanes" — it is *the
  legends*: "you summon minotaurs, Fenrir, kitsune, a phoenix… and in the end an elder dragon".
  The instinct behind the game is that calling on a legend should feel like it.
- But every summons sounded the same: one generic rising blip, whether a pixie or the Elder
  Dragon answered. The art made each creature special; the sound made them interchangeable.
- Change: every creature answers with its own synthesized cry (`Audio.cry`): the treant creaks,
  the redcap cackles, the pixie twinkles, the minotaur bellows, hooves and a horn for the
  centaur, a gorgon's hiss, cracking ice for the Jötunn, Fenrir's howl, a valkyrie horn chord, an
  oni war drum, a tiger's growl, kitsune bells, the titan's rumble, a griffin's screech, a rush of
  flame for the phoenix, and a long roar for the Elder Dragon (never rate-limited away). The
  foe's cries are quieter and panned to their side.
- Checked: all 16 cries played for both teams in Chrome without errors (ad-hoc puppeteer run);
  full verify.
