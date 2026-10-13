# PROGRESS — Phase 3: a native-app feel on phones

Status: Phase 3 complete, in verification mode (run #12, 2026-10-13). A–E done and verified
(`npm run mobilecheck`: 6 devices × tab/installed × both orientations × 16 screens, all green;
`npm run verify` green), F decided against. From here: only mobile UX defects seen in
screenshots or nameable on a real device (backlog below); what needs a physical phone is under
"Open questions for the human".

Started run #12, 2026-10-13. Phases 1–2 (LAN multiplayer, the 100 lenses)
are finished; their log, backlog and open questions are in
[docs/PROGRESS-archive.md](docs/PROGRESS-archive.md) (last section).

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
2. [ ] `public/splash/`: 40 PNGs, 3.8 MB in the repo and in the LAN server's release zip. Flat
   colour + one icon: palette PNGs (or one image per aspect ratio) would be a tenth of that.
3. [x] `src/update.ts` has a unit test for the bundle name only: nothing exercises the "New
   version ready — restart" offer end to end (smoke could serve a page whose bundle name differs
   and fire visibilitychange).
   (Done: `watchForUpdate` returns a check-now function, exposed as `__mythwarUpdateCheck`;
   smoke's service-worker flow fakes a page with another bundle and expects the title's
   "New version ready — restart", the page not reloaded.)
4. [ ] smoke's "card tooltip sits above the card, on screen" (large desktop) failed once when
   run with `--only desktop,large-desktop` (bottom 3 px past the card's top), passed alone
   twice and in the full verify: a timing-dependent measure — make it wait for the tooltip's
   final position.
5. [ ] The install sheet's arrow places are best guesses for some browsers (Firefox/Edge on
   iPhone, Samsung Internet, iOS 26 Safari sideways, in-app browsers): confirm on devices
   (PLAYTEST.md's checklist) and correct `guideFor`'s `spot`s.
6. [ ] Upright phone + text field (lobby name, room code): the stage is turned but the keyboard
   comes up upright. The lobby says "turn your phone sideways before typing"; an upright input
   overlay (like the install sheet: drawn on the page, not the stage) would remove the need.
7. [ ] mobilecheck can't simulate the LAN origin (127.0.0.1 is a dev machine to platform.ts):
   a `?lanpreview` (or hostname override in the check) would let it shoot the LAN line in
   Settings and the "Play full screen" offer.

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
- The installed iPhone app keeps its own records (iOS gives a home-screen app its own storage):
  the sheet offers "Copy my progress" and the welcome explains where to paste it. If that is
  too clumsy in practice, the next step would be passing the progress code in the URL when the
  icon is added (fragile; not done).
- `related_applications` in the manifest names https://zahikusa.github.io/mythwar/manifest.webmanifest:
  if the game moves to another address, update it (Android's "You have the app" note uses it).
