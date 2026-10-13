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

## #11 The Lens of Infinite Inspiration
*What experience have I had that I want to share with others? In what way can I capture the
essence of that experience and put it into my game?*
- Mythwar's inspiration is twofold: the Flash classic *Age of War* (the tug-of-war through the
  ages) and the world's myths — Celtic, Greek, Norse, Japanese and Chinese. The first is in the
  mechanics; the second was only on the surface: names and one-line blurbs in hover tooltips.
  The *experience* worth sharing is the delight of those stories — Ariadne's thread, Týr's hand,
  the redcap's cap that must never dry.
- Change: a **Bestiary** (title screen and pause menu; Esc/Back return to where it was opened):
  a tab per age with its story line, every creature's portrait, class, range, cost and trait,
  plus a short, accurate note on the myth behind it (`src/ui/bestiary.ts`), and the age's god
  power and turrets. Ages the player has never reached (`settings.ageSeen`, from #4) are tabs
  named "???" with silhouettes — discovered in battle, not read in advance.
- Checked: screenshots `menu-bestiary`, `menu-bestiary-known` (Olympus tab), `mobile-bestiary`,
  the title on phone (five buttons in a row) and upright phone, the phone pause menu; full verify.

## #12 The Lens of the Problem Statement
*What problem, or problems, am I really trying to solve? Have I been making assumptions about
this game that have nothing to do with its true purpose? Is a game really the best solution?
How will I be able to tell when the problem is solved?*
- The problem (now in `DESIGN.md`): a tug-of-war strategy game that two people — or one and
  the machine — can pick up in a minute on any device and that keeps rewarding insight for many
  battles. A game is the solution by definition; the open question was the last one: *how do we
  know it is solved?* The criteria lived scattered in README numbers and memory.
- Change: four measurable success criteria (difficulty ladder, pacing, variety, side fairness)
  and **`npm run designcheck`** (`scripts/designcheck.ts`), which measures them in ~70 s with
  the scripted smart player and AI-vs-AI battles and prints PASS/FAIL with the numbers. Future
  balance-touching lenses run it.
- Result today: all pass — smart player vs Novice/Adept/Master/Mythic 100/73/23/0%, even
  battles median 18.4 min (16–26), every age's three classes at 22–46% of summons, left side
  wins 53%. Two findings for later lenses: even battles run long (the median sits just past
  Ragnarök at 18:00 — #39 Time), and **the AI never summoned the Elder Dragon** in 15 even
  battles (it spends gold as it comes and never banks the 2565 — #46/#47).

## #13 The Lens of the Eight Filters
*Does the game feel right? Will the intended audience like it enough? Is it well designed? Is it
novel enough? Will it sell? Is it technically possible? Does it meet our social and community
goals? Have the playtesters enjoyed it enough?*
- (1) Feel: yes — juicy, readable, consistent across devices. (3) Well designed: the design
  check (#12) passes. (4) Novel: three lanes + a counter triangle with formation rules + myth
  ages + surges — a distinct twist on Age of War. (5) Sell: free, installable, shareable — fine
  for its purpose. (6) Technically: done and tested on three engines. (7) Community: same-Wi-Fi
  multiplayer, quick messages, shareable results. (8) Playtesters: only bots so far (→ #91).
- **(2) Audience** was the weak filter. The newcomer's first battles are against Novice (the
  default), and measured with the scripted players (`botMatch` now reports ages): a competent
  player wins in 5.2 min, mostly still in Fae Wilds/Olympus (ages 1.4 vs 0.5 on average); simpler
  players never leave the first age. The newcomer — the audience the default exists for — never
  sees the war escalate, which *is* the essential experience (#1).
- Tried and rejected: simply letting Novice ascend more (ascendSkill 0.45–0.7). It showed more
  ages but out-tiered players who don't ascend yet — the "counter" bot dropped from 29/30 to
  14/30.
- Change: **Novice follows the player up the ages** (`AiProfile.followsAge`): it ascends
  readily (0.7), but never into an age the player hasn't reached. Result (30 games each): smart
  player 30/30 in 7.3 min reaching ~2 ages with the enemy following (1.6); counter bot 29/30
  (unchanged); spam bot 30/30 (was 22/30 — the old Novice sometimes ascended ahead of it). The
  difficulty card says "it only ascends after you do"; DESIGN.md documents it.
- Checked: `npm run designcheck` (ladder 100/73/23/0, all criteria pass); full verify.

## #14 The Lens of Risk Mitigation
*What could keep this game from being great? How can we stop that from happening?*
Risk register (what could still sink it, and what guards against it):
| Risk | Mitigation | Status |
|---|---|---|
| Multiplayer fails on a real Wi-Fi (firewall, guest network, VPN adapter, wrong address in the QR code) | address ranking that skips virtual adapters, "can't reach the server" help after a few seconds, firewall notes in docs, auto-reconnect | covered since phase 1 |
| A real iPhone/Android behaves differently from the emulators | three engines simulate identically (`enginecheck`), WebKit vs Chrome online battles (`mpengines`) | open — needs a human with two phones (PROGRESS: open questions) |
| A crash in one frame freezes the game | the frame loop is rescheduled before anything else runs | covered |
| Balance drifts as the lens iterations add mechanics | `npm run designcheck` (#12) after every balance-touching change | covered |
| **The new effects, sounds and HUD work make phones slow** | automatic battery saver after 4 s under 40 fps — but nothing measured the *cost* of each addition | **new: `npm run perfcheck`** |
- Investigation: CPU-throttled headless Chrome (DevTools' 4x throttle) dropped a late-game battle
  from 237 to 13 fps — but profiling showed the game's own JavaScript at 0.36 ms/frame unthrottled
  and the time going to *software canvas rasterization*, which headless Chrome does on the CPU
  and phones do on the GPU (and battery-saver resolution made no difference there). Throttled
  headless numbers are therefore not a phone stand-in.
- Change: **`npm run perfcheck`** (`scripts/perfcheck.ts`) measures what we control — the
  game's JavaScript per frame (simulation + AI, renderer command generation, HUD) in a busy
  late-game Celestial battle on a phone viewport with both sides casting powers — against a
  3 ms budget (≈ 12–18 ms on a budget phone). Today: 0.93 ms (sim+AI 0.01, renderer 0.84,
  HUD 0.08). Later lenses that add effects run it.

## #15 The Lens of the Toy
*If my game had no goal, would it be fun at all? If not, how can I change that? When people see
my game, do they want to start interacting with it, even before they know what to do?*
- Mythwar's pieces are toy-like — sixteen animated creatures with distinct fighting styles,
  spectacular god powers — but the only way to touch them was inside a battle with a clock, a
  foe and gold to husband. You couldn't simply *play with* a valkyrie, or set Fenrir against a
  wall of treants to see what happens.
- Change: a **Sandbox** (button on the "Choose your foe" screen, `?sandbox` URL): no foe AI,
  endless gold and XP, god powers always ready, citadels that can't fall (`World.endless`), both
  sides always in the same age (ascending takes the other side along). A **"For: You / For:
  Foe"** pill under the clock (key X) routes every order — summons, powers, turrets, blessings —
  to either side, so any match-up can be staged and watched. No autosave, no records, no coach
  tips (they'd be used up), restart keeps the sandbox, and the pause menu says it keeps no score.
  It is also a learning tool: try counters without pressure.
- Checked: 2 unit tests (no AI, endless gold, unbreakable citadel even against a huge single
  blow; orders for either side; shared ascension); screenshots on desktop and phone (`sandbox`,
  `mobile-sandbox`), the difficulty screen with the new button on a small phone; full verify.

## #16 The Lens of the Player
*In general, what does my player like? What don't they like? What would they expect to see in
a game? If I were in their place, what would I want to see? What would they like or dislike
about my game in particular?*
- The players: people with a phone or a PC and a few spare minutes, most of whom know Age of
  War or lane games vaguely, some of them playing with a friend on the same Wi-Fi. They like
  quick starts, fair fights, seeing themselves improve; they dislike walls of text, being
  crushed without knowing why, and choices they can't judge.
- Already served: skippable how-to, coach tips, a battle autosave, upright phones (the game
  rotates; text entry asks to turn the phone), tips after a defeat that name the mistake.
- Gap: the first real choice — "Choose your foe" — is one a new player can't judge. Four cards
  with skulls and adjectives; nothing says which is *for them*, and players who misjudge it either
  get crushed by Master or sleepwalk through Novice for weeks.
- Change: a ribbon on the right card — **"Start here"** on Novice until the first win anywhere,
  then **"Next challenge"** on the easiest difficulty not beaten yet (`recommendedDifficulty`),
  staying on Mythic once everything has fallen. It suggests, it doesn't select — the player's
  last choice stays selected.
- Checked: unit test for the recommendation; difficulty screenshots (desktop, QHD, small phone);
  full verify.

## #17 The Lens of Pleasure
*What pleasures does my game give players? Can these be improved? What pleasures are missing
from my experience? Why? Can they be added?*
- Present: sensation (art, synthesized music and cries), fantasy (commanding legends), challenge
  (four foes), fellowship (same-Wi-Fi battles, quick messages), discovery (silhouettes, bestiary,
  sandbox — lenses #4, #11, #15), surprise (Ley Surges, #2), triumph (rout callouts, #3).
- Missing: **pride in accomplishment beyond "won/lost"** — Schell's completion pleasure. The
  only lasting trace of a great battle was a W/L count and a laurel per difficulty; summoning
  your first Elder Dragon, holding all three shrines, or winning from a sliver of health left
  nothing behind.
- Change: **Feats** (`src/ui/feats.ts`) — fifteen deeds earned once and kept: beat each foe, win
  online, reach the Celestial age, summon the Elder Dragon, Annihilation (nine foes in a lane
  within 2.5 s), hold all three shrines, draw from three Ley Surges in a battle, a fifth-rank
  blessing, beat Adept+ in under 8 minutes, beat Adept+ above 75% citadel health, win after
  falling below 15%. Mid-battle feats pop a gold toast with a chime; victory feats are listed on
  the results ("New feats: …"). A "Feats n/15" chip above the title menu opens the list (earned
  ones glow). Not counted in attract mode or the sandbox; online wins count.
- Checked: 4 unit tests (unique ids, annihilation once and only in one lane, victory feats per
  foe/time/health, nothing for a defeat, online win); screenshots of the feats screen (desktop,
  phone), the title chip (desktop, phone) and the results line; full verify.

## #18 The Lens of Flow
*Does my game have clear goals? Are the player's goals the same as the ones I intended? Does
the game have parts that distract players to the point they forget their goal? Does it give a
steady stream of challenges, at the right level, accounting for the player's growing skill?*
- Goals are clear (topple the citadel, named at the start since #1) and distractions are few.
  The weak spot is the *stream of challenges across battles*: difficulty is a fixed choice. A
  player who keeps winning drifts into boredom unless they think of moving up; one who keeps
  losing to Master slides into anxiety and quits instead of practising against Adept. The
  results screen offered a fixed "Change foe" (a trip back to the four cards).
- Change: records keep the **current run** per difficulty (`DifficultyRecord.streak`: +n wins /
  −n defeats in a row). Beside the results tip sits the flow nudge (`flowSuggestion`): after a
  win, **"Face the Master →"** (the next foe up — one tap starts it); after three defeats in a
  row, **"Face the Adept →"** (one down, to sharpen the same skills). Rematch remains the primary
  button and "Change foe" stays: the nudge is a channel, not a push. (#16's ribbon does the same
  on the foe screen.) A first version replaced "Change foe" with the nudge — the smoke test
  caught that the results → foe screen → back path disappeared, so the nudge moved into the tip.
- Checked: unit tests for the suggestion and the streak bookkeeping; results screenshots
  (phone, desktop); full verify.

## #19 The Lens of Needs
*On what levels of Maslow's hierarchy is my game operating? How can I make it fulfill more
basic needs? On the levels it is already operating, how can it fulfill those needs better?*
- Self-actualization: mastering the triangle, ages and timing (four foes, `designcheck`).
  Esteem: records, laurels, feats (#17), the flow nudge (#18). Belonging: battles with friends on
  the same Wi-Fi, quick messages, per-opponent tallies.
- The level underneath was missing — **safety**: everything a player earns lives in one
  browser's storage. Clearing site data, a new phone, or simply switching from the PC (where
  the friend battle happened) to the phone (where the commute happens) — and the records, feats
  and discovered ages are gone or split. For a game whose promise is "PC ↔ phone", progress that
  can't cross devices undermines the rest of the pyramid.
- Change: **progress codes** (Settings → "Play on another device too?"). "Copy my code" puts the
  records, feats, discovered ages and online tallies on the clipboard as one `MW1:…` line (on a
  plain-http LAN page, where the clipboard API is unavailable, it shows the code ready to copy);
  pasting it on the other device and pressing "Load" **merges** — wins/losses keep the larger
  count, best times the faster, feats and ages are united, and loading the same code twice
  changes nothing. Nothing leaves the device unless the player copies it.
- Checked: unit tests (round trip + merge rules + idempotence; garbage, wrong prefix, non-JSON
  and non-object payloads rejected without side effects); settings screenshots (desktop, phone);
  full verify.

## #20 The Lens of Judgment
*What does my game judge about the players? How does it communicate this judgment? Do players
feel the judgment is fair? Do they care about the judgment? Does the judgment make them want to
improve?*
- Mythwar judged one bit: won or lost. A crushing 6-minute win with the citadel untouched and a
  23-minute scrape with 40 health left were the same "Victory", and the record kept only the
  fastest time. The numbers in the results table describe a battle; they don't *judge* it, so
  there was nothing to improve on once a foe had been beaten.
- Change: a transparent **three-star rating** (`battleStars` in `src/ui/settings.ts`): ★ for the
  victory, ★ for keeping the citadel above half health, ★ for winning within the foe's par time
  (8/12/14/16 minutes for Novice/Adept/Master/Mythic — a little slower than a strong player's
  typical win). Each star is shown *with its reason* next to the battle length on the results,
  so the judgment is legible and feels fair; the best rating per foe is kept and shown on its
  card ("3W · 1L · best 7:42 · ★★☆") — a reason to come back to a foe already beaten.
- Checked: unit tests (each star's condition, par per foe, best rating kept); results
  screenshots (desktop, phone victory/defeat — the stars share the battle-length line so the
  phone layout doesn't grow); full verify.

## #21 The Lens of Functional Space
*If all the surface elements were stripped away, what is the game's functional space? Is it
discrete or continuous? How many dimensions? What are its boundaries? Are there sub-spaces?*
- Stripped down, Mythwar is three discrete, parallel, one-dimensional tracks of length 1000,
  bounded by the two citadels and coupled only by the shared citadel health and the player's
  gold and attention. Each track has functional **sub-spaces**: the shrine zone (±80 around the
  middle — drawn, with a capture ring), and at each end the zone a gate's ward (170) or turret
  (230–280) can hit, where attackers take fire before they can strike the citadel.
- The second kind was invisible. Players learned it by losing creatures ("lone creatures melt
  there", the coach says after three deaths at the gate), and couldn't see that a turret pushes
  the zone further out, or that Ragnarök silences the wards and shrinks it.
- Change: each gate's **reach** is drawn as a faint dashed line across its lane in the owner's
  colour, at the furthest of the ward's and the turret's range (wards drop out in Ragnarök); it
  brightens and pulses while foes stand inside it. Both sides' lines show, so the space between
  them — where fights are fair — is readable at a glance. The ward coach tip points at it.
- Checked: screenshots in Fae Wilds and Asgard (subtle while idle, bright with a foe inside);
  `perfcheck` 0.94 ms (unchanged budget); full verify.

## #22 The Lens of Dynamic State
*What information is known by all players? By some or only one? By the game only? Would the
game be better if more or less were known? Can information change state during play?*
- Public: every creature, citadel health, ages, shrines, turrets, blessings (listed in the
  blessing panel), the foe's power readiness, and since #2 the surges. Known only to its owner:
  gold, XP (the foe's age badge pulses when they can ascend — a deliberate partial reveal),
  and the **summoning queue** — the foe's plan. The game reveals the queue only at the last
  moment (a portal flare 1.2 s before a creature steps out).
- Hidden plans are good — they make reading the foe a skill. But the information never
  *changed hands*: nothing in the game let you earn a better view of the foe's intentions.
- Change: **ley sight.** While you hold a lane's Ley Shrine, the foe's summons queued for that
  lane appear as small portraits above their gate, the one in training with a progress ring in
  the foe's colour. Information becomes part of what a shrine is worth, and it changes state
  with the shrine's owner — fight for the middle, and you see what is coming down it. Pure
  presentation (no simulation change), so online battles stay in sync; a coach tip explains it.
- Checked: screenshot with all three shrines held and a five-deep foe queue (one to three
  portraits per lane, training ring on the next); full verify.

## #23 The Lens of Emergence
*How many verbs do my players have? How many objects can each verb act upon? How many ways can
players achieve their goals? How many subjects do the players control? How do side effects
change constraints?*
- Verbs: summon (into one of three lanes), cast (one power per age), build/sell turrets, bless,
  ascend. The creature traits already combine (packs vs sweep, mystics behind guardians, gorgon
  slows, foxfire bounces). But the **god powers were islands**: each did its damage and its status
  (root, freeze) and nothing else in the game cared about that status — the side effect didn't
  change anybody's options.
- Change: **brittle.** A creature frozen solid by Fimbulwinter takes 50% more damage from
  everything (creatures, turrets, wards, powers — `BRITTLE_MULT` in `damageUnit`) until it
  thaws; blows against it chip visible ice shards. Fimbulwinter turns from "damage + pause" into
  a *setup*: freeze the lane your Jötunn are cleaving, freeze a wave inside your turret's reach,
  freeze their push right before your own creatures arrive — or, as the victim, pull back for
  3 seconds. The foe's freeze works the same way on you. The power's blurb (card, bestiary) says so.
- Measured (`designcheck`, 60 games/foe, 30 even battles): difficulty ladder intact (100/63/33/3%);
  sides 53%; even AI battles 20.2 min median (19.6 without brittle) — just past the 20-minute
  line; pacing is #39's job and is noted there.
- Checked: unit test (frozen → ×1.5); Fimbulwinter screenshot; full verify.

## #24 The Lens of Action
*What are the operational actions in my game? What are the resultant actions? Which resultant
actions would I like to see? Am I happy with the ratio? Which actions do players wish they could
do that they cannot?*
- Operational actions: select a lane, summon (tap/drag), cast, build/sell a turret, bless,
  ascend, cancel. Resultant actions: countering, contesting shrines, soaking a push with a
  power, saving for an age, racing to a surge (#2), freezing a wave for a combo (#23).
- What players of lane games wish they could do — and Mythwar couldn't — is **choose when to
  attack**: every creature walks the moment it is summoned, so a careful player's army arrives
  in a trickle and melts in the wards one creature at a time (the coach even has a tip for it).
  "Gather, then push" was only possible by not summoning, which wastes time.
- Change: a new verb, **hold the line** — a per-lane stance (`stance` command; `PlayerState.hold`).
  The shield under each lane's ▶ marker (or G for the selected lane) holds that lane: its
  creatures advance no further than just past the shrine (so holding also holds the shrine),
  still fighting anything in reach; a war banner in the owner's colour marks the line for both
  players. Tap again and the wave goes in together. One operational action, many resultant
  ones: massing a push, guarding the shrine through a Ley Surge, baiting the foe into your
  wards, keeping a lane quiet while you fight elsewhere.
- Plumbing: simulation (stance in movement, snapshot, hash; old saves default to advance),
  server validation, protocol v6, in-flight checks online, sandbox routing, keys panel, README,
  DESIGN.md, a coach tip after 2:30 for players who never used it. The AI keeps advancing (it
  is unaffected by the player's stance).
- Checked: unit tests (stops just past the shrine and captures it, flyers too; other lanes
  unaffected; released lanes march on; mirrored for the right-hand side; survives a save;
  validation accepts/rejects); screenshots (desktop: held middle lane with banner; phone);
  full verify.

## #25 The Lens of Goals
*What is the ultimate goal of my game? Is it clear to players? If there are various goals, do
players understand them? Are they related to each other in a meaningful way? Are my goals
concrete, achievable and rewarding? Do I have a good balance of short- and long-term goals? Do
players have the chance to decide on their own goals?*
- Ultimate goal: topple the citadel (named at the start since #1). Short-term: the next counter,
  a shrine, a surge, the next age. Long-term: the four foes, feats (#17), the best star rating
  per foe (#20). Self-chosen: which feats to chase, which stars to go for.
- The stars, though, were a *retrospective* judgment: their two harder conditions — keep the
  citadel above half, finish within par — only appeared on the results screen, when nothing
  could be done about them. A goal the player can't see while acting on it isn't a goal.
- Change: the pause menu (single player) lists the battle's **star goals live** — "Stars to win:
  ★ Victory · ★ Citadel above half (now 72%) · ★ Within 12 minutes (3:39 left)", turning to ☆
  when slipping or gone — and the moment one slips the HUD says so: "Citadel below half — win
  back its health (ascend, Bastion) to keep the second star" (re-armed above 55%), "12 minutes
  have passed — the third star is out of reach". Short-term choices now connect to the
  long-term rating.
- Checked: unit test for the goals line (in reach / slipping / passed); phone pause screenshot;
  full verify.

## #26 The Lens of Rules
*What are the foundational rules of my game? How do they differ from the operational rules? Are
there "house rules" players want? Are there different modes? Who enforces the rules? Are the
rules simple to understand, or is there confusion?*
- Foundational rules (the simulation): three lanes, the counter triangle with its formation rules,
  gold/XP/ages, shrines, surges, wards, Ragnarök. Operational rules (what the player does) are
  taught by a five-page how-to plus contextual coach tips. The simulation enforces everything,
  online included (the server validates the shape of every order, every replica the rest).
  Modes: battle, online battle, sandbox (#15). House rules — custom battle settings — are for #71.
- Confusion check: the phase-2 lenses added three operational rules (hold the line #24, ley
  sight #22, brittle frost #23) that were taught only by coach tips — which a returning player
  who has dismissed tips never sees, and which can't be looked up.
- Change: a sixth how-to page, **Tactics** (hold the line with the shield or G and the dashed
  reach line; ley sight; brittle frost), so every rule a player can act on is written down in
  one place, reachable from the title and the pause menu. A screenshot scenario
  (`mobile-howto-6`) keeps it in view on small phones.
- Checked: page on desktop and a 667×375 phone; full verify (the first-battle how-to flow and its
  skip button still work).

## #27 The Lens of Skill
*What skills does my game require from the player? Are there categories of skill this game is
missing? Which skills are dominant? Are these skills creating the experience I want? Are some
players much better at these skills than others? Can players improve their skills with practice?
Does this game demand the right level of skill?*
- Skills: *reading* (what's coming down each lane), *knowledge* (the counter triangle and the
  formation rules), *economy and timing* (when to save for an age, when to bless), *attention*
  (three lanes at once), a little *dexterity* (fast taps and drags). The dominant one — and the
  one the whole design rests on — is **countering**. Yet nothing measured it: a player could
  lose ten battles without learning that half their army was walking into the class that beats
  it. Skill improves with practice only when practice gets feedback.
- Change: the simulation counts each side's **creature damage by class matchup**
  (`TeamStats.classDamage`: all / into a class it beats / into one that beats it; turrets, wards
  and powers excluded). The results table shows **"Creature damage that countered"** for both
  sides (e.g. 56% vs 41%), and when a defeated player's share is poor (< 30% countered and more
  damage into bad matchups than good ones) the post-battle tip names it: "only 20% of your
  creatures' damage hit a class they beat, and 50% hit one that beats them…".
- Layout: to keep the results within a 900-px-high window (the smoke test caught the buttons
  being pushed below the fold), the new row replaces the per-lane kills row, and #8's Ley Surge
  row folds into "Gold earned" ("560 (210 surge)").
- Checked: unit test (the split by matchup, non-creature damage excluded, the tip); results
  screenshot; full verify.

## #28 The Lens of Expected Value
*What is the actual chance of a certain event? What is the perceived chance? What value does the
outcome of that event have? Can it be quantified? Are there intangible aspects of value? Do I
need to make my game more transparent so players can compute expected value?*
- Mythwar has little chance but many *value* comparisons: a creature now, or a turret, or a
  blessing, or saving for the age. Creatures show their price and (on hover) their health and
  damage per second; turrets their stats. **Blessings** only showed a percentage — "+10% damage
  for all your creatures" — which can't be weighed against a 154-gold Valkyrie: +10% of *what*?
  The value depends on the army on the field, the age, the citadel — so players either ignored
  blessings or bought them blindly.
- Change: each blessing row says what its **next rank is worth right now, in the game's own
  units**: Might — "+21 damage per second for the 7 creatures on the field now — and all to
  come"; Vitality — "+46 health for each new Frost Jötunn, and as much in proportion for every
  other new creature"; Bastion — "+975 citadel health at once (and after every ascension), +7.5%
  ward and turret damage". The numbers follow the battle as the panel stays open.
- While at it: centre banners (opening, ascension) no longer draw over an open panel — found
  while screenshotting this one.
- Checked: blessing panel on desktop (Asgard army) and phone (empty field, first age); full verify.

## #29 The Lens of Chance
*What in my game is truly random? What parts just feel random? Does the randomness give the
players positive feelings or negative ones? Would changing my probability distribution curves
improve my game? Do players have the opportunity to take interesting risks?*
- Truly random (seeded, identical on every device): Ley Surge timing and lane (#2, foretold, so
  it feels fair), which foe each of Zeus's seven bolts strikes (already preferring foes not yet
  struck), where Starfall's fourteen meteors land, and coin tosses for dead heats. Combat itself
  is deterministic. Feels random: the foe's next summon (mitigated by portal flares and #22's ley
  sight).
- The negative randomness was **Starfall**, the final age's power: each meteor aimed at a foe
  picked uniformly, so one straggler at the gate drew as many stars as each member of the army
  in midfield — a tenth of the shower could fall on a single creature, and the cast's strength
  felt like luck rather than timing.
- Change: meteors pick targets **weighted by crowding** (each foe weighted by the square of how
  many foes stand within a meteor's radius, `crowdPick` in `src/sim/powers.ts`), so stars fall
  thickest where the enemy masses and casting into a packed lane is reliably rewarding — the
  skill is *when* to cast. A straggler still catches the odd one. The blurb says so.
- Checked: unit test over 10 seeds (a straggler and a crowd of six: was ~20 of 140 meteors on
  the straggler by uniform choice, now < 6); `designcheck` and full verify.
- Follow-up in the same run (maintenance, not a lens): the design check's pacing criterion had
  drifted over the line (even AI battles 20–21 min median after #23/#29 strengthened defence and
  late powers). Measured options over 30 battles: Ragnarök at 16:00 → 19.8 min; siege ramp
  +200%/min → 18.3; **+150%/min → 18.8** (chosen, the gentler fix). DESIGN.md updated.

## #30 The Lens of Fairness
*Should my game be symmetrical? Asymmetrical? What is more important: that it is a meaningful
challenge, that players feel they have a chance, or that they see it as fair?*
- Mythwar is symmetrical by design — same rules, same rosters; the only asymmetry is the AI's
  income handicap (Novice 50% … Mythic 120%), a deliberate *challenge* lever shown on the foe
  cards. Online, both players see themselves on the left in blue; the simulation is checked for
  side bias (mirror duels, swapped duels, mirrored armies of every creature, dead heats) and
  `designcheck` measures side wins in AI battles.
- Gap 1 — the guarantee had fallen behind the mechanics: four phase-2 systems (hold the line,
  brittle frost, surges, crowd-weighted meteors) were never checked for side bias, and the
  movement code for holding and the update order of frozen units are exactly where "team 0 is
  updated first" bugs hide. Added a mirrored test for seven creatures (pack hunters, flyers,
  cleavers, ranged): both sides hold the middle lane, must wait at mirrored spots, then charge
  together — with and without freezing everyone mid-fight — and must end in mutual destruction.
  It passes.
- Gap 2 — perceived fairness at the moment of judgment: after losing to Master, players look at
  "Gold earned 4,120 vs 5,300" and feel cheated or not; the handicap was only on the foe card.
  The results header now says it beside the foe's name — "Adept · 90% income" (with a tooltip:
  gold over time and from shrines; kill gold is the same) — so the gold rows read fairly.
- Checked: the new mirrored test; results screenshot (phone); full verify.

## #31 The Lens of Challenge
*What are the challenges in my game? Are they too easy, too hard, or just right? Can my
challenges accommodate a wide variety of skill levels? How does the level of challenge increase
as the player succeeds? Is there enough variety in the challenges? What is the maximum level of
challenge?*
- The challenge axis was one-dimensional: four foes of rising skill and income (Novice …
  Mythic; scripted smart player 100/73/30/7%). That accommodates many skill levels and climbs
  with success (#16, #18), but the variety is thin — every battle is "the same battle, against
  a better general" — and the maximum is reached at Mythic. A player who has beaten Master
  but finds Mythic's +20% income a wall had nothing in between; one who beat Mythic had nothing
  after it.
- Change: **Trials** — three optional handicaps on the foe screen (chips under the cards,
  remembered between battles), enforced by the simulation (`PlayerState.trials`, kept in saves):
  **Glass Citadel** (your citadel has half its health in every age), **Godless** (no god powers),
  **No Walls** (no turrets). Each removes a crutch and changes *how* a battle must be won (no
  emergency power, no turret to hold a lane, no margin for leaks), and they combine with any
  foe: Adept + Godless is a different puzzle from Master, and Mythic + all three is the new
  ceiling. Their buttons grey out in battle, the coach skips tips for what's switched off, the
  results list the trials fought under, and **Trial by Fire** (feat #16) rewards beating Adept
  or harder under all three.
- Checked: unit tests (half citadel before and after ascending, power and turret refused, kept
  by save/load; the feat); foe screen on desktop and a 667×375 phone; full verify.

## #32 The Lens of Meaningful Choices
*What choices am I asking the player to make? Are they meaningful? How? Am I giving the player
the right number of choices? Are there any dominant strategies?*
- Choices: lane, class, when to spend vs save (ages, blessings, the dragon), turret type, which
  blessing, when to cast, and since #24 when to hold. `designcheck` shows no dominant class in
  any age (22–46% of summons each).
- The odd one out was the **Elder Dragon**: the final age's one big decision — bank ~2,600 gold
  for a single legend, or keep the waves coming? Equal-gold tests (`classwar`'s `battle`) say
  it is a real choice: one dragon keeps 59–86% of its value against the same gold of Titans,
  Griffins, Phoenixes or a mix — strong, but only one may live at a time and it costs the army
  you didn't summon meanwhile. Yet the AI *never made it* (0 dragons in 15 even battles, #12):
  it spends gold as it comes, so it never has 2,600 at once. The choice was meaningful for the
  player only, and the player never saw the game's most spectacular creature on the other side.
- Change: in the final age, able AIs (Adept and up) **bank gold for the dragon** — a reserve of
  its cost × their counter skill — while the lanes are calm and Ragnarök hasn't begun, and
  summon it once affordable. A first version saved regardless of the situation: even AI battles
  stretched to a 24.8-minute median and the left side won 73% — rejected; restricting it to calm
  moments before Ragnarök fixed both.
- Result: against the scripted smart player, Master now summons the dragon in 9 of 20 battles
  (16 reached the final age), Mythic in 8 of 20, Adept 1. `designcheck`: all pass (ladder
  100/77/17/3%, pacing 18.6 min, sides 47%). Full verify.

## #33 The Lens of Triangularity
*Do I have triangularity now — a safe option with a low reward and a risky one with a high
reward? If not, how can I get it? Is my attempt balanced — are the rewards commensurate with the
risks?*
- Existing triangles: the Elder Dragon (one big unit vs a steady stream), holding a lane (#24:
  a bigger wave later vs constant pressure), Godless/No Walls/Glass trials (#31) for the
  ambitious. The *central* decision of the game — when to ascend — had none: the age opened at a
  fixed XP mark, and the only choice was how fast to save the tithe.
- Change: **rushing an age.** From 75% of the required XP, a side may ascend for a double tithe
  (`RUSH_XP`, `RUSH_COST`, `World.ascendCost`). Safe: wait for the XP, pay the normal tithe.
  Risky: the next age's creatures and stronger citadel a minute or two early, paid for with the
  army that gold would have bought — strong when the lanes are quiet or the foe is about to
  out-tier you, ruinous when it leaves a lane open. The Ascend button shows the rush price with
  a dashed border and never chimes for it (the chime is for a normal ascension); the age preview,
  the how-to and the README explain it. Online, the in-flight gold check uses the real price.
- Balance: the AIs never rush (they ascend at full XP only) and the scripted players were made
  to as well, so calibration is unchanged; `designcheck` all pass.
- Checked: unit test (70% refused, 80% at double price, full XP at the normal price); Ascend
  button screenshot; full verify.

## #34 The Lens of Skill vs. Chance
*Are my players here to be judged (skill) or to take risks (chance)? Skill-based games tend to
be more serious than chance-based games: is my game serious or casual? Are parts of my game
tedious? If so, does adding chance enliven them? Do parts feel too random? Will replacing chance
elements with skill or strategy elements make them feel more controllable?*
- Mythwar is a skill game played in a casual frame: the scripted "smart" player beats Novice
  100% and Mythic ~3%, the gap between bots of different skill is huge, and chance only seasons
  it. Where chance lives it should *enliven* (the Ley Surge's lane and timing, #2; where a
  meteor lands in a crowd, #29) and never decide whether a decision was right.
- Too random: **Wrath of Zeus** — its seven bolts picked random foes, so casting it while the
  enemy front was at your gate might spend half the bolts on creatures still in midfield. The
  player chose the moment and the lane; luck chose the outcome.
- Change: each bolt strikes **the foe nearest your citadel that hasn't been struck yet** (then
  starts over), so Zeus answers the most pressing threat and its value follows from the player's
  timing. (Splash on neighbours as before.) Blurb updated.
- Checked: unit test for both sides (ten immobile foes: the bolts hit the seven nearest, in
  order); full verify.
- Pacing investigation (for #39): `designcheck` now uses 30 even battles (15 swung the median by
  ±1.5 min). Even AI battles sit at a 19.3–20.5-minute median, on the 20-minute line; 20 of 30
  run into Ragnarök. Measured levers, none of which moved the median: Ragnarök at 16 or 17 min
  (it already starts at ~15–16.5 via "3 min after both reach the final age"), 2 minutes instead
  of 3, siege ramp ×2, crumble after 6 instead of 10 minutes. Per-battle traces show the
  bottleneck is *reaching* a defended Celestial citadel, not damaging it. Left for #39 (Time),
  with the pacing criterion red until then.

## #35 The Lens of the Head and Hands
*Are my players looking for mindless activity, or an intellectual experience? Would adding more
places that involve problem solving make it more interesting? Are there places where the game
should be more physical — where dexterity, or simply efficient handling, matters?*
- Mythwar is a head game with light hands: what matters is *what* you summon *where* and *when*;
  the hands only have to turn decisions into orders before the moment passes. More dexterity
  challenge (aimed powers, timing minigames) would fight the design — a phone player with a
  thumb and a PC player with a mouse must be equals online. The right goal for the hands is
  **efficiency**: the shortest path from intention to order.
- Paths today: tap a lane then a card (2 taps), drag a card onto a lane (1 gesture), keys 1–4
  with W/S or Q/A/Z for lanes, Space for the power, G to hold (#24). The gap is the mouse hand on
  desktop: to change lanes it had to travel to the lane (or the other hand to the keyboard)
  between every summon into different lanes.
- Change: the **mouse wheel over the battlefield steps the selected lane** (up = the lane
  above; trackpad deltas accumulate so one notch is one lane). Point anywhere, flick, press a
  number or click a card. Keys panel and README updated; paused or attract-mode battles ignore it.
- Checked: new smoke step ("mouse wheel steps the selected lane": 2 → 1 → 2); full verify.

## #36 The Lens of Competition
*Does my game give a fair measurement of player skill? Do people want to win? Is winning
something players can be proud of? Can novices meaningfully compete? Can experts? Can experts
generally be sure they will defeat novices?*
- Measurement: fair and skill-heavy (mirror tests, `designcheck`; online every replica runs the
  same simulation and the server's room keeps a running score). Pride: feats (#17), stars
  (#20). Experts can compete with each other and with Mythic.
- **Can novices meaningfully compete? Online, no** — and online here means friends on the same
  Wi-Fi, often of very different experience. Mythwar's skill gradient is steep (a "smart" bot
  beats a "counter" bot almost always), so the expert friend wins every time and the evening is
  over after two battles. Against the AI the novice has Novice; against a friend they had nothing.
- Change: **handicaps in the battle room** — each player may take any of the Trials from #31
  for themselves (Glass Citadel, Godless, No Walls). The room shows both players' handicaps
  under their names; changing them takes both seats out of Ready, so nobody starts against
  handicaps they haven't seen; the server builds the battle with them and every replica
  simulates them identically (protocol v7: `trials` message, `SeatInfo.trials`, `start.trials`).
  The results list the trials fought under. The expert can now *choose* how hard to make it —
  a fairer measurement of skill between two people who know each other's level.
- Checked: server test (sanitizing, un-readying, the start message, both replicas apply the
  handicap and keep hashing equal); multiplayer smoke with screenshots (room on desktop and
  phone); full verify.

## #37 The Lens of Cooperation
*Cooperation requires communication, trust and synergy. Are players able to communicate? Do they
need to? Can they build trust? Is there synergy? Are there different roles?*
- Mythwar had **no cooperation at all**. Two friends on the same Wi-Fi — the very situation the
  multiplayer was built for — could only fight each other; with a big skill gap (#36) that is a
  short evening. Many pairs would rather face something *together*.
- Change: **co-op rooms.** "Battle: Versus · Together vs Novice / Adept / Master / Mythic" in the
  battle room. In co-op both seats command the left side — one citadel, one purse — against an AI
  that **runs on the server**: it thinks against the authoritative world at the same point a local
  game would (after the players' orders, before the step), and every order it gives is sent to
  both devices like a player's (`ScheduledCommand` without a seat), so the replicas need no AI and
  stay in lockstep. Players' orders now carry their seat so each device still recognises its own.
  Either ally can step away or leave and the other plays on; the battle waits only when both are
  gone, and is lost when both are gone for good. Victories count for both seats in the room, the
  HUD names the ally ("You & Bo · Asgard"), the results speak of "you and Bo", co-op wins don't
  enter head-to-head tallies, and a new feat — **Shoulder to Shoulder** — marks the first one.
- Communication and synergy: the quick messages work between allies; the shared purse *forces*
  coordination (who spends, who saves for the age), and natural roles emerge (one watches the top
  lanes and casts, the other builds and blesses). Handicaps (#36) combine: both allies' trials
  apply to the shared side.
- Found on the way: creating the AI on the server set the AI side's income handicap, which the
  replicas never applied — the end-to-end test showed one desync per battle (self-healed by a
  snapshot). The new `battleWorld()` builds every battle's starting world in one place for server,
  replicas, tests and the `mpbot`.
- Checked: server test (Mythic co-op: both seats' orders go to team 0 with their seats, the AI's
  orders reach both, every hash matches, an ally leaving neither ends nor pauses the battle);
  multiplayer smoke extended with a co-op battle in two browsers (allies unmirrored on the left,
  shared orders, 0 desyncs, HUD ally name, the ally plays on alone); full verify. Protocol v8.

## #38 The Lens of Competition vs. Cooperation
*If 1 is pure competition and 10 pure cooperation, what number should my game be? Can I give
players a choice? Does my audience prefer competition, cooperation, or a mix? Is team
competition right for my game?*
- With #37 Mythwar spans the scale: versus (1), co-op against the AI (9), single player against
  the AI. The choice is the players' — a chip row in the room — and it can change between battles.
  (2-vs-AI team competition, or 2-vs-2, would need four devices and a much bigger field; not for a
  same-Wi-Fi pair.)
- What had *not* moved along the scale was the communication layer: the quick messages were
  versus pleasantries ("Good luck!", "Well played!", "Oops!") — useless to allies who need to say
  *where*. Cooperation without voice (phones in a noisy room, a PC across the flat) needs a few
  sharp, tactical words.
- Change: **co-op calls.** Between allies the quick-message menu offers "Help top!", "Help
  middle!", "Help bottom!", "Saving gold!", "Push now!" and "Thanks!"; versus keeps the
  pleasantries. An ally's call appears by your own side with their name ("Bo: Help middle!") with
  a chime, and **a lane call lights that lane** with a golden pulse — on the ally's screen and the
  caller's — so the request is read at a glance. The server relays the new phrases like the old
  (fixed phrases, rate-limited); "Opponent's quick messages" in Settings still silences them.
- Checked: multiplayer smoke (co-op menu offers the calls, not the pleasantries; A's "Help
  middle!" reaches B with A's name and lights B's middle lane); full verify.

## #39 The Lens of Time
*Are my games too short? Too long? Can I give players a choice about this? Are there long
periods of downtime? Is the rhythm right?*
- Measured: a competent player's battle against Adept or Master takes 14–16 minutes; even AI
  battles had drifted to a 20.5-minute median (#34's investigation: 2 of 3 run into Ragnarök and
  then grind against a defended Celestial gate — the ward-silence alone didn't break it). For a
  game played on phones in short sessions, a quarter of an hour is long, and *every* battle being
  that long leaves no choice.
- Change 1 — **Ragnarök breaks stalemates:** the gate turrets fire at half their rate once it
  comes (the wards already fall silent). Even AI battles: median 20.5 → 19.2 min, p75 22.0 →
  20.2; the turrets players paid for keep half their bite. Banner, how-to, DESIGN updated.
- Change 2 — **Quick battles** (a chip on the foe screen, remembered): XP ×2.2, both sides start
  with 300 gold, Ragnarök at 10:00 (or 90 s after both reach the final age), siege ramp ×3,
  crumbling after 4 minutes of it (`QUICK` in data.ts; a world option kept in saves and the
  hash). Tuned over three rounds of measurement: smart player vs Adept 14.4 → 10.9 min, vs Master
  16.2 → 9.8 min, still climbing ~3 ages; vs Novice unchanged (those end early anyway). The par
  for the third star is two thirds of the standard one; best times count standard battles only;
  the results say "Quick battle".
- Checked: unit tests (quick: richer start, faster XP, earlier Ragnarök, kept by saves; turret
  half-rate in Ragnarök; quick par/best rules); `designcheck` all pass (pacing 19.2); foe-screen
  screenshot; full verify.

## #40 The Lens of Reward
*What rewards is my game giving out? Could it give others? Are players excited when they get
them, or bored? Rewards that mean nothing? How do the rewards relate to each other? Are they
building up?*
- Rewards today: gold popups and flying coins (every kill), rout callouts (#3), shrine and surge
  gold (#2), the ascension fanfare and banner with a line of story (#7), discovered creatures in
  the age preview and bestiary (#4, #11), feats (#17), the star rating (#20), laurels per beaten
  foe on the title.
- Two of them didn't relate: the stars judged each battle but *nothing remembered them visibly* —
  the best rating per foe sat in a tooltip-sized record line on the foe card — and earning a
  better rating than ever went unremarked. A reward the game doesn't acknowledge doesn't build up.
- Change: when a battle earns a **better rating than ever against that foe**, the results say so
  beside the new feats — "New best vs Master: ★★★" — and the **title laurels show each foe's best
  stars** (Adept ★★☆), so the meta-progress is visible every time the game opens. The rewards line
  stays one line (a separate one pushed the results buttons below a 900-px fold — the smoke test
  caught it).
- Checked: results screenshot (feats + new best on one line), title laurels; full verify.

## #41 The Lens of Punishment
*What are the punishments in my game? Why? Do players see them as fair? Why or why not? Can they
be turned into rewards? Is there a strong enough punishment to make for high stakes? Are the
punishments as interesting as the rewards?*
- Punishments: lost creatures and their gold, lost shrines (income, ley sight), citadel damage,
  falling an age behind, defeat; leaving or restarting after the first minute counts as a defeat
  (said on the pause screen); a 50% turret refund. High stakes come from the shared citadel. All
  of these follow from decisions and are visible — fair.
- One wasn't: **a god power cast into a lane with no foes was simply wasted** — 50 to 65 seconds
  of the most powerful action in the game gone, with no effect and no explanation, almost always
  because of a slip (a tap on the wrong lane while targeting, Space with the wrong lane selected).
  A punishment for a fumble rather than for a decision teaches nothing and feels unfair.
- Change: the simulation **refuses a power on a lane without foes** ("No foes in that lane"; the
  charge is kept) — in single player, online (the in-flight check uses the same rule) and in the
  sandbox. The AI never cast into empty lanes anyway. Real decisions keep their consequences:
  casting on two stragglers when a wave is about to arrive still costs the full cooldown.
- Checked: unit test (refused on an empty lane, charge kept, cast on the lane with a foe); smoke
  updated to place foes before its casting checks; full verify.

## #42 The Lens of Simplicity/Complexity
*What elements of innate complexity do I have? Can it be turned into emergent complexity? Do
elements of emergent complexity arise? Are there elements that are too simple?*
- Innate complexity (rules to learn) grew in phase 2: surges, ley sight, brittle frost, hold the
  line, rushing, trials, quick battles. Most of it is *passive* — it shows up on the field when it
  matters (a flickering shrine, portraits over a gate, ice chips) and asks nothing of a newcomer.
  Emergent complexity comes from how these combine (freeze a wave inside your turret's reach; hold
  a shrine through a surge to keep its ley sight; rush an age while the foe is busy at a surge).
- What is *not* passive is new UI: three shield buttons under the lane markers that a first-time
  player sees in the opening second, before they have summoned anything — one more thing to
  wonder about while learning the core loop (pick a lane, tap a card).
- Change: **progressive disclosure** — in a newcomer's battles (tips on, the hold tip not yet
  seen) the shields stay hidden until 2:30, when the coach introduces them ("Tap the shield under
  a lane's ▶ marker to hold that lane…"); after that, or with tips off, they are always there.
  The key G works throughout, and the how-to's Tactics page documents it for anyone reading ahead.
- Checked: full verify (fresh profiles in the smoke tests never needed the shields early).

## #43 The Lens of Elegance
*What are the elements of my game? What is the purpose of each? Elements with only one purpose:
can several be combined into one? Elements with several purposes: can they do more?*
- Several-purpose elements are where Mythwar is already elegant: a **shrine** is income, ley sight
  (#22), the surge prize (#2) and — since #24 — the place a held lane stops; the **gate turret**
  is defence, its reach line (#21) and a Ragnarök variable (#39); **Trials** are a single-player
  challenge (#31) *and* a multiplayer handicap (#36), one system with two framings.
- The inelegant spot was the results screen after a win, where two elements did one job: the tip
  said "Ready for more? Try Master." and the button beside it said "Face the Master →" (#18).
- Change: the button keeps the job of pointing at the next foe; the **tip now points at the
  stars** — "Victory — now keep your citadel above half for the second star: turrets and Bastion
  help", "…win within 12 minutes for the third star: ascend sooner, push with a held wave", "A
  flawless victory: all three stars." — and after a flawless Mythic win at the Trials (#31). One
  line of text, a purpose of its own, linking the judgment (#20) to concrete play.
- Checked: unit tests for each win tip; smoke ("Face the Master" offered after a win); full verify.

## #44 The Lens of Character
*What are my characters' traits? Do they have a voice? Are they consistent, memorable? Are
there characters players can identify with?*
- The creatures have character (art, cries #10, myths #11). The **opponent** — the one character
  the player spends every single-player battle with — had none: "Novice", "Adept", "Master",
  "Mythic" are difficulty settings, not someone you want to beat.
- Change: each difficulty is **a general out of myth with a voice** (`src/ui/personas.ts`):
  **Puck**, the Wandering Spirit (playful, petulant — "Oh, a game! I love games." / "Fine. Best
  of three?"); **Hippolyta**, Queen of the Amazons (proud, martial — "Draw your line, then. I will
  cross it."); **Odin**, the All-Father (cryptic, fatalistic — "I gave an eye for wisdom. What
  will you give?" / "The Norns did not tell me this."); **Ares**, God of War (wrathful — "War. At
  last." / "Impossible. I AM war."). Their personalities match how the AIs play (Puck dawdles,
  Odin foresees, Ares hits hardest). They speak in a speech bubble on their side: at the start,
  when they ascend, cast, take a shrine, when either citadel is nearly down, and at the end —
  at most one line per 25 s, longer lines held longer. Their names and titles appear on the foe
  cards, in the opening banner ("vs Odin, the All-Father"), by their health bar, on the pause
  screen and the results. The quick-message setting silences them too.
- Fixed on the way: speech bubbles never wrapped (long text overflowed the screen edge); on
  phones they now sit under the resource pill instead of over it.
- Checked: screenshots (desktop bubble, phone bubble, foe cards on a small phone); full verify.

## #45 The Lens of Imagination
*What must the players understand to play? Can imagination help them understand? What details
can I provide — and which would be inadequate, better left to the player? Can I give details
the player can use again and again for their imagination?*
- What must be understood is all shown, not imagined (lanes, counters, ages); imagination is
  where the *meaning* lives: the creatures carry their myths (#11), the ages a line of lore (#7),
  the generals a voice (#44). What was missing is the *where*. Every battle happened nowhere in
  particular — "a crossing" in the opening lore, then the same field every time.
- Drawing a dozen distinct battlefields would be the inadequate detail (more art, never as good
  as what a player pictures). A **name** is the opposite: two words the player fills in alone.
- Change: every battle is fought at a **named place** drawn from its seed (`src/ui/places.ts`):
  "Weeping Ford", "Giant’s Glen", "the Vale of Ravens", "the Shore of Seven Stones" (~520
  names). It heads the opening banner as a small-caps kicker ("The Battle of the Plain of
  Antlers"), opens the pause summary, closes the results verdict ("Your citadel lies in ruins at
  the Plain of Antlers.") and goes into the copied result. Online both players share the seed,
  so they fought at the same place and can talk about "the Weeping Ford one" later. The world
  keeps its seed in snapshots, so a save or a reconnect keeps the name (older saves get one too).
- Checked: unit tests (stable per seed, varied, both name shapes, survives a snapshot);
  screenshots of the banner (desktop, phone), pause (phone) and results; full verify.

## #46 The Lens of Economy
*How can players earn money? How can they spend it? What happens when they have too much, or
too little? Are the choices meaningful? Is the economy balanced?*
- Measured, not guessed: `npm run economy` (new, `scripts/economy.ts`) splits gold earned and
  spent per age. Even Master battles: kills are 55–70% of income, passive 25–40%, surges 2–4%;
  creatures take 85–90% of spending, ascending ~10%, turrets a little, **blessings almost
  nothing** (Master: 0.2 per battle). Nobody ever holds gold with a full queue — there is no
  "too much money" in Mythwar; gold is always the limit.
- Is that because blessings are poor? The opposite. Equal-gold tests (a free first rank on
  reaching Asgard vs a gold gift, 60–80 even Master battles each): a free **Might** won 79–87%
  — more than 2,112 gold (73%) did; Vitality 65% (~1,300 gold), Bastion 59% (~1,000) — all for
  528 gold. An AI that bought blessings whenever it could won 72% against the same AI. Blessings
  were the dominant buy; only the AI's "spare gold" rule hid it. A player who found out would
  have had a strategy the rest of the game could not answer.
- Change 1: **each blessing priced by its worth** (Might 360, Vitality 240, Bastion 180 gold per
  rank at first-age prices, was 120 for all): a first rank at Asgard now costs 1,584 / 1,056 /
  792 — about two thirds of what it wins. Still a good buy, no longer the only one.
- Change 2: at these prices nobody has spare gold for a blessing, so **the Mythic general banks
  for its next one**: it commits in a calm moment (from Asgard until Ragnarök is near) and keeps
  the bank unless besieged (saved in AI snapshots). Found on the way: banking in calm moments is
  strong in itself — a saving Master beat the normal one 69% *even in battles where it never
  bought a blessing* — because creatures trickled into a defended lane die and pay the foe 75%
  of their cost. So only Mythic got it (Master would have jumped a difficulty step).
- Change 3: that lesson, the heart of the economy, was never told to the player. The how-to
  page now says a fallen creature pays its killer three quarters of its cost, and the results
  tip catches it: "Your fallen creatures paid the enemy 4,000 gold — … Don't feed a held lane
  one by one: gather a wave (hold the line) and strike together." (new `killGold` stat). The
  blessing coach tip no longer says "worth it when gold piles up" (it never does): "They are
  pricey: bank gold in a calm moment to afford one."
- Checked: designcheck (ladder 100/63/7/0%, even battles 19.0 min, fairness 47%), Mythic vs
  Master 30–0, unit tests (price order, Mythic banks and buys while Master summons, feeding
  tip), how-to page on a 667×375 phone; full verify.

## #47 The Lens of Balance
*Does my game feel right — and why or why not?* (Schell's twelve kinds of balance: most have had
their own lens already — fairness #30, challenge #31, choices #32, skill vs chance #34, head and
hands #35, competition/cooperation #36–38, time #39, reward #40, punishment #41, simple vs
complex #42, detail vs imagination #45. What is left is the oldest kind: are the pieces balanced
against each other?)
- The pieces are 15 creatures in a counter triangle per age. `node scripts/classwar.ts` (equal
  gold, ten guardians' worth) — now with `--matrix`, every composition against every other on
  both sides. The triangle held everywhere, but two links were limp: in **Asgard the Frost Jötunn
  beat the Fenrir Wolf it should counter by only +0.09** (6×/20× budgets: +0.26/+0.15) — lifesteal
  kept the wolves alive — and in the **Jade Empire the Byakko beat the Kitsune by only +0.26**
  (+0.21/+0.18): foxfire leaping through a pack of tigers at 60%. Every other age sits at
  +0.4–0.5 (guardian over hunter) and +0.55–0.65 (hunter over mystic). A player who learned "shields
  beat fangs" in Olympus would find it barely true in Asgard — the triangle *felt* wrong there.
- Change (parameter scans, both armies on both sides, three budgets): Fenrir's Devour heals a
  **fifth** of its damage (was a quarter) and the Jötunn has **+8% health**; the Kitsune's foxfire
  leaps at **40%** (was 60%) and the Byakko has **+10% health**. Asgard G>H now +0.43/+0.44/+0.33,
  Jade H>M +0.42/+0.45/+0.48, Jade G>H +0.45 — in line with the other ages.
- Pacing looked worse at first (designcheck median 20.4 min — a fail), but 80-battle runs showed
  19.4 (new) vs 19.2 (old): the 30-battle median moves a minute either way on a one-point change
  to one creature. designcheck now plays 60 even battles (19.7 min, pass).
- Still true and left alone: pure Mystic armies are the best single composition in the matrix
  (+0.24–0.36 average; only pure Hunters beat them), Guardian+Hunter the worst. That is the
  triangle doing its job (a massed backline must be answered by hunters), and AI battles use
  mystics for only 23–25% of summons — but it is worth watching if players start to mass them.
- Checked: new unit test (every age's three counters win by > 0.3 at equal gold), Fenrir trait
  tests updated (a fifth), designcheck (ladder 100/60/7/3%, fairness 48%), full verify.

## #48 The Lens of Accessibility
*When players look at the game, can they see how to begin? What can I do to make it more
approachable?* — read here for the players most easily shut out: those who see colour
differently (about 1 in 12 men).
- New tool: `scripts/shoot.ts --cvd protanopia|deuteranopia|tritanopia` renders any scenario
  through the Machado (2009) colour-vision simulation (an SVG colour matrix over the page, so the
  canvas and the HUD are both covered); `--settings '{…}'` starts with stored settings.
- What it showed: **class** cues are safe — Guardian amber and Hunter green collapse into the same
  gold for deuteranopes, but every class colour in the game comes with its icon or its name.
  **Team** cues were not: for protanopes the foe's red turns grey — its health bar, its rings
  under each creature, its gate flags, and above all a shrine it holds, whose diamond became a
  dim grey hard to tell from a neutral one. "Blue vs not blue" still works for creatures (they
  also face each other), but who holds a shrine — income, ley sight, the surge prize — did not.
- Change: Settings → **Colour-blind friendly (foe in orange)**: the foe's palette swaps to orange
  in place (canvas art, portraits, cached keeps/gates redrawn) and the HUD's foe/warning red
  follows through a CSS variable (`html.cbfoe`). Blue vs orange stays apart for all three
  deficiencies: under protanopia the foe's bar, rings and shrine read bright yellow. Works online
  from either seat (the mirrored perspective swaps the same palette objects).
- Already in place, now written down in DESIGN.md: reduced-motion respected (shake/vibration
  default off, CSS animations stop), every action has a key and a tap, aria-labels and focus rings.
- Checked: CVD renders before/after (protanopia, deuteranopia, tritanopia), unit test (swap,
  idempotent, mirrored seat, back to red), settings on desktop and a 667×375 phone; full verify.

## #49 The Lens of Visible Progress
*What counts as progress in my game? Do players have enough of it? Can I make it more visible?
Where is the player's progress lost?*
- Progress in a battle is visible on its own terms: the citadels' health bars, the XP bar toward
  the next age, the age badges, the Ragnarök countdown. Progress across battles lives in records,
  stars per foe (#20), feats (#17), the bestiary (#11) and the "Next challenge" ribbon (#16).
- Where it got lost: the title screen. Its laurels showed only foes already beaten — a newcomer
  saw nothing at all, and after a first win a single "Novice ★☆☆" chip. Progress is a position on
  a path; with the path invisible, there is no "two of four, five stars of twelve" to feel.
- Change: the title always shows **the whole ladder** — Novice, Adept, Master, Mythic — beaten
  generals crowned in their colour with their best stars, the rest dimmed with a dashed border and
  empty stars (tooltip/aria: "Odin, the All-Father (Master) — not defeated yet"). The road ahead
  is now part of the screen, and every star earned fills a visible gap.
- Checked: title on a 667×375 phone (two beaten, two not) and on desktop (fresh profile); new
  smoke check (a fresh profile sees all four generals, all dimmed with ☆☆☆); full verify.

## #50 The Lens of Parallelism
*What bottlenecks are in my design? Can parallelism remove them? Can players do several things
at once — and can the game do several things at once for them?*
- Mythwar is parallel by nature: three lanes, each its own front. One thing in it was not: a
  single trainer worked through one queue for all three gates. Order two redcaps for the quiet
  top lane, then see a rush in the bottom lane and order a guardian there — the guardian waited
  for both redcaps. Head-of-line blocking, exactly when it hurts.
- Measured (scripted player vs Master, 10 battles; order → creature steps out): summons ordered
  while foes were in that lane's last third waited 4.9 s on average (p90 12.1 s), 3.1 s of it
  beyond their own training time.
- Change: **each gate trains its own creature** — the three lanes train in parallel; the queue
  still holds five in all, and a lane still trains one creature at a time (so piling into one
  lane is no faster). Emergency waits fell to 4.4 s (p90 10.3 s); what remains is that lane's
  own line and jammed gates, which is the rule working. Even battles got a little shorter
  (designcheck 19.7 → 18.6 min), the ladder held (100/57/20/0%). The queue chips show a progress
  bar on every creature in training (one per lane), ley sight rings each lane's own trainee, the
  portal flare follows each gate. Old saves carry their progress to the right lane.
- Checked: unit tests (parallel lanes, one at a time per lane, cancel resets only its lane, old
  save conversion), designcheck, a screenshot with three lanes training, full verify (smoke,
  multiplayer smoke — the server and replicas share the rule).

## #51 The Lens of the Pyramid
*Is there a single element at the top of my pyramid that players strive for? Is it challenging,
rare, unique? Do the elements at the lower levels contribute to it?*
- Mythwar had many goals and no apex: 17 feats in a flat list ("First Victory" next to
  "Godslayer"), stars per foe, trials. Each is fine; nothing gathered them into one summit.
- The summit was already there, unnamed: the three-star rating (#20). Three stars against every
  general — a win within par time with the citadel above half, against Ares too (the scripted
  "competent" player never manages it) — is rare and hard, and every battle against the AI
  feeds it, star by star, foe by foe. Lower layers (victories, ratings per general, the ladder on
  the title, #49) all point up to it.
- Change: the capstone feat **Legend of the Ages** — "Earn all three stars against every
  general." It heads the feats screen across both columns in a gold frame, with progress shown
  general by general ("4 of 12 stars so far: Puck ★★★ Hippolyta ★☆☆ Odin ☆☆☆ Ares ☆☆☆"),
  is awarded the moment the twelfth star is recorded (named on that battle's results), and is
  completed by a progress code too when two devices' stars add up.
- Fixed on the way: loading a progress code **erased the best star ratings** (#19's merge rebuilt
  each record without the stars added by #20) — committed separately, with a test.
- Checked: unit tests (star total, awarded once, completed by a merged code), feats screen on
  desktop and a 667×375 phone; full verify.

## #52 The Lens of the Puzzle
*What are the puzzles in my game? Do they make players stop and think? Is the goal clear, the
problem easy to understand, is progress visible, can the player tell they're close?*
- Mythwar's central puzzle is "what answers this lane?" — but in a battle it is never posed
  cleanly: it is tangled with economy, timing, three lanes and an AI that adapts. A player who
  loses can't tell whether they mis-read the lane or simply ran out of gold.
- Change: **Riddles of war** (foe screen → Riddles): four hand-made battles, each one question.
  A fixed purse, no income, kills pay nothing, no wards or turrets, the foe already on the field;
  the goal is to clear the field before any foe reaches your citadel. *The Redcap Pack* (a hunter
  pack; 120 gold), *The Labyrinth's Guard* (Minotaurs with Gorgons behind; 260), *The Giants'
  Wall* (Jötnar and wolves; 500 — Valkyries need a Guardian in front), *Fimbulwinter* (a warband
  too strong for the purse; the god power once — freeze them where they meet your creatures).
  A failed attempt shows a hint; a solved one offers the next riddle. Riddles of ages never
  reached stay sealed (#4); the "Counter!" badge is off (reading the lane is the riddle).
- Each riddle is **brute-forced** (`npm run puzzlecheck`, `src/sim/puzzles.ts` is pure sim): every
  mix of creatures within the purse, every power timing. First drafts failed the check — a
  "Three Fronts" riddle let mirror match-ups win, the Wall and Winter let 42% and 53% of answers
  win (Winter without even using the power) — and were re-cut until only a few answers win:
  3/28, 1/28, 2/23, 26/138 (all of those with the power). The unit test keeps it that way.
- Checked: unit tests (setup, each intended answer wins, < 25% of answers win, doing nothing
  loses, the power riddle needs the power), a smoke flow (foe screen → Riddles → solve the first
  by tapping cards → "Solved", remembered), screenshots (list on desktop and phone, opening).

## #53 The Lens of Control
*When players use the interface, does the game do what they expect — and do they feel in control,
even powerful? Where does intent get lost between the player's head and the game?*
- Control in Mythwar is good where the player *acts*: tap/drag/keys summon at once (#35's wheel,
  drag onto any lane), Backspace or a tap on a queue chip undoes a summon, a god power cast into
  an empty lane is refused instead of wasted (#41), every panel closes with Esc.
- Intent got lost in one common moment: deciding *before* the gold is there. "Next, a Pixie for
  the middle" — but 9 gold of 35. Tapping the card only said "Not enough gold"; the player then
  had to watch the counter and tap again at the right second (on a phone, mid-battle, while
  watching three lanes). The decision was made; the interface refused to take it.
- Change: **an unaffordable tap arms the card**: it summons itself into that lane the moment the
  gold is there (online: as soon as the gold minus orders in flight covers it). The armed card
  wears a dashed, pulsing gold outline and its savings counter reads "auto · 9s"; tap it again
  to disarm; one armed card at a time (a new tap re-arms); a full queue waits, anything else
  (an ascension changing the cards, the battle ending) disarms. A toast says what happened. The
  how-to's summoning page says so in one sentence. Client-side only: no rule changed.
- Checked: smoke flow (tap with 5 gold → armed, nothing summoned; gold arrives → summoned
  itself; tap twice → disarmed); screenshot; how-to page on a 667×375 phone; full verify.

## #54 The Lens of the Physical Interface
*What does the player pick up and touch? Can it map more closely to the game world? What does
it feel like in their hands?*
- Mythwar is touched three ways: a mouse (click, drag, wheel #35), a touchscreen (tap, drag, press
  and hold to inspect, upright phones rotate), a keyboard (every action has a key). The one
  physical interface players reach for on a sofa — a game controller, on a PC or paired to a
  phone — did nothing.
- Change: **gamepads** (`src/gamepad.ts`, the browser's standard mapping: Xbox, PlayStation,
  Switch Pro, most Bluetooth pads). The face buttons summon the cards *as they sit on the pad*,
  left to right — X, A, B (and Y for the Elder Dragon) — so the hand finds the creature by
  position, not by memory; D-pad/left stick ↑↓ pick the lane (repeating while held), ← turrets,
  → blessings; RB the god power, LB hold the line, RT ascend, LT undo the last summon, Start
  pause, Back 2× speed. In menus and open panels the D-pad moves a gold highlight to the nearest
  button in that direction, A presses it (or the screen's main button), B / Start go back. The
  keyboard handler became `Input.press(key)`, shared by keys and buttons, so both always agree.
  The controls panel (H) has a gamepad line; a toast greets a newly connected pad.
- Checked: smoke flow with a stubbed standard gamepad (A presses Play, the D-pad highlights,
  B goes back, X/A summon the first two cards, ↑ changes lane, Start pauses and resumes);
  full verify. Not tried with a physical controller (none here) — the mapping follows the W3C
  standard layout every browser reports for known pads.

## #55 The Lens of the Virtual Interface
*What information does the player need that isn't obvious from the world? What do they need to
do — and does the interface tell them, or get in the way?*
- The world shows a lot by itself (creatures, shrines, flaring portals, banners); the HUD adds
  what it can't: health, gold and income, XP, cooldowns, the queue, star goals in the pause menu.
- One decision had no information behind it: **the age race**. Falling behind in the ages is the
  first thing the results tip checks (#18/#43), rushing an age (#33) is a bet on timing — yet the
  foe's progress was invisible until their badge started pulsing ("they can ascend *now*"). Your
  own XP had a bar; theirs had nothing.
- Change: a **ring around each age badge** fills with that side's XP toward its next age, in the
  side's colour (blue / red, orange in colour-blind mode). Both rings sit at the screen's top
  corners, so "who is closer" is one glance; the foe's badge tooltip gives the percentage; the
  pulse when an ascension is possible stays. The how-to's ages paragraph says to watch it.
  (First version: a 2-px ring nobody would notice — the mask's percentages were measured to the
  corner; now 5 px.)
- Checked: screenshots (desktop, phone landscape), how-to page on a 667×375 phone; full verify.

## #56 The Lens of Transparency
*What does the player want to feel, and does the interface let them — or does it get in the way?
Is it invisible, the way a good tool is?*
- In battle the HUD keeps to the edges and the field speaks for itself (checked again on desktop
  and phone screenshots). The opaque spot is a menu: phase 2 grew the foe screen from four foes
  and a button into four foes, a Quick battle switch, three Trials, Sandbox, Riddles (#52), Back
  and Begin. For the one moment that matters most to a newcomer — *choose who to fight* — that
  is a wall of options, and three of them (Glass Citadel, Godless, No Walls) are handicaps that
  mean nothing before you've won once.
- Change: **progressive disclosure on the foe screen** — the Trials row appears after a first
  victory (or if trials are already chosen, e.g. merged from another device, so they can be
  switched off). Quick battle stays: a short session is a newcomer's choice too.
- Checked: smoke (fresh profile: only Quick battle; after a win: Quick battle and the three
  trials), screenshots of the foe screen on desktop and a 667×375 phone.

## #57 The Lens of Feedback
*What do players need to know at this moment — and what do they want to know? What feedback do
they get, and is it the feedback that teaches?*
- The counter triangle is the core skill, so its feedback matters most. A counter hit (×1.5)
  already had gold sparks, a gold slash and a bright "ting". The other half — a *countered* hit
  (×0.75), your creatures in the wrong match-up — looked and sounded exactly like a normal blow.
  The player learned it only from the outcome (a lost lane) or from the results (#27).
- Change: countered blows **glance off** — a dull grey puff instead of sparks and a muffled
  wooden "tock" (rate-limited). And over the player's *own* creatures, now and then, the word for
  what is happening: gold **"Effective!"** when they hit what they counter, grey **"Resisted"**
  when what they hit counters them — once per lane and kind every 5 s, never both within 1.5 s
  in one lane, not in the title screen's attract battle. Melee and ranged (projectile) blows
  both count. The triangle gets named while it happens, in the lane where it happens.
- Checked: screenshot of a mixed fight (found the two words stacking — spaced out since), full
  verify; perfcheck 1.97 ms of 3 ms per frame (see open issues: was 0.93 at #14).

## #58 The Lens of Juiciness
*Is the game juicy — does every action answer with second-order motion that rewards the player?
Where does a meaningful action get a flat response?*
- Most actions answer richly already: a summon bumps its card and flares the portal, kills burst
  and pay "+gold" that merges, routs shout (#3), an ascension raises a pillar of light, powers
  fill the lane, a turret builds in a puff of light.
- The flat one: **buying a blessing** — since #46 one of the dearest purchases in the game
  (1,584 gold for Might's first rank at Asgard) — changed a pip in a panel and nothing on the
  field. The strength is real but invisible; the player has to trust a number.
- Change: a blessing is **felt on the field**. Might (orange-gold) and Vitality (green) send a
  ground shockwave, a flash and rising motes through every creature of that side; Bastion rings
  and lights all three of its gates. The foe's blessings show too, a little smaller — fair
  warning that their army just got stronger.
- Checked: screenshots of Might and Bastion mid-battle (a first version with motes only was
  barely visible on snow — now shockwave + flash); full verify.

## #59 The Lens of Channels and Dimensions
*What data must reach the player? Which channels do I have (where on screen, sound, touch, motion)?
Is each piece of data on the channel that suits it — and are channels used for more than one
dimension?*
- Mapped: the counter triangle → card colour + icon + "Counter!" + sparks/puffs + words (#57);
  lanes → position, ▶ markers, danger pulses, portal flares; team → colour, facing, stereo pan
  (each side's sounds lean to its side); ages → art, music mode, HUD accent, badge rings (#55);
  a creature's identity → silhouette and its own cry (#10); gold → counter, "+N" popups, coin
  sounds. Phones add vibration for summons, powers, errors and routs.
- The gap: the one piece of data that decides the battle — *your citadel is about to fall* —
  had a single channel, the health bar at the top edge, while the player's eyes are in a lane.
  Hits on the citadel thud, but a thud says "hit", not "nearly dead".
- Change: below 30% health **your citadel has a heartbeat** — a low "lub-dub" leaning to your
  side, every 1.5 s at 30% and quickening to every 0.55 s near zero, louder as it goes; on phones
  each beat is also a short vibration (under the "Screen shake & vibration" setting). Silent
  while paused, in menus, after the battle and in the title's attract battle. One continuous
  dimension (health) mapped to tempo — the channel the player can follow without looking.
- Checked: smoke (a spy on the heartbeat: none at 80%, beats at 25%, more at 3% in the same
  time); full verify.

## #60 The Lens of Modes
*What modes does the game have? Are they necessary, clearly shown, never conflicting? Does the
player ever act in one mode believing they're in another?*
- The modes: **power targeting** (hint "choose a lane", lanes light, Esc/right-click cancel);
  **hold the line** per lane (shield button + war banner on the field); **2× speed** (button
  label); the **armed card** (#53: dashed pulsing frame, "auto · Ns"); paused / menus; riddle and
  sandbox as whole-game modes; online's held states (overlays); and the sandbox's **"For: Foe"**
  switch — the one mode where the same tap does the opposite thing.
- In "For: Foe" every card summons for the enemy, but the only sign was a small "For: Foe" chip
  under the clock; the cards — where the eyes and fingers are — looked exactly the same. The
  classic mode error: forget the switch, summon an army for the wrong side.
- Change: in foe mode **the cards become the foe's** — portraits redrawn in the foe's colours
  facing the other way, a foe-coloured frame on every card, and on desktop a label beside them:
  "Summoning for the foe — X to switch". The mode now lives where the action is. (On phones the
  cards sit in a side column; frames and portraits carry it there.)
- Checked: smoke (X → cards marked, a tap summons for the foe, X → back), screenshots on desktop
  and phone; full verify.

## #61 The Lens of the Interest Curve
*What is the shape of the experience — hook, rising peaks, a climax, a resolution? Where does it
sag? Does the player anticipate what is coming?*
- Measured over 20 even Master battles (events per tenth of each battle, and kills per minute):
  a hook (opening banner, horn, the first clashes: kills/min 16 → 36 by minute 2), peaks at each
  ascension and Ley Surge, a mid-game siege bump (citadel hits peak at 40%), and a big climax —
  Ragnarök, 46 citadel hits in the last tenth. But a **sag before the climax**: kills/min fall to
  17, 12, 19 around minutes 11–14, citadel hits to 8, 6.5, 7 per tenth at 70–90%. It is the
  final ages' lull: expensive armies rebuild, citadels have just grown.
- Balance could shorten the lull, but pacing sits at its limit (#47) and the lull is also where
  the final age's creatures arrive. What it lacked is **anticipation**: Ragnarök — the climax —
  was announced only 2 minutes ahead, in small text.
- Change: the climax is foretold through the lull — "Ragnarök in 3:00" appears three minutes
  ahead (whenever it is due: at 18:00, or 3 minutes after both sides reach the final age), the
  **war drums build** toward it whatever the lanes are doing (music intensity floor rising from
  0.3 to 0.7), and at one minute a horn sounds with a warning ("then the wards fall silent and
  the turrets falter") while the countdown starts to pulse.
- Checked: smoke (countdown from 2:49 at 170 s left, the one-minute warning toast); full verify.

## #62 The Lens of Inherent Interest
*What aspects of the game are interesting in themselves — danger, the extraordinary, a spectacle
of scale? Does the game let them be seen as such?*
- Mythwar has its spectacles: the god powers fill a lane (Zeus's lightning, the Spirit Dragon,
  Starfall), an ascension raises a pillar of light, Ragnarök turns the sky, a falling citadel
  collapses. The most inherently interesting single thing in it, though — **the Elder Dragon**,
  the only Legend, so rare the AIs had to be taught to save for it (#32) — arrived like any
  redcap: a portal flash and (since #10) its roar.
- Change: the dragon's arrival is an **occasion**: it bursts from its gate in a fiery
  shockwave, a flash, embers and smoke, the screen shakes (more for yours), and a banner names
  it — "The Elder Dragon — takes wing for you · middle lane" (or for the enemy; a toast instead
  if another banner is up). When it falls, a toast says so ("The enemy's Elder Dragon has
  fallen!"). Danger and spectacle, announced — the moment players will retell.
- Checked: screenshot of the arrival (Celestial theme); full verify.

## #63 The Lens of Beauty
*What elements make up the game's look — and which one is least beautiful? How can the parts work
together into something more beautiful than each alone?*
- Walked the screens with fresh screenshots (late-age battle, menus, the new riddle screens). The
  battlefield holds together (one palette per age across sky, ground, citadel, HUD accent). The
  least beautiful moment was a seam between two layers: when a battle or riddle ends, the HUD's
  centre banner ("Solved! — The field is clear", "Victory — The enemy citadel crumbles") was
  still fading when the results screen opened over it, so the screen read **the same words
  twice**, one ghostly copy behind the other (riddles end faster, so it showed most there).
- Change: a banner never shows through a menu (results, pause) — the screen says each thing
  once. And the riddle result, a bare title and buttons, gets the composition of the battle
  results: verdict and riddle name, the riddle's foe as a portrait (as a battle shows your
  champion) with its age and purse, the line, the buttons.
- Checked: screenshot of a solved riddle before and after; full verify.

## #64 The Lens of Projection
*What in the game can players relate to — where can they put themselves into it? Does the world
acknowledge them?*
- Players project into Mythwar through their side: blue, their citadel, their army, their
  champion on the results. But the side had no *person*: in single player the player was "You"
  everywhere and the four generals (#44) talked *at* whoever was there. Online they had a name;
  alone they were nobody.
- Change: **your name** (Settings → "Your name"; the same one multiplayer uses, empty = none)
  stands by your citadel in every battle ("Zoë · Fae Wilds", facing "Hippolyta · Fae Wilds"),
  and the generals **speak to you by it**, every other time they open or end a battle: "Oh, Zoë!
  A game! I love games." — "So you are Zoë. Draw your line." — "I have seen you in the well,
  Zoë." — "Zoë. Another mortal for the pyre." … and at the end "Who ARE you, Zoë?" or "Rise,
  Zoë. Train harder." A rival who knows your name makes the rivalry yours. (Co-op keeps "You &
  ally": on a shared side "you" reads clearest.)
- Checked: unit test (named lines alternate, every general has start/won/lost lines, no
  placeholder leaks), screenshots (settings on desktop and phone, the name in battle); full
  verify (the multiplayer smoke caught a co-op label change — kept as before).

## #65 The Lens of the Story Machine
*Does the game generate stories players want to tell? What gives them the raw material? Is there
a place where the story the game made is handed back to them?*
- Mythwar is a story machine already: every battle has its own arc of ages, a dragon or not, a
  surge won at the last second, a citadel saved at 3%. The results kept only the *statistics* of
  that story (a table, an army chart): the story itself was gone once the screen changed.
- Change: the battle writes **its chronicle** (`src/ui/chronicle.ts`): first blood, every
  ascension (yours and theirs), Ley Surges won, the Elder Dragon taking wing and falling, a
  citadel brought below a quarter, Ragnarök, the end — dated, in the foe's name ("1:50 — Odin
  ascends to Olympus." … "19:08 — Odin's citadel is brought below a quarter of its strength." —
  "19:13 — Victory: Odin's citadel falls."). Up to ten lines: when a long battle has more, the
  least telling go first (surges, then the foe's later ascensions); first blood and the verdict
  always stay. The results show it beside the table, sharing a panel with the army chart (two
  small tabs in the title line — the results have no height to spare), and **Copy result** now
  copies the whole story, ready to send to a friend. Online battles get one too.
- Checked: unit test (a full AI battle: 5–10 lines in time order, first blood first, an
  ascension, the verdict last), screenshots (1600×900, 1366×768); full verify (the smoke caught
  the first version's extra tab row pushing the results' buttons out of reach).

## #66 The Lens of the Obstacle
*What stands between the player and the goal — and is overcoming it worth it? Does each part of
the journey have an obstacle of its own?*
- The obstacles: the generals (a ladder of four, #49/#51), the trials (#31), the age race,
  Ragnarök — and the riddles (#52), the game's purest obstacles: one question, one answer. But
  the riddles stopped at Asgard. A player's journey through the ages ran on into the Jade Empire
  and the Celestial realm with no riddle waiting there — the later, richer creature sets (the
  Oni's enrage, the Kitsune's foxfire, the Phoenix's rebirth, the flying Griffin) had no
  obstacle built around them.
- Change: two more riddles, brute-forced like the first four. **The White Tigers** (Jade): a
  tiger pack with a fox behind it, 900 gold — 2 of 17 answers win, both built on two Oni
  Brutes. **Sky and Stone** (Celestial): Griffins down the top lane, Titans along the bottom,
  1,400 gold and Starfall once — 26 of 297 win, none without the power (Phoenixes for the
  Titans; Starfall holds the sky lane by itself). Sealed until their age is reached in battle,
  so each is a reward at the end of a stretch of the journey.
- Fixed on the way: a riddle card's header without the "Solved" tag was centred.
- Checked: puzzlecheck, unit tests (each answer wins, < 25% of answers, the power riddle needs
  its power), the list of six on a 667×375 phone; full verify.

## #67 The Lens of Simplicity and Transcendence
*How is my world simpler than the real one? What kind of transcendent power does it give the
player — and does using it feel transcendent?*
- Simplicity: war reduced to three lanes, a triangle, gold and time. Transcendence: the player
  is a god-general who calls up legends and, once a minute or so, **acts as a god**: brambles,
  lightning, an endless winter, a spirit dragon, falling stars. Those powers look spectacular
  (#62 and earlier) but *feel* like every other tap: the battle runs on at full speed, the
  eye has to find the struck lane among three busy ones, and the moment is gone.
- Change: your god power becomes **a god's moment**. For a breath after you cast, time slows to
  a third and eases back over 0.6 s (single player — online both players share one clock), and
  everything but the struck lane sinks into shadow, returning over 1.3 s. The world holds its
  breath for the player's act; the eye goes straight to it.
- Found on the way: the shadow was invisible at first — particles leave the canvas in additive
  blending, where a dark fill adds nothing; the overlay now sets normal compositing. (A frozen
  frame shows it; live captures in headless Chrome lagged behind the canvas.)
- Checked: a frozen-frame screenshot of the shadow; the focus state set and decaying after a
  cast; full verify.

## #68 The Lens of the Hero's Journey
*Does the player's progress follow the shape of a journey — a call, a threshold, trials, an
ordeal, a return? Does the game tell it?*
- The structure was there without the story: four generals in rising difficulty (#13/#16),
  their voices (#44), the ladder on the title (#49), Legend of the Ages at the top (#51). Each
  battle was an episode; nothing said they were one war, or where the player stood in it.
- Change: **the four generals are the chapters of one journey** (`JOURNEY` in personas.ts):
  I · The Call (Puck: "A wandering spirit has claimed the old crossing… Someone must go. You
  go."), II · The Threshold (Hippolyta: "Word of your victory has reached the Amazons. Their
  queen does not believe it…"), III · The Ordeal (Odin: "He knows how you fight. Fight
  better."), IV · The Return (Ares: "Win, and the crossing is yours for good."). The chapter is
  named on each foe card, and told in the opening banner — in place of the age's lore line —
  every time you face a general you have not yet beaten. Once beaten, the chapter is behind you
  and the banner returns to the age's lore.
- Checked: screenshots (foe screen on a 667×375 phone, the opening against Hippolyta); full
  verify.

## #69 The Lens of the Weirdest Thing
*What is the weirdest thing in the game — and does it serve the game or just confuse it?*
- Walking the new modes of this run looking for the oddest sight, the winner was inside a riddle
  (#52): an **"Ascend · Olympus · 150g"** button for a battle with no XP, **Turrets** in a battle
  with no walls, **Blessings** that would eat the fixed purse, and an XP bar frozen at "0 / 800".
  Four controls that could never do anything sensible, next to a question that is all about
  spending a small purse well — weird, and a trap (U/T/B keys too).
- Change: in a riddle the HUD offers only what the riddle is about — the purse, the creature
  cards, the god power (locked, or once) — and the U/E/T/B keys do nothing there.
- Found on the way, and weirder still: the first version named the HUD's class `riddle`, which
  the riddle *cards* on the menu also use — so their dark card background painted over the whole
  battlefield. Renamed (`inriddle`); a reminder that CSS class names are global.
- Checked: riddle screenshots before/after; full verify.

## #70 The Lens of Story
*Does the game need a story — and if so, does it have a beginning, a middle and an end? Does
the story support the play, and the play the story?*
- Mythwar's story is deliberately thin (#45: leave room for imagination) and lives in its
  framing: age lore (#7), generals with voices (#44), named battlefields (#45), the chronicle of
  each battle (#65), and since #68 a journey of four chapters that *open* when you first face
  each general. But a story needs endings: a chapter never closed. Beating Ares — the end of the
  war — produced the same verdict line as beating him the tenth time ("The enemy citadel has
  fallen at …").
- Change: **each chapter closes** with the first victory over its general: the results' verdict
  line becomes the chapter's ending — "I · The Call — The spirit flits away, laughing. The
  crossing is quiet — for now." … "II · The Threshold — The queen lowers her spear. Her sisters
  will speak your name." … "III · The Ordeal — The ravens fly home with news the All-Father
  did not foresee." … and the last: "IV · The Return — Ares falls silent. The war is over and
  the crossing is yours. The skalds have their song." Later wins return to the plain verdict.
  The ladder of difficulty is now a story with an end.
- Checked: results screenshots (desktop, phone) of a first win; full verify.

## #71 The Lens of Freedom
*When do players feel free, and when constrained? Do they have the freedom they want — the
freedoms that matter?*
- Freedom in battle is wide (any creature, any lane, when to ascend, hold, rush, bless, cast).
  Freedom *around* battles has grown this phase (quick battles #39, trials #31, sandbox #15,
  riddles #52). One constraint stayed absolute: **every battle begins in the Fae Wilds**. A
  player who has fought through the ages many times and wants an Asgard battle — Valkyries and
  wolves from the first minute — had to sit through two ages first, every time.
- Change: a **"Start: <age>"** chip on the foe screen cycles through the ages the player has
  already reached in battle (hidden until they've reached Olympus — curiosity about unseen ages,
  #4, stays intact). Both sides begin in that age, with its citadel and starting gold in its
  prices. It's freedom, not a shortcut to rewards: such a battle counts a win or loss but keeps
  no stars, no best time, no star goals on the pause screen ("Started in Asgard (no stars)" on
  the results); feats for reaching ages still need an actual ascension.
- Checked: unit test (both sides in the age, citadel, gold, kept in a save; default 0), the foe
  screen with the chip lit; full verify.

## #72 The Lens of Indirect Control
*What do I want players to do — and how can I make them want to do it, without telling them?
(Constraints, goals, interface, visual design, characters, music.)*
- What we want and players often don't do: spend the god power where it's worth the most. The
  results tip nags those who never cast (#18); the AIs aim well (powerSkill); a power refused on
  an empty lane (#41) stops the worst waste. Between "never" and "well" lies the common case:
  casting on whatever lane is selected, the moment it recharges, at two stragglers.
- Change (no words): while the power is ready, **the most crowded lane calls for it** — when a
  lane holds four or more foes, the power button's glow quickens and brightens and that lane's
  ▶ marker gains a gold ring. The eye goes from the button to the lane; the player still decides.
  When the crowd thins, the hint fades by itself.
- Checked: screenshot (five redcaps in the bottom lane: marker ringed, button glowing); full
  verify.

## #73 The Lens of Collusion
*Is there a character in the game who is on the player's side — who seems to want what the
player wants and helps without taking control? Does the player feel that partnership?*
- The game has rivals with voices (#44) and a player with a name (#64); the help the player gets
  — the coach's tips (when to ascend, the shrines, the portals, holding the line, blessings, a
  jammed gate…) — came from nobody: a yellow box with a "?". Information, not a partner.
- Change: the tips have a speaker — **Mímir, keeper of the well**, the wise head from the
  Norse myths whose counsel even Odin sought. Every tip is signed "Mímir, keeper of the well",
  with his initial where the "?" was. The same words now come from someone who sits on the
  player's side of the war, against the four generals — a mentor for the journey (#68), and the
  one voice in the game that colludes with the player.
- Checked: screenshot of a tip in battle; full verify (the smoke's coach checks read the tip
  text and still pass).

## #74 The Lens of the World
*Does the game feel like a window onto a world bigger than itself — one that would go on
existing if the game stopped?*
- Mythwar's world is suggested in words (age lore, the bestiary's myths, named battlefields,
  the generals' lines, the journey) and in the backdrop of each age (mountains, aurora, moon,
  drifting motes). But everything that *moves* exists for the battle: the creatures, the
  projectiles, the powers. Nothing happens in the world that isn't about the war.
- Change: **travellers in the far sky** — every 30–55 s something crosses it, slowly (14 s), a
  dark silhouette that never touches the battle: a will-o'-wisp over the Fae Wilds, an eagle
  over Olympus, **Odin's two ravens, Huginn and Muninn**, over Asgard (the All-Father's
  "My ravens have watched you", #44, made visible), a long sky dragon over the Jade Empire, a
  comet across the Celestial heavens. The world goes on beyond the crossing. (Off in battery
  saver mode.)
- Found on the way: the first placement put them behind the top bar (the sky band is short) and
  too small to read — now in the lower half of the sky, scaled to it.
- Checked: screenshots of Asgard's ravens and the Jade dragon mid-crossing; full verify.

## #75 The Lens of the Avatar
*Is the player's avatar an ideal the player can step into — and does it have iconic qualities,
simple enough for the player to fill with themselves?*
- Mythwar's "avatar" is not a body on the field (the player commands from above); it is the
  side: blue citadel, army, name (#64). The four generals each have an iconic presence (a name, a
  title, a voice). The player had a name — plain text — and nothing iconic.
- Change: a **sigil** — Settings → "Your sigil": sun, moon, star, crown, crossed swords or
  lozenge (or none) — an emblem in the simplest, most iconic form there is (one glyph, in text
  presentation so phones don't swap in emoji). It stands before your name by your citadel
  ("☾ Zoë · Fae Wilds") and heads your column on the results ("☾ You"). Abstract on purpose:
  a sign the player chooses and fills with meaning, not a portrait that tells them who they are.
- Checked: screenshots (settings, the HUD name with the moon sigil); full verify.

## #76 The Lens of Character Function
*What functions do my characters need to fulfil? Does each have a clear one — and can the player
tell what it is?*
- The creatures' functions are designed (#47's counter matrix keeps them distinct per age): a
  Guardian holds and breaks packs, a Hunter dives the backline, a Mystic breaks walls from
  range, the Elder Dragon ends deadlocks. The card tooltip told the player a lot — strong/weak
  vs, health, damage, range, speed, trait, myth — and a "class note", but that note described
  *how* the class fights ("Sweeping blows also strike foes packed around the target"), never
  *what it is for*. Function had to be inferred from the triangle.
- Change: each class note now leads with its **job in the army**: "**The front line:** holds the
  foe back and breaks Hunter packs — …", "**The striker:** runs down the Mystics behind a line —
  …", "**The backline:** breaks Guardian walls from range — …", and for the Elder Dragon "**The
  siege-breaker:** flies over the fray and burns through massed armies — summon it to end a
  deadlock." Role first, mechanics second: the player knows why to pick a card before how it
  fights.
- Checked: screenshot of a card tooltip; full verify.

## #77 The Lens of Character Traits
*What traits define each character? How are those traits expressed — in what it says, how it
moves, what it does?*
- The creatures have traits on paper: the Bestiary's myths (the vicious redcap, the mischievous
  pixie, the wise-and-wild centaurs) and their mechanical traits (regrowth, charge, enrage…),
  plus a cry of their own when summoned (#10). But on the field every creature *behaved* the same
  way — walk, strike, die. A temper was told, never shown.
- Change: every creature has a **temper** — one word (the treant *patient*, the redcap
  *vicious*, the pixie *mischievous*, the minotaur *furious*, the centaur *wild*, the gorgon
  *cold*, the jötunn *brooding*, Fenrir *ravenous*, the valkyrie *exultant*, the oni *wrathful*,
  Byakko *fierce*, the kitsune *sly*, the titan *imperious*, the griffin *regal*, the phoenix
  *serene*, the Elder Dragon *ancient*) — and a **gesture** that expresses it when it fells a
  foe: the brutes swell up and lean in (roar), the predators hop savagely, the tricksters twirl
  round, the proud riders and fliers rear back, the patient and cold ones draw themselves up.
  Now and then (4–7 s apart per creature), so a long melee doesn't turn into a dance. The word
  stands by the name in the Bestiary.
- The kill is attributed exactly: the sim's death event now names the killing creature
  (`killer`, -1 for turrets and powers). Events aren't hashed, so the rules fingerprint is
  unchanged; the gesture is render-only.
- Checked: `tests/tempers.test.ts` (every creature has a temper, gestures stay in bounds and end
  where they begin, the killer is named); `shoot temper-gestures` (six creatures frozen
  mid-gesture, both sides) and the Bestiary; full verify.

## #78 The Lens of the Interpersonal Circumplex
*Where do my characters stand on the two axes of how people relate — friendly ↔ hostile,
dominant ↔ submissive? Are they spread out, or all in one corner?*
- Mapped: Puck is friendly and submissive (playful, a little scared), Hippolyta friendly and
  dominant (a respectful rival who commands), Odin cold and dominant (aloof, all-seeing), Ares
  hostile and dominant; Mímir the mentor sits friendly-dominant. A good spread — but it barely
  showed, because the generals only ever spoke about *themselves* (their ascending, casting,
  shrines) and about the citadels. How someone relates to you shows in how they answer what
  *you* do, and they never answered the player at all.
- Change: the generals now answer the player's deeds — the player **ascending**, **striking
  them with a god power**, **taking back a shrine they held** — each from their place on the
  circumplex. Puck: "Ow! Ow ow ow!", "Aww, I was playing with that!"; Hippolyta: "A fine blow.
  Mine will be finer.", "Good. Now it is a fight."; Odin: "I foresaw that blow.", "Keep it a
  while. It changes nothing."; Ares: "You dare strike ME?", "Thief! I will have it back in
  blood." Same 25 s spacing as before, so they don't chatter. A neutral shrine the player claims
  first draws no comment — only one taken from the general stings.
- The circumplex is in DESIGN.md (AI generals), with the open corner noted: nobody is hostile
  and submissive (a sulking villain) — left open on purpose.
- Checked: unit test (every general has lines for every moment); full verify.

## #79 The Lens of the Character Web
*How are my characters related to each other? Does each relationship show, and does it give the
characters something to say?*
- Mythwar's characters were five islands: four generals in a ladder and Mímir the mentor, each
  talking only about the battle in front of them. Yet the myths they come from tie them
  together tightly: in Greek myth **Hippolyta is the daughter of Ares**, whose gift her famous
  girdle was; in Norse myth **Odin gave an eye to drink from Mímir's well** and kept Mímir as his
  counsellor; Shakespeare's **Puck is Oberon's jester**. The game had the web and didn't use it.
- Change: at a **first meeting** (until the general is beaten) the general's opening line tells
  who they are to the others — Puck: "Oberon says I may play with you! He never lets me play.";
  Hippolyta: "My father Ares gave me this girdle. You will not take it."; Odin: "Mímir counsels
  you, I hear. My old friend has chosen a side."; Ares: "So you are the one my daughter speaks
  of." / "Odin watches. Mímir whispers. I simply kill." The journey chapters name the ties too
  (Odin's chapter: the eye he gave at Mímir's well, and Mímir now counselling the player against
  him; Ares': "the god of war — Hippolyta's father"). The player's mentor turns out to be the
  third general's old friend, which makes Mímir's help a choice he made.
- The web is written down in DESIGN.md beside the circumplex (#78).
- Checked: screenshots of Odin's opening chapter and his first-meeting line; unit test (every
  general has `meet` lines); full verify.

## #80 The Lens of Status
*What are the status relationships among the players? How does a player show — and see — who
stands where?*
- Single player has plenty of status markers for the player alone (feats, stars, laurels, the
  ladder of generals, Legend of the Ages). Among *players* there were none: in the battle room
  and the open-battle list a veteran who has beaten Ares and a first-timer looked exactly alike
  ("Ada L — Host — Not ready"). Status is what tells a friend "go easy" or "bring your best",
  and the room already has the tool to act on it (handicaps, #36) — but nothing to read it from.
- Change: every player has a **standing**, earned on their own journey: **Recruit** (no general
  beaten), **Warden** (Puck), **Champion** (Hippolyta), **Warlord** (Odin), **Conqueror** (Ares),
  **Legend** (three stars against every general). It stands by the seat in the battle room
  ("Host · Champion", brighter the higher it is; the tooltip says what it means) and under the
  host's name in the open-battle list ("Warlord · Room 3NCR"). It's updated when the lobby opens,
  so a general beaten in between counts at once.
- Protocol v9: `hello` and `name` carry `rank`; seats and open rooms report it; the server
  sanitizes it. Self-declared — progress lives on the device; an internet server with accounts
  would keep it itself (noted in the protocol).
- Checked: server test (ranks in seats and lists, sanitized, kept on a rename), `playerRank`
  test; mpsmoke screenshots of the room and the lobby list; full verify.

## #81 The Lens of Character Transformation
*How do my characters change over the course of the game? Is the change visible, and does it
matter?*
- The generals change (a chapter opens and closes, #68/#70) and the player's army changes age
  by age — but no single creature ever changed. A Fenrir that had held a lane alone for a
  minute and torn down five foes was the same wolf as the one summoned a second ago. The sim
  even counted each creature's kills (`Unit.kills`) and nothing used them.
- Change: **veterans**. A creature that fells three foes rises a veteran: a golden flare and a
  brass call, "Veteran!" over the player's own, and from then on a **gold chevron** over its
  head; it **strikes 20% harder** and **a quarter of its wounds close** as it rises. The hover
  label says "Fenrir Wolf · Veteran"; the chronicle records each side's first; how-to page 6
  tells the rule. The transformation matters to decisions: a veteran is worth pulling back
  behind a held line (#24) rather than throwing at a gate, and worth hunting on the other side.
- Fairness: blows within a tick are simultaneous, so a promotion mid-tick would let whichever
  side is updated first strike or heal as a veteran sooner — the mirrored-armies tests caught
  exactly that. Promotions now happen at a fixed point at the end of the tick.
- Rules changed (simFingerprint differs); hashed (veteran bit) and saved (old saves load as
  non-veterans).
- Measured: designcheck passes — even battles 18.6 → 18.1 min (a little pacing budget back), the
  ladder for the scripted player 100/57/20/0% → 100/73/20/7% (it keeps creatures alive; still
  inside every criterion); `sim 120 master master` 60–60, so no side bias.
- Checked: `tests/tempers.test.ts` (promotion at three kills, the heal, +20% on the next blow,
  survives a save); mirrored fairness tests; `shoot veterans`; designcheck; full verify.

## #82 The Lens of Inner Contradiction
*What does each character want that is at odds with something else they want — and does the
player ever see it?*
- The generals had a stance each (#78) and ties to each other (#79), but each was all of a
  piece: Puck always playful, Ares always furious. The myths behind them are full of
  contradiction: Odin gave an eye to learn the future and so knows that Fenrir will swallow him
  at Ragnarök; Hippolyta, the warrior queen, meant to give Heracles her girdle freely — it was
  Hera who turned the meeting into a battle; Ares is war itself, yet Zeus calls him the most
  hateful of all the gods; Puck loves games, and war is not one.
- Change: the contradiction shows once, at the right moment — **when Ragnarök begins** (the
  battle's climax, #61), each general says the one thing they would never say earlier: Puck "I
  don't like this game any more. Can we stop now?"; Hippolyta "I would have given Heracles my
  girdle freely. Someone always makes it a war."; Odin "I gave an eye to learn how this ends.
  Some days I wish I had kept it."; Ares "My own father calls me the most hateful of the gods.
  Then let him watch." And Odin has a **nemesis**: the first time the player fields Fenrir
  against him, the all-seeing god falters — "The wolf. It was always going to be the wolf." /
  "Fenrir… not yet. Not today."
- Checked: unit test (every general has a Ragnarök line; only a general with a nemesis has
  nemesis lines, others say nothing); screenshots of the longest line on desktop and phone;
  full verify.

## #83 The Lens of the Nameless Quality
*Does the game have the quality of living things — Christopher Alexander's "quality without a
name"? Which of his properties (levels of scale, strong centres, roughness, echoes, deep
interlock, not-separateness…) does it lack?*
- Walked through Alexander's fifteen properties against a battle. Strong centres (citadels,
  shrines), levels of scale (citadel → gate → creature → particle), echoes (each age's colours
  repeat in HUD, backdrop and creatures, #9), contrast and gradients (dusk skies, the god's
  moment) are there. The weak one was **not-separateness**: the creatures were pasted onto the
  world. They cast a shadow, but a minotaur charging across the sand of Olympus or a jötunn
  wading through Asgard's snow left the ground untouched — the field was a backdrop, not a place.
- Change: **footfalls**. At every step a guardian thuds up a small puff of the lane's own
  ground colour (sand, snow, jade earth, cloud) behind its feet; runners (hunters) kick a wisp
  of it; mystics and fliers, light of foot, leave none. Kept deliberately faint — a thing you
  feel rather than notice. Off in battery saver, and only while the particle pool is under half
  full, so big fights don't pay for it.
- Checked: screenshots (Olympus sand, Asgard snow); perfcheck 1.58 ms per frame (budget 3);
  full verify.

## #84 The Lens of Friendship
*What do players need to make and keep friends through the game — to talk, to play together, to
find each other again?*
- Mythwar is played between people who already know each other (same Wi-Fi). Talking: quick
  messages and co-op calls. Playing together: versus, co-op, handicaps. Inviting: QR, code, copy
  link. Remembering: a per-opponent record in the room. The gap was in *finding each other
  again*: the open-battle list showed a friend you've fought ten times exactly like a stranger,
  in whatever order the server listed rooms.
- Change: the lobby **recognises old rivals** — a room hosted by someone you've battled before
  is listed first, warmly framed in gold, with your record together ("Warlord · Room PXUA · you
  2 – 0"; the tooltip: "You have battled Ada before"), and a soft chime plays when a friend's
  battle appears while you wait in the lobby — the "wait here and your friend's battle will
  appear" promise of the empty list, kept audibly.
- Checked: a new mpsmoke step (after two battles, A's lobby shows B's new room as a friend with
  "you 2 – 0"); full verify.

## #85 The Lens of Expression
*How can players express themselves in the game — and does anyone else see it?*
- Self-expression so far: a name (#64), a sigil (#75), quick messages, and how one plays (which
  creatures, lanes, stances). But the sigil — the one purely expressive choice — was a small
  glyph by the player's own name, seen only by the player. Expression that nobody else sees is
  half of expression; and on the field itself, nothing was the player's.
- Change: **your sigil flies on your keep** — a gold glyph on a roundel of your side's colour on
  the face of the citadel, in every battle — and **online it is sent to the opponent** (protocol
  v10: `hello`/`name` carry `sigil`, seats report it): they see your moon or crown on your keep
  and by your name in their badge ("vs ☾ Ada"). Your choice is now part of the world and part
  of how the other player knows you. (Co-op: yours on the shared side; the generals carry none.)
  The glyph is drawn unmirrored, so it reads the same on the guest's mirrored field.
- Refactor on the way: the keep's geometry is one helper (`keepGeom`) shared by the drawing and
  the emblem; SIGILS moved next to RANKS in the protocol (settings re-exports them).
- Checked: screenshots (moon on the Fae keep, crown on the Celestial spire, Ada's moon on the
  guest's mirrored view); server test (sigils sanitized and shown to both); new mpsmoke check
  (B sees A's sigil on the keep and in the badge); full verify.

## #86 The Lens of Community
*What makes the players a community — a shared place, shared history, shared identity? What
does the game do to foster it?*
- Mythwar's multiplayer community is small and real: a household, a group of friends, a class,
  all on one Wi-Fi with one game server. Schell's community needs a place to gather and a
  shared history. The lobby is the place, but it had no memory: every room was an island; who
  had won what lived only on each device, privately (#84's records are per pair).
- Change: the server keeps a **Hall of champions** per network — every head-to-head battle won
  and lost on it, across rooms, plus co-op victories over the AI — and the lobby shows the top
  five under the open battles: "**Champions of this network:** ☾ Ada 5–2 · Bo 3–4 (+2 co-op)".
  The evening's story ("who's on top tonight?") now belongs to everyone in the room. Players
  without a win aren't listed (a hall of champions, not a wall of shame). Kept in memory, keyed
  by name, per network like the open-battle list (scoped for a public server), bounded (64
  names per network, 256 networks). Protocol v11 (`rooms` carries `hall`).
- Checked: server test (a forfeit counts 1–0 / 0–1 for the watcher's hall); new mpsmoke step
  (after two battles the lobby shows "☾ Ada L 2–0"), screenshot; full verify.

## #87 The Lens of Griefing
*How can a player spoil the game for others — and what can the design do so it isn't worth it?*
- Went through the griefing routes online: spamming quick messages (already rate-limited per
  player, known phrases only, and there's a setting to hide them), stalling a lost battle by
  vanishing (the away timer forfeits after 90 s and the other may claim the win after 20 s),
  quitting (forfeits and counts in the records and the Hall, #86), forged messages (validated
  by the server). The open one was **pausing**: unlimited pauses, and either player could
  pause again the moment the other resumed — a pause/resume loop held the other player hostage
  for as long as the griefer liked. (Decided in run #4 as "LAN friends"; with a Hall of
  champions and old-rival records at stake, and the internet upgrade in mind, no longer.)
- Change: **three pauses per player per battle**, enforced by the server (protocol v12: the
  count travels with each pause and every snapshot). The pause screen says how many you have
  left ("Paused by Ada · you have 2 pauses left"); with none left, Pause opens the menu only for
  you ("no pauses left, the battle goes on") so Leave and Settings stay reachable. Real
  interruptions — a phone call, a locked screen, lost Wi-Fi — are "away" holds, which stay
  uncapped and keep their own forfeit timer.
- Checked: server tests (three pauses then refused, the other player's untouched, the count in
  snapshots), netgame test; full verify (mpsmoke's pause title reads "you have 3 pauses left").

## #88 The Lens of Love
*What do I love about this game — and does the care show in its details?*
- What I love in Mythwar is its bestiary: sixteen creatures out of real myths, each with its
  own cry (#10), temper and gesture (#77). Yet on the field they were stock — "a Minotaur", one of
  dozens — even the ones that earned something: a veteran (#81) that held a lane alone for a
  minute was nameless, and the battle's real heroes vanished into "Creatures killed: 112".
- Change: a veteran **earns a name out of its own myth** — the Minotaur's true name Asterion,
  Fenrir's sons Sköll and Hati, the valkyries Brynhild and Skögul, the oni Shuten and Ibaraki,
  Tamamo-no-Mae the kitsune, the Titans Hyperion and Atlas, the phoenixes Bennu and Fenghuang,
  the wyrms Fáfnir, Níðhöggr and Ladon (four per creature, stable per creature). It shows on the
  hover label ("Asterion · Veteran Minotaur"), in the chronicle when it rises ("Your Minotaur,
  Asterion, rises a veteran in the top lane."), and the chronicle closes with the **hero of the
  battle** — your creature with the most kills, if it reached veterancy: "Hero of the battle:
  Sköll, your Fenrir Wolf — 9 foes felled." A small thing nobody asked for; the kind of detail
  that says someone cared.
- Checked: unit tests (names for every creature, stable; a full AI battle's chronicle names
  its hero, still in time order and ending with the verdict); full verify.

## #89 The Lens of the Team
*Does the team share an understanding of the game — and could someone new join and contribute
without breaking it?*
- Mythwar has been built by a succession of runs that only share the repository. The design is
  written down (DESIGN.md, LENSES.md), the commands are in the README — but the rules a
  newcomer breaks first were scattered through 1,700 lines of logs: the simulation must stay
  bit-identical across JavaScript engines (no `Math.sin`); anything caused by a blow must wait
  for the end of the tick (lens #81 tripped over this today); a rules change splits online
  play by fingerprint; a protocol change needs a version bump and server-side sanitizing; the
  AI must handle every mechanic. Adding a creature touches six files nobody lists.
- Change: **CONTRIBUTING.md** — where things live, the five rules (each with the test or tool
  that catches a violation), which checks to run for which kind of change, the add-a-creature
  checklist (spec, art, cry, myth, temper, hero names, then classwar/designcheck/gallery), and
  the style the code and texts follow — linked from the README.
- Checked: every command and file named in it exists and runs as described.

## #90 The Lens of Documentation
*Does the design document still describe the game — and does it help the people who use it make
decisions?*
- Read DESIGN.md against the game as it is after 89 iterations. The core (essence, problem
  statement, triangle, lanes, ages, economy) was current, but it described the game of run #5:
  nothing about veterans (which change the core loop's decisions), the creatures' character,
  the single-player modes and meta-progression (journey, stars, feats, trials, later starts,
  sandbox, bestiary, progress codes, Mímir), the multiplayer social layer (standing, sigils,
  rivals, Hall of champions, the pause limit), the generals' inner contradictions, or gamepads;
  the pacing figure was stale (19 → 18 min) and Ragnarök sat under *Economy* by accident.
- Change: DESIGN.md refreshed — veterans and character under the creature classes, two new
  sections (*Single player: modes and meta*, *Multiplayer: the social layer*), the generals'
  contradictions, gamepad controls, Ragnarök moved to the systems it belongs to, numbers
  updated. Each entry names its lens so the reasoning is one search away in LENSES.md.
- Checked: every number and name in the new text against the code (e.g. 18 feats, 3 pauses).

## #91 The Lens of Playtesting
*Why, who, where, what and how will we playtest — and what will we learn from it?*
- Everything so far has been tested by scripts: scripted players, AI-vs-AI battles, two
  headless browsers. What scripts cannot tell is where a newcomer frowns, and the two oldest open
  questions (real iPhone/Android, a real gamepad) need people anyway. A playtest also needs
  numbers afterwards, and the game kept none beyond wins and losses per general.
- Change, in two parts:
  - **A playtest journal**: every finished battle — against a general, online, or co-op — is
    noted on the device (mode, foe, result, length, stars, final age, creatures summoned per
    class, kills, losses, god powers, quick/later start/trials), the last 30 kept. Settings →
    **Copy playtest journal** copies it as one readable line per battle. Nothing leaves the
    device unless the player copies it; it isn't part of progress codes.
  - **docs/PLAYTEST.md**, a one-hour kit for the human: decide the question first (three
    suggested), who and where (fresh eyes, their own phones, the sofa), the setup (`npm run
    lan`, QR codes, a gamepad), what to watch and the one question allowed during play, the four
    questions after, collecting the journals, and where the findings go.
- Found on the way: the extra Settings row pushed the buttons below a 1600×900 window — the
  journal button now shares the progress-code block on one line.
- Checked: unit tests (cap, the text format, a hand-edited save); Settings screenshots desktop
  and phone; full verify.

## #92 The Lens of Technology
*What technologies would make the experience better — the foundational kind, not the
decorative? And is the technology we have doing its job?*
- First the job it already does: PROGRESS recorded the per-frame cost creeping from 0.93 to
  1.97 ms and asked this lens to find out what grew. Measured again three times today, after
  footfalls, veterans and sigils: 1.30–1.58 ms (budget 3). The 1.97 was a noisy run (±0.3 ms
  between runs on this machine) — nothing grew; resolved.
- The foundational gap was elsewhere: **the game server remembered nothing.** Every restart (a
  laptop closed, a crash, an update) wiped the Hall of champions (#86) — the community's shared
  history — and the internet upgrade will need persistent state (accounts, ratings) anyway.
- Change: a small **store seam** (`server/store.ts`, `ServerStore` with `load()` / `save()`):
  the LAN server keeps the Hall in `mythwar-data.json` next to itself (`--data <file>`,
  `--no-save`), written atomically (temp file + rename) at most every 5 s when it changed and on
  Ctrl+C; tests use a memory store; a database can sit behind the same two calls later. What's
  loaded is sanitized like any client input (the file may be hand-edited). The release README
  says where the file is and that deleting it starts afresh.
- Checked: server tests (a battle's result saved after 5 s and back after a "restart",
  sanitized; the file store's atomic write, missing and broken files); the real server and the
  packaged `server.mjs` start with the new options; full verify.
