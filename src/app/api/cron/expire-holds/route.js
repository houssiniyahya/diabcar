import { dataMode, db } from '@/lib/data';

/**
 * GET|POST /api/cron/expire-holds — the fallback sweeper.
 *
 * 0008 schedules `expire_holds()` on pg_cron every minute. pg_cron has to be
 * enabled per project though, and the migration only raises a notice if it is
 * not, so this route exists as the other half of that promise: Vercel Cron
 * calls it every minute (vercel.json) and the sweep happens either way
 * (plan 6.3).
 *
 * Nothing breaks if BOTH run — expiring an expired hold is a no-op — and
 * nothing breaks if neither does, because `free_units()` already ignores holds
 * whose `expires_at` has passed. The sweep keeps the table small and the
 * admin's "live holds" view honest; it is not what makes availability correct.
 *
 * Protected by CRON_SECRET: this is a write endpoint, so it is not open.
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
    const adapter = await db();
    const released = await adapter.expireHolds();
    return Response.json(
      { ok: true, mode: dataMode(), released, at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = sweep;
export const POST = sweep;
