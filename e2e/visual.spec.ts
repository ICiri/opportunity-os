import {expect, test} from '@playwright/test';

const routes = [
  ['today', '/'],
  ['planning', '/planning'],
  ['relationships', '/relationships'],
  ['company-360', '/companies/volito-digital/graph'],
] as const;

for (const [name, route] of routes) {
  test(`${name} visual baseline`, async ({page}) => {
    await page.goto(route, {waitUntil: 'networkidle'});
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      mask: [page.locator('.sidebar-foot')],
      maskColor: '#1e262a',
    });
  });
}

test('real conversation visual baseline with private text masked', async ({page}) => {
  await page.goto('/conversations');
  const link = page.locator('a.ledger-row[href^="/conversations/"]').first();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/conversations\/[a-z0-9]+$/i);
  await page.goto(href!, {waitUntil: 'networkidle'});
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveScreenshot('conversation.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    mask: [
      page.locator('.sidebar-foot'),
      page.locator('.mail-body'),
      page.locator('.message header'),
      page.locator('.attachment-card'),
    ],
    maskColor: '#1e262a',
  });
});
