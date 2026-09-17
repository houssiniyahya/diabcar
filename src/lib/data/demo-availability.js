/**
 * The availability engine, in memory.
 *
 * This is a line-by-line mirror of supabase/migrations/0008_availability.sql.
 * It exists so `npm run dev` runs the real funnel with no Supabase (CLAUDE.md
 * rule 12) — but the reason it is written this carefully is that a demo which
 * disagrees with Postgres is worse than no demo: it teaches you the wrong
 * behaviour and hides the bug until production.
 *
 * Any change here must be made in 0008 too, and vice versa. The rules encoded
 * in both places:
 *
 *   - the requested window is widened by the vehicle's prep buffer on BOTH
 *     ends, because `reservations.period` is a generated column that is
 *     already widened, and the exclusion constraint compares two widened
 *     ranges. Comparing a raw request against a widened period would report a
 *     car free that the database then refuses to book.
 *   - a unit counts as bookable unless it is in maintenance, blocked or out of
 *     service. `status` is a statement about now, not about the window.
 *   - `pending` reservations occupy a car. Diab Car takes no payment online
 *     (plan 9.5), so a pending request is a real customer waiting on a
 *     WhatsApp confirmation.
 *   - reservations with no unit assigned are subtracted at the MODEL level.
 */

const DEFAULT_BUFFER_MIN = 120;
const OCCUPYING = ['pending', 'confirmed', 'ready', 'active'];
const UNBOOKABLE_UNIT = ['maintenance', 'blocked', 'out_of_service'];

const ms = (v) => new Date(v).getTime();

/** @returns {[number, number]} the requested window widened by the prep buffer. */
export function bookingWindow(vehicle, startAt, endAt) {
  const buffer = (Number(vehicle?.prepBufferMinutes) || DEFAULT_BUFFER_MIN) * 60 * 1000;
  return [ms(startAt) - buffer, ms(endAt) + buffer];
}

/** Half-open overlap, matching Postgres `&&` on a '[)' range. */
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/** The period a stored row occupies, widened the same way Postgres widens it. */
function rowWindow(row, vehicle) {
  const buffer = (Number(row?.prepBufferMinutes ?? vehicle?.prepBufferMinutes) || DEFAULT_BUFFER_MIN) * 60 * 1000;
  return [ms(row.startAt) - buffer, ms(row.endAt) + buffer];
}

/**
 * How many physical cars of this model are free for this window.
 * @returns {number}
 */
export function freeUnits(store, vehicleId, startAt, endAt) {
  const vehicle = store.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return 0;

  const [ws, we] = bookingWindow(vehicle, startAt, endAt);

  const units = store.units.filter((u) => u.vehicleId === vehicleId && !UNBOOKABLE_UNIT.includes(u.status));
  if (units.length === 0) return 0;

  const live = store.reservations.filter(
    (r) => r.vehicleId === vehicleId && OCCUPYING.includes(r.status) && overlaps(ws, we, ...rowWindow(r, vehicle)),
  );

  const takenUnits = new Set(live.filter((r) => r.unitId).map((r) => r.unitId));
  const unassigned = live.filter((r) => !r.unitId).length;

  /* A unit both blocked and reserved must not be subtracted twice — the same
     `not exists` guard the SQL uses. */
  /* Blocks are stored as given in Postgres (never widened), and only a
     bookable unit's block is subtracted: `units` above never counted the
     others (0014). */
  const blocked = new Set(
    store.blocks
      .filter((b) => {
        const u = store.units.find((x) => x.id === b.unitId);
        if (!u || u.vehicleId !== vehicleId) return false;
        if (UNBOOKABLE_UNIT.includes(u.status)) return false;
        if (takenUnits.has(b.unitId)) return false;
        return overlaps(ws, we, ms(b.startAt), ms(b.endAt));
      })
      .map((b) => b.unitId),
  );

  const now = Date.now();
  const held = store.holds.filter(
    (h) => h.vehicleId === vehicleId && !h.releasedAt && ms(h.expiresAt) > now && overlaps(ws, we, ...rowWindow(h, vehicle)),
  ).length;

  return Math.max(units.length - takenUnits.size - blocked.size - unassigned - held, 0);
}

/**
 * First moment a window of `minDays` fits, within 90 days. Null past that —
 * the honest answer then is "call us", not an invented date.
 * @returns {string|null} ISO timestamp
 */
