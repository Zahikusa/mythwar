# TASK — Phase 3: make Mythwar feel like a native app on phones

Phases 1 and 2 (LAN multiplayer, the 100 lenses) are finished; their task text is in
docs/TASK-phase1-2.md. **This is a new phase.** The "complete / verification mode" status and the
old improvement backlog in PROGRESS.md do not apply to it: move them into docs/PROGRESS-archive.md
and start PROGRESS.md over with a plan for Phase 3.

## Why

Real-device feedback from the owner: on an iPhone in the standard Safari browser the game looks
bad. Pages scroll on every screen, the browser's bars frame everything, and it feels like a
website rather than a game. Fix that. The goal is that a player on an iPhone or Android phone
feels like they are using a native app: no rubber-band scrolling, no browser bars where they can
be avoided, gestures and navigation that work the way phone users expect.

## Facts to design around (don't spend runs rediscovering them)

- iPhone Safari has **no Fullscreen API** for pages, so the bars of a normal Safari tab cannot be
  removed. The only way to an iPhone app without bars is **Add to Home Screen** (standalone
  web app). So there are two experiences, and both matter:
  1. **Installed (home screen / standalone):** this is the way to the "native app" feel. Make it
     flawless, and make it easy for players to get there.
  2. **Safari / Chrome tab:** the bars stay, but everything else must still be excellent. The
     game fits the visible area exactly, nothing scrolls the page, and the bars never cover
     controls.
- Android Chrome supports `requestFullscreen` and the `beforeinstallprompt` install flow; use them.
- The manifest, `apple-mobile-web-app-*` tags and `viewport-fit=cover` already exist. Check how
  they actually behave on current iOS (iOS 18/26), not just that they are present.
- Desktop and LAN multiplayer must keep working. `npm run verify` stays green.

## Goals (in this order)

**A. Not a single scrolling page.** On every screen (title, foe select, battle, pause, settings,
bestiary, feats, journey, lobby, battle room, results, all dialogs and sheets) the document
itself never scrolls, rubber-bands or zooms. That covers pull-to-refresh, double-tap zoom,
pinch zoom, long-press text selection, callouts and the grey tap highlight. Size the layout to
the *visible* viewport (`dvh`/`svh`, `visualViewport`) so it works with Safari's bars shown or
hidden, with the on-screen keyboard open (room code, names), and after rotating. Content that
cannot fit (bestiary, settings, feats, lobby lists) scrolls **only inside its own panel**, with
momentum and a fixed header and close button. Measurable: `scrollHeight == clientHeight` on the
document for every screen, on every test device and in both orientations.

**B. Installed = native.** In standalone mode there are no browser bars, no white flash on
launch (iOS startup images or a matching background), correct safe areas (notch, Dynamic Island
and home indicator in landscape on both sides), status bar handling, and orientation behaviour
that is a deliberate choice (decide what to do in portrait and make it clean). Offline start
still works, and updates arrive without breaking a running battle.

**C. Getting players to install.** Add an unobtrusive "Install as app" path:
- **Android:** the real install prompt (`beforeinstallprompt`), plus a fullscreen option in the
  tab.
- **iPhone Safari:** a short, illustrated sheet ("Share → Add to Home Screen") shown at a sensible
  moment, such as after the first battle or from the title menu, never on top of the first
  seconds of play. It can be dismissed and does not nag again.
- Never show it when the game is already installed.

The LAN multiplayer address (`http://192.168…`) is a different origin from GitHub Pages. Handle
installing from there sensibly and say so in the multiplayer docs.

**D. Phone navigation and gestures.**
- The system back gesture and Android's Back button behave consistently on every screen and
  sheet (one history model, no dead ends, never leaves the app by accident).
- Swipe down to dismiss sheets wherever that is natural.
- Touch targets are at least 44 pt, and nothing depends on hover.
- Screen changes are smooth, and controls the thumbs need often sit where the thumbs are, in
  landscape.
- Haptic feedback where the platform supports it (Android `vibrate`), with an off switch in
  Settings.

**E. Small-screen polish.** Readable text, nothing clipped by the notch or rounded corners, no
overlaps, consistent spacing, on the smallest supported phone (iPhone SE, 375×667) up to large
phones and tablets.

**F. (Stretch, only after A–E are done and verified; at most 2 runs.)** Decide whether a
downloadable Android app (TWA or Capacitor APK, attached to the GitHub release by the release
workflow) is worth it, and build it if so. Don't touch the App Store. Record the decision in
PROGRESS.md either way.

## How to verify

- Add `npm run mobilecheck`. Using Playwright with **WebKit** iPhone profiles (SE, 15/16, a Pro
  Max) and **Chromium** Android profiles (a Pixel, a small Samsung), in portrait and landscape,
  it visits every screen and asserts:
  - the document does not scroll;
  - no interactive element lies outside the viewport or the safe area;
  - every touch target is at least 44 px;
  - inner panels scroll when their content overflows.
- Simulate both the tab case (a smaller viewport, as with Safari's bars) and the standalone case
  (the full screen, with safe-area insets). Save screenshots of every screen to
  `screenshots/mobile/` and look at them yourself: a check that passes on a screen that looks
  wrong is a bug in the check.
- Add a short real-device checklist for the owner to `docs/PLAYTEST.md`. One iPhone in Safari,
  then installed; one Android phone in Chrome, then installed; about 10 minutes.

## Time rules

- Work through A → E in order. Each goal is done when its checks pass and the screenshots look
  right. Then move on, and don't polish a done goal unless a later goal breaks it.
- No micro-optimising of numbers or metrics. Every commit must change something a player on a
  phone would notice, or a check that protects it.
- Do not change game rules, balance or the multiplayer protocol in this phase.
- When A–E (and F, or the decision against it) are done, write
  "Status: Phase 3 complete, in verification mode" at the top of PROGRESS.md. From then on, only
  fix **mobile UX defects you can see in screenshots or name on a real device**. List what still
  needs a physical phone under "Open questions for the human".
