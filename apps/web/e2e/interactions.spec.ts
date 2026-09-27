import { expect, test, type Page } from '@playwright/test';
import { snapshot, sourceLine, trackConsoleErrors, waitForGate } from './helpers';

async function toGate(page: Page, query = '') {
  await page.goto(`/?take=0&speed=8&autoplay=1${query}`);
  await waitForGate(page);
}

test.describe('branches (SCENARIO §5)', () => {
  test('reject g1 → alternative → approve g2 (keyboard X then A) ends on the override path', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await toGate(page);
    await page.keyboard.press('x');
    await expect(page.getByTestId('gate-sheet')).toBeHidden();
    await expect(page.getByTestId('option-card')).toContainText('Set the old pool key to 40 at runtime', { timeout: 20_000 });
    await expect(page.getByTestId('checklist')).toContainText('P-08', { timeout: 20_000 });
    await waitForGate(page);
    await expect(page.getByTestId('gate-sheet')).toContainText('Approve runtime config override?');
    expect((await snapshot(page)).clock).toBe('02:10:12');
    await page.keyboard.press('a');
    await expect(page.getByText('Pod 6 of 6 restarted with pool size 40')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('end-card')).toHaveAttribute('data-ending', 'A', { timeout: 40_000 });
    await page.getByTestId('tab-artifacts').click();
    await expect(page.getByTestId('artifact-postmortem')).toContainText('A5 Remove runtime override', { timeout: 20_000 });
    await page.getByTestId('tab-audit').click();
    await expect(page.getByTestId('audit')).toContainText('Rollback declined by on-call engineer');
    expect(errors).toEqual([]);
  });

  test('reject g1 → reject g2 ends with the squad handing over to humans', async ({ page }) => {
    await toGate(page, '&autoDecide=g1:rejected');
    await expect(page.getByTestId('gate-sheet')).toContainText('Approve runtime config override?');
    await page.getByTestId('gate-reject').click();
    await expect(page.getByTestId('end-card')).toHaveAttribute('data-ending', 'B', { timeout: 30_000 });
    await expect(page.getByTestId('end-card')).toContainText('The squad stopped where people said stop.');
    await expect(page.getByTestId('severity')).toHaveText('Handed to humans');
    await expect(page.getByTestId('scorecard')).toHaveCount(0);
    await page.getByTestId('tab-artifacts').click();
    await expect(page.getByTestId('artifact-escalation')).toContainText('escalated to incident commander', { timeout: 20_000 });
  });

  test('scrubbing back before the gate clears the decision', async ({ page }) => {
    await page.goto('/?take=0&speed=8&autoplay=1&autoDecide=g1:approved');
    await expect.poll(async () => (await snapshot(page)).act, { timeout: 60_000 }).toBeGreaterThanOrEqual(6);
    expect(await page.evaluate(() => window.__nightShift!.source.getSnapshot().decisions.length)).toBe(1);
    await page.keyboard.press('4');
    const s = await page.evaluate(() => window.__nightShift!.source.getSnapshot().decisions.length);
    expect(s).toBe(0);
  });
});

