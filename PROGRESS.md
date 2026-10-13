# PROGRESS

Status: complete, in verification mode — both phases of TASK.md are done: Phase 1 (local Wi-Fi
multiplayer, run #4) and Phase 2 (100 iterations, one per lens of Jesse Schell's *The Art of
Game Design*, runs #5–#7, finished 2026-10-13). Each run now: review, then complete ≥ 2 items of
the improvement backlog below (verified, committed) and add what the review finds.

## Improvement backlog (verification mode, phase 2)

**Older history** — backlog items 1–250 (all done or decided, but the open notes kept here), the run #4–#8 summaries, the Phase 2 lens checklist and the Phase 1 backlog — is in [docs/PROGRESS-archive.md](docs/PROGRESS-archive.md).

23. [ ] (note) The lobby's old-rival recognition (#84) matches by name; the Hall now tells two Adas
   apart, the rivals list doesn't. Leave unless it confuses players.
94. [ ] (note) Hall files written between 7ff005c and f1c5f9c (quick-hash keys, this branch only, a
   few hours on 2026-10-13, never released) keep orphaned networks whose keys are recoverable.
   Only dev machines can have them — delete `mythwar-data.json` there; no code change.
155. [ ] (note, from the review) A Ready rejected as stale just as the other player changes a
   handicap (#96) now reads "Bo now fights under Glass Citadel." without "press Ready again" (the
   Ready never registered, so `meReady` was false); the Ready visibly bounces back. Narrow timing,
   low impact — leave unless seen.
165. [ ] (note) iPhone's silent switch mutes Web Audio (no `navigator.audioSession.type = 'playback'`)
   — left on purpose: the switch means "quiet"; the room's chimes have visual twins.
(Items 251–257: a second visual review of the online screens, 2026-10-13 — #230–234 confirmed
on screen.)
251. [x] Online results on a short phone (667×375, 844×390): the pinned `.vbuttons` row (rematch
   note, chips, buttons) has no backdrop, so "Ember Treant left the room." is drawn across the
   stats table. The "more below" backdrop covers `.screen.more > .mrow` only (menus.css ~1731):
   give `.vbuttons` the same. (Done; re-shot at 667×375: the row reads over a fade.)
252. [x] The "is away" notice with Claim is squeezed into half the screen's width on a phone (9
   lines, the button far below): `.nbanner { position: absolute; left: 50% }` caps its width at
   the space right of centre. `width: max-content` within the max-width; "Wi-Fi" breaks as
   "Wi-/Fi" (a no-break hyphen). (Done: `width: max-content`, the text flexes; the notice is
   two lines wide at 667×375 with Claim beside it.)
