import { describe, expect, it } from 'vitest';
import { SOLDIER_SPRITES } from '../src/render/soldier-sprite';

describe('directional soldier artwork', () => {
  it('uses a distinct body and weapon silhouette for every facing', () => {
    expect(SOLDIER_SPRITES).toHaveLength(8);
    expect(new Set(SOLDIER_SPRITES.map((sprite) => sprite.join('\n'))).size).toBe(8);
  });

  it.each([
    [0, 0, -1], [1, 1, -1], [2, 1, 0], [3, 1, 1],
    [4, 0, 1], [5, -1, 1], [6, -1, 0], [7, -1, -1],
  ])('points the rifle forward for facing %i', (facing, dx, dy) => {
    const sprite = SOLDIER_SPRITES[facing]!;
    const rifle: { x: number; y: number }[] = [];
    const body: { x: number; y: number }[] = [];
    sprite.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel === '+') rifle.push({ x: x - 7.5, y: y - 7.5 });
      if (pixel === '#') body.push({ x: x - 7.5, y: y - 7.5 });
    }));
    expect(rifle.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
    const forward = ({ x, y }: { x: number; y: number }) => x * dx! + y * dy!;
    expect(Math.max(...rifle.map(forward))).toBeGreaterThan(Math.max(...body.map(forward)));
    expect(rifle.reduce((sum, point) => sum + forward(point), 0) / rifle.length).toBeGreaterThan(0);
  });
});
