// End to end (ADR 001): type a formula in the real editor, no console errors,
// the audio node keeps running (audio clock advances), the canvas changes.

import { test, expect } from '@playwright/test';

test('typing a formula: sound runs, scope draws, canvas changes, no errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/');
  await page.waitForSelector('#formula');

  // type a parametric formula through the real editor
  await page.fill('#formula', 'vec2(sin(440.0 * 6.283 * t), sin(662.0 * 6.283 * t))');
  await page.dispatchEvent('#formula', 'input');
  await page.waitForTimeout(400);
  await expect(page.locator('#error')).toBeHidden();

  // a real user click grants audio activation
  await page.click('#snd');
  await page.waitForTimeout(600);
  await expect(page.locator('#snd')).toHaveClass(/active/);
  await expect(page.locator('#scope')).toBeVisible();

  // the scope canvas must be actively drawing (audio clock advancing)
  const shot1 = await page.locator('#scope').screenshot();
  await page.waitForTimeout(500);
  const shot2 = await page.locator('#scope').screenshot();
  expect(shot1.equals(shot2), 'scope must animate while sound runs').toBe(false);

  // the canvas changes when the formula changes (screenshots composite the
  // WebGL output; drawImage would read an empty buffer — preserveDrawingBuffer
  // is off). Clip a region right of the panel and above the scope overlay.
  const clip = { x: 420, y: 20, width: 300, height: 300 };
  const before = await page.screenshot({ clip });
  await page.fill('#formula', 'julia(x, y, 0.355, 0.355, 24.0) * 2.0 - 1.0');
  await page.dispatchEvent('#formula', 'input');
  await page.waitForTimeout(500);
  const after = await page.screenshot({ clip });
  expect(before.equals(after), 'canvas must change with the formula').toBe(false);
  await expect(page.locator('#status')).toContainText('[scalar]'); // was [vec2]

  // field formula parked the sound with a hint, button intent stays on
  await expect(page.locator('#snd')).toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('sound plays f(t)');
  await expect(page.locator('#scope')).toBeHidden();

  expect(errors, errors.join('\n')).toHaveLength(0);
});