export function nextAvailable(store, vehicleId, from = new Date().toISOString()) {
  const vehicle = store.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  const span = (Number(vehicle.minDays) || 1) * 24 * 60 * 60 * 1000;
  const start = ms(from);
  const horizon = start + 90 * 24 * 60 * 60 * 1000;

  if (freeUnits(store, vehicleId, new Date(start).toISOString(), new Date(start + span).toISOString()) > 0) {
    return new Date(start).toISOString();
  }

  /* Probe at the stored window's end PLUS one more buffer.
     rowWindow() already pushed the end out by the buffer, but freeUnits()
     widens the REQUEST backwards by the buffer too, so a request starting
     exactly at the stored end still overlaps it. Adding the buffer once more
     puts the request's widened start flush against the stored end, where the
     half-open ranges stop touching. Without this the function walks every
     candidate, finds all of them still occupied, and returns null — the page
     would print nothing instead of "disponible à partir du…". */
  const buffer = (Number(vehicle.prepBufferMinutes) || DEFAULT_BUFFER_MIN) * 60 * 1000;
  const ends = new Set();
  for (const r of store.reservations) {
    if (r.vehicleId === vehicleId && OCCUPYING.includes(r.status)) ends.add(rowWindow(r, vehicle)[1] + buffer);
  }
  for (const b of store.blocks) {
    const u = store.units.find((x) => x.id === b.unitId);
    /* A block's period is stored as given (0008 probes upper(b.period) + buffer). */
    if (u?.vehicleId === vehicleId) ends.add(ms(b.endAt) + buffer);
  }

  for (const end of [...ends].sort((a, b) => a - b)) {
    if (end <= start || end > horizon) continue;
    if (freeUnits(store, vehicleId, new Date(end).toISOString(), new Date(end + span).toISOString()) > 0) {
      return new Date(end).toISOString();
    }
  }
  return null;
}

/** Up to `limit` free models in the same category, cheapest first. */
export function alternatives(store, vehicleId, startAt, endAt, limit = 3) {
  const vehicle = store.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return [];
  return store.vehicles
    .filter((v) => v.id !== vehicleId && v.published !== false && v.category === vehicle.category)
    .filter((v) => freeUnits(store, v.id, startAt, endAt) > 0)
    .sort((a, b) => a.pricePerDay - b.pricePerDay)
    .slice(0, limit)
    .map((v) => ({
      vehicleId: v.id, slug: v.slug, brand: v.brand, model: v.model, category: v.category,
      basePerDay: v.pricePerDay, seats: v.seats, transmission: v.transmission, photoFolder: v.photoFolder,
    }));
}

/** The sold-out payload, identical in shape to the SQL function's. */
export function soldOut(store, vehicleId, startAt, endAt) {
  return {
    ok: false,
    error: 'SOLD_OUT',
    nextAvailableAt: nextAvailable(store, vehicleId, startAt),
    alternatives: alternatives(store, vehicleId, startAt, endAt, 3),
  };
}

/** One row of search_availability, shaped exactly like the RPC's return. */
export function availabilityRow(store, vehicle, startAt, endAt) {
  const unitsTotal = store.units.filter((u) => u.vehicleId === vehicle.id && !UNBOOKABLE_UNIT.includes(u.status)).length;
  const unitsFree = freeUnits(store, vehicle.id, startAt, endAt);
  return {
    vehicleId: vehicle.id,
    slug: vehicle.slug,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    category: vehicle.category,
    transmission: vehicle.transmission,
    fuel: vehicle.fuel,
    seats: vehicle.seats,
    doors: vehicle.doors,
    luggage: vehicle.luggage,
    ac: vehicle.ac,
    features: vehicle.features || [],
    photoFolder: vehicle.photoFolder || vehicle.slug,
    images: vehicle.images || [],
    purposeTags: vehicle.purposeTags || [],
    minDays: vehicle.minDays || 1,
    basePerDay: vehicle.pricePerDay,
    priceHighSeason: vehicle.priceHighSeason ?? null,
    deposit: vehicle.deposit ?? 0,
    mileageLimit: vehicle.mileageLimit ?? null,
    unitsTotal,
    unitsFree,
    nextAvailableAt: unitsFree === 0 ? nextAvailable(store, vehicle.id, startAt) : null,
  };
}
