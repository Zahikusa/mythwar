import type { TeamColors } from '../theme.ts';

export interface Pose {
  /** Global animation clock in seconds. */
  t: number;
  /** Walk-cycle phase in radians, advanced by distance travelled (no foot sliding). */
  walk: number;
  moving: boolean;
  /** Attack animation progress 0..1, or -1 when not attacking. */
  attack: number;
  /** Fraction of the attack animation at which the blow lands / projectile is released. */
  hit: number;
  tc: TeamColors;
  /** Stable per-unit random value 0..1 (desynchronises idle animations). */
  seed: number;
  enraged: boolean;
  charged: boolean;
}

export type CreatureDraw = (ctx: CanvasRenderingContext2D, p: Pose) => void;

export interface CreatureArt {
  draw: CreatureDraw;
  /** Approximate height in art units (health bar placement). */
  height: number;
  /** Hover altitude in art units (0 for ground creatures). */
  fly: number;
  /** Extra scale applied on top of the lane scale. */
  scale: number;
  /** Where projectiles leave from, relative to the feet (art units, facing right). */
  muzzle: [number, number];
  /** Visual centre of the body (for hit flashes / targeting). */
  body: [number, number];
}
