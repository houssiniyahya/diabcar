import Link from 'next/link';
import { z } from 'zod';
import { getAdminBase, requireAdmin } from '@/lib/auth/server';
import { listExtras, listLocations, listVehicles } from '@/lib/data';
import ReservationCreateForm from '@/components/admin/ReservationCreateForm';

export const dynamic = 'force-dynamic';

/** A real calendar day, not just the yyyy-mm-dd shape (2026-02-31 is refused). */
const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const t = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
  });

/* Rule 1: zod at the boundary. A bad value is dropped, never an error page. */
const prefillSchema = z.object({
  vehicle: z.string().regex(/^[a-z0-9-]{1,80}$/).catch(''),
  from: calendarDay.catch(''),
  to: calendarDay.catch(''),
});

function parsePrefill(sp) {
  const pick = (v) => (typeof v === 'string' ? v : '');
  const p = prefillSchema.parse({ vehicle: pick(sp.vehicle), from: pick(sp.from), to: pick(sp.to) });
  /* A return that is not after the pickup is no prefill at all. */
  return { ...p, to: p.from && p.to && p.to <= p.from ? '' : p.to };
}

/**
 * A booking taken at the counter or on the phone (plan 7.1).
 *
 * `?vehicle=<slug>&from=YYYY-MM-DD&to=YYYY-MM-DD` prefills the form: the model
 * page's availability timeline links here with the car and the dates already
 * chosen. The form validates them again; a bad value simply leaves the field
 * empty.
 */
export default async function NewReservationPage({ searchParams }) {
  await requireAdmin();
  const base = await getAdminBase();
  const initial = parsePrefill((await searchParams) || {});

  const [vehicles, locations, extras] = await Promise.all([
    listVehicles({ asStaff: true, published: true }).catch(() => []),
    listLocations().catch(() => []),
    listExtras().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`${base}/reservations`} className="text-sm text-text-muted hover:text-text">
        ← Réservations
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-text">Nouvelle réservation</h1>
      <p className="mt-1 text-sm text-text-muted">
        Même moteur que le site : la disponibilité est décidée par la base, pas par ce formulaire.
      </p>

      <div className="mt-8">
        <ReservationCreateForm vehicles={vehicles} locations={locations} extras={extras} base={base} initial={initial} />
      </div>
    </div>
  );
}
