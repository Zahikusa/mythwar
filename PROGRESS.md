# PROGRESS

Status: complete, in verification mode — both phases of TASK.md are done: Phase 1 (local Wi-Fi
multiplayer, run #4) and Phase 2 (100 iterations, one per lens of Jesse Schell's *The Art of
Game Design*, runs #5–#7, finished 2026-10-13). Each run now: review, then complete ≥ 2 items of
the improvement backlog below (verified, committed) and add what the review finds.

## Improvement backlog (verification mode, phase 2)
1. [x] `src/ui/heroes.ts`: a veteran's name comes from its unit id alone, so two veterans of one
   kind can share a name in the same battle ("Your Minotaur, Asterion, rises…" twice, for two
   different minotaurs). Assign names per battle in the order veterans rise. (Done: `HeroNames`,
   one per view — renderer and chronicle agree; a fifth of a kind is "Asterion II".)
2. [x] `server/lobby.ts` `hallEntry`: "days played" uses UTC days, so a European evening that
   runs past 01:00/02:00 local time counts as two days and inflates "came back on another day".
   Use the server's local calendar day. (Done: `localDay()`, tested across local midnight.)
3. [x] Online results: no way to say "Well played!" after the battle (quick messages only exist
   in battle) — phase-1 backlog #25. (Done: Well played! / Good luck! / Thanks! chips on the
   online results, the other player's words shown there; hidden once they leave; on short
   screens the results' buttons are now pinned like every other screen's. mpsmoke checks it.)
4. [x] `scripts/smoke.ts`: nothing checks that the results screen fits a 1600×900 / 1366×768
   window in its fullest form (new feats + new best + chapter close + break note + chronicle);
   several lenses added lines to it and two of them overflowed until spotted in screenshots.
   (Done: smoke renders the fullest results at 1600×900 and 1366×768 — it found 922/900 at
   once; the stacked results are tighter between 861 and 1000 px and fit, 900/900.)
