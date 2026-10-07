import { BLESSINGS, LANE_COUNT, QUEUE_MAX, TURRETS, UNITS } from '../src/sim/data.ts';
import type { NetCommand } from '../src/net/protocol.ts';

const isLane = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < LANE_COUNT;
const isId = (v: unknown, table: Record<string, unknown>): v is string => typeof v === 'string' && Object.hasOwn(table, v);

/**
 * Checks the shape of a command sent by a client and returns a clean copy (only known fields),
 * or null. Whether the command is *allowed* right now (gold, age...) is up to the simulation,
 * which every replica runs identically.
 */
export function validateCommand(raw: unknown): NetCommand | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'train':
      return isId(c.unitId, UNITS) && isLane(c.lane) ? { type: 'train', unitId: c.unitId, lane: c.lane } : null;
    case 'cancel': {
      if (!Number.isInteger(c.index) || (c.index as number) < 0 || (c.index as number) >= QUEUE_MAX) return null;
      if (c.unitId !== undefined && !isId(c.unitId, UNITS)) return null;
      return c.unitId === undefined ? { type: 'cancel', index: c.index as number } : { type: 'cancel', index: c.index as number, unitId: c.unitId as string };
    }
    case 'ageUp':
      return { type: 'ageUp' };
    case 'buildTurret':
      return isLane(c.lane) && isId(c.turretId, TURRETS) ? { type: 'buildTurret', lane: c.lane, turretId: c.turretId } : null;
    case 'sellTurret':
      return isLane(c.lane) ? { type: 'sellTurret', lane: c.lane } : null;
    case 'power':
      return isLane(c.lane) ? { type: 'power', lane: c.lane } : null;
    case 'bless':
      return isId(c.blessing, BLESSINGS) ? { type: 'bless', blessing: c.blessing as keyof typeof BLESSINGS } : null;
    default:
      return null;
  }
}
