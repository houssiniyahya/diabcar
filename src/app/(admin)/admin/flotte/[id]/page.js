import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminBase, requirePricingRole } from '@/lib/auth/server';
import { dataMode, getSettingsAdmin, getVehicleById, listBlocks, listCustomers, listReservations, listUnits, listVehiclePhotos } from '@/lib/data';
import { timelineWindow } from '@/lib/availability-timeline';
import { OCCUPYING_STATUSES } from '@/lib/reservation-states';
import { CATEGORY_LABEL, UNIT_STATUS_LABEL } from '@/lib/fleet-labels';
import { Card, PageTitle, Table } from '@/components/admin/ui';
import PhotoManager from '@/components/admin/PhotoManager';
import VehicleEditor from '@/components/admin/VehicleEditor';
import VehiclePhotoStrip from '@/components/admin/VehiclePhotoStrip';
import VehicleAvailability from '@/components/admin/VehicleAvailability';

export const dynamic = 'force-dynamic';

/**
 * One model: its photos, its availability, its sheet, its plates (plan 7.1).
 *
 * The order is the owner's (2026-09-16): the photos come BEFORE the name and
 * the category sits right under it, because that is how the agency recognises
 * a car; then the availability timeline, because "is there one to rent, and
 * when" is the question asked most often; then the sheet, the gallery and the
 * plates.
 *
 * The units are shown, never edited here: a plate's status is an operational
 * write with its own reason and its own page. A PERIOD of unavailability is a
 * different thing — a block — and that one is created here, on the timeline.
 */

/* Plan 7.3's dot vocabulary: green = ready, amber = needs attention, grey =
   inactive, neutral = normal. Nothing here is red — a car out with a customer
   is the business working, not an alarm. */
const UNIT_DOT = {
  available: 'bg-success',
  reserved: 'bg-text-2',
  rented: 'bg-text-2',
  returned: 'bg-warning',
  cleaning: 'bg-warning',
  maintenance: 'bg-warning',
  blocked: 'bg-warning',
  out_of_service: 'bg-text-muted',
};

/** Latin digits, thin no-break grouping — the same shape as every other
    number in the admin (src/lib/format.js), for a value that is not money. */
const km = (value) => `${new Intl.NumberFormat('en-US').format(Number(value) || 0).replace(/,/g, ' ')} km`;

