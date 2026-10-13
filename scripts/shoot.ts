/**
 * Screenshot harness: serves dist/ and captures scenarios with the local Chrome.
 *   npm run build && node scripts/shoot.ts [filter] [--query "a=1&b=2"] [--wait ms] [--size 667x375]
 *   (--size overrides the viewport of the selected scenarios; the file name gets a -WxH suffix)
 *   node scripts/shoot.ts --list      (scenario names; the filter matches substrings)
 *   --cvd protanopia|deuteranopia|tritanopia   simulate colour-vision deficiency (Machado 2009,
 *   full severity) over the whole page; the file name gets a -<type> suffix
 *   --settings '{"colorblind":true}'  stored settings to start with (merged over the defaults)
 * Output: screenshots/<name>.png
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

interface Scenario {
  name: string;
  query: string;
  w: number;
  h: number;
  mobile?: boolean;
  dpr?: number;
  wait?: number;
  /** JS evaluated in the page before the screenshot. */
  script?: string;
  /** Extra wait after the script ran. */
  after?: number;
}

const cast = (age: number, lane: number) =>
  `(() => { const a = window.__mythwar; const w = a.game.world; const p = w.players[0]; p.age = ${age}; p.powerCooldown = 0; a.game.command({ type: 'power', team: 0, lane: ${lane} }); })()`;

