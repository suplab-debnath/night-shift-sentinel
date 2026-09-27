import { expect, type Page } from '@playwright/test';

export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function snapshot(page: Page) {
  return page.evaluate(() => {
    const s = window.__nightShift!.source.getSnapshot();
    return { t: s.t, status: s.status, clock: s.clock, act: s.currentAct, severity: s.state.severity };
  });
}

/** The source line, visible only in the presenter's settings menu (no badge on stage, D-070). */
export async function sourceLine(page: Page): Promise<string> {
  await page.getByTestId('settings').click();
  const text = (await page.getByTestId('mode').textContent()) ?? '';
  await page.getByTestId('settings').click();
  return text;
}

export async function waitForGate(page: Page, timeout = 60_000) {
  await expect(page.getByTestId('gate-sheet')).toBeVisible({ timeout });
}