export default async function FleetModelPage({ params }) {
  await requirePricingRole();
  const base = await getAdminBase();
  const { id } = await params;

  /* The clock is read once, here, and passed down: a client component that
     called new Date() while rendering would be non-deterministic, and the
     timeline's window, its today column and its now-line must agree. */
  const nowIso = new Date().toISOString();
  const currentYear = new Date(nowIso).getFullYear();

  const isNew = id === 'nouveau';
  const vehicle = isNew ? null : await getVehicleById(id, { asStaff: true }).catch(() => null);
  if (!isNew && !vehicle) notFound();

  const win = timelineWindow({ nowIso });

  /* A failed read must not look like an empty calendar: the owner would see
     free days the website is hiding. Each read reports its failure. */
  let loadError = false;
  const orEmpty = (promise) =>
    promise.catch(() => {
      loadError = true;
      return [];
    });

  const [units, photos, reservations, settings] = isNew
    ? [[], [], [], null]
    : await Promise.all([
        orEmpty(listUnits({ vehicleId: id })),
        listVehiclePhotos({ vehicleId: id }).catch(() => []),
        /* Only what the timeline draws: bookings still holding a car, inside
           the window. */
        orEmpty(listReservations({ vehicleId: id, statuses: OCCUPYING_STATUSES, from: win.from, to: win.to })),
        getSettingsAdmin().catch(() => null),
      ]);

  const unitIdList = units.map((u) => u.id);
  const customerIds = [...new Set(reservations.map((r) => r.customerId).filter(Boolean))];
  const [blocks, customers] = isNew
    ? [[], []]
    : await Promise.all([
        /* Filtered in the query, never in JavaScript: the blocks table only
           grows, and an unfiltered read past the API row cap drops rows. */
        orEmpty(listBlocks({ unitIds: unitIdList, from: win.from, to: win.to })),
        /* A reservation row carries only customer_id; the name is on the
           customer. Only the handful this timeline names. */
        listCustomers({ ids: customerIds }).catch(() => []),
      ]);
  const customerName = new Map(customers.map((c) => [c.id, [c.firstName, c.lastName].filter((x) => x && x !== '-').join(' ').trim()]));

  const label = isNew ? 'Nouveau modèle' : `${vehicle.brand} ${vehicle.model} ${vehicle.year}`;
  /* Only what the timeline draws leaves the server: no customer file, no
     price breakdown, no notes — the reservation page has those. */
  const timelineReservations = reservations.map((r) => ({
    id: r.id,
    reference: r.reference || '',
    status: r.status,
    source: r.source || 'web',
    unitId: r.unitId || null,
    startAt: r.startAt,
    endAt: r.endAt,
    customer: customerName.get(r.customerId) || '',
  }));
  const timelineUnits = units.map((u) => ({ id: u.id, plate: u.plate || '', status: u.status }));
  const timelineBlocks = blocks.map((b) => ({ id: b.id, unitId: b.unitId, kind: b.kind, reason: b.reason || '', startAt: b.startAt, endAt: b.endAt || null }));
  const autoExpireHours = Number(settings?.autoExpireHours) || null;

  return (
    <>
      <Link href={`${base}/flotte`} className="text-sm text-text-muted hover:text-text">
        ← Modèles
      </Link>

      {/* ---- photos, before the name ---- */}
      {!isNew ? (
        <div className="mt-4">
          <VehiclePhotoStrip vehicle={vehicle} photos={photos} label={label} />
        </div>
      ) : null}

      {/* ---- name, and the category right under it ---- */}
      <div className="mt-4">
        <PageTitle
          title={label}
          description={
            isNew ? (
              'Renseignez la fiche, puis enregistrez : les photos s’ajoutent ensuite.'
            ) : (
              <>
                <span data-testid="vehicle-category" className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text">
                  {CATEGORY_LABEL[vehicle.category] || vehicle.category || 'Catégorie ?'}
                </span>
                <span className="ms-2">
                  /{vehicle.slug} · {photos.length} photo(s) importée(s) · {units.length} unité(s){vehicle.published ? '' : ' · brouillon'}
                </span>
              </>
            )
          }
        />
      </div>

      {/* ---- availability: is there one to rent, and when ---- */}
      {!isNew ? (
        <div id="disponibilite" className="scroll-mt-20">
          <Card title="Disponibilité — 6 prochaines semaines">
            <VehicleAvailability
              vehicle={{
                id: vehicle.id,
                slug: vehicle.slug,
                published: vehicle.published !== false,
                /* null → the database default (120 min), same as booking_window(). */
                prepBufferMinutes: vehicle.prepBufferMinutes == null ? null : Number(vehicle.prepBufferMinutes),
              }}
              units={timelineUnits}
              reservations={timelineReservations}
              blocks={timelineBlocks}
              win={win}
              nowIso={nowIso}
              base={base}
              autoExpireHours={autoExpireHours}
              loadError={loadError}
            />
          </Card>
        </div>
      ) : null}

      <div className="mt-5">
        <VehicleEditor vehicle={vehicle || {}} base={base} isNew={isNew} currentYear={currentYear} />
      </div>

      <div className="mt-5 space-y-5">
        {isNew ? (
          <Card title="Photos">
            <p className="text-sm text-text-muted">
              Enregistrez d’abord le modèle : une photo doit être rattachée à une fiche existante.
            </p>
          </Card>
        ) : (
          <div id="photos" className="scroll-mt-20">
            <PhotoManager vehicleId={vehicle.id} slug={vehicle.slug} vehicleLabel={label} photos={photos} canUpload={dataMode() === 'supabase'} />
          </div>
        )}

        <Card title="Unités">
          {isNew ? (
            <p className="text-sm text-text-muted">Les plaques s’ajoutent une fois le modèle enregistré.</p>
          ) : units.length === 0 ? (
            <p className="text-sm text-text-muted">
              Aucune unité pour ce modèle : il ne peut donc pas être loué, même publié.{' '}
              <Link href={`${base}/flotte/unites`} className="font-semibold text-text underline">
                Ajouter une unité
              </Link>
              .
            </p>
          ) : (
            <Table head={['Plaque', 'Statut', 'Km', 'Carburant', '']}>
              {units.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <Link href={`${base}/flotte/unites/${u.id}`} className="font-latin-sans font-medium text-text hover:underline">
                      {u.plate || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm text-text-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${UNIT_DOT[u.status] || 'bg-text-muted'}`} aria-hidden="true" />
                      {UNIT_STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-sm text-text-2">{km(u.mileageKm)}</td>
                  <td className="tnum px-4 py-3 text-sm text-text-2">{u.fuelPct === null || u.fuelPct === undefined ? '—' : `${u.fuelPct} %`}</td>
                  <td className="px-4 py-3 text-end">
                    <Link href={`${base}/flotte/unites/${u.id}`} className="text-xs font-semibold text-text-2 hover:text-text">
                      Dossier
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