253. [x] The disabled Ready in the room's pinned row is see-through (`.mbtn:disabled { opacity:
   .45 }`): the open seat's text shows through it on phones. Solid muted colours instead.
   (Done for pinned rows on a short stage.)
254. [x] The room's mode and handicap chips are 27 px tall with 4 px between rows on phones — a
   thumb aimed at "Novice" can switch on a handicap. ≥ 38 px and ~10 px gaps under
   `pointer: coarse`. (Done: 38 px, 10-px row gaps, the handicap row 6 px further down.)
   Also: smoke's "queue chips match the queue" read the HUD a frame early once — it waits for
   the chips now (two runs green).
255. [x] Mixed capitalisation: "How to Play" (title, pause) vs "How to play" (room), "Begin
   Battle" beside "Leave room", "Change foe". Sentence case throughout.
   (Done: "How to play", "Begin battle" — the only title-case buttons left but "Download
   Mythwar Server", which names the download. smoke's lookups follow. The docs' older pictures
   still show the old case.)
256. [x] The room's message line uses the alarm pink for tips too ("Tip: turn your phone
   sideways…") — `flash(text, ms, kind)` with a calmer colour for tips.
   (Done: `flash(text, ms, calm)` — room news, the Back prompt and tips are calm; errors and the
   lobby's notes after a lost seat keep the pink.)
257. [x] Results: the first subtitle ("X left the battle.") centres under "Victory" — shifted left
   by the champion picture — while the lines below centre on the screen: ragged by 70–100 px.
   (Done on short stages, CSS only: the verdict box is `display: contents`, so the title and the
   champion share a row and the subtitle takes its own, centred. Re-shot at 844×390.)
258. [x] mpsmoke had no check of #234 or #254: it now checks the walkover's line ("A win by
   walkover.", no Worthy Rival / first-victory feat) and the phone room's chips (≥ 37 px on the
   scaled stage, none overlapping), landscape and upright.
(Items 259–: open for the next run.)
259. [x] README's and docs' pictures (`docs/*.jpg`, `npm run docshot`) predate run #10's visible
   changes: "How to play" / "Begin battle", the room's note under its header on phones, the
   results' subtitle line. Re-shoot the ones that show them (title, room, results) and check
   each still says what its caption says.
   (Done: only `docs/title.jpg` showed a change ("How to Play") — re-shot (`shoot menu-title`,
   docshot 1200). The room picture is a desktop room (its layout only changed on short
   stages); the phone picture is a battle; the others are single-player battles.)
(Items 264–267: an independent review of run #10's later diff (225–263), 2026-10-13 — the
server changes found sound.)
264. [x] #243 made a return to the page *outside* a battle redial whenever the link was quiet
   2.5 s — but iOS suspends JS in the background, so a guest who switches apps for 3–5 s after
   pressing Ready comes back to a dropped working socket: the server un-readies them
   (`disconnected()`), the other sees "Connecting…". Outside a battle, ping and redial only if
   nothing answers within ~1.5 s.
   (Done: `Connection.probe()` — outside a battle a return pings, and redials only if nothing
   comes back in 1.5 s; in a battle it still redials at once (the server holds the battle and
   resyncs). netgame test: a 4-s-stale working link keeps its socket and Ready — fails with the
   old redial; #243's test now waits out the probe.)
265. [x] The news queue (#262) shows queued news over a newer error or the Back prompt, and news
   outlives a room that vanished without `leaveRoom` (session expired, server restarted) — on
   the lobby's line (role=alert). Non-news messages clear the queue; leaving the room screen any
   way clears the line. (Done both.)
266. [x] Reduced motion: on short stages the results' "Victory" and its line animate again — the
   reduced-motion rule names `.verdict`, now `display: contents` (#257) with the animation on
   its children. (Done: `.vhead .vt, .vhead .vs` join the rule.)
267. [x] Ascend's long-press flag (#246) sticks when the release is > 14 px from the press (no tap
   callback), eating the next Enter/Space on the focused button once. (Done: reset just after
   any release.) vitest 300, smoke, mpsmoke plain / portrait / latency green.
268. [x] (The same review, a note) #260's summed quiet time could count a spell from a stale
   start (a seat already away when it went quiet) or miss one that ended with the link.
   (Done: `endQuiet()` — a spell is open only once counted, and closes on a word or on the
   link's end.)
(Items 269–: open for the next run.)
269. [x] mpsmoke's wall time grew with run #10's steps (two silent-link waits of ~3–6 s, the news
   queue's 2.3 s, the WebKit-free chip checks): print the section times again (#214) and trim
   where a shorter `deadAfter` / a condition wait would do.
   (Done in part: 88 → 85 s. `deadAfter` 5 → 4 s (the heartbeat still found the link dead after
   ~4.3 s, the silence rule held the battle at ~2.2 s); the mid-battle step waits for the room to
   show B back, not for the 3-s resume countdown (the next section waits for the battle). The
   rest of run #10's growth is the checks themselves. Plain, latency, portrait green.)
270. [x] Several run #10 tests in tests/netgame.test.ts reach into private fields (`conn.ws`,
   `conn.lastHeard`, `lobby.rooms`, a match's world): a few test-only accessors on SimNet
   (`socketOf(client)`, `matchOf(code)`, `suspend(client, ms)`) would make them read as the
   scenarios they are and survive refactors.
   (Done: `SimNet.socketOf`, `matchOf`, `suspended`; run #10's tests use them; the version error
   now arrives through the fake socket like a real message. Two older tests keep their own
   casts (a fault injection, the #160 close/open).)
(Items 273–279: an independent accessibility review of the online flow (screen reader,
keyboard, gamepad), checked with puppeteer, 2026-10-13.)
273. [x] Room and results news isn't announced: the room's note (`.rnote`, "Bo is ready — press
   Ready to begin!") and the results' rematch note (`.rmatch`, "Ada wants a rematch!", "lost the
   connection") are plain divs, and a join or a Ready only chimes. `role="status"` on both.
   (Done.)
274. [x] The HUD's connection badge (`.netinfo`, role=status) re-announces the ping every second
   on desktop ("6 ms", "5 ms"…), drowning toasts. No role; announce only quality changes.
   (Done: a hidden status line (a `<b>`, which phones don't hide) says the quality when it
   changes after the first reading.)
275. [x] The online opening banner is filled while the HUD is still inert under the room screen
   — never announced; the countdown's assertive "3" follows 12 ms later.
   (Done: `Hud.sayBannerAgain()` re-writes the banner's lines when the HUD stops being inert
   (as `holdBanner` does after the away notice); the countdown is polite, so it queues behind them.)
276. [x] "Claim victory" is out of a gamepad's reach (A summons, Start's menu has no claim) and
   the 16th Tab stop by keyboard, with no key. A claim in the pause menu, or pad/Tab focus to it
   when it appears.
   (Done: the pause menu (Start / Esc) shows "Claim victory" while the notice offers it
   (`NetOverlay.claimable` → `Menus.setClaimable`); mpsmoke claims from the pause menu now.)
277. [x] The message line is two `role=alert` elements (lobby and room screens) — a message
   written while both are visible (a room vanishing → lobby) is announced twice, and a closed
   line keeps its text in the accessibility tree. One live region, cleared when it closes.
   (Done: only the showing screen's line gets a message (both when neither shows); a closed
   line drops its text 0.3 s later.)
278. [x] An invalid room code ("ZZZZ", too short) only shakes the field and plays a sound — no
   words, no `aria-invalid`. (Done: "A room code is 4 letters and digits, as the host's screen
   shows it (no O, I, L, S, Z, 0, 1, 2 or 5)." and `aria-invalid` until the field changes;
   mpsmoke checks.)
279. [x] Reduced motion misses the away notice's spinner (`.nspin`, runs for minutes), the quick
   message pop, the battle speech bubble, the code field's shake. (Done: those stop; the speech
   bubble — whose animation is how it shows — fades without the pop.)
(Items 280–: run #11.)
280. [x] Nine doc comments had drifted off what they describe when code was inserted between
   (two `/** */` in a row — an editor shows only the second): `MpScreens`, `App`, `Hud`,
   `hallKey`, `cry`, `battleTip`, smoke's `resultsShown`, and three halves of one comment.
   (Done: each back on its declaration or merged; an awk check over all .ts files finds none.)
(Items 281–289: an independent review of hostile or buggy peers — the server as it would face
the internet — with scripts against the real Lobby / attachMultiplayer / serveStatic, 2026-10-13.
Checked fine: command validation, seats and teams from the server only, malformed / binary /
oversized frames, static-file traversal (encoded `..`, `%5c`, `%00`, drive letters, UNC, CON),
the save file re-cleaned on load.)
281. [x] Client: the results' army-chart tooltip (menus.ts ~1411) put `foeName` into `innerHTML` —
   and `?server=` (honoured in every build, GitHub Pages too) lets a link point the page at any
   server, whose names NetGame kept as sent: `<img onerror=…>` would run on the game's origin.
   (Done: the tooltip is built with `h()` and text; NetGame keeps names as plain text (`<>&"`
   dropped, bounded) whatever the server sends. smoke hovers the chart and checks the tooltip —
   there was no check of it at all.)
