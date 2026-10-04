import { describe, expect, it } from 'vitest';
import { artScaleOf, computeLayout, hudZoom, laneAt } from '../src/render/layout.ts';

describe('layout', () => {
  it('zooms the desktop HUD only above 1920x1080, in 0.05 steps, capped at 2', () => {
    expect(hudZoom(1600, 900, 'desktop')).toBe(1);
    expect(hudZoom(1920, 1080, 'desktop')).toBe(1);
    expect(hudZoom(2560, 1440, 'desktop')).toBe(1.35);
    expect(hudZoom(2560, 1080, 'desktop')).toBe(1); // ultrawide: height decides
    expect(hudZoom(3840, 2160, 'desktop')).toBe(2);
    expect(hudZoom(5120, 2880, 'desktop')).toBe(2);
    expect(hudZoom(2560, 1440, 'mobile')).toBe(1);
    for (const w of [1930, 2100, 2333, 2600]) {
      const z = hudZoom(w, 2000, 'desktop');
      expect(Math.round(z * 20)).toBeCloseTo(z * 20, 9);
    }
  });

  it('reserves a bottom inset that grows with the HUD zoom', () => {
    const fhd = computeLayout(1920, 1080, 'desktop');
    const qhd = computeLayout(2560, 1440, 'desktop');
    expect(Math.abs(qhd.insets.bottom - fhd.insets.bottom * qhd.hud)).toBeLessThanOrEqual(1);
    expect(qhd.field.h).toBe(1440 - qhd.insets.bottom);
  });

  it('never produces a degenerate field, even for a sliver of a window', () => {
    for (const [w, h, mode] of [
      [120, 300, 'mobile'],
      [1, 1, 'mobile'],
      [0, 0, 'desktop'],
    ] as const) {
      const L = computeLayout(w, h, mode);
      expect(L.field.w).toBeGreaterThan(0);
      expect(L.field.h).toBeGreaterThan(0);
      for (const g of L.lanes) {
        expect(g.x1).toBeGreaterThan(g.x0);
        expect(g.band).toBeGreaterThan(0);
        expect(artScaleOf(L, g)).toBeGreaterThan(0);
      }
    }
  });

  it('maps each lane feet line back to its lane', () => {
    const L = computeLayout(1600, 900, 'desktop');
    for (const g of L.lanes) expect(laneAt(L, (g.x0 + g.x1) / 2, g.y - 5)).toBe(g.index);
  });
});
