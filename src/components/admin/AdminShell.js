'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogoMark } from '@/components/site/Logo';
import ThemeToggle from '@/components/site/ThemeToggle';
import { PRICING_ROLES } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

const AdminBaseContext = createContext('/admin');
export const useAdminBase = () => useContext(AdminBaseContext);

/**
 * The admin shell (plan 3 and 7.3).
 *
 * Navigation is grouped the way the work is: what needs attention now, then
 * the fleet, then the people, then the things that change rarely. `roles` on an
 * item hides it from anyone who may not use it — but hiding is only the
 * courtesy half. The server-side half is `requirePageRole()` on the route
 * itself, because a hidden link that still answers when typed is decoration
 * (plan 7.2).
 */
const NAV = [
  {
    group: null,
    items: [{ href: '/', label: 'Dashboard', icon: 'M3 12l9-8 9 8M5 10v10h14V10' }],
  },
  {
    group: 'Opérations',
    items: [
      { href: '/reservations', label: 'Réservations', icon: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
      { href: '/calendrier', label: 'Calendrier', icon: 'M3 10h18M8 2v4M16 2v4M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' },
      { href: '/operations/departs', label: 'Départs', icon: 'M5 12h14M13 5l7 7-7 7' },
      { href: '/operations/retours', label: 'Retours', icon: 'M19 12H5M11 19l-7-7 7-7' },
    ],
  },
  {
    group: 'Flotte',
    items: [
      { href: '/flotte', label: 'Modèles', icon: 'M5 17h14M6 17l1-6h10l1 6M4 11l2-5h12l2 5', roles: PRICING_ROLES },
      { href: '/flotte/unites', label: 'Unités', icon: 'M4 7h16v10H4zM8 17v2M16 17v2M7 11h2M15 11h2' },
      { href: '/blocs', label: 'Blocs', icon: 'M4 4h16v16H4zM4 9h16M9 4v16' },
      { href: '/clients', label: 'Clients', icon: 'M16 20v-2a4 4 0 0 0-8 0v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    ],
  },
  {
    group: 'Contenu',
    items: [
      { href: '/contenu/faq', label: 'FAQ', icon: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z' },
      { href: '/contenu/blog', label: 'Blog', icon: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5' },
      { href: '/contenu/avis', label: 'Avis', icon: 'M12 2l3 7 7 .8-5.2 4.8L18 22l-6-3.5L6 22l1.2-7.4L2 9.8 9 9z' },
    ],
  },
  {
    group: 'Réglages',
    items: [
      /* Money and configuration: owner and manager only (plan 7.2). */
      { href: '/tarifs', label: 'Tarifs', icon: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', roles: PRICING_ROLES },
      { href: '/parametres', label: 'Paramètres', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2', roles: PRICING_ROLES },
      { href: '/seo', label: 'SEO', icon: 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z', roles: PRICING_ROLES },
      { href: '/journal', label: 'Journal', icon: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4' },
      { href: '/systeme', label: 'Système', icon: 'M9 3h6v3h4v12H5V6h4zM9 12h6', roles: PRICING_ROLES },
    ],
  },
];

/** g d / g r / g c — the sequences plan 7.3 asks for. */
const GOTO = { d: '/', r: '/reservations', c: '/calendrier', f: '/flotte', j: '/journal' };

export default function AdminShell({ base, session, mode, siteUrl, children, logoutAction, unreadCount = 0 }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = pathname.replace(/^\/admin/, '') || '/';
  const role = session?.role || 'agent';

  const searchRef = useRef(null);

  /* Keyboard: `/` focuses search, `n` opens a new reservation, `g` then a
     letter jumps. Never while typing — an admin who cannot type a plate into a
     filter because "c" navigated away would rightly stop using shortcuts. */
  useEffect(() => {
    let awaitingGoto = false;
    let timer;

    const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'n') {
        event.preventDefault();
        router.push(`${base}/reservations?new=1`);
        return;
      }
      if (event.key === 'g') {
        awaitingGoto = true;
        clearTimeout(timer);
        timer = setTimeout(() => {
          awaitingGoto = false;
        }, 1200);
        return;
      }
      if (awaitingGoto && GOTO[event.key]) {
        event.preventDefault();
        awaitingGoto = false;
        router.push(`${base}${GOTO[event.key]}`);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [base, router]);

  return (
    <AdminBaseContext.Provider value={base}>
      <div className="flex min-h-dvh bg-bg text-text">
        {/* ---------------------------------------------------- sidebar */}
        {/* FIXED at every width, deliberately. The sidebar and the page must
            never compete over the same CSS property: `lg:static` only beat
            `fixed` while the generated stylesheet happened to list it later, and
            when that order flipped (a stale hot-reloaded sheet is enough) the
            whole admin slid underneath the nav. The content column is offset
            with padding instead — see lg:ps-64 below — which cannot fail that
            way, and the nav now stays put while long tables scroll. */}
        <aside
          className={cn(
            'fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e border-border bg-surface-1 transition-transform lg:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
          )}
        >
          <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
            <LogoMark className="h-7 w-7" />
            <div className="leading-tight">
              <div className="font-latin-display text-lg font-semibold">DIAB CAR</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Administration</div>
            </div>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto p-3">
            {NAV.map((section) => {
              const items = section.items.filter((i) => !i.roles || i.roles.includes(role));
              if (!items.length) return null;
              return (
                <div key={section.group || 'top'}>
                  {section.group ? (
                    <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{section.group}</p>
                  ) : null}
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const active = item.href === '/' ? current === '/' : current.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={`${base}${item.href}`}
                          onClick={() => setOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            active ? 'bg-red-soft text-red-signal' : 'text-text-2 hover:bg-surface-2 hover:text-text',
                          )}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={item.icon} />
                          </svg>
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* ---- user block ---- */}
          <div className="border-t border-border p-4 text-xs">
            <div className="truncate font-medium text-text">{session?.email}</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-2">{role}</span>
              <span className="text-text-muted">{mode === 'supabase' ? 'Supabase' : 'démo'}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-text">
                Voir le site ↗
              </a>
              <form action={logoutAction}>
                <button type="submit" className="font-semibold text-red-signal hover:underline">
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </aside>

        {/* ---------------------------------------------------- main */}
        {/* The padding is the sidebar's width (w-64): the only thing keeping the
            content clear of the fixed nav from lg up. */}
        <div className="flex min-w-0 flex-1 flex-col lg:ps-64">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur-md lg:px-6">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menu"
              className="rounded-lg p-2 text-text-2 hover:bg-surface-2 lg:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <AdminSearch ref={searchRef} base={base} />

            <div className="ms-auto flex items-center gap-1">
              <NotificationsBell base={base} initialCount={unreadCount} enabled={mode === 'supabase'} />
              <ThemeToggle />
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        </div>

        {open ? <button type="button" aria-label="Fermer" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" /> : null}
      </div>
    </AdminBaseContext.Provider>
  );
}

/**
 * Global search (plan 7.3). Submits to /reservations?q= — one results surface
 * that already knows how to render reservations, and which the server can
 * widen to customers, plates and vehicles without changing this input.
 */
function AdminSearch({ ref, base }) {
  const router = useRouter();
  const [value, setValue] = useState('');

  const submit = useCallback(
    (event) => {
      event.preventDefault();
      const q = value.trim();
      if (q) router.push(`${base}/reservations?q=${encodeURIComponent(q)}`);
    },
    [value, base, router],
  );

  return (
    <form onSubmit={submit} className="min-w-0 flex-1 max-w-md" role="search">
      <label className="relative block">
        <span className="sr-only">Rechercher</span>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />
        </svg>
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Référence, téléphone, nom, plaque…   /"
          data-testid="admin-search"
          className="w-full rounded-lg border border-border bg-surface-1 py-2 ps-9 pe-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-signal"
        />
      </label>
    </form>
  );
}

/**
 * The bell (plan 7.4). Starts from a server-rendered count so the first paint
 * is already right, then listens on Realtime for `notifications` inserts.
 *
 * Only the COUNT moves live. The list itself is a page, because a dropdown
 * that silently reorders under a finger is worse than a link.
 */
function NotificationsBell({ base, initialCount, enabled }) {
  const [count, setCount] = useState(initialCount);
  /* Whether the Realtime channel is actually established. Reported on the
     element so the UI can degrade honestly and so a test can wait for it
     instead of racing the subscription — a missed INSERT never arrives again. */
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled || !process.env.NEXT_PUBLIC_SUPABASE_URL) return undefined;

    let channel;
    let client;
    let cancelled = false;

    (async () => {
      try {
        const { createBrowserSupabase } = await import('@/lib/supabase/client');
        if (cancelled) return;
        client = createBrowserSupabase();

        /* Hand the socket the access token BEFORE subscribing.
           postgres_changes is filtered by RLS, and `notifications` is
           readable only by staff (0005). A socket that connects before the
           session is attached is anonymous, so the subscription is accepted
           and then silently delivers nothing — which is exactly how this
           failed the first time. */
        const { data } = await client.auth.getSession();
        if (cancelled) return;
        if (data?.session?.access_token) client.realtime.setAuth(data.session.access_token);

        channel = client
          .channel('admin:notifications')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
            setCount((c) => c + 1);
          })
          .subscribe((status) => {
            if (!cancelled) setLive(status === 'SUBSCRIBED');
          });
      } catch {
        /* No realtime: the count is still correct on every navigation, which
           is the floor this feature degrades to. */
        if (!cancelled) setLive(false);
      }
    })();

    return () => {
      cancelled = true;
      setLive(false);
      try {
        if (channel && client) client.removeChannel(channel);
      } catch {
        /* already torn down */
      }
    };
  }, [enabled]);

  return (
    <Link
      href={`${base}/notifications`}
      aria-label={count > 0 ? `Notifications, ${count} non lues` : 'Notifications'}
      data-testid="admin-bell"
      data-live={live ? 'true' : 'false'}
      className="relative rounded-lg p-2 text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {count > 0 ? (
        <span
          data-testid="admin-bell-count"
          className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold leading-4 text-white tnum"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
