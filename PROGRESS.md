# PROGRESS — Phase 3: a native-app feel on phones

Status: Phase 3 complete, in verification mode (run #12, 2026-10-13). A–E done and verified
(`npm run mobilecheck`: 7 devices × tab/installed × both orientations × 38 screens, all green;
`npm run verify` green), F decided against. From here: only mobile UX defects seen in
screenshots or nameable on a real device (backlog below); what needs a physical phone is under
"Open questions for the human".

Started run #12, 2026-10-13. Phases 1–2 (LAN multiplayer, the 100 lenses)
are finished; their log, backlog and open questions are in
[docs/PROGRESS-archive.md](docs/PROGRESS-archive.md) (last section).

## Run #12 in short (for the morning)

Phase 3 was planned, built and verified in one run (2026-10-13): `npm run mobilecheck` (new),
then A (screens framed: only their middle scrolls; the page held still; the stage follows the
visual viewport), B (launch images, manifest, update offer, offline start tested), C
(`platform.ts` + the install guide: title offer, pictured sheet with an arrow, Android's
dialog, app-browser escape, QR, LAN line, installed welcome), D (Back model, swipe-down
sheets, 44-px targets, Vibration switch), E (contact-sheet review on 8 devices), F decided
against. Then verification mode: backlog 1, 3, 4, 6–15, 17, 18 done (the notch strips now
continue the scene; upright typing echo; "Paste my progress"; the LAN page shot; …).
Open: 5 (arrow places on real devices), 16 (iPhone haptics trick) — both need a real phone;
2 (launch images' size) decided against.
Bugs worth knowing that were found on the way: WebKit ignores `position: sticky` under the
turned stage (Settings' Done was off screen on an upright iPhone); Chrome refuses every swipe
on a turned scroller with `overflow-x: hidden`; headless WebKit froze CSS animations of pages
it didn't consider in front (mobilecheck runs one browser per view, transitions off).

## Where things stood at the start (run #12)

Already in the code before Phase 3, and kept:
- `index.html`: `viewport-fit=cover, user-scalable=no`, `apple-mobile-web-app-capable`,
  `black-translucent` status bar, manifest (`display: fullscreen`, `orientation: landscape`), a
  service worker (`public/sw.js`, production builds only).
- `style.css`: html/body `overflow: hidden; touch-action: none; overscroll-behavior: none;
  user-select: none`, no tap highlight; `#app` is `position: fixed; inset: 0`.
- `App.resize()` sizes `#stage` from `window.innerWidth/innerHeight` minus the safe-area insets
  (read through an `env()` probe). **An upright phone rotates the whole stage 90°** so the
  side-view lanes keep their width. This is the deliberate portrait choice (see Decisions).
- Back (Android button / iOS swipe) = the game's Esc through one armed history entry
  (touch devices only). `buzz()` vibrates (tied to the screen-shake setting). Fullscreen + a
  landscape lock when a battle starts on Android (setting `fullscreen`).
- `main.ts` blocks iOS gesture events (pinch) and double-tap zoom.
- Menu screens (`.screen`) scroll themselves (`overflow-y: auto`) when too tall.

## Plan (milestones, in TASK order)

- [x] **M0** Archive the old PROGRESS, write this plan. *(run #12)*
- [x] **M1 `npm run mobilecheck`** (the measuring tool for A–E): Playwright WebKit (iPhone SE
  375×667, iPhone 15 393×852, iPhone 16 Pro Max 440×956) + Chromium (Pixel 7 412×915, Galaxy
  S9-size 360×740), portrait + landscape, **tab** (viewport minus the browser's bars) and
  **standalone** (full screen, simulated safe-area insets via `?safe=t,r,b,l`). It visits every
  screen and asserts: the document doesn't scroll (scrollHeight == clientHeight, scrollY stays 0
  after wheel/touch drags), no interactive element outside the viewport/safe area, targets ≥ 44
  px, overflowing panels scroll inside themselves. Screenshots to `screenshots/mobile/`.
- [x] **A** No scrolling page: stage sized to `visualViewport` (bars, keyboard, rotation),
  a document scroll lock (touchmove outside a scrollable panel is cancelled; scroll reset to 0),
  panels scroll inside themselves with a fixed header/close and `overscroll-behavior: contain`,
  no callouts/selection/zoom.
- [x] **B** Installed = native: manifest (`display`, orientation, ids), iOS startup background
  (no white flash), status bar, safe areas on both sides in landscape, update flow that never
  reloads during a battle, offline start.
- [x] **C** Install guidance: `src/platform.ts` (situation detection, unit-tested with real UA
  strings), the install sheet (per browser, with a picture and an arrow), the title hint, the
  sheet after the first finished battle, a permanent "Install app" in the menu and Settings,
  in-app browser escape, desktop QR, the LAN origin's one-liner, the installed app's welcome.
- [x] **D** Navigation and gestures: one history model for Back on every screen/sheet, swipe
  down to dismiss sheets, ≥ 44-pt targets, no hover dependence, smooth screen changes, a
  haptics switch in Settings.
- [x] **E** Small-screen polish (375×667 up to tablets), from the screenshots.
- [x] **F** (stretch) Android APK (TWA/Capacitor): decided against for now (see Decisions).
- [x] Docs: real-device checklist in `docs/PLAYTEST.md`; the LAN trade-off in
  `docs/MULTIPLAYER.md`.

## Done

- (run #12) M0: old PROGRESS.md appended whole to docs/PROGRESS-archive.md.
- (run #12) M1: `npm run mobilecheck` (scripts/mobilecheck.ts): 5 phones × tab/app × portrait/
  landscape × 14 screens, screenshots in `screenshots/mobile/`. The installed case is simulated
  with `?safe=t,r,b,l` (App.safeArea) and a stubbed `display-mode`/`navigator.standalone`. On
  the Androids (Chromium) it also pinches and swipes with real touch events (CDP
  `Input.dispatchTouchEvent`; `synthesizeScrollGesture` did nothing in this setup). ~15 min for
  the whole matrix; filters `--device --screen --mode --orient`. First run: 1021 small targets,
  63 screens scrolling as a whole and passing their overscroll on, no document scroll.
- (run #12) A, first part:
  - Menu screens are head / body / buttons (Menus' `frame()`, run on every show): only `.sbody`
    scrolls (momentum, `overscroll-behavior: contain`, fading edges via `more`/`above`). Found
    on the way: in WebKit a `position: sticky` button row ignores a rotated ancestor, so on an
    upright iPhone SE in Safari Settings' Done was off screen.
  - Battle sheets (turrets, blessings, controls): the title row with Close stays, `.pbody`
    scrolls (hud.ts `withBody`).
  - `src/stillpage.ts`: touchmove outside a panel that can scroll is cancelled (iOS bounce),
    pinch/double-tap blocked, no long-press context menu on touch, the page scrolls back to 0
    once nobody types; `-webkit-touch-callout: none`; text fields keep `user-select: text`;
    viewport `maximum-scale=1`.
  - `App.resize()` uses `visualViewport` (bars, keyboard), re-measures after `orientationchange`,
    `#app` follows the visual viewport's offset while typing (`follow()`, also in `toStage`), and
    the focused field is scrolled into view after a resize.

- (run #12) B: iPhone/iPad launch images (`scripts/splash.ts` draws 40 into public/splash/ from
  `scripts/splashsizes.ts`; a Vite plugin writes the `apple-touch-startup-image` links), an
  inline dark background + `color-scheme: dark` for the first frame, manifest `id`,
  `display_override`, `related_applications`; `src/update.ts` notices a newer build when the game
  returns to the foreground and offers "New version ready — restart" in the title's corner
  (never reloads by itself); the lobby's reload messages get a Reload button (an installed app
  has none); smoke starts the game offline.
- (run #12) C: `src/platform.ts` (detect + advise, tests/platform.test.ts with real UAs incl.
  Safari 26's frozen "18_6" OS token) and `src/ui/install.ts` (InstallGuide): title corner offer
  (× = remembered, a small 44-px button stays, the full offer returns once after 4 days), an
  upright bottom sheet drawn on the page (not the turned stage) with pictured steps for this
  browser/iOS version and a bouncing arrow at the button's screen edge, the real install dialog
  (`beforeinstallprompt`), "Play full screen" on Android and the LAN page, "Open in Chrome"
  (`intent://`) / Copy link in app browsers, a QR code on computers, the sheet once after the
  first finished AI battle, a Settings row, a first-launch welcome in the installed app, "You
  have the app" via `getInstalledRelatedApps`. iPhone: the app keeps separate storage, so the
  sheet offers "Copy my progress" and the welcome says where to paste it. Safe-area insets
  reach page-level UI as `--safe-t/r/b/l` (set in `App.resize`, honouring `?safe=`).
  MULTIPLAYER.md explains the LAN-origin trade-off.

- (run #12) D: Back — an open "get the app" sheet, then a battle sheet, closes first; the
  results go back the way their ghost button does (main menu / riddles / the room); the bare
  title asks "Press Back again to leave Mythwar." and only the next untouched Back leaves (a
  touch re-arms). Battle sheets close with a swipe down on their title row; the install sheet
  with a swipe down anywhere. Touch targets ≥ 44 px under `(pointer: coarse)` — buttons grow,
  small marks (page dots, lane tabs, speed/pause, the feats chip) get positioned `::before`
  hit areas (mobilecheck counts those). Speed/pause: the HP bar gives 14 px per side. A
  Vibration switch of its own (`haptics`, migrated from the old shake+vibration switch; shown
  where `navigator.vibrate` exists). Nothing depends on hover (tooltips also on long press /
  focus). smoke's `phone-back` flow covers the Back model.
- (run #12) Full mobilecheck: every screen on 5 phones × tab/app × both orientations passes
  (document still, controls inside the safe area, targets ≥ 44, panels scroll themselves,
  real swipes and pinches on the Androids).

- (run #12) E: contact-sheet review of every screen on the SE (tab, both ways), the shortest
  stage (Galaxy sideways in Chrome, 292 px), the notched Pro Max installed (both ways) and an
  iPad mini (added to mobilecheck). Fixed: a screen body's children were squeezed instead of
  scrolled (the how-to's text cut off); the title's offers covered the logo/Settings (now
  among the buttons on phones, in the corner on tall stages); the title's creature parade
  gives way below 330 px; the foe cards' 9-px labels → 10 px. mobilecheck gained: overlapping
  controls, text under 10 px, one browser per view, settled screens (no transitions).

## Improvement backlog (verification mode, phase 3)

1. [x] Installed, sideways, on a notched iPhone: the stage stays inside the safe area, so
   59–62-px dark strips run down both sides of the battle (screenshots/mobile/
   iphone-16-pro-max-app-l-battle.png). A native game draws its scene under the notch and keeps
   only the controls inside. Needs the renderer to draw beyond the stage (canvas wider than
   the HUD's box) — a careful change in App.resize / Renderer.resize.
   (Done differently, without touching the layout: `App.paintAmbient` keeps a 1/8-size copy of
   the scene, stretched to the whole screen 4× a second, blurred and dimmed, behind the stage —
   the strips continue the scene. Shown wherever the stage leaves strips: installed or Safari
   sideways on a notched iPhone. smoke's cursor check now reads `#stage > canvas`.)
2. [x] `public/splash/`: 40 PNGs, 3.8 MB in the repo and in the LAN server's release zip. Flat
   colour + one icon: palette PNGs (or one image per aspect ratio) would be a tenth of that.
   (Decided: not done. iOS fetches only the one image matching the screen when the icon is
   added; a player notices nothing, and TASK's time rules ask every commit to change something
   a phone player would notice. Revisit if the release zip's size matters.)
3. [x] `src/update.ts` has a unit test for the bundle name only: nothing exercises the "New
   version ready — restart" offer end to end (smoke could serve a page whose bundle name differs
   and fire visibilitychange).
   (Done: `watchForUpdate` returns a check-now function, exposed as `__mythwarUpdateCheck`;
   smoke's service-worker flow fakes a page with another bundle and expects the title's
   "New version ready — restart", the page not reloaded.)
4. [x] smoke's "card tooltip sits above the card, on screen" (large desktop) failed once when
   run with `--only desktop,large-desktop` (bottom 3 px past the card's top), passed alone
   twice and in the full verify: a timing-dependent measure — make it wait for the tooltip's
   final position.
   (Done: when it failed, the tooltip's place was steady but 18 px low — measured too short when
   placed. `Hud.placeTooltip` now places it once more on the next frame if its size changed, and
   smoke waits for a steady position. Paired runs: failed 2 of 4 before, passed 3 of 3 after —
   watch it.)
5. [ ] The install sheet's arrow places are best guesses for some browsers (Firefox/Edge on
   iPhone, Samsung Internet, iOS 26 Safari sideways, in-app browsers): confirm on devices
   (PLAYTEST.md's checklist) and correct `guideFor`'s `spot`s.
6. [x] Upright phone + text field (lobby name, room code): the stage is turned but the keyboard
   comes up upright. The lobby says "turn your phone sideways before typing"; an upright input
   overlay (like the install sheet: drawn on the page, not the stage) would remove the need.
   (Done: `src/ui/upright.ts` — while a field on the turned stage has the keyboard, an upright
   echo at the top of the screen shows its label, what's typed and a caret, with Done; the keys
   still go to the real field, so Enter/change/blur behave as before. The two "turn your phone
   sideways" tips are gone; mpsmoke `--portrait` types a name in the room and expects the echo;
   mobilecheck shoots a `typing` screen.)
7. [x] mobilecheck can't simulate the LAN origin (127.0.0.1 is a dev machine to platform.ts):
   a `?lanpreview` (or hostname override in the check) would let it shoot the LAN line in
   Settings and the "Play full screen" offer.
   (Done: `?lanpreview` makes platform.ts see a LAN server's page; mobilecheck shoots
   `lan-title` and `lan-settings` in the tab — iPhone: no offer, the line in Settings;
   Android: "Play full screen" on the title and in Settings.)

8. [x] The installed iPhone app's welcome tells a returning player to go to Settings to paste
   the progress code copied in Safari: a "Paste my progress" button right in the welcome
   (`navigator.clipboard.readText`, which iOS answers with its own Paste bubble) would bring
   the records over in one tap.
   (Done: "Paste my progress" in the welcome (iPhone, a fresh app, where the clipboard can be
   read) merges the code and saves; smoke's `app-welcome` flow stubs an installed iPhone,
   puts a code on the clipboard and taps it.)
9. [x] mobilecheck doesn't visit the coach's tips (the first battle's guidance), the age
   preview (long press on Ascend) or a card's details on a phone: three overlays a phone player
   sees in the first minutes.
   (Done: `tip`, `preview` and `card` screens — all fit on every phone; looked at on the SE
   both ways and the Galaxy sideways.)
10. [x] Back while the upright typing echo is up (ui/upright.ts): the screen behind changes
   (lobby → title) but the field may keep the focus and the echo its place — check that the
   echo always goes with its screen.
   (Checked, no change needed: Back in the upright lobby with the name field focused — in
   Chromium and WebKit the focus moves to the title (Menus.focusScreen), the field's focusout
   hides the echo.)
11. [x] The ambient strips (backlog 1) redraw 4× a second even with the battery saver on.
   (Done: once a second then.)
12. [x] PLAYTEST.md's phone check predates "Paste my progress" and the upright typing echo: add
   a line for each (installed iPhone: paste from Safari; upright lobby: the echo while typing).
   (Done, with the ambient strips beside the notch too.)
13. [x] An iPad 9.7"/10.2" in a Safari tab sideways (1024×~690): the title's corner offer sits
   beside a logo that's wider relative to the screen than on the iPad mini — add that size to
   mobilecheck and look.
   (Done: an `ipad-10` profile (810×1080) — the offer sits clear of the logo, all screens pass.)
14. [x] (review) The "You have the app — open it from your home screen" note: its × did nothing
   visible the first time (the note hid only at `installHint === -1`, the first × sets a
   date). (Done: one × puts it away for good — it offers nothing else; smoke `app-elsewhere`
   stubs getInstalledRelatedApps, taps ×, reloads.)
15. [x] (review) The title offer's × (`.tclose`) is a `role="button"` span inside the offer's
   own button: nested controls, unreachable by Tab or a gamepad (the D-pad lands on the chip
   only). Make × a sibling button of the chip (a small group), each ≥ 44 px.
   (Done: one pill of two buttons, `.tmain` and `.tclose`, both 44 px; smoke's gamepad and
   app-elsewhere flows and mobilecheck's title screens pass.)
16. [ ] iPhones get no vibration at all (Safari has no `navigator.vibrate`). Safari 18+ ticks the
   Taptic Engine when an `<input type="checkbox" switch>` toggles — a known trick some web
   games use for haptics. Worth a real-device experiment behind the Vibration switch (which
   would then show on iPhones too); undocumented behaviour, so only with a device to test on.
17. [x] (desktop) With Chrome's install dialog on a computer, the sheet says "Tap Install app"
   and "opens from your home screen": a computer clicks, and the app opens in its own window.
   Word `guideFor('install')` by `s.os`. (Done, with a unit test.)
18. [x] The whole mobilecheck matrix now takes ~25 min (8 devices × 4 views × 22 screens): a
   `--quick` set (SE, Pixel 7, iPad mini; tab and installed; the screens that changed most)
   for iterating, the full matrix before a commit that touches layout. (Done: `--quick`.)
19. [x] (review) TASK C asks app browsers for "the steps for that app": they were generic.
   (Done: `escapeSteps` in ui/install.ts — Instagram/Facebook/Messenger "Open in external
   browser" (iOS), TikTok/LinkedIn "Open in browser", Telegram, WeChat, LINE, X (the Safari
   icon), the Google app (share → Open in Safari); generic otherwise; Android keeps "Open in
   Chrome" first. Unit-tested. The wording follows each app's menu as last known — confirm on
   devices with backlog 5.)
20. [x] (review) The full matrix timed out on the coach tip and the results of big installed
   phones held upright: headless WebKit drew them on the CPU at 3× and the battle ran at a
   third of its speed. (Done: the check uses at most 2× and plays those two screens at 4×
   game speed; the full matrix — 8 devices — is green again.)
21. [x] (run #13) Settings' "Your name" field was 15 px on phones (the room's seat-name rule
   `.sname` in mp.css also matched the field's class): iOS zooms the page into a field under
   16 px on focus, with pinch off no way back. (Done: the seat rules scoped to `.rseat .sname`;
   mobilecheck fails any text field under 16 px, hidden ones too.)
22. [x] (run #13) The battle room on the shortest stage (Galaxy sideways in Chrome, 292 px): the
   invite QR code was cut by the panel's edge and "Copy link" hidden below it — the friend's
   camera needed a scroll first. (Done: under 340 px the room code sits beside its label, the
   QR is 92 px and "Copy link" beside the address; the whole invite fits.)
23. [x] mobilecheck saw the battle room only while it waited: never with a friend in it (seats,
   Versus/co-op chips, handicaps), never an online battle or its results. (Done: a friend — a
   node MpClient — joins the page's room and readies up: `room2`, `online`, `online-over` (the
   friend leaves mid-battle: a walkover). All fit on the SE and the Galaxy.)
24. [x] (run #13) A returning player's title (a saved battle: Continue adds a button) was never
   checked. It overflowed: on an upright SE/Galaxy in a tab Settings and "Get the app" were cut
   off; on an iPad mini sideways Settings was off screen. And even without Continue, the iPad
   mini's footer line ran over Settings (no check sees text over a control — see 26).
   (Done: on 521–860-px stages the title's small buttons go two by two under the gold one;
   under 400 px a Continue makes the creature parade give way. mobilecheck `title-continue`.)
25. [x] (run #13) TASK A says "after rotating", but mobilecheck only loaded each orientation
   fresh. (Done: `turned-battle`, `turned-settings`, `turned-install`: loaded one way, the
   viewport turned, checked again — on the devices whose insets are the same both ways.)
26. [x] mobilecheck's overlap check compared controls with controls only: plain text over a
   button (the iPad title's footer line over Settings, backlog 24) passed. (Done: each line of
   visible text is checked against the controls it isn't part of, where the text is the
   topmost thing drawn — hit-tested with every element made hit-testable, faded-out ones
   skipped; the battle's floating notes (opening banner, coach tip, card details) are exempt.
   Confirmed: with the old title CSS it fails the iPad mini's footer over Settings.)
27. [x] (run #13) The quick messages in an online battle (the speech-bubble button) were 33 px
   tall on phones, ~35 on tablets, and co-op's six calls in a column ran down over Ascend.
   (Done: two across — three for co-op — on phone HUDs, 44 px under a finger everywhere.
   mobilecheck `online-chat` (a message from the friend showing), `coop-chat`, `online-pause`;
   pop-up menus the player opened don't count as overlapping the HUD; a timed-out wait now says
   what it waited for.)
28. [ ] iPhone sound: whether the game's music stops the player's own music/podcast and whether
   the ring/silent switch mutes it depends on WebKit's audio session (`navigator.audioSession
   .type`, Safari 17+; field reports disagree on the default). Native games mix with other
   audio and obey the switch ('ambient'). Needs a device: try both and set it explicitly.
29. [x] (run #13) mobilecheck never showed the after-battle offer to get the app (the full sheet
   over the results, the one place the sheet appears uninvited). (Done: `results-offer`, in a
   tab; fits on the SE, Galaxy, Pro Max and iPad mini.)
30. [x] (run #13) The sandbox's "For: You / Foe" switch (which side a card summons for) was a
   25-px pill under a finger, and mobilecheck never opened the sandbox or a riddle of war.
   (Done: its touch area reaches 44 px tall (a `::before`, the pill keeps its look);
   mobilecheck `sandbox`, `riddle`, `riddle-over`.)
31. [x] (run #13) "Bo is away" (the friend's app went to the background mid-battle) ran from
   edge to edge on a phone: over the cards and the god power, Claim victory on top of Briar
   Snare. (Done: the HUD publishes its side columns' width on the stage (`--hud-side`) and the
   online notices keep between them — upright, Claim victory goes under the text. mobilecheck
   `online-away` (the check's server offers the claim after 2 s).)
32. [x] (run #13) mobilecheck never showed "Connection lost — Reconnecting…" (our own link
   dropping mid-battle). (Done: `online-lost` closes the page's socket and holds the redial.
   The full matrix — 7 devices, ~33 screens each way — is green: 920 views.)
33. [x] (run #13) A phone was told about keys it doesn't have: How to play's "Keys: 1–4 summon,
   W/S or ↑/↓ change lane", "(on a keyboard, Space casts it…)", "(or G)", "(or hover it)", and
   the sandbox's opening banner "…the “For:” button (X)". (Done: key hints are `.kbonly`, hidden
   on a touch-only screen (`hover: none` and `pointer: coarse`); the banner leaves out "(X)"
   there. mobilecheck now visits all six how-to pages (`howto-2` … `howto-6`).)
34. [x] (run #13) Settings showed "Fullscreen on phones" on iPhones (no fullscreen for pages —
   a switch that does nothing) and in the installed app (full screen already). (Done: the row
   shows only where a battle can go full screen and the game isn't installed — checked on an
   iPhone tab/app, an Android tab/app and a desktop.)
35. [x] (run #13) The title's "Press Back again to leave Mythwar." (Android Back) sat at the
   foot, over "Get the app" and — upright on an SE — Bestiary and Settings, just as the player
   decides whether to stay. (Done: it shows at the top, over the logo's small line; mobilecheck
   `title-back`, green on every device.)

## Decisions

- **Portrait:** keep rotating the stage 90° on an upright phone (the game is a side-view
  three-lane battle; a portrait layout would be a different game). Installed, the manifest asks
  for landscape (Android honours it; iOS ignores it, the rotation covers it).
- Facts checked on the web (2026-10-13) about Safari 26 (iOS 26): `theme-color` is ignored (the
  toolbar is tinted from the root background and fixed elements near the edges, so html/body
  keep an explicit dark background); opaque full-screen `position: fixed` layers can be clipped
  at the floating bottom bar; "Add to Home Screen" opens as a web app by default ("Open as Web
  App" toggle, on); the route is ⋯ → Share → Add to Home Screen.

- Battle sheets and menu screens keep head/buttons fixed with a scrolling body rather than
  `position: sticky` (see Approaches that failed).
- The install sheet and its arrow live on the page (`document.body`), upright, not in the
  turned stage: they talk about the browser's buttons, which never turn.
- The after-battle offer follows AI battles only (an online results screen has its own
  rematch flow), once ever; the title offer comes back once after 4 days, then only the small
  button remains (plus Settings).
- Edge-to-edge drawing under the notch (installed, landscape) is left for E: the stage stays
  inside the safe area, the notch strips show the page's dark background.

- **F: no downloadable Android app (TWA/Capacitor APK) for now.** (1) Chrome on Android
  already makes the installed game a WebAPK — a real app in the drawer with its icon, splash,
  full screen, offline — through the install dialog the game now offers; a sideloaded APK adds
  nothing a player would see, and needs "install unknown apps", which looks unsafe. (2) A TWA
  only drops the URL bar once Digital Asset Links verify the origin: `assetlinks.json` must sit
  at https://zahikusa.github.io/.well-known/ — the owner's user-site repo, not this one —
  otherwise it shows a browser bar (worse than the PWA). (3) Capacitor/Bubblewrap need a JDK +
  Android SDK in the release workflow and a signing keystore as a repo secret: owner setup,
  outward-facing. (4) The one real gain a native shell could bring — a phone hosting the LAN
  server, no PC needed — is a project of its own (a WebSocket server plugin), not a 2-run
  stretch. Revisit if Play Store presence or phone-hosted rooms become goals.
- Tablets turn the stage like phones when upright (an iPad mini upright, unturned, had lanes
  ~560 px wide and stretched cards; turned, it uses its 1059-px height).
- 10 px is the smallest text (HUD numbers, the foe cards' small labels); mobilecheck fails
  anything smaller.

## Approaches that failed

- `position: sticky` for a screen's buttons: broken in WebKit under the rotated stage.
- `overflow-x: hidden` (or `touch-action: pan-y`) on a scroller inside the rotated stage: Chrome
  applies both in screen axes, so an upright phone could not scroll it at all. Scrollers inside
  the stage use `overflow-y: auto` alone and `touch-action: pan-x pan-y`.

## Open questions for the human

- **Please run the 10-minute phone check** in docs/PLAYTEST.md ("Phones: the native-app
  check") on one iPhone and one Android phone. Everything in Phase 3 is tested with
  Playwright's WebKit and Chromium device profiles, which don't draw Safari's real bars, the
  home indicator, the keyboard or the install dialogs. In particular:
  - iOS 26 Safari's floating tab bar: content can extend under it; the game sizes itself to the
    visual viewport minus the safe-area insets — confirm no card or button sits under the bar.
  - The keyboard in the lobby on an iPhone (the stage follows `visualViewport` while typing).
  - The install sheet's steps and arrow match what each browser shows (backlog 5).
  - The first launch of the installed app is dark (launch images) and shows the welcome.
  - Sound on an iPhone (backlog 28): does the game stop your own music, and does the silent
    switch mute it? (A line in PLAYTEST.md's check; then `navigator.audioSession.type` can be
    set to match native games.)
- The installed iPhone app keeps its own records (iOS gives a home-screen app its own storage):
  the sheet offers "Copy my progress" and the welcome explains where to paste it. If that is
  too clumsy in practice, the next step would be passing the progress code in the URL when the
  icon is added (fragile; not done).
- `related_applications` in the manifest names https://zahikusa.github.io/mythwar/manifest.webmanifest:
  if the game moves to another address, update it (Android's "You have the app" note uses it).
