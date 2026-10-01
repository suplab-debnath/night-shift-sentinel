import { expect, test, type Page } from '@playwright/test';
import { sourceLine, trackConsoleErrors } from './helpers';

async function streamSources(page: Page) {
  return page.evaluate(() => {
    const s = window.__nightShift!.source.getSnapshot();
    return s.state.stream.map((e) => ({ id: e.id, type: e.type, source: e.source, beat: e.id.split('.').slice(0, 2).join('.') }));
  });
}

test('live-mock: the full run is driven by live turns through the same stage', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto('/?take=0&pace=1&speed=4&autoplay=1&autoDecide=g1:approved');
  await expect.poll(() => sourceLine(page)).toContain('Live, mock model');
  await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 120_000 });
  expect(await sourceLine(page)).toBe('Live, mock model0 scripted lines · authored pace');
  const stream = await streamSources(page);
  const liveThoughts = stream.filter((e) => e.type === 'thought' && e.source === 'live');
  const liveTools = stream.filter((e) => e.type === 'tool.call' && e.source === 'live');
  expect(liveThoughts.length).toBeGreaterThanOrEqual(7);
  expect(liveTools.length).toBeGreaterThanOrEqual(3);
  expect(stream.some((e) => e.source === 'fallback')).toBe(false);
  // The root cause and both documents came through the live path too.
  const live = await page.evaluate(() => {
    const s = window.__nightShift!.source.getSnapshot();
    return {
      conclusion: s.timeline.events.find((e) => e.kind === 'evidence.conclude')?.source,
      artifacts: s.timeline.events.filter((e) => e.kind === 'artifact.create' && e.source === 'live').length,
    };
  });
  expect(live).toEqual({ conclusion: 'live', artifacts: 2 });
  await page.getByTestId('tab-artifacts').click();
  await expect(page.getByTestId('artifact-postmortem')).toContainText(/\d{2}:\d{2}:\d{2} rollback complete; errors stopped at \d{2}:\d{2}:\d{2}/);
  expect(errors).toEqual([]);
});

test('live-mock: invalid output and a timed-out turn fall back per beat, invisibly', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto('/?take=0&pace=1&speed=4&autoplay=1&pauseAt=a4.b12&mockFail=a3.b12:invalid,a4.b04:timeout');
  await expect.poll(async () => page.evaluate(() => window.__nightShift!.source.getSnapshot().playing), { timeout: 90_000 }).toBe(false);
  const stream = await streamSources(page);
  const fallback = stream.filter((e) => e.source === 'fallback').map((e) => e.beat);
  expect(fallback.sort()).toEqual(['a3.b12', 'a4.b04']);
  // No marker on stage; the presenter's menu counts the fallbacks and still reads live.
  await expect(page.getByText('scripted', { exact: true })).toHaveCount(0);
  expect(await sourceLine(page)).toBe('Live, mock model2 scripted lines · authored pace');
  // The fallback text is the canonical line; the audience sees no error.
  await expect(page.getByTestId('stream')).toContainText('Active connections are pinned at 10 of 10 on every pod.');
  expect(errors).toEqual([]);
});

test('live-mock: a stalled stream hands over to the script and the presenter menu says so', async ({ page }) => {
  // Simulate venue Wi-Fi going quiet: the segment request is accepted but never answered.
  await page.route('**/api/segments', () => new Promise(() => {}));
  await page.goto('/?take=0&pace=1&speed=4&autoplay=1&pauseAt=a2.b01');
  await expect.poll(() => sourceLine(page), { timeout: 30_000 }).toContain('Live, scripted fallback');
  await expect.poll(async () => page.evaluate(() => window.__nightShift!.source.getSnapshot().currentAct), { timeout: 30_000 }).toBe(2);
  const stream = await streamSources(page);
  expect(stream.find((e) => e.type === 'thought')?.source).toBe('fallback');
});

test('M switches between live and scripted', async ({ page }) => {
  await page.goto('/?take=0&pace=1&speed=4');
  await expect.poll(() => sourceLine(page)).toContain('Live, mock model');
  await page.keyboard.press('m');
  await expect.poll(() => sourceLine(page)).toContain('Scripted');
  await page.keyboard.press('m');
  await expect.poll(() => sourceLine(page)).toContain('Live, mock model');
});
