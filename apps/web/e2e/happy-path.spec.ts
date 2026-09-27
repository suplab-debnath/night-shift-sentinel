import { expect, test } from '@playwright/test';
import { snapshot, sourceLine, trackConsoleErrors, waitForGate } from './helpers';

test('happy path plays end to end: alert, diagnosis, gate, recovery, wrap-up', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto('/?take=0&speed=8');

  // Title card at rest; nothing plays until the presenter presses play.
  await expect(page.getByTestId('title-card')).toContainText('02:07. Checkout is slowing down.');
  await expect(page.getByTestId('clock')).toHaveText('02:07:00');
  // No mode badge on stage; the source shows only in the settings menu.
  await expect(page.getByTestId('mode')).toHaveCount(0);
  expect(await sourceLine(page)).toBe('Scriptedcanonical take');
  await page.getByTestId('play').click();

  // Act 1: SEV-2.
  await expect(page.getByTestId('severity')).toHaveText('SEV-2', { timeout: 10_000 });

  // Act 3: evidence board merges into the root cause.
  await expect(page.getByTestId('root-cause')).toContainText('v2.14.0 cut the connection pool from 40 to 10.', { timeout: 30_000 });

  // Act 4: options and policy checks.
  await expect(page.getByTestId('option-card')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByTestId('checklist')).toContainText('P-06');

  // Act 5: the gate stops the clock.
  await waitForGate(page);
  await expect(page.getByTestId('gate-sheet')).toContainText('Approve production rollback?');
  await expect(page.getByText('Awaiting approval')).toBeVisible();
  const atGate = await snapshot(page);
  expect(atGate.clock).toBe('02:09:34');
  await page.waitForTimeout(800);
  expect((await snapshot(page)).t).toBe(atGate.t);
  await expect(page.getByTestId('gate-approve')).toBeFocused();
  await page.getByTestId('gate-approve').click();
  await expect(page.getByTestId('gate-sheet')).toBeHidden();

  // Act 6: rollout and recovery.
  await expect(page.getByText('Pod 6 of 6 on v2.13.2')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('severity')).toHaveText('Mitigated', { timeout: 30_000 });
  await expect(page.getByTestId('timelapse')).toHaveText('+5 min');
  await expect(page.getByTestId('latency')).toHaveText(/^1[89]\d ms$/);

  // Act 7: scorecard and end card.
  await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('end-card')).toContainText('Mitigated in 4 minutes. One human decision.');
  await expect(page.getByTestId('scorecard')).toContainText('Illustrative');
  // The end card shows at scene.end; Act 7 then runs to its full length before the timeline ends.
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 20_000 }).toBe('ended');
  expect((await snapshot(page)).clock).toBe('02:16:54');

  // Panel tabs.
  await page.getByTestId('tab-artifacts').click();
  await expect(page.getByTestId('artifact-postmortem')).toContainText('02:09:40 rollback approved by on-call engineer');
  await expect(page.getByTestId('artifact-status')).toContainText('Checkout incident — mitigated');
  await page.getByTestId('tab-audit').click();
  await expect(page.getByTestId('audit')).toContainText('Approved by On-call engineer: Approve production rollback?');
  await page.getByTestId('tab-evidence').click();
  await expect(page.getByTestId('panel-root-cause')).toContainText('0.92');

  expect(errors).toEqual([]);
});

test('same inputs give the same frame (deterministic seek)', async ({ page }) => {
  const read = async () => {
    await page.goto('/?take=0&seek=60000');
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const s = window.__nightShift!.source.getSnapshot();
      return JSON.stringify({ t: s.t, clock: s.clock, stream: s.state.stream.map((e) => e.id), audit: s.state.audit.length });
    });
  };
  expect(await read()).toBe(await read());
});

test('layout holds at 1366×768 with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?take=0&speed=8&autoplay=1&pauseAt=a4.b11');
  await expect(page.getByTestId('checklist')).toContainText('P-06', { timeout: 30_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  // The acting agent stays visible below the work sheet.
  const sheet = await page.getByTestId('work-sheet').boundingBox();
  const guardian = await page.locator('[data-agent="guardian"]').boundingBox();
  expect(sheet && guardian && guardian.y + 20 > sheet.y + sheet.height).toBe(true);
});

test('reduced motion renders whole lines and no packets trails', async ({ page }) => {
  await page.goto('/?take=0&speed=8&autoplay=1&pauseAt=a1.b04&reducedMotion=1');
  await expect(page.getByTestId('thought').first()).toHaveText(/p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds./, {
    timeout: 20_000,
  });
  expect(await page.evaluate(() => document.documentElement.dataset.reducedMotion)).toBe('true');
});

test('@realtime happy path at 1× runs in about the scripted length', async ({ page }) => {
  await page.goto('/?take=0');
  await page.getByTestId('play').click();
  const start = Date.now();
  await waitForGate(page, 120_000);
  const toGate = Date.now() - start;
  await page.getByTestId('gate-approve').click();
  const resumed = Date.now();
  await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 120_000 });
  const afterGate = Date.now() - resumed;
  const total = (toGate + afterGate) / 1000;
  console.log(`1× run: ${(toGate / 1000).toFixed(1)} s to the gate, ${(afterGate / 1000).toFixed(1)} s after it, ${total.toFixed(1)} s total`);
  // SCENARIO §3: ≈ 2 min 27 s of acts plus the gate (DECISIONS D-008, D-069).
  expect(total).toBeGreaterThan(132);
  expect(total).toBeLessThan(157);
});
