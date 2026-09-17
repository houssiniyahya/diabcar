import Link from 'next/link';
import { getAdminBase, requirePricingRole } from '@/lib/auth/server';
import { listUnits, listVehiclePhotos, listVehicles } from '@/lib/data';
import { CATEGORIES, vehicleImage } from '@/lib/constants';
import { CATEGORY_LABEL as CAT } from '@/lib/fleet-labels';
import { formatMAD } from '@/lib/format';
import { AdminLink, PageTitle, Table } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

/**
 * The catalogue of MODELS (plan 7.1).
 *
 * A model is the thing a customer books — "Dacia Logan diesel" — and a unit is
 * the plate that shows up on the calendar. This page owns the first: content,
 * price, photos, publication. The plates live one click away, under each model
 * and on /flotte/unites.
 *
 * Money is on screen, so the page is owner/manager only: `requirePricingRole`
 * sends an agent back to the dashboard, and `save_vehicle` refuses them again
 * in Postgres if they type the URL (plan 7.2).
 */

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/vehicles`;

export default async function FleetModelsPage({ searchParams }) {
  await requirePricingRole();
  const base = await getAdminBase();
  const sp = await searchParams;

  const category = CATEGORIES.includes(sp?.category) ? sp.category : '';
  const published = sp?.published === '1' ? '1' : sp?.published === '0' ? '0' : '';

  const [vehicles, units, photos] = await Promise.all([
    listVehicles({ asStaff: true,  asStaff: true }).catch(() => []),
    listUnits({}).catch(() => []),
    listVehiclePhotos({}).catch(() => []),
  ]);

  const unitsByVehicle = new Map();
  for (const u of units) {
    const bucket = unitsByVehicle.get(u.vehicleId) || { total: 0, available: 0 };
    bucket.total += 1;
    if (u.status === 'available') bucket.available += 1;
    unitsByVehicle.set(u.vehicleId, bucket);
  }

  /* The card image is the lowest `sort` of a model's photos — the same rule
     the public catalogue applies, so what an operator sees here is what a
     customer sees there. */
  const coverByVehicle = new Map();
  for (const p of [...photos].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))) {
    if (!coverByVehicle.has(p.vehicleId)) coverByVehicle.set(p.vehicleId, p);
  }

  const rows = vehicles.filter((v) => {
    if (category && v.category !== category) return false;
    if (published === '1' && !v.published) return false;
    if (published === '0' && v.published) return false;
    return true;
  });

  const href = (patch) => {
    const next = { category, published, ...patch };
    const q = new URLSearchParams();
    if (next.category) q.set('category', next.category);
    if (next.published) q.set('published', next.published);
    const query = q.toString();
    return `${base}/flotte${query ? `?${query}` : ''}`;
  };

  const publishedCount = vehicles.filter((v) => v.published).length;

  return (
    <>
      <PageTitle
        title="Modèles"
        description={`${vehicles.length} modèle(s) · ${publishedCount} publié(s) · ${units.length} unité(s)`}
        actions={<AdminLink href={`${base}/flotte/nouveau`}>+ Nouveau modèle</AdminLink>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2" data-testid="fleet-filters">
        <Chip href={href({ category: '' })} active={!category}>
          Toutes catégories
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} href={href({ category: c })} active={category === c}>
            {CAT[c]}
          </Chip>
        ))}
        <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
        <Chip href={href({ published: '' })} active={!published}>
          Tous
        </Chip>
        <Chip href={href({ published: '1' })} active={published === '1'}>
          Publiés
        </Chip>
        <Chip href={href({ published: '0' })} active={published === '0'}>
          Brouillons
        </Chip>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-border bg-surface-1 p-6 text-sm text-text-muted">
          Aucun modèle ne correspond à ce filtre.{' '}
          <Link href={`${base}/flotte`} className="font-semibold text-text underline">
            Tout afficher
          </Link>
          .
        </p>
      ) : (
        <Table head={['', 'Modèle', 'Catégorie', 'Prix / jour', 'Unités', 'Statut', '']}>
          {rows.map((v) => {
            const cover = coverByVehicle.get(v.id);
            const counts = unitsByVehicle.get(v.id) || { total: 0, available: 0 };
            return (
              <tr key={v.id} className="hover:bg-surface-2/50">
                <td className="w-24 px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover ? coverUrl(cover) : vehicleImage(v)}
                    alt=""
                    width={96}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-24 rounded-lg bg-surface-2 object-cover"
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={`${base}/flotte/${v.id}`} className="font-medium text-text hover:underline">
                    {v.brand} {v.model} <span className="tnum text-text-muted">{v.year}</span>
                  </Link>
                  <div className="font-latin-sans text-xs text-text-muted">
                    /{v.slug} · {v.transmission === 'automatic' ? 'Auto' : 'Manuelle'} · <span className="tnum">{v.seats}</span> pl.
                    {v.featured ? ' · en avant' : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-text-2">{CAT[v.category] || v.category}</td>
                <td className="px-4 py-3">
                  <span className="tnum font-semibold text-text">{formatMAD(v.pricePerDay, 'fr')}</span>
                  {v.priceVerified ? null : <div className="text-xs text-warning">à confirmer</div>}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="tnum text-text">{counts.total}</span>
                  <span className="text-text-muted">
                    {' '}
                    · <span className="tnum">{counts.available}</span> dispo
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-sm text-text-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${v.published ? 'bg-success' : 'bg-text-muted'}`}
                      aria-hidden="true"
                    />
                    {v.published ? 'Publié' : 'Brouillon'}
                  </span>
                </td>
                <td className="px-4 py-3 text-end">
                  <AdminLink href={`${base}/flotte/${v.id}`} variant="secondary" className="h-8 px-3 text-xs">
                    Ouvrir
                  </AdminLink>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

function coverUrl(photo) {
  const widths = photo.widths || [];
  const width = widths.includes(480) ? 480 : widths[0] || 480;
  const format = (photo.formats || ['webp'])[0];
  return `${STORAGE}/${photo.basePath}-${width}.${format}`;
}

function Chip({ href, active, children }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'border-border-strong bg-surface-2 text-text' : 'border-border text-text-2 hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}
