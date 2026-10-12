/** Inline SVG icons (24x24, currentColor). */
const svg = (body: string, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  gold: svg(
    '<circle cx="12" cy="12" r="9" fill="#f6c453" stroke="#7a4b12" stroke-width="1.6"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#c98a22" stroke-width="1.4"/><path d="M10.6 9.2h2.8M12 8v8" stroke="#7a4b12" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  xp: svg('<path d="M12 2.5l2.7 6.2 6.8.6-5.2 4.5 1.6 6.6L12 16.9 6.1 20.4l1.6-6.6L2.5 9.3l6.8-.6z" fill="#b7a4ff" stroke="#3b2a78" stroke-width="1.4" stroke-linejoin="round"/>'),
  heart: svg('<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.6a4.3 4.3 0 017.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="currentColor"/>'),
  shield: svg('<path d="M12 2.8l7.5 2.8v5.6c0 4.7-3.2 8.4-7.5 10-4.3-1.6-7.5-5.3-7.5-10V5.6z" fill="currentColor" stroke="#1b1229" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 6v12" stroke="#1b1229" stroke-width="1.2" opacity=".45"/>'),
  fang: svg('<path d="M4 4c3 1 5 4 5.5 9L11 20l1.5-7c.5-5 2.5-8 5.5-9-1 3-1 6 0 9l-2 7.5L12 21l-4-1.5-2-7.5c1-3 1-6-2-8z" fill="currentColor" stroke="#1b1229" stroke-width="1.4" stroke-linejoin="round"/>'),
  orb: svg('<circle cx="12" cy="11" r="7" fill="currentColor" stroke="#1b1229" stroke-width="1.5"/><circle cx="9.5" cy="8.5" r="2.2" fill="#fff" opacity=".7"/><path d="M7 20h10" stroke="#1b1229" stroke-width="2" stroke-linecap="round"/>'),
  crown: svg('<path d="M3.5 18l-1-11 5 4 4.5-7 4.5 7 5-4-1 11z" fill="currentColor" stroke="#1b1229" stroke-width="1.5" stroke-linejoin="round"/>'),
  tower: svg(
    '<path d="M6 21V9h12v12zM5 9V4h3v2h2.5V4h3v2H16V4h3v5" fill="currentColor" stroke="#1b1229" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 21v-4a2 2 0 014 0v4" fill="#1b1229"/>',
  ),
  bless: svg('<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor" stroke="#1b1229" stroke-width="1.3" stroke-linejoin="round"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor"/>'),
  ascend: svg('<path d="M12 3l7 8h-4.5v9h-5v-9H5z" fill="currentColor" stroke="#1b1229" stroke-width="1.5" stroke-linejoin="round"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  fast: svg('<path d="M3 5v14l9-7zM12 5v14l9-7z" fill="currentColor"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  swords: svg(
    '<path d="M4 4l9 9M20 4l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6.5 15.5l2 2M17.5 15.5l-2 2M3.5 18.5l3 3M20.5 18.5l-3 3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  ),
  versus: svg(
    '<circle cx="7.5" cy="7.5" r="3.2" fill="currentColor"/><circle cx="16.5" cy="7.5" r="3.2" fill="currentColor"/><path d="M2 19.5c0-3.4 2.5-5.6 5.5-5.6s5.5 2.2 5.5 5.6zM11 19.5c0-3.4 2.5-5.6 5.5-5.6s5.5 2.2 5.5 5.6z" fill="currentColor" opacity=".85"/>',
  ),
  chat: svg('<path d="M4 5.5h16a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-9l-4.5 3.5v-3.5H4A1.5 1.5 0 012.5 16V7A1.5 1.5 0 014 5.5z" fill="currentColor"/>'),
  wifi: svg(
    '<path d="M2.5 9a14 14 0 0119 0M5.5 12.3a9.5 9.5 0 0113 0M8.6 15.5a5 5 0 016.8 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/>',
  ),
  shrine: svg('<path d="M12 2l3 5-3 5-3-5z" fill="currentColor"/><path d="M8 22l1.5-8h5L16 22z" fill="currentColor" opacity=".7"/>'),
  skull: svg('<path d="M12 3a8 8 0 00-8 8c0 2.6 1.3 4.4 3 5.5V20h10v-3.5c1.7-1.1 3-2.9 3-5.5a8 8 0 00-8-8z" fill="currentColor"/><circle cx="9" cy="11.5" r="2" fill="#1b1229"/><circle cx="15" cy="11.5" r="2" fill="#1b1229"/>'),
  info: svg('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10.5v6M12 7.2v.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  book: svg('<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.5v13" stroke="currentColor" stroke-width="2"/>'),
  sell: svg('<path d="M4 12h16M12 4v16" stroke="currentColor" stroke-width="0"/><path d="M5 7h14l-1.5 13h-11z" fill="currentColor" stroke="#1b1229" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 7V5h6v2" stroke="#1b1229" stroke-width="1.6" fill="none"/>'),
};

/** God power icons per power id. */
export const POWER_ICONS: Record<string, string> = {
  briar: svg(
    '<path d="M5 21c3-6 2-10 7-14M12 7c2-2 5-3 7-3-1 3-3 5-6 6" stroke="#9fe07a" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M7.5 15l-3-1M9 11l3 .5M10.5 8.5L8 6" stroke="#e8d79a" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  zeus: svg('<path d="M13.5 2L5 13.5h5.5L9 22l9.5-12.5H13z" fill="#fff3a6" stroke="#5b4a12" stroke-width="1.3" stroke-linejoin="round"/>'),
  fimbul: svg(
    '<g stroke="#d8f3ff" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4L12 6.5 14.5 4M9.5 20L12 17.5l2.5 2.5M4 10.5l3.4.8-1 3.4M20 13.5l-3.4-.8 1-3.4"/></g>',
  ),
  spiritdragon: svg(
    '<path d="M3 16c3-6 7 2 10-3s4-8 8-7c-2 1-2.5 3-2 5-3 0-4 4-7 6s-6 1-9-1z" fill="#8effd4" stroke="#1b4a3c" stroke-width="1.3" stroke-linejoin="round"/><circle cx="18.5" cy="7.3" r="1" fill="#1b4a3c"/>',
  ),
  starfall: svg(
    '<path d="M15 3l1.4 3.6 3.8.3-2.9 2.5.9 3.7-3.2-2-3.2 2 .9-3.7-2.9-2.5 3.8-.3z" fill="#ffe7a3" stroke="#7a5212" stroke-width="1.1" stroke-linejoin="round"/><path d="M10 11l-6 9M13 14l-4 6M7 9l-4 5" stroke="#ffb35a" stroke-width="2" stroke-linecap="round"/>',
  ),
};

export const CLASS_ICON: Record<string, string> = {
  guardian: ICONS.shield,
  hunter: ICONS.fang,
  mystic: ICONS.orb,
  legend: ICONS.crown,
};

export const CLASS_COLOR: Record<string, string> = {
  guardian: '#f2b84b',
  hunter: '#7ed957',
  mystic: '#b48cff',
  legend: '#ff8a3d',
};

export const CLASS_NAME: Record<string, string> = {
  guardian: 'Guardian',
  hunter: 'Hunter',
  mystic: 'Mystic',
  legend: 'Legend',
};
