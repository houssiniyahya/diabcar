/* ------------------------------------------------------------------ */
/* Unverified claims never reach a visitor (CLAUDE.md rule 11).        */
/*                                                                     */
/* The founding year is a CLAIM. `public_settings` returns it only once */
/* `verified_claims.foundedYear` is true, and the demo adapter does the */
/* same. The About page defeated both — twice:                          */
/*   - the intro used `foundedYear || 2013`, and                        */
/*   - its SEO title said "…depuis 2013", which put the year in the     */
/*     <title> Google shows as the result headline, in the og/twitter   */
/*     titles, and in the share-image URL a WhatsApp or Facebook link   */
/*     preview renders.                                                  */
/* The first version of this spec checked only the intro, passed, and   */
/* missed the second. So it now checks everything a crawler, a search    */
/* result or a link preview reads, not just the page body.              */
/*                                                                     */
/* Written as a CONSISTENCY check so it stays true the day the owner    */
/* verifies the year: the Organization JSON-LD carries `foundingDate`    */
/* exactly when the year is verified (src/lib/seo.js). With no           */
/* foundingDate, no founding year may appear anywhere below; with one,   */
/* every year that does appear must be that one.                         */
/*                                                                     */
/* CommonJS: package.json has no "type": "module".                     */
/* ------------------------------------------------------------------ */

const { test, expect } = require('@playwright/test');

/* The intro phrase that introduces the year, per locale, from messages/*.json. */
const ABOUT = [
  { locale: 'fr', path: '/fr/a-propos', phrase: /fondée à Casablanca en\s*(\d{4})/ },
  { locale: 'en', path: '/en/about', phrase: /founded in Casablanca in\s*(\d{4})/ },
  { locale: 'ar', path: '/ar/about', phrase: /تأسست في الدار البيضاء سنة\s*(\d{4})/ },
  { locale: 'es', path: '/es/sobre-nosotros', phrase: /fundada en Casablanca en\s*(\d{4})/ },
];

/* A plausible founding year standing on its own. `\b` keeps it from matching
   inside a longer number such as a cache-busting timestamp. */
const YEAR = /\b(19\d{2}|20\d{2})\b/g;

for (const { locale, path, phrase } of ABOUT) {
  test(`${locale}: no founding year anywhere on the About page unless it is verified`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: 'load' });
    expect(res.status(), `${path} must load`).toBe(200);

    const html = await page.content();
    const verified = (html.match(/"foundingDate":"(\d{4})"/) || [])[1] || null;

    /* Everything outside the page body that still reaches a person: the tab and
       search-result title, the share previews, and the generated share image. */
    const head = await page.evaluate(() => {
      const meta = (sel) => document.querySelector(sel)?.getAttribute('content') || '';
      return {
        title: document.title,
        description: meta('meta[name="description"]'),
        ogTitle: meta('meta[property="og:title"]'),
        ogDescription: meta('meta[property="og:description"]'),
        twitterTitle: meta('meta[name="twitter:title"]'),
        ogImage: decodeURIComponent(meta('meta[property="og:image"]').replace(/\+/g, ' ')),
      };
    });

    /* The structured data a crawler reads as the page's own name. Only name-like
       fields are collected: dateModified, datePublished and the like legitimately
       carry years, and would make this check cry wolf. */
    const ldNames = await page.evaluate(() => {
      const out = [];
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return undefined;
        for (const [key, value] of Object.entries(node)) {
          if ((key === 'name' || key === 'headline' || key === 'alternateName') && typeof value === 'string') out.push(value);
          else if (value && typeof value === 'object') walk(value);
        }
        return undefined;
      };
      for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          walk(JSON.parse(el.textContent));
        } catch {
          /* a malformed block is another test's business */
        }
      }
      return out;
    });
    ldNames.forEach((value, i) => {
      head[`jsonLdName${i}`] = value;
    });

    const intro = (await page.locator('main').innerText()).match(phrase);

    for (const [field, value] of Object.entries(head)) {
      const years = value.match(YEAR) || [];
      if (!verified) {
        expect(years, `${path} ${field} states a year with none verified: "${value}"`).toEqual([]);
      } else {
        for (const y of years) expect(y, `${path} ${field} states ${y}, but the verified year is ${verified}`).toBe(verified);
      }
    }

    if (!verified) {
      expect(intro, `no verified year, so the ${path} intro must not say when Diab Car was founded`).toBeNull();
    } else {
      expect(intro, `a verified year (${verified}) is published, so the intro should state it`).not.toBeNull();
      expect(intro[1], 'the intro and the structured data must state the same year').toBe(verified);
    }
  });
}
