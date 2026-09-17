import { dayOf, dayStart, placeRange } from '@/lib/calendar';
import { BLOCK_KIND_LABEL, RESERVATION_SOURCE_LABEL } from '@/lib/fleet-labels';
import { OCCUPYING_STATUSES, STATUS_LABEL } from '@/lib/reservation-states';

/**
 * The availability timeline of ONE model (owner request, 2026-09-16; plan 7.1).
 *
 * Pure arithmetic, no DOM, no data access, so every rule here has a unit test
 * and the server page and the client component compute the same window.
 *
 * What the owner asked for, in the terms the database already has:
 *   - "set the car unavailable from A to B" (a booking taken by phone, on
 *     WhatsApp or at the counter, a repair, the owner's own use) is a BLOCK on
 *     each physical unit — `blocks` rows, written by create_block() (0014),
 *     which free_units() subtracts, so the public site stops offering those
 *     days the moment the row exists;
 *   - "a website booking makes it unavailable until I cancel" is already how
 *     reservations work: every non-cancelled reservation occupies its dates
 *     (OCCUPYING_STATUSES), whatever its source. This module only DRAWS that.
 *
 * Time zone: Casablanca, fixed +01:00, the same convention as src/lib/calendar.js.
 * Day and month LABELS are formatted from the yyyy-mm-dd string in UTC, never
 * through the IANA zone: during Ramadan tzdata moves Africa/Casablanca to +00,
 * and a +01:00 midnight formatted there lands on the previous day.
 */

const DAY_MS = 24 * 3600 * 1000;

/** Six weeks: long enough to see next month's bookings, short enough to read at a glance. */
export const DEFAULT_DAYS = 42;

/** Longest period one "unavailable from–to" may cover, in days (create_block() refuses more). */
export const MAX_BLOCK_DAYS = 366;

/** The prep buffer the database falls back to (booking_window() in 0008). */
export const DEFAULT_BUFFER_MINUTES = 120;

/** The kinds a member of staff may pick, in the order the form lists them.
    The first is the owner's own case: a booking that did not come from the
    website. It is stored as `other` — the database enum has no such kind —
    and recognised again by its reason prefix. */
export const UNAVAILABLE_KINDS = [
  { value: 'offsite', label: 'Réservation hors site (téléphone, WhatsApp, comptoir)', kind: 'other' },
  { value: 'maintenance', label: 'Maintenance / réparation', kind: 'maintenance' },
  { value: 'cleaning', label: 'Nettoyage', kind: 'cleaning' },
  { value: 'transfer', label: 'Transfert', kind: 'transfer' },
  { value: 'private', label: 'Usage interne', kind: 'private' },
  { value: 'other', label: 'Autre', kind: 'other' },
];

export const OFFSITE_PREFIX = 'Réservation hors site';

/** Unit statuses that are already off the website (unit_is_bookable() in 0008). */
export const UNBOOKABLE_UNIT_STATUSES = ['maintenance', 'blocked', 'out_of_service'];

const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-mm-dd → the same calendar day at noon UTC, for labels only. */
const labelDate = (day) => new Date(`${day}T12:00:00Z`);

function monthName(day) {
  return new Intl.DateTimeFormat('fr-MA-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(labelDate(day));
}

/** "20 oct. 2026" for a yyyy-mm-dd Casablanca day. */
export function dayLabel(day) {
  if (!DAY_RE.test(day || '')) return '';
  return new Intl.DateTimeFormat('fr-MA-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(labelDate(day));
}

/** yyyy-mm-dd plus n calendar days. */
export function addDays(day, n) {
  return dayOf(dayStart(day).getTime() + n * DAY_MS);
}

/**
 * The window the timeline draws: `days` whole Casablanca days starting today
 * (or at `anchor`, yyyy-mm-dd), one slot per day.
 *
 * @param {{ nowIso: string, days?: number, anchor?: string }} input
 * @returns {{ from: string, to: string, days: number, today: string, slotMs: number,
 *   slots: { day: string, at: string, label: string, weekday: string, monthLabel: string|null, weekend: boolean, today: boolean }[] }}
 */
export function timelineWindow({ nowIso, days = DEFAULT_DAYS, anchor } = {}) {
  const count = Math.max(1, Math.min(120, Math.round(Number(days) || DEFAULT_DAYS)));
  const today = dayOf(nowIso || Date.now());
  const first = DAY_RE.test(anchor || '') ? anchor : today;
  const start = dayStart(first);
  const slots = [];
  for (let i = 0; i < count; i += 1) {
    const at = new Date(start.getTime() + i * DAY_MS);
    const day = dayOf(at);
    const wd = labelDate(day).getUTCDay();
    slots.push({
      day,
      at: at.toISOString(),
      label: day.slice(8),
      weekday: WEEKDAY[wd],
      monthLabel: i === 0 || day.endsWith('-01') ? monthName(day) : null,
      weekend: wd === 0 || wd === 6,
      today: day === today,
    });
  }
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + count * DAY_MS).toISOString(),
    days: count,
    today,
    slotMs: DAY_MS,
    slots,
  };
}

