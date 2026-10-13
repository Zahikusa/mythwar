/**
 * Each creature's temper (Lens #77, Character Traits): one word for who it is, and the gesture
 * it makes when it fells a foe — the trait shown in how it moves, not only told in the Bestiary.
 */
export type Gesture = 'roar' | 'hop' | 'twirl' | 'rear' | 'loom';

export interface Temper {
  word: string;
  gesture: Gesture;
}

export const TEMPERS: Record<string, Temper> = {
  treant: { word: 'Patient', gesture: 'loom' },
  redcap: { word: 'Vicious', gesture: 'hop' },
  pixie: { word: 'Mischievous', gesture: 'twirl' },
  minotaur: { word: 'Furious', gesture: 'roar' },
  centaur: { word: 'Wild', gesture: 'rear' },
  gorgon: { word: 'Cold', gesture: 'loom' },
  jotunn: { word: 'Brooding', gesture: 'roar' },
  fenrir: { word: 'Ravenous', gesture: 'hop' },
  valkyrie: { word: 'Exultant', gesture: 'rear' },
  oni: { word: 'Wrathful', gesture: 'roar' },
  byakko: { word: 'Fierce', gesture: 'hop' },
  kitsune: { word: 'Sly', gesture: 'twirl' },
  titan: { word: 'Imperious', gesture: 'roar' },
  griffin: { word: 'Regal', gesture: 'rear' },
  phoenix: { word: 'Serene', gesture: 'loom' },
  dragon: { word: 'Ancient', gesture: 'roar' },
};

/** How long a gesture lasts (seconds). */
export const GESTURE_TIME = 0.8;

/**
 * The gesture's transform at progress k (0..1), in art units around the creature's feet:
 * a lift (up is negative), a rotation (negative = rearing back), and x/y scales.
 */
export function gestureAt(g: Gesture, k: number): { lift: number; rot: number; sx: number; sy: number } {
  const bell = Math.sin(Math.PI * k); // 0 → 1 → 0
  switch (g) {
    case 'roar': // swells up and leans in
      return { lift: 0, rot: 0.12 * bell, sx: 1 + 0.1 * bell, sy: 1 + 0.14 * bell };
    case 'hop': // two quick, savage hops
      return { lift: -Math.abs(Math.sin(2 * Math.PI * k)) * 7, rot: 0, sx: 1, sy: 1 };
    case 'twirl': {
      // spins round once, delighted
      const c = Math.cos(2 * Math.PI * k); // (never quite edge-on: a zero scale draws nothing)
      return { lift: -4 * bell, rot: 0, sx: c < 0 ? Math.min(-0.08, c) : Math.max(0.08, c), sy: 1 };
    }
    case 'rear': // rears back, proud
      return { lift: -3 * bell, rot: -0.35 * bell, sx: 1, sy: 1 };
    case 'loom': // draws itself up, slow and still
      return { lift: 0, rot: 0, sx: 1 - 0.04 * bell, sy: 1 + 0.12 * bell };
  }
}
