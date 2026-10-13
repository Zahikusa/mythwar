import { describe, expect, it } from 'vitest';
import type { RoomInfo, SeatInfo } from '../src/net/protocol.ts';
import { allyNews, emoteRoute, lostSessionPlan, roomNews, roomTerms, roomView, termsChange } from '../src/ui/roomnews.ts';
import type { RoomView } from '../src/ui/roomnews.ts';

const seat = (name: string, over: Partial<SeatInfo> = {}): SeatInfo => ({ name, connected: true, ready: false, away: false, wins: 0, ping: 0, trials: [], rank: 0, sigil: -1, ...over });
const room = (seats: RoomInfo['seats'], coop: RoomInfo['coop'] = null): RoomInfo => ({ code: 'ABCD', phase: 'waiting', seats, coop, rev: 1 });
const view = (foe: RoomView['foe'], meReady = false, coop: RoomView['coop'] = null): RoomView => ({ foe, meReady, coop });
const bo = (over: Partial<NonNullable<RoomView['foe']>> = {}) => ({ name: 'Bo', ready: false, trials: [], ...over });

describe('roomView', () => {
  it('reads the other seat and our own Ready from either side', () => {
    const r = room([seat('Ada', { ready: true }), seat('Bo', { trials: ['glass'] })], 'adept');
    expect(roomView(r, 0)).toEqual({ foe: { name: 'Bo', ready: false, trials: ['glass'], away: false, connected: true }, meReady: true, coop: 'adept' });
    expect(roomView(r, 1)).toEqual({ foe: { name: 'Ada', ready: true, trials: [], away: false, connected: true }, meReady: false, coop: 'adept' });
    // (A lost connection counts as away.)
    expect(roomView(room([seat('Ada'), seat('Bo', { connected: false })]), 0).foe).toMatchObject({ away: true, connected: false });
    expect(roomView(room([seat('Ada'), null]), 0).foe).toBeNull();
    expect(roomView(r, null)).toEqual({ foe: null, meReady: false, coop: 'adept' });
  });

  it('copies the trials (a later change to the room must not alter what was seen)', () => {
    const r = room([seat('Ada'), seat('Bo')]);
    const v = roomView(r, 0);
    r.seats[1]!.trials.push('glass');
    expect(v.foe!.trials).toEqual([]);
  });
});

describe('roomNews', () => {
  it('chimes when someone sits down, gets ready or leaves', () => {
    expect(roomNews(view(null), view(bo()), false).chime).toBe('ready');
    expect(roomNews(null, view(bo()), false).chime).toBe('ready'); // joining a room with someone in it
    expect(roomNews(view(bo()), view(bo({ ready: true })), false).chime).toBe('bless');
    expect(roomNews(view(bo()), view(null), false)).toEqual({ chime: 'cancel', said: 'Bo left the room.' });
    expect(roomNews(view(bo()), view(bo()), false)).toEqual({ chime: null, said: '' });
  });

  it('tells a handicap change — "press Ready again" only to a player who was Ready (backlog 142)', () => {
    expect(roomNews(view(bo(), true), view(bo({ trials: ['glass', 'godless'] })), false).said).toBe('Bo now fights under Glass Citadel, Godless — press Ready again.');
    expect(roomNews(view(bo(), false), view(bo({ trials: ['glass'] })), false).said).toBe('Bo now fights under Glass Citadel.');
    expect(roomNews(view(bo({ trials: ['glass'] }), true), view(bo()), false).said).toBe('Bo dropped their handicaps — press Ready again.');
    // A different player in the seat isn't "a change of handicap".
    expect(roomNews(view(bo()), view({ name: 'Cy', ready: false, trials: ['glass'] }), false).said).toBe('');
  });

  it("tells the other player's change of mode, not our own", () => {
    expect(roomNews(view(bo()), view(bo(), false, 'master'), false).said).toBe('Bo switched to co-op against the Master AI — the score starts over.');
    expect(roomNews(view(bo(), false, 'master'), view(bo()), false).said).toBe('Bo switched to a duel — the score starts over.');
    expect(roomNews(view(bo()), view(bo(), false, 'master'), true).said).toBe('');
    // Arriving in a co-op room is no change.
    expect(roomNews(null, view(bo(), false, 'master'), false).said).toBe('');
  });
});

