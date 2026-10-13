/**
 * Before `npm run lan` / `npm run serve`: the server and the scripts are TypeScript that Node runs
 * directly (type stripping) — Node 22.18+ or 23.6+; older ones fail later with a cryptic
 * ERR_UNKNOWN_FILE_EXTENSION ".ts". Plain JavaScript, so it runs on any Node and says so plainly.
 * (The release package's server.mjs is plain JavaScript: Node 20+ is enough there.)
 */
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);
if (!ok) {
  console.error(`Mythwar's server runs on Node.js 24 or newer (22.18+ works too) — this is ${process.version}.`);
  console.error('Install the LTS version from https://nodejs.org/ (or: fnm / nvm install 24) and try again.');
  process.exit(1);
}
