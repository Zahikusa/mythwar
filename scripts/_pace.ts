import { playMatch } from './sim.ts';
const n = 30;
const ms = Array.from({ length: n }, (_, i) => playMatch('master', 'master', 2000 + i));
const s = ms.map((m) => m.time / 60).sort((a, b) => a - b);
console.log(process.argv[2], 'median', s[n / 2].toFixed(1), 'p25', s[Math.floor(n / 4)].toFixed(1), 'p75', s[Math.floor((3 * n) / 4)].toFixed(1), 'max', s[n - 1].toFixed(1), 'left', ms.filter((m) => m.winner === 0).length);
