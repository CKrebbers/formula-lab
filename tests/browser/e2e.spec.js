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

  // a field formula keeps playing through the scan path: sound stays on and
  // the scope switches to the scanned waveform
  await expect(page.locator('#snd')).toHaveClass(/active/);
  await expect(page.locator('#scope')).toBeVisible();
  const wave1 = await page.locator('#scope').screenshot();
  await page.waitForTimeout(400);
  const wave2 = await page.locator('#scope').screenshot();
  expect(wave1.equals(wave2), 'field-scan scope must animate').toBe(false);

  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('a formula with audio-silent terms says so, per formula (ADR #38)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#formula');

  await page.fill('#formula', 'sin(440.0 * 6.283 * t)');
  await page.dispatchEvent('#formula', 'input');
  await page.waitForTimeout(400);
  await expect(page.locator('#audio-note')).toBeHidden();

  // the Trails-style feedback formula: prev() is 0 at 48 kHz
  await page.fill('#formula',
    'prev(x, y) * 0.97 + 0.06 * sin(length(x, y) * 14.0 - t * 2.0)');
  await page.dispatchEvent('#formula', 'input');
  await page.waitForTimeout(400);
  await expect(page.locator('#audio-note')).toBeVisible();
  await expect(page.locator('#audio-note')).toContainText('prev()');
  await expect(page.locator('#audio-note')).toContainText('0 in sound');

  // and it goes away again when the formula no longer needs the warning
  await page.fill('#formula', 'worley(x * 4.0, y * 4.0) * 2.0 - 1.0');
  await page.dispatchEvent('#formula', 'input');
  await page.waitForTimeout(400);
  await expect(page.locator('#audio-note')).toBeHidden();
});

// ADR #42: the zero-player hears its candidates. The measurement runs in an
// inline worker (the same computeAudioStats a save uses), the status line
// counts what was heard, and a won cell says what it was won on.
test('the zero-player ranks discoveries on sound as well as image (ADR #42)', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('/');
  await page.waitForSelector('#formula');
  await page.click('#auto');
  await expect(page.locator('#auto')).toHaveClass(/active/);

  // at least one candidate measured off-thread, and at least one cell won
  await expect(page.locator('#status')).toContainText(/snd [1-9]\d* heard/, { timeout: 120000 });
  await expect(page.locator('.elite-cell.filled').first()).toBeAttached({ timeout: 60000 });

  // every cell won in this session carries fitness = image · sound
  const titles = await page.locator('.elite-cell.filled').evaluateAll((els) => els.map((e) => e.title));
  expect(titles.length).toBeGreaterThan(0);
  for (const t of titles) {
    expect(t).toMatch(/fitness \d\.\d{3} \(img \d\.\d{3} · snd (\d\.\d{3}|unheard)\)/);
  }
  // and with a fresh grid, the first candidate could not have been unheard
  // for lack of a pool: an empty pool scores 1, so at least one cell is heard
  expect(titles.some((t) => /snd \d\.\d{3}\)/.test(t)), titles.join('\n')).toBe(true);

  await page.click('#auto');
  await expect(page.locator('#auto')).not.toHaveClass(/active/);
  expect(errors, errors.join('\n')).toHaveLength(0);
});
