'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveVehicleModel } from '@/lib/actions/fleet';
import { CAR_IMAGES, CATEGORIES, FEATURES, FUELS, TRANSMISSIONS } from '@/lib/constants';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Card, SubmitButton } from '@/components/admin/ui';
import { CATEGORY_LABEL as CAT } from '@/lib/fleet-labels';

/**
 * The model sheet (plan 7.1).
 *
 * One form, one save. The payload carries EVERY column `save_vehicle` writes,
 * because that RPC is an upsert that overwrites the whole row — a partial
 * save would quietly blank the equipment list or the high-season price. That
 * is also why the equipment checkboxes and the silhouette live on this page
 * even though the operator opens it to change a price.
 *
 * The four description boxes are not a translation feature, they are the
 * product: the same car is sold in four languages and nothing is machine
 * translated behind the operator's back. Arabic is typed right-to-left, in its
 * own script, never uppercased (rule 3).
 */

const FUEL = { petrol: 'Essence', diesel: 'Diesel', hybrid: 'Hybride', electric: 'Électrique' };
const FEAT = { ac: 'Climatisation', bluetooth: 'Bluetooth', apple_carplay: 'CarPlay / Android Auto', usb: 'USB', camera: 'Caméra de recul', cruise: 'Régulateur', led: 'Phares LED', parking_sensors: 'Capteurs de stationnement', isofix: 'ISOFIX', leather: 'Cuir', sunroof: 'Toit ouvrant', '4wd': 'Transmission intégrale', hybrid: 'Hybride', massage: 'Sièges massants', sport: 'Châssis sport', gps: 'GPS' };

/* Kept in step with PURPOSE_TAGS in src/lib/actions/fleet.js — a 'use server'
   module cannot export the list, and zod refuses anything outside it. */
const PURPOSE = [
  { value: 'city', label: 'Ville' },
  { value: 'family', label: 'Famille' },
  { value: 'suv', label: 'SUV / 4x4' },
  { value: 'business', label: 'Affaires' },
  { value: 'premium', label: 'Premium' },
];

const DESCRIPTIONS = [
  { locale: 'fr', label: 'Français', dir: 'ltr' },
  { locale: 'en', label: 'English', dir: 'ltr' },
  { locale: 'ar', label: 'العربية', dir: 'rtl' },
  { locale: 'es', label: 'Español', dir: 'ltr' },
];

const num = (fd, key, fallback = 0) => {
  const raw = fd.get(key);
  return raw === null || String(raw).trim() === '' ? fallback : Number(raw);
};
const bool = (fd, key) => fd.get(key) === 'on';

