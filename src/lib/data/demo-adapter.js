import { getStore, newId } from './demo-store';
import { availabilityRow, freeUnits, nextAvailable, soldOut } from './demo-availability';
import { summarise } from './summarise';
import { NEEDS_REASON, NEXT_STATES, OCCUPYING_STATUSES as OCCUPYING_ST } from '../reservation-states';

const clone = (v) => JSON.parse(JSON.stringify(v));

/** One DAMAGE_REPORTED event per entry, mirroring log_damages() in 0012. */
function logDemoDamages(store, reservation, damages) {
  if (!Array.isArray(damages)) return 0;
  for (const d of damages) {
    store.events.push({
      id: newId('e'), unitId: reservation.unitId, reservationId: reservation.id,
      type: 'DAMAGE_REPORTED', at: new Date().toISOString(),
      condition: { zone: d.zone, type: d.type, severity: d.severity },
      notes: d.notes || null, photos: d.photos || [], data: d,
    });
  }
  return damages.length;
}

const rangesOverlap = (a, b) => new Date(a.startAt) < new Date(b.endAt) && new Date(b.startAt) < new Date(a.endAt);
const now = () => new Date().toISOString();

/* unit_is_bookable() in 0008. */
const UNBOOKABLE_UNIT = ['maintenance', 'blocked', 'out_of_service'];
const DAY_MS = 86400000;

/** A reservation's period as Postgres stores it: widened by the prep buffer (0002). */
function widenedPeriod(r, vehicle) {
  const buffer = (Number(r.prepBufferMinutes ?? vehicle?.prepBufferMinutes) || 120) * 60000;
  return { startAt: new Date(Date.parse(r.startAt) - buffer).toISOString(), endAt: new Date(Date.parse(r.endAt) + buffer).toISOString() };
}
const byStart = (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt);
/** Blocks are stored as given; live at `at`, half-open like '[)'. */
const liveAt = (b, at = Date.now()) => Date.parse(b.startAt) <= at && at < Date.parse(b.endAt);

/* The last nine digits, matching phone_key() in 0011. */
const phoneKey = (phone) => String(phone || '').replace(/[^0-9]/g, '').slice(-9);
const vehicleName = (store, id) => {
  const v = store.vehicles.find((x) => x.id === id);
  return v ? `${v.brand} ${v.model}` : '—';
};

function applyVehicleFilters(list, { published, category, transmission, seats, fuel, minPrice, maxPrice, featured, sort } = {}) {
  let out = list;
  if (published !== undefined) out = out.filter((v) => v.published === published);
  if (featured !== undefined) out = out.filter((v) => v.featured === featured);
  if (category) out = out.filter((v) => (Array.isArray(category) ? category.includes(v.category) : v.category === category));
  if (transmission) out = out.filter((v) => v.transmission === transmission);
  if (fuel) out = out.filter((v) => v.fuel === fuel);
  if (seats) out = out.filter((v) => v.seats >= Number(seats));
  if (minPrice) out = out.filter((v) => v.pricePerDay >= Number(minPrice));
  if (maxPrice) out = out.filter((v) => v.pricePerDay <= Number(maxPrice));
  switch (sort) {
    case 'price_asc':
      out = [...out].sort((a, b) => a.pricePerDay - b.pricePerDay);
      break;
    case 'price_desc':
      out = [...out].sort((a, b) => b.pricePerDay - a.pricePerDay);
      break;
    case 'newest':
      out = [...out].sort((a, b) => b.year - a.year);
      break;
    default:
      out = [...out].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
  }
  return clone(out);
}

/**
 * Fields the `public_settings` view withholds from anonymous readers
 * (supabase/migrations/0005). Stripped here too, so a page that reads one
 * behaves identically in demo and in production instead of working in `npm run
 * dev` and returning undefined on the live site.
 */
const INTERNAL_SETTINGS = ['indexNowKey'];

