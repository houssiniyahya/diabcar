/**
 * Cloudflare Turnstile — anti-spam on the booking form (plan 4.7).
 *
 * Two rules that matter more than the integration itself:
 *
 *   1. The token is verified SERVER-SIDE. A widget that only renders is
 *      decoration; the only thing that stops a scripted POST is this call.
 *   2. When either key is missing the check is SKIPPED, not failed. Diab Car
 *      has not created the keys yet, and a funnel that refuses every booking
 *      in development — or on the day the key expires — is worse than one with
 *      no anti-spam. The skip is reported so it can be asserted and logged
 *      rather than being invisible.
 *
 * Chosen over a captcha because it is free at this volume, needs no cookie
 * banner entry, and usually shows the customer nothing at all.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True when both halves of the widget are configured. */
export function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * @param {string|undefined} token the `cf-turnstile-response` value
 * @param {string|undefined} [remoteIp]
 * @returns {Promise<{ok: boolean, skipped?: boolean, codes?: string[]}>}
 */
export async function verifyTurnstile(token, remoteIp) {
  /* Both halves, not the secret alone. The widget only renders when the PUBLIC
     site key was present at build time; with the secret set and the site key
     missing (another environment scope, a typo), no token could ever be sent
     and every booking would be refused. */
  if (!turnstileConfigured()) {
    if (process.env.NODE_ENV === 'production' && (process.env.TURNSTILE_SECRET_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) {
      console.warn('[turnstile] only one of the two keys is set: the anti-spam check is skipped until both are.');
    }
    return { ok: true, skipped: true };
  }
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!token) return { ok: false, codes: ['missing-input-response'] };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await res.json();
    return json.success ? { ok: true } : { ok: false, codes: json['error-codes'] || [] };
  } catch (error) {
    /* Cloudflare unreachable. Failing the booking here would turn their outage
       into ours, so the request is allowed through and the failure is logged —
       spam is a smaller problem than a funnel that cannot take a reservation. */
    console.error('[turnstile] verification unreachable, allowing through:', error?.message || error);
    return { ok: true, skipped: true, codes: ['verify-unreachable'] };
  }
}