/** Is this reservation still holding its dates? Cancelled, no-show, returned and closed do not. */
export function occupies(reservation) {
  return OCCUPYING_STATUSES.includes(reservation?.status);
}

/**
 * Everything drawn on one unit's row, placed in the window as percentages.
 * Reservations that no longer occupy their dates are left out: a cancelled
 * booking is exactly the thing the owner wants to see gone.
 *
 * @param {{ unitId: string|null, reservations: object[], blocks: object[], win: { from: string, to: string } }} input
 * @returns {object[]} sorted by start; each carries kind 'reservation' | 'block'
 */
export function segmentsForUnit({ unitId, reservations = [], blocks = [], win }) {
  const out = [];
  for (const r of reservations) {
    if ((r.unitId || null) !== unitId || !occupies(r)) continue;
    const pos = placeRange(win.from, win.to, r.startAt, r.endAt);
    if (!pos) continue;
    out.push({
      kind: 'reservation',
      id: r.id,
      status: r.status,
      source: r.source || 'web',
      reference: r.reference || '',
      startAt: r.startAt,
      endAt: r.endAt,
      customer: r.customer || r.customerName || '',
      ...pos,
    });
  }
  for (const b of blocks) {
    if (unitId === null || b.unitId !== unitId) continue;
    const pos = placeRange(win.from, win.to, b.startAt, b.endAt || win.to);
    if (!pos) continue;
    out.push({ kind: 'block', id: b.id, blockKind: b.kind || 'other', offsite: isOffsite(b), reason: b.reason || '', startAt: b.startAt, endAt: b.endAt || null, ...pos });
  }
  return out.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

/**
 * Give every segment a lane so overlapping bars are drawn one under the other
 * instead of on top of each other. Two website requests for the same weekend
 * are two cars; drawn in one lane, the owner would see one.
 *
 * Greedy interval partitioning on the sorted segments: each takes the first
 * lane whose last bar has ended.
 *
 * @template T
 * @param {T[]} segments sorted by start
 * @returns {{ segments: (T & { lane: number })[], lanes: number }}
 */
export function withLanes(segments = []) {
  const ends = [];
  const placed = segments.map((s) => {
    const start = Date.parse(s.startAt);
    const end = s.endAt ? Date.parse(s.endAt) : Number.POSITIVE_INFINITY;
    let lane = ends.findIndex((e) => e <= start);
    if (lane < 0) {
      lane = ends.length;
      ends.push(end);
    } else {
      ends[lane] = end;
    }
    return { ...s, lane };
  });
  return { segments: placed, lanes: Math.max(1, ends.length) };
}

/** A block created from the "réservation hors site" choice. */
export function isOffsite(block) {
  return typeof block?.reason === 'string' && block.reason.startsWith(OFFSITE_PREFIX);
}

/** The label of a block as the timeline prints it. */
export function blockLabel(block, kindLabels = BLOCK_KIND_LABEL) {
  if (isOffsite(block)) return OFFSITE_PREFIX;
  return kindLabels?.[block?.blockKind || block?.kind] || block?.blockKind || block?.kind || 'Bloc';
}

/**
 * The calendar days a stored period covers, inclusive, the way the owner typed
 * them: [20 02:00, 22 22:00) and [20 00:00, 23 00:00) both read « du 20 au 22 ».
 *
 * @param {string} startAt
 * @param {string|null} endAt null = open-ended
 * @returns {{ from: string, to: string|null }}
 */
export function inclusiveDays(startAt, endAt) {
  return {
    from: dayOf(startAt),
    to: endAt ? dayOf(Date.parse(endAt) - 1) : null,
  };
}

/** « du 20 oct. 2026 au 22 oct. 2026 » for a stored period. */
export function periodLabel(startAt, endAt) {
  const { from, to } = inclusiveDays(startAt, endAt);
  if (!to) return `à partir du ${dayLabel(from)}`;
  if (to === from) return `le ${dayLabel(from)}`;
  return `du ${dayLabel(from)} au ${dayLabel(to)}`;
}

/**
 * The problem with an "unavailable from–to" draft, as a sentence for the
 * operator, or null when it can be sent. Dates are inclusive calendar days.
 *
 * @param {{ from: string, to: string, unitIds: string[], reason: string, today: string }} draft
 * @returns {string|null}
 */
export function unavailableDraftProblem({ from, to, unitIds, reason, today }) {
  if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '')) return 'Indiquez la date de début et la date de fin.';
  if (to < from) return 'La date de fin doit être après la date de début.';
  if (today && to < today) return 'Cette période est déjà passée.';
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS >= MAX_BLOCK_DAYS) return `Une indisponibilité ne peut pas dépasser ${MAX_BLOCK_DAYS} jours d’un coup.`;
  if (!Array.isArray(unitIds) || unitIds.length === 0) return 'Choisissez au moins une unité.';
  if (!reason || !String(reason).trim()) return 'Indiquez un motif : il apparaît dans le journal.';
  return null;
}

