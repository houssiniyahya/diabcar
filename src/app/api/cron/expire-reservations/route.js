import { dataMode, expireUnconfirmedReservations, refreshCleaningBlocks } from '@/lib/data';

/**
 * GET|POST /api/cron/expire-reservations — the two housekeeping sweeps
 * (plan 7.1, supabase/migrations/0012).
 *
 * Diab Car takes no payment online, so `pending` means "a human still has to
 * say yes". A request nobody answered holds a car hostage:
 * `expire_unconfirmed_reservations()` cancels it after
 * `settings.auto_expire_hours` with the reason « non confirmée » — cancelled,
 * never deleted, so the customer's file still shows what happened — and the
 * car goes back on sale.
 *
 * `refresh_cleaning_blocks()` is the other half. A returned car is blocked for
 * `settings.cleaning_minutes`; if nobody presses « Marquer prête » before that
 * window closes, the car would quietly become bookable while it is still
 * dirty. This sweep extends the block for as long as the unit says
 * `cleaning`, so forgetting the button costs an hour of availability rather
 * than a customer standing next to an unwashed car.
 *
 * 0012 schedules both on pg_cron (hourly and every ten minutes) when the
 * extension is available; this route is the other half of that promise for a
 * project where it is not — Vercel Cron calls it every 15 minutes
 * (vercel.json), and the sweeps happen either way. Running both is harmless: expiring an expired
 * request is a no-op, and the block refresh only writes for units that have no
 * live cleaning block.
 *
 * Protected by CRON_SECRET. `/api/*` is excluded from the proxy matcher, so no
 * middleware runs here and the route must guard itself.
 */

export const dynamic = 'force-dynamic';

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  /* No secret configured = refuse, rather than silently run open. */
  if (!secret) return false;
  /* The header only. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` by
     itself; a ?secret= query string would be written into access logs. */
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

async function sweep(request) {
  if (!authorised(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    /* Sequential, not parallel: expiring a request releases its unit, and the
       cleaning pass should look at the fleet once that has settled. */
    const expired = await expireUnconfirmedReservations();
    const cleaning = await refreshCleaningBlocks();

    /* Neither RPC is granted to anything but the service role, so a project
       missing SUPABASE_SERVICE_ROLE_KEY gets a refusal rather than a silent
       zero — a sweep that never ran must not look like a sweep that found
       nothing. */
    if (expired?.ok === false || cleaning?.ok === false) {
      return Response.json(
        { ok: false, error: expired?.error || cleaning?.error || 'refused' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json(
      {
        ok: true,
        mode: dataMode(),
        expired: expired?.expired ?? 0,
        autoExpireHours: expired?.hours ?? null,
        autoExpireDisabled: Boolean(expired?.disabled),
        cleaningBlocksRefreshed: cleaning?.refreshed ?? 0,
        at: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[cron/expire-reservations]', error);
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = sweep;
export const POST = sweep;
