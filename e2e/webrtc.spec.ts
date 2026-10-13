import { expect, test } from '@playwright/test';
import { ctrlState, idle } from './helpers';
// Local CI browsers cannot reliably resolve each other's multicast .local ICE names.
// Numeric local candidates keep this a real data-channel test without external STUN.
test.use({ launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } });

test('static web browsers exchange WebRTC codes and play privately without WebSockets', async ({ page, browser, isMobile }) => {
  test.setTimeout(60_000);
  const guestContext = await browser.newContext({ viewport: page.viewportSize(), isMobile, hasTouch: isMobile });
  const guest = await guestContext.newPage();
  const sockets: string[] = [];
  const errors: string[] = [];
  try {
    for (const tab of [page, guest]) {
      tab.on('websocket', (ws) => sockets.push(ws.url()));
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.addInitScript(() => {
        localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false }));
        // Deterministic local candidate gathering; no dependency on public STUN availability.
        const NativePeer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeer { constructor(config?: RTCConfiguration) { super({ ...config, iceServers: [] });
          const w = window as unknown as { __rtcPeers?: RTCPeerConnection[] }; w.__rtcPeers = [...(w.__rtcPeers ?? []), this];
        } };
      });
      await tab.goto('/?e2e');
      await tab.getByRole('button', { name: /Multiplayer/ }).click();
    }
    await page.getByRole('button', { name: 'Browser play (WebRTC)', exact: true }).click();
    await guest.getByRole('button', { name: 'Browser play (WebRTC)', exact: true }).click();
    const hostButton = page.getByRole('button', { name: 'Host in this browser', exact: true });
    if (isMobile) await hostButton.click();
    else { await hostButton.focus(); await page.keyboard.press('Enter'); }
    await expect(page.getByLabel('Offer code', { exact: true })).toHaveValue(/^SPRTC1\./);
    if (!isMobile) await page.evaluate(() => { const pad = (window as unknown as { __testPad?: { buttons: { pressed: boolean }[] } }).__testPad; if (pad) pad.buttons[0]!.pressed = false; });
    await guest.getByLabel('Friend’s offer code', { exact: true }).fill(await page.getByLabel('Offer code', { exact: true }).inputValue());
    await guest.getByRole('button', { name: 'Create answer', exact: true }).click();
    await expect(guest.getByLabel('Answer code', { exact: true })).toHaveValue(/^SPRTC1\./);
    await page.getByLabel('Friend’s answer code', { exact: true }).fill('broken');
    await page.getByRole('button', { name: 'Connect friend', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid connection code. Paste the complete code from your friend.');
    await page.getByLabel('Friend’s answer code', { exact: true }).fill(await guest.getByLabel('Answer code', { exact: true }).inputValue());
    await page.getByRole('button', { name: 'Connect friend', exact: true }).click();
    await expect(page.getByText('2 / 2 players connected', { exact: true })).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: 'Start match', exact: true }).click();
    for (const tab of [page, guest]) await expect(tab.locator('canvas')).toBeVisible();
    const redIds = await guest.evaluate(() => (window as unknown as { __sp: { ctrl: { view: { units: { side: string }[] } } } }).__sp.ctrl.view.units.map((u) => u.side));
    expect(redIds.every((side) => side === 'red')).toBe(true);
    for (const tab of [guest, page]) {
      await tab.evaluate(() => {
        const pc = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers[0]!;
        Object.defineProperty(pc, 'connectionState', { configurable: true, get: () => 'disconnected' });
        pc.dispatchEvent(new Event('connectionstatechange'));
      });
      await expect.poll(() => page.evaluate(() => (window as unknown as { __sp: { ctrl: { connection: string } } }).__sp.ctrl.connection)).not.toBe('closed');
      if (tab === page) {
        const inFlight = await guest.evaluate(() => (window as unknown as { __sp: { ctrl: { session: { submit(command: unknown): Promise<unknown> } } } }).__sp.ctrl.session.submit({ type: 'endTurn', side: 'red' }));
        expect(inFlight).toEqual({ ok: false, error: 'opponentDisconnected' });
      }
      await tab.evaluate(() => {
        const pc = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers[0]!;
        delete (pc as unknown as { connectionState?: string }).connectionState;
        pc.dispatchEvent(new Event('connectionstatechange'));
      });
      for (const peer of [page, guest]) await expect.poll(() => peer.evaluate(() => (window as unknown as { __sp: { ctrl: { connection: string } } }).__sp.ctrl.connection)).toBe('connected');
    }
    // Reproduce a recovery race: guest recovers before the host's state notification.
    await page.evaluate(() => {
      const pc = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers[0]!;
      Object.defineProperty(pc, 'connectionState', { configurable: true, get: () => 'disconnected' });
      pc.dispatchEvent(new Event('connectionstatechange'));
    });
    await guest.evaluate(() => {
      const pc = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers[0]!;
      Object.defineProperty(pc, 'connectionState', { configurable: true, get: () => 'disconnected' });
      pc.dispatchEvent(new Event('connectionstatechange'));
      Object.defineProperty(pc, 'connectionState', { configurable: true, get: () => 'connected' });
      pc.dispatchEvent(new Event('connectionstatechange'));
    });
    await expect.poll(() => guest.evaluate(() => (window as unknown as { __sp: { ctrl: { connection: string } } }).__sp.ctrl.connection)).toBe('reconnecting');
    await page.evaluate(() => {
      const pc = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers[0]!;
      delete (pc as unknown as { connectionState?: string }).connectionState;
      pc.dispatchEvent(new Event('connectionstatechange'));
    });
    for (const tab of [page, guest]) await expect.poll(() => tab.evaluate(() => (window as unknown as { __sp: { ctrl: { connection: string } } }).__sp.ctrl.connection)).toBe('connected');
    const forged = await guest.evaluate(() => (window as unknown as { __sp: { ctrl: { session: { submit(command: unknown): Promise<unknown> } } } }).__sp.ctrl.session.submit({ type: 'endTurn', side: 'blue' }));
    expect(forged).toEqual({ ok: false, error: 'notYourTurn' });
    await page.getByRole('button', { name: /End turn/ }).click();
    await expect.poll(async () => (await ctrlState(guest)).activeSide).toBe('red'); await idle(guest);
    await guest.getByRole('button', { name: /End turn/ }).click();
    await expect.poll(async () => (await ctrlState(page)).activeSide).toBe('blue'); await idle(page);
    await page.screenshot({ path: `test-results/webrtc-${isMobile ? 'touch' : 'desktop'}.png` });
    await guest.getByRole('button', { name: 'Menu', exact: true }).click();
    await guest.getByRole('button', { name: 'Main menu', exact: true }).click();
    await expect(page.getByText('Room closed — return to the menu', { exact: false })).toBeVisible();
    expect(sockets).toEqual([]); expect(errors).toEqual([]);
  } finally { await guestContext.close(); }
});


