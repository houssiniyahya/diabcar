import { createPublicClient, createServiceClient, createSessionClient } from '@/lib/supabase/server';
import { deliveryFeeOf } from '@/lib/locations';
import { summarise } from './summarise';

/* camelCase <-> snake_case mapping between the app model and Postgres columns */
const toSnake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
/* `[a-z0-9]`, not `[a-z]`: `is_24h` has a digit after the underscore and used
   to come through as the literal key `is_24h`, so nothing reading `is24h` ever
   saw a value. toSnake is deliberately NOT made symmetric — writes go through
   the save_* RPCs, which read their JSON keys explicitly. */
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const rowToModel = (row) => (row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) : row);
const modelToRow = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [toSnake(k), v]));

function fail(error) {
  throw new Error(`[supabase] ${error.message}`);
}

async function readClient() {
  return createPublicClient();
}
async function writeClient() {
  return createSessionClient();
}

async function selectAll(table, build) {
  const sb = await readClient();
  let q = sb.from(table).select('*');
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) fail(error);
  return (data || []).map(rowToModel);
}

/**
 * Staff-scoped read: goes through the SESSION client so RLS sees the
 * signed-in role.
 *
 * This distinction is not cosmetic. `selectAll` uses the anonymous client, and
 * every staff-only table — reservations, units, customers, blocks, holds,
 * events, notifications, audit_log — denies anon under the policies in 0005.
 * Reading them with the public client returns an EMPTY ARRAY and no error, so
 * the admin would have rendered "0 réservations" on a database full of them.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* `[from, to)` — half-open, the same convention the exclusion constraints and
   booking_window() use, so a block that ends at 10:00 and a rental that starts
   at 10:00 do not read as a conflict. */
const rangeLiteral = (startAt, endAt) => `[${new Date(startAt).toISOString()},${new Date(endAt).toISOString()})`;

/* Postgres prints `2026-09-10 09:00:00+00` — a space instead of the T, and a
   two-digit offset that ISO 8601 does not define. Left as-is, Date.parse is
   free to return NaN, and a bar with a NaN date is an invisible bar. */
function isoFromPg(value) {
  if (!value) return null;
  const normalised = String(value).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const t = Date.parse(normalised);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** `["2026-09-10 09:00+00","2026-09-12 09:00+00")` → { startAt, endAt }. */
function blockToModel(row) {
  if (!row) return row;
  const { period, ...rest } = row;
  if (!period) return rest;
  const m = String(period).match(/^[[(]"?([^",]*)"?,"?([^",]*)"?[\])]$/);
  return { ...rest, startAt: m ? isoFromPg(m[1]) : null, endAt: m ? isoFromPg(m[2]) : null };
}

/* PostgREST's answer when a function is not in its schema cache: a database
   that has not had a migration applied yet. */
function isMissingFunction(error) {
  return error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''));
}

/**
 * The block insert as it was before migration 0014, kept ONLY for a database
 * that has not had 0014 applied: the code can ship before the SQL without
 * breaking the admin. It has the 0004 trigger and the exclusion constraint,
 * not 0014's capacity check — the result says so (`legacy`), and the page
 * warns the owner.
 */
async function legacyCreateBlock(sb, { unitId, startAt, endAt, kind, reason }) {
  if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
  const { data: row, error } = await sb
    .from('blocks')
    .insert({ unit_id: unitId, kind: kind || 'maintenance', reason, period: rangeLiteral(startAt, endAt) })
    .select()
    .single();
  if (error) {
    const message = String(error.message || '');
    if (message.includes('BLOCK_CONFLICTS_RESERVATION')) {
      const reference = String(error.details || '').match(/DC-[0-9]{6}-[A-Z0-9]{4}/)?.[0] || null;
      return { ok: false, error: 'CONFLICT', reference, legacy: true };
    }
    if (error.code === '23P01' || message.includes('blocks_no_overlap')) return { ok: false, error: 'BLOCK_OVERLAP', legacy: true };
    fail(error);
  }
  return { ok: true, legacy: true, block: blockToModel(rowToModel(row)) };
}

