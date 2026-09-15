/* ------------------------------------------------------------------ */
/* Admin reservations and calendar (plan 6.1–6.3, 7.1, 7.3).           */
/* CommonJS: package.json has no "type": "module".                     */
/*                                                                     */
/* Both tests here exist to prove ONE thing: the admin has no side door */
/* around the availability engine. Staff get the same refusal a         */
/* customer gets, with the same alternatives, and a bar dragged onto a  */
/* conflict does not move — in the database or on the screen.           */
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

/**
 * A month far enough ahead that no seeded or real booking is in it, with four
 * days picked so both fixtures sit inside the SAME month window — the calendar
 * shows one window at a time, and a fixture that straddles the edge would make
 * the drag untestable rather than failing honestly.
 */
function farMonth(monthsAhead = 13) {
  const base = new Date();
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthsAhead, 1));
  const ym = d.toISOString().slice(0, 7);
  const at = (day, time) => `${ym}-${String(day).padStart(2, '0')}T${time}:00+01:00`;
  return {
    anchor: `${ym}-01`,
    days: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(),
    a: { startAt: at(10, '10:00'), endAt: at(12, '10:00') },
    b: { startAt: at(15, '10:00'), endAt: at(17, '10:00') },
    /* Five days right lands A exactly on B. */
    dragDays: 5,
  };
}

test.describe('admin reservations', () => {
  test.skip(!OWNER_PASSWORD, 'needs E2E_ADMIN_PASSWORD — a logged-out admin test asserts nothing');
  test.skip(!db.available, 'needs SUPABASE_SERVICE_ROLE_KEY to build the fixtures');

  test.afterEach(async () => {
    await db.cleanup();
  });

  test('a counter booking for the last car is refused with the same alternatives a customer would get', async ({ page }) => {
    const win = farMonth(14);
    const startAt = win.a.startAt;
    const endAt = win.a.endAt;

    const model = await db.pickModelWithAlternatives(startAt, endAt);
    test.skip(!model, 'no free model with a free stablemate in its category for this window');

    /* Take every unit of that model, exactly as customers would have. */
    const taken = await db.bookOut(model.slug, startAt, endAt);
    expect(taken, 'the fixture must actually fill the model').toBeGreaterThan(0);

    await login(page);
    await page.goto('/admin/reservations/nouvelle');

    const form = page.getByTestId('reservation-create');
    await expect(form).toBeVisible({ timeout: 20000 });

    /* Select by the slug's model rather than by index: the option list is
       ordered by the catalogue, not by this test. */
    const options = await form.locator('select[name="vehicle"] option').all();
    let matched = false;
    for (const option of options) {
      if ((await option.getAttribute('value')) === model.slug) {
        await form.locator('select[name="vehicle"]').selectOption(model.slug);
        matched = true;
        break;
      }
    }
    expect(matched, `the sold-out model ${model.slug} must be offered in the admin form`).toBe(true);

    const day = (iso) => iso.slice(0, 10);
    await form.locator('input[type="date"]').first().fill(day(startAt));
    await form.locator('input[type="date"]').nth(1).fill(day(endAt));

    /* Rule 4: the breakdown comes first, and it already knows the car is gone. */
    await page.getByTestId('staff-quote-btn').click();
    await expect(page.getByTestId('staff-quote')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('staff-quote-soldout')).toBeVisible();

    await form.getByLabel('Prénom').fill('E2E');
    await form.getByLabel('Nom', { exact: true }).fill('Comptoir');
    /* By role, not by label: the « Origine » select contains an option
       called « Téléphone », so a label lookup matches two controls. */
    await form.getByRole('textbox', { name: 'Téléphone' }).fill('+212699000900');

    await page.getByTestId('staff-create-btn').click();

    const error = page.getByTestId('staff-create-error');
    await expect(error).toBeVisible({ timeout: 20000 });
    await expect(error).toContainText('CONFLIT');

    /* The alternatives are the database's, not the page's: the same call the
       RPC makes must produce the same names on screen. */
    const alternatives = page.getByTestId('staff-alternatives');
    await expect(alternatives).toBeVisible();
    const shown = await alternatives.locator('li').allInnerTexts();
    expect(shown.length).toBeGreaterThan(0);
    const expected = await db.alternativesFor(model.vehicleId, startAt, endAt);
    expect(shown.join(' | ')).toContain(`${expected[0].brand} ${expected[0].model}`);
  });

  test('dragging a booking onto another one is refused, and the bar goes back', async ({ page }) => {
    const win = farMonth(15);

    /* Two bookings of one model, far apart, both pinned to the SAME plate. */
    const rows = await db.searchAvailability(win.a.startAt, win.a.endAt);
    const row = rows.find((r) => r.units_free > 0);
    test.skip(!row, 'no free unit for the fixture window');

    const units = await db.unitsOf(row.vehicle_id);
    const unit = units.find((u) => !['maintenance', 'blocked', 'out_of_service'].includes(u.status));
    test.skip(!unit, 'no bookable unit on this model');

    const a = await db.makeReservation({ vehicleId: row.vehicle_id, ...win.a, phone: '+212699000901', lastName: 'DragA' });
    const b = await db.makeReservation({ vehicleId: row.vehicle_id, ...win.b, phone: '+212699000902', lastName: 'DragB' });
    await db.setUnit(a.id, unit.id);
    await db.setUnit(b.id, unit.id);

    const before = await db.reservationById(a.id);

    await login(page);
    await page.goto(`/admin/calendrier?zoom=month&at=${win.anchor}`);
    await expect(page.getByTestId('fleet-calendar')).toBeVisible({ timeout: 25000 });

    const bar = page.locator(`[data-reservation="${a.id}"]`);
    await expect(bar).toBeVisible({ timeout: 15000 });
    const track = page.locator(`[data-track][data-unit="${unit.id}"]`).first();

    const barBox = await bar.boundingBox();
    const trackBox = await track.boundingBox();
    const dayWidth = trackBox.width / win.days;

    /* Grab the middle — the outer 8 px of a bar are the resize grips. */
    await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(barBox.x + barBox.width / 2 + dayWidth * win.dragDays, barBox.y + barBox.height / 2, { steps: 15 });
    await page.mouse.up();

    const message = page.getByTestId('calendar-message');
    await expect(message).toBeVisible({ timeout: 20000 });
    await expect(message).toContainText('CONFLIT');
    await expect(message).toContainText(b.reference);

    /* The real revert test is the database, not the pixels: whatever the bar
       looked like mid-drag, the reservation must be exactly where it was. */
    const after = await db.reservationById(a.id);
    expect(after.start_at).toBe(before.start_at);
    expect(after.end_at).toBe(before.end_at);

    /* …and the page agrees, because the override was dropped. */
    await expect(page.getByTestId('fleet-calendar')).toBeVisible();
    const stillThere = await bar.boundingBox();
    expect(Math.abs(stillThere.x - barBox.x)).toBeLessThan(4);
  });
});
