/**
 * Builds the ready-to-run "Mythwar Server" package for a host computer — the game plus the
 * multiplayer server in one folder, no npm install or build needed (only Node.js 20+):
 *
 *   npm run package        → release/mythwar-server/ and release/mythwar-server-v<version>.zip
 *
 * The folder holds server.mjs (server/main.ts bundled with all its dependencies), game/ (the
 * normal LAN build, not the GitHub Pages one), double-click starters for Windows and macOS, a
 * start.sh for Linux and a short README. The GitHub release workflow uploads the zip.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { build } from 'vite';

const project = resolve(import.meta.dirname, '..');
const version = (JSON.parse(readFileSync(join(project, 'package.json'), 'utf-8')) as { version: string }).version;
const out = join(project, 'release');
const name = 'mythwar-server';
const dir = join(out, name);

rmSync(out, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// The game: the normal build (its multiplayer lobby talks to the server it is served from).
await build({ root: project, mode: 'production', logLevel: 'warn', build: { outDir: join(dir, 'game'), emptyOutDir: true } });

// The server: one file with ws, the simulation and everything else it imports.
await build({
  root: project,
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: join(project, 'server/main.ts'),
    outDir: join(out, '.server'),
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rolldownOptions: { output: { entryFileNames: 'server.mjs', format: 'es', codeSplitting: false } },
  },
  ssr: { noExternal: true, target: 'node' },
});
cpSync(join(out, '.server', 'server.mjs'), join(dir, 'server.mjs'));
rmSync(join(out, '.server'), { recursive: true, force: true });

const sh = (lines: string[]) => lines.join('\n') + '\n';
const shStart = sh([
  '#!/bin/sh',
  '# Mythwar Server: serves the game and hosts multiplayer battles for every device in this Wi-Fi.',
  'cd "$(dirname "$0")" || exit 1',
  'if ! command -v node >/dev/null 2>&1; then',
  '  echo "Mythwar Server needs Node.js 20 or newer (free): install the LTS version from https://nodejs.org/ and start this again."',
  '  exit 1',
  'fi',
  'node server.mjs "$@"',
]);

writeFileSync(
  join(dir, 'Start Mythwar Server.cmd'),
  [
    '@echo off',
    'rem Mythwar Server: serves the game and hosts multiplayer battles for every device in this Wi-Fi.',
    'title Mythwar Server',
    'cd /d "%~dp0"',
    'where node >nul 2>nul',
    'if errorlevel 1 goto nonode',
    `node -e "process.exit(+process.versions.node.split('.')[0] < 20 ? 1 : 0)"`,
    'if errorlevel 1 goto oldnode',
    'node server.mjs %*',
    'echo.',
    'pause',
    'exit /b',
    '',
    ':oldnode',
    'echo Mythwar Server needs Node.js 20 or newer - this computer has an older version.',
    'goto install',
    '',
    ':nonode',
    'echo Mythwar Server needs Node.js - free, from nodejs.org - and it is not installed yet.',
    '',
    ':install',
    'echo.',
    'where winget >nul 2>nul',
    'if errorlevel 1 goto manual',
    'choice /c YN /m "Install Node.js LTS now"',
    'if errorlevel 2 goto manual',
    'winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements',
    'echo.',
    'echo Done. Close this window and double-click "Start Mythwar Server" again.',
    'pause',
    'exit /b',
    '',
    ':manual',
    'echo Opening nodejs.org: install the LTS version, then double-click "Start Mythwar Server" again.',
    'start "" https://nodejs.org/',
    'pause',
    '',
  ].join('\r\n'),
);
writeFileSync(join(dir, 'Start Mythwar Server.command'), shStart);
writeFileSync(join(dir, 'start.sh'), shStart);
writeFileSync(
  join(dir, 'README.txt'),
  [
    `MYTHWAR SERVER  v${version}`,
    '',
    'Plays Mythwar: Ages of Legend on every phone, tablet and computer in your Wi-Fi',
    'and hosts the multiplayer battles. Needs Node.js 20 or newer (free, https://nodejs.org/).',
    '',
    'START',
    '  Windows  Double-click "Start Mythwar Server" (it offers to install Node.js if missing).',
    '           If Windows warns about the file: "More info" -> "Run anyway" (or "Run").',
    '           When the firewall asks about Node.js: allow PRIVATE networks.',
    '  macOS    Right-click "Start Mythwar Server.command" -> Open (double-click from then on).',
    '  Linux    sh start.sh',
    '',
    'PLAY',
    '  The window shows an address and a QR code. Scan the QR code with each phone, or open the',
    '  address in any browser in the same Wi-Fi. Then: Multiplayer -> Host a battle, and your',
    '  friend joins with the room code (or the QR code in the battle room).',
    '  Closing the window stops the server. Who won how many battles (the lobby\'s "Champions of',
    '  this network") is kept in mythwar-data.json next to server.mjs: delete it to start afresh.',
    '',
    'MORE',
    '  node server.mjs --help                  options (port, https certificate, ...)',
    '  https://zahikusa.github.io/mythwar/     play single player in any browser, no server needed',
    '  https://github.com/Zahikusa/mythwar     source, help and troubleshooting (docs/MULTIPLAYER.md)',
    '',
  ].join('\r\n'),
);

// ---------------------------------------------------------------------------
// Zip (deflate, UTF-8 names, unix modes so the macOS / Linux starters stay executable)

function files(base: string): string[] {
  return readdirSync(base, { recursive: true, encoding: 'utf-8' })
    .map((f) => join(base, f))
    .filter((f) => statSync(f).isFile())
    .sort();
}

function zip(entries: { name: string; data: Buffer; mode: number }[]): Buffer {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf-8');
    const packed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 30, 4); // made by: unix (file modes below), zip 3.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(((0o100000 | e.mode) << 16) >>> 0, 38); // regular file + permissions
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + packed.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const executable = new Set(['Start Mythwar Server.command', 'start.sh']);
const entries = files(dir).map((f) => {
  const rel = relative(dir, f).split('\\').join('/');
  return { name: `${name}/${rel}`, data: readFileSync(f), mode: executable.has(rel) ? 0o755 : 0o644 };
});
const zipFile = join(out, `${name}-v${version}.zip`);
writeFileSync(zipFile, zip(entries));

const kb = (n: number) => `${Math.round(n / 1024)} kB`;
console.log(`\n  ${relative(project, dir)}/  (${entries.length} files)`);
console.log(`  ${relative(project, zipFile)}  ${kb(statSync(zipFile).size)}\n`);
