'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import BrandLockup from '@/components/site/BrandLockup';
import { VEIL_FAIL_SAFE_MS, VEIL_TIMING, registerVeil, tokenMs, veilTarget } from '@/lib/motion/brandVeil';

/**
 * The page-to-page transition (owner request 2026-09-15; plan §5.3).
 *
 * The sequence:
 *   1. A plain click on a link to another page. The listener runs in the
 *      capture phase, before React, so the link's own navigation is stopped.
 *   2. The veil sweeps in from the inline start and the mark forms with it.
 *   3. Under the closed veil, the route is pushed.
 *   4. The route commits. usePathname from next/navigation gives the REAL
 *      path, so vehicle A → vehicle B counts; next-intl's usePathname returns
 *      the route key, which would not change. The new page jumps to its top in
 *      a layout effect, AFTER Next has written the history entry, so the page
 *      left behind keeps its scroll position for Back.
 *   5. Two frames later, so the new page has painted, the veil sweeps out
 *      through the inline end while the page settles.
 *
 * It can never trap anyone:
 *   - Phases run on timers taken from the motion tokens, not on transitionend,
 *     which does not fire in a background tab.
 *   - A fail-safe lifts the veil after VEIL_FAIL_SAFE_MS whatever the router
 *     does.
 *   - Back/forward during a cover cancels it, and a bfcache restore resets it.
 *   - Reduced motion, an open <dialog> (the top layer would sit above the
 *     veil) and a running theme sweep bypass it completely, and the browser
 *     navigates as usual.
 *
 * Phase changes write one data attribute on the veil. There is no React state,
 * so a navigation costs this component no re-render. `data-ready` marks the
 * moment the listener is live, which is what tests wait for.
 */
