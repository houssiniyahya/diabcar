'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBlockAction, deleteBlockAction } from '@/lib/actions/blocks';
import { changeStatus } from '@/lib/actions/reservations';
import { formatDateTime } from '@/lib/format';
import { STATUS_LABEL, nextStates } from '@/lib/reservation-states';
import { RESERVATION_SOURCE_LABEL, UNIT_STATUS_LABEL } from '@/lib/fleet-labels';
import {
  DEFAULT_BUFFER_MINUTES,
  LEGACY_NOTE,
  UNAVAILABLE_KINDS,
  UNBOOKABLE_UNIT_STATUSES,
  blockLabel,
  blockRefusalMessage,
  bookingLinkDates,
  dayLabel,
  inclusiveDays,
  periodLabel,
  segmentsForUnit,
  unassignedSegments,
  unavailableDraftProblem,
  unavailableRequests,
  unavailableSummary,
  withLanes,
} from '@/lib/availability-timeline';
import { Field, Input, Select } from '@/components/ui/Field';
import { Notice, SubmitButton } from '@/components/admin/ui';
import { cn } from '@/lib/cn';

/**
 * The model's availability, day by day, with the one control the owner asked
 * for: « rendre indisponible du … au … » (owner request 2026-09-16; plan 7.1).
 *
 * One row per physical car. A bar is either a reservation — whatever its
 * source: the website, the phone, the counter — or a block. Both keep the car
 * off the public site for their dates; the timeline only draws what the
 * database already enforces (rule 5: the UI never decides availability).
 *
 * The form writes BLOCKS, one per chosen unit, through createBlockAction →
 * create_block() (0014). Postgres refuses a period that lands on a booking of
 * that car, on another period of that car, or that would leave the model
 * unable to honour the bookings still waiting for a plate — and names what is
 * in the way. Every unit is tried and each answer is reported. A block is
 * deleted from its bar with a reason; a reservation is cancelled from its bar
 * with a reason, which is exactly the "except if I set annuler" of the request.
 *
 * Nothing here is red except a car that is out on the road right now
 * (`active`) and the today line — red is a signal (rule 2).
 */

const BAR_TONE = {
  pending: 'border-warning bg-warning-soft text-warning',
  confirmed: 'border-success bg-success-soft text-success',
  ready: 'border-success bg-success-soft text-success',
  active: 'border-red-signal bg-red-soft text-red-signal',
};

/** Pixels per day: 42 days ≈ 1180 px, which scrolls sideways on a laptop and reads whole on a wide screen. */
const DAY_PX = 28;
/** One lane of bars: a 26 px bar and a 6 px gap. */
const LANE_PX = 32;

const isBookable = (unit) => !UNBOOKABLE_UNIT_STATUSES.includes(unit?.status);

