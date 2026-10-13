// Original helmet-and-rifle silhouette, facing north. '+' is the bright rifle.
const NORTH = [
  '..........++....',
  '..........++....',
  '......###.++....',
  '.....#####.+....',
  '.....#####.+....',
  '.....#####.+....',
  '......###.++....',
  '....########....',
  '...##########...',
  '...##.####.##...',
  '......####......',
  '.....######.....',
  '.....##..##.....',
  '....###..###....',
  '................',
  '................',
];

// Sample back onto the pixel grid rather than rotating smooth vector rectangles.
// This preserves square pixels at the four diagonal facings as well.
export const SOLDIER_SPRITES: readonly (readonly string[])[] = Array.from({ length: 8 }, (_, facing) => {
  const angle = facing * Math.PI / 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => {
    const sx = Math.round((x - 7.5) * cos + (y - 7.5) * sin + 7.5);
    const sy = Math.round(-(x - 7.5) * sin + (y - 7.5) * cos + 7.5);
    return sx >= 0 && sx < 16 && sy >= 0 && sy < 16 ? NORTH[sy]![sx]! : '.';
  }).join(''));
});