/**
 * Call a write RPC and hand back the row it made.
 *
 * The rule this encodes: a write that can be REFUSED FOR A BUSINESS REASON —
 * a conflict, an incomplete checklist, an illegal transition — returns its
 * outcome so the operator can act on it (those methods use rpcOutcome below
 * and pass the payload through untouched). A write that can only fail on BAD
 * INPUT — a taken slug, a missing key — throws, because there is nothing for
 * the operator to decide: the form is wrong and the action says so.
 */
async function rpcRow(fn, args, key) {
  const sb = await writeClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) fail(error);
  if (!data?.ok) {
    const err = new Error(data?.error || 'RPC_FAILED');
    err.code = data?.error || 'RPC_FAILED';
    err.detail = data?.detail || null;
    throw err;
  }
  return key ? rowToModel(data[key]) : data;
}

/** Same call, for the RPCs whose refusals are information rather than faults. */
async function rpcOutcome(fn, args) {
  const sb = await writeClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) fail(error);
  return data;
}

/**
 * Public content read, or the staff one.
 *
 * The RLS policies on faqs, reviews and posts all read
 * `published = true OR is_staff()`. Through the ANON client `is_staff()` is
 * false, so the admin listing its own drafts would see none of them — the
 * same class of silent-empty bug the staff read helpers above were written
 * for. `asStaff` picks the session client so the admin sees the unpublished
 * rows it is there to edit.
 */
async function selectContent(table, build, asStaff) {
  return asStaff ? selectAllAsStaff(table, build) : selectAll(table, build);
}

async function selectAllAsStaff(table, build) {
  const sb = await writeClient();
  let q = sb.from(table).select('*');
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) fail(error);
  return (data || []).map(rowToModel);
}

async function selectOneAsStaff(table, build) {
  const sb = await writeClient();
  const { data, error } = await (build ? build(sb.from(table).select('*')) : sb.from(table).select('*')).maybeSingle();
  if (error) fail(error);
  return rowToModel(data);
}

async function selectOne(table, build) {
  const sb = await readClient();
  const { data, error } = await (build ? build(sb.from(table).select('*')) : sb.from(table).select('*')).maybeSingle();
  if (error) fail(error);
  return rowToModel(data);
}

async function upsert(table, model) {
  const sb = await writeClient();
  const row = modelToRow(model);
  if (!row.id) delete row.id;
  const { data, error } = await sb.from(table).upsert(row).select().single();
  if (error) fail(error);
  return rowToModel(data);
}

async function remove(table, id) {
  const sb = await writeClient();
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) fail(error);
  return true;
}