/**
 * The block rows to create for the draft: one per unit, covering exactly the
 * inclusive days [from, to] as the WEBSITE shows them.
 *
 * The public calendar asks free_units() about each day widened by the car's
 * prep buffer on both sides (booking_window() in 0008), while a block is
 * stored as given. A block from 00:00 on `from` to 00:00 after `to` would
 * therefore also grey the day before and the day after. Pulling each end in
 * by the buffer — [from 00:00 + buffer, to+1 00:00 − buffer) — greys exactly
 * the days the owner typed, and a customer returning a car the evening before
 * or collecting it the morning after is still accepted.
 *
 * Every row carries the same reason, prefixed for the owner's off-site
 * bookings so they can be told apart from a repair later.
 *
 * @param {{ unitIds: string[], from: string, to: string, choice: string, reason: string, bufferMinutes?: number }} draft
 * @returns {{ unitId: string, startAt: string, endAt: string, kind: string, reason: string }[]}
 */
export function unavailableRequests({ unitIds, from, to, choice, reason, bufferMinutes = DEFAULT_BUFFER_MINUTES }) {
  const option = UNAVAILABLE_KINDS.find((k) => k.value === choice) || UNAVAILABLE_KINDS[UNAVAILABLE_KINDS.length - 1];
  const note = String(reason || '').trim();
  const text = option.value === 'offsite' ? `${OFFSITE_PREFIX} — ${note}` : note;
  /* Clamped to six hours: a one-day period must keep a real length. */
  const minutes = Number(bufferMinutes);
  const buffer = Math.max(0, Math.min(360, Number.isFinite(minutes) ? minutes : DEFAULT_BUFFER_MINUTES)) * 60000;
  const startAt = new Date(dayStart(from).getTime() + buffer).toISOString();
  const endAt = new Date(dayStart(to).getTime() + DAY_MS - buffer).toISOString();
  return unitIds.map((unitId) => ({ unitId, startAt, endAt, kind: option.kind, reason: text.slice(0, 200) }));
}

/**
 * The dates to prefill a real reservation with, from the same draft: pickup on
 * the first day, return on the day AFTER the last inclusive day, so the rental
 * covers every day the owner typed. Null while the draft has no valid dates.
 *
 * @param {{ from: string, to: string }} draft
 * @returns {{ from: string, to: string }|null}
 */
export function bookingLinkDates({ from, to }) {
  if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '') || to < from) return null;
  return { from, to: addDays(to, 1) };
}

/**
 * Website bookings (and agency bookings) still waiting for a plate. They have
 * no unit yet, so no plate row can carry them — but free_units() still counts
 * them against the model, so the owner must see them.
 */
export function unassignedSegments({ reservations = [], win }) {
  return segmentsForUnit({ unitId: null, reservations, blocks: [], win });
}

/** Shown while the database lacks migration 0014 (the adapter fell back to a plain insert). */
export const LEGACY_NOTE =
  'Attention : la base de données n’a pas encore la mise à jour 0014. La période est enregistrée, mais la protection contre la double réservation (demandes web sans plaque) n’est pas encore active.';