const SCENARIOS: Scenario[] = [
  { name: 'desktop-early', query: 'demo&ff=75&seed=3', w: 1600, h: 900 },
  { name: 'desktop-mid', query: 'demo&ff=420&seed=5', w: 1600, h: 900 },
  { name: 'desktop-jade', query: 'demo&ff=560&seed=11', w: 1600, h: 900 },
  { name: 'desktop-ultrawide', query: 'demo&ff=300&seed=5', w: 2560, h: 1080 },
  { name: 'desktop-laptop', query: 'demo&ff=200&seed=5', w: 1366, h: 768 },
  { name: 'desktop-qhd', query: 'demo&ff=300&seed=5', w: 2560, h: 1440 },
  { name: 'desktop-short', query: 'demo&ff=300&seed=5', w: 1920, h: 600 },
  { name: 'desktop-small', query: 'demo&ff=300&seed=5', w: 1024, h: 640 },
  { name: 'desktop-small-late', query: 'demo&ff=900&seed=5', w: 1024, h: 640 },
  { name: 'desktop-late', query: 'demo&ff=900&seed=5', w: 1600, h: 900 },
  { name: 'mobile-land', query: 'demo&ff=120&seed=3', w: 844, h: 390, mobile: true, dpr: 3 },
  { name: 'mobile-port', query: 'demo&ff=120&seed=3', w: 390, h: 844, mobile: true, dpr: 3 },
  { name: 'menu-title', query: '', w: 1600, h: 900, wait: 2500 },
  { name: 'menu-diff', query: 'screen=difficulty', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-diff-qhd', query: 'screen=difficulty', w: 2560, h: 1440, wait: 2000 },
  { name: 'menu-howto', query: 'screen=howto', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-bestiary', query: 'screen=bestiary', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-bestiary-known', query: 'screen=bestiary', w: 1600, h: 900, wait: 2000, script: `(() => { const a = window.__mythwar; a.settings.ageSeen = 4; a.menus.show('title'); a.menus.show('bestiary'); document.querySelectorAll('.btab')[1].click(); })()`, after: 500 },
  { name: 'mobile-bestiary', query: 'screen=bestiary', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000 },
  { name: 'sandbox', query: 'sandbox&seed=3', w: 1600, h: 900, wait: 1200, script: `(() => { const a = window.__mythwar; const g = a.game; for (let i = 0; i < 3; i++) g.command({ type: 'train', team: 0, unitId: 'treant', lane: i }); a.hud.toggleSide(); for (let i = 0; i < 3; i++) g.command({ type: 'train', team: 0, unitId: 'pixie', lane: i }); })()`, after: 3500 },
  { name: 'mobile-sandbox', query: 'sandbox&seed=3', w: 844, h: 390, mobile: true, dpr: 2, wait: 1200, script: `window.__mythwar.hud.toggleSide()`, after: 3500 },
  { name: 'menu-feats', query: 'screen=feats', w: 1600, h: 900, wait: 2000, script: `(() => { const a = window.__mythwar; a.settings.feats = ['first', 'novice', 'dragon', 'shrines']; a.menus.show('title'); a.menus.show('feats'); })()`, after: 500 },
  { name: 'mobile-feats', query: 'screen=feats', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000 },
  { name: 'menu-settings', query: 'screen=settings', w: 1600, h: 900, wait: 2000 },
  { name: 'mobile-settings', query: 'screen=settings', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000 },
  { name: 'mobile-title', query: '', w: 844, h: 390, mobile: true, dpr: 3, wait: 2500 },
  { name: 'mobile-diff', query: 'screen=difficulty', w: 844, h: 390, mobile: true, dpr: 3, wait: 2000 },
  { name: 'mobile-howto-2', query: 'screen=howto', w: 667, h: 375, mobile: true, dpr: 2, wait: 2000, script: `document.querySelector('.hnext').click()`, after: 500 },
  { name: 'mobile-howto', query: 'screen=howto', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); b.click(); b.click(); })()`, after: 500 },
  { name: 'mobile-howto-4', query: 'screen=howto', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); for (let i = 0; i < 3; i++) b.click(); })()`, after: 500 },
  { name: 'mobile-howto-5', query: 'screen=howto', w: 667, h: 375, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); for (let i = 0; i < 4; i++) b.click(); })()`, after: 500 },
  { name: 'mobile-howto-6', query: 'screen=howto', w: 667, h: 375, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); for (let i = 0; i < 5; i++) b.click(); })()`, after: 500 },
  { name: 'mobile-pause', query: 'play=novice&seed=4', w: 844, h: 390, mobile: true, dpr: 2, wait: 1500, script: `window.__mythwar.pause()`, after: 500 },
  { name: 'mobile-port-title', query: '', w: 390, h: 844, mobile: true, dpr: 2, wait: 2500 },
  { name: 'mobile-diff-se', query: 'screen=difficulty', w: 667, h: 375, mobile: true, dpr: 2, wait: 2000 },
  { name: 'mobile-port-diff', query: 'screen=difficulty', w: 390, h: 844, mobile: true, dpr: 2, wait: 2000 },
  { name: 'power-briar', query: 'demo&ff=60&seed=3', w: 1600, h: 900, script: cast(0, 1), after: 700 },
  // Six pixies wiped out at once by Wrath of Zeus: the "Slaughter! ×6" callout.
  {
    name: 'rout',
    query: 'demo&ff=40&seed=3',
    w: 1600,
    h: 900,
    script: `(() => { const w = window.__mythwar.game.world; for (let i = 0; i < 6; i++) { const u = w.spawnUnit(1, 1, window.__mythwarData.UNITS.pixie, 520 + i * 12); u.hp = 20; }; const p = w.players[0]; p.age = 1; p.powerCooldown = 0; window.__mythwar.game.command({ type: 'power', team: 0, lane: 1 }); })()`,
    after: 1500,
  },
  // The next age as a mystery (never reached) and as known (reached before).
  { name: 'age-preview', query: 'demo&ff=60&seed=3', w: 1600, h: 900, script: `document.querySelector('.act.ascend').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))`, after: 300 },
  { name: 'age-preview-known', query: 'demo&ff=60&seed=3', w: 1600, h: 900, script: `(() => { window.__mythwar.hud.ageSeen = 4; document.querySelector('.act.ascend').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); })()`, after: 300 },
  { name: 'age-preview-mobile', query: 'demo&ff=60&seed=3', w: 844, h: 390, mobile: true, dpr: 2, script: `document.querySelector('.act.ascend').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))`, after: 300 },
  { name: 'power-zeus', query: 'demo&ff=200&seed=3', w: 1600, h: 900, script: cast(1, 1), after: 900 },
  { name: 'power-fimbul', query: 'demo&ff=300&seed=2', w: 1600, h: 900, script: cast(2, 1), after: 1300 },
  { name: 'power-dragon', query: 'demo&ff=500&seed=5', w: 1600, h: 900, script: cast(3, 1), after: 1100 },
  { name: 'power-starfall', query: 'demo&ff=800&seed=5', w: 1600, h: 900, script: cast(4, 1), after: 1400 },
  {
    name: 'gameover-collapse',
    query: 'play=adept&seed=4',
    w: 1600,
    h: 900,
    wait: 2000,
    script: `(() => { const w = window.__mythwar.game.world; w.players[1].gold = 1e4; for (let l = 0; l < 3; l++) w.apply({ type: 'buildTurret', team: 1, lane: l, turretId: l === 1 ? 'sporepod' : 'thornspitter' }); w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); })()`,
    after: 1400,
  },
  {
    name: 'gameover-results',
    query: 'play=adept&seed=4',
    w: 1600,
    h: 900,
    wait: 2000,
    script: `(() => { const w = window.__mythwar.game.world; w.players[0].baseHp = 1; w.damageBase(0, 10, 0, 1); })()`,
    after: 3600,
  },
  ...[0, 2, 4].map((age) => ({
    name: `turrets-age${age}`,
    query: `play=adept&seed=4&theme=${age}`,
    w: 1600,
    h: 900,
    wait: 1200,
    script: `(() => { const g = window.__mythwar.game; const w = g.world; for (const p of w.players) { p.age = ${age}; p.gold = 1e6; } const ids = { 0: ['thornspitter','sporepod'], 2: ['runestone','frostcatapult'], 4: ['sunspire','starforge'] }[${age}]; for (const t of [0,1]) { g.command({type:'buildTurret', team:t, lane:0, turretId: ids[0]}); g.command({type:'buildTurret', team:t, lane:2, turretId: ids[1]}); } const U = { 0: 'redcap', 2: 'fenrir', 4: 'griffin' }[${age}]; const D = window.__mythwarData.UNITS; for (let i = 0; i < 3; i++) { w.spawnUnit(1, 0, D[U], 180 + i * 40); w.spawnUnit(1, 2, D[U], 170 + i * 40); w.spawnUnit(0, 0, D[U], 820 - i * 40); w.spawnUnit(0, 2, D[U], 830 - i * 40); } })()`,
    after: 700,
  })),
  {
    name: 'mobile-turretpanel',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    script: `(() => { const a = window.__mythwar; a.game.world.players[0].gold = 900; a.hud.togglePanel('turret'); })()`,
    after: 400,
  },
  {
    name: 'mobile-blesspanel',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    script: `(() => { const a = window.__mythwar; a.game.world.players[0].gold = 900; a.hud.togglePanel('bless'); })()`,
    after: 400,
  },
  {
    name: 'mobile-results',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    script: `(() => { const w = window.__mythwar.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); })()`,
    after: 3600,
  },
  {
    name: 'mobile-results-defeat',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    // A long tip: the enemy "reached Olympus" and the player never did.
    script: `(() => { const a = window.__mythwar; const g = a.game; g.world.time = 300; g.ageUps.push({ t: 120, team: 1, age: 1 }); g.world.players[0].baseHp = 1; g.world.damageBase(0, 10, 0, 1); })()`,
    after: 3600,
  },
  { name: 'gallery', query: 'gallery&scale=2', w: 1440, h: 2000, wait: 1200 },
  { name: 'mobile-play-start', query: 'play=novice&seed=4', w: 844, h: 390, mobile: true, dpr: 2, wait: 2500 },
  { name: 'play-start', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 3000 },
  { name: 'card-armed', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 3500, script: `(() => { const a = window.__mythwar; a.game.world.players[0].gold = 8; a.hud.tryTrain('pixie'); })()`, after: 400 },
  { name: 'blessing-might', query: 'demo&ff=420&seed=5', w: 1600, h: 900, wait: 1500, script: `(() => { const g = window.__mythwar.game; g.world.players[0].gold = 1e5; g.command({ type: 'bless', team: 0, blessing: 'might' }); })()`, after: 250 },
  { name: 'blessing-bastion', query: 'demo&ff=420&seed=5', w: 1600, h: 900, wait: 1500, script: `(() => { const g = window.__mythwar.game; g.world.players[0].gold = 1e5; g.command({ type: 'bless', team: 0, blessing: 'bastion' }); })()`, after: 300 },
  { name: 'sandbox-foe', query: 'sandbox&seed=3', w: 1600, h: 900, wait: 1500, script: `window.__mythwar.hud.toggleSide()`, after: 300 },
  { name: 'mobile-sandbox-foe', query: 'sandbox&seed=3', w: 844, h: 390, mobile: true, dpr: 2, wait: 1500, script: `window.__mythwar.hud.toggleSide()`, after: 300 },
  { name: 'dragon-arrival', query: 'play=adept&seed=4&theme=4', w: 1600, h: 900, wait: 5200, script: `(() => { const w = window.__mythwar.game.world; w.players[0].age = 4; w.spawnUnit(0, 1, window.__mythwarData.UNITS.dragon); })()`, after: 350 },
  { name: 'riddle-solved', query: 'screen=difficulty', w: 1600, h: 900, wait: 1500, script: `(() => { const a = window.__mythwar; a.playRiddle('pack'); setTimeout(() => { const g = a.game; for (const l of g.world.lanes) for (const u of l) u.alive = false; }, 300); })()`, after: 3200 },
  { name: 'results-chronicle', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 1500, script: `(() => { const a = window.__mythwar; a.game.speed = 2; setTimeout(() => { const w = a.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); }, 9000); setTimeout(() => { const t = [...document.querySelectorAll('.ctab')].find((b) => b.textContent === 'Chronicle'); t && t.click(); }, 12500); })()`, after: 13000 },
  // Lens #97: the legend behind the battle's champion, on the results.
  { name: 'results-legend', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 1500, script: `(() => { const a = window.__mythwar; a.game.speed = 2; a.game.world.players[0].gold = 1e4; for (let i = 0; i < 4; i++) a.game.command({ type: 'train', team: 0, unitId: 'redcap', lane: i % 3 }); setTimeout(() => { const w = a.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); }, 9000); setTimeout(() => { const t = [...document.querySelectorAll('.ctab')].find((b) => b.textContent === 'Legend'); t && t.click(); }, 12500); })()`, after: 13000 },
  // Lens #98: after an hour of battles the results suggest a break.
  { name: 'results-break', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 1500, script: `(() => { const a = window.__mythwar; a.game.speed = 2; a.playedSecs = 3650; a.game.world.players[0].gold = 1e4; for (let i = 0; i < 4; i++) a.game.command({ type: 'train', team: 0, unitId: 'redcap', lane: i % 3 }); setTimeout(() => { const w = a.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); }, 9000); setTimeout(() => { const t = [...document.querySelectorAll('.ctab')].find((b) => b.textContent === 'Legend'); t && t.click(); }, 12500); })()`, after: 13000 },
  { name: 'power-focus', query: 'play=adept&seed=4&theme=1', w: 1600, h: 900, wait: 5000, script: `(() => { const a = window.__mythwar; const w = a.game.world; const D = window.__mythwarData.UNITS; w.players[0].age = 1; w.players[0].powerCooldown = 0; for (let i = 0; i < 4; i++) w.spawnUnit(1, 1, D.minotaur, 520 + i * 30); a.hud.tryPower(1); })()`, after: 160 },
  { name: 'focus-still', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 3000, script: `(() => { const a = window.__mythwar; a.game.paused = true; a.renderer.focusLane = 1; a.renderer.focusT = 1; })()`, after: 300 },
  { name: 'power-prime', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 4500, script: `(() => { const a = window.__mythwar; const w = a.game.world; const D = window.__mythwarData.UNITS; w.players[0].powerCooldown = 0; for (let i = 0; i < 5; i++) w.spawnUnit(1, 2, D.redcap, 560 + i * 20); })()`, after: 400 },
  ...[2, 3, 4].map((age) => ({ name: `traveller-age${age}`, query: `play=adept&seed=4&theme=${age}`, w: 1600, h: 900, wait: 2500, script: `(() => { const r = window.__mythwar.renderer; r.traveller.next = r.time - 6; r.traveller.y = 0.6; })()`, after: 200 })),
  { name: 'card-tooltip', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 3000, script: `(() => { const a = window.__mythwar; const c = document.querySelector('.card.cls-guardian'); a.hud.showTooltip(window.__mythwarData.UNITS.treant, c); })()`, after: 300 },
  { name: 'riddles', query: 'screen=difficulty', w: 1600, h: 900, wait: 1500, script: `window.__mythwar.menus.show('riddles')`, after: 500 },
  { name: 'mobile-riddles', query: 'screen=difficulty', w: 844, h: 390, mobile: true, dpr: 2, wait: 1500, script: `window.__mythwar.menus.show('riddles')`, after: 500 },
  { name: 'riddle-start', query: 'screen=difficulty', w: 1600, h: 900, wait: 1500, script: `window.__mythwar.playRiddle('pack')`, after: 1500 },
  // Each gate trains its own: three lanes' creatures training at once (progress on three chips).
  {
    name: 'queue-parallel',
    query: 'play=adept&seed=4',
    w: 1600,
    h: 900,
    wait: 3000,
    script: `(() => { const g = window.__mythwar.game; g.world.players[0].gold = 1e4; for (const [u, l] of [['redcap', 0], ['redcap', 0], ['treant', 1], ['pixie', 2]]) g.command({ type: 'train', team: 0, unitId: u, lane: l }); })()`,
    after: 700,
  },
  // Lens #79: a first meeting with Odin — the chapter that names Mímir, then his line about him.
  { name: 'meet-odin', query: 'play=master&seed=4', w: 1600, h: 900, wait: 1200 },
  { name: 'meet-odin-line', query: 'play=master&seed=4', w: 1600, h: 900, wait: 4200 },
  // Lens #81: veterans — the gold chevron, and one rising (flare + word) at the moment of the shot.
  {
    name: 'veterans',
    query: 'sandbox&seed=3&theme=2',
    w: 1600,
    h: 900,
    wait: 1500,
    script: `(() => { const a = window.__mythwar; const w = a.game.world; const U = window.__mythwarData.UNITS; const us = [['jotunn', 0, 330], ['fenrir', 0, 400], ['valkyrie', 0, 250], ['fenrir', 1, 640]].map(([id, team, x]) => { const u = w.spawnUnit(team, 1, U[id], x); u.def = { ...u.def, speed: 0, damage: 0 }; return u; }); us[0].veteran = us[3].veteran = true; us[0].hp *= 0.6; setTimeout(() => { us[1].veteran = true; w.emit({ type: 'veteran', unitId: us[1].id, team: 0, lane: 1, x: us[1].x, defId: 'fenrir' }); }, 1500); })()`,
    after: 1900,
  },
  // Lens #82: the longest general's line (Hippolyta at Ragnarök) in its bubble, desktop and phone.
  { name: 'taunt-ragnarok', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 5000, script: `window.__mythwar.taunt('ragnarok', true)`, after: 400 },
  { name: 'mobile-taunt-ragnarok', query: 'play=adept&seed=4', w: 844, h: 390, mobile: true, dpr: 2, wait: 5000, script: `window.__mythwar.taunt('ragnarok', true)`, after: 400 },
  // Lens #83: footfalls — guardians and runners kick up the lane (Olympus sand, Asgard snow).
  { name: 'footfalls-age1', query: 'sandbox&seed=3&theme=1', w: 1600, h: 900, wait: 1500, script: `(() => { const w = window.__mythwar.game.world; const U = window.__mythwarData.UNITS; for (let i = 0; i < 3; i++) ['minotaur', 'centaur'].forEach((id, k) => w.spawnUnit(0, i, U[id], 120 + k * 50)); })()`, after: 3000 },
  { name: 'footfalls-age2', query: 'sandbox&seed=3&theme=2', w: 1600, h: 900, wait: 1500, script: `(() => { const w = window.__mythwar.game.world; const U = window.__mythwarData.UNITS; for (let i = 0; i < 3; i++) ['jotunn', 'fenrir'].forEach((id, k) => w.spawnUnit(0, i, U[id], 120 + k * 50)); })()`, after: 3000 },
  // Lens #77: creatures frozen mid-gesture after a kill (roar, hop, twirl, rear, loom; both sides).
  {
    name: 'temper-gestures',
    query: 'sandbox&seed=3&theme=3',
    w: 1600,
    h: 900,
    wait: 1500,
    script: `(() => { const a = window.__mythwar; const w = a.game.world; const U = window.__mythwarData.UNITS; [['oni', 0, 260], ['redcap', 0, 330], ['kitsune', 0, 400], ['centaur', 1, 640], ['treant', 1, 700], ['valkyrie', 1, 760]].forEach(([id, team, x]) => { const u = w.spawnUnit(team, 1, U[id], x); u.def = { ...u.def, speed: 0, damage: 0 }; }); setTimeout(() => { a.game.paused = true; for (const v of a.renderer.vis.values()) v.gest = 0.55; }, 1500); })()`,
    after: 2200,
  },
];