5. [x] `src/render/renderer.ts`: a temper gesture (#77) can start in the middle of an attack
   swing and overlay it (a hop mid-swing); start it when the swing ends instead. (Done: it waits
   up to 0.8 s for the swing to end; a sandbox melee still showed 5 gestures in 12 kills.)
6. [x] `package.json`: the new tools `scripts/servercost.ts` and `scripts/ogcard.mjs` have no npm
   aliases (economy, designcheck, puzzlecheck do). (Done: `npm run servercost`, `npm run ogcard`.)
7. [x] Results at 1600×900 fit with zero headroom in their fullest form (900/900): the next line
   added will overflow (smoke now catches it). Consider the side-by-side results layout up to
   ~940 px instead of only ≤ 860 px. (Done: between 861 and 1000 px the table sits beside the
   chart, the verdict stays stacked; smoke now reports the room to spare.)
8. [x] `scripts/ogcard.mjs`, `scripts/crop.mjs`, `scripts/shoot.ts`, `scripts/smoke.ts` hard-code
   `C:/Program Files/Google/Chrome/...`: the tools fail on macOS/Linux. Take `CHROME` from the
   environment and try the usual install paths. (Done: `scripts/chrome.ts`, used by all 15.)
9. [x] `src/ui/settings.ts` `playerLabel` + HUD: a sigil without a name shows "♛ · Celestial"
   (glyph, then a separator with nothing before it); show "♛ Celestial". (Done.)
10. [x] Names are identity for the Hall of champions and rival records: two different people
   called "Ada" on one LAN share a line, and renaming yourself to the champion's name inherits
   their record. A per-device id (localStorage, not the per-tab session token) would fix it.
   (Done: protocol v13 `hello.device`; hall lines keyed by its salted hash, old name lines adopted
   once; the rivals list on the client is still by name — names there are what you see.)
11. [x] `server/store.ts` `fileStore.save` writes synchronously on the server's 4-ms loop: a full
   hall (256 networks × 64 names, ~1.5 MB of JSON) could stall every running battle's turns for
   a frame or two every 5 s. Write asynchronously, one write in flight at a time. (Done: background
   writes, newest pending state wins; `saveNow` on shutdown, after which nothing older lands.)
12. [x] `src/ui/menus.ts` results panel tabs (Armies / Chronicle / Legend) are plain buttons: no
   `role="tablist"`/`tab`, no `aria-selected` — screen readers don't know which panel shows.
   (Done: tablist, tabs with aria-selected/aria-controls, labelled tabpanels; smoke checks.)
13. [x] `scripts/perfcheck.ts`: readings vary up to 3× between runs on this machine (0.48–1.97 ms
   per frame), so the 3 ms budget check is weak. Take the median of several passes and say
   how much they spread. (Done — and it found two more things: the "busy" battle had only ~8
   creatures (now topped up to 30: real AI battles peak at 21–26), and the swings came from the
   laptop's clock speed (a profiler keeps it boosted: ×3.5). Now: median of per-second samples
   without the profiler, then a profile for the split — our script 1.2–1.3 ms per frame (31–32%
   of ~4 ms; the rest is canvas calls incl. headless software raster). Stable across runs.)
14. [x] `src/app.ts` `breakNote()` (Lens #98) has no unit test: hour boundaries, once per hour,
   two hours. Extract the arithmetic into a pure function and test it. (Done: `src/ui/wellbeing.ts`.)
15. [x] Names are free text and, on a public server, shown to strangers (lobby list, Hall of
   champions): a server-side blocklist (`--names <file>`) would be the minimum before going
   public (ROADMAP *Next*). (Done: `--names <file>`; a name with a listed word, compared case- and
   punctuation-blind, becomes "Player" — at hello and on rename.)
(Items 16–23: an independent review of the run #7 diff, 2026-10-13.)
16. [x] `server/lobby.ts` `flush(true)` / `server/store.ts`: Ctrl+C during a background save loses the
   newest Hall (nothing "dirty" → no final save, and `process.exit` cuts the write off); and an
   async `rename` already under way can land after `saveNow`'s.
   (Done: background renames are synchronous on the main thread; shutdown always writes the
   current Hall; test: the result is on disk the moment flush(true) returns.)
17. [x] `src/ui/chronicle.ts`: only each side's *first* veteran is registered with `HeroNames`, so
   the hero of the battle can get a name that differs from the renderer's (a duplicate).
   (Done: every veteran registered; the hero only if it rose; test against a renderer-side registry.)
18. [x] Online results chips: after the opponent leaves and a stranger joins the open room, the
   chips reappear and the stranger's messages show under the old opponent's name.
   (Done: once the opponent leaves, the chips stay away for those results; speakers named from the seats.)
19. [x] Hall of champions: the server cuts to the top 5 *before* the client drops players without
   wins, so a co-op champion with 0 head-to-head wins can vanish behind four 0–1 lines; the
   lobby's tooltip still says "since it started" though the Hall now survives restarts.
   (Done: the server filters to players with a victory before the top five; tooltip fixed; test.)
20. [x] `--names` blocklist: full-width or accented letters slip through (`ｂａｄ`, `bäd`), and names
   loaded from the saved Hall are never checked.
   (Done: NFKD + accents dropped on both sides; saved names checked on load; tests.)
21. [x] Two tabs of one browser share a device id: a two-tab battle credits the win and the loss
   to the same Hall line (and co-op counts twice).
   (Done: same-device battles aren't counted; same-device allies share one co-op victory; test.)
22. [x] `scripts/perfcheck.ts`: the script share comes from a later profiling phase; if the load
   differs then (battle over, fewer creatures) the estimate doesn't describe the timed seconds.
   (Done: the profiling phase must carry the same load (±20% creatures, battle not over), else the
   unscaled number is checked.)
23. [ ] (note) The lobby's old-rival recognition (#84) matches by name; the Hall now tells two Adas
   apart, the rivals list doesn't. Leave unless it confuses players.
24. [x] `src/ui/coach.ts`: Mímir never explains veterans (#81) — a rule players meet in every
   battle, told only on how-to page 6. A tip when the player's first creature rises a veteran.
   (Done: "A veteran! It felled three foes (the gold chevron)…", fits the phone bubble.)
25. [x] `src/ui/bestiary.ts`: the names veterans earn (#88) appear nowhere outside battle; the
   Bestiary could list them per creature (myth-lovers' detail, and a hint that veterans exist).
   (Done: "Veterans are named Asterion, Bronzehorn, …" under each myth.)
26. [x] Privacy: the device id (backlog 10) can't be reset — *Reset records* should also give the
   browser a new id, so its old Hall line is no longer linked to it. (Done; PRIVACY.md says so.)
27. [x] README screenshots (`docs/*.jpg`) date from runs #1–#4: no sigils, veterans, Hall of
   champions, results tabs. Refresh the title, a late battle and the battle room. (Done: title,
   Jade battle, battle room, phone battle with a sigil on the keep; starfall/mobile/creatures kept.)
28. [x] Gamepad (#54): nothing checks that D-pad navigation reaches the new results controls (the
   report tabs, the quick-message chips, "Now bring a friend →"). (Done: smoke walks the app's own
   D-pad moves breadth-first over the results — all 8 controls, tabs included, reachable.)
29. [x] `src/app.ts` break note (#98): "a sitting" never ends while the tab stays open — an hour
   today and a minute tomorrow add up. Start a new sitting after 30 minutes without a battle.
   (Done: `Sitting` in src/ui/wellbeing.ts, tested.)
30. [x] Co-op (#85): each ally sees *their own* sigil on the shared keep, so the two screens
   disagree; show the host's (or both) the same way on both. (Done: the host's, on both screens.)
31. [x] Lobby (#85): the open-battle list shows the host's standing but not their sigil — the
   emblem a player chose isn't seen until the battle. (Done: "☾ Ada" in the list; protocol v14.)
32. [x] `server/main.ts` flags (`--data`, `--no-save`, `--names`) are only tested through the
   Lobby class; nothing starts the real server process with them (a typo in main.ts would pass
   every test). A small end-to-end check: start, battle via two clients, restart, Hall is back.
   (Done: tests/server-process.test.ts — the real process with --data/--names over real sockets;
   found on the way: Vitest computed a different rules fingerprint than Node — item 33.)
33. [x] `src/sim/fingerprint.ts` hashed `JSON.stringify` of the data module's namespace, whose key
   order is the environment's business (Node and the browser bundle: sorted, as the spec says;
   Vitest: declaration order). A bundler change could have split online play by fingerprint.
   (Done: keys sorted explicitly — the value is unchanged for Node and the browser, Vitest agrees.)
(Items 34–35: a check of the documents against the code, 2026-10-13.)
34. [x] Privacy: the Hall's network keys are SHA-256(salt + address) with the salt in the same file
   — whoever has the file can try all ~4 billion IPv4 addresses and recover them. Use a slow,
   memory-hard hash (scrypt), cached per network, and say plainly what it protects. (Done:
   scrypt N=2^14 ≈ 19 ms here, once per network per run; PRIVACY.md says what it protects.)
35. [x] Docs drifted from the code: PRIVACY (deleting the file while the server runs erases
   nothing; the Hall also stores the last day and the hashed device id; the network address also
   picks your Hall; four copy buttons, not three), MULTIPLAYER (Hall keyed by device, kept across
   restarts, two-tab battles not counted; turns also go out right after a command; the lobby's
   real "Connecting…" texts; "small interface"), README ("sixteen deeds" → eighteen), DESIGN
   (surges every 100–160 s, not "2–3 minutes"). (Done, all nine.)
36. [x] `server/lobby.ts` `hallKey`: the scrypt (≈19 ms) runs on the server's 4-ms loop the first
   time a public network shows up — a hitch for every running battle. Compute it asynchronously
   when the network first connects. (Done: `scrypt` in the background on first connection; the
   list shows that network's Hall once it's ready; the sync path stays as a fallback.)
37. [x] `server/main.ts --port 0` (any free port) prints "localhost:0" — the real port is never
   shown, so scripts and tests have to guess a free one (tests/server-process.test.ts does).
   (Done: the bound port is printed; the process test starts on port 0.)
38. [x] The game bundle grew from ~300 kB to 400 kB (135 kB gzipped) over phase 2: find what grew
   and whether rarely-used screens (Bestiary myths, riddles) should load on demand.
   (Done: measured per source file from the source map — the growth is the game itself spread
   over renderer/hud/menus/app (10–11% each); Bestiary 1.1%, riddles 0.8%: not worth splitting.
   The one clean cut was the QR library (5%, only a host waiting for a guest needs it): it now
   loads on demand — main chunk 401 → 381 kB (128 kB gzipped); mpsmoke waits for the QR.)
39. [x] No end-to-end check of Settings → "Copy playtest journal" (#91) or the break note in a real
   battle flow; both are only unit-tested. (Done: smoke `journalFlow` — an hour into a sitting
   the results say "take a break" instead of the next foe, once; the battle is in the saved
   journal; Main menu → Settings → Copy copies every battle, status line says how many.)
40. [x] `src/net/connection.ts`: a WebSocket stuck dialling (a phone switching Wi-Fi mid-dial: the
   SYN goes nowhere) is never given up — `tickle` only watches *open* links, so the client sits
   in "Connecting…" until the browser times out (up to a minute or more). And the browser's
   `online` event (network back) isn't used. No unit tests for Connection at all.
   (Done: a dial is given up after 5 s, 7.5 s, … 15 s and retried; `online` dials at once;
   tests/connection.test.ts — backoff, silent link, dial limit, refusals, RTT, nudge.)
41. [x] `server/static.ts`: compressed copies are cached per file name, and hashed bundles get a new
   name with every build — a server left running through many rebuilds (`npm run dev` users,
   a host updating the folder) kept every old bundle's brotli and gzip copy in memory forever.
   No tests for the static server at all. (Done: at most 48 copies, least recently used dropped;
   tests/static.test.ts — headers, gzip body, the cap, path escapes, bad methods and URLs.)
42. [x] `src/ui/progress.ts`: progress codes don't carry solved riddles (#52/#66) — a player who
   solved them on the PC finds them unsolved on the phone; any string is accepted as a feat (a
   forged code with 100 junk ids filled the list, and the load-time cap of 100 then cut real
   feats earned later); an online name "__proto__" swapped the tallies object's prototype.
   (Done: `q` carries riddles (older codes still load), feats/riddles filtered to known ids,
   "__proto__" handled; tests.)
43. [x] `src/ui/settings.ts` `recordOnline`: an online opponent named "__proto__" made it read
   `Object.prototype` as the tally and `w++` on it — every object in the page got `w = NaN`;
   "constructor"/"toString" bumped Object's own functions and the record was lost; the lobby's
   old-rival lookup showed "undefined" records for such names. (Done: `onlineRecord` reads own
   keys only, `putOnline` defines instead of assigning — in battle, on load and in progress
   codes; such names are kept like any other; tests incl. save → load and a progress code.)
(Items 44–49: an independent review of the netcode, 2026-10-13 — each traced, 1–3 reproduced.)
44. [ ] `server/net.ts` ~63: a socket rejected for the per-address limit (`ws.close(1013)`) has no
   'error' listener — a bad frame on it (e.g. unmasked) throws `WS_ERR_EXPECTED_MASK` uncaught
   and **the server process exits**. Reproduced: 32 sockets from one address, a 33rd sends an
   unmasked frame. Fix: `terminate()` it, or listen for 'error' first.
45. [ ] `server/net.ts` ~48: upgrade requests for other paths than `/mp` are ignored and never
   closed in standalone mode (no timeout, not counted per address) — 50 such sockets stayed open.
   Destroy them when not running under Vite (Vite's HMR socket needs them).
46. [ ] `server/match.ts` ~114 / `server/lobby.ts` ~443: `away` toggled (19 s away, 0.1 s back,
   away again) restarts `awaySince` every time — the opponent can never claim (20 s) and the 90 s
   forfeit never comes; also bypasses the 3-pause cap. Count away time per battle (or don't
   reset when back for only a moment); rate-limit toggles.
47. [ ] `server/lobby.ts` ~679–702: past 4096 networks `hallKeys.clear()` empties the whole cache —
   every connected network's Hall shows empty until a reconnect, and every battle end runs a
   `scryptSync` (~20 ms) on the 4-ms loop. Evict oldest-first; re-warm keys of live sessions.
48. [ ] `src/net/client.ts` ~217–290: `leave()` only sets `leaving` when the send fails — a `room`
   or `start` message already on its way puts the room back / starts a battle the player just
   left (then forfeited). Set `leaving` always; clear it on `left`.
49. [ ] `server/match.ts` ~293 / `server/lobby.ts` ~503: on forfeit, `finish()` sends `over` before
   `ended()`→`snapshotFor()`→`flush()` sends the last `turn`; the client, already over, drops it —
   the final board and the results chart miss the last tick. Flush at the start of `finish()`.





**Start here: [docs/BRIEF.md](docs/BRIEF.md)** — one page: what TASK.md asked for, what was
built, how to see each part working, and the decisions that need you.

## Run #7 in short (for the morning)
- Lenses #77–#84: Creatures have a **temper** and a kill gesture (#77); the generals
  answer the player's deeds from their place on the circumplex (#78), tell their mythic ties at
  first meetings — Hippolyta is Ares' daughter, Odin drank from Mímir's well (#79) — and show an
  inner contradiction at Ragnarök (#82); **standing** titles by each seat in the battle room
  (protocol **v9**, #80); **veterans**: three kills → gold chevron, +20% damage (#81, rules
  changed: simFingerprint differs); footfall dust (#83); the lobby recognises old rivals (#84).
- designcheck after veterans: even battles 18.1 min (was 18.6), ladder 100/73/20/7%;
  `sim 120 master master` 60–60. perfcheck 1.58 ms/frame.
- The death event now carries `killer` (unit id or -1); a new `veteran` event.
- Lenses #85–#92: your sigil flies on your keep and online the opponent sees it (#85, protocol
  v10); the server's **Hall of champions** per network in the lobby (#86, v11), kept across
  restarts in `mythwar-data.json` (#92: `server/store.ts`, `--data`, `--no-save`); **3 pauses per
  player per online battle** (#87, v12); veterans earn myth names and the chronicle names the
  hero of the battle (#88); **CONTRIBUTING.md** (#89); DESIGN.md refreshed (#90); a local
  **playtest journal** (Settings → Copy playtest journal) and **docs/PLAYTEST.md** (#91).
- Protocol is now **v14** (v13: device ids for the Hall; v14: the host's sigil in the open-battle list): server and pages must come from the same build.
- Lenses #93–#100 finished Phase 2 (ROADMAP, BRIEF, PITCH + link-preview card, PROFIT +
  `npm run servercost`, PRIVACY + a break note after each hour, the Raven's mpsmoke check of a
  battle starting in a hidden tab, "Now bring a friend →" when the war is won).
- Verification mode: improvement backlog items 1–15 all done (unique hero names, local-day hall,
  "Well played!" on online results, results-fit check in smoke (found a real 22-px overflow),
  gesture timing, script aliases, cross-platform Chrome lookup, lone-sigil label, device ids for
  the Hall, async hall saves, accessible report tabs, a trustworthy perfcheck, break-note tests,
  a name blocklist).
- perfcheck now measures a heavy 30-creature field: ~1.25 ms of our script per frame (budget 3);
  in headless Chrome ~2/3 of the frame is canvas calls incl. software raster (`ctx.stroke` of
  the outlined art) — on phones that raster runs on the GPU; low-end devices fall back to the
  automatic battery saver.

## Run #6 in short (for the morning)
- Lenses #45–#76 done (one commit each, reasoning in `docs/LENSES.md`). Highlights: battles are
  fought at named places (#45); **economy** probe `npm run economy` found blessings 4×
  underpriced — priced by worth, Mythic banks for them (#46); counter-triangle matrix
  (`classwar --matrix`) fixed Asgard's and Jade's limp counters (#47); **colour-blind setting**
  (foe in orange) + `shoot --cvd` simulation (#48); the title shows the whole ladder (#49);
  **each gate trains its own creature** — lanes train in parallel (#50); **Legend of the Ages**
  capstone feat (#51); **Riddles of war** — 4 hand-made puzzle battles, brute-forced by `npm run
  puzzlecheck` (#52); unaffordable taps **arm** a card to auto-summon (#53); **gamepad** support
  (#54); XP rings on the age badges (#55); trials hidden until a first win (#56); countered
  blows glance off + "Effective!/Resisted" words (#57); blessings felt on the field (#58);
  **citadel heartbeat** below 30% (#59); sandbox foe mode on the cards (#60); Ragnarök foretold
  3 min ahead with building drums (#61); the Elder Dragon's arrival as an event (#62); no
  banner through the results (#63); **your name** by your citadel and in the generals' mouths
  (#64); **battle chronicle** on the results and in Copy result (#65); riddles for Jade and
  Celestial (#66); a **god's moment** on your power: slow-motion + the field darkens around the
  lane (#67); the generals as **journey chapters** that open (#68) and close (#70); riddles drop
  inert controls (#69); **start in any age already reached** (#71); the crowded lane calls for
  your power (#72); tips from **Mímir** (#73); travellers in the far sky (#74); a personal
  **sigil** by your name (#75).
- End of run #6 (05:25): `npm run verify` and `npm run enginecheck` pass, tree clean. Phase-1
  backlog #30/#31 closed (#30 was already done).
- Next run: continue at Lens #77 (Character Traits). New tools this run: `npm run economy`,
  `npm run puzzlecheck`, `node scripts/classwar.ts --matrix`, `shoot --cvd <type>` and
  `shoot --settings '{…}'`. New settings fields: colorblind, riddles, startAge, sigil.
- Bugs fixed: loading a progress code erased best star ratings; the intermittent "arc radius is
  negative" (a negative frame time step ran a summon animation backwards).
- Rules changed (simFingerprint differs from run #5 builds): blessing prices, Fenrir/Jötunn/
  Kitsune/Byakko numbers, parallel training. designcheck passes (now 60 even battles; ladder
  ~100/60/7–20/0%, even battles 18.6–19.7 min); enginecheck: all engines identical.

## Run #5 in short (for the morning)
- Phase 2 started: lenses #1–#40 done, one commit each (`git log --oneline | grep Lens`), full
  reasoning per lens in `docs/LENSES.md`.
- Biggest additions: **co-op rooms** (two friends vs a server-run AI, #37) with tactical calls
  (#38); **handicaps** in rooms (#36); **hold the line** lane stance (#24); **Ley Surges** (#2)
  and **ley sight** (#22); **Quick battles** (#39); **Trials** (#31); **rush an age** (#33);
  **Sandbox** (#15); **Bestiary** (#11); **16+2 feats** (#17); **three-star rating** with live
  goals (#20, #25); **progress codes** PC ↔ phone (#19); Novice follows the player up the ages
  (#13); AIs bank for the Elder Dragon (#32); Zeus/Starfall targeting (#29, #34); brittle frost
  (#23); per-creature cries (#10); lore lines, age-tinted HUD, many smaller clarity fixes.
- Protocol is now v8 (trials, co-op, stance): server and pages must be from the same build
  (simFingerprint also changes with every balance/rule change, e.g. #46–#50).
- New tools: `npm run designcheck` (difficulty ladder, pacing, variety, side fairness — all
  pass: ladder 100/53/13/0% for the scripted player, even AI battles 19.2 min), `npm run
  perfcheck` (per-frame JS budget). Verified throughout with `npm run verify` (unit tests,
  smoke, multiplayer smoke incl. a co-op battle).

## Phase 2 — open issues found along the way
- (Resolved in run #6) The intermittent "IndexSizeError: arc radius is negative": caught with a
  stack at last (drawUnit → creature art → the outlined-circle helper). A creature's draw scale
  went slightly negative because the frame loop allowed a *negative* time step (`last` stamped
  with performance.now() after a slow start, `now` an earlier frame timestamp), running the
  summon-in animation backwards. dt is now clamped at 0, the spawn factor to [0, 1] and the art
  scale to > 0 (defensive). Watch the next smoke runs to confirm.
- The results screen at 1600×900 is close to its height budget (the smoke test clicks "Change
  foe"): new lines on it must share existing ones (done for surge gold, rewards).
- The smoke's "number key summons" check was timing-sensitive after #35 added a wheel step
  before it (a creature could leave the queue between the two reads); it now counts queued +
  summoned and tops up gold first.

- Pacing sits close to its limit: even AI battles 19.4–19.7 min median (limit 20). The
  30-battle median was too noisy to judge (±1 min from a one-point change), so designcheck now
  plays 60. A future lens that lengthens battles must pay it back.
- Pure-Mystic armies are the strongest single composition in `classwar --matrix` (only pure
  Hunters beat them) — the triangle working, but watch it (#47).

- (Resolved in run #7, Lens #92) perfcheck read 1.97 ms of game JS per frame once; repeated
  runs on 2026-10-13 read 1.30–1.58 ms (after footfalls, veterans, sigils), so the 1.97 was
  machine noise (±0.3 ms between runs). Budget 3 ms. Measured:
  the run-5 checkpoint (34752bb) does 1.64 ms on this machine today, run 6 ~1.85 ms (likely
  more creatures on the field with parallel training; the attract battle has no new callouts).

## Phase 2 — how each iteration works
- One iteration = one lens (numbering of the book's first edition / the 100-card deck).
  Ask the lens's questions about Mythwar, pick the **one most valuable concrete change** it
  reveals, build it, verify it, commit it as `Lens #N (Name): …`.
- The full reasoning per lens (questions, observations, change, verification) goes to
  `docs/LENSES.md`; the checklist below gets the one-line result.
- Verification per change: `npx tsc --noEmit` + `npx vitest run` always; `npm run smoke` for
  UI/app changes; `npm run mpsmoke` for app/net/sim changes; `npm run sim` / `node
  scripts/calib.ts` for balance changes. Simulation changes alter `simFingerprint()` (builds
  must match online — fine, both devices load the same server build).
- Single player keeps working with every new mechanic: the AI must use/handle it.
- Order: numeric. A lens whose idea turns out not to be worth it still gets a real change
  (a smaller one the lens points at) — never an empty iteration.

## Phase 2 — lens checklist (tentative idea → result)
- [x] #1 Essential Experience — essence written in DESIGN.md; every battle opens with "Topple their citadel — vs <foe>" + war horn
- [x] #2 Surprise — Ley Surges: a foretold, seeded shrine surge every 2–3 min (race for a flood of gold)
- [x] #3 Fun — "Rout! / Slaughter! / Annihilation! ×N" callouts + brass stab when 4+ foes fall in a lane within 2.5 s
- [x] #4 Curiosity — Ascend preview of the next age; never-reached ages are glowing silhouettes and "???"
- [x] #5 Endogenous Value — unaffordable cards show a savings bar and "in Ns" from your current income
- [x] #6 Problem Solving — setting to switch off the "Counter!" advice so experts solve the counter puzzle themselves
- [x] #7 The Elemental Tetrad — story was the weak element: a lore line per age under the opening and ascension banners
- [x] #8 Holographic Design — seams between systems: results count Ley Surge gold, tip for lost surges, tip respects the advice setting
- [x] #9 Unification — theme written down; the HUD (cards, action buttons) takes on each age’s accent colour
- [x] #10 Resonance — the legends are the resonant core: each of the 16 creatures answers the summons with its own synthesized cry
- [x] #11 Infinite Inspiration — a Bestiary (title + pause): every creature with the real myth behind it; unreached ages hidden
- [x] #12 The Problem Statement — problem + 4 measurable success criteria in DESIGN.md; `npm run designcheck` measures them (all pass)
- [x] #13 The Eight Filters — weak filter = audience: newcomers never saw the ages; Novice now follows the player up the ages
- [x] #14 Risk Mitigation — risk register; `npm run perfcheck` guards the per-frame JS budget (0.93 of 3 ms) as effects are added
- [x] #15 The Toy — Sandbox: no foe, endless gold, unbreakable citadels, summon for either side (X)
- [x] #16 The Player — "Start here" / "Next challenge" ribbon on the easiest foe not beaten yet
- [x] #17 Pleasure — pride in accomplishment was missing: 15 Feats, toasts, results line, title chip + list
- [x] #18 Flow — win/loss runs per foe; results offer "Face the <next>" after a win, the easier foe after 3 defeats in a row
- [x] #19 Needs — safety: progress codes carry records/feats/ages between devices (merging, never losing)
- [x] #20 Judgment — three-star rating with reasons (victory, citadel above half, par time); best per foe on its card
- [x] #21 Functional Space — each gate's reach (ward or turret range) drawn as a dashed line that lights up with foes inside
- [x] #22 Dynamic State — ley sight: holding a lane's shrine reveals the foe's queued summons for that lane
- [x] #23 Emergence — brittle: frozen creatures take +50% damage from everything (Fimbulwinter becomes a setup)
- [x] #24 Action — new verb: hold the line (per-lane stance at the shrine, G / shield button, war banner)
- [x] #25 Goals — star goals live in the pause menu, toasts when the citadel or par star slips
- [x] #26 Rules — new rules were only in coach tips: how-to page 6 "Tactics" (hold the line, ley sight, brittle frost)
- [x] #27 Skill — countering measured: "creature damage that countered" on results + a tip for poor counterers
- [x] #28 Expected Value — blessings show their next rank's worth in concrete numbers (dps for your army, health, citadel)
- [x] #29 Chance — Starfall's meteors weighted toward crowds (was uniform per foe: stragglers soaked stars)
- [x] #30 Fairness — mirrored side-bias test for the phase-2 mechanics; the AI's income handicap shown by its name on the results
- [x] #31 Challenge — Trials: Glass Citadel, Godless, No Walls (any foe; feat for all three)
- [x] #32 Meaningful Choices — the dragon is a real choice (equal-gold tests) the AI never made; able AIs now save for it in calm moments
- [x] #33 Triangularity — rush an age with 75% of the XP for a double tithe (risky early age vs safe wait)
- [x] #34 Skill vs. Chance — Wrath of Zeus strikes the foes nearest your citadel first (was random)
- [x] #35 Head and Hands — head game, hands need efficiency: mouse wheel steps the selected lane
- [x] #36 Competition — novices couldn't compete with expert friends: per-player handicaps (trials) in the battle room (protocol v7)
- [x] #37 Cooperation — co-op rooms: two friends share one side against a server-run AI (lockstep, protocol v8)
- [x] #38 Competition vs. Cooperation — both ends of the scale now; co-op gets tactical calls ("Help top!" lights the lane on the ally's screen)
- [x] #39 Time — turrets fire at half rate in Ragnarök (pacing back to 19.2 min); Quick battle option (~10 min)
- [x] #40 Reward — "New best vs <foe>: ★★★" on the results; title laurels show each foe's best stars
- [x] #41 Punishment — a power cast into an empty lane is refused (charge kept) instead of silently wasted
- [x] #42 Simplicity/Complexity — progressive disclosure: newcomers see the hold shields when the coach introduces them (2:30)
- [x] #43 Elegance — results tip and next-foe button no longer say the same thing: the tip points at the missing star
- [x] #44 Character — the AI difficulties are generals with a voice: Puck, Hippolyta, Odin, Ares (taunts at key moments)
- [x] #45 Imagination — every battle is fought at a named place from its seed ("The Battle of Weeping Ford"): banner, pause, results, shared result
- [x] #46 Economy — `npm run economy`; blessings were 4× underpriced (free Might = 80% wins): priced by worth, Mythic banks for them; "fallen creatures feed the foe" told (how-to, results tip)
- [x] #47 Balance — counter matrix (`classwar --matrix`): Asgard G>H (+0.09) and Jade H>M (+0.26) were limp; Fenrir lifesteal ⅕, Jötunn +8% hp, foxfire leaps 40%, Byakko +10% hp → +0.43–0.48 like other ages
- [x] #48 Accessibility — `shoot --cvd` simulation: class cues safe (icons), but the foe turned grey for protanopes; Colour-blind friendly setting (foe in orange)
- [x] #49 Visible Progress — the title shows the whole ladder of generals (unbeaten ones dimmed with ☆☆☆), not only the beaten ones
- [x] #50 Parallelism — one trainer for three gates blocked emergencies (4.9 s waits, p90 12 s): each gate now trains its own creature (queue of 5 in all)
- [x] #51 The Pyramid — capstone feat "Legend of the Ages" (★★★ vs every general) heads the feats with per-general progress; fixed progress codes dropping stars
- [x] #52 The Puzzle — Riddles of war: 4 hand-made one-question battles (fixed purse, foe on the field), brute-forced so only a few answers win
- [x] #53 Control — tapping a card you cannot afford yet arms it: it summons itself once the gold is there (tap again to cancel)
- [x] #54 Physical Interface — gamepads: face buttons summon the cards as they sit on the pad (X A B, Y), D-pad lanes, shoulders power/hold/ascend/undo; menus by D-pad + A/B
- [x] #55 Virtual Interface — the age race was invisible until the foe could ascend: XP rings around both age badges
- [x] #56 Transparency — the foe screen hides the Trials (handicaps) until a first victory
- [x] #57 Feedback — countered blows glance off (grey puff, dull tock); "Effective!" / "Resisted" over your creatures now and then
- [x] #58 Juiciness — a blessing is felt on the field: shockwaves and flashes through the blessed army (Bastion: the gates)
- [x] #59 Channels and Dimensions — below 30% your citadel has a heartbeat (sound + phone pulse) that quickens as it falls
- [x] #60 Modes — the sandbox's "For: Foe" mode now shows on the cards themselves (foe portraits, frames, label)
- [x] #61 The Interest Curve — measured a lull at minutes 11–14 before the Ragnarök climax: foretold 3 min ahead, drums build, a horn at one minute
- [x] #62 Inherent Interest — the Elder Dragon's arrival is an occasion: fiery burst, shake, a banner; its fall announced
- [x] #63 Beauty — no banner showing through the results (the same words twice); the riddle result gets a portrait composition
- [x] #64 Projection — "Your name" in Settings: by your citadel in every battle, and the generals address you by it
- [x] #65 The Story Machine — each battle writes its chronicle (first blood, ascensions, dragon, the end) on the results and in Copy result
- [x] #66 The Obstacle — riddles stopped at Asgard: The White Tigers (Jade) and Sky and Stone (Celestial), brute-forced
- [x] #67 Simplicity and Transcendence — your god power is a god's moment: time slows to a third and the field darkens around the struck lane
- [x] #68 The Hero's Journey — the four generals are chapters (Call, Threshold, Ordeal, Return): on the foe cards and told at the first battles
- [x] #69 The Weirdest Thing — riddles offered Ascend/Turrets/Blessings and a frozen XP bar: hidden there (keys too)
- [x] #70 Story — each journey chapter closes with an ending line on the first win over its general (the last ends the war)
- [x] #71 Freedom — start a battle in any age already reached (foe screen chip; no stars for a later start)
- [x] #72 Indirect Control — with the power ready, the most crowded lane (4+ foes) lights its marker gold and the button glows brighter
- [x] #73 Collusion — the coach's tips come from Mímir, keeper of the well (the player's mentor)
- [x] #74 The World — travellers cross the far sky now and then (wisp, eagle, Odin's ravens, sky dragon, comet)
- [x] #75 The Avatar — a personal sigil (sun, moon, star, crown, swords, lozenge) by your name and on the results
- [x] #76 Character Function — tooltips lead with each class's job (front line, striker, backline, siege-breaker)
- [x] #77 Character Traits — each creature has a temper (word in the Bestiary) and a gesture when it fells a foe (roar, hop, twirl, rear, loom)
- [x] #78 The Interpersonal Circumplex — the generals answer the player's deeds (ascending, a god power on them, a shrine taken back) from their place on the circumplex
- [x] #79 The Character Web — the myths' own ties (Hippolyta is Ares' daughter, Odin drank from Mímir's well, Puck is Oberon's) in first-meeting lines and the chapters
- [x] #80 Status — a standing earned on the journey (Recruit → Warden → Champion → Warlord → Conqueror → Legend) by each seat and in the open-battle list (protocol v9)
- [x] #81 Character Transformation — veterans: three kills and a creature rises (gold chevron, +20% damage, a quarter healed), promoted at the end of the tick for fairness
- [x] #82 Inner Contradiction — at Ragnarök each general shows their contradiction (Odin who knows his doom, Hippolyta who wanted peace…); Odin falters when you field Fenrir
- [x] #83 The Nameless Quality — not-separateness: guardians and runners kick up the lane's own ground (sand, snow, cloud) at every footfall
- [x] #84 Friendship — the lobby recognises old rivals: their rooms first, framed in gold, with your record together; a chime when one appears
- [x] #85 Expression — your sigil flies on your keep, and online the opponent sees it there and by your name (protocol v10)
- [x] #86 Community — the server's Hall of champions per network (wins/losses across rooms, co-op victories) in the lobby (protocol v11)
- [x] #87 Griefing — 3 pauses per player per online battle (server-enforced; away holds uncapped), then the menu opens only locally (protocol v12)
- [x] #88 Love — veterans earn a name out of their myth (Asterion, Sköll, Brynhild…); the chronicle names the hero of the battle
- [x] #89 The Team — CONTRIBUTING.md: the five non-obvious rules (determinism, same-tick fairness, fingerprint, protocol, AI), what to run per change, the add-a-creature checklist
- [x] #90 Documentation — DESIGN.md refreshed: veterans, character, the modes and meta, the multiplayer social layer, gamepad, Ragnarök filed under systems
- [x] #91 Playtesting — a local playtest journal (last 30 battles, Settings → Copy playtest journal) and docs/PLAYTEST.md, a one-hour playtest kit
- [x] #92 Technology — the server remembers: a store seam (file for the LAN server, memory in tests; a database later) keeps the Hall of champions across restarts; perf re-measured (1.3–1.6 ms, the 1.97 was noise)
- [x] #93 The Crystal Ball — "do friends come back for a second evening?": the hall counts days per player and the server reports returners at start; docs/ROADMAP.md
- [x] #94 The Client — docs/BRIEF.md: each TASK.md requirement → what was built → how to see it yourself; what's unverified; the decisions that need the client (linked atop PROGRESS)
- [x] #95 The Pitch — docs/PITCH.md (one line, elevator, 30 s, store texts); link previews: og/twitter tags + a 1200×630 card (scripts/ogcard.mjs); manifest/meta description
- [x] #96 Profit — scripts/servercost.ts measures a battle's hosting cost (~19 MB/h, 0.04% of a core); docs/PROFIT.md: cost model + no-pay-to-win stance
- [x] #97 Transformation — the results' Legend tab tells the real myth behind your champion of the battle
- [x] #98 Responsibility — a break suggested on the results after each hour of battles; public network keys hashed in the hall file (no IPs at rest); docs/PRIVACY.md; Reset records clears the journal
- [x] #99 The Raven — stepped back: the newcomer path is fine; the core risk was an untested multiplayer path — mpsmoke now starts a battle with one tab hidden (backlog #29 closed)
- [x] #100 Your Secret Purpose — two people at one table: winning the war (first victory over Ares) ends with "Now bring a friend →" into Multiplayer; reflection in LENSES.md

# Phase 1 — Local (Wi-Fi) multiplayer (complete)

Status: complete (verification mode since run #4, 2026-10-07; backlog below still open for spare time)

## Run #4 in short (for the morning)
- **Multiplayer over the local Wi-Fi works end to end:** `npm run lan` → open the printed
  address / scan the QR code on each device → Multiplayer → Host / Join (code, QR, or the
  "open battles on this network" list) → both Ready → 3-2-1 → battle. PC, iPhone, Android in
  any combination (plain browsers; nothing platform-specific). See docs/MULTIPLAYER.md.
- **Architecture:** authoritative Node server (rooms + the same deterministic simulation,
  60 Hz) + lockstep replicas in the browsers fed by "turns"; hashes every second, snapshots for
  reconnect / reload / desync. Ready for an internet server later (wss, room codes, versioned
  protocol + rules fingerprint).
- **Robust:** app switches / screen lock (battle waits, 90 s to return), Wi-Fi blips
  (auto-reconnect + snapshot), reload mid-battle, missed endings, quitting offline, duplicated
  tabs, version mismatches, laggy networks (adaptive jitter buffer).
- **Polish:** shared pause, 3-2-1 countdowns, opponent-away banner with forfeit timer and a
  "Claim victory" after 20 s, quick messages (emotes), ping per seat in the room and a
  connection badge in battle, orders in flight shown at once (gold, faded queue chips),
  per-opponent records, rename in the room, chimes, fullscreen on Ready for phones.
- **Verified by:** 128 unit tests (incl. a simulated network), `scripts/mpsmoke.ts` (two Chrome
  profiles, desktop + phone, every flow; also `--latency 60 --jitter 80` and `--portrait`),
  `scripts/enginecheck.ts` + `scripts/mpengines.ts` (V8, SpiderMonkey and JavaScriptCore/WebKit
  simulate identically; online Chrome/Firefox vs WebKit battles stay in sync), bot-vs-bot soaks
  (`scripts/mpbot.ts --vs-bot --debug`). Not tested on physical phones (see below).

Task (TASK.md): play a polished, stable match against another human on the same WLAN, across
PC ↔ phone and iOS ↔ Android, built so it can later be upgraded to public online multiplayer.

The single-player development log (runs #1–#3) moved to `docs/PROGRESS-singleplayer.md`.

## Architecture decision (run #4)
**Authoritative Node WebSocket server + deterministic lockstep clients.**
- One small Node server (`server/`) serves the built game *and* hosts multiplayer rooms over a
  WebSocket (`/mp`). Run it on any PC in the Wi-Fi (`npm run lan`); every device — Windows/Mac
  browser, iPhone Safari, Android Chrome — just opens the printed URL (or scans the QR code).
  No app store, no install, nothing platform-specific ⇒ PC ↔ phone and iOS ↔ Android for free.
- The server owns the clock: it runs the same deterministic simulation (`src/sim`, imported
  directly — Node 24 strips the TS types), applies both players' commands at a tick of its
  choosing and broadcasts "turns" (`{tick, commands}`) a few times per tick-batch. Clients replay
  the identical simulation from those turns, with a small adaptive jitter buffer, so they see the
  exact same battle with only commands on the wire (tiny bandwidth, works on bad Wi-Fi).
- Because the server has the true state it can: validate every command (no cheating via the
  client), send a full snapshot to a client that reconnects (phone locked, app switched, Wi-Fi
  blip) or that ever desyncs (periodic state hashes are compared), pause the match while a player
  is away and award the win if they never come back.
- Why not WebRTC peer-to-peer: needs a signalling server anyway; LAN ICE between phones relies on
  mDNS candidates, which is flaky (esp. Android ↔ iOS, routers with multicast off); and a
  browser can't keep hosting while a phone is backgrounded. Why not pure state streaming: much
  more bandwidth and the renderer is built around sim events; lockstep keeps every effect.
- Determinism check: the sim only uses + − × ÷, Math.min/max/abs/floor/round/imul (all exactly
  specified in IEEE/ECMAScript, identical in V8 and JavaScriptCore) and its own seeded RNG — no
  Math.sin/exp/pow whose last bits may differ between engines. Hash checks catch anything else.
- Upgrade path to the internet: deploy the same server behind TLS (the client uses `wss://` on
  https pages automatically, or a configured server URL), room codes already work across
  networks; add accounts/matchmaking later. Protocol is versioned.

## Distribution (2026-10-08)
- Public repo https://github.com/Zahikusa/mythwar (`master`). Every push to master runs typecheck +
  unit tests and publishes the game on GitHub Pages: https://zahikusa.github.io/mythwar/ (single
  player on any device, installable, offline). That build (`npm run build:pages`, `.env.pages`)
  has no game server, so its multiplayer lobby explains how to start one and links the download.
- A version tag (`v1.0.0`, must match package.json) publishes `mythwar-server-v<version>.zip`
  as a release (`npm run package`): server bundled into one `server.mjs` (ws included, Node 20+),
  the normal LAN build in `game/`, double-click starters for Windows (offers `winget install`
  of Node.js) and macOS, `start.sh`, README.txt. Tested: unzipped with Expand-Archive, started via
  the .cmd, two bots battled over it with 0 desyncs.

## Milestones
- [x] MP1 Foundation: deps (`ws`, `qrcode-generator`), `src/net/protocol.ts`, `src/sim/hash.ts`,
      determinism tests (replay, snapshot mid-battle continues identically).
- [x] MP2 Server (`server/`): lobby (codes, open-room list, seats, reconnect tokens), match loop
      (turns, hashes, away/pause/resume countdown, forfeit timeout, rematch), validation, ws
      transport (heartbeat, lag simulation), static server, Vite dev/preview plugin.
- [x] MP3 Client netcode: `Connection` (backoff, pings, dead-link detection), `MpClient`
      (session per tab), `NetGame` (jitter buffer with eased playback clock, hash checks,
      snapshot resync, in-flight-aware order checks). Tests on a simulated network.
- [x] MP4 App integration (AI-less Game, no 2x, shared pause, no autosave, results).
- [x] MP5 Mirrored view for team 1 (canvas mirror, readable text, blue = you, input/HUD
      unchanged because the lane layout is symmetric; stereo panning follows).
- [x] MP6 Multiplayer UI (lobby, room + QR invite, countdown, overlays, ping badge, rematch).
- [x] MP7 Phone robustness: away on visibilitychange/pagehide, reconnect nudge, wake lock
      (only on https/localhost), reload rejoins, upright (rotated) phones (`mpsmoke --portrait`).
- [x] MP8 Docs: README + docs/MULTIPLAYER.md (setup, firewall, architecture, internet upgrade).
- [x] MP9 End-to-end: `scripts/mpsmoke.ts` (desktop + phone profiles, all flows), in verify.
- [x] MP10 Verification + polish (bad-network e2e, fresh-eyes review: 7 defects fixed).

## Done
- Server: `server/main.ts` (LAN entry, prints addresses + terminal QR), `server/net.ts`
  (ws attach), `server/lobby.ts`, `server/match.ts`, `server/validate.ts`, `server/static.ts`,
  `server/lan.ts`, `server/qr.ts`. `npm run lan` = typecheck + build + serve on :8787.
- Client: `src/net/{protocol,connection,client,netgame}.ts`; UI `src/ui/{mpmenus,netoverlay}.ts`,
  `src/ui/mp.css`; App wiring in `src/app.ts` (section "Multiplayer").
- Tests: `tests/determinism.test.ts`, `tests/server.test.ts` (fake clock + one real socket),
  `tests/netgame.test.ts` (simulated network: latency, jitter, dead links, desync repair).
  `node scripts/mpsmoke.ts [--shots] [--latency 60 --jitter 80]` (screenshots → screenshots/mp).
- Jitter buffer on a simulated 20–140 ms Wi-Fi: 99% of frames advance exactly one tick.
- Bot soaks (`node scripts/mpbot.ts --vs-bot --debug` against `node server/main.ts --latency 30
  --jitter 40`): a desync turned up after a few minutes; the --debug replay diff showed both
  replicas missing one order — the lag *simulator* reordered messages (one setTimeout per
  message). Fixed (ordered queue); clients now also resync at once on any out-of-order turn.
  After the fix: a full 18-minute bot battle + rematch over 30–70 ms lag with 0 desyncs (the two
  runs still on the old simulator showed 1–6).
- Second fresh-eyes review (run #4, ~20:30): 9 findings, all fixed — forged X-Forwarded-For
  (now the proxy's own rightmost entry; header addresses never get the LAN exemption), per-address
  session/room quotas with idle eviction, room lists throttled to 4/s, a battle starting in a
  hidden tab now counts as away, room list resubscribed after an offline leave, snapshots carry
  fresh away timers and running countdowns, orders pending at a pause are dropped consistently,
  emote ids type-checked, static server compresses asynchronously / caches one version per file /
  can't crash on a vanishing file, IPv6 /64 grouping expands "::".
- Cross-engine: `scripts/enginecheck.ts` (same AI battle in Node, Chrome, Firefox, WebKit —
  identical hashes over 25-minute battles), `scripts/mpengines.ts` (online Chrome/Firefox host vs
  WebKit guest: 0 desyncs). Playwright browsers live in node_modules (PLAYWRIGHT_BROWSERS_PATH=0).
- Measured: snapshots ≤ 12 kB in long battles; server sim 2.5 µs/tick (≈0.015% of a core per
  match). `mpsmoke` passes plain, with `--latency 60 --jitter 80`, and with `--portrait`.

## Decisions
- Single-player stays exactly as it was (AI, 2× speed, autosave). Multiplayer is a separate mode.
- Seats: the host is seat 0 (team 0). Everyone sees their own citadel on the left in blue.
- Either player can pause and either can resume (3 s countdown). (Lens #87: 3 pauses per player per battle; away holds uncapped.) Pauses were unlimited (LAN
  friends); an away player (app in background, link lost) pauses the battle for up to 90 s,
  then forfeits (after 20 s the waiting player may claim the win). Leaving mid-battle forfeits. No W/L records for online games (yet).
- Turns every 2 ticks (33 ms); hash every 60 ticks; commands apply on the server's next tick.
- Session token lives in sessionStorage (per tab): two tabs = two players (easy local testing),
  a reload of the same tab rejoins.
- Builds must match exactly: hello carries `simFingerprint()` (all balance tables + a 30 s
  scripted battle); a mismatch stops reconnecting and asks for a reload.
- While the battle is held (opponent away, countdown, reconnecting) the pause button / Esc opens
  the menu just locally, so the waiting player can always leave.

## Open questions for the human
- **Playtest kit:** docs/PLAYTEST.md is a one-hour plan for testing with real people on real phones
  (it covers the two items below); Settings → Copy playtest journal collects each device's numbers.
- Gamepad support (Lens #54) is tested with a stubbed standard-layout pad only; please try a real
  controller (PC browser, or paired to a phone).
- Real devices: tested in Chrome (desktop + emulated phones, simulated lag) and with Playwright's
  WebKit (JavaScriptCore, iPhone's engine) and Firefox — full battles hash identically on all
  engines, and Chrome/Firefox vs WebKit online battles stayed in sync — but not on a physical
  iPhone/Android. Please try `npm run lan` → scan the QR code with both phones. Windows shows a
  firewall prompt for Node.js on first run: allow *private* networks.
- Screen wake lock only works on https/localhost; on `http://192.168…` phones may auto-lock
  during long pauses (the battle then waits for them as "away"). An https setup (self-signed
  certificate) would fix that but makes browsers show warnings — not done.
- Phone ↔ phone without any PC: needs one device to run the server. A browser cannot host; a
  future native wrapper (Capacitor) or the public online server would cover that.

## Improvement backlog
(verification mode: complete ≥ 2 per run, verify with `npm run verify`, commit, add findings.)
1. [x] `src/net/netgame.ts` / `src/ui/hud.ts`: the gold counter shows the replica's gold, so after
   a tap it drops only when the order comes back (~50–100 ms, longer on bad Wi-Fi) — show gold
   minus orders in flight.
2. [x] `server/lobby.ts`: two players can have the same name (random names collide, or both
   type "Player") — "Ada vs Ada" is confusing; suffix duplicates in a room.
3. [x] `scripts/mpsmoke.ts`: no end-to-end check of a server restart (clients should land in
   the lobby with the "server restarted" note) or of the version-mismatch screen. (Restart now
   covered end to end; version mismatch by unit tests.)
4. [x] `src/net/netgame.ts`: a device that keeps desyncing (would mean a real engine difference)
   resyncs every second silently; count it and tell the player / log it after a few. (Logged
   with both hashes; a one-time notice after 3.)
5. [x] Online results aren't recorded anywhere (AI records are per difficulty); keep a small
   per-opponent tally (name → W/L) and show it in the room.
6. [x] `src/ui/mpmenus.ts`: no way to rename yourself once in a room (only in the lobby).
7. [x] `server/lobby.ts` `openRooms()`: for a public internet server the "open battles on this
   network" list must be scoped (e.g. by the client's public IP) — documented, not built.
8. [x] `server/main.ts`: no https option. Phones only allow the screen wake lock (and PWA
   install) on https; `--cert/--key` flags (user-supplied or mkcert certificate) would enable it.
9. [x] `server/main.ts` / `server/lobby.ts`: log lines have no timestamps — hard to match a
   player's "it froze at 8 pm" to the log.
10. [x] `scripts/mpsmoke.ts`: the mirrored phone only taps a card; dragging a card onto a lane
    and opening a turret slot by tapping its own (left) gate aren't covered for team 1.
11. [x] `src/ui/hud.ts`: on desktop the opponent's name only appears in the small badge under
    the clock; their HP bar / age badge (right) doesn't say who it is.
12. [x] Upright phones: typing a name / room code while the stage is rotated opens the keyboard
    sideways — the lobby could suggest turning the phone, or un-rotate the lobby.
13. [x] `src/ui/hud.ts`: a summon appears in the queue only when the server echoes it (one RTT
    + buffer later); show orders in flight as faded "pending" chips right away.
14. [x] `src/ui/hud.ts` netinfo: on unstable Wi-Fi the jitter buffer (and so input delay) can
    grow towards 0.5 s silently; the badge only reflects RTT. Flag "unstable" from bufferMs too.
15. [x] `scripts/mpsmoke.ts` drives the UI only in Chrome; WebKit is covered for the
    simulation/netcode (`mpengines`) but not for the touch UI flows (lobby, room, drag).
16. [x] `server/lobby.ts`: no caps on rooms / sessions / connections per IP — fine on a LAN, needed
    before a public server (part of the internet upgrade).
17. [x] `server/match.ts` / `src/ui/netoverlay.ts`: the claim delay (20 s) is a client-side
    constant mirrored on the server; send `claimIn` with the pause state like `forfeitIn`, so the
    server alone decides (and tests can shorten it — mpsmoke waits 20 s today).
18. [x] `server/static.ts`: no gzip/brotli — irrelevant on Wi-Fi, but the ~300 kB bundle would
    load 3× faster from an internet server.
19. [x] README shows no multiplayer screenshots (room with QR code, mirrored phone view).
20. [x] `src/ui/netoverlay.ts`: the Claim victory button gives no click sound / haptic like the
    other buttons.
21. [x] Online battles have no way to say anything: quick emotes ("Good luck!", "Well played!",
    "Oops!", "Wow!") relayed by the server and shown by the sender's citadel.
22. [x] `server/main.ts`: if port 8787 is taken it just exits; it could try the next ports.
23. [x] The room doesn't show either player's connection quality before the battle; show each
    seat's ping so players can spot a weak Wi-Fi spot before starting.
24. [x] Results screen overflowed laptop-height windows (1366×768: title cut off, buttons below
    the fold, single player too) — found by the e2e run; now a side-by-side layout up to 860 px
    high and `justify-content: safe center` so overflow scrolls instead of clipping.
25. [x] Online results screen: no way to say "Well played!" after the battle (emotes only exist
    in battle); a small emote row on the results would fit the rematch flow.
26. [x] `server/main.ts`: no `--help`; the flags (--port, --cert/--key, --trust-proxy,
    --latency/--jitter, --dir, --quiet) are only documented in the file header / docs.
27. [x] Settings: no switch to hide the opponent's quick messages (rate-limited, but some players
    will want them off).
28. [x] package.json: the new tools (mpbot, enginecheck, mpengines) have no npm script aliases.
29. [x] `scripts/mpsmoke.ts`: nothing checks that a battle starting while a tab is hidden makes
    that player "away" (fixed in app.ts after the second review, untested end to end). (Run #7,
    Lens #99: the rematch starts with the guest's tab hidden; held at tick 0, runs once back.)
30. [x] `src/ui/hud.ts`: the quick-message picker stays open when you tap elsewhere, open a panel
    or pause. (Found already done in run #6: a tap outside, any panel and pausing close it.)
31. [x] Battle room: no "Copy link" button — on a desktop the invite is easier to paste into a
    chat than to read off the screen.
32. [x] docs/MULTIPLAYER.md troubleshooting doesn't cover "the page loads on the phone but the
    lobby stays on Connecting…" (WebSocket blocked: some guest Wi-Fis / proxies / VPN apps).
