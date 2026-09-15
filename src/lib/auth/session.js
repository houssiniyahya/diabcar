/**
 * Admin session helpers that run in both the proxy (Node runtime) and Server
 * Components / Server Actions. Two modes:
 *  - Supabase mode (NEXT_PUBLIC_SUPABASE_URL + key set): Supabase Auth JWT claims.
 *  - Demo mode (no Supabase): an HMAC-signed cookie, protected by ADMIN_DEMO_PASSWORD.
 */

export const ADMIN_COOKIE = 'dc_admin';
/* Development defaults. This repository is public, so both strings are known to
   anyone: a production build must never accept a cookie signed with them. */
const DEFAULT_SECRET = 'diabcar-dev-secret-change-me';
const DEFAULT_PASSWORD = 'diabcar-demo';
/* Placeholders, not secrets: the defaults above and .env.example's value. */
const PLACEHOLDERS = new Set([DEFAULT_SECRET, DEFAULT_PASSWORD, 'change-me-in-production']);

/**
 * May the demo admin (no Supabase, one shared password, HMAC cookie) be used?
 *
 * Always in development. In a production build only when BOTH a real
 * AUTH_SECRET (32+ characters, not a placeholder) and a non-default
 * ADMIN_DEMO_PASSWORD are set. A deployment that was merely missing its
 * Supabase variables (a preview, a mistyped production) otherwise fell into
 * demo mode with the password printed on the login page and cookies signed
 * with a secret anyone can read in this public repository.
 */
export function demoAdminEnabled() {
  if (process.env.NODE_ENV !== 'production') return true;
  const secret = process.env.AUTH_SECRET || '';
  const password = process.env.ADMIN_DEMO_PASSWORD || '';
  return secret.length >= 32 && !PLACEHOLDERS.has(secret) && password.length > 0 && !PLACEHOLDERS.has(password);
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function supabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The staff roles, most powerful first (plan 7.2).
 *
 * `driver` is Phase 3 but exists in the enum and here so policies written now
 * never have to change when it arrives.
 */
export const ROLES = ['owner', 'manager', 'agent', 'driver'];

/** Roles allowed to see or change money: prices, tiers, settings (plan 7.2). */
export const PRICING_ROLES = ['owner', 'manager'];

/**
 * The role carried by a Supabase session.
 *
 * `user_role` is the claim written by `custom_access_token_hook`
 * (supabase/migrations/0005) from `profiles.role`. It is the authority — the
 * same claim the RLS policies read — so the UI and the database can never
 * disagree about who someone is.
 *
 * The two fallbacks are compatibility, not policy: the starter shipped
 * `app_metadata.role === 'admin'`, and ADMIN_EMAILS is the break-glass list
 * for an account whose profile row has not been created yet. Both map to
 * `owner` because that is what "admin" meant before roles existed.
 *
 * NEVER `user_metadata`. A user writes their own user_metadata, at sign-up or
 * with updateUser(), so reading a role there made anyone who could create an
 * account an owner in this app. app_metadata is writable only with the service
 * role, which is also the only place the database's auth_role() looks
 * (supabase/migrations/0005). ADMIN_EMAILS relies on Supabase's e-mail
 * confirmation, so keep "Confirm email" on (docs/DEPLOY-VERCEL.md).
 */
export function roleFromClaims(claims) {
  if (!claims) return null;

  const claimed = claims.user_role;
  if (ROLES.includes(claimed)) return claimed;

  const legacy = claims.app_metadata?.role;
  if (legacy === 'admin') return 'owner';

  const email = (claims.email || '').toLowerCase();
  if (email && adminEmails().includes(email)) return 'owner';

  return null;
}

/** Is this Supabase user allowed into the admin at all? */
export function claimsAreAdmin(claims) {
  return roleFromClaims(claims) !== null;
}

/** Does this role clear one of `allowed`? */
export function roleAllows(role, allowed) {
  return Boolean(role) && allowed.includes(role);
}

/** Plan 7.2: an agent works reservations and checklists, never prices or settings. */
export function canManagePricing(role) {
  return roleAllows(role, PRICING_ROLES);
}

function b64url(bytes) {
  const str = typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  return atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function sign(payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(process.env.AUTH_SECRET || DEFAULT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(sig);
}

/** Demo mode: create a signed token valid for `days`. */
export async function createDemoToken(email, days = 7) {
  if (!demoAdminEnabled()) throw new Error('The demo admin is disabled on this deployment.');
  const payload = b64url(JSON.stringify({ email, exp: Date.now() + days * 86400 * 1000 }));
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

/** Demo mode: verify a token; returns { email } or null. */
export async function verifyDemoToken(token) {
  if (!demoAdminEnabled()) return null;
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = await sign(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(fromB64url(payload));
    if (!data.exp || data.exp < Date.now()) return null;
    return { email: data.email, mode: 'demo' };
  } catch {
    return null;
  }
}

/** The demo admin password, or null where the demo admin is disabled (see demoAdminEnabled). */
export function demoPassword() {
  return demoAdminEnabled() ? process.env.ADMIN_DEMO_PASSWORD || DEFAULT_PASSWORD : null;
}

/**
 * Where to send someone after the admin login: only a path on this same site.
 * `next` arrives in the query string, so without this a crafted link
 * (.../login?next=https://evil.example) would hand a member of staff to another
 * site the moment they had really signed in.
 *
 * @param {unknown} raw the submitted `next`
 * @param {string} [base] '' on the admin host, '/admin' on the path form
 * @returns {string}
 */
export function safeAdminNext(raw, base = '') {
  const fallback = `${base}/`;
  const value = typeof raw === 'string' ? raw.trim() : '';
  /* A single leading slash: not "//host" and not "/\host", which browsers also
     read as another host. */
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  for (const ch of value) if (ch.charCodeAt(0) < 32) return fallback;
  return value;
}
