import { expect, test } from '@playwright/test';
import { ctrlState, idle } from './helpers';

const host = 'http://127.0.0.1:4180';
test('two browsers join, play alternate turns, resume after reload and leave', async ({ page, browser, isMobile }) => {
  const guestContext = await browser.newContext({ viewport: page.viewportSize(), isMobile, hasTouch: isMobile });
  const guest = await guestContext.newPage();
  try {
    for (const tab of [page, guest]) await tab.addInitScript(() => localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false })));
    await page.goto(`${host}/?e2e`);
    await page.getByRole('button', { name: /Multiplayer/ }).click();
  await page.getByRole('button', { name: 'Server / LAN', exact: true }).click();
    await page.getByRole('button', { name: 'Create room', exact: true }).click();
    const link = page.getByLabel('Invite link');
    await expect(link).toHaveValue(/room=[A-Z0-9]{8}/);
    await guest.goto((await link.inputValue()) + '&e2e');
    await guest.getByRole('button', { name: 'Join room', exact: true }).click();
    await expect(page.getByText('2 / 2 players connected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start match', exact: true }).click();
    for (const tab of [page, guest]) await expect(tab.locator('canvas')).toBeVisible();
    expect((await ctrlState(page)).activeSide).toBe('blue');
    expect((await ctrlState(guest)).activeSide).toBe('blue');
    await expect(guest.getByRole('button', { name: /End turn/ })).toBeDisabled();
    await page.getByRole('button', { name: /End turn/ }).click();
    await expect.poll(async () => (await ctrlState(guest)).activeSide).toBe('red');
    await idle(guest);
    await guest.reload();
    await expect(guest.locator('canvas')).toBeVisible();
    await idle(guest);
    expect((await ctrlState(guest)).activeSide).toBe('red');
    await guest.getByRole('button', { name: /End turn/ }).click();
    await expect.poll(async () => (await ctrlState(page)).activeSide).toBe('blue');
    await idle(page);
    await page.screenshot({ path: `test-results/multiplayer-${isMobile ? 'touch' : 'desktop'}.png` });
    await guest.close();
    await expect(page.getByText('Opponent disconnected — waiting for reconnection', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /End turn/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    expect(await page.evaluate(() => sessionStorage.getItem('sp.multiplayer'))).toBeNull();
  } finally { await guestContext.close(); }
});

test('lobby supports keyboard controls and rejects an unknown room', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false })));
  await page.goto(`${host}/?e2e&room=FFFFFFFF`);
  await page.getByLabel('Room code').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Room not found. Create a new room or check the code.');
  await expect(page.locator('main')).toHaveJSProperty('scrollWidth', await page.locator('main').evaluate((el) => el.clientWidth));
});

test('creates a room on HTTP when crypto.randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false }));
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined });
  });
  await page.goto(`${host}/?e2e`);
  await page.getByRole('button', { name: /Multiplayer/ }).click();
  await page.getByRole('button', { name: 'Server / LAN', exact: true }).click();
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.getByLabel('Invite link')).toHaveValue(/room=[A-Z0-9]{8}/);
});

test('opens the selected host before connecting from the standalone web page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false })));
  await page.goto('/?e2e');
  await page.getByRole('button', { name: /Multiplayer/ }).click();
  await page.getByRole('button', { name: 'Server / LAN', exact: true }).click();
  await page.getByLabel('Host address').fill(host);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page).toHaveURL(`${host}/?e2e=&multiplayer=server`);
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.getByLabel('Invite link')).toHaveValue(/room=[A-Z0-9]{8}/);
});

test('gamepad confirms the focused lobby control', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false })));
  await page.goto(`${host}/?e2e`);
  await page.getByRole('button', { name: /Multiplayer/ }).click();
  await page.getByRole('button', { name: 'Server / LAN', exact: true }).click();
  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 13, value: i === 13 ? 1 : 0, touched: false }));
    const pad = { index: 0, axes: [0, 0], buttons };
    Object.assign(window, { __testPad: pad });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (document.activeElement as HTMLElement)?.blur();
  });
  await expect(page.getByRole('button', { name: /Back/ })).toBeFocused();
  await page.evaluate(() => {
    const pad = (window as unknown as { __testPad: { buttons: { pressed: boolean }[] } }).__testPad;
    pad.buttons[13]!.pressed = false; pad.buttons[0]!.pressed = true;
  });
  await expect(page.getByRole('heading', { name: 'Squad Protocol', exact: true })).toBeVisible();
});