const sourceText = (source) => RESERVATION_SOURCE_LABEL[source] || source || 'site web';
const statusText = (status) => (STATUS_LABEL[status] || status || '').toLowerCase();

/**
 * One refusal from create_block()/delete_block(), as a sentence the operator
 * can act on. `plate` names the car when there is one.
 *
 * @param {{ error?: string, reference?: string, status?: string, source?: string, kind?: string, from?: string, to?: string }} result
 * @param {{ plate?: string }} [context]
 * @returns {string}
 */
export function blockRefusalMessage(result, { plate } = {}) {
  const who = plate ? `${plate} : ` : '';
  switch (result?.error) {
    case 'CONFLICT':
      return result.reference
        ? `${who}la réservation ${result.reference} (${statusText(result.status) || 'active'}) occupe déjà cette voiture ${periodLabel(result.from, result.to)}.`
        : `${who}une réservation occupe déjà cette voiture sur ces dates.`;
    case 'CAPACITY':
      return `${who}refusé — toutes les voitures de ce modèle sont déjà promises sur ces dates. La réservation ${result.reference || ''} (${sourceText(result.source)}, ${statusText(result.status)}) ${periodLabel(result.from, result.to)} attend encore une plaque : attribuez-lui une voiture ou annulez-la d’abord.`;
    case 'BLOCK_OVERLAP':
      return `${who}déjà indisponible sur une partie de ces dates (${BLOCK_KIND_LABEL[result.kind] || 'période'} ${periodLabel(result.from, result.to)}). Supprimez ou ajustez cette période d’abord.`;
    case 'PAST':
      return 'Cette période est déjà passée.';
    case 'TOO_LONG':
      return `Une indisponibilité ne peut pas dépasser ${MAX_BLOCK_DAYS} jours d’un coup.`;
    case 'BAD_DATES':
      return 'La date de fin doit être après la date de début.';
    case 'REASON_REQUIRED':
      return 'Indiquez un motif : il apparaît dans le journal.';
    case 'FORBIDDEN':
      return 'Seuls le propriétaire et le gérant peuvent modifier la disponibilité.';
    case 'NOT_FOUND':
      return 'Cet élément n’existe plus. Rechargez la page.';
    case 'VALIDATION':
      return 'Données invalides : vérifiez les dates et le motif.';
    default:
      return 'Le serveur n’a pas pu enregistrer. Réessayez ; si cela persiste, rechargez la page (session expirée ?).';
  }
}

/**
 * The report after « Rendre indisponible » ran over one or several plates.
 *
 * @param {{ outcomes: { plate: string, ok: boolean, result?: object }[], from: string, to: string, bookableCount: number }} input
 *   bookableCount = how many cars of the model the website can sell today
 * @returns {{ tone: 'success'|'warning'|'danger', lines: string[] }}
 */
export function unavailableSummary({ outcomes = [], from, to, bookableCount = 0 }) {
  const created = outcomes.filter((o) => o.ok);
  const refused = outcomes.filter((o) => !o.ok);
  const lines = [];
  const period = from === to ? `le ${dayLabel(from)}` : `du ${dayLabel(from)} au ${dayLabel(to)}`;

  if (created.length > 0) {
    /* A car already off the site (garage, out of service) changes no count. */
    const fewer = created.filter((o) => o.bookable !== false).length;
    lines.push(`Indisponible ${period} (inclus) : ${created.map((o) => o.plate).join(', ')}.`);
    lines.push(
      fewer === 0
        ? 'Le site ne change pas : ces voitures n’y étaient déjà pas proposées.'
        : fewer >= bookableCount && bookableCount > 0
          ? 'Le site ne propose plus ce modèle sur ces dates.'
          : `Le site propose ${fewer} voiture${fewer > 1 ? 's' : ''} de moins sur ces dates.`,
    );
  }
  for (const o of refused) lines.push(blockRefusalMessage(o.result, { plate: o.plate }));

  if (outcomes.some((o) => o.result?.legacy)) lines.push(LEGACY_NOTE);

  const tone = refused.length === 0 ? 'success' : created.length > 0 ? 'warning' : 'danger';
  /* « Cette période est déjà passée » once, not once per plate. */
  return { tone, lines: [...new Set(lines)] };
}