282. [x] `cleanName` kept invisible format characters (zero-width space, right-to-left override,
   bidi isolates) and towers of combining marks: "Ada\u200b" passed the room's "(2)" rule and
   showed as "Ada" beside "Ada". (Done: `\p{Cf}` dropped but the joiner inside an emoji, marks two
   deep at most, NFC; written without a lookbehind — Safari < 16.4 (the minimum is 16.2) can't
   parse one, and a regex literal it can't parse stops the whole bundle. Test.)
283. [x] `server/net.ts` ~91: `send` never looks at `ws.bufferedAmount`, and any message counts as
   a sign of life — a client that stops reading but sends `resync` 100×/s gets a snapshot queued
   each time (measured 3.9 MB after 20 s, growing ~200 kB/s, 32 sockets per address). Close a
   socket whose send buffer passes ~512 kB; rate-limit `resync` (~1/s) and `watchRooms`; run the
   rate check before parsing and before the "Not JSON" / "Bad message" replies.
   (Done: `resync` answered at most once a second — sooner requests coalesced into one then, so
   a real desync still gets its snapshot; `watchRooms` sends the list only when watching starts
   (a takeover link now starts afresh — it kept the old link's flag and would have got no list);
   the message rate is counted before parsing; the transport closes a socket with over 1 MB
   waiting. The review's flood script: 0 bytes queued after 20 s (was 3.9 MB); 1000 junk frames
   get 120 replies (was 1000). Three server tests, failing before.)
284. [ ] `server/lobby.ts` ~258/882: every connection from a new network starts a 16-MB scrypt for
   the Hall key before `hello`, unqueued — 400 connections from different /64s slowed a plain
   readFile from 0.8 ms to 2.5 s (the libuv pool is shared with static files and saves). Hash
   lazily (first needed at a battle's end) with 1–2 in flight.
285. [ ] Public-server limits: per-/64 quotas multiply over a /56 (256 × 8 rooms = the 2000-room
   cap: "The server is full"); no server-wide socket cap; a socket that never says `hello`
   lives forever (ws answers pings). A 10-s hello deadline, a global cap, /56 and /48 tiers.
286. [ ] Room codes can be brute-forced: 27⁴ = 531,441 codes, joins only under the 120 msgs/s
   limit — 32 sockets cover them all in ~2.3 min. Count failed joins per session / address with
   a backoff; longer codes on a public server.
287. [ ] The Hall can be wiped or farmed: 256 self-duels from 256 /64s evict a network's Hall (LRU
   of 256 networks, saved); two invented device ids farm wins within one network. Don't count
   forfeits before some battle time; cap new Hall lines per network per hour; keep networks with
   history from eviction. (Only matters on a public server — LAN players see each other.)
288. [ ] `--trust-proxy` (net.ts ~72) trusts X-Forwarded-For from anyone: with the flag and the port
   reachable directly, quotas are bypassed; behind a proxy without it, everyone is 127.0.0.1 =
   one "LAN". Trust the header only from loopback / a configured proxy; warn at startup.
289. [ ] A griefer in a waiting room can make the server broadcast room updates up to 120×/s to the
   other player (alternating reported ping, renames, trial toggles that un-ready both). Coalesce
   room broadcasts (~4/s, as room lists are).
271. [x] docs/MULTIPLAYER.md's "What happens when…" lacks run #10's room behaviours: a short app
   switch keeps the seat and Ready (#264), a longer one redials at once on return (#243), room
   news takes turns (#262), and a silent phone mid-battle (#222 — there) vs in the room.
   (Done: the "phone locks in the room" row says how a return probes, keeps or redials; a new
   row for news taking turns.)
272. [x] `mpengines`' WebKit pass doesn't check #246 (a long press on Ascend previews without
   ascending) — WebKit's touch/contextmenu behaviour is the reason for the fix; Playwright's
   touchscreen can hold a press there.
   (Done with touch-type pointer events from the page (Playwright has no touch hold): a 600-ms
   press previews, no ascension; a short press then ascends — so the button was ready.)
260. [x] The server logs "went quiet" / "heard from again" for every Wi-Fi blip of 4 s+ (#222) —
   a flaky phone could fill the host's console in a long session. Keep the first of each in a
   battle and sum the rest at the battle's end ("Bo went quiet 5 times, 23 s in all").
   (Done: the first spell of a battle logs "went quiet" / "heard from again"; at the battle's end
   one line sums them ("Bo went quiet 3 times in room ABCD's battle, 14 s in all"). Server test.)
261. [ ] `scripts/smoke.ts` keeps ~60 fixed sleeps (after #204/#241): the rest are drag steps,
   "nothing should happen" checks and effects that take time. Review once more on the CI runner
   when `.github/workflows/browser-tests.yml` first runs (Open questions) — flakes there name
   the next ones to turn into waits.
262. [x] The phone's message line in the room (`.mpflash`) is a single line for all news: two
   quick events (Bo leaves, Cy joins) overwrite each other within 4.5 s, so the first is never
   read. Queue them (each at least ~2 s) or show the latest two.
   (Done: `flash(text, { ms, calm, news })` — room news within 2 s of the last waits its turn
   (each shows ≥ 2 s); the Back prompt, tips and errors still show at once; leaving the room
   drops waiting news. mpsmoke: two news in a row → the first, then the second.)
263. [x] `menus.ts` `scoreLine` / `verdictLine` and the results wording now span four cases
   (citadel, forfeit, timeout, co-op alone) × won/lost × score/no score; only `verdictLine` has a
   unit test (via the chronicle tests). A table-driven test of `scoreLine(o, won)` — export it —
   pins #234's walkover wording and the co-op lines.
   (Done: `scoreLine` exported; tests/scoreline.test.ts — 3 tests over duel score / no score ×
   citadel / forfeit / timeout × won / lost, and co-op.)





**Start here: [docs/BRIEF.md](docs/BRIEF.md)** — one page: what TASK.md asked for, what was
built, how to see each part working, and the decisions that need you.

## Run #10 in short (for the morning)
- Verification mode, backlog items 215–272. Open from run #9: #204 (smoke waits for menu
  changes, not sleeps), #215 (Back twice leaves the room on a phone), #217 (mpsmoke cuts the
  phone's links silently through a TCP relay — CDP's offline mode turned out unfaithful: Chrome
  still answers the server's pings) done; #137 and #172 decided (reasons in the items).
- Three independent reviews (client netcode; run #10's own diff; server lobby/match): fixed —
  a reconnecting phone froze after a citadel fell (#218); results without a verdict when 'over'
  came late (#219); a version-refused page said "Reconnecting…" forever (#220); a stale co-op
  "is back" (#221); a seat gone in battle lost at once at the result, the winner's win with it
  (#225); a reconnecting host unlisted (#226); away/back within the resume countdown held a
  duel forever (#227).
- Own find: a phone out of the Wi-Fi mid-battle left the battle running for the heartbeat's
  12 s — a seat silent for 4 s now counts as away (#222; three holes in it found by the diff
  review and fixed, #223).
- A visual review of the online screens (#230–236): **on a phone the room's messages and its
  "Waiting for a second player…" note were off screen or squashed to nothing** (so #215's
  "Press Back again" couldn't be seen) — now right under the header; a readable "press Ready"
  pulse; the away notice clear of the gold bar; walkovers earn no praise and no victory feats.
- Later: a Ready right after one's own handicap change no longer bounces (#229); a phone back on
  the page redials at once in the room and lobby too, and after Safari's back-forward cache
  (#243); smoke waits for effects instead of ~30 sleeps (#204, #241) and surfaced a touchend
  warning on fast double taps (#242); mpengines checks Back in the room on WebKit (#238); a
  3-minute lagged bot soak shows no false silence holds (#237); `shoot`/`mpbot --help` print
  usage.
- A review of mobile-browser quirks (#245–250): **a swipe that started on any button scrolled
  nothing** on phones (all buttons were `touch-action: none`); a long press on Ascend ascended
  instead of previewing; the automatic battery saver stuck for good after an iPhone's Low Power
  Mode; iOS 15 got a broken layout or a crash — now a "needs a newer browser" message; iOS focus
  zoom on the 12-px code box; text inflation on rotation. A docs-vs-code review (#244).
- A second visual pass (#251–257: the results' pinned row over the stats, a squeezed away
  notice, a see-through dimmed Ready, small room chips, sentence case, calm news colour, the
  results subtitle) and a review of the run's later diff (#264–268: a return to the room no
  longer drops a working link and its Ready — it probes first; news vs errors; reduced motion).
  Room news takes turns (#262); the server sums a battle's quiet spells in one log line (#260);
  mpsmoke 88 → 85 s (#269); netgame tests use SimNet helpers (#270); docs (#259, #271).
- Tests 285 → 300; mpsmoke plain / latency / portrait green (a co-op Ready race in the test
  fixed, #228); mpengines, package:check green.

## Run #9 in short (for the morning)
- Verification mode, backlog items 138–214. Open from run #8: #138 and #142 done; #128 (DOM tests)
  and #129 (rival ids) decided against, with reasons; #137 (split app.ts) started with a pure,
  tested `src/ui/roomnews.ts`.
- A look at the online flows through screenshots (mpsmoke `--shots`, landscape and upright phone,
  and shoot's new two-player room) found and fixed: the "is away" notice and the opening banner
  showing through each other (#145); the start countdown's "3" on the banner's words (#148);
  "Room" beside "Back to room" (#147); the chronicle ending "your citadel falls" after a forfeit
  or a claimed win (#144, #152 co-op); room seats without the player's sigil and "press Ready
  again" to a host who never pressed it (#142); the coach bubble swallowing taps on the lanes it
  explains (#149); the "more below" backdrop missing when the lobby's list arrives late (#151).
- mpsmoke: condition waits instead of sleeps (61 → 53 s), and under `--latency 60 --jitter 80` the
  co-op start had been failing (its Readies raced a handicap change) — fixed in the test (#138).
  An independent review of the run's diff found no regressions, tightened four checks (#153).
- A cp1252 em dash briefly made mpsmoke.ts invalid UTF-8 (#143) — caught, fixed.
- Later in the run, a review of a first-time guest's way in (QR code → room → battle → results on
  a phone) — fixed: Android's Back closed the game (now the game's Esc, #166) and a closed tab
  couldn't rejoin its running battle by the QR code (#159); a phone locked in the room lost its
  seat for good (now rejoins, #160); copy buttons failed over LAN http (#162); no how-to in the
  room (#161); keyboard wording on phones (#163, #164). `shoot` gained a two-player room and an
  online battle; smoke waits for the app instead of fixed sleeps (#158). docs/BRIEF.md has a
  run-#9 paragraph.
- Then the host's side (a review of getting, starting and stopping the server, #175–#185): the
  console names each address's adapter and which one the QR uses, filters VPN/VM adapters, says
  how to set Windows' Wi-Fi to *Private*, announces a busy port, saves on window close (SIGHUP /
  SIGBREAK); `npm run lan` checks the Node version first; the package's starters check Node and
  that the zip was unpacked; macOS 15's Gatekeeper steps; `npm run package:check` starts the
  packaged server.mjs (also in release.yml). Plus #167 (Back online spends no pause), #169, #171,
  #174 (more pure, tested online logic), #186 (gamepad in the room).
- Then co-op (a review of two allies against the AI, #188–#199): **leaving while the ally had
  switched apps for a moment lost the battle at once** (#188, fixed, server test); a gone ally no
  longer gets the win; a room its ally left opens again; the stayer is told the ally left / is
  away; co-op wording in the away notice, the room's score, the rematch note, the pause note and
  the verdict; the results say when an offered rematch is a different battle (#193, both modes).
  Then #198: side-wide feats only for the ally who ordered the deed. Open: #197 (minor wording).
- Late in the run: the WebKit (iPhone engine) pass in `mpengines` checks the http copy fallback and
  Back (#201); Back is guarded on touch devices only (#209); PROGRESS.md split — history in
  docs/PROGRESS-archive.md (#202); README's two multiplayer pictures re-shot (#187, #206); a flaky
  smoke heartbeat check fixed (#212). Open for the next run: #137, #172, #204, #215, #217 (#211, #213, #214 done at the very end).
- **Open question added:** the downloadable release (v1.0.0) is ~280 commits old.
- Tests 256 → 285; `npm run verify` and `verify:all` green (engines identical, 0.67 ms script per
  frame); `mpengines` (WebKit vs Chrome/Firefox) in sync.

# Phase 1 — Local (Wi-Fi) multiplayer (complete)

Status: complete (verification mode since run #4, 2026-10-07; backlog below still open for spare time)

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
- (Run #9) **The downloadable release is stale**: the only GitHub release (v1.0.0, 2026-10-08) is
  ~280 commits behind; the GitHub Pages "Download the game server" button (`releases/latest`)
  hands out a server without the saved Hall of champions, the protocol fixes of runs #8–#9, etc.
  Publishing needs a push and a tag — not done from these runs. Bump `version` in package.json
  (still 1.0.0) and tag when you publish.
- (Run #8) `.github/workflows/browser-tests.yml` (smoke + mpsmoke on GitHub) is written but has
  never run — nothing is pushed from these runs. On its first run, check that Chrome starts on the
  runner and that the timing-based checks hold on a shared machine; if some flake, they are the
  ones with fixed `sleep`s (smoke's results and riddle flows).
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
