'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import Logo from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import LanguageSwitcher from '@/components/site/LanguageSwitcher';
import { CurrencyToggle } from '@/components/site/CurrencyProvider';
import { WhatsAppIcon } from '@/components/site/icons';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatPhone } from '@/lib/format';
import { genericMessage, whatsappLink } from '@/lib/whatsapp';

/**
 * Plan 4.1: never more than 6 links. Flotte - Aeroport - Services (dropdown)
 * - FAQ - Contact.
 *
 * `ready: false` means the ROUTE does not exist yet: /livraison and
 * /automatique are built in PROMPT 13 and have no entry in
 * src/i18n/routing.js, so a next-intl <Link> would throw and a plain <a>
 * would land on the localized 404 ([locale]/[...rest] calls notFound()).
 * They therefore render as listed-but-inert rows carrying the `soon` marker.
 * Prompt 13 adds the pathnames and flips these two flags to `true`.
 */
const NAV = [
  { key: 'fleet', href: '/vehicules' },
  { key: 'airport', href: '/aeroport' },
  {
    key: 'services',
    children: [
      { key: 'longTerm', href: '/longue-duree', ready: true },
      { key: 'delivery', href: '/livraison', ready: false },
      { key: 'automatic', href: '/automatique', ready: false },
    ],
  },
  { key: 'faq', href: '/faq' },
  { key: 'contact', href: '/contact' },
];

const SERVICES = NAV.find((item) => item.children)?.children ?? [];
const SERVICES_PENDING = SERVICES.filter((child) => !child.ready);

/** Plan 4.1 mobile: exactly 5 links in Display-2 (the dropdown collapses to its live child). */
const MOBILE_NAV = NAV.flatMap((item) => (item.children ? item.children.filter((c) => c.ready).slice(0, 1) : [item]));

