/* ------------------------------------------------------------------ */
/* The brand veil: first-visit intro and page transitions (plan §5.3). */
/*                                                                     */
/* These pin what makes the veil SAFE rather than pretty. It never     */
/* hides the hero or blocks a click, plays once per tab, never exists  */
/* under reduced motion, never fires where the browser's own behaviour */
/* is expected, navigates exactly once, keeps Back returning to where  */
/* the visitor was, and cannot leave anyone behind a closed curtain.   */
/*                                                                     */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

const FLEET = '/fr/location-voiture-casablanca';

/** The veil's listener is live (set by RouteVeil after hydration, never in the server HTML). */
const ready = (page) => expect(page.getByTestId('route-veil')).toHaveAttribute('data-ready', '', { timeout: 20000 });

/** Record every phase the route veil passes through from now on, with its time. */
async function recordPhases(page) {
  await page.evaluate(() => {
    const veil = document.querySelector('[data-testid="route-veil"]');
    if (window.__veilObserver) window.__veilObserver.disconnect();
    window.__veilPhases = [];
    window.__veilObserver = new MutationObserver(() => window.__veilPhases.push({ phase: veil.dataset.phase, at: performance.now() }));
    window.__veilObserver.observe(veil, { attributes: true, attributeFilter: ['data-phase'] });
  });
}
const phases = (page) => page.evaluate(() => (window.__veilPhases || []).map((p) => p.phase));
const coveredFor = (page) =>
  page.evaluate(() => {
    const list = window.__veilPhases || [];
    const covered = list.find((p) => p.phase === 'covered');
    const reveal = list.find((p) => p.phase === 'reveal');
    return covered && reveal ? reveal.at - covered.at : null;
  });
const style = (locator, prop) => locator.evaluate((el, p) => getComputedStyle(el)[p], prop);

test.describe('the brand intro', () => {
  test('plays on the first page of a tab, over a painted hero, without taking a click, and only once', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/fr', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'play');

    const intro = page.getByTestId('brand-intro');
    expect(await style(intro, 'pointerEvents')).toBe('none');
    /* Rule 6: the LCP image is at full opacity under the intro, never hidden by it. */
    expect(await style(page.getByTestId('hero-car'), 'opacity')).toBe('1');

    /* Retired once the intro and the ignition it hands over to have finished. */
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'done', { timeout: 10000 });
    expect(await style(intro, 'visibility')).toBe('hidden');
    await expect(page.locator('h1')).toHaveCount(1);
    /* The mark is generated content, not page text (scripts excluded, since the
       flight data legitimately carries the attribute). */
    const text = await page.evaluate(() => {
      const body = document.body.cloneNode(true);
      body.querySelectorAll('script, style').forEach((el) => el.remove());
      return body.textContent;
    });
    expect(text).not.toMatch(/RENT A CAR/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await page.locator('html').getAttribute('data-intro')).toBeNull();
  });

  test('never exists under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/fr', { waitUntil: 'domcontentloaded' });
    expect(await page.locator('html').getAttribute('data-intro')).toBeNull();
    expect(await style(page.getByTestId('brand-intro'), 'display')).toBe('none');
  });

  test('is not on the admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('brand-intro')).toHaveCount(0);
    await expect(page.getByTestId('route-veil')).toHaveCount(0);
  });
});

