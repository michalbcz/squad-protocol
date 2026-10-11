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
  const tut = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(tut).toContainText('Welcome to Boot Camp');
  await tut.getByRole('button', { name: 'Continue' }).click();
  await expect(tut).toContainText('Click your soldier');
  const vega = await tilePoint(page, { x: 3, y: 7 });
  await page.mouse.click(vega.x, vega.y);
  await expect(tut).toContainText('Step 3');
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
  await expect(tut).toContainText('Darkened tiles');
  await page.screenshot({ path: 'test-results/bootcamp-desktop.png' });
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

test('hotseat hides the board between turns', async ({ page }) => {
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Hotseat/ }).click();
  await idle(page);
  await page.getByRole('button', { name: /End turn/ }).click();
  const cover = page.getByRole('dialog');
  await expect(cover).toContainText('Pass the device to Red Cell');
  // The cover must be fully opaque: no pixels of Blue's board may show through.
  await expect(cover).toHaveCSS('background-color', 'rgb(13, 17, 23)');
  await page.screenshot({ path: `test-results/handoff-${test.info().project.name}.png` });
  await cover.getByRole('button', { name: /ready/ }).click();
  await expect(page.locator('.turn')).toContainText('Red Cell');
  await idle(page);
  expect((await ctrlState(page)).selected).toMatch(/^r/);
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

test('keyboard-only boot camp, then Esc to pause and back to the main menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Boot Camp/ }).focus();
  await page.keyboard.press('Enter');
  const tut = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(tut).toContainText('Welcome to Boot Camp');
  await idle(page);
  await page.keyboard.press('Enter'); // Continue
  await expect(tut).toContainText('Press Tab');
  await page.keyboard.press('Tab');
  await expect(tut).toContainText('Step 3');
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
  await expect(page.getByRole('heading', { name: 'Squad Protocol' })).toBeVisible();
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
