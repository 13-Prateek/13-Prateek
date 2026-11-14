/** Tiny presentation-only PRNG (xorshift32). Never used by the sim. */
let s = 0x9e3779b9;
export function rnd(): number {
  s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
  return (s >>> 0) / 4294967296;
}
export const rrange = (a: number, b: number): number => a + (b - a) * rnd();
export function seedFx(seed: number): void { s = (seed | 0) || 1; }
