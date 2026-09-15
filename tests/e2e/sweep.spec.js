/* ------------------------------------------------------------------ */
/* The sweep: every route, both themes, the two writing directions.    */
/* CommonJS: package.json has no "type": "module".                     */
/*                                                                     */
/* The feature specs prove behaviour. This one proves nothing is       */
/* quietly broken on a page nobody wrote a spec for: a console error,  */
/* a missing or doubled H1, a server error, a page that only renders   */
/* in the theme the developer happened to be using (CLAUDE.md rule 3). */
/* A red here names a URL, a theme and a locale — the bug-report        */
/* template, generated instead of typed.                               */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');
const db = require('./helpers/db');

/* The admin login comes from the environment only. This repository is public,
   and the live owner account's e-mail is not something to publish. With either
   variable missing the password is empty, so every admin test skips. */
const OWNER_EMAIL = process.env.E2E_ADMIN_EMAIL || '';
const OWNER_PASSWORD = OWNER_EMAIL ? process.env.E2E_ADMIN_PASSWORD || '' : '';

/** Noise that is not a bug: a lazily loaded asset the sandbox never had. */
const IGNORED_CONSOLE = [/favicon/i, /the server responded with a status of 404/i, /ResizeObserver loop/i];

const PUBLIC = ['/', '/location-voiture-casablanca', '/location-voiture-aeroport-casablanca', '/faq', '/contact', '/a-propos', '/blog', '/location-voiture-longue-duree-casablanca'];
const ADMIN = [
  '/admin', '/admin/reservations', '/admin/reservations/nouvelle', '/admin/calendrier', '/admin/clients',
  '/admin/flotte', '/admin/flotte/unites', '/admin/operations/departs', '/admin/operations/retours',
  '/admin/contenu/faq', '/admin/contenu/blog', '/admin/contenu/avis', '/admin/tarifs', '/admin/parametres',
  '/admin/seo', '/admin/journal', '/admin/notifications', '/admin/systeme',
];

/** Public slugs are French in the FR locale; the other locales map them. */
const LOCALIZED = {
  '/location-voiture-casablanca': { en: '/car-rental-casablanca', ar: '/car-rental-casablanca' },
  '/location-voiture-aeroport-casablanca': { en: '/car-rental-casablanca-airport', ar: '/car-rental-casablanca-airport' },
  '/location-voiture-longue-duree-casablanca': { en: '/long-term-car-rental-casablanca', ar: '/long-term-car-rental-casablanca' },
  '/a-propos': { en: '/about', ar: '/about' },
};
const localized = (path, locale) => (locale === 'fr' ? path : (LOCALIZED[path] || {})[locale] || path);

function watchConsole(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function login(page) {
  await page.goto('/admin/login');
  await page.locator('input[name="email"], input[type="email"]').first().fill(OWNER_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/?$/, { timeout: 25000 });
}

for (const theme of ['light', 'dark']) {
  for (const locale of ['fr', 'ar']) {
    test.describe(`public · ${locale} · ${theme}`, () => {
      test.use({ colorScheme: theme });

      for (const path of PUBLIC) {
        test(`${localized(path, locale)}`, async ({ page }) => {
          const errors = watchConsole(page);
          const res = await page.goto(`/${locale}${localized(path, locale)}`);
          expect(res.status(), 'the page must answer 200').toBe(200);

          /* One H1, and exactly one (plan 8.2). */
          await expect(page.locator('h1')).toHaveCount(1);

          /* html carries the direction, and Arabic is RTL (plan 4.12). */
          expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar' ? 'rtl' : 'ltr');
          expect(await page.locator('html').getAttribute('lang')).toMatch(new RegExp(`^${locale}`));

          /* No hidden body text was painted black-on-black or white-on-white:
             the body background must be a real colour in both themes. */
          const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          expect(bg, 'body must paint its own background').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

          expect(errors, `console on ${locale}${path} (${theme}):\n${errors.join('\n')}`).toEqual([]);
        });
      }
    });
  }
}

test.describe('admin · every route · both themes', () => {
  test.skip(!OWNER_PASSWORD, 'needs E2E_ADMIN_PASSWORD');
  test.skip(!db.available, 'needs a database');

  for (const theme of ['light', 'dark']) {
    test.describe(theme, () => {
      test.use({ colorScheme: theme });

      test(`all ${ADMIN.length} routes render without errors`, async ({ page }) => {
        test.setTimeout(120_000);
        await login(page);
        const failures = [];
        for (const path of ADMIN) {
          const errors = watchConsole(page);
          const res = await page.goto(path);
          const status = res ? res.status() : 0;
          const h1s = await page.locator('h1').count();
          /* The dashboard's greeting is its H1; every other page owns one. */
          if (status !== 200) failures.push(`${path}: HTTP ${status}`);
          if (h1s !== 1) failures.push(`${path}: ${h1s} h1 elements`);
          if (errors.length) failures.push(`${path}: ${errors.join(' | ')}`);
          /* The French admin must never show a raw error boundary. */
          const body = await page.locator('body').innerText();
          if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(body)) failures.push(`${path}: error boundary`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
      });
    });
  }
});