function isActive(pathname, href) {
  if (!href) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Reads --dur-hover so the mobile line/navigate handshake stays tied to the token. */
function hoverDuration() {
  if (typeof window === 'undefined') return 280;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-hover').trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 280;
  return raw.endsWith('ms') ? value : value * 1000;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * THE RED LINE as the active marker (plan 2.4 / 4.1). The wrapper is sized by
 * the label, so `.redline` (100% wide, clipped to 40px at rest) expands from
 * 40px to exactly the label width on [data-active] and on group hover.
 *
 * @param {{ children: React.ReactNode, active?: boolean }} props
 */
function LineLabel({ children, active }) {
  return (
    <span className="relative inline-flex flex-col">
      <span>{children}</span>
      {/* --redline-rest: 0 so an INACTIVE item shows no red at all. The 40px
          rest state is right for a section rule, but under every nav label it
          would put red on ~6 items at once and red is a signal, not a texture
          (plan 2.2: <= 5% of any screen). Active / hovered still expands to 100%. */}
      <span
        className="redline absolute -bottom-1.5 start-0 end-0"
        style={{ '--redline-rest': '0px' }}
        data-active={active ? '' : undefined}
        aria-hidden="true"
      />
    </span>
  );
}

/** Vertical chevron: it points down/up, so it must NOT be mirrored in RTL. */
function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
      style={{ transitionDuration: 'var(--dur-micro)', transitionTimingFunction: 'var(--ease-out)' }}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Site header (plan 4.1).
 *
 * @param {object} props
 * @param {string} [props.phone] E.164 primary phone from settings.
 * @param {string} [props.whatsapp] E.164 WhatsApp number from settings.
 * @param {boolean} [props.transparent] Start transparent over the hero and go
 *   solid after 24px of scroll. The hero is white in light and near-black in
 *   dark, and every header colour is a theme token, so the transparent state
 *   stays legible in both.
 */
export default function Header({ phone, whatsapp, transparent = false }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [pending, setPending] = useState(-1);

  const servicesRef = useRef(null);
  const servicesButtonRef = useRef(null);
  const servicesItemsRef = useRef([]);
  const focusFirstRef = useRef(false);
  const finePointerRef = useRef(false);
  const burgerRef = useRef(null);
  const timerRef = useRef(null);

  /* --- scroll state (unchanged: it works) --------------------------- */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* --- close everything on route change ------------------------------
     Derived during render, not in an effect: an effect would paint one frame
     of the new route with the old menu still open. */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setServicesOpen(false);
    setPending(-1);
  }

  /* --- scroll lock while the full-screen panel is up ----------------- */
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  /* --- the panel is mobile-only: never leave it open past lg --------- */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 64rem)');
    const onChange = (e) => {
      if (e.matches) setOpen(false);
    };
    if (mq.matches) setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /* --- hover-to-open only for a fine pointer ------------------------- */
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const sync = () => {
      finePointerRef.current = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* --- dropdown: outside click --------------------------------------- */
  useEffect(() => {
    if (!servicesOpen) return undefined;
    const onPointerDown = (e) => {
      if (servicesRef.current && !servicesRef.current.contains(e.target)) setServicesOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [servicesOpen]);

  /* --- dropdown: ArrowDown from the trigger lands on the first item --- */
  useEffect(() => {
    if (!servicesOpen || !focusFirstRef.current) return;
    focusFirstRef.current = false;
    servicesItemsRef.current.find(Boolean)?.focus();
  }, [servicesOpen]);

  /* --- Escape closes the panel from anywhere, focus goes back to the burger */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      burgerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /* --- the mobile timeout must never outlive the component ----------- */
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const closeServices = useCallback((refocus) => {
    setServicesOpen(false);
    if (refocus) servicesButtonRef.current?.focus();
  }, []);

  function onServicesKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeServices(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = servicesItemsRef.current.filter(Boolean);
    if (!items.length) return;
    if (e.target === servicesButtonRef.current) {
      e.preventDefault();
      if (!servicesOpen) {
        focusFirstRef.current = true;
        setServicesOpen(true);
        return;
      }
      items[e.key === 'ArrowDown' ? 0 : items.length - 1].focus();
      return;
    }
    const index = items.indexOf(e.target);
    if (index === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  }

  function onServicesBlur(e) {
    const next = e.relatedTarget;
    if (next && servicesRef.current && !servicesRef.current.contains(next)) setServicesOpen(false);
  }

  /**
   * Plan 4.1 mobile: the red line slides under the tapped item, THEN we
   * navigate. Reduced motion skips the wait entirely.
   */
  function onMobileNavigate(e, href, index) {
    /* The brand veil took this click in the capture phase and navigates once
       it has closed (RouteVeil.js); a second push from here would race it. */
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    if (prefersReducedMotion()) {
      router.push(href);
      return;
    }
    setPending(index);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      router.push(href);
    }, hoverDuration());
  }

  const servicesActive = SERVICES.some((child) => isActive(pathname, child.href));
  const solid = scrolled || !transparent;
  const waLink = whatsapp ? whatsappLink(whatsapp, genericMessage(locale)) : null;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter]',
        // The full-screen menu is black in BOTH themes (plan 4.1). `dark` on the
        // header makes the BLACKLINE dark tokens resolve for the bar and the
        // panel alike - not a single hex is written here.
        open && 'dark',
        open
          ? 'border-b border-transparent bg-bg'
          : solid
            ? 'border-b border-border/80 bg-bg/85 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/70'
            : 'border-b border-transparent bg-transparent',
      )}
      style={{ height: 'var(--header-h)', transitionDuration: 'var(--dur-hover)', transitionTimingFunction: 'var(--ease-out)' }}
    >
      <div className="container-x flex h-full items-center justify-between gap-4">
        <Link href="/" className="shrink-0 rounded-button">
          <Logo withBadge />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t('primaryNav')}>
          {NAV.map((item) => {
            if (item.children) {
              return (
                <div
                  key={item.key}
                  ref={servicesRef}
                  className="relative"
                  onKeyDown={onServicesKeyDown}
                  onBlur={onServicesBlur}
                  onPointerEnter={() => finePointerRef.current && setServicesOpen(true)}
                  onPointerLeave={() => finePointerRef.current && setServicesOpen(false)}
                >
                  <button
                    type="button"
                    ref={servicesButtonRef}
                    id="services-trigger"
                    aria-haspopup="true"
                    aria-expanded={servicesOpen}
                    aria-controls="services-menu"
                    onClick={() => setServicesOpen((v) => !v)}
                    className={cn(
                      'group inline-flex h-11 items-center gap-1.5 rounded-button px-3 text-[0.9375rem] font-medium transition-colors',
                      servicesActive || servicesOpen ? 'text-text' : 'text-text-2 hover:text-text',
                    )}
                    style={{ transitionDuration: 'var(--dur-hover)' }}
                  >
                    <LineLabel active={servicesActive}>{t(item.key)}</LineLabel>
                    <Chevron open={servicesOpen} />
                  </button>

                  <div
                    id="services-menu"
                    aria-labelledby="services-trigger"
                    className={cn(
                      'absolute start-0 top-full z-50 mt-2 w-60 rounded-card border border-border bg-surface-1 p-1.5 shadow-float transition-[opacity,transform,visibility]',
                      servicesOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
                    )}
                    style={{ transitionDuration: 'var(--dur-panel)', transitionTimingFunction: 'var(--ease-out)' }}
                  >
                    <ul className="flex flex-col">
                      {item.children.map((child, i) => {
                        if (!child.ready) {
                          // Route ships in prompt 13 - listed, marked, inert.
                          // No red line: the line means "you can go here".
                          return (
                            <li key={child.key}>
                              <span className="flex items-center justify-between gap-2 rounded-button px-3 py-3 text-sm text-text-muted" aria-disabled="true">
                                <span>{t(child.key)}</span>
                                <span className="eyebrow rounded-full border border-border px-2 py-0.5">{t('soon')}</span>
                              </span>
                            </li>
                          );
                        }
                        const active = isActive(pathname, child.href);
                        return (
                          <li key={child.key}>
                            <Link
                              href={child.href}
                              ref={(el) => {
                                servicesItemsRef.current[i] = el;
                              }}
                              aria-current={active ? 'page' : undefined}
                              onClick={() => setServicesOpen(false)}
                              className={cn(
                                'group flex items-center rounded-button px-3 py-3 text-sm transition-colors',
                                active ? 'bg-surface-2 text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text',
                              )}
                              style={{ transitionDuration: 'var(--dur-micro)' }}
                            >
                              <LineLabel active={active}>{t(child.key)}</LineLabel>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            }

            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group inline-flex h-11 items-center rounded-button px-3 text-[0.9375rem] font-medium transition-colors',
                  active ? 'text-text' : 'text-text-2 hover:text-text',
                )}
                style={{ transitionDuration: 'var(--dur-hover)' }}
              >
                <LineLabel active={active}>{t(item.key)}</LineLabel>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          {/* Desktop cluster: FR - theme - WhatsApp (ghost) - Reserver (red) */}
          <div className="hidden items-center gap-1 lg:flex">
            <LanguageSwitcher />
            <ThemeToggle />
            {waLink ? (
              <Button href={waLink} external variant="ghost" size="md" aria-label={tc('whatsapp')} className="gap-2">
                <WhatsAppIcon className="h-[18px] w-[18px]" />
                <span className="hidden xl:inline">{tc('whatsapp')}</span>
              </Button>
            ) : null}
            <Button href="/vehicules" size="md">
              {t('book')}
            </Button>
          </div>

          {/* Mobile bar: WhatsApp icon - burger (both 48px targets) */}
          <div className="flex items-center gap-0.5 lg:hidden">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tc('whatsapp')}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                style={{ transitionDuration: 'var(--dur-micro)' }}
              >
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            ) : null}
            <button
              type="button"
              ref={burgerRef}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full text-text"
              aria-label={open ? t('closeMenu') : t('openMenu')}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <span className="relative block h-4 w-6" aria-hidden="true">
                <span
                  className={cn('absolute inset-x-0 top-0 h-0.5 rounded bg-current transition-transform', open && 'translate-y-[7px] rotate-45')}
                  style={{ transitionDuration: 'var(--dur-hover)', transitionTimingFunction: 'var(--ease-out)' }}
                />
                <span className={cn('absolute inset-x-0 top-[7px] h-0.5 rounded bg-current transition-opacity', open && 'opacity-0')} style={{ transitionDuration: 'var(--dur-micro)' }} />
                <span
                  className={cn('absolute inset-x-0 bottom-0 h-0.5 rounded bg-current transition-transform', open && '-translate-y-[7px] -rotate-45')}
                  style={{ transitionDuration: 'var(--dur-hover)', transitionTimingFunction: 'var(--ease-out)' }}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/*
        Full-screen panel, black in BOTH themes. `dark` here (belt and braces
        with the header's own `dark`) makes globals.css resolve --bg to #080808
        for the whole subtree, so `bg-bg` IS the black panel - no hex, and the
        theme toggle inside still switches the rest of the site.
        `invisible` (not opacity alone) keeps the closed panel out of the tab
        order and out of the accessibility tree.
      */}
      <div
        id="mobile-menu"
        className={cn(
          'dark fixed inset-x-0 bottom-0 top-[var(--header-h)] z-30 overflow-y-auto overscroll-contain bg-bg transition-[opacity,transform,visibility] lg:hidden',
          open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0',
        )}
        style={{ transitionDuration: 'var(--dur-panel)', transitionTimingFunction: 'var(--ease-out)' }}
      >
        <div className="container-x flex min-h-full flex-col gap-8 pb-10 pt-6">
          <nav aria-label={t('mobileNav')}>
            <ul className="flex flex-col">
              {MOBILE_NAV.map((item, i) => {
                const current = isActive(pathname, item.href);
                const lit = pending === i || (pending === -1 && current);
                return (
                  <li key={item.key} className="border-b border-border">
                    <Link href={item.href} aria-current={current ? 'page' : undefined} onClick={(e) => onMobileNavigate(e, item.href, i)} className="group flex min-h-12 flex-col justify-center gap-3 py-4">
                      <span className="text-display-2 text-text">{t(item.key)}</span>
                      <span className="redline" style={{ '--redline-rest': '0px' }} data-active={lit ? '' : undefined} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {SERVICES_PENDING.length ? (
            <div>
              <p className="eyebrow">{t('services')}</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {SERVICES_PENDING.map((child) => (
                  <li key={child.key} className="flex items-center gap-3 text-base text-text-muted">
                    <span aria-disabled="true">{t(child.key)}</span>
                    <span className="eyebrow rounded-full border border-border px-2 py-0.5">{t('soon')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button href="/vehicules" size="lg">
              {t('book')}
            </Button>
            {waLink ? (
              <Button href={waLink} external variant="whatsapp" size="lg">
                {tc('whatsapp')}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 rounded-card border border-border bg-surface-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="eyebrow">{tc('language')}</span>
              <div className="flex items-center gap-2">
                <CurrencyToggle className="[&_button]:min-h-12 [&_button]:px-4" />
                <ThemeToggle className="min-h-12 min-w-12" />
              </div>
            </div>
            <LanguageSwitcher variant="list" className="w-full [&_button]:min-h-12" />
          </div>

          {phone ? (
            <a href={`tel:${phone}`} aria-label={tc('call')} className="font-latin-sans inline-flex min-h-12 items-center justify-center text-sm font-semibold text-text-2">
              <bdi>{formatPhone(phone)}</bdi>
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
