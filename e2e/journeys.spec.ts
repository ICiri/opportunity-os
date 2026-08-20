import {expect, test} from '@playwright/test';

test('Search Now reports the truthful terminal result from real configured sources', async ({page}, testInfo) => {
  test.skip(
    testInfo.project.name.includes('mobile'),
    'The real provider run is exercised once; mobile rendering is covered by route regression.',
  );
  await page.goto('/');
  await page.getByRole('button', {name: 'SEARCH NOW'}).click();
  const status = page.locator('.run-chip > span');
  await expect(status).toHaveText(/^(SUCCESS|PARTIAL_SUCCESS|FAILED|AUDIT_FAILED|CANCELLED)$/, {timeout: 30_000});
  await expect(page.locator('.run-chip')).toContainText(/source coverage of configured runnable sources/i);
  await expect(page.locator('.run-chip')).toContainText(/\d+\/\d+ live/i);
});

test('real private conversation flow, CV preview and approval stay human-controlled', async ({page}) => {
  await page.goto('/conversations');
  await expect(page.getByText('PRIVATE DB CONNECTED', {exact: true})).toBeVisible();

  const repliedWithPdf = page
    .locator('a.ledger-row[href^="/conversations/"]')
    .filter({hasText: /\d+ inbound/i})
    .filter({hasText: /\d+ PDF/i})
    .first();
  await expect(repliedWithPdf).toBeVisible();
  const href = await repliedWithPdf.getAttribute('href');
  expect(href).toMatch(/^\/conversations\/[0-9a-f]+$/i);
  await repliedWithPdf.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  await expect(page.getByText('Sent email', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Received reply', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('My last email', {exact: true}).first()).toBeVisible();
  const attachment = page.locator('.attachment-card').first();
  await expect(attachment).toBeVisible();
  await expect(attachment).toContainText(/\.pdf/i);

  await attachment.getByRole('button', {name: 'Preview CV template'}).click();
  const cv = page.getByRole('dialog', {name: 'CV preview'});
  await expect(cv).toBeVisible();
  await expect(cv.locator('iframe')).toHaveAttribute('src', '/api/cv-files/english');
  await page.keyboard.press('Escape');

  await page.getByRole('button', {name: /Why this action/}).click();
  await expect(page.getByRole('dialog', {name: 'Why this action?'})).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', {name: 'Review message'}).click();
  const review = page.getByRole('dialog', {name: 'Review suggested message'});
  await review.getByLabel('Suggested email draft').fill('Edited test-only message. Nothing should be sent.');
  await review.getByRole('button', {name: 'Copy edited message'}).click();
  await expect(review.getByText('Edited text copied. Nothing was sent.')).toBeVisible();
  const approve = review.getByRole('button', {name: 'Approve locally'});
  await expect(approve).toBeDisabled();
  await review.getByRole('checkbox').check();
  await approve.click();
  await expect(page.getByText('Approved locally. No email was sent.')).toBeVisible();
});

test('a persisted opportunity opens and seeds CV Studio, or the UI tells the truth when none exist', async ({page}) => {
  await page.goto('/opportunities');
  const opportunityLink = page.locator('a[href^="/opportunities/"]').first();

  if ((await opportunityLink.count()) === 0) {
    await expect(page.locator('main')).toContainText(
      /no (?:verified|live|persisted|current)|nothing (?:found|available)|run (?:the )?hunter/i,
    );
    await page.goto('/cv-studio');
    await expect(page.getByLabel('CV opportunity')).toBeDisabled();
    await expect(page.getByRole('button', {name: 'Generate source-linked OpenAI draft'})).toBeDisabled();
    await expect(page.getByRole('button', {name: 'Save encrypted draft'})).toBeDisabled();
    return;
  }

  const href = await opportunityLink.getAttribute('href');
  expect(href).toMatch(/^\/opportunities\/[0-9a-f-]+$/i);
  const opportunityId = href!.split('/').at(-1)!;
  await opportunityLink.click();
  await expect(page).toHaveURL(new RegExp(`/opportunities/${opportunityId}$`));
  await page.getByRole('link', {name: /Generate tailored CV|Prepare a CV draft/i}).click();
  await expect(page).toHaveURL(new RegExp(`/cv-studio\?opportunity=${opportunityId}`));
  await expect(page.getByLabel('CV opportunity')).toHaveValue(opportunityId);
  await expect(page.getByRole('button', {name: 'Generate source-linked OpenAI draft'})).toBeEnabled();
  await expect(page.getByRole('button', {name: 'Save encrypted draft'})).toBeEnabled();
});

test('bounties are separate and scope-gated', async ({page}) => {
  await page.goto('/bounties');
  await expect(page.getByRole('heading', {name: 'Bounties'})).toBeVisible();
  await expect(page.getByText('Scope is a hard gate')).toBeVisible();
  await expect(page.getByText(/VERIFY SCOPE/).first()).toBeVisible();
});

test('planning controls recalculate and copy action gives feedback', async ({page}) => {
  await page.goto('/planning');
  const annualRevenue = page.getByText('1-year modeled revenue').locator('..').locator('b');
  const initial = await annualRevenue.textContent();
  await page.getByRole('button', {name: 'growth'}).click();
  await expect(annualRevenue).not.toHaveText(initial ?? '');
  await page.getByLabel('Booked revenue target').fill('60000');
  await page.getByRole('button', {name: 'Copy template'}).first().click();
  await expect(page.getByText('Copied to clipboard.')).toBeVisible();
});