test.describe('chaos test (SCENARIO §5.2)', () => {
  test('is unavailable before Act 4, then blocks twice and returns to the trigger point', async ({ page }) => {
    await page.goto('/?take=0&speed=8&autoplay=1&pauseAt=a3.b10');
    await expect.poll(async () => (await snapshot(page)).status, { timeout: 20_000 }).toBe('paused');
    await expect(page.getByTestId('chaos-button')).toBeDisabled();
    await page.keyboard.press('c');
    await expect(page.getByTestId('chaos-banner')).toHaveCount(0);

    await page.keyboard.press('4');
    const before = await snapshot(page);
    await page.evaluate(() => window.__nightShift!.source.setSpeed(2));
    await page.keyboard.press('c');
    await expect(page.getByTestId('chaos-banner')).toHaveText('Chaos test: an over-eager fix');
    await expect(page.getByTestId('checklist')).toContainText('P-06', { timeout: 20_000 });
    await expect(page.getByTestId('checklist').getByText('Fail')).toHaveCount(3);
    await expect(page.getByTestId('permission-toast')).toHaveText('db.alter is not granted to Fixer', { timeout: 20_000 });
    await expect(page.locator('[data-agent="guardian"]')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('chaos-banner')).toHaveCount(0, { timeout: 20_000 });
    // Back where it was triggered: the story clock held, the audit kept the block.
    const after = await snapshot(page);
    expect(after.clock >= before.clock).toBe(true);
    expect(after.act).toBe(4);
    await page.getByTestId('tab-audit').click();
    await expect(page.getByTestId('audit')).toContainText('Blocked: violates P-02, P-04, P-06');
    await expect(page.getByTestId('audit')).toContainText('db.alter is not granted to fixer');
  });

  test('runs over an open gate and returns to it', async ({ page }) => {
    await toGate(page);
    await page.getByTestId('chaos-button').click();
    await expect(page.getByTestId('gate-sheet')).toBeHidden();
    await expect(page.getByTestId('chaos-banner')).toBeVisible();
    await waitForGate(page);
    await expect(page.getByTestId('gate-sheet')).toContainText('Approve production rollback?');
  });

  test('runs from the end card and returns to it', async ({ page }) => {
    await page.goto('/?take=0&speed=8&autoplay=1&autoDecide=g1:approved');
    await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await snapshot(page)).status, { timeout: 20_000 }).toBe('ended');
    await page.getByRole('button', { name: 'Try the chaos test' }).click();
    await expect(page.getByTestId('chaos-banner')).toBeVisible();
    await expect(page.getByTestId('end-card')).toBeHidden();
    await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('overlays', () => {
  test('split view opens with S and from the end card, closes with Esc', async ({ page }) => {
    await page.goto('/?take=0&speed=8');
    await page.keyboard.press('s');
    const split = page.getByTestId('split-view');
    await expect(split).toBeVisible();
    await expect(split).toContainText('Illustrative');
    await expect(split).toContainText('Recovery confirmed');
    await expect(split).toContainText('Postmortem drafted');
    await expect(split).toContainText('48 min');
    await page.keyboard.press('Escape');
    await expect(split).toBeHidden();
  });

  test('inspector shows tools, approvals and never-allowed actions', async ({ page }) => {
    await page.goto('/?take=0&speed=8');
    await page.locator('[data-agent="fixer"]').click();
    const insp = page.getByTestId('inspector');
    await expect(insp).toContainText('Proposes and, once approved, executes mitigations');
    await expect(insp).toContainText('deploy.rollback');
    await expect(insp).toContainText('Needs approval');
    await expect(insp).toContainText('db.alter (not granted)');
    await page.keyboard.press('Escape');
    await expect(insp).toBeHidden();
    await page.locator('[data-agent="guardian"]').focus();
    await page.keyboard.press('i');
    await expect(page.getByTestId('inspector')).toContainText('Approve on behalf of a human');
  });
});

test.describe('shortcuts (RUNBOOK §5)', () => {
  test('play, step, acts, speed, help, presenter, notes, reset', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/?take=0');
    await page.keyboard.press(' ');
    await expect.poll(async () => (await snapshot(page)).status).toBe('playing');
    await page.keyboard.press(' ');
    await expect.poll(async () => (await snapshot(page)).status).toBe('paused');

    const t0 = (await snapshot(page)).t;
    await page.keyboard.press('ArrowRight');
    const t1 = (await snapshot(page)).t;
    expect(t1).toBeGreaterThan(t0);
    await page.keyboard.press('ArrowLeft');
    expect((await snapshot(page)).t).toBeLessThan(t1);

    for (const n of [2, 3, 4]) {
      await page.keyboard.press(String(n));
      expect((await snapshot(page)).act).toBe(n);
    }
    await page.keyboard.press('5');
    expect((await snapshot(page)).status).toBe('awaitingGate');
    await page.keyboard.press('7');
    expect((await snapshot(page)).act).toBe(7);

    await page.keyboard.press('+');
    await expect(page.getByRole('radio', { name: '1.5×' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('+');
    await expect(page.getByRole('radio', { name: '2×' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('-');
    await expect(page.getByRole('radio', { name: '1.5×' })).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts')).toContainText('Chaos test (from Act 4 onward)');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts')).toBeHidden();

    await page.keyboard.press('p');
    expect(await page.evaluate(() => document.documentElement.dataset.presenter)).toBe('true');
    await expect(page.getByTestId('settings')).toHaveCount(0);
    await expect(page.getByTestId('presenter-notes')).toBeVisible();
    await expect(page.locator('[data-agent="human"]')).toContainText('You');
    await page.keyboard.press('n');
    await expect(page.getByTestId('presenter-notes')).toHaveCount(0);
    await page.keyboard.press('p');
    await expect(page.getByTestId('settings')).toBeVisible();

    await page.keyboard.press('r');
    await expect.poll(async () => (await snapshot(page)).t).toBe(0);
    await expect(page.getByTestId('title-card')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('settings toggle reduced motion', async ({ page }) => {
    await page.goto('/?take=0&reducedMotion=0');
    await page.getByTestId('settings').click();
    await page.getByTestId('setting-reducedMotion').click();
    expect(await page.evaluate(() => document.documentElement.dataset.reducedMotion)).toBe('true');
  });
});

test('iPad landscape: the panel becomes a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/?take=0&speed=8&autoplay=1&pauseAt=a2.b02');
  const panel = page.locator('#details-panel');
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(1180 - 1);
  await page.getByRole('button', { name: 'Details' }).click();
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(1180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test.describe('realism layer (SCENARIO §11)', () => {
  test('investigation texture: a failed call, suspects ruled out, a channel that fills', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/?take=0&speed=8&autoplay=1&pauseAt=a3.b10');
    await expect.poll(() => page.evaluate(() => window.__nightShift!.source.getSnapshot().playing), { timeout: 60_000 }).toBe(false);
    await expect(page.getByTestId('tool-error')).toContainText('trace store returned 503');
    await expect(page.getByTestId('suspect-card')).toHaveCount(2);
    await expect(page.getByTestId('suspect-card').filter({ hasText: 'Spring Boot' })).toContainText('Ruled out');
    await page.getByTestId('tab-channel').click();
    await expect(page.getByTestId('channel-post')).toHaveCount(3);
    await expect(page.getByTestId('channel')).toContainText('Paging on-call and the agent squad.');
    // The approval sheet reads like a change request with a live waiting time.
    await page.goto('/?take=0&speed=8&autoplay=1');
    await waitForGate(page);
    await expect(page.getByTestId('gate-sheet')).toContainText('CHG-24817');
    await expect(page.getByTestId('gate-waiting')).toHaveText(/waiting 0:0[1-9]/, { timeout: 5_000 });
    expect(errors).toEqual([]);
  });

  const thoughts = (page: Page) =>
    page.evaluate(() => window.__nightShift!.source.getSnapshot().state.stream.flatMap((e) => (e.type === 'thought' ? [e.text] : [])));

  for (const take of [7, 4242]) {
    test(`take ${take} plays every branch to an ending with different wording`, async ({ page }) => {
      const errors = trackConsoleErrors(page);
      await page.goto('/?take=0&speed=16&autoplay=1&autoDecide=g1:approved');
      await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 60_000 });
      const canonical = await thoughts(page);
      for (const decide of ['g1:rejected,g2:approved', 'g1:rejected,g2:rejected', 'g1:approved']) {
        await page.goto(`/?take=${take}&speed=16&autoplay=1&autoDecide=${decide}`);
        await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 60_000 });
      }
      const lines = await thoughts(page);
      expect(lines).toHaveLength(canonical.length);
      expect(lines.filter((l) => !canonical.includes(l)).length).toBeGreaterThan(3);
      expect(await sourceLine(page)).toBe(`Scriptedtake ${take}`);
      expect(errors).toEqual([]);
    });
  }
});
