/**
 * The Chrome the browser-driven scripts launch (smoke, mpsmoke, shoot, perfcheck, …): $CHROME if
 * set, else the usual install places of Chrome, Edge or Chromium on Windows, macOS and Linux.
 */
import { existsSync } from 'node:fs';

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

/** The browser's path, or undefined if none is found. */
export function findChrome(): string | undefined {
  const env = process.env.CHROME;
  if (env && existsSync(env)) return env;
  return CANDIDATES.find((p) => existsSync(p));
}

/** The browser's path; throws with a hint when there is none. */
export function chromePath(): string {
  const p = findChrome();
  if (!p) throw new Error('No Chrome, Edge or Chromium found — install one, or set CHROME=/path/to/chrome');
  return p;
}
