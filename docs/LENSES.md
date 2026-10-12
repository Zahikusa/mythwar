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
