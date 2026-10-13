import { expect, test } from '@playwright/test';
import { ctrlState, idle, tilePoint } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('main menu renders and language can be switched to Czech', async ({ page }) => {
  await page.goto('/?e2e');
  await expect(page.getByRole('heading', { name: 'Squad Protocol' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Language').selectOption('cs');
  await page.getByRole('button', { name: /Zpět/ }).click();
  await expect(page.getByRole('button', { name: /Výcvik/ })).toBeVisible();
});

for (const viewport of [{ width: 360, height: 640 }, { width: 360, height: 780 }, { width: 780, height: 360 }]) {
  test(`phone menu keeps its title visible and all content reachable at ${viewport.width}x${viewport.height}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    await page.setViewportSize(viewport);
    await page.goto('/?e2e');
    await page.evaluate(() => document.fonts.ready);
    const title = page.getByRole('heading', { name: 'Squad Protocol' });
    await page.screenshot({ path: `test-results/menu-phone-${viewport.width}x${viewport.height}.png` });
    await expect(title).toBeInViewport({ ratio: 1 });
    const menu = page.locator('main.menu');
    expect(await menu.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const tip = page.getByRole('complementary', { name: 'Tip of the day' });
    await tip.scrollIntoViewIfNeeded();
    // Mobile scrolling can leave a fractional pixel outside the intersection rectangle.
    await expect(tip).toBeInViewport({ ratio: 0.99 });
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeInViewport({ ratio: 1 });
  });
}

test('pseudo-locale shows no missing keys in menu or game', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en-XA' })));
  await page.goto('/?e2e');
  await expect(page.locator('body')).not.toContainText('⟦');
  await page.locator('nav button').nth(1).click(); // skirmish
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('⟦');
});

test('boot camp tutorial advances as the player acts (mouse)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse flow');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Boot Camp/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const tut = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(tut).toContainText('Welcome to Boot Camp');
  await tut.getByRole('button', { name: 'Continue' }).click();
  await expect(tut).toContainText('mouse wheel');
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);
  await expect(tut).toContainText('Click your soldier');
  const vega = await tilePoint(page, { x: 3, y: 7 });
  await page.mouse.click(vega.x, vega.y);
  await expect(tut).toContainText('Step 4');
  await tut.getByRole('button', { name: 'Continue' }).click();
  const target = await tilePoint(page, { x: 7, y: 6 });
  await page.mouse.move(target.x, target.y);
  await expect(page.getByRole('status')).toContainText('AP');
  await page.mouse.click(target.x, target.y);
  await idle(page);
  expect((await ctrlState(page)).pos).toEqual({ x: 7, y: 6 });
  await expect(tut).toContainText('Doors open');
  const room = await tilePoint(page, { x: 7, y: 3 });
  await page.mouse.click(room.x, room.y);
  await idle(page);
  await page.screenshot({ path: 'test-results/bootcamp-desktop.png' });
  await expect(tut).toContainText('Darkened tiles');
});

test('keyboard-only: select, move, end turn', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await idle(page);
  await page.locator('canvas').focus().catch(() => {});
  await page.keyboard.press('KeyN');
  const before = await ctrlState(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await idle(page);
  const after = await ctrlState(page);
  expect(after.pos!.y).toBe(before.pos!.y - 2);
  expect(after.ap).toBeLessThan(before.ap!);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.turn')).toContainText('Red Cell');
  // AI plays its turn, then control returns to Blue.
  await expect(page.locator('.turn')).toContainText('Blue Squad', { timeout: 30_000 });
  await expect(page.locator('.turn')).toContainText('Turn 2');
});

test('turning rotates the soldier silhouette through all eight facings', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard turn controls');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await idle(page);
  await page.waitForFunction(() => (window as any).__sp.board.ready);
  const silhouettes = new Set<string>();
  for (let facing = 0; facing < 8; facing++) {
    const clip = await page.evaluate(() => {
      const { board, ctrl } = (window as any).__sp;
      const p = board.tileToScreen(ctrl.selected.pos);
      // Crop the body: excludes compass pips, corner brackets and HP/AP indicators.
      return { x: p.x - 12 * board.zoom, y: p.y + 12 * board.zoom, width: 24 * board.zoom, height: 24 * board.zoom };
    });
    silhouettes.add((await page.screenshot({ clip })).toString('base64'));
    await page.screenshot({ path: `test-results/soldier-facing-${facing}.png` });
    await page.keyboard.press('KeyR');
    await idle(page);
  }
  expect(silhouettes.size).toBe(8);
});

test('hotseat hides the board between turns', async ({ page }) => {
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Hotseat/ }).click();
  await idle(page);
  await page.getByRole('button', { name: /End turn/ }).click();
  const cover = page.getByRole('dialog');
  await expect(cover).toContainText('Pass the device to Red Cell');
  // The cover must be fully opaque: no pixels of Blue's board may show through.
  await expect(cover).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.screenshot({ path: `test-results/handoff-${test.info().project.name}.png` });
  await cover.getByRole('button', { name: /ready/ }).click();
  await expect(page.locator('.turn')).toContainText('Red Cell');
  await idle(page);
  expect((await ctrlState(page)).selected).toMatch(/^r/);
});

test('desktop opening view keeps the whole map between the HUD panels', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop overview');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await idle(page);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__sp.board.ready);
  const bounds = await page.evaluate(() => {
    const { board, ctrl } = (window as any).__sp;
    const first = board.tileToScreen({ x: 0, y: 0 });
    const last = board.tileToScreen({ x: ctrl.view.map.width - 1, y: ctrl.view.map.height - 1 });
    return { left: first.x - 24 * board.zoom, top: first.y, right: last.x + 24 * board.zoom, bottom: last.y + 48 * board.zoom };
  });
  const unit = (await page.locator('.unit').boundingBox())!;
  const top = (await page.locator('.top').boundingBox())!;
  const actions = (await page.locator('.actions').boundingBox())!;
  expect(bounds.left).toBeGreaterThanOrEqual(6);
  expect(bounds.top).toBeGreaterThanOrEqual(top.y + top.height);
  expect(bounds.right).toBeLessThan(unit.x);
  expect(bounds.bottom).toBeLessThan(actions.y);
  await page.screenshot({ path: 'test-results/retro-desktop.png' });
});

test('touch: tap previews, second tap confirms', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch flow');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await idle(page);
  const start = await ctrlState(page);
  const dest = { x: start.pos!.x, y: start.pos!.y - 2 };
  const p = await tilePoint(page, dest);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByRole('status')).toContainText('Tap again');
  expect((await ctrlState(page)).pos).toEqual(start.pos);
  await page.touchscreen.tap(p.x, p.y);
  await idle(page);
  expect((await ctrlState(page)).pos).toEqual(dest);
  await page.screenshot({ path: 'test-results/skirmish-mobile.png' });
});

test('resizing to portrait keeps the selected soldier visible above the compact HUD', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop to phone resize');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await idle(page);
  await page.waitForFunction(() => (window as any).__sp.board.ready);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => {
    const { board, ctrl } = (window as any).__sp;
    const p = board.tileToScreen(ctrl.selected.pos);
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const top = document.querySelector('.top')!.getBoundingClientRect();
    const host = document.querySelector('.board')!.getBoundingClientRect();
    if (canvas.width !== host.width || canvas.height !== host.height) return false;
    return p.x > 0 && p.x < canvas.width && p.y > top.bottom && p.y + 48 * board.zoom < canvas.height;
  })).toBe(true);
  const unit = (await page.locator('.unit').boundingBox())!;
  const canvas = (await page.locator('canvas').boundingBox())!;
  const actions = (await page.locator('.actions').boundingBox())!;
  expect(unit.y).toBeGreaterThanOrEqual(canvas.y + canvas.height);
  expect(unit.y + unit.height).toBeLessThan(actions.y);
  await expect(page.getByRole('button', { name: /End turn/ })).toBeInViewport();
  await page.screenshot({ path: 'test-results/retro-portrait.png' });
});

test('keyboard-only boot camp, then Esc to pause and back to the main menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Boot Camp/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
  await page.keyboard.press('Enter');
  const tut = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(tut).toContainText('Welcome to Boot Camp');
  await idle(page);
  await page.waitForFunction(() => (window as any).__sp.board.ready);
  await page.keyboard.press('Enter'); // Continue
  await expect(tut).toContainText('press + or −');
  await page.keyboard.press('Equal');
  await expect(tut).toContainText('Press Tab');
  await page.keyboard.press('Tab');
  await expect(tut).toContainText('Step 4');
  await page.keyboard.press('Enter'); // Continue
  await expect(tut).toContainText('arrow keys');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp']) await page.keyboard.press(k);
  await page.keyboard.press('Enter');
  await idle(page);
  expect((await ctrlState(page)).pos).toEqual({ x: 7, y: 6 });
  await expect(tut).toContainText('Doors open');
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog');
  await expect(pause).toContainText('Paused');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Boot Camp', exact: true })).toBeVisible();
});

test('mouse-clicked HUD buttons do not swallow later keyboard confirm', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse + keyboard');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await idle(page);
  await page.getByRole('radio', { name: /Snap/ }).click();
  await page.getByRole('radio', { name: /Move/ }).click();
  const before = await ctrlState(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await idle(page);
  expect((await ctrlState(page)).pos).toEqual({ x: before.pos!.x, y: before.pos!.y - 1 });
});

test('boot camp lists four missions and remembers progress', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sp.settings', JSON.stringify({ bootCamp: ['firstSteps'] })));
  await page.goto('/?e2e');
  await expect(page.getByRole('button', { name: /Boot Camp/ })).toContainText('1 of 4');
  await page.getByRole('button', { name: /Boot Camp/ }).click();
  const missions = page.locator('.missions li');
  await expect(missions).toHaveCount(4);
  await expect(missions.nth(0)).toContainText('✓');
  await expect(missions.nth(0).getByRole('button')).toHaveText('Replay');
  await expect(missions.nth(1).getByRole('button')).toHaveText('Start');
  await expect(missions.nth(1)).toContainText('Cover & Fire');
});

test('reaction fire mission: face the door, end turn, watch the scripted ambush', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await page.goto('/?e2e&seed=4');
  await page.getByRole('button', { name: /Boot Camp/ }).click();
  await page.locator('.missions li').nth(2).getByRole('button').click();
  const tut = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(tut).toContainText('AP you don’t spend is not wasted');
  await idle(page);
  await page.keyboard.press('Enter');
  await expect(tut).toContainText('face east');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('KeyR');
    await idle(page);
  }
  await expect(tut).toContainText('end your turn');
  await page.keyboard.press('KeyE');
  await expect(tut).toContainText('Did you see a yellow tracer', { timeout: 20_000 });
  await expect(page.locator('.turn')).toContainText('Turn 2');
});

test('codex has a tips & tricks section and the menu shows a tip of the day', async ({ page }) => {
  await page.goto('/?e2e');
  await expect(page.getByRole('complementary', { name: 'Tip of the day' })).toBeVisible();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('heading', { name: /Tips & tricks/ })).toBeVisible();
  await page.getByRole('searchbox').fill('reserve');
  await expect(page.getByRole('heading', { name: 'Always keep a reserve' })).toBeVisible();
});

test('coach tip appears once in a skirmish and can be dismissed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse hover flow');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Skirmish/ }).click();
  await idle(page);
  const far = await tilePoint(page, { x: 26, y: 1 });
  await page.mouse.move(far.x, far.y);
  const coach = page.locator('.coach-tip');
  await expect(coach).toContainText('Red dots');
  await coach.getByRole('button', { name: 'Got it' }).click();
  await expect(coach).toBeHidden();
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('sp.settings')!).seenTips);
  expect(seen).toContain('tooFar');
});
