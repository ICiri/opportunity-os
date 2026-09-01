import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

const staticRoutes = [
  {path: '/', heading: 'Make the next hour count.'},
  {path: '/today', heading: 'Make the next hour count.'},
  {path: '/conversations', heading: 'Conversations'},
  {path: '/opportunities', heading: 'Remote opportunities'},
  {path: '/hunter', heading: 'Daily hunter'},
  {path: '/sources', heading: 'Opportunity source coverage'},
  {path: '/additional-jobs', heading: 'Additional / Freelance jobs'},
  {path: '/bounties', heading: 'Bounties'},
  {path: '/cv-studio', heading: 'CV Studio'},
  {path: '/relationships', heading: 'Paths, not contact lists.'},
  {path: '/planning', heading: 'Build a durable book of business.'},
  {path: '/analytics', heading: 'Communication performance'},
  {path: '/design-audit', heading: 'Design audit'},
  {path: '/design-lab', heading: 'Three ways to build the opportunity OS.'},
  {path: '/companies/volito-digital/graph', heading: 'Volito Digital'},
];

function captureRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()} (${message.location().url})`);
  });
  return failures;
}

async function assertDynamicSurface(page: Page, path: string) {
  const failures = captureRuntimeFailures(page);
  const response = await page.goto(path, {waitUntil: 'networkidle'});
  expect(response?.status(), `${path} HTTP status`).toBe(200);
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document, `${path} document width`).toBeLessThanOrEqual(overflow.viewport + 1);
  const accessibility = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  expect(failures, `${path} browser failures`).toEqual([]);
}

for (const route of staticRoutes) {
  test(`${route.path} renders without runtime, accessibility, or overflow regressions`, async ({page}) => {
    const failures = captureRuntimeFailures(page);
    const response = await page.goto(route.path, {waitUntil: 'networkidle'});

    expect(response?.status(), `${route.path} HTTP status`).toBe(200);
    await expect(page.getByRole('heading', {level: 1, name: route.heading, exact: true})).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);

    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(overflow.document, `${route.path} document width`).toBeLessThanOrEqual(overflow.viewport + 1);

    const accessibility = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
    expect(failures, `${route.path} browser failures`).toEqual([]);
  });
}

test('first real persisted conversation and opportunity render, with truthful opportunity empty state allowed', async ({
  page,
}) => {
  await page.goto('/conversations', {waitUntil: 'networkidle'});
  const conversationPath = await page.locator('a[href^="/conversations/"]').first().getAttribute('href');
  expect(conversationPath).toMatch(/^\/conversations\/[0-9a-f]+$/i);
  await assertDynamicSurface(page, conversationPath!);

  await page.goto('/opportunities', {waitUntil: 'networkidle'});
  const opportunityLinks = page.locator('a[href^="/opportunities/"]');
  if ((await opportunityLinks.count()) === 0) {
    await expect(page.locator('main')).toContainText(
      /no (?:verified|live|persisted|current)|nothing (?:found|available)|run (?:the )?hunter/i,
    );
    return;
  }
  const opportunityPath = await opportunityLinks.first().getAttribute('href');
  expect(opportunityPath).toMatch(/^\/opportunities\/[0-9a-f-]+$/i);
  await assertDynamicSurface(page, opportunityPath!);
});

test('every internal navigation link resolves successfully', async ({page, request}) => {
  await page.goto('/', {waitUntil: 'networkidle'});
  const paths = await page
    .locator('a[href^="/"]')
    .evaluateAll(
      (links) =>
        [...new Set(links.map((link) => (link as HTMLAnchorElement).getAttribute('href')).filter(Boolean))] as string[],
    );

  expect(paths.length).toBeGreaterThanOrEqual(10);
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});

test('unknown dynamic records return truthful not-found responses', async ({request}) => {
  expect((await request.get('/conversations/not-a-real-thread')).status()).toBe(404);
  expect((await request.get('/companies/not-a-real-company/graph')).status()).toBe(404);
  expect((await request.get('/opportunities/not-a-real-opportunity')).status()).toBe(404);
});
