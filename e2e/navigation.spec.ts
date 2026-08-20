import {expect, test} from '@playwright/test';

test('Today decision cards open the selected conversation', async ({page}) => {
  await page.goto('/today');

  const decision = page.locator('.decision').first();
  const company = (await decision.locator('.decision-main b').textContent())?.trim();
  const href = await decision.getAttribute('href');

  expect(href).toMatch(/^\/conversations\/[a-z0-9]+$/);
  await decision.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', {level: 1, name: company, exact: true})).toBeVisible();
});

test('Today primary action opens its conversation', async ({page}) => {
  await page.goto('/today');
  const action = page.getByRole('link', {name: /Open conversation/});
  const href = await action.getAttribute('href');
  expect(href).toMatch(/^\/conversations\/[a-z0-9]+$/i);
  await action.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
});
