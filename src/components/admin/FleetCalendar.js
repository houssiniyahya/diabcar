'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBlockAction, deleteBlockAction } from '@/lib/actions/blocks';
import { moveDates } from '@/lib/actions/reservations';
import { placeRange, shiftIso, slotsFromDx, snapToSlot } from '@/lib/calendar';
import { formatDateTime } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/reservation-states';
import { blockRefusalMessage } from '@/lib/availability-timeline';

/**
 * The fleet calendar (plan 7.3).
 *
 * One row per UNIT — a plate, not a model — because that is the thing that can
 * only be in one place at a time, grouped under its model so an operator scans
 * "Dacia Logan" and sees all four of them at once.
 *
 * Plain CSS grid and pointer events, no calendar library: the geometry is two
 * percentages per bar, and a dependency would cost more kilobytes than the
 * whole admin budget for a widget used by five people (rule 9).
 *
 * Dragging is a SHORTCUT, never the only route. Every move it can make is also
 * available from the reservation's own page as two datetime fields, so the
 * calendar is not a keyboard trap; clicking a bar here opens that page.
 *
 * The optimistic rule: a dragged bar renders at its new dates immediately, and
 * the server is asked. If Postgres refuses — a conflict, a block, dates that
 * run backwards — the override is dropped and the bar snaps back to where the
 * database says it is. The UI never decides availability (rule 5).
 */

const BAR_TONE = {
  pending: 'bg-warning-soft text-warning border-warning',
  confirmed: 'bg-success-soft text-success border-success',
  ready: 'bg-success-soft text-success border-success',
  active: 'bg-red-soft text-red-signal border-red-signal',
};

const BLOCK_KINDS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Nettoyage' },
  { value: 'transfer', label: 'Transfert' },
  { value: 'private', label: 'Usage interne' },
  { value: 'other', label: 'Autre' },
];

const DRAG_THRESHOLD = 5; // px — below this it was a click, not a drag