export default function RouteVeil() {
  const pathname = usePathname();
  const router = useRouter();
  const veilRef = useRef(null);
  const pathRef = useRef(pathname);
  const runRef = useRef(null);

  useEffect(() => {
    const veil = veilRef.current;
    if (!veil) return undefined;
    const root = document.documentElement;
    const timers = new Set();
    const run = { phase: 'idle', from: null, href: null, pending: null, scrollOnCommit: false, reveal: null };
    runRef.current = run;

    const token = (name) => tokenMs(getComputedStyle(root).getPropertyValue(name), name);
    const later = (fn, delay) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
    };
    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
    const setPhase = (phase) => {
      run.phase = phase;
      veil.dataset.phase = phase;
    };
    const bypass = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      Boolean(document.querySelector('dialog[open]')) ||
      root.hasAttribute('data-theme-sweep');

    /* The intro's attribute also delays the hero ignition (globals.css). */
    const retireIntro = () => {
      if (root.getAttribute('data-intro') === 'play') root.setAttribute('data-intro', 'done');
    };

    /* The new page settles: opacity on <main>, a 12 px rise on its top-level
       blocks. Never a transform on <main> itself. It would become the
       containing block of the fixed bars inside it (the vehicle and results
       mobile bars, the date panel) and drop them off-screen mid-animation.
       Blocks holding such a bar only fade, for the same reason. WAAPI leaves
       nothing behind when it finishes: no lingering transform, no will-change. */
    const settle = () => {
      const main = document.getElementById('main');
      if (!main || typeof main.animate !== 'function') return;
      const easing = getComputedStyle(root).getPropertyValue(VEIL_TIMING.ease).trim() || 'ease-out';
      main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: token(VEIL_TIMING.reveal), easing });
      const duration = token(VEIL_TIMING.enter);
      for (const block of Array.from(main.children).slice(0, 6)) {
        if (block.classList.contains('fixed') || block.querySelector('.fixed')) continue;
        block.animate([{ transform: 'translate3d(0, 12px, 0)' }, { transform: 'none' }], { duration, easing });
      }
    };

    const reveal = () => {
      if (run.phase !== 'covered') return;
      clearTimers();
      setPhase('reveal');
      settle();
      later(() => setPhase('idle'), token(VEIL_TIMING.reveal));
    };
    run.reveal = reveal;

    const dispatch = () => {
      const navigate = run.pending;
      run.pending = null;
      setPhase('covered');
      later(reveal, VEIL_FAIL_SAFE_MS);
      try {
        navigate?.();
      } catch {
        run.scrollOnCommit = false;
        reveal();
      }
    };

    /**
     * @param {() => void} navigate
     * @param {{ toTop?: boolean }} [options] toTop: open the new page at its
     *   top once it commits. False for a destination with a #hash, which the
     *   router scrolls to itself.
     */
    const cover = (navigate, { toTop = true } = {}) => {
      if (run.phase === 'cover') {
        /* A second click while the veil is closing: the latest one wins. */
        run.pending = navigate;
        run.scrollOnCommit = toTop;
        return true;
      }
      if (run.phase !== 'idle' || bypass()) return false;
      /* Whatever the intro was doing, it is over once the visitor moves on. */
      retireIntro();
      run.from = pathRef.current;
      run.pending = navigate;
      run.scrollOnCommit = toTop;
      setPhase('cover');
      later(dispatch, token(VEIL_TIMING.cover));
      return true;
    };

    const onClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor || typeof anchor.href !== 'string') return;
      /* A button or a field inside a link card acts for itself. */
      if (target.closest('a[href], button, input, select, textarea, label, summary, [role="button"]') !== anchor) return;
      const href = veilTarget(
        event,
        { href: anchor.href, target: anchor.getAttribute('target'), download: anchor.hasAttribute('download'), optOut: Boolean(anchor.closest('[data-no-veil]')) },
        window.location,
      );
      if (!href) return;
      const hasHash = href.includes('#');

      if (run.phase === 'covered') {
        /* The veil is closed and a navigation is in flight. The veil takes the
           pointer, so this is a keyboard activation of the still-focused link:
           it must not start a second navigation around the veil (for a plain
           <a>, a whole document load). A different destination replaces the
           one in flight. */
        event.preventDefault();
        if (href !== run.href) {
          run.href = href;
          run.scrollOnCommit = !hasHash;
          router.push(href, { scroll: hasHash });
        }
        return;
      }

      if (!cover(() => router.push(href, { scroll: hasHash }), { toTop: !hasHash })) return;
      run.href = href;
      /* Taken. Next's <Link> sees defaultPrevented and stands down, and a
         plain <a> does not start a document load. */
      event.preventDefault();
      try {
        router.prefetch(href.split('#')[0]);
      } catch {
        /* prefetch is only a head start */
      }
    };

    const onPopState = () => {
      run.scrollOnCommit = false;
      if (run.phase === 'cover') {
        clearTimers();
        run.pending = null;
        setPhase('idle');
      } else if (run.phase === 'covered') {
        reveal();
      }
    };

    const onPageShow = (event) => {
      if (!event.persisted) return;
      clearTimers();
      run.pending = null;
      run.scrollOnCommit = false;
      setPhase('idle');
    };

    /* Retire the intro's attribute once the intro has REALLY finished (the
       sweep's own `finished` promise), plus the length of the ignition it
       hands over to. Not a timer from hydration: a tab opened in the
       background runs no animation until it is shown, and would have the
       intro cut off mid-sweep. */
    let alive = true;
    let introTimer = 0;
    const afterIntro = () => {
      if (alive) introTimer = window.setTimeout(retireIntro, token('--dur-hero'));
    };
    const watchIntro = () => {
      if (!alive || root.getAttribute('data-intro') !== 'play') return;
      const sweep = document.getAnimations().find((a) => typeof a.animationName === 'string' && a.animationName.startsWith('veil-sweep-out'));
      if (sweep) sweep.finished.then(afterIntro, afterIntro);
      else afterIntro();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      requestAnimationFrame(watchIntro);
    };
    if (root.getAttribute('data-intro') === 'play') {
      if (document.visibilityState === 'hidden') document.addEventListener('visibilitychange', onVisible);
      else watchIntro();
    }

    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pageshow', onPageShow);
    const unregister = registerVeil({ cover });
    veil.dataset.ready = '';

    return () => {
      alive = false;
      delete veil.dataset.ready;
      unregister();
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(introTimer);
      clearTimers();
      runRef.current = null;
    };
  }, [router]);

  /* The veiled route has committed. Next wrote its history entry in an
     insertion effect earlier in this same commit, so jumping to the top NOW
     leaves the page we came from with its real scroll position for Back, and
     happens before paint. It runs even if the fail-safe already lifted the
     veil, so a late route still opens at its top, like any link. */
  useLayoutEffect(() => {
    const from = runRef.current?.from;
    pathRef.current = pathname;
    const run = runRef.current;
    if (!run || !run.scrollOnCommit || pathname === from) return;
    run.scrollOnCommit = false;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  /* ...then give it two frames to paint, and lift. */
  useEffect(() => {
    const run = runRef.current;
    if (!run || run.phase !== 'covered' || pathname === run.from) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => run.reveal?.());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [pathname]);

  return (
    <div ref={veilRef} className="brand-veil brand-veil--route dark" data-phase="idle" aria-hidden="true" data-testid="route-veil">
      <span className="brand-veil__stage">
        <BrandLockup />
      </span>
    </div>
  );
}
