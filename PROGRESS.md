# PROGRESS

Status: complete, in verification mode — both phases of TASK.md are done: Phase 1 (local Wi-Fi
multiplayer, run #4) and Phase 2 (100 iterations, one per lens of Jesse Schell's *The Art of
Game Design*, runs #5–#7, finished 2026-10-13). Each run now: review, then complete ≥ 2 items of
the improvement backlog below (verified, committed) and add what the review finds.

## Improvement backlog (verification mode, phase 2)

**Older history** — backlog items 1–137 (all done or decided, but #23, #94, #137 which stay here), the run #4–#7 summaries, the Phase 2 lens checklist and the Phase 1 backlog — is in [docs/PROGRESS-archive.md](docs/PROGRESS-archive.md).

23. [ ] (note) The lobby's old-rival recognition (#84) matches by name; the Hall now tells two Adas
   apart, the rivals list doesn't. Leave unless it confuses players.
94. [ ] (note) Hall files written between 7ff005c and f1c5f9c (quick-hash keys, this branch only, a
   few hours on 2026-10-13, never released) keep orphaned networks whose keys are recoverable.
   Only dev machines can have them — delete `mythwar-data.json` there; no code change.
137. [x] `src/app.ts` keeps growing (run #8 added the multiplayer glue for #48, #54, #72, #87–#90,
   #125): the online part — openMultiplayer, onMpChanged, roomChimes, leaveRoom, rematch,
   syncRematch, the emote routing — could move to its own module (`src/onlineapp.ts`) with a
   narrow interface to App, so each half reads on its own. No behaviour change; verify must stay
   green.
   (Decided, run #10: not moved. Its decisions went to pure, tested modules (#150, #156, #171,
   #174); what's left (~300 lines) is wiring that reaches into App's HUD, menus, audio, settings,
   battle state and title — an interface for it would be nearly as wide as App itself. Revisit
   if the online part grows (accounts, the public server).)
138. [x] `scripts/mpsmoke.ts` still has many fixed `sleep()`s (e.g. 4.5 s before "rematch running",
   1.6 s for the emote gap) — like #134, wait for the condition where one exists (and keep a
   sleep only where time itself is what's tested), for the CI runner (#127).
   (Done: 11 of 16 sleeps became waits — a node-side `until()` polls conditions spanning both
   pages; kept: the drag's 16-ms steps, "frozen while paused" (time is what's tested), the
   resize settle, the shot fade. 61 s → 53 s. Found on the way: under `--latency 60 --jitter 80`
   the co-op battle never started — both Readies raced A's "handicap off" and were ignored as
   stale (#96, right); the test now waits for both to see the change. Latency and portrait pass.)
139. [x] Unit tests: the Hall-key tests run real scrypt (~20 ms each, 16 MB) through a fake clock —
   the cache test (#47) takes ~3 s of the suite. Let LobbyOptions inject the key hash (tests
   pass a fast one; one test keeps the real scrypt). (Done: `LobbyOptions.hallHash`, still applied
   later like scrypt; the cache test uses it and waits for the eviction itself — 3.1 s → 62 ms;
   the salted-hash test keeps real scrypt.)
140. [x] Battle room: Ready is disabled until a second player joins (`mpmenus.ts` ~451) but says
   nothing about why — a screen reader hears "Ready, dimmed"; a title / aria-description ("waits
   for a second player" / "offline") would say it (the note below says it only visually nearby).
   (Done: title + aria-description — waits for a second player / connecting / battle under way;
   mpsmoke checks it.)
141. [x] docs/MULTIPLAYER.md's "What happens when…" lacked #87 (Room after a battle, what changed is
   said) and #89 (a re-scanned QR takes its own seat back). (Done.)
142. [x] `shoot` has no two-player room scenario (seats both filled, Ready states, handicap chips on
   the other seat) — the visual review couldn't look at it; a second puppeteer page joining the
   room in the scenario's script would do.
   (Done: a scenario's `guest` — a second browser profile with its own stored settings opens the
   invite link and runs its script; `mp-room-full`, `mobile-mp-room-full`. The shots showed two
   things, fixed: the seats never showed the sigil a player chose (lobby list, HUD and keep did) —
   now "♛ Bo the Bold"; and "Bo now fights under Glass Citadel — press Ready again." told a host
   who had never pressed Ready to press it "again" — "again" only to a player who was Ready.
   mpsmoke checks both.)
(Items 143–: run #9.)
143. [x] `scripts/mpsmoke.ts`: run #9's patch for #138 wrote three em dashes as cp1252 byte 0x97
   (Windows Python's default encoding) — the file was invalid UTF-8 for one commit. (Fixed; all
   tracked text files checked as UTF-8.)
144. [x] Online results' chronicle (`src/ui/chronicle.ts`): a battle won by forfeit or by claiming
   an absent player's seat ended with "Defeat: your citadel falls to Ada." — though no citadel fell
   and the verdict above said "You were away too long" (seen in mpsmoke's `11-results-phone`).
   (Done: the chronicle is told the server's end reason — "Ada leaves the battle.", "you were away
   too long."; unit test; mpsmoke checks both endings on both screens.)
145. [x] `12-claim-desktop` (mpsmoke --shots): when the opponent is away from the battle's start,
   the "Ada is away · Claim victory" overlay sits on top of the intro banner (place, kicker, lore)
   and both texts show through each other.
   (Done: while the net notice shows, the HUD's banner is hidden (`#stage:has(...)`, like an open
   panel does); mpsmoke checks it at the hidden-tab rematch start and shoots `12a-away-at-start`.)
146. [x] (decided) #129 rival ids: not done. A per-pair id (hash of both devices) breaks the progress
   code, which carries online tallies to a new device on purpose (new device → new pair ids); a
   per-opponent id only lasts as long as the server's salt (`--no-save` makes a new one every
   start) and falling back to the name on a miss brings the two-Adas mix-up back. Names are what
   players see and type; the Hall (server side) already tells devices apart. Revisit with accounts
   (ROADMAP's public server).
147. [x] Online results after the opponent left (`9-results-desktop`): "Room" and the main button
   "Back to room" sat side by side doing the same thing. (Done: "Room" hides while the other seat
   is empty; mpsmoke checks it, and now tests "Room" where it is meant — A goes back to the room
   from the results with the opponent still there, and leaves from the room.)
148. [x] Online battle start on a phone (`4-countdown-phone`): the countdown's big "3" landed on the
   opening banner's "VS ADA L · FAE WILDS" and lore line. (Done: while a banner shows, the number
   sits at 72% instead of 42% — the start countdown (3 s + "Fight!") ends before the 4.5-s banner,
   so it never jumps; mpsmoke checks the number is below the banner's words on both screens.)
149. [x] `src/ui/hud.css` `.coach.show { pointer-events: auto }`: the whole tip bubble caught taps — the
   free "Tap any lane to send creatures there…" tip sits over the top/middle lanes on a phone
   (`6-battle-phone`) and blocked taps on the lanes it talks about, for 9 s, also online where
   nothing pauses. (Done: only "Got it" takes a tap; smoke checks the bubble's text lets a tap
   through to the canvas on desktop, phone and rotated phone.)
150. [x] (A first slice of #137) `src/app.ts` `roomChimes` mixed the room's news — which chime, what
   the other player changed, in words — with audio and DOM, untested (where #142's "again" bug
   lived). (Done: `src/ui/roomnews.ts` — `roomView` / `roomNews`, pure; three fields of App became
   one `lastRoom`; tests/roomnews.test.ts (5 tests); mpsmoke unchanged and green.)
151. [x] `src/ui/menus.ts` `moreBelow` (#110) ran on show, scroll and resize only: the lobby's list and
   Hall arrive after it shows, so on an upright phone (`--portrait` `10-lobby-phone`) the pinned
   Back covered "Champions of this network" with no "more below" backdrop. (Done: a
   MutationObserver per screen re-checks once per frame of changes while it shows; mpsmoke checks
   the backdrop matches the scroll state once the Hall arrives — failed before the fix in portrait.)
(Items 152–: an independent review of run #9's diff, 2026-10-13: nothing serious; fixed:)
152. [x] Co-op chronicle: a co-op battle lost by forfeit (one ally left while the other was away —
   `server/match.ts` `forfeit`) told the ally who stayed "Defeat: you leave the battle." (Done: in
   co-op it reads "you and your ally were away too long", as the verdict does; test.)
153. [x] mpsmoke checks that could pass without proving anything: the countdown compared the
   number's centre (now its box's top, at rest, after waiting for each screen's own countdown —
   it was flaky too: the phone's count wasn't always showing yet); the away-notice check passed with
   no banner at all (now needs one); the duplicate-tab check lost the moment a wrongly replaced A
   would need to notice (300 ms back, said why). With the top edge measured the upright phone had
   0 px to spare: the number now sits at 76% (16 px clear there).
154. [x] Online results: "Room" hiding while it had keyboard focus dropped focus to the page; the
   main button ("Back to room") takes it now.
155. [ ] (note, from the review) A Ready rejected as stale just as the other player changes a
   handicap (#96) now reads "Bo now fights under Glass Citadel." without "press Ready again" (the
   Ready never registered, so `meReady` was false); the Ready visibly bounces back. Narrow timing,
   low impact — leave unless seen.
156. [x] (#137, second slice) The online results' rematch wording (`Menus.updateRematch`: Rematch /
   Accept / Cancel / Back to room and the note) was untested DOM code. (Done: `rematchView()` in
   src/ui/menus.ts, pure; tests/rematch.test.ts; the duplicated doc comment merged.)
157. [x] `shoot` had no online battle: `mp-battle` / `mobile-mp-battle` (a guest readies, then the
   host — `afterGuest` — and the shot is a few seconds into the battle: ping, the opponent's sigil
   on their keep and by their name). Looked at: nothing to fix.
158. [x] `scripts/smoke.ts`: every page load was followed by a fixed sleep (0.6–1.5 s) — on a slower
   machine (the CI runner, #127) too short, here longer than needed — and the gamepad flow slept
   6 s for summons to step out. (Done: `appUp()` waits until a battle ticks or a menu shows, then
   0.5 s for the fade; the gamepad flow waits for its creatures on the field. 49 s → 44 s.)
(Items 159–165: an independent review of a first-time guest's way in — QR code on a phone, room,
battle, results — 2026-10-13.)
159. [x] Android's Back mid-battle closed the tab opened from the QR code (its session token lived
   in that tab); scanning again was refused — "That battle already has two players" — while the
   host waited for a claim. (Done: `server/lobby.ts` join — the same device takes its seat back in
   a running battle too: snapshot, present again; server test; mpsmoke closes B's tab mid-battle
   and rescans — failed before the fix; MULTIPLAYER.md.)
160. [x] A phone that locks while waiting in the battle room (plain http: no wake lock; iPhones
   lock after 30 s) loses its seat after 12 s + 60 s and lands in the lobby with "away too long".
   Hold a disconnected seat longer while the room is waiting (and say "keep your screen on" in the
   room on phones?). (Done another way — holding seats longer keeps strangers out of an open room and the
   host waiting: the client remembers the room it lost (`MpClient.lostRoom`), and the app, back on
   the room or lobby screen, joins it again if the seat is still free ("You were away a while and
   lost your seat — joining the room again…"). `LobbyOptions.seatGrace` lets mpsmoke test it in 6 s:
   B's link closes in the room, A sees the seat empty, B reconnects and is back — failed before the
   fix; client test in netgame.test.ts; MULTIPLAYER.md. Found on the way: under latency mpsmoke
   pressed "Back to room" before B had heard A left — it waits for the button now.)
161. [x] The battle room has no way to the how-to: a QR guest never saw it (it shows before a first
   *local* battle) and Leave room → Back disconnects. A "How to play" in the room, Back to the room. (Done: "How to play" between Leave room and Ready — fits a 844×390 phone; a battle
   starting meanwhile closes it like any menu; mpsmoke goes there and back, still seated.)
162. [x] "Copy result" (results) and "Copy link" (room) always fail on LAN phones — `navigator.
   clipboard` needs a secure context (http://192.168… isn't); Settings' progress code has the
   select-the-text fallback, these don't (menus.ts ~973, mpmenus.ts ~236). A shared copy helper
   with an `execCommand('copy')` fallback. (Done: `copyText()` in src/ui/dom.ts — the Clipboard API where there is one, else a
   selected hidden text area and `execCommand('copy')`; used by all four copy buttons (result,
   invite link, progress code — its select-the-code fallback kept for a failed copy — and the
   playtest journal). mpsmoke removes the Clipboard API on the phone and checks "Copy result"
   copies the result's text.)
163. [x] The results tip (`battleTip`, menus.ts ~1240) says "click a gate or press T" on phones (the
   coach swaps Tap/Click by device; this doesn't). (Done: `battleTip(…, touch)` — "(tap a gate)" on a
   phone stage; test.)
164. [x] The "turn your phone sideways before typing" tip is in the lobby only; a QR guest renaming
   in the room on an upright phone never sees it (mpmenus.ts ~194). (Done: tapping your name in the room on a rotated
   (upright) phone flashes "turn your phone sideways to type"; mpsmoke `--portrait` checks.)
165. [ ] (note) iPhone's silent switch mutes Web Audio (no `navigator.audioSession.type = 'playback'`)
   — left on purpose: the switch means "quiet"; the room's chimes have visual twins.
166. [x] (#159's other half) The phone's Back (Android's button, iOS's swipe) left the page — a tab
   opened from a QR code closed, its online session with it. (Done: once the player has touched
   the page, one history entry is kept; Back pops it and does what Esc does — the menu in a battle,
   one step back in menus, nothing in the room — and re-arms. On the bare title it isn't kept, so
   a second Back still leaves. smoke: Back opens and closes the battle menu, the page stays
   (desktop, phone, rotated); mpsmoke: Back in the room keeps the guest seated.)
167. [x] #166 made Back in an online battle do what Esc does — ask the server for a pause, spending
   one of the player's three and holding the battle for both. Android's Back is an edge swipe,
   easy to make by accident (the phone's cards sit at the left edge). (Done: from Back, online,
   the menu opens on this device only — "Menu — the battle goes on"; Esc and the pause button
   still pause for both; mpsmoke checks A isn't held and no pause is spent.)
168. [x] `scripts/shoot.ts`: a guest scenario waited its `after` twice (after the host's script and
   again after the guest's) — 21 s for `mp-battle`. (Done: the guest has its own `wait`; 13 s.)
(Items 169–: open for the next run.)
169. [x] The opening banner shown under the online "is away" notice (#145) is `visibility: hidden`,
   so its `aria-live` text is never announced to a screen reader, and it may be gone before the
   opponent is back (its timer runs on). Hold the banner (and its announcement) until the notice
   goes, or announce the battle's name with the notice. (Done: the banner's time already stood still while the battle
   is held; `Hud.holdBanner()` — fed by `NetOverlay.noticeShowing` — also holds it under a notice
   that doesn't hold the battle (connection lost) and says it again when the notice goes; mpsmoke
   checks the banner is back after the hidden-tab rematch start.)
170. [x] `scripts/mpsmoke.ts` ~168: the wait for `mp.name === 'Ada'` proves nothing — the client sets
   the name before anything is sent. Wait for the server's echo instead (the open-battles list or
   the room seat shows "Ada"). (Done: checked on the server's room seat once A hosts.)
171. [x] (#137, next slice) `src/app.ts` `onMpChanged`'s lost-session branch (which note, whether to
   rejoin, whether to leave the results) is decision logic mixed with DOM — a pure
   `sessionLostAction(lost, state, menu, lostRoom)` with tests, like #150/#156. (Done: `lostSessionPlan()` in src/ui/roomnews.ts —
   toLobby / rejoin / note; 3 tests (8 in the file); behaviour unchanged, mpsmoke green. Made
   explicit on the way: a seat that expired while the phone sat on the results also rejoins.)
172. [x] Back (#166) on the online results does nothing (Esc does nothing there either); on a phone,
   Back from the results could mean "Room" (the friend-facing next step) — or leave it: the
   buttons are right there. Decide after a playtest (docs/PLAYTEST.md).
   (Decided, run #10: left as is. Single-player results ignore Back too, so the two agree; on
   the results Back leaving the room would drop a friend mid-read, and #215's "press Back
   again" in the room covers the place where Back is expected to leave. PLAYTEST.md asks how
   Back feels in the room; revisit with that answer.)
173. [x] `docs/PLAYTEST.md` predates run #9: add what to watch for the new phone behaviours — Back in
   a battle opens the menu (and doesn't spend a pause online), a locked phone rejoins the room,
   Copy result on a LAN phone. (Done: a run-#9 paragraph under "What to watch".)
174. [x] (#137, fourth slice) Where the other player's quick message shows (results line, menu
   line, co-op call, bubble) was a branchy listener inside `openMultiplayer`. (Done: `emoteRoute()`
   in src/ui/roomnews.ts; 4 tests; mpsmoke's emote checks green.) With #150, #156, #171 the online
   glue's decisions are pure and tested; what stays in app.ts is wiring. #137 itself (moving the
   wiring to its own module) stays open — the remaining code is short and touches App's privates.
(Items 175–184: an independent review of the host's way — getting the server, starting it, what
it prints, inviting, stopping — 2026-10-13.)
175. [x] Firewall advice says "allow *private* networks" (server/main.ts ~129, the package's
   README.txt) — but Windows 11 often files a newly joined home Wi-Fi as *Public*; following the
   advice still blocks every phone. Say how to check/switch the network profile (MULTIPLAYER.md
   ~69 does) in the console and README.txt.
   (Done: console, README.txt and README.md say how to set the Wi-Fi to Private.)
176. [x] The QR code always encodes the first address (main.ts ~124) and the console prints
   addresses without adapter names; `server/lan.ts`'s virtual-adapter filter misses virbr0,
   br-<id> (Docker), vmnet8, bridge100, wg0, NordLynx, ProtonVPN. Print the adapter name by each
   address, say which one the QR uses, and widen the filter.
   (Done: `lanInterfaces()` in server/lan.ts — pure over an interface map, adapter names kept;
   the filter also knows vmnet, br-<id>, virbr, bridgeN, wg, WireGuard, NordLynx, Proton,
   OpenVPN, AnyConnect, Forti, Hamachi, ppp; 192.168.x.x first among equals. The console prints
   "http://192.168.1.105:8787/   (WLAN)", says the QR uses the first address when there are
   several, and warns when only virtual adapters are left. tests/lan.test.ts.)
177. [x] Node version: no `engines` in package.json, no check in server/main.ts; README gives no
   version, MULTIPLAYER.md says 24+, the real minimum for running .ts directly is 22.18 / 23.6 —
   below it `npm run lan` builds, then fails with ERR_UNKNOWN_FILE_EXTENSION. State it once,
   check it at start with a plain message.
   (Done: `scripts/nodecheck.mjs` (plain JS — runs on any Node) before `npm run lan` / `serve`:
   "runs on Node.js 24 or newer (22.18+ works too) — this is v22.11.0"; `engines` in
   package.json; README and MULTIPLAYER.md say 24+ (what CI and this machine test).)
178. [x] The packaged server prints source-checkout help: `--help` shows `node server/main.ts …
   (npm run lan …)`, a busy port says `try: node server/main.ts --port N`, a missing build says
   `run "npm run build"` (main.ts ~66, ~106). Word them for how it was started.
   (Done: `packaged` = running as server.mjs — --help, the busy-port hint and the missing-game message name `node server.mjs` and the game/ folder; checked on a built package.)
179. [x] macOS: "right-click → Open" no longer passes Gatekeeper on macOS 15+ (README.md ~46,
   README.txt, release notes): System Settings → Privacy & Security → Open Anyway.
   (Done: README.md, MULTIPLAYER.md, README.txt, release notes: double-click; else Privacy & Security → Open Anyway.)
180. [x] The Windows starter run from inside the zip (Explorer's zip view) fails with "Cannot find
   module": `Start Mythwar Server.cmd` should check `server.mjs` is beside it and say "extract
   the zip first".
   (Done: the .cmd and the .sh starters check server.mjs is beside them — "unpack the whole zip first"; tried with a starter copied alone.)
181. [x] Closing the server window (README.txt recommends it) ends Node by SIGHUP — only
   SIGINT/SIGTERM run the final Hall save (main.ts ~138): up to 5 s of results lost. Handle SIGHUP
   (and Windows' SIGBREAK) too.
   (Done: SIGHUP and, on Windows, SIGBREAK also save and stop.)
182. [x] The macOS/Linux starters only check that `node` exists (package.ts ~52): Ubuntu 22.04's
   apt Node 12 gives a raw SyntaxError. Check the version like the Windows starter. (And nothing
   ever starts the bundled `server.mjs` in tests/CI.)
   (Done for the version: the .sh/.command starters check Node ≥ 20 with a plain message. Still open: nothing in tests/CI starts the bundled server.mjs — see #185.)
183. [x] Port 8787 busy → the server moves to the next free port silently (main.ts ~101): usually a
   second copy is running, and phones are on the old one. Say so when it moves.
   (Done: "Port 8787 was busy (is Mythwar running already, in another window?) — using 8788." — tried with two servers.)
184. [x] main.ts ~141's comment says the starters restart the server; they don't. Fix the comment.
   (Done.)
185. [x] Nothing in tests or CI ever starts the bundled release server (`server.mjs` from
   `npm run package`): a bundling problem (a dependency the bundle misses) would only show on a
   user's PC. A test that packages, starts server.mjs on port 0, fetches the page and opens a
   WebSocket hello. (Done: `scripts/packcheck.ts` / `npm run package:check` — the package's server.mjs from its
   own folder: page, its script (relative ./assets paths — the first try's regex missed them), a
   lobby hello welcomed with this checkout's protocol and rules fingerprint, a hosted room; a step
   in release.yml after `npm run package`.)
186. [x] Gamepad: the battle room (now with How to play, #161) had no D-pad reachability check (the
   results have one, #109). (Done: mpsmoke walks the room's 11 controls — mode and handicap chips,
   Leave room, How to play, Ready — all reachable.)
187. [x] README's `docs/mp-phone.jpg` (run #7) showed an old HUD under Mímir's lanes tip. (Done:
   `mobile-mp-battle` now has both players summon after the countdown; re-shot with tips off —
   `shoot mobile-mp-battle --settings '{"hints":false,"playerName":"Ada","sigil":1}'` then
   `docshot … docs/mp-phone.jpg 960`; caption fixed — it is the host's phone.)
(Items 188–197: an independent review of co-op (two allies against the server's AI), 2026-10-13.)
188. [x] `server/match.ts` `forfeit` in co-op ended the battle at once ("forfeit", the AI wins)
   when the leaver's ally was away at all — B switches apps for 2 s, A leaves: lost. (Done: the
   leaver is gone for good, the battle waits while the ally is away and is lost only when the
   ally's own grace runs out; server test — failed before.)
189. [x] Co-op results: the rematch note named the AI ("Waiting for Novice…", "Novice left the
   room.") — `syncRematch` passed `foeName`. (Done: the ally's name in co-op.)
190. [x] An ally whose tab closed at the start and never came back still got the co-op victory in
   the Hall (and the room's wins). (Done: `Match.stillIn()` — only allies here or away for less
   than the grace are credited; server test.)
191. [x] The ally who stays is never told the other is away or has left (room news skip battles,
   the net notice only shows a pause, the HUD still says "You & Bo"). A toast "Bo left — you fight
   on alone" / "Bo is away", and the HUD's name line without them. (Done for the words:
   `allyNews()` (src/ui/roomnews.ts, tested) → a toast in a co-op battle — "Bo left the battle —
   you fight on alone.", "Bo is away — you fight on…", "Bo is back."; mpsmoke checks the first. The
   HUD's "You & Bo" line stays as it was.)
192. [x] After an ally left mid-battle, the room ended in phase 'over' with one seat: not listed
   in the lobby, and the old "victories together" score carried to a new ally. (Done: such a room
   is 'waiting' again with the score reset, as in a duel; server test.)
193. [x] A rematch accepted from the results can start a different battle than the one shown:
   A goes to Room, switches to a duel (or takes a handicap) and readies; B on the results reads
   "wants a rematch!" and accepts — now fighting the ally. Say what changed on the results' note
   ("Ada wants a duel / now fights under Glass Citadel") — or route Accept through the room. (Done: the room's terms are kept
   when a battle starts (`roomTerms`); the results' note says a change — "Bo wants a rematch — as
   a duel!", "Next battle: Bo under Glass Citadel." (`termsChange`, tested); mpsmoke: B takes a
   handicap on the results, A's note says so.)
194. [x] Both allies away: the notice names the ally ("Bo is away… you win") with duel wording and
   may offer "Claim victory", which the server refuses in co-op (netoverlay.ts ~91–97). Co-op
   wording: "Bo is away — the battle waits for you both"; no claim button. (Done: in co-op, "Bo is
   away — … The battle goes on as soon as one of you is here.", no claim, no "you win".)
195. [x] Co-op room: under the ally's seat "2 – 2 here · you 3 – 1 overall" frames the ally as an
   opponent (mpmenus.ts ~441–447). In co-op: "Victories together: 2". (Done: co-op rooms show "Victories together: N" under the
   ally and no head-to-head record.)
196. [x] Co-op leaving and credit: the leaver's journal records a defeat and the pause note says
   leaving "counts as a defeat" though the side may still win; side-wide feats (Wyrmcaller,
   Favoured, Among the Gods) go to both allies for one ally's deed; a stayer who won alone reads
   "You and Bo toppled the Novice!". (Done but the feats: in co-op leaving journals no defeat; the pause note says
   "Leaving hands the battle to your ally, who fights on"; a stayer who won alone reads "You
   toppled the Novice — after Bo had left." / "Well fought — alone at the end!". Side-wide feats
   for one ally's deed stay — split into #198.)
197. [x] (minor) The co-op chronicle calls the foe by the difficulty label ("First blood to Novice")
   where single player uses the general's name (Puck); the results drop the AI's income note. (Done:
   the co-op chronicle names the general (`PERSONAS[coop]`); the results get `coop` and show
   "Novice · 50% income" by the AI's name; mpsmoke checks the latter.)
198. [x] Co-op feats: Wyrmcaller, Favoured, Among the Gods (src/ui/feats.ts ~100–113) are judged on the
   shared side, so one ally's dragon / rank-5 blessing / Celestial ascent earns them for both.
   Judge them by the player's own orders (the turn's `seat`), or mark them "together". (Note for whoever takes
   it: sim events don't say which seat ordered; NetGame sees each applied command's `seat` in the
   turns — count own dragon / ascend / bless orders there and credit the matching events.) (Done
   that way: `NetGame.onOwnOrder` (our own orders as they take effect in a turn) →
   `FeatTracker.ordered`; in co-op Wyrmcaller, Among the Gods and Favoured need the player's own
   dragon / last ascension / blessing; test.)
199. [x] Co-op HUD: after the ally left (#191 now says so in a toast), the name line still reads
   "You & Bo · Fae Wilds" (hud.ts ~1095) — "You (Bo left)" or just "You" once their seat is empty. (Done:
   no ally named once their seat is empty — the player's own name line shows; mpsmoke checks.)
200. [x] #191's "is away" toast and #194's co-op notice had no end-to-end check. (Done: in mpsmoke's
   co-op battle A steps away — B is told; B too — A's notice names the ally, no claim, no "you
   win"; both back, the battle runs.)
201. [x] #162's copy fallback and #166's Back handling were only checked in Chrome — iPhones run
   WebKit. (Done: `mpengines` gained a WebKit phone pass — Settings → "Copy my code" with no
   Clipboard API at all says "Copied" (execCommand works there); Back in a battle opens the menu
   and the page stays.)
(Items 202–: open for the next run.)
202. [x] PROGRESS.md is ~1250 lines; each run reads it first. Move the done items 1–137 and the
   run #5–#7 summaries to docs/PROGRESS-archive.md (linked), keeping the open items, decisions,
   open questions and the last two run summaries here. (Done: docs/PROGRESS-archive.md holds items 1–137 but the
   open #23/#94/#137, the run #4–#7 summaries, the Phase 2 lens checklist and the Phase 1 backlog
   — checked line by line that nothing was lost; PROGRESS.md 1441 → ~550 lines.)
203. [x] `allyNews` (#191) toasts "Bo is away" / "Bo is back" on every blip of the ally's link
   (`away || !connected`): on poor Wi-Fi that could flicker a toast every few seconds. Hold "away"
   for ~2 s before saying it (and say "back" only after an "away" was said). (Done: `allyNews` returns a kind;
   the app says "away" after 2 s if still away, "back" only after an "away" was said; tests;
   mpsmoke's co-op checks green.)
204. [x] smoke still has ~90 short fixed sleeps (100–600 ms) between taps and checks — on the CI
   runner (#127) the timing-sensitive ones may flake. Turn the ones that wait for a state into
   `waitForFunction`s (as #134/#158 did for results and page loads).
   (Done for the menu changes, the ones that matter: `menuIs(page, name)` waits until that menu
   shows *and* its screen has finished its 0.35-s fade/slide — a tap measured mid-slide could miss
   on a slow runner. 20 sleeps replaced (93 → 74): Continue, New battle/Begin, the gamepad's
   Play/Back/Start, riddles, the tutorial hand-off, the rotated menus, results → Change foe → Back,
   Rematch (+ the HUD taking input again — a frame later), Settings → Copy journal (waits for
   "copied"). Left: 16–120 ms steps of drags, key and pad presses (time is what they are), and
   short waits for in-battle effects. smoke green three runs in a row.)
205. [x] The `browser-tests` workflow (#127) hasn't run on GitHub yet and now has `package:check`
   to consider: add `npm run package:check` to it (it needs no browser) so every PR proves the
   release package starts. (Done: a last step in browser-tests.yml.)
206. [x] README's `docs/mp-room.jpg` predated the room's "How to play" and the sigil by the seat
   name. (Done: `shoot mp-room --settings '{"playerName":"Ada","sigil":1}'` → docshot 960.)
207. [x] No end-to-end check of a co-op battle *finished* — the verdict for a stayer who won alone
   (#196: "You toppled the Novice — after Bo had left"), the results' co-op score line, the Hall's
   co-op count for the allies still in it (#190). mpsmoke's co-op battle ends by both leaving; a
   test hook that ends a battle on the server (`attachMultiplayer` option, test-only) would let it
   play out to the results. (Done without a hook: mpsmoke already holds the server — it ends the co-op battle
   through the lobby's room and checks B's verdict "You toppled the Novice — after Ada L had
   left.", "Back to room", and the room open again.)
208. [x] The lobby's "can't reach the game server" help (mpmenus.ts ~142) also said only "private
   networks" (#175's trap). (Done: "…allows Node.js — on Windows also that the Wi-Fi is a
   Private network, not Public.")
209. [x] #166 kept a history entry for Back on every device: on a computer the browser's Back then
   never left the page from a room or a battle (it re-arms each time). (Done: touch devices only
   (`pointer: coarse`) — phones' Back and swipe are the reason; a computer has Esc. smoke's Back
   check runs on the phone viewports; mpsmoke and the WebKit pass unchanged.)
   (Checked on the way: #151's per-screen MutationObserver makes no calls at all while a screen
   sits idle — title, settings, bestiary, a battle — so no layout reads per frame.)
210. [x] Co-op room: your own seat shows "2 wins" while the ally's shows "Victories together: 2"
   (#195) — the same number twice; in co-op, leave your own seat's line empty. (Done.)
211. [x] `lostSessionPlan` (#171): a seat that expired while the phone sat on the *results* pulls
   the player off the results to the lobby (then rejoins, #160) — the results vanish mid-read.
   Keep the results up with a note, and rejoin when they leave them. (Done a little differently: the results
   stay up and the room is taken again at once, quietly — the results' buttons follow the room
   (Rematch again once seated); `lostSessionPlan` test updated; mpsmoke drops B on the results
   past the seat's grace and checks B is seated again with its results still showing.)
212. [x] smoke's heartbeat check flaked once in a full `verify` ({"low":3,"dire":3}): it counted beats
   in 3 s of wall time, and slow frames under the three parallel flows stretch the gaps (expected
   3 vs 5, margin one beat). (Done: it also records the tempo `k` each beat was struck at — 0.17
   vs 0.9 — and compares that; 2-s windows; verify green.)
213. [x] Online results: once the other seat empties, the quick-message chips stay hidden for those
   results (#18 — so a stranger who takes the seat isn't addressed as the old opponent). Since
   #211, the *same* player can come back to their seat on the results (a phone that slept) — the
   chips should come back for them (same device / same name), and stay away only for a stranger.
   (Seen in mpsmoke: the gamepad walk had to run before B's sleep.) (Done: `updateRematch(…, same)` — the seat holds
   the player the battle was fought with (by name) → the chips come back; a stranger still gets
   none; mpsmoke checks A's chips return once B is back.)
214. [x] mpsmoke grew from 53 s (#138) to ~80 s with run #9's checks — two waits for a seat to expire
   (`seatGrace: 6`), the tab-closed rejoin, the co-op away/both-away steps. Time each section
   (print it), then trim: seatGrace 3 where the quick reconnect checks still hold, run the
   co-op section's two away waits together. (Done: each section prints its time — lobby 8.7 s, claim/results 13.9 s, co-op
   19.4 s were the big ones; `seatGrace: 3` (the quick results-drop reconnect still holds, also
   with `--latency 60 --jitter 80` and `--portrait`) → 72 s. The co-op section's rest is its 3-s
   countdown, the AI's first summons and #203's 2-s away hold — needed.)
215. [x] Back in the battle room (phones, #166/#209) does nothing — like Esc, so a stray swipe can't
   drop a friend's seat. But an Android player pressing Back there expects to go back: offer a
   small "Leave the room?" confirm (Leave / Stay) on Back instead of nothing; Esc unchanged.
   (Done with Android's own idiom instead of a dialog: a first Back flashes "Press Back again to
   leave the room.", a second within 4 s leaves (to the lobby, still on the page); Esc unchanged.
   A left room's flash no longer follows into the lobby. mpsmoke checks both Backs; PLAYTEST asks
   whether one Back should be enough.)
216. [x] `shoot`'s multiplayer scenarios show this machine's real LAN address and port in the invite
   (README's `docs/mp-room.jpg`: 192.168.1.105:62535). Give shoot's server a fixed example
   (`lanUrls: () => ['http://192.168.1.20:8787/']` — an `attachMultiplayer` option already) so
   pictures are stable between shots and say nothing about the machine they were made on. (Done:
   shoot's server announces http://192.168.1.20:8787/; docs/mp-room.jpg re-made with it.)
217. [x] mpsmoke's seat-expiry steps (#160, #211) drop the link with a clean `conn.close()`; a phone
   that sleeps usually leaves a dead link the server only notices by its heartbeat (server/net.ts,
   ~12 s). Cover that path once: block the page's traffic (CDP `Network.emulateNetworkConditions`
   offline) instead of closing, and check the seat still comes back.
   (Done — but not with CDP: its offline mode passed once and failed the next run, because
   Chrome's network service still answers the server's WebSocket pings. The phone now reaches the
   server through a TCP relay in mpsmoke that can freeze its links (nothing through, no close)
   and drop them on thaw; `AttachOptions.deadAfter` (3 s in mpsmoke). The room's #160 step uses
   it: the server finds the link dead after ~3.6 s (not at once), gives up the seat, the phone
   rejoins. Plain, latency and portrait green.)
(Items 218–221: an independent review of the client netcode — connection, client, NetGame,
the overlay and the app's online wiring — 2026-10-13.)
218. [x] **A phone that missed a citadel-fall ending freezes in the battle.** Reconnecting with
   `battle: true`, the server replays `lastOver` (snapshot with `winner` set, then `over`);
   `NetGame.onOver` (src/net/netgame.ts ~314) emits `gameOver` only when the world's winner is
   unset or different — a freshly loaded world queued no events, so no results, `game.over`
   true, and `pause()` refuses (no menu) — stuck until a reload. Likely in co-op (a phone locks,
   the ally finishes). Emit `gameOver` once per battle in `onOver` if it hasn't gone out.
   (Done with #219: NetGame sends the end exactly once — `overSent` — and `onOver` sends it if
   the world's own events didn't. Test (co-op: Bo's link closed, the AI's citadel falls, Bo
   reconnects → results, one gameOver) — failed before the fix: no gameOver at all.)
219. [x] The replica can step to the final tick before `over` arrives (two frames; a late
   packet): `gameOver` fires with `g.result === null`, so app.ts skips the online record, the
   journal and the feats as for a server restart, and `onOver` later has nothing to emit. Hold
   back `gameOver` while `result` is null; emit it from `onOver` (with #218: exactly once).
   (Done: `NetGame.emit` holds a gameOver back until the verdict is in; test — failed before.)
220. [x] After a version mismatch (`error` code `version` → `conn.close()` clears `onclose`) or a
   takeover by another tab (4001), `mp.room` stays: the battle overlay says "Reconnecting…"
   forever, the room says "Reconnecting…" with Ready dimmed, and the "reload" explanation is only
   in the lobby's status line. Drop room/seat on both and say "reload" where the player is.
   (Done: `MpClient.refused()` — both paths abandon the battle and drop room and seat; the app
   takes a refused page from a battle or the results to the lobby (it did so for 4001 only),
   whose status line says "reload". Test in netgame.test.ts; mpsmoke green.)
221. [x] `allyAwaySaid` (app.ts ~1230) carries over between battles: a battle that ends while the
   ally is away leaves it true, so in the rematch a short blip says "Bo is back." without an
   "away". Reset it (and its timer) when a battle starts and on toTitle.
   (Done in `onNetBattle` — every online battle, rematches included, starts there; the flag
   only counts in a battle, so toTitle needs nothing. Too small and DOM-bound for a unit test;
   mpsmoke's co-op checks green.)
222. [x] (Own find) A phone that walks out of the Wi-Fi mid-battle (not backgrounded) leaves its
   socket open; the server only calls it dead after the transport heartbeat's 12 s — that long the
   battle runs on without the player. Pages ping every second: a seat silent for 4 s could count
   as away (battle held, "is away" shown) until anything is heard from it again.
   (Done: `server/lobby.ts` `checkSilence` / `heard` — a connected seat in a battle silent for
   `SILENT_AWAY` = 4 s counts as away; the next message brings it back unless the page itself
   said it's away (`saysAway`, from hello and 'away'). `LobbyOptions.silentAway` (0 = never: the
   server tests' fake clients don't ping); server test; MULTIPLAYER.md. mpsmoke plain and
   with latency green.)
(Items 223–224: an independent review of run #10's own diff, 2026-10-13; 225–227: a review of
server/lobby.ts and match.ts, 2026-10-13.)
223. [x] #222's silence rule, three holes: (a) `saysAway` outlived its battle — a page says
   "back" only during a battle, so one that ended while it was away (a claimed win) kept it,
   and in the rematch a Wi-Fi stall's away was never undone: the battle held for a player who
   is there, and the other could claim; (b) `heard()` ran before the message that ended the
   silence — a first word of "away" flickered resuming → paused; (c) after a stall of the whole
   server (the host's laptop dozing) every player counted as silent before their waiting
   messages were read. (Done: `startMatch` resets `saysAway`; `heard()` after `handle()`; an
   `update()` after a > 1-s gap skips the check. One server test covers all three — each part
   fails without its fix. mpsmoke gained a mid-battle silent-link step: the battle is held
   after ~2–2.7 s of silence (`silentAway` 2.5 there), before the link is found dead (5 s).)
224. [x] The phone's "press Back again" (#215) outlived the room: Back once, Leave room, join
   another within 4 s, Back once → left with no prompt; a room gone from under the prompt left
   it on the lobby. (Done: `leaveRoom` and the room → lobby switch forget it, and drop the
   prompt's text.)
225. [x] Seat grace measured from the disconnect, not the battle's end (lobby.ts ~307): in co-op
   B's phone locks at minute 2, A wins alone at minute 6 — in the same `update()` B's 4-minute-old
   `goneAt` removes B at once, and `removeFromRoom` zeroes the wins A just earned; a duel won by
   the 90-s forfeit likewise. Start the grace at the result (`goneAt = now` in `ended()` for
   seats still gone).
   (Done that way; server test (co-op, Bo gone two minutes, Ada wins: Bo still seated, Ada's
   win kept, Bo's reconnect lands in the room) — failed before the fix.)
226. [x] A host whose phone reconnects isn't put back in the open-battles list: `disconnected()`
   marks the room list dirty (the room drops out — `openRooms` needs `conn`), the resume path in
   `hello` doesn't. On a quiet LAN the room stays unlisted. Set `roomsDirty` in `hello` when the
   session has a room.
   (Done; server test — failed before.)
227. [x] Away/back toggling can still hold a duel forever (a gap in #46): "back" counts from
   `setAway(false)`, but the battle only runs after the 3-s resume countdown — 2 s away, 2.5 s
   back, repeat: each return carries nothing over, the claim/forfeit clocks restart, not a tick
   is played. Count the time back from when the battle actually runs again.
   (Done: `Match.lastAbsence[].endedAt` is null until the battle runs again (`backFrom()` when
   the countdown or the resume ends; at once in co-op, where the battle ran on); an absence that
   starts before then carries all of the last one. Server test: 12 cycles of 2 s away / 2.5 s
   back, < 5 ticks played, then the claim succeeds — failed before.)
228. [x] mpsmoke's co-op start failed once under `--latency 60 --jitter 80` (A's Ready ignored):
   A's own page shows its handicap gone at once (`setTrials` is optimistic), so A's wait passed
   and its Ready went out with the room's old `rev` — stale (#96). (Done: both pages wait for a
   newer `rev` than the one with the handicap; `waitFor` passes arguments into the page. Four
   runs green incl. two with latency.) A person can't tap that fast after a chip (~100 ms).
229. [x] (#228's cause, for people too) A Ready pressed right after one's own handicap or mode
   change carried the room's old `rev` whenever the server's echo hadn't arrived — on a slow
   phone link (200–300 ms) a quick chip-then-Ready bounced. (Done: `MpClient.termsChanged()` —
   our own change bumps the local `rev` as the server will (TCP delivers the change first); test
   with 60 ms latency — failed before. An *other* player's change racing a Ready stays #155.)
(Items 230–236: an independent visual review of the online screens — mpsmoke `--shots` in both
orientations, shoot's two-player scenarios and its own phone shots — 2026-10-13.)
230. [x] **On a phone the room's message line was invisible while the room waits**: the room is
   taller than an 844×390 stage (the invite), and `.mpflash` (`min-height: 0`, overflow hidden)
   was squashed to 0 px — "Press Back again to leave the room." (#215), "Bo left the room.",
   server errors and the "turn sideways" tip never showed; the room's note ("Waiting for a second
   player…") sat below the fold too. (Done: `.mpflash` doesn't shrink; on a short stage the note
   and the message line come right under the room's header (`order`). Measured on 844×390,
   390×844 and 667×375: the line at y≈84–103 (was 409, off screen). mpsmoke's Back check now
   needs the line on screen, not just its text.)
231. [x] The room's "Bo is ready — press Ready to begin!" (`.mnote.hot`) pulsed down to 35%
   opacity — caught nearly unreadable in both two-player shots. (Done: its own gentler pulse,
   down to 75%.)
232. [x] The "is away" notice's top edge ran through the purse and ley bar on short screens
   (`.nbanner { top: 18% }` = 70 px; the bar ends ~76 px). (Done: `top: max(18%, 84px)`.)
233. [x] Room seat "Golden Dragon (you)" wrapped its "✎" alone onto the next line. (Done: a
   no-break space before the pencil.)
234. [x] Online results after a walkover said "Well fought!" (a 13-s battle, nothing fought) and
   the walkover earned Worthy Rival and every other victory feat — farmable with two tabs.
   (Done: "A win by walkover." for a forfeit/timeout win without a room score, nothing after a
   loss by leaving; online victory feats need the citadel toppled — Worthy Rival now reads
   "Topple another player's citadel.")
235. [x] "Go!" of a resume countdown stayed under a fresh "… is away — The battle waits" (someone
   left right after a resume). (Done: no "Go!"/"Fight!" while the battle is held.)
236. [x] (decided) The results chart's end label says "Foe" while the legend names the opponent:
   left — the label is "Foe" in every mode and has ~50 px; the legend names them. Also fixed on
   the way: `node scripts/shoot.ts --help` (or any unknown flag) ran every scenario and overwrote
   the shots — it prints usage now (exit 1 for an unknown flag).
237. [x] (Run #10 checks of the silence rule, #222) A 3-minute bot soak over a lagged link
   (`server/main.ts --latency 30 --jitter 40`, `mpbot --vs-bot`): 0 desyncs, 0 "went quiet" —
   no false holds from 1-s pings under jitter. `package:check` (the bundled server.mjs) and
   `mpengines` (WebKit vs Chrome/Firefox) green. Found on the way: `mpbot --help` started a bot
   that ran until killed — it prints usage now (exit 1 for an unknown flag), like `shoot`.





**Start here: [docs/BRIEF.md](docs/BRIEF.md)** — one page: what TASK.md asked for, what was
built, how to see each part working, and the decisions that need you.

## Run #10 in short (for the morning)
- Verification mode, backlog items 215–228. Open from run #9: #204 (smoke waits for menu
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
- Tests 285 → 293; mpsmoke plain / latency / portrait green (a co-op Ready race in the test
  fixed, #228); verify:all green early in the run.

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

## Run #8 in short (for the morning)
- Verification mode, backlog items 38–142: done except the notes #23, #94 and the open
  #128, #129, #137, #138, #142 (for the next run — start there; add new ones from a fresh review). Ten independent reviews (netcode; app state;
  simulation/AI/HUD; rendering/persistence; accessibility; docs; two players' flows; data across
  versions; a visual review from screenshots; a review of this run's own diff — which caught
  three regressions, #116–118) found most of them; each was reproduced by a new test or smoke
  check where possible before fixing. Tests: 218 → 256; smoke and mpsmoke gained ~30 checks.
- Items 87–109: "Room" on the online results; a dropped phone re-scanning the QR gets its seat
  back; the room says what the other player changed; a stale Ready is ignored (protocol v15);
  autosaves are v2 and survive other builds; a save never undoes another tab's progress (a second
  copy under `mythwar.progress.v1`, merged on every save; resets honoured between tabs; journals
  merged); `npm run verify:all`; CONTRIBUTING rule 6; BRIEF's "since then" paragraph.
- **Rules changed** (battle outcomes can differ from run-#7 builds): mixed mirrored armies were
  uneven — team 1 had a one-tick edge in shot timing and in followers freed by a kill (#59–60);
  the AI's Dragon bank no longer blocks the Dragon (#64). designcheck passes; riddles unchanged.
- HUD: buttons light by one in-flight-aware blocker online (#63); the sandbox's foe mode shows
  the foe's queue and panels (#61); Bastion's preview under Glass (#62); iOS audio after an
  interruption (#58). enginecheck: V8, JavaScriptCore and SpiderMonkey still simulate identically.
- The weightiest: **one client could crash the LAN server** (a malformed frame on a socket refused
  for the per-address limit — #44); a fault while handling a message, or in one battle, no
  longer ends the server and every battle in it (#50, #51); toggling "away" could stall a battle
  forever (#46); an opponent named "__proto__" polluted `Object.prototype` on the page (#43).
- Reconnects: a WebSocket stuck dialling is given up after 5–15 s and retried; the network coming
  back dials at once (#40). The last turn now goes out before 'over' (#49); leaving while a start
  is on its way no longer starts that battle (#48); leaving counts as a defeat on both sides (#54).
- Menus: riddle result → Riddles → Back → Back reaches the real title (#52); battle keys wait
  under a menu over a running online battle (#53).
- Bundle: the QR library loads on demand (main chunk 401 → 381 kB, #38). Progress codes carry
  solved riddles (#42). New test files: connection, static, net. Tests: 218 → 241.
- Items 65–86 (later in the run): an unreadable Hall file is kept aside instead of overwritten
  (#65); a continued battle keeps its chronicle (#66, #74); the service worker refreshes the
  manifest/icons (#67), prunes old lazy chunks (#73) and shows the saved page after 4 s when the
  server hangs (#85); bad server flags get a plain message (#70); away flips are coalesced
  (#71); a battle stopped by a fault says so (#72); accessibility (#76–84: focus follows
  screens, screen-reader wording, finger-sized hit areas clear of the gate, "!" for danger);
  docs corrected (#75); `npm run smoke -- --only <flow>` (#86).
- **Protocol is now v15** (`RoomInfo.rev`, `ready.rev` — #96): server and pages from one build.
- Items 110–136 (late in the run): a visual review from screenshots (fades under pinned buttons,
  phone panels sized and opaque, the shield clear of the lane bar, clearer lane tabs, a pool
  behind banners, bubbles/badges hidden under menus, seat names wrap, the lobby's empty list);
  a review of the run's own diff caught three regressions (#116–118, fixed with tests); smoke
  flows run in fresh profiles (#124); `shoot` takes several names and has multiplayer scenarios;
  `npm run docshot`; a "Browser tests" workflow for GitHub (#127, not yet run — Open questions).
- The release package (`npm run package`) was started and probed: brotli, immutable hashed
  assets, no-cache page/sw/manifest, path escapes refused, stray upgrades closed.

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
