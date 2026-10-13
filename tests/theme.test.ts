import { describe, expect, it } from 'vitest';
import { TEAM_COLORS, TEAM_PALETTE, setColorPerspective, setFoePalette } from '../src/render/theme.ts';

describe('colour-blind friendly foe', () => {
  it('turns the foe orange and back, wherever the foe sits', () => {
    const red = TEAM_PALETTE[1].main;
    expect(setFoePalette(true)).toBe(true);
    expect(setFoePalette(true)).toBe(false);
    expect(TEAM_PALETTE[1].main).not.toBe(red);
    expect(TEAM_COLORS[1].main).toBe(TEAM_PALETTE[1].main);
    // Online as team 1: the foe is team 0 — it gets the same (orange) colours.
    setColorPerspective(1);
    expect(TEAM_COLORS[0].main).toBe(TEAM_PALETTE[1].main);
    setColorPerspective(0);
    expect(setFoePalette(false)).toBe(true);
    expect(TEAM_PALETTE[1].main).toBe(red);
    expect(TEAM_PALETTE[0].main).not.toBe(red);
  });
});