test.describe('the page transition', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('home → fleet: closes, navigates, lifts on arrival, and gives the page back', async ({ page }) => {
    await page.goto('/fr');
    await ready(page);
    const veil = page.getByTestId('route-veil');
    await expect(veil).toHaveAttribute('data-phase', 'idle');
    await recordPhases(page);

    await page.locator(`header a[href="${FLEET}"]`).first().click();
    await page.waitForURL((url) => url.pathname === FLEET, { timeout: 20000 });
    await expect(veil).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });

    expect(await phases(page)).toEqual(['cover', 'covered', 'reveal', 'idle']);
    /* Lifted by the route arriving, not by the 2.5 s fail-safe. */
    expect(await coveredFor(page)).toBeLessThan(2400);
    expect(await style(veil, 'pointerEvents')).toBe('none');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('vehicle → another vehicle (same route, new slug) lifts on arrival', async ({ page }) => {
    await page.goto(FLEET);
    await ready(page);
    await page.locator(`main a[href^="${FLEET}/"]:visible`).first().click();
    await page.waitForURL((url) => url.pathname.startsWith(`${FLEET}/`), { timeout: 20000 });
    const veil = page.getByTestId('route-veil');
    await expect(veil).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });

    const here = new URL(page.url()).pathname;
    const other = page.locator(`main a[href^="${FLEET}/"]:not([href^="${here}"]):visible`).first();
    await expect(other).toBeVisible({ timeout: 20000 });
    const target = (await other.getAttribute('href')).split('?')[0];
    await recordPhases(page);
    await other.click();
    await page.waitForURL((url) => url.pathname === target, { timeout: 20000 });
    await expect(veil).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });
    expect(await phases(page)).toEqual(['cover', 'covered', 'reveal', 'idle']);
    expect(await coveredFor(page)).toBeLessThan(2400);
  });

  /* The review's finding: scrolling to the top BEFORE the push saved 0 as the
     list's position, so Back landed at the top instead of on the car. */
  test('Back from a page reached through the veil returns to where the visitor was in the list', async ({ page }) => {
    await page.goto(FLEET);
    await ready(page);
    const links = page.locator(`main a[href^="${FLEET}/"]:visible`);
    await expect(links.first()).toBeVisible({ timeout: 20000 });
    const link = links.nth(Math.min((await links.count()) - 1, 8));
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => window.scrollY);
    expect(before, 'the card must be far enough down the list for this to mean anything').toBeGreaterThan(400);

    await link.click();
    await page.waitForURL((url) => url.pathname.startsWith(`${FLEET}/`), { timeout: 20000 });
    await expect(page.getByTestId('route-veil')).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });
    expect(await page.evaluate(() => window.scrollY), 'the vehicle page opens at its top').toBe(0);

    await page.goBack();
    await page.waitForURL((url) => url.pathname === FLEET, { timeout: 20000 });
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBeGreaterThan(before - 150);
  });

  test('back and forward are left to the browser', async ({ page }) => {
    await page.goto('/fr');
    await ready(page);
    await page.locator(`header a[href="${FLEET}"]`).first().click();
    await page.waitForURL((url) => url.pathname === FLEET, { timeout: 20000 });
    await expect(page.getByTestId('route-veil')).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });

    await recordPhases(page);
    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/fr', { timeout: 20000 });
    await page.goForward();
    await page.waitForURL((url) => url.pathname === FLEET, { timeout: 20000 });
    await page.waitForTimeout(800);
    expect(await phases(page)).toEqual([]);
  });

  test('a hash jump, a query-only link, the current page and a modified click are left alone', async ({ page, context }) => {
    await page.goto(FLEET);
    await ready(page);
    await expect(page.getByTestId('route-veil')).toHaveAttribute('data-phase', 'idle');
    await page.evaluate((fleet) => {
      const box = document.createElement('div');
      box.innerHTML = `<a data-probe="hash" href="#main">h</a> <a data-probe="query" href="?transmission=automatic">q</a> <a data-probe="same" href="${fleet}">s</a> <a data-probe="other" href="/fr/faq">o</a>`;
      box.style.cssText = 'position:fixed;top:120px;inset-inline-start:8px;z-index:65;background:#fff;padding:8px';
      /* The veil decides in the capture phase, before this. Cancelling the
         probes' own navigation here, afterwards, keeps the page (and the
         recorder) in place: what is under test is the veil's decision. A
         modified click is let through, so it really opens a new tab. */
      box.addEventListener('click', (e) => {
        if (!e.ctrlKey && !e.metaKey) e.preventDefault();
      });
      document.body.appendChild(box);
    }, FLEET);
    await recordPhases(page);

    for (const probe of ['hash', 'query', 'same']) await page.locator(`[data-probe="${probe}"]`).click();
    const popup = context.waitForEvent('page');
    await page.locator('[data-probe="other"]').click({ modifiers: ['ControlOrMeta'] });
    await (await popup).close();

    await page.waitForTimeout(600);
    expect(await phases(page)).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(FLEET);
  });

  test('under reduced motion a link navigates straight away, with no veil', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/fr');
    await ready(page);
    await recordPhases(page);
    await page.locator(`header a[href="${FLEET}"]`).first().click();
    await page.waitForURL((url) => url.pathname === FLEET, { timeout: 20000 });
    await page.waitForTimeout(400);
    expect(await phases(page)).toEqual([]);
  });

  test('the mobile menu navigates exactly once, behind the veil', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('/fr');
    await ready(page);
    await page.evaluate(() => {
      window.__pushes = 0;
      const push = history.pushState;
      history.pushState = function pushState(...args) {
        window.__pushes += 1;
        return push.apply(this, args);
      };
    });
    await recordPhases(page);

    await page.locator('header button[aria-controls="mobile-menu"]').click();
    await page.locator(`#mobile-menu nav a[href="${FLEET}"]`).click();
    await page.waitForURL((url) => url.pathname === FLEET, { timeout: 20000 });
    await expect(page.getByTestId('route-veil')).toHaveAttribute('data-phase', 'idle', { timeout: 10000 });
    await page.waitForTimeout(600);

    expect(await phases(page)).toEqual(['cover', 'covered', 'reveal', 'idle']);
    expect(await page.evaluate(() => window.__pushes)).toBe(1);
    /* The menu's scroll lock is released on arrival. */
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await ctx.close();
  });

  test('a route that never answers cannot keep the veil closed', async ({ page }) => {
    /* Hang every router request under the fleet path (navigation and
       prefetch payloads alike); only a real document load is let through. */
    await page.route(
      (url) => url.pathname.startsWith(FLEET),
      (route, request) => (request.resourceType() === 'document' ? route.continue() : undefined),
    );
    await page.goto('/fr');
    await ready(page);
    const veil = page.getByTestId('route-veil');
    await recordPhases(page);
    await page.locator(`header a[href="${FLEET}"]`).first().click();
    await expect(veil).toHaveAttribute('data-phase', 'idle', { timeout: 6000 });

    expect(await phases(page)).toEqual(['cover', 'covered', 'reveal', 'idle']);
    /* It was the fail-safe that lifted it: the route never arrived. */
    expect(new URL(page.url()).pathname).toBe('/fr');
    expect(await coveredFor(page)).toBeGreaterThanOrEqual(2400);
    expect(await style(veil, 'pointerEvents')).toBe('none');
  });

  test('sweeps with the reading direction', async ({ page }) => {
    await page.goto('/fr', { waitUntil: 'domcontentloaded' });
    expect(await style(page.getByTestId('route-veil'), 'clipPath')).toBe('inset(0px 100% 0px 0px)');
    await page.goto('/ar', { waitUntil: 'domcontentloaded' });
    expect(await style(page.getByTestId('route-veil'), 'clipPath')).toBe('inset(0px 0px 0px 100%)');
  });
});