export default function VehicleAvailability({
  vehicle,
  units = [],
  reservations = [],
  blocks = [],
  win,
  nowIso,
  base = '/admin',
  autoExpireHours = null,
  loadError = false,
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(null); // { kind: 'reservation' | 'block', id }
  const [cancelReason, setCancelReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [message, setMessage] = useState(null); // { where: 'form' | 'panel', tone, lines }
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    choice: 'offsite',
    /* The first car the website can actually sell: blocking one already at
       the garage changes nothing on the site. */
    unitId: (units.find(isBookable) || units[0])?.id || '',
    from: win.today,
    to: win.today,
    reason: '',
  }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const say = (where, tone, lines) => setMessage({ where, tone, lines: Array.isArray(lines) ? lines : [lines] });

  const rows = useMemo(
    () =>
      units.map((u) => {
        const { segments, lanes } = withLanes(segmentsForUnit({ unitId: u.id, reservations, blocks, win }));
        return { unit: u, segments, lanes };
      }),
    [units, reservations, blocks, win],
  );
  const unassigned = useMemo(() => withLanes(unassignedSegments({ reservations, win })), [reservations, win]);
  const nowPct = ((Date.parse(nowIso) - Date.parse(win.from)) / (Date.parse(win.to) - Date.parse(win.from))) * 100;
  const trackWidth = win.days * DAY_PX;
  const bookableCount = units.filter(isBookable).length;

  /* Plain derivation, no manual memo: the React Compiler memoizes it, and a
     lookup across a few dozen bars costs nothing. */
  const current = findSelected(selected, rows, unassigned.segments);

  const select = (seg) => {
    setSelected({ kind: seg.kind, id: seg.id });
    /* A reason typed for one booking must never cancel another. */
    setCancelReason('');
    setDeleteReason('');
    setMessage(null);
  };

  /* -------------------------------------------------------------- actions */

  const submitUnavailable = async (event) => {
    event.preventDefault();
    setMessage(null);
    const unitIds = form.unitId === 'all' ? units.map((u) => u.id) : units.some((u) => u.id === form.unitId) ? [form.unitId] : [];
    const problem = unavailableDraftProblem({ from: form.from, to: form.to, unitIds, reason: form.reason, today: win.today });
    if (problem) {
      say('form', 'warning', problem);
      return;
    }
    const requests = unavailableRequests({
      unitIds,
      from: form.from,
      to: form.to,
      choice: form.choice,
      reason: form.reason,
      bufferMinutes: vehicle?.prepBufferMinutes ?? DEFAULT_BUFFER_MINUTES,
    });

    setBusy(true);
    const outcomes = [];
    try {
      /* Every unit is tried, one after the other, and every answer kept: a
         refusal on one plate says nothing about the next. */
      for (const req of requests) {
        const unit = units.find((u) => u.id === req.unitId);
        const plate = unit?.plate || 'cette unité';
        try {
          const result = await createBlockAction(req);
          outcomes.push({ plate, ok: Boolean(result?.ok), bookable: isBookable(unit), result });
        } catch {
          outcomes.push({ plate, ok: false, bookable: isBookable(unit), result: { error: 'SERVER' } });
        }
      }
    } finally {
      setBusy(false);
    }

    const summary = unavailableSummary({ outcomes, from: form.from, to: form.to, bookableCount });
    say('form', summary.tone, summary.lines);
    if (outcomes.some((o) => o.ok)) {
      if (outcomes.every((o) => o.ok)) set({ reason: '' });
      router.refresh();
    }
  };

  const removeBlock = async (seg) => {
    const reason = deleteReason.trim();
    if (!reason) {
      say('panel', 'warning', 'Indiquez pourquoi ces dates redeviennent disponibles : le motif va au journal.');
      return;
    }
    setBusy(true);
    let result;
    try {
      result = await deleteBlockAction({ id: seg.id, reason });
    } catch {
      result = { ok: false, error: 'SERVER' };
    } finally {
      setBusy(false);
    }
    if (result?.ok) {
      setSelected(null);
      setDeleteReason('');
      say('panel', 'success', [`Indisponibilité ${seg.plate ? `de ${seg.plate} ` : ''}supprimée (${periodLabel(seg.startAt, seg.endAt)}) : ces dates sont de nouveau à la vente.`, ...(result.legacy ? [LEGACY_NOTE] : [])]);
      router.refresh();
    } else {
      say('panel', 'danger', blockRefusalMessage(result, { plate: seg.plate }));
    }
  };

  const cancelReservation = async (seg) => {
    const reason = cancelReason.trim();
    if (!reason) {
      say('panel', 'warning', 'Indiquez le motif de l’annulation : le client peut le contester plus tard.');
      return;
    }
    setBusy(true);
    let result;
    try {
      result = await changeStatus({ id: seg.id, status: 'cancelled', reason });
    } catch {
      result = { ok: false, error: 'SERVER' };
    } finally {
      setBusy(false);
    }
    if (result?.ok) {
      setSelected(null);
      setCancelReason('');
      say('panel', 'success', `${seg.reference || 'Réservation'} annulée : ses dates sont de nouveau disponibles sur le site.`);
      router.refresh();
    } else {
      say(
        'panel',
        'danger',
        result?.error === 'FORBIDDEN'
          ? 'Votre rôle ne permet pas cette action.'
          : result?.error === 'SERVER'
            ? 'Le serveur n’a pas répondu. Rechargez la page (session expirée ?) puis réessayez.'
            : `Annulation refusée${result?.error ? ` (${result.error})` : ''}.`,
      );
    }
  };

  /* ----------------------------------------------------------------- view */

  const linkDates = bookingLinkDates({ from: form.from, to: form.to });
  const offsiteHref = linkDates ? `${base}/reservations/nouvelle?${new URLSearchParams({ vehicle: vehicle?.slug || '', ...linkDates }).toString()}` : null;
  const draftDays = form.from && form.to && form.to >= form.from ? (form.from === form.to ? `le ${dayLabel(form.from)}` : `du ${dayLabel(form.from)} au ${dayLabel(form.to)}`) : null;

  return (
    <div data-testid="vehicle-availability" data-busy={busy ? 'true' : 'false'}>
      {loadError ? (
        <div className="mb-3">
          <Notice tone="warning">Une partie des réservations ou des indisponibilités n’a pas pu être lue : ce calendrier peut être incomplet. Rechargez la page avant de modifier quoi que ce soit.</Notice>
        </div>
      ) : null}

      {/* ---- legend ---- */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
        <LegendSwatch className={BAR_TONE.pending}>À confirmer</LegendSwatch>
        <LegendSwatch className={BAR_TONE.confirmed}>Confirmée</LegendSwatch>
        <LegendSwatch className={BAR_TONE.active}>En cours</LegendSwatch>
        <LegendSwatch className="border-dashed border-border-strong bg-surface-2 text-text-muted">Indisponible</LegendSwatch>
      </div>

      {/* ---- timeline ---- */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-1" data-testid="availability-timeline">
        <div style={{ minWidth: `calc(10rem + ${trackWidth}px)` }}>
          {/* months */}
          <div className="grid grid-cols-[10rem_1fr] border-b border-border">
            <div />
            <div className="relative h-6">
              {win.slots.map((s, i) =>
                s.monthLabel ? (
                  <span key={s.day} className="absolute top-1 text-[11px] font-semibold capitalize text-text-2" style={{ insetInlineStart: `${(i / win.days) * 100}%`, paddingInlineStart: 4 }}>
                    {s.monthLabel}
                  </span>
                ) : null,
              )}
            </div>
          </div>
          {/* days */}
          <div className="grid grid-cols-[10rem_1fr] border-b border-border">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Unité</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${win.days}, minmax(0, 1fr))` }}>
              {win.slots.map((s) => (
                <div key={s.day} data-day={s.day} className={cn('border-s border-border py-1 text-center', s.weekend && 'bg-surface-2/60', s.today && 'bg-red-soft')}>
                  <div className="text-[9px] text-text-muted">{s.weekday}</div>
                  <div className={cn('tnum text-[11px] font-semibold', s.today ? 'text-red-signal' : 'text-text-2')}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="p-5 text-sm text-text-muted">Aucune unité : ce modèle n’a pas encore de plaque, donc rien à rendre indisponible.</p>
          ) : (
            rows.map(({ unit, segments, lanes }) => (
              <Row
                key={unit.id}
                label={unit.plate || '—'}
                sub={unit.status !== 'available' ? `${UNIT_STATUS_LABEL[unit.status] || unit.status}${isBookable(unit) ? '' : ' · hors site'}` : null}
                testId={`timeline-row-${unit.id}`}
                win={win}
                nowPct={nowPct}
                lanes={lanes}
              >
                {segments.map((seg) => (
                  <Bar key={`${seg.kind}-${seg.id}`} seg={seg} selected={selected?.kind === seg.kind && selected?.id === seg.id} onSelect={() => select(seg)} />
                ))}
              </Row>
            ))
          )}

          {unassigned.segments.length > 0 ? (
            <Row label="Sans plaque" sub="compte sur le modèle" testId="timeline-row-unassigned" win={win} nowPct={nowPct} lanes={unassigned.lanes}>
              {unassigned.segments.map((seg) => (
                <Bar key={seg.id} seg={seg} selected={selected?.kind === 'reservation' && selected?.id === seg.id} onSelect={() => select(seg)} />
              ))}
            </Row>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Une réservation bloque ses dates toute seule, jusqu’à ce qu’elle soit annulée. Une réservation sans plaque compte quand même sur le modèle : attribuez-lui une voiture depuis sa fiche.
        {autoExpireHours > 0 ? ` Une demande web non confirmée expire d’elle-même après ${autoExpireHours} h : confirmez-la depuis la réservation pour la garder. Une réservation prise par l’agence est confirmée d’office.` : ''}
        {' '}Cliquez une barre pour l’ouvrir, l’annuler ou la supprimer.
      </p>

      {message?.where === 'panel' ? <Message message={message} /> : null}

      {/* ---- selection ---- */}
      {current ? (
        <div className="mt-4 rounded-lg border border-border-strong bg-surface-1 p-4" data-testid="availability-selected">
          {current.kind === 'reservation' ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-latin-sans text-base font-semibold text-text">{current.reference || 'Réservation'}</h3>
                <button type="button" onClick={() => setSelected(null)} className="text-sm text-text-muted hover:text-text" aria-label="Fermer">✕</button>
              </div>
              <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                <Detail label="Statut" value={STATUS_LABEL[current.status] || current.status} />
                <Detail label="Origine" value={RESERVATION_SOURCE_LABEL[current.source] || current.source} />
                <Detail label="Unité" value={current.plate || 'pas encore de plaque'} latin />
                <Detail label="Client" value={current.customer || '—'} />
                <Detail label="Départ" value={formatDateTime(current.startAt, 'fr')} />
                <Detail label="Retour" value={formatDateTime(current.endAt, 'fr')} />
              </dl>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <Link href={`${base}/reservations/${current.id}`} className="inline-flex h-10 items-center rounded-full border border-border-strong px-4 text-sm font-semibold text-text">
                  Ouvrir la réservation
                </Link>
                {nextStates(current.status).includes('cancelled') ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      cancelReservation(current);
                    }}
                  >
                    <Field label="Motif de l’annulation" htmlFor="cancel-reason" className="min-w-56">
                      <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Client injoignable, doublon…" maxLength={200} />
                    </Field>
                    <SubmitButton variant="danger" disabled={busy} data-testid="cancel-reservation">
                      Annuler la réservation
                    </SubmitButton>
                  </form>
                ) : (
                  <p className="text-xs text-text-muted">Cette réservation ne peut plus être annulée d’ici ({STATUS_LABEL[current.status] || current.status}).</p>
                )}
              </div>
            </>
          ) : (
            <BlockPanel current={current} busy={busy} deleteReason={deleteReason} setDeleteReason={setDeleteReason} onDelete={() => removeBlock(current)} onClose={() => setSelected(null)} />
          )}
        </div>
      ) : null}

      {/* ---- rendre indisponible ---- */}
      <form onSubmit={submitUnavailable} className="mt-6 rounded-lg border border-border bg-surface-1 p-4" data-testid="unavailable-form">
        <h3 className="text-base font-semibold text-text">Rendre indisponible</h3>
        <p className="mt-1 text-sm text-text-2">
          Une réservation prise au téléphone, sur WhatsApp ou au comptoir, une réparation, un usage interne : la voiture disparaît du site sur ces jours exactement, jour de fin inclus. La veille au soir et le lendemain matin restent réservables.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Raison" htmlFor="unavail-choice" className="lg:col-span-2">
            <Select id="unavail-choice" value={form.choice} onChange={(e) => set({ choice: e.target.value })}>
              {UNAVAILABLE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unité" htmlFor="unavail-unit">
            <Select id="unavail-unit" value={form.unitId} onChange={(e) => set({ unitId: e.target.value })} disabled={units.length === 0}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.plate || u.id}
                  {isBookable(u) ? '' : ` — déjà hors site (${UNIT_STATUS_LABEL[u.status] || u.status})`}
                </option>
              ))}
              {units.length > 1 ? <option value="all">Toutes les unités ({units.length})</option> : null}
            </Select>
          </Field>
          <Field label="Du" htmlFor="unavail-from">
            <Input id="unavail-from" type="date" value={form.from} min={win.today} onChange={(e) => set({ from: e.target.value, to: form.to && form.to < e.target.value ? e.target.value : form.to })} required className="tnum" />
          </Field>
          <Field label="Au (inclus)" htmlFor="unavail-to">
            <Input id="unavail-to" type="date" value={form.to} min={form.from || win.today} onChange={(e) => set({ to: e.target.value })} required className="tnum" />
          </Field>
          <Field label="Motif" htmlFor="unavail-reason" hint={form.choice === 'offsite' ? 'nom et téléphone du client' : 'apparaît dans le journal'} className="sm:col-span-2 lg:col-span-5">
            <Input id="unavail-reason" value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder={form.choice === 'offsite' ? 'M. Alami, 06 12 34 56 78' : 'Vidange, pare-brise…'} maxLength={form.choice === 'offsite' ? 170 : 200} required />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SubmitButton disabled={busy || units.length === 0} data-testid="unavailable-submit">
            {draftDays ? `Rendre indisponible ${draftDays}` : 'Rendre indisponible'}
          </SubmitButton>
          {form.choice === 'offsite' ? (
            vehicle?.published === false ? (
              <span className="text-xs text-text-muted">Modèle en brouillon : publiez-le pour y enregistrer une vraie réservation.</span>
            ) : offsiteHref ? (
              <Link href={offsiteHref} className="text-sm text-text-2 underline hover:text-text" data-testid="offsite-booking-link">
                Ou enregistrer une vraie réservation (client, prix, contrat) →
              </Link>
            ) : null
          ) : null}
        </div>
        {message?.where === 'form' ? <Message message={message} /> : null}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------- parts */

/** The bar the operator clicked, with the plate of the row it sits on (null for the unassigned row). */
function findSelected(selected, rows, unassigned) {
  if (!selected) return null;
  for (const row of rows) {
    const seg = row.segments.find((s) => s.kind === selected.kind && s.id === selected.id);
    if (seg) return { ...seg, plate: row.unit.plate };
  }
  const seg = unassigned.find((s) => s.kind === selected.kind && s.id === selected.id);
  return seg ? { ...seg, plate: null } : null;
}

function Message({ message }) {
  return (
    <div className="mt-3" data-testid="availability-message" role="status">
      <Notice tone={message.tone}>
        {message.lines.length === 1 ? (
          message.lines[0]
        ) : (
          <span className="block space-y-1">
            {message.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        )}
      </Notice>
    </div>
  );
}

function BlockPanel({ current, busy, deleteReason, setDeleteReason, onDelete, onClose }) {
  const days = inclusiveDays(current.startAt, current.endAt);
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-text">{blockLabel(current)}</h3>
        <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text" aria-label="Fermer">✕</button>
      </div>
      <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        <Detail label="Unité" value={current.plate || '—'} latin />
        <Detail label="Motif" value={current.reason || '—'} />
        <Detail label="Du" value={dayLabel(days.from)} />
        <Detail label="Au (inclus)" value={days.to ? dayLabel(days.to) : 'sans date de fin'} />
      </dl>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onDelete();
        }}
      >
        <Field
          label="Pourquoi remettre ces dates en vente ?"
          htmlFor="delete-block-reason"
          hint={current.offsite ? 'le nom du client n’est noté que dans ce motif' : 'apparaît dans le journal'}
          className="min-w-64"
        >
          <Input id="delete-block-reason" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder={current.offsite ? 'Client a annulé par téléphone…' : 'Réparation terminée plus tôt…'} maxLength={200} />
        </Field>
        <SubmitButton variant="danger" disabled={busy} data-testid="delete-block">
          Supprimer l’indisponibilité
        </SubmitButton>
      </form>
    </>
  );
}

function Row({ label, sub, testId, win, nowPct, lanes = 1, children }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] border-b border-border last:border-b-0" data-testid={testId} data-lanes={lanes}>
      <div className="flex min-w-0 flex-col justify-center px-3 py-2">
        <span className="truncate font-latin-sans text-sm font-medium text-text">{label}</span>
        {sub ? <span className="truncate text-[10px] text-text-muted">{sub}</span> : null}
      </div>
      <div
        className="relative"
        style={{
          height: `${6 + lanes * LANE_PX}px`,
          backgroundImage: `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${100 / win.days}%)`,
        }}
      >
        {nowPct >= 0 && nowPct <= 100 ? <span aria-hidden="true" className="absolute inset-y-0 z-10 w-px bg-red-signal" style={{ insetInlineStart: `${nowPct}%` }} /> : null}
        {children}
      </div>
    </div>
  );
}

function Bar({ seg, selected, onSelect }) {
  const isBlock = seg.kind === 'block';
  const text = isBlock ? blockLabel(seg) : seg.reference || STATUS_LABEL[seg.status] || seg.status;
  const title = isBlock
    ? `${text}${seg.reason ? ` — ${seg.reason}` : ''} · ${periodLabel(seg.startAt, seg.endAt)}`
    : `${text} · ${STATUS_LABEL[seg.status] || seg.status} (${RESERVATION_SOURCE_LABEL[seg.source] || seg.source}) · ${formatDateTime(seg.startAt, 'fr')} → ${formatDateTime(seg.endAt, 'fr')}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-pressed={selected}
      data-testid={`timeline-bar-${seg.id}`}
      data-kind={seg.kind}
      data-lane={seg.lane || 0}
      className={cn(
        'absolute flex h-[26px] min-w-1 items-center overflow-hidden rounded border px-1.5 text-start text-[10px] font-semibold',
        isBlock ? 'border-dashed border-border-strong bg-surface-2 text-text-muted' : BAR_TONE[seg.status] || 'border-border bg-surface-2 text-text-2',
        selected && 'ring-2 ring-text ring-offset-1 ring-offset-surface-1',
        seg.clippedStart && 'rounded-s-none',
        seg.clippedEnd && 'rounded-e-none',
      )}
      style={{ top: `${6 + (seg.lane || 0) * LANE_PX}px`, insetInlineStart: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
    >
      <span className={cn('truncate', !isBlock && 'font-latin-sans')}>{text}</span>
    </button>
  );
}

function LegendSwatch({ className, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn('inline-block h-3 w-5 rounded border', className)} />
      {children}
    </span>
  );
}

function Detail({ label, value, latin = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1.5 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className={cn('text-end text-text', latin ? 'font-latin-sans' : 'tnum')}>{value}</dd>
    </div>
  );
}
