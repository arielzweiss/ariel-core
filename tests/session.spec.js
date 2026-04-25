// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

const isHidden = (locator) =>
  locator.evaluate((el) => el.classList.contains('hidden'));

const isVisible = async (locator) => !(await isHidden(locator));

async function startAndSkipCountdown(page) {
  await page.click('#btnA');
  // 3s countdown + 700ms GO transition
  await page.clock.runFor(3000);
  await page.clock.runFor(700);
}

async function completeFirstSet(page) {
  // Dead Bug = 10 reps × 3s pace
  await page.clock.runFor(30_000);
}

test.describe('Ariel Core — full session flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-04-25T10:00:00Z') });
    await page.goto(APP_URL);
    // Wait for script to wire up handlers
    await expect(page.locator('#btnA')).toBeVisible();
  });

  test('home screen renders both session cards', async ({ page }) => {
    await expect(page.locator('.home-title')).toHaveText('Ariel Core');
    await expect(page.locator('#btnA')).toHaveText('Start Session A');
    await expect(page.locator('#btnB')).toHaveText('Start Session B');
    await expect(page.locator('#home')).not.toHaveClass(/hidden/);
    await expect(page.locator('#workout')).toHaveClass(/hidden/);
  });

  test('countdown ticks 3 → 2 → 1 → GO! → workout', async ({ page }) => {
    await page.click('#btnA');

    const overlay = page.locator('#cdOverlay');
    const cdNum = page.locator('#cdNum');
    const cdGo = page.locator('#cdGo');

    await expect(overlay).not.toHaveClass(/hidden/);
    await expect(cdNum).toHaveText('3');
    await expect(page.locator('#cdExName')).toHaveText('Dead Bug');
    await expect(cdGo).toHaveClass(/hidden/);

    await page.clock.runFor(1000);
    await expect(cdNum).toHaveText('2');

    await page.clock.runFor(1000);
    await expect(cdNum).toHaveText('1');

    await page.clock.runFor(1000);
    await expect(cdGo).not.toHaveClass(/hidden/);
    await expect(cdNum).toHaveClass(/hidden/);

    await page.clock.runFor(700);
    await expect(overlay).toHaveClass(/hidden/);
    await expect(page.locator('#workout')).not.toHaveClass(/hidden/);
  });

  test('first exercise renders correctly after countdown', async ({ page }) => {
    await startAndSkipCountdown(page);

    await expect(page.locator('#exName')).toHaveText('Dead Bug');
    await expect(page.locator('#exTarget')).toHaveText('3 sets · 10 reps alternating sides');
    await expect(page.locator('#wNavInfo')).toHaveText('1 / 8');
    await expect(page.locator('#repArea')).toBeVisible();
    await expect(page.locator('#timerArea')).toBeHidden();
    await expect(page.locator('#repBig')).toHaveText('0');
    await expect(page.locator('#repOf')).toHaveText('of 10 reps');
    await expect(page.locator('#repPace')).toHaveText('3s per rep');
  });

  test('rep counter increments at the configured pace', async ({ page }) => {
    await startAndSkipCountdown(page);
    const repBig = page.locator('#repBig');

    await expect(repBig).toHaveText('0');

    await page.clock.runFor(3000);
    await expect(repBig).toHaveText('1');

    await page.clock.runFor(3000);
    await expect(repBig).toHaveText('2');

    await page.clock.runFor(6000);
    await expect(repBig).toHaveText('4');
  });

  test('tapping rep area pauses and resumes counting', async ({ page }) => {
    await startAndSkipCountdown(page);

    await page.clock.runFor(3000);
    await expect(page.locator('#repBig')).toHaveText('1');

    await page.click('#repArea');
    await expect(page.locator('#repPausedBadge')).toBeVisible();
    await expect(page.locator('#repPauseHint')).toBeHidden();

    // Time passes — count should not advance
    await page.clock.runFor(9000);
    await expect(page.locator('#repBig')).toHaveText('1');

    // Resume
    await page.click('#repArea');
    await expect(page.locator('#repPausedBadge')).toBeHidden();
    await expect(page.locator('#repPauseHint')).toBeVisible();

    await page.clock.runFor(3000);
    await expect(page.locator('#repBig')).toHaveText('2');
  });

  test('completing all reps shows the Got it ack button', async ({ page }) => {
    await startAndSkipCountdown(page);
    await completeFirstSet(page);

    await expect(page.locator('#repBig')).toHaveText('10');
    const ack = page.locator('#ackBtn');
    await expect(ack).toBeVisible();
    await expect(ack).toContainText('Got it');
    // Kudos prefix should also be present
    const txt = await ack.textContent();
    expect(txt && txt.length).toBeGreaterThan('Got it ✓'.length);
  });

  test('acknowledge transitions to set rest with proper labels', async ({ page }) => {
    await startAndSkipCountdown(page);
    await completeFirstSet(page);

    await page.click('#ackBtn');

    await expect(page.locator('#rest')).not.toHaveClass(/hidden/);
    await expect(page.locator('#workout')).toHaveClass(/hidden/);
    await expect(page.locator('#restLbl')).toHaveText('Set rest');
    await expect(page.locator('#rnLbl')).toHaveText('Next set');
    await expect(page.locator('#rnName')).toContainText('Set 2 of 3');
    await expect(page.locator('#rnName')).toContainText('Dead Bug');
    await expect(page.locator('#restNum')).toHaveText('30');

    await page.clock.runFor(1000);
    await expect(page.locator('#restNum')).toHaveText('29');

    await page.clock.runFor(5000);
    await expect(page.locator('#restNum')).toHaveText('24');
  });

  test('rest auto-completes after 30s and starts next countdown', async ({ page }) => {
    await startAndSkipCountdown(page);
    await completeFirstSet(page);
    await page.click('#ackBtn');

    await expect(page.locator('#rest')).not.toHaveClass(/hidden/);
    await page.clock.runFor(30_000);

    await expect(page.locator('#rest')).toHaveClass(/hidden/);
    await expect(page.locator('#workout')).not.toHaveClass(/hidden/);
    await expect(page.locator('#cdOverlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#cdNum')).toHaveText('3');
  });

  test('skip rest button immediately advances to next countdown', async ({ page }) => {
    await startAndSkipCountdown(page);
    await completeFirstSet(page);
    await page.click('#ackBtn');

    await expect(page.locator('#rest')).not.toHaveClass(/hidden/);
    await page.click('.skip-btn');

    await expect(page.locator('#rest')).toHaveClass(/hidden/);
    await expect(page.locator('#cdOverlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#cdNum')).toHaveText('3');
  });

  test('quit button returns to home screen', async ({ page }) => {
    await startAndSkipCountdown(page);
    await page.click('.w-quit');
    await expect(page.locator('#home')).not.toHaveClass(/hidden/);
    await expect(page.locator('#workout')).toHaveClass(/hidden/);
  });

  test('progress pip becomes done after acknowledging a set', async ({ page }) => {
    await startAndSkipCountdown(page);
    await completeFirstSet(page);

    // Before ack, set 0 is "active"
    const pips = page.locator('.set-pip');
    await expect(pips.nth(0)).toHaveClass(/active/);

    await page.click('#ackBtn');
    await page.click('.skip-btn');

    // After advancing to set 2, pip 0 should be done
    await expect(page.locator('.set-pip').nth(0)).toHaveClass(/done/);
    await expect(page.locator('.set-pip').nth(1)).toHaveClass(/active/);
  });

  test('full Session A completes and shows the done screen', async ({ page }) => {
    test.setTimeout(120_000);

    await page.click('#btnA');

    const isDone = () =>
      page.locator('#done').evaluate((el) => !el.classList.contains('hidden'));

    // Loop until session complete: advance clock in chunks, click ack when shown.
    // Session A ≈ 24 sets × (≈40s set + 30s rest) + 7 × 60s exercise rests ≈ 2000s of fake time.
    let safety = 600;
    while (safety-- > 0) {
      if (await isDone()) break;
      await page.clock.runFor(5000);
      const ackVisible = await isVisible(page.locator('#ackBtn'));
      if (ackVisible) {
        await page.click('#ackBtn');
      }
    }

    expect(safety).toBeGreaterThan(0); // sanity — didn't hit the cap
    await expect(page.locator('#done')).not.toHaveClass(/hidden/);
    await expect(page.locator('#workout')).toHaveClass(/hidden/);
    await expect(page.locator('.done-title')).toContainText('Session');
    await expect(page.locator('#doneEx')).toHaveText('8');
    await expect(page.locator('#doneSets')).toHaveText('24');

    // Back to home
    await page.click('.home-btn');
    await expect(page.locator('#home')).not.toHaveClass(/hidden/);
  });

  test('between-exercise rest is 60s and labelled "Exercise rest"', async ({ page }) => {
    test.setTimeout(60_000);
    await page.click('#btnA');

    // Complete all 3 sets of exercise 1 (Dead Bug)
    let safety = 200;
    let acks = 0;
    while (safety-- > 0 && acks < 3) {
      await page.clock.runFor(2000);
      if (await isVisible(page.locator('#ackBtn'))) {
        await page.click('#ackBtn');
        acks++;
        if (acks === 3) break;
      }
    }
    expect(acks).toBe(3);

    // Now we should be in a 60s rest screen labelled "Exercise rest" pointing to Dead Bug Reach
    await expect(page.locator('#rest')).not.toHaveClass(/hidden/);
    await expect(page.locator('#restLbl')).toHaveText('Exercise rest');
    await expect(page.locator('#rnLbl')).toHaveText('Next exercise');
    await expect(page.locator('#rnName')).toHaveText('Dead Bug Reach');
    await expect(page.locator('#restNum')).toHaveText('60');
  });
});