/** Machado, Oliveira & Fernandes (2009) simulation matrices, severity 1 (linear RGB). */
const CVD: Record<string, string> = {
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
};

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    for (const sc of SCENARIOS) console.log(`${sc.name.padEnd(22)} ${sc.w}x${sc.h}${sc.mobile ? ' mobile' : ''}  ?${sc.query}`);
    return;
  }
  const filter = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const qIdx = args.indexOf('--query');
  const wIdx = args.indexOf('--wait');
  const extraQuery = qIdx >= 0 ? args[qIdx + 1] : '';
  const extraWait = wIdx >= 0 ? Number(args[wIdx + 1]) : 0;
  const sIdx = args.indexOf('--size');
  const size = sIdx >= 0 ? /^(\d+)x(\d+)$/.exec(args[sIdx + 1] ?? '') : null;
  if (sIdx >= 0 && !size) throw new Error('--size expects WIDTHxHEIGHT, e.g. 667x375');
  const cIdx = args.indexOf('--cvd');
  const cvd = cIdx >= 0 ? args[cIdx + 1] : '';
  if (cvd && !CVD[cvd]) throw new Error(`--cvd expects one of ${Object.keys(CVD).join(', ')}`);
  const stIdx = args.indexOf('--settings');
  const stored = stIdx >= 0 ? JSON.stringify(JSON.parse(args[stIdx + 1])) : '';
  const root = resolve('dist');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = join(root, decodeURIComponent(url.pathname));
    if (url.pathname === '/' || !extname(path)) path = join(root, 'index.html');
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  await mkdir('screenshots', { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox'] });
  try {
    const list = SCENARIOS.filter((s) => !filter || s.name.includes(filter));
    for (const sc of list) {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
      const w = size ? Number(size[1]) : sc.w;
      const hgt = size ? Number(size[2]) : sc.h;
      const name = (size ? `${sc.name}-${w}x${hgt}` : sc.name) + (cvd ? `-${cvd}` : '');
      await page.setViewport({ width: w, height: hgt, deviceScaleFactor: sc.dpr ?? 1, isMobile: !!sc.mobile, hasTouch: !!sc.mobile });
      if (stored) await page.evaluateOnNewDocument((s: string) => localStorage.setItem('mythwar.settings.v1', s), stored);
      const q = [sc.query, extraQuery].filter(Boolean).join('&');
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, (sc.wait ?? 1500) + extraWait));
      if (sc.script) {
        await page.evaluate(sc.script);
        await new Promise((r) => setTimeout(r, sc.after ?? 0));
      }
      const fps = await page.evaluate(() => (window as unknown as { __fps?: number }).__fps ?? -1);
      // Demo seeds play out differently whenever the sim or AI changes: flag scenarios that meant
      // to show a live battle but caught one that is already decided.
      const decided = await page.evaluate(() => {
        const g = (window as unknown as { __mythwar?: { game?: { world: { winner: number | null } } } }).__mythwar?.game;
        return !!g && g.world.winner !== null;
      });
      if (decided && sc.query.includes('demo')) errors.push('warning: the demo battle is already over — pick another seed/ff');
      if (cvd) {
        await page.evaluate((matrix: string) => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('style', 'position:absolute;width:0;height:0');
          svg.innerHTML = `<filter id="__cvd" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${matrix}"/></filter>`;
          document.body.appendChild(svg);
          document.documentElement.style.filter = 'url(#__cvd)';
        }, CVD[cvd]);
        await new Promise((r) => setTimeout(r, 150));
      }
      await page.screenshot({ path: `screenshots/${name}.png` });
      console.log(`${name}: ${Date.now() - t0}ms fps=${fps}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  await writeFile('screenshots/.last', new Date().toISOString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
