/* ------------------------------------------------------------------ */
/* The admin (plan 3, 7.1–7.4).                                        */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

/* The admin login comes from the environment only. This repository is public,
   and the live owner account's e-mail is not something to publish. With either
   variable missing the password is empty, so every admin test skips. */
const OWNER_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const OWNER_PASSWORD = OWNER_EMAIL ? process.env.E2E_ADMIN_PASSWORD || '' : '';

/** The admin is reachable at /admin on localhost (the proxy strips it on the admin host). */
async function login(page) {
  await page.goto('/admin/login');
  await page.locator('input[name="email"], input[type="email"]').first().fill(OWNER_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/?$/, { timeout: 25000 });
}

test.describe('admin', () => {
  test.skip(
    !OWNER_PASSWORD,
    'needs E2E_ADMIN_PASSWORD — a login test that cannot log in would assert nothing',
  );

  test('an owner sees the dashboard, the whole nav, and their role', async ({ page }) => {
    await login(page);

    await expect(page.getByTestId('dashboard-strip')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('fleet-status')).toBeVisible();
    await expect(page.getByTestId('admin-search')).toBeVisible();
    await expect(page.getByTestId('admin-bell')).toBeVisible();

    /* The role comes from the `user_role` JWT claim written by the access-token
       hook, which is the same value the RLS policies read (plan 7.2). */
    await expect(page.locator('aside').getByText(/^owner$/i)).toBeVisible();

    /* An owner sees the money sections. */
    await expect(page.locator('aside nav').getByRole('link', { name: 'Tarifs' })).toBeVisible();
    await expect(page.locator('aside nav').getByRole('link', { name: 'Paramètres' })).toBeVisible();
  });

  test('the dashboard shows real fleet numbers, not zeros', async ({ page }) => {
    await login(page);
    const fleet = page.getByTestId('fleet-status');
    await expect(fleet).toBeVisible({ timeout: 20000 });

    /* The guard against the bug this rebuild fixed: the Supabase adapter used
       to read staff-only tables with the ANONYMOUS client, so every table in
       the admin rendered empty under RLS with no error at all. A non-zero
       total is the proof the session client is being used. */
    const text = await fleet.innerText();
    const total = Number(text.match(/Total\s+(\d+)/)?.[1] ?? 0);
    expect(total, 'the fleet must not read as empty — that means an anon client').toBeGreaterThan(0);
  });

  test('the journal lists audit entries with a diff', async ({ page }) => {
    await login(page);
    await page.goto('/admin/journal');

    const entries = page.getByTestId('journal-entries');
    await expect(entries).toBeVisible({ timeout: 20000 });
    expect(await entries.locator('> li').count()).toBeGreaterThan(0);

    /* Opening one shows the before/after, which is the point of the page. */
    await entries.locator('> li').first().locator('summary').click();
    await expect(entries.locator('> li').first()).toContainText(/Aucun champ modifié|[a-z_]+/);
  });

  test('keyboard: / focuses search, g j jumps to the journal', async ({ page }) => {
    await login(page);
    /* Wait for HYDRATION, not just for markup: the shortcut lives in an effect,
       and pressing "/" before the shell mounts hits nothing. The strip is
       server-rendered, so waiting for it alone was not enough. */
    await expect(page.getByTestId('dashboard-strip')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('/');
    await expect(page.getByTestId('admin-search')).toBeFocused();

    /* Leave the field before trying a letter shortcut — they must never fire
       while someone is typing, which is exactly what this proves. */
    await page.getByTestId('admin-search').evaluate((el) => el.blur());
    await page.keyboard.press('g');
    await page.keyboard.press('j');
    await page.waitForURL(/\/admin\/journal/, { timeout: 10000 });
  });

  test('a letter shortcut does NOT fire while typing in the search box', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('dashboard-strip')).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState('networkidle');

    const search = page.getByTestId('admin-search');
    await search.click();
    await search.type('gj');
    /* Still on the dashboard, and the letters landed in the field. */
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(search).toHaveValue('gj');
  });
});

test.describe('admin notifications', () => {
  test.skip(!OWNER_PASSWORD || !db.available, 'needs admin credentials and a database');

  test('a new reservation raises the bell without a reload', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('dashboard-strip')).toBeVisible({ timeout: 20000 });

    /* Wait for the channel to be ESTABLISHED before creating anything. A
       postgres_changes INSERT that fires before SUBSCRIBED is simply never
       delivered, and the test then waits for an event that will not come —
       which is exactly how this failed intermittently. */
    await expect(page.getByTestId('admin-bell')).toHaveAttribute('data-live', 'true', { timeout: 25000 });

    const before = Number((await page.getByTestId('admin-bell-count').innerText().catch(() => '0')) || 0);

    /* Create a reservation the way the public site does — through the RPC —
       and let the DB trigger and Realtime do the rest. Nothing is clicked in
       the admin: the whole point is that the bell moves on its own. */
    const w = (() => {
      const from = new Date(Date.now() + 300 * 86400000);
      from.setUTCHours(10, 0, 0, 0);
      return { from: from.toISOString(), to: new Date(from.getTime() + 2 * 86400000).toISOString() };
    })();

    const rows = await db.searchAvailability(w.from, w.to);
    const target = rows.find((r) => r.units_free > 0);
    expect(target, 'need one bookable car').toBeTruthy();

    try {
      const created = await db.tryBook(target.vehicle_id, w.from, w.to, '+212699001234');
      expect(created.ok, `booking must succeed: ${JSON.stringify(created)}`).toBe(true);

      await expect
        .poll(async () => Number((await page.getByTestId('admin-bell-count').innerText().catch(() => '0')) || 0), {
          timeout: 20000,
          message: 'the bell must increment over Realtime, with no navigation',
        })
        .toBeGreaterThan(before);
    } finally {
      await db.cleanup();
    }
  });
});
