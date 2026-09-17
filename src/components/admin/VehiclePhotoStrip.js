import CarImage, { hasCarShot } from '@/components/site/CarImage';
import { cn } from '@/lib/cn';

/**
 * The car's photos, before its name (owner request 2026-09-16, plan 7.1).
 *
 * The same `CarImage` the public site renders, so what the owner sees here is
 * exactly what a customer sees: an uploaded photo first, else the committed
 * one, else the category silhouette. Server component, like the page: the
 * blur manifest never reaches the browser.
 *
 * Only angles that really exist are shown. With none at all, one silhouette
 * frame says so and points at the Photos section below, instead of five
 * identical grey cars pretending to be a gallery.
 *
 * @param {{ vehicle: object, photos?: object[], label: string, photosAnchor?: string }} props
 */

const ANGLES = [
  { key: 'front', label: 'Avant' },
  { key: 'side', label: 'Profil' },
  { key: 'rear', label: 'Arrière' },
  { key: 'interior', label: 'Intérieur' },
  { key: 'dash', label: 'Tableau de bord' },
];

export default function VehiclePhotoStrip({ vehicle, photos = [], label, photosAnchor = '#photos' }) {
  const shots = ANGLES.filter((a) => hasCarShot(vehicle, a.key, photos));

  if (shots.length === 0) {
    return (
      <div data-testid="vehicle-photo-strip" data-count="0" className="flex flex-wrap items-center gap-4">
        <div className="w-56 overflow-hidden rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface-1">
          <CarImage vehicle={vehicle} photos={photos} angle="front" alt="" sizes="224px" className="aspect-[16/10]" />
        </div>
        <p className="max-w-xs text-sm text-text-muted">
          Aucune photo pour ce modèle : le site montre la silhouette.{' '}
          <a href={photosAnchor} className="font-semibold text-text underline">
            Ajouter des photos
          </a>
        </p>
      </div>
    );
  }

  return (
    <div data-testid="vehicle-photo-strip" data-count={shots.length} className="flex gap-3 overflow-x-auto pb-1">
      {shots.map((a, i) => (
        <figure key={a.key} className={cn('shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-1', i === 0 ? 'w-72' : 'w-44')}>
          <CarImage vehicle={vehicle} photos={photos} angle={a.key} alt={`${a.label} — ${label}`} sizes={i === 0 ? '288px' : '176px'} priority={i === 0} className="aspect-[16/10]" />
          <figcaption className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{a.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
