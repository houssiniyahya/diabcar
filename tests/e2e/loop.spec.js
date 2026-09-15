/* ------------------------------------------------------------------ */
/* The closed loop (plan 7.1, 6.3): a booking is confirmed, handed      */
/* over, returned, cleaned and sold again — and public availability      */
/* follows every step by itself, with nothing pressed to publish it.     */
/* CommonJS: package.json has no "type": "module".                     */
/*                                                                     */
/* The window deliberately STARTS IN HALF AN HOUR. The cleaning block  */
/* written by a return covers [now, now + cleaning_minutes), so a       */
/* booking that begins inside it is the only kind whose availability    */
/* the return can actually change. A window next month would come back */
/* on sale the moment the reservation ended, block or no block, and the */
/* test would prove nothing about « Marquer prête ».                    */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

/* The admin login comes from the environment only. This repository is public,
   and the live owner account's e-mail is not something to publish. With either
   variable missing the password is empty, so every admin test skips. */
const OWNER_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const OWNER_PASSWORD = OWNER_EMAIL ? process.env.E2E_ADMIN_PASSWORD || '' : '';

async function login(page) {
  await page.goto('/admin/login');
  await page.locator('input[name="email"], input[type="email"]').first().fill(OWNER_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/?$/, { timeout: 25000 });
}

/** Starts at the next full hour at least 30 min away; lasts two days. */
function soonWindow() {
  const from = new Date(Date.now() + 30 * 60000);
  from.setUTCMinutes(0, 0, 0);
  from.setUTCHours(from.getUTCHours() + 1);
  return { from: from.toISOString(), to: new Date(from.getTime() + 2 * 86400000).toISOString() };
}

/** What the public results page renders for one model, straight from its JSON route. */
async function publicAvailability(request, slug, w) {
  const res = await request.get(`/api/availability?${new URLSearchParams({ startAt: w.from, endAt: w.to })}`);
  expect(res.ok(), '/api/availability must answer').toBe(true);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : json.vehicles || json.rows || json.results || json.data || [];
  const row = rows.find((r) => r.slug === slug);
  expect(row, `the public route must list ${slug}`).toBeTruthy();
  return { available: row.available ?? (row.unitsFree ?? row.units_free ?? 0) > 0, unitsFree: row.unitsFree ?? row.units_free };
}

