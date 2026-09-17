'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createReservationByStaff } from '@/lib/actions/reservations';
import { t as pick } from '@/lib/constants';
import { formatDateTime, formatMAD } from '@/lib/format';

/**
 * Taking a booking at the counter or on the phone (plan 7.1).
 *
 * Deliberately two moves, not one: QUOTE, then CREATE. Rule 4 says the
 * breakdown comes before the confirmation and nothing may appear afterwards
 * that was not shown — so the agent reads the total to the customer from the
 * same figures that will be written to the reservation. Change a date or an
 * option after quoting and the create button locks again until the quote is
 * refreshed; there is no path to a booking whose price nobody saw.
 *
 * The quote comes from /api/quote — the same endpoint the public funnel uses,
 * so a counter price and a web price for the same car and dates cannot drift.
 */

const SOURCES = [
  { value: 'walkin', label: 'Au comptoir' },
  { value: 'phone', label: 'Téléphone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'admin', label: 'Interne' },
];

/**
 * @param {object} props
 * @param {{ vehicle?: string, from?: string, to?: string }} [props.initial] A
 *   car (slug) and dates to start from — the model page's "réservation hors
 *   site" link arrives with them, so the agent only types the customer. A
 *   slug that is not in `vehicles` (a draft model) is NOT replaced by another
 *   car: the field stays empty and the form says why.
 */
export default function ReservationCreateForm({ vehicles = [], locations = [], extras = [], base = '/admin', initial = {} }) {
  const router = useRouter();

  const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const askedVehicleMissing = Boolean(initial.vehicle) && !vehicles.some((v) => v.slug === initial.vehicle);
  const [form, setForm] = useState(() => ({
    vehicle: initial.vehicle ? (askedVehicleMissing ? '' : initial.vehicle) : vehicles[0]?.slug || '',
    from: day(initial.from),
    ft: '10:00',
    to: day(initial.to),
    tt: '10:00',
    pickup: locations[0]?.key || 'agency',
    dropoff: locations[0]?.key || 'agency',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    locale: 'fr',
    source: 'walkin',
    notes: '',
  }));
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [quoted, setQuoted] = useState(null); // { key, quote }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  /* Everything the price depends on. If this string changes, the quote on
     screen is stale and the create button must not fire. */
  const priceKey = useMemo(
    () => JSON.stringify([form.vehicle, form.from, form.ft, form.to, form.tt, form.pickup, form.dropoff, [...selectedExtras].sort()]),
    [form.vehicle, form.from, form.ft, form.to, form.tt, form.pickup, form.dropoff, selectedExtras],
  );
  const fresh = quoted && quoted.key === priceKey;
  const activeExtras = extras.filter((x) => x.active !== false);

  const askQuote = async () => {
    setProblem(null);
    if (!form.vehicle || !form.from || !form.to) {
      setProblem({ kind: 'text', text: 'Choisissez une voiture et les deux dates.' });
      return;
    }
    /* +01:00 explicitly, the same assumption toISO() makes when the server
       action turns these fields into instants. A bare local-time string is
       read in whatever zone the SERVER runs in, so a quote computed on a
       Workers node could cover different days than the reservation created
       from the very same form. */
    const startAt = `${form.from}T${form.ft}:00+01:00`;
    const endAt = `${form.to}T${form.tt}:00+01:00`;
    if (new Date(endAt) <= new Date(startAt)) {
      setProblem({ kind: 'text', text: 'Le retour doit être après le départ.' });
      return;
    }

    setBusy(true);
    try {
      const params = new URLSearchParams({ vehicle: form.vehicle, startAt, endAt, pickup: form.pickup, dropoff: form.dropoff, locale: 'fr' });
      for (const key of selectedExtras) params.append('extras', key);
      const res = await fetch(`/api/quote?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json?.ok) {
        setProblem({ kind: 'text', text: 'Devis impossible pour ces paramètres.' });
        setQuoted(null);
        return;
      }
      setQuoted({ key: priceKey, quote: json.quote, availability: json.availability || null });
    } catch {
      setProblem({ kind: 'text', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!fresh) return;
    setProblem(null);
    setBusy(true);
    try {
      const result = await createReservationByStaff({ ...form, extras: selectedExtras });
      if (result?.ok && result.status === 'confirmed') {
        router.push(`${base}/reservations/${result.id}`);
        return;
      }
      if (result?.ok) {
        /* Created, but the confirmation was refused or failed: left pending,
           it would be cancelled by the auto-expiry. Say so, do not redirect. */
        setProblem({ kind: 'pending', id: result.id, reference: result.reference });
        return;
      }
      if (result?.error === 'SOLD_OUT') {
        setProblem({ kind: 'sold_out', nextAvailableAt: result.nextAvailableAt, alternatives: result.alternatives || [] });
        return;
      }
      setProblem({
        kind: 'text',
        text:
          result?.error === 'VALIDATION'
            ? `Champs à corriger : ${Object.keys(result.fieldErrors || {}).join(', ')}.`
            : result?.error === 'BAD_DATES'
              ? 'Le retour doit être après le départ.'
              : result?.error === 'NOT_FOUND'
                ? 'Véhicule introuvable.'
                : `Échec : ${result?.error || 'inconnu'}.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const q = fresh ? quoted.quote : null;

  return (
    <form onSubmit={submit} data-testid="reservation-create" className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        {/* ---- car and dates ---- */}
        <fieldset className="rounded-lg border border-border bg-surface-1 p-5">
          <legend className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Voiture et dates</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Véhicule">
              <select name="vehicle" value={form.vehicle} onChange={(e) => set({ vehicle: e.target.value })} required className={INPUT}>
                {form.vehicle === '' ? <option value="">— Choisir une voiture —</option> : null}
                {vehicles.map((v) => (
                  <option key={v.slug} value={v.slug}>
                    {v.brand} {v.model}
                  </option>
                ))}
              </select>
              {askedVehicleMissing ? (
                <span className="mt-1 block text-xs text-warning" data-testid="staff-vehicle-missing">
                  Le modèle demandé n’est pas publié : choisissez la voiture vous-même.
                </span>
              ) : null}
            </Field>
            <Field label="Origine">
              <select name="source" value={form.source} onChange={(e) => set({ source: e.target.value })} className={INPUT}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Départ">
              <div className="flex gap-2">
                <input type="date" value={form.from} onChange={(e) => set({ from: e.target.value })} required className={INPUT} />
                <input type="time" value={form.ft} onChange={(e) => set({ ft: e.target.value })} required className={`${INPUT} w-28`} />
              </div>
            </Field>
            <Field label="Retour">
              <div className="flex gap-2">
                <input type="date" value={form.to} onChange={(e) => set({ to: e.target.value })} required className={INPUT} />
                <input type="time" value={form.tt} onChange={(e) => set({ tt: e.target.value })} required className={`${INPUT} w-28`} />
              </div>
            </Field>
            <Field label="Prise en charge">
              <select value={form.pickup} onChange={(e) => set({ pickup: e.target.value })} className={INPUT}>
                {locations.map((l) => (
                  <option key={l.key} value={l.key}>
                    {pick(l.name, 'fr') || l.key}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Restitution">
              <select value={form.dropoff} onChange={(e) => set({ dropoff: e.target.value })} className={INPUT}>
                {locations.map((l) => (
                  <option key={l.key} value={l.key}>
                    {pick(l.name, 'fr') || l.key}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>

        {/* ---- extras ---- */}
        {activeExtras.length > 0 ? (
          <fieldset className="rounded-lg border border-border bg-surface-1 p-5">
            <legend className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Options</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeExtras.map((x) => (
                <label key={x.key} className="flex items-center gap-3 text-sm text-text-2">
                  <input
                    type="checkbox"
                    checked={selectedExtras.includes(x.key)}
                    onChange={() =>
                      setSelectedExtras((cur) => (cur.includes(x.key) ? cur.filter((k) => k !== x.key) : [...cur, x.key]))
                    }
                    className="h-4 w-4 accent-red"
                  />
                  <span>{pick(x.name, 'fr') || x.key}</span>
                  <span className="tnum ms-auto text-text-muted">
                    {formatMAD(Number(x.price) || 0, 'fr')} {x.type === 'per_day' ? '/ jour' : '/ location'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {/* ---- customer ---- */}
        <fieldset className="rounded-lg border border-border bg-surface-1 p-5">
          <legend className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Client</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom">
              <input value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} required className={INPUT} />
            </Field>
            <Field label="Nom">
              <input value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Téléphone">
              {/* The phone is the identity: create_reservation() matches an
                  existing customer on it rather than making a duplicate. */}
              <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} required inputMode="tel" placeholder="+212…" className={`${INPUT} font-latin-sans`} />
            </Field>
            <Field label="E-mail (facultatif)">
              <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={INPUT} />
            </Field>
            <Field label="Langue">
              <select value={form.locale} onChange={(e) => set({ locale: e.target.value })} className={INPUT}>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="es">Español</option>
              </select>
            </Field>
            <Field label="Notes">
              <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} />
            </Field>
          </div>
        </fieldset>
      </div>

      {/* ---- quote and confirm ---- */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-lg border border-border bg-surface-1 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Devis</p>

          {q ? (
            <dl className="mt-4 space-y-2 text-sm" data-testid="staff-quote">
              <Line label={`${formatMAD(q.basePerDay, 'fr')} × ${q.days} j`} value={formatMAD(q.subtotal, 'fr')} />
              {q.seasonAdjustment ? <Line label="dont saison" value={`${q.seasonAdjustment > 0 ? '+' : '−'} ${formatMAD(Math.abs(q.seasonAdjustment), 'fr')}`} /> : null}
              {q.discountAmount ? <Line label={`Remise ${q.discountPct} %`} value={`− ${formatMAD(q.discountAmount, 'fr')}`} /> : null}
              {(q.extras || []).map((line) => (
                <Line key={line.key} label={pick(line.name, 'fr') || line.key} value={formatMAD(line.total, 'fr')} />
              ))}
              {q.deliveryOnRequest ? (
                <Line label="Livraison" value="à devis — non incluse" />
              ) : q.deliveryFee ? (
                <Line label="Livraison" value={formatMAD(q.deliveryFee, 'fr')} />
              ) : null}
              {q.oneWayFee ? <Line label="Aller simple" value={formatMAD(q.oneWayFee, 'fr')} /> : null}
              <div className="border-t border-border pt-2">
                <Line label="Total" value={formatMAD(q.total, 'fr')} strong />
              </div>
              <Line label="Caution" value={formatMAD(q.deposit, 'fr')} />
              <Line label="Par jour" value={formatMAD(q.perDayEffective, 'fr')} />
              <p className="pt-2 text-xs text-text-muted">Encaissement à la prise en charge. Aucun paiement en ligne.</p>
              {quoted.availability && !quoted.availability.available ? (
                <p className="rounded border border-red-signal p-2 text-xs text-text" data-testid="staff-quote-soldout">
                  ⚠ Aucune unité libre sur ces dates — la création sera refusée.
                </p>
              ) : null}
              {quoted.availability?.lastOne ? <p className="text-xs text-text-2">Dernière unité libre.</p> : null}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-text-muted">
              {quoted ? 'Les paramètres ont changé — recalculez le devis.' : 'Calculez le devis avant de créer la réservation.'}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={askQuote} disabled={busy} data-testid="staff-quote-btn" className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold text-text disabled:opacity-50">
              {busy ? '…' : 'Calculer le devis'}
            </button>
            <button type="submit" disabled={busy || !fresh} data-testid="staff-create-btn" className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              Créer la réservation
            </button>
          </div>

          {problem ? <Problem problem={problem} base={base} /> : null}
        </div>
      </aside>
    </form>
  );
}

/**
 * A refusal an agent can act on. SOLD_OUT is not an error message: it is the
 * database telling the counter when this car frees up and which comparable
 * cars are free right now, so the customer is not simply turned away.
 */
function Problem({ problem, base }) {
  if (problem.kind === 'pending') {
    return (
      <div className="mt-5 rounded-lg border border-warning bg-warning-soft p-3 text-sm text-text" role="alert" data-testid="staff-create-pending">
        <p className="font-semibold">Réservation {problem.reference} créée, mais NON confirmée.</p>
        <p className="mt-1 text-text-2">Confirmez-la maintenant depuis sa fiche : une demande non confirmée est annulée automatiquement après quelques heures.</p>
        <Link href={`${base}/reservations/${problem.id}`} className="mt-2 inline-block font-semibold text-text underline">
          Ouvrir {problem.reference}
        </Link>
      </div>
    );
  }
  if (problem.kind === 'text') {
    return (
      <p className="mt-5 rounded-lg border border-red-signal bg-red-soft/30 p-3 text-sm text-text" role="alert" data-testid="staff-create-error">
        {problem.text}
      </p>
    );
  }
  return (
    <div className="mt-5 rounded-lg border border-red-signal bg-red-soft/30 p-3 text-sm text-text" role="alert" data-testid="staff-create-error">
      <p className="font-semibold">⚠ CONFLIT — cette voiture n’est pas libre sur ces dates.</p>
      {problem.nextAvailableAt ? (
        <p className="mt-2 text-text-2">
          Prochaine disponibilité : <span className="tnum">{formatDateTime(problem.nextAvailableAt, 'fr')}</span>.
        </p>
      ) : null}
      {problem.alternatives.length > 0 ? (
        <>
          <p className="mt-3 text-text-2">Libres sur la même période :</p>
          <ul className="mt-1 space-y-1" data-testid="staff-alternatives">
            {problem.alternatives.map((a) => (
              <li key={a.vehicleId} className="text-text-2">
                · {a.brand} {a.model}
                {a.basePerDay ? <span className="tnum text-text-muted"> — {formatMAD(a.basePerDay, 'fr')} / jour</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-text-2">Aucune alternative libre sur cette période.</p>
      )}
    </div>
  );
}

const INPUT = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text placeholder:text-text-muted';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function Line({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-semibold text-text' : 'text-text-muted'}>{label}</dt>
      <dd className={`tnum text-end ${strong ? 'font-semibold text-text' : 'text-text-2'}`}>{value}</dd>
    </div>
  );
}
