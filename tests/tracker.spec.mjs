import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.TRACKER_TEST_URL || 'http://127.0.0.1:4220/daily-activity-tracker/';

async function add(page, title, type = 'Must-do') {
  const form = page.getByRole('dialog');
  await form.getByLabel('Task title').fill(title);
  await form.getByLabel('Task type').selectOption({ label: type });
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(form).toBeHidden();
}

test('mobile flow shares a checklist, a three-day goal, and yearly analytics', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-11-26T10:00:00Z') });
  await page.goto(url);
  const menu = page.getByRole('navigation');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  expect(await menu.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  await menu.getByRole('link', { name: 'Profile & Analytics' }).click();
  await expect(page.getByText('No must-dos scheduled')).toBeVisible();
  await expect(page.getByLabel('Analytics year')).toHaveValue('2026');
  await menu.getByRole('link', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'New goal' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Goal title').fill('SQL test');
  await dialog.getByLabel('End date').fill('2026-11-28');
  await dialog.getByRole('button', { name: 'Create goal' }).click();
  await expect(page.getByRole('heading', { name: 'SQL test' })).toBeVisible();
  const goalURL = page.url();
  const days = page.locator('.goal-day');
  await days.nth(0).getByRole('button', { name: 'Edit day plan' }).click();
  await dialog.getByLabel('Daily target').fill('SELECT basics');
  await dialog.getByRole('button', { name: 'Save day plan' }).click();
  await days.nth(0).getByRole('button', { name: 'Add task' }).click();
  await add(page, 'Practice SELECT');
  await days.nth(1).getByRole('button', { name: 'Edit day plan' }).click();
  await dialog.getByLabel('Daily target').fill('JOIN basics');
  await dialog.getByRole('button', { name: 'Save day plan' }).click();
  await days.nth(1).getByRole('button', { name: 'Add task' }).click();
  await add(page, 'Practice JOIN', 'Other to-do');
  await days.nth(2).getByRole('button', { name: 'Edit day plan' }).click();
  await dialog.getByLabel('Rest day').check();
  await dialog.getByRole('button', { name: 'Save day plan' }).click();
  await expect(days.nth(2).getByText('Rest day')).toBeVisible();
  await menu.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Practice SELECT' }).check();
  await expect(page.getByRole('checkbox', { name: 'Practice SELECT' })).toBeChecked();
  await page.goto(goalURL);
  await expect(page.getByRole('checkbox', { name: 'Practice SELECT' })).toBeChecked();
  await expect(page.getByText('1 of 2 done')).toBeVisible();
  await menu.getByRole('link', { name: 'Profile & Analytics' }).click();
  await expect(page.locator('.metric').filter({ hasText: 'Tasks completed' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.metric').filter({ hasText: 'Must-do completion rate' }).locator('strong')).toHaveText('100%');
  const november = page.getByRole('button', { name: 'November, 1 planned, 1 completed' });
  await november.press('Enter');
  await expect(page.getByRole('heading', { name: 'November daily results' })).toBeVisible();
  const heatDate = page.getByRole('button', { name: /26 Nov 2026, 1 of 1 done/ });
  await heatDate.press('Enter');
  await expect(page).toHaveURL(/#today\/2026-11-26/);
  await page.getByRole('checkbox', { name: 'Practice SELECT' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Practice SELECT' })).not.toBeChecked();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Practice SELECT' })).not.toBeChecked();
  await menu.getByRole('link', { name: 'Profile & Analytics' }).click();
  await expect(page.locator('.metric').filter({ hasText: 'Tasks completed' }).locator('strong')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('recurring scopes and overdue one-time task moves work on the checklist', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-26T10:00:00Z') });
  await page.goto(url + '#today/2026-11-24');
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await dialog.getByLabel('Repeat schedule').selectOption('daily');
  await add(page, 'Daily review');
  await page.getByRole('checkbox', { name: 'Daily review' }).check();
  await expect(page.getByText('Saved on this device')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Edit Daily review' }).click();
  await dialog.getByLabel('Task title').fill('One-day review');
  await dialog.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('checkbox', { name: 'One-day review' })).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Edit Daily review' }).click();
  await dialog.getByLabel('Apply changes to').selectOption('future');
  await dialog.getByLabel('Task title').fill('Future review');
  await dialog.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('checkbox', { name: 'Future review' })).toBeVisible();
  await page.goto(url + '#today/2026-11-24');
  await expect(page.getByRole('checkbox', { name: 'Daily review' })).toBeChecked();
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await add(page, 'Overdue task');
  await page.getByRole('button', { name: 'Back to today' }).click();
  await page.getByRole('button', { name: 'Move to today' }).click();
  await expect(page.getByRole('checkbox', { name: 'Overdue task' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overdue' })).toHaveCount(0);
});

test('device-only data survives a browser restart and disposable task is removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tracker-browser-'));
  let context = await chromium.launchPersistentContext(directory);
  try {
    let page = context.pages()[0];
    await page.goto(url);
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    await add(page, 'Disposable tracker check');
    await page.getByRole('checkbox', { name: 'Disposable tracker check' }).check();
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(directory);
    page = context.pages()[0];
    await page.goto(url);
    await expect(page.getByRole('checkbox', { name: 'Disposable tracker check' })).toBeChecked();
    await page.getByRole('button', { name: 'Edit Disposable tracker check' }).click();
    await page.getByRole('button', { name: 'Remove…' }).click();
    await page.getByRole('button', { name: 'Remove task', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Disposable tracker check' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Disposable tracker check' })).toHaveCount(0);
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