test.describe('the closed loop', () => {
  test.skip(!OWNER_PASSWORD, 'needs E2E_ADMIN_PASSWORD');
  test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY');

  /* Two round trips to Supabase per step, a real login and two checklists. */
  test.setTimeout(180_000);

  let unitId = null;

  test.afterEach(async () => {
    await db.resetUnit(unitId);
    await db.cleanup();
  });

  test('booking → confirm → départ → retour → prête → bookable again', async ({ page, request }) => {
    const w = soonWindow();

    /* ---------------- 1. a customer booking exists ---------------------
       Created through `create_reservation()` — the same RPC any front end
       calls — rather than by driving a funnel, because the public booking flow
       was removed pending its redesign (owner, Sept 2026) and this test is
       about the OPERATIONAL loop that follows a booking, not about the screen
       that made it. When the new flow lands, drive it here instead. */
    const rows = await db.searchAvailability(w.from, w.to);
    const row = rows.find((r) => r.units_free > 0);
    test.skip(!row, 'no free model for the fixture window');
    const slug = row.slug;

    const freeBefore = await db.freeUnits(slug, w.from, w.to);
    expect(freeBefore, 'the fixture model must have a free unit').toBeGreaterThan(0);

    const created = await db.makeReservation({
      vehicleId: row.vehicle_id,
      startAt: w.from,
      endAt: w.to,
      phone: '+212699005500',
      lastName: 'Loop',
    });
    expect(created?.reference, 'the booking must exist in Postgres').toMatch(/^DC-/);
    expect(await db.freeUnits(slug, w.from, w.to), 'a pending booking already holds a car').toBe(freeBefore - 1);

    /* ---------------- 2. assign a unit and confirm, from the admin ------ */
    await login(page);
    page.on('dialog', (d) => d.accept());
    await page.goto(`/admin/reservations/${created.id}`);
    await expect(page.getByTestId('reservation-actions')).toBeVisible({ timeout: 20000 });

    await page.locator('[data-testid="reservation-actions"] [data-unit]').first().click();
    await expect(page.getByRole('status')).toContainText('Enregistré', { timeout: 20000 });
    await page.locator('[data-testid="reservation-actions"] [data-action="confirmed"]').click();
    await expect.poll(async () => (await db.reservationById(created.id)).status, { timeout: 20000 }).toBe('confirmed');

    const assigned = await db.reservationById(created.id);
    unitId = assigned.unit_id;
    expect(unitId, 'a unit must be assigned before a pickup').toBeTruthy();

    /* ---------------- 3. départ: the pickup checklist ------------------- */
    await page.goto(`/admin/operations/checklist/${created.id}?mode=pickup`);
    await expect(page.getByTestId('pickup-checklist')).toBeVisible({ timeout: 20000 });
    await page.getByLabel('Identité vérifiée').check();
    await page.getByLabel('Documents vérifiés').check();
    await page.getByLabel('Unité correcte').check();
    await page.getByTestId('pickup-mileage').fill('12000');
    await page.getByTestId('pickup-fuel').fill('80');
    await page.getByTestId('pickup-received').fill('900');
    await page.getByTestId('pickup-deposit').fill('3000');
    await page.getByTestId('pickup-submit').click();
    await page.waitForURL(/\/admin\/operations\/departs/, { timeout: 30000 });

    expect((await db.reservationById(created.id)).status).toBe('active');
    expect((await db.unitById(unitId)).status).toBe('rented');

    /* ---------------- 4. retour: the return checklist ------------------- */
    await page.goto(`/admin/operations/checklist/${created.id}?mode=return`);
    await expect(page.getByTestId('return-checklist')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('return-mileage').fill('12310');
    await page.getByTestId('return-fuel').fill('60');
    await page.getByTestId('return-submit').click();
    await page.waitForURL(/\/admin\/operations\/retours/, { timeout: 30000 });

    expect((await db.reservationById(created.id)).status).toBe('returned');
    const dirty = await db.unitById(unitId);
    expect(dirty.status).toBe('cleaning');
    expect(dirty.mileage_km, 'the checklist mileage is written to the unit').toBe(12310);
    const blocks = await db.blocksFor(unitId);
    expect(blocks.some((b) => b.kind === 'cleaning'), 'a return writes a cleaning block').toBe(true);

    /* The reservation no longer holds the car; only the cleaning block does.
       For a window that starts inside it, the car must be OFF sale. */
    expect(await db.freeUnits(slug, w.from, w.to), 'dirty car must not be sold').toBe(freeBefore - 1);
    expect((await publicAvailability(request, slug, w)).unitsFree, 'the public route agrees').toBe(freeBefore - 1);

    /* The « à préparer » list knows about it. */
    await expect(page.getByTestId('to-prepare')).toContainText(dirty.plate);

    /* ---------------- 5. prête: back on sale, nothing else pressed ------ */
    await page.goto(`/admin/flotte/unites/${unitId}`);
    await expect(page.getByTestId('unit-editor')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('mark-ready').click();
    await expect.poll(async () => (await db.unitById(unitId)).status, { timeout: 20000 }).toBe('available');

    expect((await db.blocksFor(unitId)).filter((b) => b.kind === 'cleaning').length, 'the cleaning block is closed').toBe(0);
    expect(await db.freeUnits(slug, w.from, w.to), 'the car sells again for the same dates').toBe(freeBefore);
    expect((await publicAvailability(request, slug, w)).unitsFree).toBe(freeBefore);

    /* …and the public results page shows it as available, no cache to bust. */
    await page.goto(`/fr/location-voiture-casablanca?${new URLSearchParams({ from: w.from, to: w.to })}`);
    const card = page.locator(`[data-slug="${slug}"]`).first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).not.toHaveClass(/opacity-70/);
  });
});
