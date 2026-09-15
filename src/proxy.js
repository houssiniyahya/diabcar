import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { ADMIN_COOKIE, claimsAreAdmin, isSupabaseConfigured, verifyDemoToken } from '@/lib/auth/session';
import { updateSession } from '@/lib/supabase/proxy';

const handleI18n = createMiddleware(routing);

/* ------------------------------------------------------------------ */
/* Geo → locale mapping for FIRST visits on unprefixed URLs only.      */
/* Prefixed URLs (/fr, /en, /ar, /es) are never redirected elsewhere,  */
/* and bots always land on the default locale, as Google recommends.   */
/* ------------------------------------------------------------------ */
const AR = new Set(['BH', 'KM', 'DJ', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'OM', 'PS', 'QA', 'SA', 'SO', 'SD', 'SY', 'AE', 'YE']);
const FR = new Set(['MA', 'EH', 'DZ', 'TN', 'MR', 'FR', 'BE', 'CH', 'LU', 'MC', 'SN', 'CI']);
const ES = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ']);
const MAGHREB = new Set(['DZ', 'TN']);
const BOT =
  /bot|crawl|spider|slurp|duckduck|yandex|baidu|applebot|oai-searchbot|chatgpt-user|gptbot|claudebot|claude-user|claude-searchbot|perplexity|meta-external|amazonbot|facebookexternalhit|whatsapp|telegrambot|lighthouse|pagespeed|google-inspectiontool|googleother|storebot|vercel-screenshot|vercelbot/i;

function localeFromGeo(request) {
  const country = (
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code') ||
    ''
  ).toUpperCase();
  if (!country || country === 'XX' || country === 'T1') return null;
  const acceptsArabic = /^\s*ar\b/i.test(request.headers.get('accept-language') || '');
  if (MAGHREB.has(country) && acceptsArabic) return 'ar';
  if (FR.has(country)) return 'fr';
  if (AR.has(country)) return 'ar';
  if (ES.has(country)) return 'es';
  return 'en';
}

function hostOf(request) {
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0].toLowerCase();
}

function isAdminHost(host) {
  const configured = (process.env.ADMIN_HOST || '').toLowerCase();
  if (configured && host === configured) return true;
  return host.startsWith('admin.');
}

function isLocalHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/* ------------------------------------------------------------------ */
/* Admin (admin.diabcar.ma → /admin/*)                                 */
/* ------------------------------------------------------------------ */
async function handleAdmin(request, { base }) {
  const url = request.nextUrl;
  const internalPath = base === '' ? `/admin${url.pathname === '/' ? '' : url.pathname}` : url.pathname;
  const isLogin = internalPath === '/admin/login' || internalPath.startsWith('/admin/login/');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-admin-base', base);

  const makeResponse = (req) => {
    const target = new URL(internalPath + url.search, req.url);
    const res =
      base === '' ? NextResponse.rewrite(target, { request: { headers: requestHeaders } }) : NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res;
  };

  let authed = false;
  let response;

  if (isSupabaseConfigured()) {
    const result = await updateSession(request, makeResponse);
    response = result.response;
    authed = claimsAreAdmin(result.claims);
  } else {
    response = makeResponse(request);
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    authed = Boolean(await verifyDemoToken(token));
  }

  if (!authed && !isLogin) {
    const login = new URL(`${base}/login`, request.url);
    login.searchParams.set('next', url.pathname);
    return NextResponse.redirect(login);
  }
  if (authed && isLogin) {
    return NextResponse.redirect(new URL(`${base}/` , request.url));
  }
  return response;
}

/* ------------------------------------------------------------------ */
export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const host = hostOf(request);

  // 1) Admin dashboard: dedicated host in production, /admin path on localhost.
  if (isAdminHost(host)) {
    if (pathname.startsWith('/admin')) {
      // Keep admin URLs clean on the admin host.
      const clean = pathname.replace(/^\/admin/, '') || '/';
      return NextResponse.redirect(new URL(clean + request.nextUrl.search, request.url));
    }
    return handleAdmin(request, { base: '' });
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (isLocalHost(host) || process.env.ADMIN_ALLOW_PATH === 'true') {
      return handleAdmin(request, { base: '/admin' });
    }
    // Never expose the admin under the public host.
    return NextResponse.rewrite(new URL(`/${routing.defaultLocale}/404`, request.url), { status: 404 });
  }

  // 2) Locale decision for unprefixed URLs only.
  const hasPrefix = routing.locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (!hasPrefix) {
    const suffix = pathname === '/' ? '' : pathname;
    const ua = request.headers.get('user-agent') || '';
    if (BOT.test(ua)) {
      return NextResponse.redirect(new URL(`/${routing.defaultLocale}${suffix}${request.nextUrl.search}`, request.url), 307);
    }
    if (!request.cookies.get('NEXT_LOCALE')) {
      const geo = localeFromGeo(request);
      if (geo) {
        const res = NextResponse.redirect(new URL(`/${geo}${suffix}${request.nextUrl.search}`, request.url), 307);
        res.cookies.set('NEXT_LOCALE', geo, { path: '/', maxAge: 31536000, sameSite: 'lax' });
        return res;
      }
    }
  }

  // 3) cookie → Accept-Language → default locale, plus localized pathname rewrites.
  const res = handleI18n(request);

  /* 4) Parametrised result sets are noindex (CLAUDE.md rule 8: one URL = one
     intent). Sent as a header rather than a <meta> tag on purpose: reading
     searchParams inside the page or its generateMetadata would opt the whole
     route out of static rendering, and the fleet page is the one public page
     that most wants ISR. X-Robots-Tag is honoured by Google exactly like the
     meta tag, and it works on a fully cached response.

     `follow` is kept: the crawler should still walk through to the vehicle
     pages, which ARE the pages worth indexing. */
  if (res && request.nextUrl.search && request.nextUrl.search !== '?') {
    res.headers.set('X-Robots-Tag', 'noindex, follow');
  }

  return res;
}

export const config = {
  /* The second entry is not redundant: the first skips any path with a dot, and
     /admin/<x>.<y> must still pass the admin gate above. */
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)', '/admin/:path*'],
};