export const demoAdapter = {
  mode: 'demo',

  /* Settings */
  async getSettings() {
    const s = clone(getStore().settings);
    for (const k of INTERNAL_SETTINGS) delete s[k];
    /* The same gate the public_settings VIEW applies in Postgres (0012): a
       claim nobody has ticked as verified does not reach a visitor. Mirrored
       here so `npm run dev` cannot show a number production would hide —
       a demo that is more generous than the real thing teaches the wrong
       lesson about rule 11. */
    const verified = s.verifiedClaims || {};
    if (verified.googleRating !== true) s.googleRating = null;
    if (verified.reviewCount !== true) s.googleReviewCount = null;
    if (verified.foundedYear !== true) s.foundedYear = null;
    delete s.verifiedClaims;
    return s;
  },
  /** Full row, mirroring the staff-only read in the Supabase adapter. */
  async getSettingsAdmin() {
    return clone(getStore().settings);
  },
  async updateSettings(patch, reason) {
    /* Same refusal as save_settings() in 0012, thrown the way rpcRow() throws
       it, so a form that forgets the motif fails in dev exactly as it would in
       production instead of quietly saving. */
    if (!String(reason || '').trim()) {
      const err = new Error('REASON_REQUIRED');
      err.code = 'REASON_REQUIRED';
      throw err;
    }
    const s = getStore();
    s.settings = { ...s.settings, ...patch, updatedAt: now() };
    return clone(s.settings);
  },

  /* Vehicles */
  async listVehicles(filters) {
    return applyVehicleFilters(getStore().vehicles, filters);
  },
  async getVehicleBySlug(slug) {
    const v = getStore().vehicles.find((x) => x.slug === slug);
    return v ? clone(v) : null;
  },
  async getVehicleById(id) {
    const v = getStore().vehicles.find((x) => x.id === id);
    return v ? clone(v) : null;
  },
  async upsertVehicle(data) {
    const s = getStore();
    if (data.id) {
      const i = s.vehicles.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.vehicles[i] = { ...s.vehicles[i], ...data, updatedAt: now() };
        return clone(s.vehicles[i]);
      }
    }
    const v = { rating: 0, reviewCount: 0, images: [], features: [], published: false, featured: false, sortOrder: 999, ...data, id: newId('v'), createdAt: now(), updatedAt: now() };
    s.vehicles.push(v);
    return clone(v);
  },
  async deleteVehicle(id) {
    const s = getStore();
    s.vehicles = s.vehicles.filter((x) => x.id !== id);
    return true;
  },

  /* Seasons / extras / locations */
  async listSeasons() {
    return clone(getStore().seasons);
  },
  async upsertSeason(data) {
    const s = getStore();
    if (data.id) {
      const i = s.seasons.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.seasons[i] = { ...s.seasons[i], ...data };
        return clone(s.seasons[i]);
      }
    }
    const row = { active: true, multiplier: 1, ...data, id: newId('s') };
    s.seasons.push(row);
    return clone(row);
  },
  async deleteSeason(id) {
    const s = getStore();
    const before = s.seasons.length;
    s.seasons = s.seasons.filter((x) => x.id !== id);
    const deleted = before - s.seasons.length;
    return { ok: deleted > 0, deleted, error: deleted ? null : 'NOT_FOUND' };
  },
  async listExtras() {
    return clone(getStore().extras);
  },
  async upsertExtra(data) {
    const s = getStore();
    if (data.id) {
      const i = s.extras.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.extras[i] = { ...s.extras[i], ...data };
        return clone(s.extras[i]);
      }
    }
    const row = { active: true, type: 'per_day', ...data, id: newId('x') };
    s.extras.push(row);
    return clone(row);
  },
  async deleteExtra(id) {
    const s = getStore();
    const before = s.extras.length;
    s.extras = s.extras.filter((x) => x.id !== id);
    const deleted = before - s.extras.length;
    return { ok: deleted > 0, deleted, error: deleted ? null : 'NOT_FOUND' };
  },
  async listLocations({ all = false } = {}) {
    const rows = getStore().locations;
    return clone(all ? rows : rows.filter((l) => l.active !== false));
  },
  async upsertLocation(data) {
    const s = getStore();
    const i = data.id ? s.locations.findIndex((x) => x.id === data.id) : -1;
    if (i >= 0) {
      s.locations[i] = { ...s.locations[i], ...data };
      return clone(s.locations[i]);
    }
    const row = { active: true, kind: 'custom', sort: 100, ...data, id: data.id || newId('l') };
    s.locations.push(row);
    return clone(row);
  },
  async deleteLocation(id) {
    const s = getStore();
    s.locations = s.locations.filter((x) => x.id !== id);
    return { ok: true, deleted: 1 };
  },

  /* FAQ */
  async listFaqs({ published } = {}) {
    let list = getStore().faqs;
    if (published !== undefined) list = list.filter((f) => f.published === published);
    return clone([...list].sort((a, b) => a.sortOrder - b.sortOrder));
  },
  async upsertFaq(data) {
    const s = getStore();
    if (data.id) {
      const i = s.faqs.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.faqs[i] = { ...s.faqs[i], ...data };
        return clone(s.faqs[i]);
      }
    }
    const row = { published: true, sortOrder: 999, category: 'general', ...data, id: newId('f') };
    s.faqs.push(row);
    return clone(row);
  },
  async deleteFaq(id) {
    const s = getStore();
    const before = s.faqs.length;
    s.faqs = s.faqs.filter((x) => x.id !== id);
    const deleted = before - s.faqs.length;
    return { ok: deleted > 0, deleted, error: deleted ? null : 'NOT_FOUND' };
  },

  /* Posts */
  async listPosts({ published } = {}) {
    let list = getStore().posts;
    if (published !== undefined) list = list.filter((p) => p.published === published);
    return clone([...list].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)));
  },
  async getPostBySlug(slug) {
    const p = getStore().posts.find((x) => x.slug === slug);
    return p ? clone(p) : null;
  },
  async getPostById(id) {
    const p = getStore().posts.find((x) => x.id === id);
    return p ? clone(p) : null;
  },
  async upsertPost(data) {
    const s = getStore();
    if (data.id) {
      const i = s.posts.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.posts[i] = { ...s.posts[i], ...data, updatedAt: now() };
        return clone(s.posts[i]);
      }
    }
    const row = { published: false, tags: [], cover: 'berline', ...data, id: newId('p'), publishedAt: data.publishedAt || now(), updatedAt: now() };
    s.posts.push(row);
    return clone(row);
  },
  async deletePost(id) {
    const s = getStore();
    const before = s.posts.length;
    s.posts = s.posts.filter((x) => x.id !== id);
    const deleted = before - s.posts.length;
    return { ok: deleted > 0, deleted, error: deleted ? null : 'NOT_FOUND' };
  },

  /* Reviews */
  async listReviews({ published } = {}) {
    let list = getStore().reviews;
    if (published !== undefined) list = list.filter((r) => r.published === published);
    return clone([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  },
  async upsertReview(data) {
    const s = getStore();
    if (data.id) {
      const i = s.reviews.findIndex((x) => x.id === data.id);
      if (i >= 0) {
        s.reviews[i] = { ...s.reviews[i], ...data };
        return clone(s.reviews[i]);
      }
    }
    const row = { published: false, source: 'google', rating: 5, isSample: false, ...data, id: newId('r'), createdAt: now() };
    s.reviews.push(row);
    return clone(row);
  },
  async deleteReview(id) {
    const s = getStore();
    const before = s.reviews.length;
    s.reviews = s.reviews.filter((x) => x.id !== id);
    const deleted = before - s.reviews.length;
    return { ok: deleted > 0, deleted, error: deleted ? null : 'NOT_FOUND' };
  },

  /* Bookings */
  async createBooking(data) {
    const s = getStore();
    const row = { status: 'pending', source: 'web', notes: '', ...data, id: newId('b'), createdAt: now() };
    s.bookings.unshift(row);
    return clone(row);
  },
  async listBookings({ status, limit } = {}) {
    let list = getStore().bookings;
    if (status) list = list.filter((b) => b.status === status);
    list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (limit) list = list.slice(0, limit);
    return clone(list);
  },
  async getBooking(idOrRef) {
    const b = getStore().bookings.find((x) => x.id === idOrRef || x.reference === idOrRef);
    return b ? clone(b) : null;
  },
  async updateBooking(id, patch) {
    const s = getStore();
    const i = s.bookings.findIndex((x) => x.id === id);
    if (i < 0) return null;
    s.bookings[i] = { ...s.bookings[i], ...patch, updatedAt: now() };
    return clone(s.bookings[i]);
  },


  /* ---------------------------------------------------------------- fleet ops
     Parity surface with the Supabase adapter. Availability is NOT decided here:
     these are plain reads and writes. The real allocation logic lives in the
     Postgres RPCs (plan 6.3, prompt 06) — the UI never decides availability
     (CLAUDE.md rule 5). */

  async listUnits({ vehicleId, status } = {}) {
    let rows = getStore().units;
    if (vehicleId) rows = rows.filter((u) => u.vehicleId === vehicleId);
    if (status) rows = rows.filter((u) => u.status === status);
    return clone(rows);
  },
  async getUnit(id) {
    return clone(getStore().units.find((u) => u.id === id) || null);
  },
  async upsertUnit(data) {
    const s = getStore();
    const i = s.units.findIndex((u) => u.id === data.id);
    if (i >= 0) {
      const before = s.units[i];
      s.units[i] = { ...before, ...data };
      if (data.status && data.status !== before.status) {
        s.events.push({
          id: `e-${Date.now()}`, unitId: before.id, type: 'STATUS_CHANGED', at: now(),
          data: { from: before.status, to: data.status }, reason: data.reason || null,
        });
      }
      return clone(s.units[i]);
    }
    const row = { id: data.id || `u-${Date.now()}`, status: 'available', mileageKm: 0, ...data };
    s.units.push(row);
    return clone(row);
  },

  async listCustomers({ ids } = {}) {
    const rows = getStore().customers;
    return clone(Array.isArray(ids) ? rows.filter((c) => ids.includes(c.id)) : rows);
  },
  async upsertCustomer(data) {
    const s = getStore();
    const i = s.customers.findIndex((c) => c.id === data.id || (data.phone && c.phone === data.phone));
    if (i >= 0) {
      s.customers[i] = { ...s.customers[i], ...data };
      return clone(s.customers[i]);
    }
    const row = { id: data.id || `c-${Date.now()}`, createdAt: now(), ...data };
    s.customers.push(row);
    return clone(row);
  },

  async listReservations({ status, statuses, vehicleId, from, to, limit } = {}) {
    let rows = getStore().reservations;
    if (status) rows = rows.filter((r) => r.status === status);
    if (Array.isArray(statuses) && statuses.length) rows = rows.filter((r) => statuses.includes(r.status));
    if (vehicleId) rows = rows.filter((r) => r.vehicleId === vehicleId);
    if (from) rows = rows.filter((r) => Date.parse(r.endAt) > Date.parse(from));
    if (to) rows = rows.filter((r) => Date.parse(r.startAt) < Date.parse(to));
    rows = [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return clone(limit ? rows.slice(0, limit) : rows);
  },
  async getReservation(idOrRef) {
    const s = getStore();
    return clone(s.reservations.find((r) => r.id === idOrRef || r.reference === idOrRef) || null);
  },
  async createReservation(data) {
    const s = getStore();
    const row = {
      id: `r-${Date.now()}`,
      reference: data.reference || `DC-${Date.now().toString(36).toUpperCase()}`,
      status: 'pending', source: 'web', locale: 'fr', quote: {},
      createdAt: now(), updatedAt: now(), ...data,
    };
    s.reservations.push(row);
    return clone(row);
  },
  async updateReservation(id, patch) {
    const s = getStore();
    const i = s.reservations.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const before = s.reservations[i];
    s.reservations[i] = { ...before, ...patch, updatedAt: now() };
    if (patch.status && patch.status !== before.status && before.unitId) {
      const type = patch.status === 'active' ? 'PICKUP' : patch.status === 'returned' ? 'RETURN' : null;
      if (type) {
        s.events.push({
          id: `e-${Date.now()}`, unitId: before.unitId, reservationId: before.id, type, at: now(),
          data: { from: before.status, to: patch.status, reference: before.reference }, reason: patch.reason || null,
        });
      }
    }
    return clone(s.reservations[i]);
  },

  async listBlocks({ unitId, unitIds, from, to } = {}) {
    let rows = getStore().blocks;
    if (unitId) rows = rows.filter((b) => b.unitId === unitId);
    if (Array.isArray(unitIds)) rows = rows.filter((b) => unitIds.includes(b.unitId));
    if (from && to) rows = rows.filter((b) => rangesOverlap(b, { startAt: from, endAt: to }));
    return clone([...rows].sort(byStart));
  },
  /* Mirrors create_block() in 0014, refusal for refusal: the demo must not
     accept a period the database would refuse (rule 12). */
  async createBlock(data) {
    const s = getStore();
    const reason = String(data.reason || '').trim();
    if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
    const start = Date.parse(data.startAt);
    const end = Date.parse(data.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ok: false, error: 'BAD_DATES' };
    if (end <= Date.now()) return { ok: false, error: 'PAST' };
    if (end - start > 366 * DAY_MS) return { ok: false, error: 'TOO_LONG' };

    const unit = s.units.find((u) => u.id === data.unitId);
    if (!unit) return { ok: false, error: 'NOT_FOUND' };
    const vehicle = s.vehicles.find((v) => v.id === unit.vehicleId);
    const range = { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };

    const overlap = s.blocks.filter((b) => b.unitId === unit.id && rangesOverlap(b, range)).sort(byStart)[0];
    if (overlap) return { ok: false, error: 'BLOCK_OVERLAP', kind: overlap.kind, from: overlap.startAt, to: overlap.endAt };

    const live = s.reservations.filter(
      (r) => r.vehicleId === unit.vehicleId && OCCUPYING_ST.includes(r.status) && rangesOverlap(widenedPeriod(r, vehicle), range),
    );
    const onUnit = live.filter((r) => r.unitId === unit.id).sort(byStart)[0];
    if (onUnit) return { ok: false, error: 'CONFLICT', reference: onUnit.reference, status: onUnit.status, from: onUnit.startAt, to: onUnit.endAt };

    if (!UNBOOKABLE_UNIT.includes(unit.status)) {
      const bookable = new Set(s.units.filter((u) => u.vehicleId === unit.vehicleId && !UNBOOKABLE_UNIT.includes(u.status)).map((u) => u.id));
      const taken = new Set(live.filter((r) => r.unitId).map((r) => r.unitId));
      const blocked = new Set(s.blocks.filter((b) => bookable.has(b.unitId) && !taken.has(b.unitId) && rangesOverlap(b, range)).map((b) => b.unitId));
      const waiting = live.filter((r) => !r.unitId).sort(byStart);
      if (waiting.length > 0 && bookable.size - taken.size - blocked.size - 1 < waiting.length) {
        const first = waiting[0];
        return { ok: false, error: 'CAPACITY', reference: first.reference, status: first.status, source: first.source || 'web', from: first.startAt, to: first.endAt, waiting: waiting.length };
      }
    }

    /* Not the millisecond alone: « toutes les unités » creates one block per
       plate back to back, and two rows with the same id would be one row. */
    const row = { id: `b-${Date.now()}-${s.blocks.length + 1}`, createdAt: now(), unitId: unit.id, kind: data.kind || 'maintenance', reason, ...range };
    s.blocks.push(row);
    return { ok: true, block: clone(row) };
  },
  /* delete_block() in 0014: a reason, or nothing happens. */
  async deleteBlock(id, reason) {
    const s = getStore();
    if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    const i = s.blocks.findIndex((b) => b.id === id);
    if (i < 0) return { ok: false, error: 'NOT_FOUND' };
    const [gone] = s.blocks.splice(i, 1);
    return { ok: true, id, unitId: gone.unitId };
  },

  async listHolds({ vehicleId, live = true } = {}) {
    let rows = getStore().holds;
    if (vehicleId) rows = rows.filter((h) => h.vehicleId === vehicleId);
    if (live) rows = rows.filter((h) => !h.releasedAt && new Date(h.expiresAt) > new Date());
    return clone(rows);
  },
  async createHold(data) {
    const s = getStore();
    const row = {
      id: `h-${Date.now()}`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: now(), ...data,
    };
    s.holds.push(row);
    return clone(row);
  },
  async releaseHold(id) {
    const s = getStore();
    const h = s.holds.find((x) => x.id === id);
    if (h) h.releasedAt = now();
    return Boolean(h);
  },

  /* ---------------------------------------------------------------- availability
     Mirrors supabase/migrations/0008 exactly — see demo-availability.js for
     why that matters. The store is plain JS and every check-then-write below
     runs without an await in between, so these are atomic by construction.
     That makes the demo agree with Postgres on the OUTCOME of a race, but it
     is not a proof that Postgres serialises correctly: only
     scripts/test-concurrency.mjs against a real database shows that. */

  async searchAvailability({ startAt, endAt } = {}) {
    const s = getStore();
    return s.vehicles
      .filter((v) => v.published !== false)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.pricePerDay - b.pricePerDay)
      .map((v) => availabilityRow(s, v, startAt, endAt));
  },

  async nextAvailable({ vehicleId, from }) {
    return nextAvailable(getStore(), vehicleId, from);
  },

  async holdVehicle({ vehicleId, startAt, endAt, sessionToken }) {
    const s = getStore();
    if (!sessionToken || sessionToken.length < 8) return { ok: false, error: 'BAD_SESSION' };
    if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };

    const vehicle = s.vehicles.find((v) => v.id === vehicleId);
    if (!vehicle || vehicle.published === false) return { ok: false, error: 'NOT_FOUND' };

    const free = freeUnits(s, vehicleId, startAt, endAt);
    if (free <= 0) return soldOut(s, vehicleId, startAt, endAt);

    const row = {
      id: `h-${s.holds.length + 1}-${Date.now()}`,
      vehicleId, startAt, endAt, sessionToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: now(),
    };
    s.holds.push(row);
    return {
      ok: true,
      hold: { id: row.id, vehicleId, expiresAt: row.expiresAt, startAt, endAt },
      unitsFree: free - 1,
    };
  },

  async releaseVehicleHold({ holdId, sessionToken }) {
    const s = getStore();
    const h = s.holds.find((x) => x.id === holdId && x.sessionToken === sessionToken && !x.releasedAt);
    if (h) h.releasedAt = now();
    return { ok: Boolean(h) };
  },

  async bookVehicle(payload = {}) {
    const s = getStore();
    const { vehicleId, vehicleSlug, startAt, endAt, holdId, sessionToken, customer = {}, quote: q = {} } = payload;

    if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };
    if (!customer.phone) return { ok: false, error: 'BAD_CUSTOMER' };

    const vehicle = s.vehicles.find((v) => v.id === vehicleId || v.slug === vehicleSlug);
    if (!vehicle || vehicle.published === false) return { ok: false, error: 'NOT_FOUND' };

    /* Release the hold first, so a booking is never blocked by its own hold. */
    if (holdId) {
      const h = s.holds.find((x) => x.id === holdId && x.sessionToken === sessionToken && !x.releasedAt);
      if (h) h.releasedAt = now();
    }

    const free = freeUnits(s, vehicle.id, startAt, endAt);
    if (free <= 0) return soldOut(s, vehicle.id, startAt, endAt);

    const phone = String(customer.phone);
    let cust = s.customers.find((c) => c.phone === phone);
    if (cust) {
      Object.assign(cust, {
        firstName: customer.firstName || cust.firstName,
        lastName: customer.lastName || cust.lastName,
        email: customer.email || cust.email,
        locale: customer.locale || cust.locale,
      });
    } else {
      cust = {
        id: `c-${s.customers.length + 1}-${Date.now()}`,
        firstName: customer.firstName || '-', lastName: customer.lastName || '-',
        phone, email: customer.email || null, locale: customer.locale || 'fr', createdAt: now(),
      };
      s.customers.push(cust);
    }

    const row = {
      id: `r-${s.reservations.length + 1}-${Date.now()}`,
      reference: payload.reference || `DC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      vehicleId: vehicle.id, unitId: null, customerId: cust.id,
      pickupLocationId: payload.pickupLocationId || null,
      dropoffLocationId: payload.dropoffLocationId || null,
      startAt, endAt, status: 'pending', quote: q,
      source: payload.source || 'web', locale: payload.locale || 'fr',
      holdId: holdId || null, notes: payload.notes || null,
      prepBufferMinutes: vehicle.prepBufferMinutes || 120,
      createdAt: now(), updatedAt: now(),
    };
    s.reservations.push(row);

    return {
      ok: true,
      reservation: { id: row.id, reference: row.reference, status: row.status, startAt, endAt },
      unitsFree: free - 1,
    };
  },

  /* Mirrors supabase/migrations/0010 so the admin behaves the same with no
     database. The transitions and the conflict answers are the part that must
     match; the demo has no roles, so the FORBIDDEN branch cannot occur. */

  async setReservationStatus({ id, status, reason }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (!NEXT_STATES[r.status]?.includes(status)) {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: r.status, to: status, allowed: NEXT_STATES[r.status] || [] };
    }
    if (NEEDS_REASON.includes(status) && !String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    r.status = status;
    r.updatedAt = now();
    return { ok: true, status };
  },

  async assignReservationUnit({ id, unitId, reason }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (unitId) {
      const clash = s.reservations.find(
        (x) => x.unitId === unitId && x.id !== id && OCCUPYING_ST.includes(x.status) && rangesOverlap(x, r),
      );
      if (clash) return { ok: false, error: 'CONFLICT', reference: clash.reference, from: clash.startAt, to: clash.endAt };
    }
    r.unitId = unitId || null;
    r.updatedAt = now();
    return { ok: true };
  },

  async moveReservation({ id, startAt, endAt }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (new Date(endAt) <= new Date(startAt)) return { ok: false, error: 'BAD_DATES' };
    const moved = { startAt, endAt };
    if (r.unitId) {
      const clash = s.reservations.find(
        (x) => x.unitId === r.unitId && x.id !== id && OCCUPYING_ST.includes(x.status) && rangesOverlap(x, moved),
      );
      if (clash) return { ok: false, error: 'CONFLICT', reference: clash.reference, from: clash.startAt, to: clash.endAt };
      if (s.blocks.some((b) => b.unitId === r.unitId && rangesOverlap(b, moved))) return { ok: false, error: 'BLOCKED' };
    }
    r.startAt = startAt;
    r.endAt = endAt;
    r.updatedAt = now();
    return { ok: true };
  },

  async overrideReservationPrice({ id, total, reason }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    r.quote = { ...(r.quote || {}), original: r.quote?.original ?? r.quote, total, overridden: true, overrideReason: reason };
    return { ok: true, total };
  },

  async unitsFreeForReservation(id) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return [];
    return clone(
      s.units
        .filter((u) => u.vehicleId === r.vehicleId && !['maintenance', 'blocked', 'out_of_service'].includes(u.status))
        .filter((u) => !s.reservations.some((x) => x.unitId === u.id && x.id !== id && OCCUPYING_ST.includes(x.status) && rangesOverlap(x, r)))
        .filter((u) => !s.blocks.some((b) => b.unitId === u.id && rangesOverlap(b, r)))
        .map((u) => ({ unitId: u.id, plate: u.plate, status: u.status })),
    );
  },

  async getCalendar({ from, to }) {
    const s = getStore();
    const win = { startAt: from, endAt: to };
    const vehicleOf = (id) => s.vehicles.find((v) => v.id === id);
    return clone({
      units: s.units.map((u) => {
        const v = vehicleOf(u.vehicleId);
        return { id: u.id, plate: u.plate, status: u.status, vehicleId: u.vehicleId, vehicle: v ? `${v.brand} ${v.model}` : '-' };
      }),
      reservations: s.reservations
        .filter((r) => OCCUPYING_ST.includes(r.status) && rangesOverlap(r, win))
        .map((r) => ({ id: r.id, unitId: r.unitId, vehicleId: r.vehicleId, reference: r.reference, status: r.status, startAt: r.startAt, endAt: r.endAt })),
      blocks: s.blocks.filter((b) => rangesOverlap(b, win)).map((b) => ({ id: b.id, unitId: b.unitId, kind: b.kind, reason: b.reason, startAt: b.startAt, endAt: b.endAt })),
    });
  },

  /* Mirrors supabase/migrations/0011. The phone key is the same rule: the last
     nine digits, so +212612345678 and 0612345678 are one person. */

  async getCustomerProfile(id) {
    const s = getStore();
    const customer = s.customers.find((c) => c.id === id);
    if (!customer) return null;
    const mine = s.reservations.filter((r) => r.customerId === id);
    const earned = mine.filter((r) => ['active', 'returned', 'closed'].includes(r.status));
    return clone({
      customer,
      reservations: mine
        .map((r) => ({
          id: r.id,
          reference: r.reference,
          status: r.status,
          startAt: r.startAt,
          endAt: r.endAt,
          total: r.quote?.total ?? null,
          vehicle: vehicleName(s, r.vehicleId),
        }))
        .sort((a, b) => String(b.startAt).localeCompare(String(a.startAt))),
      totals: {
        count: mine.length,
        revenue: earned.reduce((sum, r) => sum + (Number(r.quote?.total) || 0), 0),
        cancelled: mine.filter((r) => ['cancelled', 'no_show'].includes(r.status)).length,
        days: earned.reduce((sum, r) => sum + Math.ceil((new Date(r.endAt) - new Date(r.startAt)) / 86400000), 0),
      },
    });
  },

  async listCustomerDuplicates() {
    const s = getStore();
    const groups = new Map();
    for (const c of s.customers) {
      const key = phoneKey(c.phone);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        createdAt: c.createdAt,
        reservations: s.reservations.filter((r) => r.customerId === c.id).length,
      });
    }
    return clone([...groups.entries()].filter(([, list]) => list.length > 1).map(([key, customers]) => ({ key, customers })));
  },

  async mergeCustomers({ keepId, dropId, reason }) {
    const s = getStore();
    if (!keepId || !dropId || keepId === dropId) return { ok: false, error: 'SAME' };
    if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    const keep = s.customers.find((c) => c.id === keepId);
    const drop = s.customers.find((c) => c.id === dropId);
    if (!keep || !drop) return { ok: false, error: 'NOT_FOUND' };

    let moved = 0;
    for (const r of s.reservations) {
      if (r.customerId === dropId) {
        r.customerId = keepId;
        moved += 1;
      }
    }
    keep.email = keep.email || drop.email || null;
    keep.whatsapp = keep.whatsapp || drop.whatsapp || null;
    keep.notes = [keep.notes, drop.notes].map((n) => String(n || '').trim()).filter(Boolean).join('\n') || null;
    keep.updatedAt = now();
    s.customers = s.customers.filter((c) => c.id !== dropId);
    return { ok: true, moved, kept: keep.phone, dropped: drop.phone };
  },

  async setCustomerNotes({ id, notes }) {
    const s = getStore();
    const c = s.customers.find((x) => x.id === id);
    if (!c) return { ok: false, error: 'NOT_FOUND' };
    c.notes = String(notes || '').trim() || null;
    c.updatedAt = now();
    return { ok: true };
  },

  /* ------------------------------------------------------------------ fleet
     Mirrors supabase/migrations/0012. The demo has no roles, so the FORBIDDEN
     branches cannot occur; everything else behaves the same way, including the
     part that matters most — a returned car leaves public availability until
     somebody marks it ready. */

  async listVehiclePhotos({ vehicleId } = {}) {
    const rows = getStore().vehiclePhotos || [];
    return clone(
      (vehicleId ? rows.filter((p) => p.vehicleId === vehicleId) : rows).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    );
  },
  async saveVehiclePhoto(data) {
    const s = getStore();
    s.vehiclePhotos = s.vehiclePhotos || [];
    const i = data.id ? s.vehiclePhotos.findIndex((p) => p.id === data.id) : -1;
    if (i >= 0) {
      s.vehiclePhotos[i] = { ...s.vehiclePhotos[i], ...data };
      return clone(s.vehiclePhotos[i]);
    }
    const row = { angle: 'front', widths: [], formats: ['webp', 'jpg'], sort: 100, ...data, id: data.id || newId('ph'), createdAt: now() };
    s.vehiclePhotos.push(row);
    return clone(row);
  },
  async deleteVehiclePhoto(id) {
    const s = getStore();
    s.vehiclePhotos = s.vehiclePhotos || [];
    const row = s.vehiclePhotos.find((p) => p.id === id);
    s.vehiclePhotos = s.vehiclePhotos.filter((p) => p.id !== id);
    return row ? { ok: true, basePath: row.basePath, widths: row.widths, formats: row.formats } : { ok: false, error: 'NOT_FOUND' };
  },
  async reorderVehiclePhotos({ vehicleId, ids }) {
    const s = getStore();
    s.vehiclePhotos = s.vehiclePhotos || [];
    let moved = 0;
    (ids || []).forEach((id, index) => {
      const row = s.vehiclePhotos.find((p) => p.id === id && p.vehicleId === vehicleId);
      if (row) {
        row.sort = (index + 1) * 10;
        moved += 1;
      }
    });
    return { ok: true, moved };
  },
  async setUnitStatus({ unitId, status, reason }) {
    const s = getStore();
    const u = s.units.find((x) => x.id === unitId);
    if (!u) return { ok: false, error: 'NOT_FOUND' };
    if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
    if (u.status === 'rented' && ['maintenance', 'blocked', 'out_of_service'].includes(status)) {
      return { ok: false, error: 'UNIT_OUT', status: u.status };
    }
    const from = u.status;
    u.status = status;
    u.updatedAt = now();
    s.events.push({ id: newId('e'), unitId, type: 'STATUS_CHANGED', at: now(), data: { from, to: status }, reason });
    return { ok: true, from, to: status };
  },
  async getUnitDossier(id) {
    const s = getStore();
    const u = s.units.find((x) => x.id === id);
    if (!u) return null;
    const v = s.vehicles.find((x) => x.id === u.vehicleId);
    const loc = s.locations.find((x) => x.id === u.currentLocationId);
    return clone({
      unit: {
        ...u,
        vehicle: v ? `${v.brand} ${v.model}` : '\u2014',
        slug: v?.slug || null,
        location: loc ? loc.name?.fr || loc.key : null,
      },
      events: [...s.events.filter((e) => e.unitId === id)].sort((a, b) => String(b.at).localeCompare(String(a.at))),
      reservations: s.reservations
        .filter((r) => r.unitId === id)
        .map((r) => ({ id: r.id, reference: r.reference, status: r.status, startAt: r.startAt, endAt: r.endAt, total: r.quote?.total ?? null }))
        .sort((a, b) => String(b.startAt).localeCompare(String(a.startAt))),
      blocks: s.blocks.filter((b) => b.unitId === id),
    });
  },

  /* -------------------------------------------------------------- operations */

  /* Mirrors vehicle_availability_days() in 0013. The per-day count is a HINT;
     the range itself is still decided by searchAvailability, exactly as in
     Postgres, so the demo cannot teach a laxer rule than production. */
  async getVehicleCalendar({ vehicleId, from, to }) {
    const s = getStore();
    const v = s.vehicles.find((x) => x.id === vehicleId);
    if (!v || v.published === false) return { ok: false, error: 'NOT_FOUND' };

    const day0 = new Date(`${from}T00:00:00+01:00`);
    const last = new Date(`${to}T00:00:00+01:00`);
    const span = Math.min(92, Math.max(0, Math.round((last - day0) / 86400000)));
    const bookable = s.units.filter((u) => u.vehicleId === vehicleId && !['maintenance', 'blocked', 'out_of_service'].includes(u.status));

    const days = [];
    let run = 0;
    let best = 0;
    for (let i = 0; i <= span; i += 1) {
      const startAt = new Date(day0.getTime() + i * 86400000).toISOString();
      const endAt = new Date(day0.getTime() + (i + 1) * 86400000).toISOString();
      const free = freeUnits(s, vehicleId, startAt, endAt);
      /* The LABEL is counted forward from `from`, not sliced off the UTC form
         of the instant. `day0` is a Casablanca midnight (+01:00), so its ISO
         string is 23:00 on the PREVIOUS day -- slicing it labelled every cell
         with the day before, and the booking calendar in demo mode therefore
         blocked free days and offered booked ones. Postgres does not have the
         problem: casablanca_day() does this arithmetic in the right zone. */
      const label = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
      days.push({ day: label, free });
      if (free > 0) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }

    return clone({
      ok: true,
      vehicleId,
      slug: v.slug,
      from,
      to: days[days.length - 1]?.day || from,
      minDays: v.minDays || 1,
      prepBufferMinutes: v.prepBufferMinutes || 120,
      unitsTotal: bookable.length,
      maxRun: best,
      days,
    });
  },

  async getOperationsDay(day) {
    const s = getStore();
    const d0 = new Date(`${day}T00:00:00+01:00`);
    const d1 = new Date(d0.getTime() + 86400000);
    const inDay = (iso) => {
      const t = new Date(iso);
      return t >= d0 && t < d1;
    };
    const decorate = (r) => {
      const v = s.vehicles.find((x) => x.id === r.vehicleId);
      const u = s.units.find((x) => x.id === r.unitId);
      const c = s.customers.find((x) => x.id === r.customerId);
      return {
        id: r.id, reference: r.reference, status: r.status,
        start_at: r.startAt, end_at: r.endAt, unit_id: r.unitId,
        vehicle: v ? `${v.brand} ${v.model}` : '\u2014',
        plate: u?.plate || null,
        customer: c ? `${c.firstName} ${c.lastName}`.trim() : null,
        phone: c?.phone || null, locale: c?.locale || 'fr',
        total: r.quote?.total ?? null,
        picked_up: s.events.some((e) => e.reservationId === r.id && e.type === 'PICKUP'),
        returned: s.events.some((e) => e.reservationId === r.id && e.type === 'RETURN'),
      };
    };
    const live = s.reservations.filter((r) => !['cancelled', 'no_show'].includes(r.status));
    return clone({
      day,
      departures: live.filter((r) => inDay(r.startAt)).map(decorate),
      returns: live.filter((r) => inDay(r.endAt)).map(decorate),
      overdue: live.filter((r) => r.status === 'active' && new Date(r.endAt) < new Date()).map(decorate),
      toPrepare: s.units
        .filter((u) => ['cleaning', 'returned'].includes(u.status))
        .map((u) => {
          const v = s.vehicles.find((x) => x.id === u.vehicleId);
          return { unitId: u.id, plate: u.plate, status: u.status, vehicle: v ? `${v.brand} ${v.model}` : '\u2014', since: u.updatedAt };
        }),
    });
  },

  async completePickup({ id, payload = {} }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (!['confirmed', 'ready'].includes(r.status)) {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: r.status, allowed: NEXT_STATES[r.status] || [] };
    }
    if (!r.unitId) return { ok: false, error: 'UNIT_REQUIRED' };
    if (!(payload.identityChecked && payload.documentsChecked && payload.unitChecked)) {
      return { ok: false, error: 'CHECKS_INCOMPLETE' };
    }
    const eventId = newId('e');
    s.events.push({
      id: eventId, unitId: r.unitId, reservationId: r.id, type: 'PICKUP', at: now(),
      mileageKm: payload.mileageKm ?? null, fuelPct: payload.fuelPct ?? null,
      condition: payload.condition || {}, notes: payload.notes || null,
      photos: payload.photos || [], signaturePath: payload.signaturePath || null,
      data: { identityChecked: true, documentsChecked: true, unitChecked: true, payment: payload.payment || {} },
      reason: payload.reason || 'départ (remise des clés)',
    });
    logDemoDamages(s, r, payload.damages);
    r.status = 'active';
    if (payload.payment) r.payment = payload.payment;
    r.updatedAt = now();
    const u = s.units.find((x) => x.id === r.unitId);
    if (u) {
      u.status = 'rented';
      if (payload.mileageKm != null) u.mileageKm = payload.mileageKm;
      if (payload.fuelPct != null) u.fuelPct = payload.fuelPct;
      if (payload.locationId) u.currentLocationId = payload.locationId;
      u.updatedAt = now();
    }
    return { ok: true, eventId, reference: r.reference, status: 'active' };
  },

  async completeReturn({ id, payload = {} }) {
    const s = getStore();
    const r = s.reservations.find((x) => x.id === id);
    if (!r) return { ok: false, error: 'NOT_FOUND' };
    if (r.status !== 'active') {
      return { ok: false, error: 'ILLEGAL_TRANSITION', from: r.status, allowed: NEXT_STATES[r.status] || [] };
    }
    if (!r.unitId) return { ok: false, error: 'UNIT_REQUIRED' };

    const minutes = Number(s.settings?.cleaningMinutes) || 120;
    const eventId = newId('e');
    s.events.push({
      id: eventId, unitId: r.unitId, reservationId: r.id, type: 'RETURN', at: now(),
      mileageKm: payload.mileageKm ?? null, fuelPct: payload.fuelPct ?? null,
      condition: payload.condition || {}, notes: payload.notes || null,
      photos: payload.photos || [], signaturePath: payload.signaturePath || null,
      data: payload.data || {}, reason: payload.reason || 'retour du véhicule',
    });
    const damages = logDemoDamages(s, r, payload.damages);
    r.status = 'returned';
    r.updatedAt = now();
    const u = s.units.find((x) => x.id === r.unitId);
    if (u) {
      u.status = 'cleaning';
      if (payload.mileageKm != null) u.mileageKm = payload.mileageKm;
      if (payload.fuelPct != null) u.fuelPct = payload.fuelPct;
      if (payload.locationId) u.currentLocationId = payload.locationId;
      u.updatedAt = now();
    }
    /* The block, not the status, is what removes the car from availability. */
    s.blocks.push({
      id: newId('b'), unitId: r.unitId, kind: 'cleaning',
      startAt: now(), endAt: new Date(Date.now() + minutes * 60000).toISOString(),
      reason: `nettoyage après ${r.reference}`,
    });
    s.notifications = s.notifications || [];
    s.notifications.push({
      id: newId('n'), level: 'action', title: 'Véhicule à préparer',
      body: `${u?.plate || 'Unité'} — retour ${r.reference}`,
      href: `/flotte/unites/${r.unitId}`, createdAt: now(), readAt: null,
    });
    return { ok: true, eventId, reference: r.reference, status: 'returned', damages, cleaningBlock: true, cleaningMinutes: minutes };
  },

  async markUnitReady({ unitId, reason }) {
    const s = getStore();
    const u = s.units.find((x) => x.id === unitId);
    if (!u) return { ok: false, error: 'NOT_FOUND' };
    if (u.status === 'rented') return { ok: false, error: 'UNIT_OUT' };
    const from = u.status;
    s.events.push({
      id: newId('e'), unitId, type: 'CLEANING_COMPLETED', at: now(),
      mileageKm: u.mileageKm ?? null, fuelPct: u.fuelPct ?? null,
      reason: reason || 'véhicule prêt',
    });
    u.status = 'available';
    u.updatedAt = now();
    const before = s.blocks.length;
    /* Only the block running now (0014): a transfer planned for next week stays. */
    s.blocks = s.blocks.filter((b) => !(b.unitId === unitId && ['cleaning', 'transfer'].includes(b.kind) && liveAt(b)));
    return { ok: true, from, blocksClosed: before - s.blocks.length };
  },

  /* ------------------------------------------------------------ observability */

  async getSystemMetrics() {
    const s = getStore();
    return clone({
      demo: true,
      databaseBytes: null,
      tables: [],
      storage: [],
      counts: {
        vehicles: s.vehicles.length, units: s.units.length,
        reservations: s.reservations.length, customers: s.customers.length,
        events: s.events.length, auditRows: (s.auditLog || []).length,
        unreadNotifications: (s.notifications || []).filter((n) => !n.readAt).length,
        pushSubscriptions: 0,
      },
      reservationsToday: s.reservations.filter((r) => String(r.createdAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      lastBackupAt: s.settings?.lastBackupAt || null,
      now: now(),
    });
  },
  async expireUnconfirmedReservations() {
    const s = getStore();
    const hours = Number(s.settings?.autoExpireHours ?? 12);
    if (hours <= 0) return { ok: true, disabled: true, expired: 0 };
    const cutoff = Date.now() - hours * 3600000;
    let expired = 0;
    for (const r of s.reservations) {
      if (r.status === 'pending' && new Date(r.createdAt || 0).getTime() < cutoff) {
        r.status = 'cancelled';
        r.updatedAt = now();
        expired += 1;
      }
    }
    if (expired > 0) {
      s.notifications = s.notifications || [];
      s.notifications.push({
        id: newId('n'), level: 'info', title: 'Réservations expirées',
        body: `${expired} demande(s) non confirmée(s) annulée(s) après ${hours} h`,
        href: '/reservations?status=cancelled', createdAt: now(), readAt: null,
      });
    }
    return { ok: true, expired, hours };
  },
  async refreshCleaningBlocks() {
    const s = getStore();
    const minutes = Number(s.settings?.cleaningMinutes) || 120;
    let refreshed = 0;
    for (const u of s.units) {
      if (u.status !== 'cleaning') continue;
      const live = s.blocks.some((b) => b.unitId === u.id && b.kind === 'cleaning' && liveAt(b));
      const window = { startAt: now(), endAt: new Date(Date.now() + minutes * 60000).toISOString() };
      /* The exclusion constraint would refuse an overlap; the SQL skips that unit. */
      const occupied = s.blocks.some((b) => b.unitId === u.id && rangesOverlap(b, window));
      if (!live && !occupied) {
        s.blocks.push({
          id: newId('b'), unitId: u.id, kind: 'cleaning',
          startAt: now(), endAt: new Date(Date.now() + minutes * 60000).toISOString(),
          reason: 'nettoyage en cours',
        });
        refreshed += 1;
      }
    }
    return { ok: true, refreshed };
  },

  async listAuditLog({ table, rowId, actorId, since, until, limit = 100 } = {}) {
    const s = getStore();
    s.auditLog = s.auditLog || [];
    let rows = s.auditLog;
    if (table) rows = rows.filter((r) => r.tableName === table);
    if (rowId) rows = rows.filter((r) => r.rowId === rowId || r.rowKey === String(rowId));
    if (actorId) rows = rows.filter((r) => r.actorId === actorId);
    if (since) rows = rows.filter((r) => r.at >= since);
    if (until) rows = rows.filter((r) => r.at <= until);
    return clone([...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit));
  },

  async markNotificationRead(id) {
    const s = getStore();
    s.notifications = s.notifications || [];
    const n = s.notifications.find((x) => x.id === id);
    if (n) n.readAt = now();
    return Boolean(n);
  },

  async getFleetSnapshot() {
    const s = getStore();
    s.notifications = s.notifications || [];
    return summarise(s.units, s.reservations, s.notifications.filter((n) => !n.readAt).length);
  },

  /* Notifications (plan 7.4): the bell in the admin. Written by the booking
     action so staff see a new reservation without polling the list. */
  async listNotifications({ unreadOnly = false, limit = 50 } = {}) {
    const s = getStore();
    s.notifications = s.notifications || [];
    let rows = s.notifications;
    if (unreadOnly) rows = rows.filter((n) => !n.readAt);
    return clone([...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit));
  },
  async createNotification(data) {
    const s = getStore();
    s.notifications = s.notifications || [];
    const row = { id: `n-${s.notifications.length + 1}-${Date.now()}`, level: 'info', createdAt: now(), readAt: null, ...data };
    s.notifications.push(row);
    return clone(row);
  },

  async expireHolds() {
    const s = getStore();
    const stamp = now();
    let n = 0;
    for (const h of s.holds) {
      if (!h.releasedAt && new Date(h.expiresAt) <= new Date()) {
        h.releasedAt = stamp;
        n += 1;
      }
    }
    return n;
  },

  async listEvents({ unitId, reservationId, limit = 50 } = {}) {
    let rows = getStore().events;
    if (unitId) rows = rows.filter((e) => e.unitId === unitId);
    if (reservationId) rows = rows.filter((e) => e.reservationId === reservationId);
    return clone([...rows].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit));
  },
  async createEvent(data) {
    const s = getStore();
    const row = { id: `e-${Date.now()}`, at: now(), ...data };
    s.events.push(row);
    return clone(row);
  },

  /* Stats */
  async getStats() {
    const s = getStore();
    const month = new Date().toISOString().slice(0, 7);
    const monthBookings = s.bookings.filter((b) => b.createdAt.startsWith(month) && b.status !== 'cancelled');
    const revenue = monthBookings.reduce((sum, b) => sum + (b.totalMad || 0), 0);
    const pending = s.bookings.filter((b) => b.status === 'pending').length;
    const active = s.bookings.filter((b) => ['confirmed', 'active'].includes(b.status)).length;
    const published = s.vehicles.filter((v) => v.published).length;
    return { monthBookings: monthBookings.length, revenueMad: revenue, pending, active, fleetPublished: published, fleetTotal: s.vehicles.length };
  },
};
