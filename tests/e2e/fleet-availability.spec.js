/* ------------------------------------------------------------------ */
/* The model page: photos first, the category under the name, and the  */
/* availability timeline (owner request 2026-09-16; plan 7.1).         */
/*                                                                     */
/* The claim this proves end to end, against the same API the public   */
/* booking calendar reads: what the owner marks « indisponible du … au */
/* … » on the car page is what the WEBSITE stops offering — those days  */
/* exactly, not the day before or after — the moment it is saved; and a */
/* booking taken by the agency is confirmed on the spot, blocks its     */
/* dates, and frees them again when cancelled from its bar. Nothing     */
/* here trusts the admin's own display for that: every availability    */
/* assertion goes through /api/vehicle-calendar.                        */
/*                                                                     */
/* Needs a real owner login and the database (fixtures are cleaned up   */
/* in `finally`, by the marker the whole suite uses).                   */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

const OWNER_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const OWNER_PASSWORD = OWNER_EMAIL ? process.env.E2E_ADMIN_PASSWORD || '' : '';
const MARK = 'E2E-FLEET-AVAIL';

const plus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const freeOn = (calendar, day) => calendar?.days?.find((d) => d.day === day)?.free;

async function login(page) {
  await page.goto('/admin/login');
  await page.locator('input[name="email"], input[type="email"]').first().fill(OWNER_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 });
}

/**
 * The first published model with plates, every plate for sale, and nothing on
 * its timeline — so every count below is ours. Returns its page, its slug and
 * how many cars the website can sell.
 */
async function pickQuietModel(page) {
  await page.goto('/admin/flotte');
  const hrefs = await page.locator('a[href^="/admin/flotte/"]:not([href*="unites"]):not([href$="nouveau"])').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  for (const href of hrefs.slice(0, 12)) {
    await page.goto(href);
    await expect(page.getByTestId('vehicle-availability')).toBeVisible({ timeout: 20000 });
    const header = await page.locator('[data-testid="vehicle-category"] + span').first().innerText();
    if (/brouillon/.test(header)) continue;
    const rows = page.locator('[data-testid^="timeline-row-"]:not([data-testid="timeline-row-unassigned"])');
    const unitCount = await rows.count();
    if (unitCount === 0) continue;
    if ((await page.locator('[data-testid^="timeline-bar-"]').count()) > 0) continue;
    if ((await rows.filter({ hasText: 'hors site' }).count()) > 0) continue;
    return { href, unitCount, slug: header.match(/\/([a-z0-9-]+)/)[1] };
  }
  return null;
}

