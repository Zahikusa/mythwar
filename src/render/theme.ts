import type { Team } from '../sim/types.ts';

export interface Theme {
  id: string;
  sky: string[]; // top → horizon gradient stops
  glow: string; // sun / moon glow colour near the horizon
  sunX: number; // 0..1 across the screen
  stars: number; // 0..1 star density
  mountains: [string, string, string]; // far → near silhouettes
  snowcaps: boolean;
  ground: [string, string]; // horizon → foreground
  lane: string;
  laneEdge: string;
  laneDetail: string;
  foliage: string[];
  ambient: 'fireflies' | 'motes' | 'snow' | 'petals' | 'stardust';
  ambientColor: string;
  aurora: boolean;
  fog: string;
}

export const THEMES: Theme[] = [
  {
    id: 'fae',
    sky: ['#0d1230', '#1f2f5e', '#3f6f86', '#9cc6a4', '#f2d98f'],
    glow: 'rgba(255, 230, 160, 0.55)',
    sunX: 0.68,
    stars: 0.7,
    mountains: ['#2c4f5f', '#1f3d45', '#16302f'],
    snowcaps: false,
    ground: ['#4f7a4a', '#1d3324'],
    lane: '#8d7b55',
    laneEdge: '#5e5236',
    laneDetail: '#a8966a',
    foliage: ['#2f5a36', '#3e7444', '#6aa05a'],
    ambient: 'fireflies',
    ambientColor: '#f6ff9e',
    aurora: false,
    fog: 'rgba(180, 230, 210, 0.10)',
  },
  {
    id: 'olympus',
    sky: ['#25418a', '#4f7fc4', '#8fbbe6', '#f3dcb0', '#ffe9c4'],
    glow: 'rgba(255, 236, 190, 0.6)',
    sunX: 0.3,
    stars: 0,
    mountains: ['#8d9bd0', '#6c7cb5', '#4d5b8e'],
    snowcaps: false,
    ground: ['#c9b679', '#7c6a3c'],
    lane: '#e9dfc8',
    laneEdge: '#b5a684',
    laneDetail: '#fff6e2',
    foliage: ['#7f8f3f', '#9aab4f', '#5f6e2c'],
    ambient: 'motes',
    ambientColor: '#fff3c8',
    aurora: false,
    fog: 'rgba(255, 245, 220, 0.12)',
  },
  {
    id: 'asgard',
    sky: ['#040816', '#0c1d3d', '#173d61', '#2f6e88', '#8fc7d3'],
    glow: 'rgba(170, 230, 255, 0.4)',
    sunX: 0.75,
    stars: 1,
    mountains: ['#36557a', '#253f60', '#182c45'],
    snowcaps: true,
    ground: ['#d9e6f0', '#8aa1b8'],
    lane: '#7f92a8',
    laneEdge: '#5d6f86',
    laneDetail: '#a9bccf',
    foliage: ['#2d4a4f', '#3c5d63', '#e8f2f8'],
    ambient: 'snow',
    ambientColor: '#ffffff',
    aurora: true,
    fog: 'rgba(210, 235, 255, 0.12)',
  },
  {
    id: 'jade',
    sky: ['#2e2448', '#6b4a78', '#c46f86', '#f2a98f', '#fbe0b6'],
    glow: 'rgba(255, 205, 170, 0.6)',
    sunX: 0.5,
    stars: 0.15,
    mountains: ['#9a7aa0', '#76607f', '#4f4560'],
    snowcaps: false,
    ground: ['#7e9a62', '#34492f'],
    lane: '#c7aa7c',
    laneEdge: '#94784f',
    laneDetail: '#e2c999',
    foliage: ['#4b6b3e', '#f3a6c0', '#ffd0de'],
    ambient: 'petals',
    ambientColor: '#ffc2d6',
    aurora: false,
    fog: 'rgba(255, 220, 230, 0.14)',
  },
  {
    id: 'celestial',
    sky: ['#070318', '#1d0d4a', '#4a2a8a', '#a46cc8', '#ffd38a'],
    glow: 'rgba(255, 215, 140, 0.65)',
    sunX: 0.5,
    stars: 1,
    mountains: ['#6f58b8', '#4c3a8f', '#2f2466'],
    snowcaps: false,
    ground: ['#d9c9ff', '#7d68c4'],
    lane: '#f1d78f',
    laneEdge: '#c3a35a',
    laneDetail: '#fff1c2',
    foliage: ['#b9a6f5', '#fff3c4', '#8e78de'],
    ambient: 'stardust',
    ambientColor: '#fff2b8',
    aurora: false,
    fog: 'rgba(240, 225, 255, 0.14)',
  },
];

export interface TeamColors {
  main: string;
  light: string;
  dark: string;
  glow: string;
  rgb: [number, number, number];
}

const FOE_RED: TeamColors = { main: '#ff4f6d', light: '#ffb0bd', dark: '#9e1a33', glow: 'rgba(255, 79, 109, 0.55)', rgb: [255, 79, 109] };
/** The colour-blind friendly foe: blue vs orange stays apart for protan-, deutan- and tritanopes. */
const FOE_ORANGE: TeamColors = { main: '#ff9520', light: '#ffd08a', dark: '#a35400', glow: 'rgba(255, 149, 32, 0.55)', rgb: [255, 149, 32] };

/** Blue is always the local player's colour, red (or orange) the opponent's (DOM portraits use this directly). */
export const TEAM_PALETTE: readonly [TeamColors, TeamColors] = [
  { main: '#3fb8ff', light: '#a8e4ff', dark: '#1a5f9e', glow: 'rgba(63, 184, 255, 0.55)', rgb: [63, 184, 255] },
  { ...FOE_RED },
];

/** Switches the foe between red and the colour-blind friendly orange. True if it changed. */
export function setFoePalette(colorblind: boolean): boolean {
  const next = colorblind ? FOE_ORANGE : FOE_RED;
  if (TEAM_PALETTE[1].main === next.main) return false;
  Object.assign(TEAM_PALETTE[1], next);
  return true;
}

/** Colours by team as drawn on the battlefield (swapped when the local player is team 1). */
export const TEAM_COLORS: Record<Team, TeamColors> = { 0: TEAM_PALETTE[0], 1: TEAM_PALETTE[1] };

/** Makes `team` blue. Returns true if the colours changed (cached art must be redrawn). */
export function setColorPerspective(team: Team): boolean {
  const mine = TEAM_PALETTE[0];
  if (TEAM_COLORS[team] === mine) return false;
  TEAM_COLORS[team] = mine;
  TEAM_COLORS[team === 0 ? 1 : 0] = TEAM_PALETTE[1];
  return true;
}

/** Lighten (+) or darken (-) a #rrggbb colour by `amt` (-1..1). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = ((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t;
  const g = ((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t;
  const bl = (na & 255) * (1 - t) + (nb & 255) * t;
  return '#' + ((1 << 24) | ((r | 0) << 16) | ((g | 0) << 8) | (bl | 0)).toString(16).slice(1);
}
