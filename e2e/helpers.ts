import type { Page } from '@playwright/test';

interface Vec { x: number; y: number }

export async function tilePoint(page: Page, tile: Vec): Promise<Vec> {
  const pt = await page.evaluate((t) => {
    const sp = (window as unknown as { __sp: { board: { tileToScreen(v: Vec): Vec; centerOn(v: Vec): void } } }).__sp;
    sp.board.centerOn(t);
    const p = sp.board.tileToScreen(t);
    return p;
  }, tile);
  const box = (await page.locator('canvas').boundingBox())!;
  // tileToScreen returns the top edge of the tile; aim for the middle.
  const half = await page.evaluate(() => 48 * ((window as unknown as { __sp: { board: { zoom?: number } } }).__sp.board as never as { zoom: number }).zoom / 2);
  return { x: box.x + pt.x, y: box.y + pt.y + half };
}

export async function ctrlState(page: Page) {
  return page.evaluate(() => {
    const c = (window as unknown as { __sp: { ctrl: any } }).__sp.ctrl;
    return {
      selected: c.selectedId as string | null,
      pos: c.selected ? { ...c.selected.pos } : null,
      ap: c.selected?.ap as number | undefined,
      activeSide: c.view.activeSide as string,
      busy: c.busy as boolean,
      handoff: c.handoffTo as string | null,
    };
  });
}

export async function idle(page: Page) {
  await page.waitForFunction(() => !(window as unknown as { __sp: { ctrl: { busy: boolean } } }).__sp.ctrl.busy);
}
