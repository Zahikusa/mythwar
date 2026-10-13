import { describe, expect, it } from 'vitest';
import type { RoomInfo, SeatInfo } from '../src/net/protocol.ts';
import { roomNews, roomView } from '../src/ui/roomnews.ts';
import type { RoomView } from '../src/ui/roomnews.ts';

const seat = (name: string, over: Partial<SeatInfo> = {}): SeatInfo => ({ name, connected: true, ready: false, away: false, wins: 0, ping: 0, trials: [], rank: 0, sigil: -1, ...over });
const room = (seats: RoomInfo['seats'], coop: RoomInfo['coop'] = null): RoomInfo => ({ code: 'ABCD', phase: 'waiting', seats, coop, rev: 1 });
const view = (foe: RoomView['foe'], meReady = false, coop: RoomView['coop'] = null): RoomView => ({ foe, meReady, coop });
const bo = (over: Partial<NonNullable<RoomView['foe']>> = {}) => ({ name: 'Bo', ready: false, trials: [], ...over });

describe('roomView', () => {
  it('reads the other seat and our own Ready from either side', () => {
    const r = room([seat('Ada', { ready: true }), seat('Bo', { trials: ['glass'] })], 'adept');
    expect(roomView(r, 0)).toEqual({ foe: { name: 'Bo', ready: false, trials: ['glass'] }, meReady: true, coop: 'adept' });
    expect(roomView(r, 1)).toEqual({ foe: { name: 'Ada', ready: true, trials: [] }, meReady: false, coop: 'adept' });
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
