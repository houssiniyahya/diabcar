/**
 * The brand veil's decisions: when the intro plays, and which clicks become a
 * veiled page change. Both fail in ways a visitor feels (an intro on every
 * page, a new-tab click swallowed, a WhatsApp link that animates instead of
 * opening), so each rule is pinned here.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { INTRO_SCRIPT, INTRO_STORAGE_KEY, navigateBehindVeil, registerVeil, tokenMs, veilTarget } from './brandVeil.js';

const HERE = { href: 'https://diabcar.ma/fr/location-voiture-casablanca?from=2026-10-01' };
const click = (over = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over });
const link = (href, over = {}) => ({ href, target: null, download: false, optOut: false, ...over });

describe('veilTarget', () => {
  test('a plain click on a link to another page of the site is veiled', () => {
    assert.equal(veilTarget(click(), link('https://diabcar.ma/fr/faq'), HERE), '/fr/faq');
  });

  test('the destination keeps its query and its hash', () => {
    const href = 'https://diabcar.ma/fr/location-voiture-casablanca/dacia-logan?from=a&to=b#reserver';
    assert.equal(veilTarget(click(), link(href), HERE), '/fr/location-voiture-casablanca/dacia-logan?from=a&to=b#reserver');
  });

  test('a relative href is resolved against the current page', () => {
    assert.equal(veilTarget(click(), link('/ar/contact'), HERE), '/ar/contact');
  });

  test('new-tab and modified clicks keep the browser behaviour', () => {
    const to = link('https://diabcar.ma/fr/faq');
    for (const over of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
      assert.equal(veilTarget(click(over), to, HERE), null, JSON.stringify(over));
    }
    assert.equal(veilTarget(click(), link('https://diabcar.ma/fr/faq', { target: '_blank' }), HERE), null);
    assert.equal(veilTarget(click(), link('https://diabcar.ma/fr/faq', { target: '_self' }), HERE), '/fr/faq');
  });

  test('downloads, opt-outs and clicks something else already handled are left alone', () => {
    assert.equal(veilTarget(click(), link('https://diabcar.ma/fr/faq', { download: true }), HERE), null);
    assert.equal(veilTarget(click(), link('https://diabcar.ma/fr/faq', { optOut: true }), HERE), null);
    assert.equal(veilTarget(click({ defaultPrevented: true }), link('https://diabcar.ma/fr/faq'), HERE), null);
  });

  test('external sites, WhatsApp, phone and e-mail links are never veiled', () => {
    for (const href of ['https://wa.me/212659775582?text=Bonjour', 'tel:+212522260305', 'mailto:diabcar@gmail.com', 'http://diabcar.ma/fr/faq', 'https://maps.google.com/?q=Diab+Car', 'whatsapp://send?phone=212659775582']) {
      assert.equal(veilTarget(click(), link(href), HERE), null, href);
    }
  });

  test('the same page is not a page change: hash jumps, query-only filters, the current URL', () => {
    for (const href of ['#main', '?transmission=automatic', HERE.href, 'https://diabcar.ma/fr/location-voiture-casablanca/', 'https://diabcar.ma/fr/location-voiture-casablanca#flotte']) {
      assert.equal(veilTarget(click(), link(href), HERE), null, href);
    }
  });

  test('files and framework endpoints are not pages', () => {
    for (const href of ['/brand/logo.webp', '/sitemap.xml', '/llms.txt', '/api/quote', '/_next/static/chunk']) {
      assert.equal(veilTarget(click(), link(href), HERE), null, href);
    }
  });

  test('malformed or missing input is refused, never thrown', () => {
    assert.equal(veilTarget(click(), link('http://'), HERE), null);
    assert.equal(veilTarget(click(), link(''), HERE), null);
    assert.equal(veilTarget(click(), null, HERE), null);
    assert.equal(veilTarget(null, link('/fr/faq'), HERE), null);
    assert.equal(veilTarget(click(), link('/fr/faq'), { href: 'not a url' }), null);
  });
});

describe('tokenMs', () => {
  test('reads milliseconds and seconds', () => {
    assert.equal(tokenMs('280ms', '--dur-hover'), 280);
    assert.equal(tokenMs(' 0.38s ', '--dur-panel'), 380);
  });

  test('an unreadable token falls back to its known value, never NaN', () => {
    assert.equal(tokenMs('', '--dur-hover'), 280);
    assert.equal(tokenMs(undefined, '--dur-panel'), 380);
    assert.equal(tokenMs('fast', '--dur-micro'), 160);
    assert.equal(tokenMs('280', '--dur-hover'), 280);
    assert.equal(tokenMs('', '--unknown'), 0);
  });
});

describe('navigateBehindVeil', () => {
  test('with no veil mounted the navigation runs at once, exactly once', () => {
    let runs = 0;
    navigateBehindVeil(() => { runs += 1; });
    assert.equal(runs, 1);
  });

  test('a veil that takes the navigation runs it itself; the caller does not', () => {
    let taken = null;
    let runs = 0;
    const unregister = registerVeil({ cover: (navigate) => { taken = navigate; return true; } });
    navigateBehindVeil(() => { runs += 1; });
    assert.equal(runs, 0);
    taken();
    assert.equal(runs, 1);
    unregister();
  });

  test('a veil that declines, or throws, still lets the navigation run once', () => {
    let runs = 0;
    let unregister = registerVeil({ cover: () => false });
    navigateBehindVeil(() => { runs += 1; });
    unregister();
    unregister = registerVeil({ cover: () => { throw new Error('broken'); } });
    navigateBehindVeil(() => { runs += 1; });
    unregister();
    assert.equal(runs, 2);
  });

  test('an old veil unregistering does not remove the one that replaced it', () => {
    let runs = 0;
    const unregisterOld = registerVeil({ cover: () => false });
    const unregisterNew = registerVeil({ cover: () => true });
    unregisterOld();
    navigateBehindVeil(() => { runs += 1; });
    assert.equal(runs, 0, 'the new veil still holds the slot');
    unregisterNew();
  });
});

describe('INTRO_SCRIPT', () => {
  function run({ stored = null, reduced = false, storageThrows = false, setThrows = false, fontReady = true } = {}) {
    const attrs = {};
    const store = new Map(stored ? [[INTRO_STORAGE_KEY, stored]] : []);
    const sessionStorage = {
      getItem(key) {
        if (storageThrows) throw new Error('denied');
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        if (storageThrows || setThrows) throw new Error('quota');
        store.set(key, value);
      },
    };
    let fontArrives = () => {};
    const fonts = {
      checked: null,
      check(query) {
        this.checked = query;
        return fontReady;
      },
      load() {
        return new Promise((resolve) => {
          fontArrives = resolve;
        });
      },
    };
    const document = {
      fonts,
      documentElement: {
        setAttribute: (key, value) => { attrs[key] = value; },
        removeAttribute: (key) => { delete attrs[key]; },
      },
    };
    const matchMedia = () => ({ matches: reduced });
    const getComputedStyle = () => ({ getPropertyValue: (name) => (name === '--font-display' ? "'__Archivo_abc', '__Archivo_Fallback_abc'" : '') });
    new Function('sessionStorage', 'matchMedia', 'document', 'getComputedStyle', INTRO_SCRIPT)(sessionStorage, matchMedia, document, getComputedStyle);
    return { attrs, store, fonts, fontArrives: () => fontArrives() };
  }

  test('plays on the first page of a tab, and remembers that it did', () => {
    const { attrs, store } = run();
    assert.deepEqual(attrs, { 'data-intro': 'play' });
    assert.equal(store.get(INTRO_STORAGE_KEY), '1');
  });

  test('never plays a second time in the same tab', () => {
    assert.deepEqual(run({ stored: '1' }).attrs, {});
  });

  test('never plays under prefers-reduced-motion', () => {
    assert.deepEqual(run({ reduced: true }).attrs, {});
  });

  test('storage that throws means no intro, since it could never be remembered', () => {
    assert.deepEqual(run({ storageThrows: true }).attrs, {});
  });

  /* The ordering the script depends on: remember first, then play. */
  test('a setItem that throws (a full quota) leaves no intro', () => {
    assert.deepEqual(run({ setThrows: true }).attrs, {});
  });

  test('the mark waits for its own face instead of flashing the fallback, then shows', async () => {
    const intro = run({ fontReady: false });
    assert.equal(intro.attrs['data-intro'], 'play', 'the veil itself never waits');
    assert.equal(intro.attrs['data-intro-font'], 'wait');
    assert.equal(intro.fonts.checked, "700 expanded 1em '__Archivo_abc'");
    intro.fontArrives();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(intro.attrs['data-intro-font'], undefined);
  });
});