test.describe('the model page', () => {
  test.skip(!OWNER_PASSWORD, 'needs E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');
  test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY to clean up its fixtures');

  test('photos before the name, the category under it, and a period marked unavailable is gone from the website — those days exactly — until it is removed', async ({ page, request }) => {
    test.setTimeout(180000);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await login(page);

    const model = await pickQuietModel(page);
    test.skip(!model, 'no published model with plates and a free timeline in the next six weeks');
    const { unitCount, slug } = model;

    /* ---- the header: photos, then the name, then the category ---- */
    const order = await page.evaluate(() => {
      const y = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + window.scrollY : null;
      };
      return { strip: y('[data-testid="vehicle-photo-strip"]'), h1: y('main h1'), category: y('[data-testid="vehicle-category"]'), images: document.querySelectorAll('[data-testid="vehicle-photo-strip"] img').length };
    });
    expect(order.strip, 'the photo strip exists').not.toBeNull();
    expect(order.strip, 'the photos come before the name').toBeLessThan(order.h1);
    expect(order.images, 'the strip shows at least one image').toBeGreaterThan(0);
    expect(order.category, 'the category is right under the name').toBeGreaterThan(order.h1);
    expect(order.category - order.h1).toBeLessThan(80);
    await expect(page.locator('h1')).toHaveCount(1);

    const calendar = async (from, to) => (await request.get(`/api/vehicle-calendar?vehicle=${slug}&from=${from}&to=${to}`)).json();
    const from = plus(20);
    const to = plus(22);

    try {
      const before = await calendar(plus(18), plus(25));
      expect(before.unitsTotal, 'the site sells every plate of this model').toBe(unitCount);
      expect(freeOn(before, from), 'the site offers every unit before the block').toBe(unitCount);

      /* ---- rendre indisponible, every unit ---- */
      await page.selectOption('#unavail-choice', 'offsite');
      if (unitCount > 1) await page.selectOption('#unavail-unit', 'all');
      await page.fill('#unavail-from', from);
      await page.fill('#unavail-to', to);
      await page.fill('#unavail-reason', `M. Test ${MARK}`);
      await page.getByTestId('unavailable-submit').click();
      await expect(page.getByTestId('availability-message')).toContainText('Indisponible du', { timeout: 20000 });
      await expect(page.getByTestId('availability-message')).toContainText('Le site ne propose plus ce modèle sur ces dates.');

      await expect.poll(async () => freeOn(await calendar(plus(18), plus(25)), plus(21)), { timeout: 15000 }).toBe(0);
      const after = await calendar(plus(18), plus(25));
      expect(freeOn(after, from), 'first day taken on the site').toBe(0);
      expect(freeOn(after, to), 'last day (inclusive) taken on the site').toBe(0);
      expect(freeOn(after, plus(19)), 'the day before stays for sale').toBe(unitCount);
      expect(freeOn(after, plus(23)), 'the day after stays for sale').toBe(unitCount);
      await expect(page.locator('[data-testid^="timeline-bar-"][data-kind="block"]')).toHaveCount(unitCount, { timeout: 20000 });

      /* ---- and removed from its bar, with a reason ---- */
      for (let i = 0; i < unitCount; i += 1) {
        await page.locator('[data-testid^="timeline-bar-"][data-kind="block"]').first().click();
        await page.getByTestId('delete-block').click();
        await expect(page.getByTestId('availability-message')).toContainText('motif', { timeout: 20000 });
        await page.fill('#delete-block-reason', `test ${MARK}`);
        await page.getByTestId('delete-block').click();
        await expect(page.getByTestId('availability-message')).toContainText('supprimée', { timeout: 20000 });
        await expect(page.locator('[data-testid^="timeline-bar-"][data-kind="block"]')).toHaveCount(unitCount - i - 1, { timeout: 20000 });
      }
      await expect.poll(async () => freeOn(await calendar(plus(18), plus(25)), from), { timeout: 15000 }).toBe(unitCount);
      expect(pageErrors, 'no uncaught error in the page').toEqual([]);
    } finally {
      await db.cleanup();
    }
  });

  test('a booking taken by the agency is confirmed at once, blocks its dates on the site, and frees them when cancelled from its bar', async ({ page, request }) => {
    test.setTimeout(180000);
    await login(page);

    const model = await pickQuietModel(page);
    test.skip(!model, 'no published model with plates and a free timeline in the next six weeks');
    const { href: modelHref, unitCount, slug } = model;
    const calendar = async (from, to) => (await request.get(`/api/vehicle-calendar?vehicle=${slug}&from=${from}&to=${to}`)).json();
    const from = plus(30);
    const to = plus(32);

    try {
      /* The model page links here with the car and the dates already chosen. */
      await page.goto(`/admin/reservations/nouvelle?vehicle=${slug}&from=${from}&to=${to}`);
      const form = page.getByTestId('reservation-create');
      await expect(form).toBeVisible({ timeout: 20000 });
      await expect(form.locator('select[name="vehicle"]')).toHaveValue(slug);
      await expect(form.locator('input[type="date"]').first()).toHaveValue(from);
      await expect(form.locator('input[type="date"]').nth(1)).toHaveValue(to);

      await page.getByTestId('staff-quote-btn').click();
      await expect(page.getByTestId('staff-quote')).toBeVisible({ timeout: 15000 });
      await form.getByLabel('Prénom').fill('E2E');
      await form.getByLabel('Nom', { exact: true }).fill(MARK);
      /* By role: the « Origine » select has an option called « Téléphone ». */
      await form.getByRole('textbox', { name: 'Téléphone' }).fill('+212699000950');
      await form.getByLabel('E-mail').fill('e2e-fleet-avail@example.invalid');
      await page.getByTestId('staff-create-btn').click();
      await page.waitForURL((u) => /\/admin\/reservations\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('nouvelle'), { timeout: 30000 });
      const id = page.url().split('/').pop();

      /* The status badge is uppercased by CSS, so the database is asked, not the pixels. */
      const row = await db.reservationById(id);
      expect(row?.status, 'an agency booking is confirmed on the spot').toBe('confirmed');
      expect(row?.unit_id, 'and gets a car, so nothing can be scheduled onto it').toBeTruthy();
      await expect(page.locator('main')).toContainText(/confirmée/i);

      await expect.poll(async () => freeOn(await calendar(plus(29), plus(34)), plus(31)), { timeout: 15000 }).toBe(unitCount - 1);

      await page.goto(modelHref);
      const bar = page.getByTestId(`timeline-bar-${id}`);
      await expect(bar).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId(`timeline-row-${row.unit_id}`).getByTestId(`timeline-bar-${id}`)).toBeVisible();
      await bar.click();
      await page.fill('#cancel-reason', `test ${MARK}`);
      await page.getByTestId('cancel-reservation').click();
      await expect(page.getByTestId('availability-message')).toContainText('annulée', { timeout: 20000 });
      await expect(bar).toHaveCount(0, { timeout: 20000 });
      await expect.poll(async () => freeOn(await calendar(plus(29), plus(34)), plus(31)), { timeout: 15000 }).toBe(unitCount);
    } finally {
      await db.cleanup();
    }
  });

  test('a prefill for a car that is not listed never books another car', async ({ page }) => {
    await login(page);
    await page.goto(`/admin/reservations/nouvelle?vehicle=no-such-model&from=${plus(30)}&to=${plus(32)}`);
    const form = page.getByTestId('reservation-create');
    await expect(form).toBeVisible({ timeout: 20000 });
    await expect(form.locator('select[name="vehicle"]')).toHaveValue('');
    await expect(page.getByTestId('staff-vehicle-missing')).toBeVisible();

    await page.goto('/admin/reservations/nouvelle?vehicle=x&from=2026-02-31&to=nope');
    await expect(form.locator('input[type="date"]').first()).toHaveValue('');
  });
});
