import Link from 'next/link';
import { dataMode } from '@/lib/data';
import { formatDate, formatDateTime, formatMAD } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/reservation-states';
import { Card } from '@/components/admin/ui';
import UnitEditor, { MarkReadyButton, UnitStatusChanger } from '@/components/admin/UnitEditor';
import { BLOCK_KIND_LABEL as BLOCK_LABEL, UNIT_STATUS_LABEL } from '@/lib/fleet-labels';

/**
 * The dossier of one physical car (plan 7.1, 6.2).
 *
 * A Server Component with tabs in the URL rather than in state: `?tab=timeline`
 * is a link somebody can send to a colleague, a page that can be bookmarked
 * next to a plate, and — since the timeline needs signed Storage URLs and the
 * réservations tab needs staff-only rows — one that never has to ship any of
 * that to a browser.
 *
 * The status vocabulary lives here, next to the only component that renders all
 * of it, and the two pages import it from here. It cannot live in UnitEditor:
 * that is a client module, and a Server Component cannot read a constant across
 * that boundary.
 */

/* The words live in src/lib/fleet-labels.js, shared with the model page and
   the availability timeline; re-exported so the two pages keep importing them
   from here. */
export { UNIT_STATUS_LABEL };

export const UNIT_STATUSES = Object.keys(UNIT_STATUS_LABEL);

export const UNIT_STATUS_OPTIONS = UNIT_STATUSES.map((value) => ({ value, label: UNIT_STATUS_LABEL[value] }));

/**
 * The dots of plan 7.3, read at a glance down a column: red = il faut faire
 * quelque chose, ambre = à surveiller, vert = prête à louer, gris = hors du
 * parc actif. `reserved` is normal business, so it gets the neutral silver —
 * a colour on every row would say nothing.
 */
export const UNIT_DOT = {
  available: 'bg-success',
  reserved: 'bg-silver',
  rented: 'bg-warning',
  returned: 'bg-red',
  cleaning: 'bg-red',
  maintenance: 'bg-warning',
  blocked: 'bg-text-muted',
  out_of_service: 'bg-text-muted',
};

export const UNIT_TONE = {
  available: 'bg-success-soft text-success',
  reserved: 'bg-surface-2 text-text-2',
  rented: 'bg-warning-soft text-warning',
  returned: 'bg-red-soft text-red-signal',
  cleaning: 'bg-red-soft text-red-signal',
  maintenance: 'bg-warning-soft text-warning',
  blocked: 'bg-surface-2 text-text-muted',
  out_of_service: 'bg-surface-2 text-text-muted',
};

/** The two states where the car is back but not yet sellable — one click away. */
export const NEEDS_READY = ['returned', 'cleaning'];

const EVENT_LABEL = {
  PURCHASED: 'Achat',
  STATUS_CHANGED: 'Changement de statut',
  PICKUP: 'Départ — remise des clés',
  RETURN: 'Retour',
  INSPECTION: 'Inspection',
  DAMAGE_REPORTED: 'Dommage signalé',
  CLEANING_STARTED: 'Nettoyage commencé',
  CLEANING_COMPLETED: 'Nettoyage terminé',
  MAINTENANCE_STARTED: 'Entretien commencé',
  MAINTENANCE_COMPLETED: 'Entretien terminé',
  DOCUMENT_UPDATED: 'Document mis à jour',
  TRANSFER_STARTED: 'Transfert commencé',
  TRANSFER_COMPLETED: 'Transfert terminé',
  NOTE: 'Note',
};

const TABS = [
  { key: 'apercu', label: 'Aperçu' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'reservations', label: 'Réservations' },
  { key: 'blocs', label: 'Blocs' },
  { key: 'documents', label: 'Documents' },
];

/* Storage is private (plan 9.4): evidence is signed for 15 minutes, never made
   public. The cap is on the request, not on the timeline — a car with hundreds
   of photos would otherwise turn one page view into one enormous signing call;
   past it the page states the count instead of pretending it has the images. */
const SIGNED_TTL_SECONDS = 900;
const MAX_SIGNED = 200;

