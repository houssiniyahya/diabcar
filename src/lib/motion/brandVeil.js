/**
 * The brand veil: Diab Car's first-visit intro and its page-to-page transition
 * (owner request, 2026-09-15; docs/MASTER-PLAN.md §1 and §5.3).
 *
 * Everything here is framework-free, so it can be unit-tested and shared by a
 * server component (BrandIntro), the client controller (RouteVeil) and any
 * component that navigates from code (the search form):
 *   - the blocking script that decides whether the intro plays,
 *   - the predicate that decides whether a click becomes a veiled navigation,
 *   - the reader for the motion tokens that time it,
 *   - a one-slot registry, so a navigation can go behind the veil without
 *     importing the veil component.
 *
 * Timing lives in CSS. Every duration is a motion token from
 * src/styles/globals.css, read at run time, so no number here can drift from
 * the stylesheet. The only literal is the fail-safe, which is a timeout, not a
 * motion.
 */

/** The mark the veil shows. Latin in every locale, like the header wordmark. */
export const BRAND_WORDMARK = 'DIAB CAR';
export const BRAND_TAGLINE = 'RENT A CAR';

/** sessionStorage key: set once the intro has played in this tab. */
export const INTRO_STORAGE_KEY = 'dc.intro';

/**
 * Blocking inline script, run by the parser before the intro markup exists. An
 * effect would run after paint, so the page would flash and then the veil
 * would drop over it.
 *
 * It plays only when storage works (otherwise the intro could never be
 * remembered and would replay on every load) and the visitor has not asked for
 * reduced motion. Storage is written before the attribute, so a throwing
 * setItem leaves no intro. Without JavaScript there is no attribute and no
 * intro, which is the right fallback.
 *
 * The mark is set in Archivo at width 125 (--font-display, preloaded). On a
 * first visit that face can still be downloading when the intro starts, and
 * DIAB CAR would appear in the Arial fallback and visibly change width
 * mid-intro. So when the face is not ready yet, the script holds the mark back
 * (data-intro-font="wait") and lets it fade in the moment the font arrives.
 * The veil itself never waits: with a late font it sweeps away on time,
 * unmarked. The stylesheet is parsed before this body script runs, so the
 * family name can be read from the variable next/font set on <html>.
 */
export const INTRO_SCRIPT = `try{if(!sessionStorage.getItem('${INTRO_STORAGE_KEY}')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){sessionStorage.setItem('${INTRO_STORAGE_KEY}','1');var d=document.documentElement;d.setAttribute('data-intro','play');var f=getComputedStyle(d).getPropertyValue('--font-display').split(',')[0].trim(),q='700 expanded 1em '+f,ok=function(){d.removeAttribute('data-intro-font')};if(f&&document.fonts&&!document.fonts.check(q)){d.setAttribute('data-intro-font','wait');document.fonts.load(q).then(ok,ok)}}}catch(e){}`;

/** Which motion token times each part of the page transition. */
export const VEIL_TIMING = Object.freeze({
  /** the veil sweeps in from the inline start */
  cover: '--dur-hover',
  /** the veil sweeps out through the inline end */
  reveal: '--dur-hover',
  /** the new page settles (opacity and a 12 px rise) */
  enter: '--dur-panel',
  /** easing of the settle; the sweeps use --ease-inout in the stylesheet */
  ease: '--ease-out',
});

/**
 * Not a motion duration: the longest the veil may stay closed while a slow
 * route loads. Past it the veil lifts anyway (the old page may show for a
 * moment until the new one arrives), because a visitor must never be left
 * behind a curtain. The navigation itself is never cancelled.
 */
export const VEIL_FAIL_SAFE_MS = 2500;

/** Token values at the time of writing, used only when a token cannot be read. */
const TOKEN_FALLBACK_MS = { '--dur-micro': 160, '--dur-hover': 280, '--dur-panel': 380, '--dur-section': 600, '--dur-hero': 900 };

/**
 * A CSS time ("280ms", "0.28s") in milliseconds.
 * @param {string} raw computed value of the custom property
 * @param {string} token its name, which selects the fallback
 * @returns {number}
 */
export function tokenMs(raw, token) {
  const text = String(raw ?? '').trim();
  const value = Number.parseFloat(text);
  const fallback = TOKEN_FALLBACK_MS[token] ?? 0;
  if (!Number.isFinite(value) || value < 0) return fallback;
  if (text.endsWith('ms')) return value;
  if (text.endsWith('s')) return value * 1000;
  return fallback;
}

/** "/fr/faq/" and "/fr/faq" are the same page. */
const samePath = (a, b) => (a.length > 1 ? a.replace(/\/+$/, '') : a) === (b.length > 1 ? b.replace(/\/+$/, '') : b);

/**
 * Should this click become a veiled page change? Returns the path to navigate
 * to (pathname + search + hash), or null to leave the click entirely alone.
 *
 * Deliberately conservative: only a plain left click on a same-origin link to
 * ANOTHER page qualifies. Everything else keeps the browser's own behaviour.
 *
 * @param {{ button: number, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, defaultPrevented?: boolean }} event
 * @param {{ href: string, target?: string|null, download?: boolean, optOut?: boolean }} anchor
 * @param {{ href: string }} current the page's own location
 * @returns {string|null}
 */
export function veilTarget(event, anchor, current) {
  if (!event || !anchor || !current) return null;
  if (event.defaultPrevented) return null;
  /* Middle click, and Ctrl/Cmd/Shift/Alt clicks, open new tabs or windows. */
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (anchor.optOut || anchor.download) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (typeof anchor.href !== 'string' || !anchor.href) return null;

  let here;
  let url;
  try {
    here = new URL(current.href);
    url = new URL(anchor.href, here);
  } catch {
    return null;
  }

  /* tel:, mailto:, whatsapp: and anything else that is not a web page. */
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== here.origin) return null;
  /* Still this page: a hash jump, a query-only change (the fleet filters keep
     their own history handling), or the link to where the visitor already is. */
  if (samePath(url.pathname, here.pathname)) return null;
  /* Files and framework endpoints are not pages. */
  if (/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return null;

  return url.pathname + url.search + url.hash;
}

let activeVeil = null;

/**
 * Called by the mounted veil. The veil's `cover(navigate)` returns true when it
 * has taken the navigation (and will run it), false when the caller should run
 * it now.
 * @param {{ cover: (navigate: () => void) => boolean }} veil
 * @returns {() => void} unregister
 */
export function registerVeil(veil) {
  activeVeil = veil;
  return () => {
    if (activeVeil === veil) activeVeil = null;
  };
}

/**
 * Run a navigation behind the veil when one is mounted and allowed to play,
 * otherwise right now. Either way the navigation runs exactly once.
 * @param {() => void} navigate
 */
export function navigateBehindVeil(navigate) {
  if (activeVeil) {
    try {
      if (activeVeil.cover(navigate)) return;
    } catch {
      /* a broken veil must never cost the visitor the navigation */
    }
  }
  navigate();
}