export default function VehicleEditor({ vehicle = {}, base = '/admin', isNew = false, currentYear = 2026 }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const v = vehicle;

  const onSubmit = async (event) => {
    event.preventDefault();
    /* FormData is read before the first await: after one, `currentTarget` is
       already null and the whole form would come back empty. */
    const fd = new FormData(event.currentTarget);

    const payload = {
      id: v.id || undefined,
      slug: String(fd.get('slug') || ''),
      brand: String(fd.get('brand') || ''),
      model: String(fd.get('model') || ''),
      year: num(fd, 'year', currentYear),
      category: String(fd.get('category') || 'economy'),
      transmission: String(fd.get('transmission') || 'manual'),
      fuel: String(fd.get('fuel') || 'diesel'),
      seats: num(fd, 'seats', 5),
      doors: num(fd, 'doors', 5),
      luggage: num(fd, 'luggage', 2),
      ac: bool(fd, 'ac'),
      pricePerDay: num(fd, 'pricePerDay'),
      priceHighSeason: num(fd, 'priceHighSeason'),
      priceVerified: bool(fd, 'priceVerified'),
      deposit: num(fd, 'deposit'),
      mileageLimit: num(fd, 'mileageLimit'),
      minAge: num(fd, 'minAge', 21),
      minDays: num(fd, 'minDays', 1),
      prepBufferMinutes: num(fd, 'prepBufferMinutes', 120),
      sortOrder: num(fd, 'sortOrder', 100),
      image: String(fd.get('image') || 'berline'),
      photoFolder: String(fd.get('photoFolder') || ''),
      features: fd.getAll('features').map(String),
      purposeTags: fd.getAll('purposeTags').map(String),
      description: Object.fromEntries(DESCRIPTIONS.map((d) => [d.locale, String(fd.get(`description_${d.locale}`) || '')])),
      published: bool(fd, 'published'),
      featured: bool(fd, 'featured'),
      publishedBefore: Boolean(v.published),
      reason: String(fd.get('reason') || '').trim(),
    };

    setBusy(true);
    setResult(null);
    try {
      const saved = await saveVehicleModel(payload);
      setResult(saved);
      if (saved?.ok) {
        /* A new model has no URL until Postgres gives it an id; move onto its
           own page so the photo manager below has something to attach to. */
        if (isNew && saved.vehicle?.id) router.replace(`${base}/flotte/${saved.vehicle.id}`);
        else startTransition(() => router.refresh());
      }
    } catch {
      /* requireRole throws rather than returning — the page is already
         role-gated, so this is the expired-session case. */
      setResult({ ok: false, message: 'Enregistrement impossible : session expirée ou droits insuffisants.' });
    }
    setBusy(false);
  };

  const pending = busy || refreshing;

  return (
    <form onSubmit={onSubmit} className="space-y-5" data-testid="vehicle-editor">
      {result ? (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium ${result.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
        >
          {result.message}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Identité" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Marque" htmlFor="brand">
              <Input id="brand" name="brand" required maxLength={60} defaultValue={v.brand || ''} />
            </Field>
            <Field label="Modèle" htmlFor="model">
              <Input id="model" name="model" required maxLength={60} defaultValue={v.model || ''} />
            </Field>
            <Field label="Année" htmlFor="year">
              <Input id="year" name="year" type="number" min={1990} max={2100} required defaultValue={v.year || currentYear} className="tnum font-latin-sans" />
            </Field>
            <Field label="Slug (URL)" htmlFor="slug" hint="vide = généré" className="sm:col-span-2">
              <Input id="slug" name="slug" maxLength={80} defaultValue={v.slug || ''} className="font-latin-sans" />
            </Field>
            <Field label="Catégorie" htmlFor="category">
              <Select id="category" name="category" defaultValue={v.category || 'economy'}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CAT[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Boîte" htmlFor="transmission">
              <Select id="transmission" name="transmission" defaultValue={v.transmission || 'manual'}>
                {TRANSMISSIONS.map((c) => (
                  <option key={c} value={c}>
                    {c === 'manual' ? 'Manuelle' : 'Automatique'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Carburant" htmlFor="fuel">
              <Select id="fuel" name="fuel" defaultValue={v.fuel || 'diesel'}>
                {FUELS.map((c) => (
                  <option key={c} value={c}>
                    {FUEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Places" htmlFor="seats">
              <Input id="seats" name="seats" type="number" min={1} max={20} defaultValue={v.seats ?? 5} className="tnum font-latin-sans" />
            </Field>
            <Field label="Portes" htmlFor="doors">
              <Input id="doors" name="doors" type="number" min={2} max={6} defaultValue={v.doors ?? 5} className="tnum font-latin-sans" />
            </Field>
            <Field label="Bagages" htmlFor="luggage">
              <Input id="luggage" name="luggage" type="number" min={0} max={20} defaultValue={v.luggage ?? 2} className="tnum font-latin-sans" />
            </Field>
            <Field label="Silhouette" htmlFor="image" hint="tant qu’il n’y a pas de photo">
              <Select id="image" name="image" defaultValue={v.image || 'berline'}>
                {CAR_IMAGES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dossier photo" htmlFor="photoFolder" hint="images de build" className="sm:col-span-2">
              <Input id="photoFolder" name="photoFolder" maxLength={80} defaultValue={v.photoFolder || ''} className="font-latin-sans" />
            </Field>
            <Checkbox id="ac" name="ac" defaultChecked={v.ac !== false} label="Climatisation" className="sm:col-span-3" />
          </div>
        </Card>

        <Card title="Tarif & conditions">
          <div className="grid gap-4">
            <Field label="Prix par jour (MAD)" htmlFor="pricePerDay">
              <Input id="pricePerDay" name="pricePerDay" type="number" min={0} step={10} required defaultValue={v.pricePerDay ?? 0} className="tnum font-latin-sans" />
            </Field>
            <Field label="Prix haute saison (MAD)" htmlFor="priceHighSeason" hint="0 = aucun">
              <Input id="priceHighSeason" name="priceHighSeason" type="number" min={0} step={10} defaultValue={v.priceHighSeason ?? 0} className="tnum font-latin-sans" />
            </Field>
            <Checkbox
              id="priceVerified"
              name="priceVerified"
              defaultChecked={Boolean(v.priceVerified)}
              label="Prix confirmé par Diab Car"
            />
            <Field label="Caution (MAD)" htmlFor="deposit">
              <Input id="deposit" name="deposit" type="number" min={0} step={100} required defaultValue={v.deposit ?? 0} className="tnum font-latin-sans" />
            </Field>
            <Field label="Km / jour" htmlFor="mileageLimit" hint="0 = illimité">
              <Input id="mileageLimit" name="mileageLimit" type="number" min={0} defaultValue={v.mileageLimit ?? 0} className="tnum font-latin-sans" />
            </Field>
            <Field label="Âge minimum" htmlFor="minAge">
              <Input id="minAge" name="minAge" type="number" min={18} max={99} defaultValue={v.minAge ?? 21} className="tnum font-latin-sans" />
            </Field>
            <Field label="Durée minimum (jours)" htmlFor="minDays">
              <Input id="minDays" name="minDays" type="number" min={1} max={90} defaultValue={v.minDays ?? 1} className="tnum font-latin-sans" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Exploitation">
          <div className="grid gap-4">
            <Field
              label="Préparation entre deux locations (min)"
              htmlFor="prepBufferMinutes"
              hint="nettoyage + contrôle"
            >
              <Input id="prepBufferMinutes" name="prepBufferMinutes" type="number" min={0} max={1440} step={15} defaultValue={v.prepBufferMinutes ?? 120} className="tnum font-latin-sans" />
            </Field>
            <Field label="Ordre d’affichage" htmlFor="sortOrder" hint="petit = en haut">
              <Input id="sortOrder" name="sortOrder" type="number" min={0} max={9999} defaultValue={v.sortOrder ?? 100} className="tnum font-latin-sans" />
            </Field>
            <Checkbox id="published" name="published" defaultChecked={Boolean(v.published)} label="Publié sur le site" />
            <Checkbox id="featured" name="featured" defaultChecked={Boolean(v.featured)} label="Mis en avant sur l’accueil" />
            {/* The buffer is availability, not decoration: Postgres keeps the
                car out of the search for that long after every return. */}
            <p className="text-xs text-text-muted">
              La préparation bloque la voiture après chaque retour ; la disponibilité publique en tient compte.
            </p>
          </div>
        </Card>

        <Card title="Usage" className="lg:col-span-2">
          <p className="mb-3 text-xs text-text-muted">
            À qui cette voiture est proposée en priorité (pages ville, comparateur, filtres).
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PURPOSE.map((p) => (
              <Checkbox
                key={p.value}
                id={`purpose_${p.value}`}
                name="purposeTags"
                value={p.value}
                defaultChecked={(v.purposeTags || []).includes(p.value)}
                label={p.label}
              />
            ))}
          </div>

          <h3 className="mt-6 mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Équipements</h3>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Checkbox
                key={f}
                id={`feature_${f}`}
                name="features"
                value={f}
                defaultChecked={(v.features || []).includes(f)}
                label={FEAT[f] || f}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card title="Description (4 langues)">
        <p className="mb-4 text-xs text-text-muted">
          Ce texte est lu par le client et par Google. Ce qui n’est pas écrit ici n’apparaît nulle part.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {DESCRIPTIONS.map((d) => (
            <Field key={d.locale} label={d.label} htmlFor={`description_${d.locale}`}>
              <Textarea
                id={`description_${d.locale}`}
                name={`description_${d.locale}`}
                lang={d.locale}
                dir={d.dir}
                maxLength={4000}
                defaultValue={v.description?.[d.locale] || ''}
                className={d.locale === 'ar' ? 'text-start' : undefined}
              />
            </Field>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-end gap-3">
        <Field label="Motif (journal)" htmlFor="reason" hint="facultatif" className="min-w-64 flex-1">
          <Input id="reason" name="reason" maxLength={200} placeholder="Nouveau tarif rentrée 2026" />
        </Field>
        <SubmitButton disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer le modèle'}</SubmitButton>
      </div>
    </form>
  );
}