export default async function UnitDossier({ dossier, tab = 'apercu', base = '/admin', vehicles = [], locations = [], canEdit = false, now = 0 }) {
  const { unit, events = [], reservations = [], blocks = [] } = dossier;
  const current = TABS.some((t) => t.key === tab) ? tab : 'apercu';
  const evidence = current === 'timeline' ? await signEvidence(events) : null;

  return (
    <div>
      <nav aria-label="Sections du dossier" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.key === current;
          return (
            <Link
              key={t.key}
              href={`${base}/flotte/unites/${unit.id}?tab=${t.key}`}
              aria-current={active ? 'page' : undefined}
              data-tab={t.key}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active ? 'border-red text-text' : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {t.label}
              {t.key === 'timeline' && events.length ? <span className="tnum ms-1.5 text-xs text-text-muted">{events.length}</span> : null}
              {t.key === 'reservations' && reservations.length ? <span className="tnum ms-1.5 text-xs text-text-muted">{reservations.length}</span> : null}
              {t.key === 'blocs' && blocks.length ? <span className="tnum ms-1.5 text-xs text-text-muted">{blocks.length}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {current === 'apercu' ? <Apercu unit={unit} vehicles={vehicles} locations={locations} canEdit={canEdit} base={base} /> : null}
        {current === 'timeline' ? <Timeline events={events} evidence={evidence} base={base} /> : null}
        {current === 'reservations' ? <Reservations rows={reservations} base={base} /> : null}
        {current === 'blocs' ? <Blocs rows={blocks} now={now} /> : null}
        {current === 'documents' ? <Documents /> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- aperçu */

function Apercu({ unit, vehicles, locations, canEdit, base = '/admin' }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title="Fiche de l’unité">
        <UnitEditor unit={unit} vehicles={vehicles} locations={locations} statuses={UNIT_STATUS_OPTIONS} canEdit={canEdit} />
      </Card>

      <div className="grid gap-6 self-start">
        <Card title="Statut">
          <p className="text-sm text-text-2">
            Actuellement{' '}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${UNIT_TONE[unit.status] || UNIT_TONE.blocked}`}>
              {UNIT_STATUS_LABEL[unit.status] || unit.status}
            </span>
          </p>
          <div className="mt-4">
            <UnitStatusChanger unit={unit} statuses={UNIT_STATUS_OPTIONS} />
          </div>
          {/* The status is what the car is TODAY. A period — « indisponible du
              … au … », a booking taken by phone — is a block, drawn and created
              on the model's availability timeline. Two different questions, so
              the link is stated rather than the two being merged. */}
          {canEdit ? (
            <p className="mt-4 border-t border-border pt-4 text-xs text-text-muted">
              Le statut décrit la voiture aujourd’hui. Pour la rendre indisponible sur des dates (du … au …), passez par la disponibilité du modèle
              {unit.vehicleId ? (
                <>
                  {' : '}
                  <Link href={`${base}/flotte/${unit.vehicleId}#disponibilite`} className="font-semibold text-text underline">
                    ouvrir la disponibilité
                  </Link>
                </>
              ) : null}
              .
            </p>
          ) : (
            /* Agents cannot open the model page nor write periods (0005,
               0014): tell them who can, instead of a link that bounces. */
            <p className="mt-4 border-t border-border pt-4 text-xs text-text-muted">
              Le statut décrit la voiture aujourd’hui. Pour la rendre indisponible sur des dates, demandez au propriétaire ou au gérant, ou enregistrez une réservation.
            </p>
          )}
          {NEEDS_READY.includes(unit.status) ? (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-3 text-sm text-text-2">Cette voiture est revenue mais n’est pas encore à la vente.</p>
              <MarkReadyButton unitId={unit.id} plate={unit.plate} />
            </div>
          ) : null}
        </Card>

        <Card title="Repères">
          <dl className="grid gap-2 text-sm">
            <Row label="Modèle" value={unit.vehicle || '—'} />
            <Row label="Plaque" value={unit.plate || '—'} latin />
            <Row label="VIN" value={unit.vin || '—'} latin />
            <Row label="Kilométrage" value={unit.mileageKm != null ? km(unit.mileageKm) : '—'} />
            <Row label="Carburant" value={unit.fuelPct != null ? `${unit.fuelPct} %` : '—'} />
            <Row label="Lieu" value={unit.location || '—'} />
            <Row label="Au parc depuis" value={unit.createdAt ? formatDate(unit.createdAt, 'fr') : '—'} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, latin = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`text-end text-text ${latin ? 'font-latin-sans' : 'tnum'}`}>{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------------- timeline */

function Timeline({ events, evidence, base }) {
  if (events.length === 0) {
    return <Empty>Aucun événement enregistré sur cette voiture. Les départs, retours et changements de statut s’écrivent ici tout seuls.</Empty>;
  }

  return (
    <ol className="relative border-s border-border ps-6">
      {events.map((event) => {
        const photos = (event.photos || []).filter(Boolean);
        return (
          <li key={event.id} className="relative pb-7 last:pb-0">
            <span aria-hidden="true" className="absolute -start-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-border-strong" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time dateTime={event.at} className="tnum text-xs text-text-muted">
                {formatDateTime(event.at, 'fr')}
              </time>
              <span className="text-sm font-semibold text-text">{EVENT_LABEL[event.type] || event.type}</span>
              {event.type === 'STATUS_CHANGED' && event.data?.to ? (
                <span className="text-sm text-text-2">
                  {UNIT_STATUS_LABEL[event.data.from] || event.data.from || '?'} → {UNIT_STATUS_LABEL[event.data.to] || event.data.to}
                </span>
              ) : null}
              {event.reservationId ? (
                <Link href={`${base}/reservations/${event.reservationId}`} className="font-latin-sans text-sm text-accent hover:underline">
                  {event.reference || 'Réservation'}
                </Link>
              ) : null}
            </div>

            {event.mileageKm != null || event.fuelPct != null ? (
              <p className="tnum mt-1 text-xs text-text-muted">
                {event.mileageKm != null ? km(event.mileageKm) : null}
                {event.mileageKm != null && event.fuelPct != null ? ' · ' : null}
                {event.fuelPct != null ? `${event.fuelPct} % de carburant` : null}
              </p>
            ) : null}

            {event.reason ? <p className="mt-1 text-sm text-text-2">Motif : {event.reason}</p> : null}
            {event.notes ? <p className="mt-1 text-sm text-text-2">{event.notes}</p> : null}

            <Evidence photos={photos} signaturePath={event.signaturePath} evidence={evidence} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Signed thumbnails, or an honest count.
 *
 * A private object needs a signed URL; when signing fails — expired session,
 * Storage unreachable, demo mode with no bucket at all — the page says how many
 * photos exist instead of rendering five broken frames, because a broken image
 * reads as "there is nothing here", which is a lie.
 */
function Evidence({ photos, signaturePath, evidence }) {
  if (photos.length === 0 && !signaturePath) return null;

  const signed = photos.map((path) => ({ path, url: evidence?.get(path) || null }));
  const signature = signaturePath ? evidence?.get(signaturePath) || null : null;
  const shown = signed.filter((p) => p.url);
  const missing = signed.length - shown.length;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      {shown.map((photo) => (
        <a key={photo.path} href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Photo d’état des lieux" width={112} height={84} loading="lazy" className="h-[84px] w-[112px] rounded-lg border border-border object-cover" />
        </a>
      ))}

      {missing > 0 ? (
        <span className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
          <span className="tnum">{missing}</span> photo{missing > 1 ? 's' : ''} — aperçu indisponible
        </span>
      ) : null}

      {signature ? (
        <a href={signature} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signature} alt="Signature du client" width={112} height={56} loading="lazy" className="h-[56px] w-[112px] rounded-lg border border-border bg-surface-1 object-contain p-1" />
        </a>
      ) : signaturePath ? (
        <span className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">Signature enregistrée — aperçu indisponible</span>
      ) : null}
    </div>
  );
}

async function signEvidence(events) {
  /* Demo mode has no bucket; there is nothing to sign and nothing to break. */
  if (dataMode() !== 'supabase') return null;

  const paths = new Set();
  for (const event of events) {
    for (const photo of event.photos || []) {
      if (photo && paths.size < MAX_SIGNED) paths.add(photo);
    }
    if (event.signaturePath && paths.size < MAX_SIGNED) paths.add(event.signaturePath);
  }
  if (paths.size === 0) return null;

  try {
    const { createSessionClient } = await import('@/lib/supabase/server');
    const sb = await createSessionClient();
    const { data, error } = await sb.storage.from('inspections').createSignedUrls([...paths], SIGNED_TTL_SECONDS);
    if (error || !data) return null;

    const map = new Map();
    for (const row of data) {
      if (row?.signedUrl && !row.error) map.set(row.path, row.signedUrl);
    }
    return map;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- réservations */

function Reservations({ rows, base }) {
  if (rows.length === 0) return <Empty>Cette voiture n’a encore porté aucune réservation.</Empty>;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface-1">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <Th>Référence</Th>
            <Th>Statut</Th>
            <Th>Départ</Th>
            <Th>Retour</Th>
            <Th>Total</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-surface-2">
              <Td>
                <Link href={`${base}/reservations/${r.id}`} className="font-latin-sans font-semibold text-text hover:underline">
                  {r.reference || r.id.slice(0, 8)}
                </Link>
              </Td>
              <Td>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status] || STATUS_TONE.closed}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </Td>
              <Td className="tnum text-text-2">{formatDateTime(r.startAt, 'fr')}</Td>
              <Td className="tnum text-text-2">{formatDateTime(r.endAt, 'fr')}</Td>
              <Td className="tnum text-text-2">{r.total != null ? formatMAD(r.total, 'fr') : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------------- blocs */

function Blocs({ rows, now }) {
  if (rows.length === 0) {
    return <Empty>Aucun bloc sur cette voiture : rien ne la retient hors de la disponibilité publique.</Empty>;
  }

  /* An unbounded block (no upper bound on the range) is the most open of all,
     so a missing end date counts as live rather than silently as finished. */
  const isLive = (b) => !b.endAt || Date.parse(b.endAt) > now;
  const open = rows.filter(isLive);
  const until = open.find((b) => b.endAt)?.endAt || null;

  return (
    <div>
      {open.length > 0 ? (
        <p className="mb-4 rounded-lg border border-red-signal/40 bg-red-soft/30 px-4 py-3 text-sm text-text" data-testid="open-block">
          <span className="tnum">{open.length}</span> bloc{open.length > 1 ? 's' : ''} en cours : c’est ce qui garde cette voiture hors de la vente publique
          {until ? ` jusqu’au ${formatDateTime(until, 'fr')}` : ', sans date de fin'}. Fermez-le en marquant l’unité prête, ou depuis le calendrier.
        </p>
      ) : (
        <p className="mb-4 text-sm text-text-muted">Aucun bloc en cours : cette voiture est vendable si son statut le permet.</p>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface-1">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              <Th>Type</Th>
              <Th>Du</Th>
              <Th>Au</Th>
              <Th>Motif</Th>
              <Th>État</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((b) => {
              const live = isLive(b);
              return (
                <tr key={b.id} className="transition-colors hover:bg-surface-2">
                  <Td className="font-semibold text-text">{BLOCK_LABEL[b.kind] || b.kind}</Td>
                  <Td className="tnum text-text-2">{formatDateTime(b.startAt, 'fr')}</Td>
                  <Td className="tnum text-text-2">{b.endAt ? formatDateTime(b.endAt, 'fr') : 'sans fin'}</Td>
                  <Td className="text-text-2">{b.reason || '—'}</Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${live ? 'bg-red-soft text-red-signal' : 'bg-surface-2 text-text-muted'}`}>
                      {live ? 'En cours' : 'Terminé'}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- documents */

function Documents() {
  return (
    <Card title="Documents du véhicule">
      <p className="max-w-2xl text-sm text-text-2">
        Le coffre à documents — carte grise, assurance, visite technique, avec alertes d’expiration à 30, 15, 7 et 1 jour — est prévu pour la v1.1 (plan 7.1).
        Rien n’est stocké ici pour l’instant : les papiers restent au bureau, et cette page ne fera pas semblant du contraire.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ plumbing */

/** Grouped Latin digits, thin no-break spaces — the same rule as src/lib/format.js. */
function km(value) {
  return `${new Intl.NumberFormat('en-US').format(value).replace(/,/g, ' ')} km`;
}

function Empty({ children }) {
  return <p className="rounded-lg border border-border bg-surface-1 p-6 text-sm text-text-2">{children}</p>;
}

const Th = ({ children }) => (
  <th scope="col" className="px-4 py-2.5 text-start font-semibold">
    {children}
  </th>
);

const Td = ({ children, className = '' }) => <td className={`px-4 py-3 ${className}`}>{children}</td>;
