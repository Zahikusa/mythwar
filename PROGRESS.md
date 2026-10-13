# PROGRESS — Phase 3: a native-app feel on phones

Status: in progress (started run #12, 2026-10-13). Phases 1–2 (LAN multiplayer, the 100 lenses)
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
- [ ] **M1 `npm run mobilecheck`** (the measuring tool for A–E): Playwright WebKit (iPhone SE
  375×667, iPhone 15 393×852, iPhone 16 Pro Max 440×956) + Chromium (Pixel 7 412×915, Galaxy
  S9-size 360×740), portrait + landscape, **tab** (viewport minus the browser's bars) and
  **standalone** (full screen, simulated safe-area insets via `?safe=t,r,b,l`). It visits every
  screen and asserts: the document doesn't scroll (scrollHeight == clientHeight, scrollY stays 0
  after wheel/touch drags), no interactive element outside the viewport/safe area, targets ≥ 44
  px, overflowing panels scroll inside themselves. Screenshots to `screenshots/mobile/`.
- [ ] **A** No scrolling page: stage sized to `visualViewport` (bars, keyboard, rotation),
  a document scroll lock (touchmove outside a scrollable panel is cancelled; scroll reset to 0),
  panels scroll inside themselves with a fixed header/close and `overscroll-behavior: contain`,
  no callouts/selection/zoom.
- [ ] **B** Installed = native: manifest (`display`, orientation, ids), iOS startup background
  (no white flash), status bar, safe areas on both sides in landscape, update flow that never
  reloads during a battle, offline start.
- [ ] **C** Install guidance: `src/platform.ts` (situation detection, unit-tested with real UA
  strings), the install sheet (per browser, with a picture and an arrow), the title hint, the
  sheet after the first finished battle, a permanent "Install app" in the menu and Settings,
  in-app browser escape, desktop QR, the LAN origin's one-liner, the installed app's welcome.
- [ ] **D** Navigation and gestures: one history model for Back on every screen/sheet, swipe
  down to dismiss sheets, ≥ 44-pt targets, no hover dependence, smooth screen changes, a
  haptics switch in Settings.
- [ ] **E** Small-screen polish (375×667 up to tablets), from the screenshots.
- [ ] **F** (stretch) Android APK (TWA/Capacitor): decide, record.
- [ ] Docs: real-device checklist in `docs/PLAYTEST.md`; the LAN trade-off in
  `docs/MULTIPLAYER.md`.

## Done

- (run #12) M0: old PROGRESS.md appended whole to docs/PROGRESS-archive.md.

## Decisions

- **Portrait:** keep rotating the stage 90° on an upright phone (the game is a side-view
  three-lane battle; a portrait layout would be a different game). Installed, the manifest asks
  for landscape (Android honours it; iOS ignores it, the rotation covers it).
- Facts checked on the web (2026-10-13) about Safari 26 (iOS 26): `theme-color` is ignored (the
  toolbar is tinted from the root background and fixed elements near the edges, so html/body
  keep an explicit dark background); opaque full-screen `position: fixed` layers can be clipped
  at the floating bottom bar; "Add to Home Screen" opens as a web app by default ("Open as Web
  App" toggle, on); the route is ⋯ → Share → Add to Home Screen.

## Approaches that failed

(none yet)

## Open questions for the human

- Everything in Phase 3 is tested with Playwright's WebKit and Chromium device profiles, which
  do not draw Safari's real bars or the home indicator. The real-device checklist in
  docs/PLAYTEST.md lists what only a physical iPhone/Android can confirm.