test('WebRTC command timeout closes both sessions without cleanup errors', async ({ page, browser, isMobile }) => {
  test.setTimeout(45_000);
  const context = await browser.newContext({ viewport: page.viewportSize(), isMobile, hasTouch: isMobile });
  const guest = await context.newPage();
  const errors: string[] = [];
  try {
    for (const tab of [page, guest]) {
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.addInitScript(() => {
        localStorage.setItem('sp.settings', JSON.stringify({ locale: 'en', coach: false }));
        const NativePeer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeer { constructor(config?: RTCConfiguration) { super({ ...config, iceServers: [] }); } };
      });
      await tab.goto('/?e2e');
      await tab.getByRole('button', { name: /Multiplayer/ }).click();
      await tab.getByRole('button', { name: 'Browser play (WebRTC)', exact: true }).click();
    }
    const hostButton = page.getByRole('button', { name: 'Host in this browser', exact: true });
    if (isMobile) await hostButton.click();
    else {
      await hostButton.focus();
      await page.evaluate(() => {
        const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0, touched: false }));
        const pad = { index: 0, axes: [0, 0], buttons };
        Object.assign(window, { __testPad: pad });
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      });
    }
    await expect(page.getByLabel('Offer code', { exact: true })).toHaveValue(/^SPRTC1\./);
    if (!isMobile) await page.evaluate(() => { const pad = (window as unknown as { __testPad?: { buttons: { pressed: boolean }[] } }).__testPad; if (pad) pad.buttons[0]!.pressed = false; });
    await guest.getByLabel('Friend’s offer code', { exact: true }).fill(await page.getByLabel('Offer code', { exact: true }).inputValue());
    await guest.getByRole('button', { name: 'Create answer', exact: true }).click();
    await expect(guest.getByLabel('Answer code', { exact: true })).toHaveValue(/^SPRTC1\./);
    await page.getByLabel('Friend’s answer code', { exact: true }).fill(await guest.getByLabel('Answer code', { exact: true }).inputValue());
    await page.getByRole('button', { name: 'Connect friend', exact: true }).click();
    await expect(page.getByText('2 / 2 players connected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start match', exact: true }).click();
    await expect(guest.locator('canvas')).toBeVisible();
    const result = await guest.evaluate(async () => {
      const client = (window as unknown as { __sp: { ctrl: { session: { client: { transport: { send: (message: unknown) => void }; submit(command: unknown): Promise<unknown> } } } } }).__sp.ctrl.session.client;
      // Simulate a lost command and exercise the actual eight-second deadline.
      client.transport.send = () => {};
      return client.submit({ type: 'endTurn', side: 'red' });
    });
    expect(result).toEqual({ ok: false, error: 'timeout' });
    for (const tab of [page, guest]) {
      await expect.poll(() => tab.evaluate(() => (window as unknown as { __sp: { ctrl: { connection: string } } }).__sp.ctrl.connection)).toBe('closed');
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
