/** Deterministic mulberry32 RNG. State lives in GameState so replays reproduce exactly. */
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rng: number }, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(nextRandom(state) * (maxInclusive - minInclusive + 1));
}