export const supabaseAdapter = {
  mode: 'supabase',

  /**
   * Public settings. Reads the `public_settings` VIEW, not the table.
   *
   * 0005 makes `settings` staff-only, so an anonymous visitor selecting the
   * table gets zero rows — the site would lose its phone number, hours and
   * trust facts while looking like it simply had no data. The view exposes a
   * whitelisted column list and is granted to anon.
   *
   * Anything internal (index_now_key) is NOT here by design; the admin reads
   * the full row through getSettingsAdmin() below.
   */
  async getSettings() {
    const sb = await readClient();
    const { data, error } = await sb.from('public_settings').select('*').eq('id', 1).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },

  /** Full settings row, staff only — goes through the session client so RLS sees the role. */
  async getSettingsAdmin() {
    const sb = await writeClient();
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },

  /* Column-by-column patch inside save_settings(), so a form that edits the
     opening hours cannot blank the ICE number, and the change carries a
     reason into audit_log. */
  async updateSettings(patch, reason) {
    return rpcRow('save_settings', { p: patch, p_reason: reason || 'paramètres' }, 'settings');
  },

  /* `asStaff` reads through the session client. The RLS policy on vehicles
     is `is_published = true or is_staff()`, and through the ANON client
     is_staff() is false — so an admin listing its own drafts, or opening one
     to publish it, would get nothing and a 404. The public site never passes
     it; the admin always does. */
  async listVehicles({ published, category, transmission, seats, fuel, minPrice, maxPrice, featured, sort, asStaff = false } = {}) {
    return (asStaff ? selectAllAsStaff : selectAll)('vehicles', (q) => {
      if (published !== undefined) q = q.eq('published', published);
      if (featured !== undefined) q = q.eq('featured', featured);
      if (category) q = Array.isArray(category) ? q.in('category', category) : q.eq('category', category);
      if (transmission) q = q.eq('transmission', transmission);
      if (fuel) q = q.eq('fuel', fuel);
      if (seats) q = q.gte('seats', Number(seats));
      if (minPrice) q = q.gte('price_per_day', Number(minPrice));
      if (maxPrice) q = q.lte('price_per_day', Number(maxPrice));
      if (sort === 'price_asc') q = q.order('price_per_day', { ascending: true });
      else if (sort === 'price_desc') q = q.order('price_per_day', { ascending: false });
      else if (sort === 'newest') q = q.order('year', { ascending: false });
      else q = q.order('featured', { ascending: false }).order('sort_order', { ascending: true });
      return q;
    });
  },
  async getVehicleBySlug(slug) {
    const sb = await readClient();
    const { data, error } = await sb.from('vehicles').select('*').eq('slug', slug).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async getVehicleById(id, { asStaff = false } = {}) {
    const sb = asStaff ? await writeClient() : await readClient();
    const { data, error } = await sb.from('vehicles').select('*').eq('id', id).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async upsertVehicle(data, reason) {
    return rpcRow('save_vehicle', { p: data, p_reason: reason || null }, 'vehicle');
  },
  async deleteVehicle(id) {
    return remove('vehicles', id);
  },

  async listSeasons() {
    return selectAll('seasons', (q) => q.order('start_date'));
  },
  async upsertSeason(data, reason) {
    return rpcRow('save_season', { p: data, p_reason: reason || 'tarifs' }, 'season');
  },
  async deleteSeason(id, reason) {
    return rpcRow('admin_delete', { p_table: 'seasons', p_id: id, p_reason: reason || 'suppression saison' });
  },
  async listExtras() {
    return selectAll('extras', (q) => q.order('key'));
  },
  async upsertExtra(data, reason) {
    return rpcRow('save_extra', { p: data, p_reason: reason || 'tarifs' }, 'extra');
  },
  async deleteExtra(id, reason) {
    return rpcRow('admin_delete', { p_table: 'extras', p_id: id, p_reason: reason || 'suppression option' });
  },
  /* Public reads see only live places. The admin needs the disabled ones too,
     or a place switched off can never be switched back on. */
  async listLocations({ all = false } = {}) {
    const rows = all
      ? await selectAllAsStaff('locations', (q) => q.order('sort').order('key'))
      : await selectAll('locations', (q) => q.eq('active', true).order('sort').order('key'));
    /* The booking module and the demo seed call it `deliveryFee`; the column
       is `delivery_fee_mad` (plan 6.2) with the starter's `fee` still behind
       it. Without this alias every place rendered « sur devis » in production
       while working in demo — the exact class of bug rule 12 exists to catch.
       The falling-back is `deliveryFeeOf()`, not `?? l.fee ??`: `fee` is
       `numeric default 0`, so the plain coalesce answered 0 — « livraison
       gratuite » — for every destination the owner had not priced yet. */
    return rows.map((l) => ({ ...l, deliveryFee: deliveryFeeOf(l) }));
  },
  async upsertLocation(data, reason) {
    return rpcRow('save_location', { p: data, p_reason: reason || 'lieu' }, 'location');
  },
  async deleteLocation(id, reason) {
    return rpcRow('admin_delete', { p_table: 'locations', p_id: id, p_reason: reason || 'suppression lieu' });
  },

  async listFaqs({ published, category, citySlug, vehicleId, asStaff = false } = {}) {
    return selectContent('faqs', (q) => {
      let b = q;
      if (published !== undefined) b = b.eq('published', published);
      if (category) b = b.eq('category', category);
      if (citySlug) b = b.eq('city_slug', citySlug);
      if (vehicleId) b = b.eq('vehicle_id', vehicleId);
      return b.order('sort_order');
    }, asStaff);
  },
  async upsertFaq(data) {
    return rpcRow('save_faq', { p: data }, 'faq');
  },
  async deleteFaq(id) {
    return rpcRow('admin_delete', { p_table: 'faqs', p_id: id, p_reason: 'suppression FAQ' });
  },

  async listPosts({ published, asStaff = false } = {}) {
    return selectContent('posts', (q) => {
      let b = q;
      if (published !== undefined) b = b.eq('published', published);
      return b.order('published_at', { ascending: false });
    }, asStaff);
  },
  async getPostBySlug(slug) {
    const sb = await readClient();
    const { data, error } = await sb.from('posts').select('*').eq('slug', slug).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async getPostById(id) {
    const sb = await readClient();
    const { data, error } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async upsertPost(data) {
    return upsert('posts', { ...data, updatedAt: new Date().toISOString() });
  },
  async deletePost(id) {
    return rpcRow('admin_delete', { p_table: 'posts', p_id: id, p_reason: 'suppression article' });
  },

  async listReviews({ published, asStaff = false } = {}) {
    return selectContent('reviews', (q) => {
      let b = q;
      if (published !== undefined) b = b.eq('published', published);
      return b.order('created_at', { ascending: false });
    }, asStaff);
  },
  async upsertReview(data) {
    return rpcRow('save_review', { p: data }, 'review');
  },
  async deleteReview(id) {
    return rpcRow('admin_delete', { p_table: 'reviews', p_id: id, p_reason: 'suppression avis' });
  },

  async createBooking(data) {
    // Public insert allowed by RLS (anon) — customers create their own request.
    const sb = await readClient();
    const { data: row, error } = await sb.from('bookings').insert(modelToRow({ status: 'pending', source: 'web', ...data })).select().single();
    if (error) fail(error);
    return rowToModel(row);
  },
  async listBookings({ status, limit } = {}) {
    const sb = await writeClient();
    let q = sb.from('bookings').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) fail(error);
    return (data || []).map(rowToModel);
  },
  async getBooking(idOrRef) {
    const sb = await writeClient();
    const { data, error } = await sb.from('bookings').select('*').or(`id.eq.${idOrRef},reference.eq.${idOrRef}`).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async updateBooking(id, patch) {
    const sb = await writeClient();
    const { data, error } = await sb.from('bookings').update(modelToRow({ ...patch, updatedAt: new Date().toISOString() })).eq('id', id).select().single();
    if (error) fail(error);
    return rowToModel(data);
  },


  /* ---------------------------------------------------------------- fleet ops
     Every one of these goes through RLS: units, customers, reservations,
     blocks and events are staff-only (migration 0005), so an anonymous caller
     gets an empty set rather than an error. Availability decisions are NOT
     made here — they belong to the Postgres RPCs (plan 6.3, prompt 06). */

  async listUnits({ vehicleId, status } = {}) {
    return selectAllAsStaff('units', (q) => {
      let b = q.order('plate');
      if (vehicleId) b = b.eq('vehicle_id', vehicleId);
      if (status) b = b.eq('status', status);
      return b;
    });
  },
  async getUnit(id) {
    return selectOneAsStaff('units', (q) => q.eq('id', id));
  },
  async upsertUnit(data, reason) {
    return rpcRow('save_unit', { p: data, p_reason: reason || null }, 'unit');
  },

  /* `ids` narrows the read to the customers a page actually names — the model
     page needs a handful of names, not the whole file (and not PostgREST's
     row cap of it). */
  async listCustomers({ ids } = {}) {
    if (Array.isArray(ids) && ids.length === 0) return [];
    return selectAllAsStaff('customers', (q) => {
      let b = q.order('created_at', { ascending: false });
      if (Array.isArray(ids)) b = b.in('id', ids);
      return b;
    });
  },
  async upsertCustomer(data) {
    const sb = await writeClient();
    const { data: row, error } = await sb.from('customers').upsert(modelToRow(data), { onConflict: 'phone' }).select().single();
    if (error) fail(error);
    return rowToModel(row);
  },

  /* `from`/`to` keep the rows whose dates touch that window (half-open), and
     `statuses` a set of states — together, "what a timeline draws". */
  async listReservations({ status, statuses, vehicleId, from, to, limit } = {}) {
    return selectAllAsStaff('reservations', (q) => {
      let b = q.order('created_at', { ascending: false });
      if (status) b = b.eq('status', status);
      if (Array.isArray(statuses) && statuses.length) b = b.in('status', statuses);
      if (vehicleId) b = b.eq('vehicle_id', vehicleId);
      if (from) b = b.gt('end_at', new Date(from).toISOString());
      if (to) b = b.lt('start_at', new Date(to).toISOString());
      if (limit) b = b.limit(limit);
      return b;
    });
  },
  async getReservation(idOrRef) {
    /* Session client: reservations are staff-only under RLS. */
    const sb = await writeClient();
    const column = /^[0-9a-f-]{36}$/i.test(idOrRef) ? 'id' : 'reference';
    const { data, error } = await sb.from('reservations').select('*').eq(column, idOrRef).maybeSingle();
    if (error) fail(error);
    return rowToModel(data);
  },
  async createReservation(data) {
    return upsert('reservations', data);
  },
  async updateReservation(id, patch) {
    /* A sensitive write carries a reason: hand it to Postgres for the session
       so the audit trigger records WHY, not just what (CLAUDE.md rule 5). */
    const { reason, ...rest } = patch;
    const sb = await writeClient();
    if (reason) await sb.rpc('set_reason', { p_reason: reason });
    const { data, error } = await sb.from('reservations').update(modelToRow(rest)).eq('id', id).select().single();
    if (error) fail(error);
    return rowToModel(data);
  },

  /* `blocks` stores a tstzrange, not two columns, so the generic snake_case
     mapper cannot round-trip it: a startAt/endAt pair would be written as
     start_at/end_at, which do not exist on this table. Both directions are
     translated here so a block looks like every other dated row to callers
     — the demo adapter already speaks startAt/endAt (rule 12). */
  /* `unitIds` + `from`/`to` read only the periods a timeline can draw. The
     blocks table only grows (every return writes a cleaning block), and an
     unfiltered read past PostgREST's row cap drops arbitrary rows. */
  async listBlocks({ unitId, unitIds, from, to } = {}) {
    if (Array.isArray(unitIds) && unitIds.length === 0) return [];
    const rows = await selectAllAsStaff('blocks', (q) => {
      let b = q.order('period', { ascending: true });
      if (unitId) b = b.eq('unit_id', unitId);
      if (Array.isArray(unitIds)) b = b.in('unit_id', unitIds);
      if (from && to) b = b.overlaps('period', rangeLiteral(from, to));
      return b;
    });
    return rows.map(blockToModel);
  },
  /* Through create_block() (0014), never a plain insert: the function refuses
     a period that would double-book the model, and names what is in the way.
     Its refusals are outcomes ({ ok:false, error, … }), not exceptions. */
  async createBlock({ unitId, startAt, endAt, kind, reason }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('create_block', {
      p_unit: unitId,
      p_start: new Date(startAt).toISOString(),
      p_end: new Date(endAt).toISOString(),
      p_kind: kind || 'maintenance',
      p_reason: reason || null,
    });
    if (error) {
      if (isMissingFunction(error)) return legacyCreateBlock(sb, { unitId, startAt, endAt, kind, reason });
      fail(error);
    }
    if (!data?.ok) return data || { ok: false, error: 'SERVER' };
    return {
      ok: true,
      block: { id: data.id, unitId: data.unitId, kind: data.kind, reason: data.reason, startAt: isoFromPg(data.startAt), endAt: isoFromPg(data.endAt) },
    };
  },
  /* delete_block() (0014) takes the reason in the same transaction as the
     delete, so the audit trail says why the dates went back on sale. */
  async deleteBlock(id, reason) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('delete_block', { p_id: id, p_reason: reason || null });
    if (error) {
      if (isMissingFunction(error)) {
        if (!String(reason || '').trim()) return { ok: false, error: 'REASON_REQUIRED' };
        const { error: deleteError } = await sb.from('blocks').delete().eq('id', id);
        if (deleteError) fail(deleteError);
        return { ok: true, id, legacy: true };
      }
      fail(error);
    }
    return data;
  },

  async listHolds({ vehicleId, live = true } = {}) {
    return selectAllAsStaff('holds', (q) => {
      let b = q;
      if (vehicleId) b = b.eq('vehicle_id', vehicleId);
      if (live) b = b.is('released_at', null).gt('expires_at', new Date().toISOString());
      return b;
    });
  },
  async createHold(data) {
    return upsert('holds', data);
  },
  async releaseHold(id) {
    const sb = await writeClient();
    const { error } = await sb.from('holds').update({ released_at: new Date().toISOString() }).eq('id', id);
    if (error) fail(error);
    return true;
  },

  /* ---------------------------------------------------------------- availability
     Everything below goes through the RPCs in supabase/migrations/0008. The
     anon key has no SELECT on reservations, holds, units or customers — the
     functions are SECURITY DEFINER, so a visitor can learn "two left" without
     being able to read who booked the other one (plan 6.5, CLAUDE.md rule 5). */

  async searchAvailability({ pickupLocationId = null, dropoffLocationId = null, startAt, endAt }) {
    const sb = await readClient();
    const { data, error } = await sb.rpc('search_availability', {
      p_pickup_location_id: pickupLocationId,
      p_dropoff_location_id: dropoffLocationId,
      p_start_at: startAt,
      p_end_at: endAt,
    });
    if (error) fail(error);
    return (data || []).map(rowToModel);
  },

  async nextAvailable({ vehicleId, from }) {
    const sb = await readClient();
    const { data, error } = await sb.rpc('next_available', { p_vehicle_id: vehicleId, p_from: from || new Date().toISOString() });
    if (error) fail(error);
    return data || null;
  },

  async holdVehicle({ vehicleId, startAt, endAt, sessionToken }) {
    const sb = await readClient();
    const { data, error } = await sb.rpc('create_hold', {
      p_vehicle_id: vehicleId, p_start_at: startAt, p_end_at: endAt, p_session_token: sessionToken,
    });
    if (error) fail(error);
    return data;
  },

  async releaseVehicleHold({ holdId, sessionToken }) {
    const sb = await readClient();
    const { data, error } = await sb.rpc('release_hold', { p_hold_id: holdId, p_session_token: sessionToken });
    if (error) fail(error);
    return data;
  },

  async bookVehicle(payload, { asStaff = false } = {}) {
    /* A counter booking goes through the SESSION client so the audit trigger
       records WHICH member of staff created it. The public funnel stays
       anonymous by design — create_reservation() is SECURITY DEFINER and does
       not need a logged-in caller. */
    const sb = asStaff ? await writeClient() : await readClient();
    const { data, error } = await sb.rpc('create_reservation', { payload });
    if (error) fail(error);
    return data;
  },

  /* The activity log (plan 7.1 "Journal"). Staff-scoped: audit_log carries
     before/after snapshots of rows that include customer data. */
  /* ---------------------------------------------------------------- operations
     Every one of these is a single RPC, because the audit reason is a
     transaction-local setting: "set the reason, then write" from the app would
     be two transactions and the reason would never reach the trigger
     (supabase/migrations/0010). They go through the SESSION client so the
     functions see the caller's role. */

  async setReservationStatus({ id, status, reason }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('set_reservation_status', { p_id: id, p_status: status, p_reason: reason || null });
    if (error) fail(error);
    return data;
  },

  async assignReservationUnit({ id, unitId, reason }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('assign_reservation_unit', { p_id: id, p_unit: unitId || null, p_reason: reason || null });
    if (error) fail(error);
    return data;
  },

  async moveReservation({ id, startAt, endAt, reason }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('move_reservation', { p_id: id, p_start: startAt, p_end: endAt, p_reason: reason || null });
    if (error) fail(error);
    return data;
  },

  async overrideReservationPrice({ id, total, reason }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('override_reservation_price', { p_id: id, p_total: total, p_reason: reason });
    if (error) fail(error);
    return data;
  },

  async unitsFreeForReservation(id) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('units_free_for_reservation', { p_id: id });
    if (error) fail(error);
    return (data || []).map(rowToModel);
  },

  async getCalendar({ from, to }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('calendar_rows', { p_from: from, p_to: to });
    if (error) fail(error);
    return data || { units: [], reservations: [], blocks: [] };
  },

  /* ---------------------------------------------------------------- customers
     Profile, duplicates and the merge are RPCs (supabase/migrations/0011) for
     the same reason the reservation operations are: the totals must be one
     answer from one snapshot, and the merge has to move reservations and drop
     a row inside a single transaction that carries the operator's reason. */

  async getCustomerProfile(id) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('customer_profile', { p_id: id });
    if (error) fail(error);
    return data || null;
  },

  async listCustomerDuplicates() {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('customer_duplicates');
    if (error) fail(error);
    return data || [];
  },

  async mergeCustomers({ keepId, dropId, reason }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('merge_customers', { p_keep: keepId, p_drop: dropId, p_reason: reason });
    if (error) fail(error);
    return data;
  },

  async setCustomerNotes({ id, notes }) {
    const sb = await writeClient();
    const { data, error } = await sb.rpc('set_customer_notes', { p_id: id, p_notes: notes ?? null });
    if (error) fail(error);
    return data;
  },

  /* ------------------------------------------------------------------ fleet */

  /* Public read on purpose: the fleet page renders these to anonymous
     visitors, and there is nothing private in a photo of a car for hire. */
  async listVehiclePhotos({ vehicleId } = {}) {
    return selectAll('vehicle_photos', (q) => {
      let b = q.order('sort').order('created_at');
      if (vehicleId) b = b.eq('vehicle_id', vehicleId);
      return b;
    });
  },
  async saveVehiclePhoto(data) {
    return rpcRow('save_vehicle_photo', { p: data }, 'photo');
  },
  async deleteVehiclePhoto(id) {
    return rpcOutcome('delete_vehicle_photo', { p_id: id });
  },
  async reorderVehiclePhotos({ vehicleId, ids }) {
    return rpcOutcome('reorder_vehicle_photos', { p_vehicle: vehicleId, p_ids: ids });
  },
  async setUnitStatus({ unitId, status, reason }) {
    return rpcOutcome('set_unit_status', { p_unit: unitId, p_status: status, p_reason: reason || '' });
  },
  async getUnitDossier(id) {
    return rpcOutcome('unit_dossier', { p_unit: id });
  },

  /* -------------------------------------------------------------- operations */

  /* Day-by-day availability for ONE car, for the booking calendar. Public:
     it answers "how many of this model are free that day" and nothing else. */
  async getVehicleCalendar({ vehicleId, from, to }) {
    const sb = await readClient();
    const { data, error } = await sb.rpc('vehicle_availability_days', { p_vehicle: vehicleId, p_from: from, p_to: to });
    if (error) fail(error);
    return data;
  },

  async getOperationsDay(day) {
    return rpcOutcome('operations_day', { p_day: day });
  },
  async completePickup({ id, payload }) {
    return rpcOutcome('complete_pickup', { p_id: id, p: payload });
  },
  async completeReturn({ id, payload }) {
    return rpcOutcome('complete_return', { p_id: id, p: payload });
  },
  async markUnitReady({ unitId, reason }) {
    return rpcOutcome('mark_unit_ready', { p_unit: unitId, p_reason: reason || null });
  },

  /* ------------------------------------------------------------ observability */

  async getSystemMetrics() {
    return rpcOutcome('system_metrics', {});
  },

  /* Swept by the CRON_SECRET routes, exactly like expireHolds: the service
     client is the only one these two RPCs are granted to. */
  async expireUnconfirmedReservations() {
    const sb = createServiceClient();
    if (!sb) return { ok: false, error: 'NO_SERVICE_KEY' };
    const { data, error } = await sb.rpc('expire_unconfirmed_reservations');
    if (error) fail(error);
    return data;
  },
  async refreshCleaningBlocks() {
    const sb = createServiceClient();
    if (!sb) return { ok: false, error: 'NO_SERVICE_KEY' };
    const { data, error } = await sb.rpc('refresh_cleaning_blocks');
    if (error) fail(error);
    return { ok: true, refreshed: data ?? 0 };
  },

  async listAuditLog({ table, rowId, actorId, since, until, limit = 100 } = {}) {
    return selectAllAsStaff('audit_log', (q) => {
      let b = q.order('at', { ascending: false }).limit(limit);
      if (table) b = b.eq('table_name', table);
      /* row_key carries the text pk for the tables that are NOT uuid-keyed
         (settings.id is an int), so match whichever column can hold this key
         — supabase/migrations/0003. The uuid test is not cosmetic: `.or()`
         takes a raw PostgREST filter string, so an unvalidated value would be
         injected into the query, and a non-uuid compared against row_id would
         fail the request outright. */
      if (rowId) {
        b = UUID_RE.test(String(rowId)) ? b.or(`row_id.eq.${rowId},row_key.eq.${rowId}`) : b.eq('row_key', String(rowId));
      }
      if (actorId) b = b.eq('actor_id', actorId);
      if (since) b = b.gte('at', since);
      if (until) b = b.lte('at', until);
      return b;
    });
  },

  async markNotificationRead(id) {
    const sb = await writeClient();
    const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) fail(error);
    return true;
  },

  /* One round trip for the dashboard strip. Counts only — no rows — so the
     numbers cost almost nothing even as the fleet grows. */
  async getFleetSnapshot() {
    const sb = await writeClient();
    const [units, reservations, notifications] = await Promise.all([
      sb.from('units').select('status'),
      sb.from('reservations').select('status,start_at,end_at'),
      sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    if (units.error) fail(units.error);
    if (reservations.error) fail(reservations.error);
    return summarise(units.data || [], reservations.data || [], notifications.count || 0);
  },

  async listNotifications({ unreadOnly = false, limit = 50 } = {}) {
    return selectAllAsStaff('notifications', (q) => {
      let b = q.order('created_at', { ascending: false }).limit(limit);
      if (unreadOnly) b = b.is('read_at', null);
      return b;
    });
  },
  /* Written through the SERVICE client: the booking action runs for an
     anonymous visitor, and `notifications` is staff-only under RLS. The row
     carries no customer data — a reference and a link — so it is safe to
     create from an unauthenticated path. */
  async createNotification(data) {
    const sb = createServiceClient();
    if (!sb) return null;
    const { data: row, error } = await sb.from('notifications').insert(modelToRow(data)).select().single();
    if (error) fail(error);
    return rowToModel(row);
  },

  /* Sweeper. `expire_holds` is granted to service_role only, so this needs the
     service client — the anon key would be refused, which is the point. */
  async expireHolds() {
    const sb = createServiceClient();
    if (!sb) throw new Error('[supabase] SUPABASE_SERVICE_ROLE_KEY is not set — the hold sweeper cannot run');
    const { data, error } = await sb.rpc('expire_holds');
    if (error) fail(error);
    return Number(data) || 0;
  },

  async listEvents({ unitId, reservationId, limit = 50 } = {}) {
    return selectAllAsStaff('vehicle_events', (q) => {
      let b = q.order('at', { ascending: false }).limit(limit);
      if (unitId) b = b.eq('unit_id', unitId);
      if (reservationId) b = b.eq('reservation_id', reservationId);
      return b;
    });
  },
  async createEvent(data) {
    return upsert('vehicle_events', data);
  },

  async getStats() {
    const sb = await writeClient();
    const month = new Date().toISOString().slice(0, 7);
    const [{ data: bookings }, { count: fleetTotal }, { count: fleetPublished }] = await Promise.all([
      sb.from('bookings').select('status,total_mad,created_at'),
      sb.from('vehicles').select('id', { count: 'exact', head: true }),
      sb.from('vehicles').select('id', { count: 'exact', head: true }).eq('published', true),
    ]);
    const list = bookings || [];
    const monthBookings = list.filter((b) => b.created_at?.startsWith(month) && b.status !== 'cancelled');
    return {
      monthBookings: monthBookings.length,
      revenueMad: monthBookings.reduce((s, b) => s + (b.total_mad || 0), 0),
      pending: list.filter((b) => b.status === 'pending').length,
      active: list.filter((b) => ['confirmed', 'active'].includes(b.status)).length,
      fleetPublished: fleetPublished || 0,
      fleetTotal: fleetTotal || 0,
    };
  },
};
