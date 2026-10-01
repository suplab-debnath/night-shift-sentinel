import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { sourceLine } from './helpers';

// P5 DoD: opens from file:// with the network disabled; fonts render (ARCHITECTURE §9).
const DIST = fileURLToPath(new URL('../dist-offline/', import.meta.url));
const FILE = pathToFileURL(`${DIST}index.html`).href;

test.beforeAll(() => {
  expect(existsSync(`${DIST}index.html`), 'run npm run build:offline first').toBe(true);
});

/** Offline context that records every request and blocks anything that is not file:/data:. */
async function offlinePage(context: BrowserContext): Promise<{ page: Page; external: string[]; errors: string[] }> {
  await context.setOffline(true);
  const external: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('data:')) return route.continue();
    external.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith('file:') && !url.startsWith('data:')) external.push(url);
  });
  return { page, external, errors };
}

test('the offline build is one self-contained file', () => {
  const files = readdirSync(DIST);
  expect(files).toEqual(['index.html']);
  expect(statSync(`${DIST}index.html`).size).toBeLessThan(16 * 1024 * 1024);
});

test('plays every path from file:// with the network off, zero external requests, fonts rendered', async ({ context }) => {
  const { page, external, errors } = await offlinePage(context);

  await page.goto(`${FILE}?take=0&pace=1&speed=8&autoplay=1&autoDecide=g1:approved`);
  expect(await sourceLine(page)).toBe('Scriptedcanonical take · authored pace');

  // Fonts come from inlined data: URIs and actually render.
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    sans: document.fonts.check('16px "Instrument Sans"'),
    mono: document.fonts.check('16px "IBM Plex Mono"'),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
    body: getComputedStyle(document.body).fontFamily,
  }));
  expect(fonts.sans).toBe(true);
  expect(fonts.mono).toBe(true);
  expect(fonts.loaded.length).toBeGreaterThanOrEqual(2);
  expect(fonts.body).toContain('Instrument Sans');

  // Happy path to the end card, then chaos from the end card.
  await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('scorecard')).toContainText('Illustrative');
  await page.getByRole('button', { name: 'Try the chaos test' }).click();
  await expect(page.getByTestId('permission-toast')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 20_000 });

  // Reject path to End B in the same offline session.
  await page.goto(`${FILE}?take=0&pace=1&speed=8&autoplay=1&autoDecide=g1:rejected,g2:rejected`);
  await expect(page.getByTestId('end-card')).toHaveAttribute('data-ending', 'B', { timeout: 90_000 });

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('the Content-Security-Policy forbids network access at runtime', async ({ context }) => {
  const { page } = await offlinePage(context);
  await page.goto(`${FILE}?take=0&pace=1`);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain('font-src data:');
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});

test('reduced motion and 1366×768 work offline', async ({ context }) => {
  const { page, external } = await offlinePage(context);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${FILE}?take=0&pace=1&speed=8&autoplay=1&pauseAt=a4.b12&reducedMotion=1`);
  await expect(page.getByTestId('checklist')).toContainText('P-06', { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  expect(external).toEqual([]);
});
