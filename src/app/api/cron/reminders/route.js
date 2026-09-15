import { createServiceClient } from '@/lib/supabase/server';
import { dataMode } from '@/lib/data';

/**
 * GET|POST /api/cron/reminders — the operational nudges (plan 7.4).
 *
 * Turns `operations_due()` into notification rows: a pickup inside 45 minutes
 * that is not ready, a return due within two hours, a return already late.
 *
 * The SQL decides what counts as due; this route only writes what it is told.
 * That keeps the definition of "late" next to the data, where the calendar and
 * the admin can read the same answer.
 *
 * IDEMPOTENT. A cron that runs every few minutes must not ring the bell every
 * few minutes for the same late return, so a row is written only when no
 * unread notification already exists for that reservation and that kind. The
 * marker lives in `href` — `/reservations/<id>#<kind>` — because the table has
 * no column for it and inventing one for a de-duplication detail would be
 * heavier than reading the link.
 *
 * Vercel Cron calls it every 5 minutes (vercel.json): the pickup nudge covers
 * the next 45 minutes, so a daily run would never fire one in time.
 *
 * Protected by CRON_SECRET. `/api/*` is excluded from the proxy matcher, so no
 * middleware runs here and the route must guard itself.
 */

export const dynamic = 'force-dynamic';

function authorised(request) {
  const secret = process.env.CRON_SECRET;
  /* No secret configured = refuse, rather than silently running open. */
  if (!secret) return false;
  /* The header only. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` by
     itself; a ?secret= query string would be written into access logs. */
  return (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

async function run(request) {
  if (!authorised(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  if (dataMode() !== 'supabase') {
    return Response.json({ ok: true, skipped: 'demo-mode', created: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const sb = createServiceClient();
  if (!sb) {
    return Response.json({ ok: false, error: 'no-service-key' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const { data: due, error } = await sb.rpc('operations_due', { p_now: new Date().toISOString() });
    if (error) throw new Error(error.message);

    /* One read of the open bell, then a set membership test per candidate —
       rather than a query per candidate. */
    const { data: open } = await sb.from('notifications').select('href').is('read_at', null);
    const already = new Set((open || []).map((n) => n.href).filter(Boolean));

    const rows = (due || [])
      .map((d) => ({
        level: d.level,
        title: `${d.label} · ${d.reference}`,
        body: new Date(d.due_at).toISOString(),
        href: `/reservations/${d.reservation}#${d.kind}`,
        for_role: null,
      }))
      .filter((r) => !already.has(r.href));

    if (rows.length) {
      const { error: insertError } = await sb.from('notifications').insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return Response.json(
      { ok: true, due: (due || []).length, created: rows.length, at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[cron/reminders]', e);
    return Response.json({ ok: false, error: 'server' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = run;
export const POST = run;