describe('lostSessionPlan (the server no longer seats us)', () => {
  it('a seat lost while locked in the room (or on its lobby) is taken again (backlog 160)', () => {
    expect(lostSessionPlan('expired', 'title', 'room', false, 'ABCD')).toMatchObject({ toLobby: false, rejoin: true });
    expect(lostSessionPlan('expired', 'title', 'mp', false, 'ABCD')).toMatchObject({ toLobby: false, rejoin: true });
    expect(lostSessionPlan('expired', 'title', 'room', false, 'ABCD').note).toMatch(/joining the room again/);
    // (Not from elsewhere — the title, settings — and not without a room to go back to.)
    expect(lostSessionPlan('expired', 'title', 'settings', false, 'ABCD').rejoin).toBe(false);
    expect(lostSessionPlan('expired', 'title', 'room', false, null)).toMatchObject({ rejoin: false, note: 'You were away too long and lost your seat in the room.' });
  });

  it('mid-battle an expired seat waits for the replayed ending; on the results it goes back to the room', () => {
    expect(lostSessionPlan('expired', 'playing', 'none', true, 'ABCD')).toMatchObject({ toLobby: false, rejoin: false });
    expect(lostSessionPlan('expired', 'over', 'over', true, 'ABCD')).toMatchObject({ toLobby: true, rejoin: true });
  });

  it('a restart or a fault ends the battle at once and rejoins nothing', () => {
    for (const lost of ['restart', 'fault'] as const) {
      expect(lostSessionPlan(lost, 'playing', 'none', true, 'ABCD')).toMatchObject({ toLobby: true, rejoin: false });
      expect(lostSessionPlan(lost, 'title', 'room', false, 'ABCD')).toMatchObject({ toLobby: false, rejoin: false });
    }
    expect(lostSessionPlan('fault', 'playing', 'none', true, 'ABCD').note).toMatch(/fault/);
    expect(lostSessionPlan('restart', 'title', 'room', false, 'ABCD').note).toMatch(/restarted/);
  });
});

describe("emoteRoute (where the other player's quick message shows)", () => {
  const base = { mine: false, state: 'playing' as const, menu: 'none', enabled: true, speaker: 'Bo', ally: null, phrase: 'Good luck!' };

  it('in a duel: a bubble by their citadel, just the words', () => {
    expect(emoteRoute(base)).toEqual({ to: 'bubble', text: 'Good luck!', sound: 'select' });
  });

  it('under a menu or on the results: a line with their name (bubbles hide there — backlog 3, 125)', () => {
    expect(emoteRoute({ ...base, menu: 'pause' })).toEqual({ to: 'menu', text: 'Bo: Good luck!', sound: 'select' });
    expect(emoteRoute({ ...base, state: 'over', menu: 'over', phrase: 'Well played!' })).toEqual({ to: 'results', text: 'Bo: Well played!', sound: 'select' });
  });

  it('in co-op: an ally’s call by our own side, with their name', () => {
    expect(emoteRoute({ ...base, ally: 'Cy', phrase: 'Help middle!' })).toEqual({ to: 'ally', text: 'Cy: Help middle!', sound: 'ready' });
  });

  it('not at all: our own echo, quick messages off, back at the title', () => {
    expect(emoteRoute({ ...base, mine: true })).toBeNull();
    expect(emoteRoute({ ...base, enabled: false })).toBeNull();
    expect(emoteRoute({ ...base, state: 'title', menu: 'room' })).toBeNull();
  });
});

describe('allyNews (co-op: what the ally just did — backlog 191)', () => {
  it('says the ally left, went away, came back; nothing otherwise', () => {
    expect(allyNews(view(bo()), view(null))).toBe('Bo left the battle — you fight on alone.');
    expect(allyNews(view(bo()), view(bo({ away: true })))).toMatch(/^Bo is away — you fight on/);
    expect(allyNews(view(bo({ away: true })), view(bo()))).toBe('Bo is back.');
    expect(allyNews(view(bo()), view(bo({ ready: true })))).toBe('');
    expect(allyNews(null, view(bo()))).toBe('');
  });
});

describe('termsChange (the rematch on the results would be a different battle — backlog 193)', () => {
  it('says a switch of mode, or the other player’s new handicap; nothing if the same', () => {
    const before = roomTerms(room([seat('Ada'), seat('Bo')], 'novice'));
    expect(termsChange(before, room([seat('Ada'), seat('Bo')], 'novice'), 0, 'Bo')).toBe('');
    expect(termsChange(before, room([seat('Ada'), seat('Bo')], null), 0, 'Bo')).toBe('as a duel');
    expect(termsChange(before, room([seat('Ada'), seat('Bo')], 'master'), 0, 'Bo')).toBe('together against the Master AI');
    expect(termsChange(before, room([seat('Ada'), seat('Bo', { trials: ['glass'] })], 'novice'), 0, 'Bo')).toBe('Bo under Glass Citadel');
    const handicapped = roomTerms(room([seat('Ada', { trials: ['godless'] }), seat('Bo')]));
    expect(termsChange(handicapped, room([seat('Ada'), seat('Bo')]), 1, 'Ada')).toBe('Ada without a handicap');
  });
});