export default function FleetCalendar({ win, data, nowIso, base = '/admin' }) {
  const router = useRouter();

  /* Optimistic overrides, keyed by reservation id. Rendering reads
     `override[id] ?? reservation`, so when the refreshed server data catches
     up the two agree and the override quietly stops mattering — no effect, no
     flash, and a failure is a single delete away from a full revert. */
  const [override, setOverride] = useState({});
  const [drag, setDrag] = useState(null);
  const [selected, setSelected] = useState(null); // {kind:'reservation'|'block', id}
  const [draftBlock, setDraftBlock] = useState(null); // {unitId, startAt, endAt}
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const units = data.units || [];
  const blocks = data.blocks || [];
  const reservations = (data.reservations || []).map((r) => ({ ...r, ...(override[r.id] || {}) }));

  const groups = groupByVehicle(units);
  const nowPct = ((Date.parse(nowIso) - Date.parse(win.from)) / (Date.parse(win.to) - Date.parse(win.from))) * 100;

  /* ------------------------------------------------------------ dragging */

  const onBarDown = (event, reservation, mode) => {
    if (event.button !== 0) return;
    const track = event.currentTarget.closest('[data-track]');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    setMessage(null);
    setDrag({ kind: 'bar', id: reservation.id, mode, x0: event.clientX, width: rect.width, dx: 0 });
  };

  const onTrackDown = (event, unitId) => {
    /* Only the empty track starts a block; a pointerdown that landed on a bar
       stopped propagating above. */
    if (event.button !== 0 || event.target !== event.currentTarget || !unitId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMessage(null);
    setDrag({ kind: 'new', unitId, left: rect.left, width: rect.width, a: event.clientX - rect.left, b: event.clientX - rect.left });
  };

  const onMove = (event) => {
    if (!drag) return;
    setDrag((d) => {
      if (!d) return d;
      return d.kind === 'bar' ? { ...d, dx: event.clientX - d.x0 } : { ...d, b: event.clientX - d.left };
    });
  };

  const onUp = async (event) => {
    const d = drag;
    setDrag(null);
    if (!d) return;

    if (d.kind === 'new') {
      const a = Math.min(d.a, d.b);
      const b = Math.max(d.a, d.b);
      if (b - a < DRAG_THRESHOLD) return;
      setDraftBlock({
        unitId: d.unitId,
        startAt: snapToSlot(win.from, win.to, a / d.width, win.slotMs),
        endAt: snapToSlot(win.from, win.to, b / d.width, win.slotMs),
      });
      return;
    }

    const reservation = reservations.find((r) => r.id === d.id);
    if (!reservation) return;

    if (Math.abs(event.clientX - d.x0) < DRAG_THRESHOLD) {
      setSelected({ kind: 'reservation', id: d.id });
      return;
    }

    const slots = slotsFromDx(event.clientX - d.x0, d.width, win.from, win.to, win.slotMs);
    if (!slots) return;

    const startAt = d.mode === 'end' ? reservation.startAt : shiftIso(reservation.startAt, slots, win.slotMs);
    const endAt = d.mode === 'start' ? reservation.endAt : shiftIso(reservation.endAt, slots, win.slotMs);
    if (Date.parse(endAt) <= Date.parse(startAt)) {
      setMessage('Le retour doit rester après le départ.');
      return;
    }

    setOverride((cur) => ({ ...cur, [reservation.id]: { startAt, endAt } }));
    setBusy(true);
    const result = await moveDates({ id: reservation.id, startAt, endAt, reason: 'déplacement au calendrier' });
    setBusy(false);

    if (result?.ok) {
      setMessage(`${reservation.reference} déplacée.`);
      router.refresh();
      return;
    }
    /* Refused: drop the override and the bar is back where Postgres has it. */
    setOverride((cur) => {
      const next = { ...cur };
      delete next[reservation.id];
      return next;
    });
    setMessage(describeMove(result, reservation));
  };

  const saveBlock = async (form) => {
    setBusy(true);
    const result = await createBlockAction({ ...draftBlock, ...form });
    setBusy(false);
    if (result?.ok) {
      setDraftBlock(null);
      setMessage('Bloc créé.');
      router.refresh();
      return;
    }
    /* create_block() (0014) names what is in the way; say it as a sentence. */
    const plate = units.find((u) => u.id === draftBlock?.unitId)?.plate;
    setMessage(`⚠ ${blockRefusalMessage(result, { plate })}`);
  };

  /* Giving dates back to the site takes a reason, like cancelling a booking
     (delete_block() in 0014, rule 5). */
  const removeBlock = async (id, reason) => {
    setBusy(true);
    let result;
    try {
      result = await deleteBlockAction({ id, reason });
    } catch {
      result = { ok: false, error: 'SERVER' };
    } finally {
      setBusy(false);
    }
    if (result?.ok) {
      setSelected(null);
      setMessage('Bloc supprimé : ces dates sont de nouveau à la vente.');
      router.refresh();
      return;
    }
    setMessage(`⚠ ${blockRefusalMessage(result)}`);
  };

  /* One unit = one row. Extracted so the same track serves a real unit and
     the "unassigned" bucket at the bottom, which must behave identically
     apart from not accepting a block. */
  const renderRow = (unit) => (
              <div key={unit.id || 'none'} className="grid grid-cols-[11rem_1fr] border-t border-border">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="font-latin-sans text-xs text-text-2">{unit.plate}</span>
                  {unit.status !== 'available' ? <span className="text-[10px] text-text-muted">{unit.status}</span> : null}
                </div>

                <div
                  role="presentation"
                  onPointerDown={(e) => onTrackDown(e, unit.id)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  className="relative h-11 touch-none select-none"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${100 / win.slots.length}%)`,
                  }}
                  data-track=""
                  data-unit={unit.id || 'none'}
                >
                  {/* today / now */}
                  {nowPct >= 0 && nowPct <= 100 ? (
                    <span aria-hidden className="absolute inset-y-0 w-px bg-red-signal" style={{ insetInlineStart: `${nowPct}%` }} />
                  ) : null}

                  {blocks
                    .filter((b) => b.unitId === unit.id)
                    .map((b) => {
                      const pos = placeRange(win.from, win.to, b.startAt, b.endAt);
                      if (!pos) return null;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelected({ kind: 'block', id: b.id })}
                          title={`${b.kind} — ${b.reason || ''}`}
                          data-block={b.id}
                          className="absolute inset-y-1.5 rounded border border-dashed border-border-strong bg-surface-2 px-2 text-start text-[10px] text-text-muted"
                          style={{ insetInlineStart: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
                        >
                          <span className="block truncate">{b.kind}</span>
                        </button>
                      );
                    })}

                  {reservations
                    .filter((r) => r.unitId === unit.id)
                    .map((r) => {
                      const ghost = drag?.kind === 'bar' && drag.id === r.id ? drag : null;
                      const pos = placeRange(win.from, win.to, r.startAt, r.endAt);
                      if (!pos) return null;
                      /* While the pointer is down the bar follows it in
                         pixels; the commit converts that to whole slots. */
                      const style = { insetInlineStart: `${pos.leftPct}%`, width: `${pos.widthPct}%` };
                      if (ghost) {
                        if (ghost.mode === 'move') style.transform = `translateX(${ghost.dx}px)`;
                        if (ghost.mode === 'end') style.width = `max(2%, calc(${pos.widthPct}% + ${ghost.dx}px))`;
                        if (ghost.mode === 'start') {
                          style.transform = `translateX(${ghost.dx}px)`;
                          style.width = `max(2%, calc(${pos.widthPct}% - ${ghost.dx}px))`;
                        }
                      }
                      return (
                        <div
                          key={r.id}
                          data-reservation={r.id}
                          onPointerDown={(e) => onBarDown(e, r, 'move')}
                          onPointerMove={onMove}
                          onPointerUp={onUp}
                          className={`absolute inset-y-1.5 flex cursor-grab items-center rounded border px-2 text-[10px] font-semibold ${BAR_TONE[r.status] || 'border-border bg-surface-2 text-text-2'} ${ghost ? 'z-10 opacity-80' : ''}`}
                          style={style}
                        >
                          <span
                            role="presentation"
                            onPointerDown={(e) => onBarDown(e, r, 'start')}
                            className="absolute inset-y-0 start-0 w-2 cursor-ew-resize"
                          />
                          <span className="truncate font-latin-sans">{r.reference}</span>
                          <span
                            role="presentation"
                            onPointerDown={(e) => onBarDown(e, r, 'end')}
                            className="absolute inset-y-0 end-0 w-2 cursor-ew-resize"
                          />
                        </div>
                      );
                    })}

                  {/* the block being drawn */}
                  {drag?.kind === 'new' && drag.unitId === unit.id ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 rounded border border-dashed border-text-muted bg-surface-2/70"
                      style={{
                        insetInlineStart: `${(Math.min(drag.a, drag.b) / drag.width) * 100}%`,
                        width: `${(Math.abs(drag.b - drag.a) / drag.width) * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
  );
  /* ---------------------------------------------------------------- view */

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <div>
        {message ? (
          <p className="mb-4 rounded-lg border border-border-strong bg-surface-1 p-3 text-sm text-text" role="status" data-testid="calendar-message">
            {message}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-border bg-surface-1" data-testid="fleet-calendar" data-busy={busy ? 'true' : 'false'}>
          <div className="min-w-[56rem]">
            {/* ---- header ---- */}
            <div className="grid grid-cols-[11rem_1fr] border-b border-border">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">Unité</div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${win.slots.length}, minmax(0, 1fr))` }}>
                {win.slots.map((s) => (
                  <div key={s.at} className="border-s border-border px-1 py-2 text-center">
                    <div className="tnum text-xs font-semibold text-text-2">{s.label}</div>
                    {s.sub ? <div className="text-[10px] text-text-muted">{s.sub}</div> : null}
                  </div>
                ))}
              </div>
            </div>

            {/* ---- rows ---- */}
            {groups.length === 0 ? (
              <p className="p-6 text-sm text-text-muted">Aucune unité dans la flotte.</p>
            ) : (
              groups.map((group) => (
                <div key={group.vehicleId}>
                  <div className="grid grid-cols-[11rem_1fr] bg-surface-2">
                    <div className="px-3 py-1.5 text-xs font-semibold text-text">{group.vehicle}</div>
                    <div />
                  </div>
                  {group.units.map(renderRow)}
                </div>
              ))
            )}
            {reservations.some((r) => !r.unitId) ? (
              <div>
                <div className="grid grid-cols-[11rem_1fr] bg-surface-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-text">Non assignées</div>
                  <div />
                </div>
                {renderRow({ id: null, plate: '— aucune unité', status: 'available' })}
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          Glissez une barre pour déplacer, ses bords pour allonger. Glissez sur une ligne vide pour créer un bloc. Chaque
          déplacement est vérifié par la base : un conflit annule le geste.
        </p>
      </div>

      {/* ---- side panel ---- */}
      <aside className="xl:sticky xl:top-6 xl:self-start" data-testid="calendar-panel">
        {draftBlock ? (
          <BlockDraft draft={draftBlock} onCancel={() => setDraftBlock(null)} onSave={saveBlock} busy={busy} />
        ) : selected ? (
          <Details
            selected={selected}
            reservations={reservations}
            blocks={blocks}
            units={units}
            base={base}
            onClose={() => setSelected(null)}
            onDeleteBlock={removeBlock}
            busy={busy}
          />
        ) : (
          <div className="rounded-lg border border-border bg-surface-1 p-5 text-sm text-text-muted">
            Cliquez une barre pour voir le détail.
          </div>
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

function Details({ selected, reservations, blocks, units, base, onClose, onDeleteBlock, busy }) {
  const unitName = (id) => units.find((u) => u.id === id)?.plate || '—';

  if (selected.kind === 'reservation') {
    const r = reservations.find((x) => x.id === selected.id);
    if (!r) return null;
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-5">
        <Head onClose={onClose}>{r.reference}</Head>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Statut" value={STATUS_LABEL[r.status] || r.status} />
          <Row label="Unité" value={<span className="font-latin-sans">{unitName(r.unitId)}</span>} />
          <Row label="Départ" value={<span className="tnum">{formatDateTime(r.startAt, 'fr')}</span>} />
          <Row label="Retour" value={<span className="tnum">{formatDateTime(r.endAt, 'fr')}</span>} />
        </dl>
        <Link href={`${base}/reservations/${r.id}`} className="mt-5 inline-block rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text">
          Ouvrir la réservation
        </Link>
      </div>
    );
  }

  const b = blocks.find((x) => x.id === selected.id);
  if (!b) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-5">
      <Head onClose={onClose}>Bloc</Head>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Type" value={BLOCK_KINDS.find((k) => k.value === b.kind)?.label || b.kind} />
        <Row label="Unité" value={<span className="font-latin-sans">{unitName(b.unitId)}</span>} />
        <Row label="Du" value={<span className="tnum">{formatDateTime(b.startAt, 'fr')}</span>} />
        <Row label="Au" value={<span className="tnum">{formatDateTime(b.endAt, 'fr')}</span>} />
        <Row label="Motif" value={b.reason || '—'} />
      </dl>
      <DeleteBlockForm key={b.id} busy={busy} onDelete={(reason) => onDeleteBlock(b.id, reason)} />
    </div>
  );
}

/** A reason, then the delete: the dates go back on sale and the journal says why. */
function DeleteBlockForm({ busy, onDelete }) {
  const [reason, setReason] = useState('');
  return (
    <form
      className="mt-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim()) onDelete(reason.trim());
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-text-muted">Pourquoi remettre ces dates en vente ?</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={200}
          data-testid="calendar-delete-block-reason"
          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !reason.trim()}
        className="mt-3 rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-text disabled:opacity-50"
      >
        Supprimer le bloc
      </button>
    </form>
  );
}

function BlockDraft({ draft, onCancel, onSave, busy }) {
  const [kind, setKind] = useState('maintenance');
  const [reason, setReason] = useState('');

  return (
    <form
      className="rounded-lg border border-border bg-surface-1 p-5"
      data-testid="block-draft"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ kind, reason: reason.trim() });
      }}
    >
      <Head onClose={onCancel}>Nouveau bloc</Head>
      <p className="mt-3 text-sm text-text-2">
        <span className="tnum">{formatDateTime(draft.startAt, 'fr')}</span> → <span className="tnum">{formatDateTime(draft.endAt, 'fr')}</span>
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-xs text-text-muted">Type</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text">
          {BLOCK_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-text-muted">Motif (obligatoire)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          placeholder="Vidange, pare-brise…"
          className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text"
        />
      </label>
      <button type="submit" disabled={busy} className="mt-4 w-full rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        Créer le bloc
      </button>
    </form>
  );
}

function Head({ children, onClose }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-latin-sans text-base font-semibold text-text">{children}</h2>
      <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text" aria-label="Fermer">
        ✕
      </button>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-end text-text-2">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ utils */

function groupByVehicle(units) {
  const map = new Map();
  for (const u of units) {
    const key = u.vehicleId || u.vehicle || 'x';
    if (!map.has(key)) map.set(key, { vehicleId: key, vehicle: u.vehicle || '—', units: [] });
    map.get(key).units.push(u);
  }
  return [...map.values()];
}

function describeMove(result, reservation) {
  if (!result) return 'Aucune réponse du serveur — rien n’a été déplacé.';
  switch (result.error) {
    case 'CONFLICT':
      return result.reference
        ? `⚠ CONFLIT — ${result.reference} occupe déjà cette voiture du ${formatDateTime(result.from, 'fr')} au ${formatDateTime(result.to, 'fr')}. ${reservation.reference} est revenue à sa place.`
        : `⚠ CONFLIT — cette voiture est déjà prise sur cette période. ${reservation.reference} est revenue à sa place.`;
    case 'BLOCKED':
      return '⚠ Cette unité est bloquée (maintenance ou nettoyage) sur cette période.';
    case 'BAD_DATES':
      return 'Le retour doit être après le départ.';
    case 'FORBIDDEN':
      return 'Votre rôle ne permet pas cette action.';
    case 'NOT_FOUND':
      return 'Réservation introuvable.';
    default:
      return `Déplacement refusé : ${result.error || 'inconnu'}.`;
  }
}
