import { describe, expect, it } from 'vitest';
import { rematchView } from '../src/ui/menus.ts';

describe('the online results: rematch button and note', () => {
  it('offers, accepts and cancels a rematch', () => {
    expect(rematchView('Bo', false, false)).toEqual({ label: 'Rematch', note: '', back: false, hot: false });
    expect(rematchView('Bo', true, false)).toEqual({ label: 'Cancel rematch', note: 'Waiting for Bo…', back: false, hot: false });
    expect(rematchView('Bo', false, true)).toEqual({ label: 'Accept rematch', note: 'Bo wants a rematch!', back: false, hot: true });
  });

  it('says when the other player lost the connection, whatever else holds (backlog 88)', () => {
    for (const [mine, theirs] of [[false, false], [true, false], [false, true]] as const) {
      expect(rematchView('Bo', mine, theirs, false).note).toBe('Bo lost the connection — waiting for them to come back.');
    }
  });

  it('leads back to the room once the other player left', () => {
    expect(rematchView('Bo', false, null)).toEqual({ label: 'Back to room', note: 'Bo left the room.', back: true, hot: false });
    expect(rematchView('Bo', false, null, false).note).toBe('Bo left the room.');
  });

  it('says when the rematch on offer is a different battle (backlog 193)', () => {
    expect(rematchView('Bo', false, true, true, 'as a duel').note).toBe('Bo wants a rematch — as a duel!');
    expect(rematchView('Bo', false, false, true, 'Bo under Glass Citadel').note).toBe('Next battle: Bo under Glass Citadel.');
  });
});
