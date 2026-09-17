/* ------------------------------------------------------------------ */
/* Test helper: book a car out for a window, so the UI's sold-out path  */
/* can be exercised against real data rather than a mock.               */
/*                                                                     */
/* Needs SUPABASE_SERVICE_ROLE_KEY. Without it every function returns   */
/* null and the calling test skips — a sold-out assertion that silently */
/* passed against an available car would be worse than no test.         */
/* CommonJS: package.json has no "type": "module".                      */
/* ------------------------------------------------------------------ */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** Same six-line reader the seed and the concurrency script use. */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}
loadEnvLocal();

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when these helpers can actually talk to a database. */
const available = Boolean(URL_ && KEY);

const TEST_EMAIL = 'e2e-soldout@example.invalid';
/* Every fake customer any e2e test creates matches this, including the ones the
   browser creates through the funnel form. Cleaning on the exact address only
   left those behind, and a stray reservation quietly eats a unit in later runs. */
const TEST_EMAIL_LIKE = 'e2e-%@example.invalid';

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** The availability table for a window, straight from the RPC. */
async function searchAvailability(startAt, endAt) {
  if (!available) return [];
  return rpc('search_availability', {
    p_pickup_location_id: null,
    p_dropoff_location_id: null,
    p_start_at: startAt,
    p_end_at: endAt,
  });
}

/** Take a 10-minute hold, exactly as the funnel does. */
async function createHold(vehicleId, startAt, endAt, sessionToken) {
  if (!available) return { ok: false };
  return rpc('create_hold', { p_vehicle_id: vehicleId, p_start_at: startAt, p_end_at: endAt, p_session_token: sessionToken });
}

/** Attempt a booking and RETURN the outcome instead of throwing on SOLD_OUT. */
async function tryBook(vehicleId, startAt, endAt, phone) {
  if (!available) return { ok: false };
  return rpc('create_reservation', {
    payload: {
      vehicleId,
      startAt,
      endAt,
      source: 'web',
      locale: 'fr',
      customer: { firstName: 'E2E', lastName: 'Race', phone, email: TEST_EMAIL, locale: 'fr' },
      quote: { test: true },
    },
  });
}

/**
 * Fill free units of one model for a window.
 * @param {number} [count] how many to take; defaults to all of them
 * @returns {Promise<number>} how many reservations were created
 */
async function bookOut(slug, startAt, endAt, count) {
  if (!available) return 0;

  const rows = await searchAvailability(startAt, endAt);
  const row = rows.find((r) => r.slug === slug);
  if (!row) throw new Error(`no vehicle ${slug} in search_availability`);

  const take = count === undefined ? row.units_free : Math.min(count, row.units_free);
  let made = 0;
  for (let i = 0; i < take; i += 1) {
    const out = await rpc('create_reservation', {
      payload: {
        vehicleId: row.vehicle_id,
        startAt,
        endAt,
        source: 'web',
        locale: 'fr',
        customer: { firstName: 'E2E', lastName: `SoldOut ${i}`, phone: `+2126990000${String(i).padStart(2, '0')}`, email: TEST_EMAIL, locale: 'fr' },
        quote: { test: true },
      },
    });
    if (!out?.ok) throw new Error(`create_reservation refused: ${JSON.stringify(out)}`);
    made += 1;
  }
  return made;
}

/** Remove everything bookOut created, by the marker e-mail. */
async function cleanup() {
  if (!available) return;
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const res = await fetch(`${URL_}/rest/v1/customers?email=like.${encodeURIComponent(TEST_EMAIL_LIKE)}&select=id`, { headers });
  const customers = res.ok ? await res.json() : [];
  for (const c of customers) {
    /* Reservations first: customer_id is ON DELETE SET NULL, and an orphaned
       row would look like a real anonymous booking in the admin. */
    await fetch(`${URL_}/rest/v1/reservations?customer_id=eq.${c.id}`, { method: 'DELETE', headers });
  }
  await fetch(`${URL_}/rest/v1/customers?email=like.${encodeURIComponent(TEST_EMAIL_LIKE)}`, { method: 'DELETE', headers });

  /* Holds too: a 10-minute claim left behind would quietly reduce availability
     for the next run, and the failure would look like a bug in the engine. */
  await fetch(`${URL_}/rest/v1/holds?session_token=like.e2e-*`, { method: 'DELETE', headers });

  /* Unavailability periods a spec created, by the E2E- marker every spec puts
     in the reason. A run killed between creating one and its own cleanup
     would otherwise hide a real car from the website for days. */
  await fetch(`${URL_}/rest/v1/blocks?reason=like.${encodeURIComponent('%E2E-%')}`, { method: 'DELETE', headers });

  /* Notifications whose reservation no longer exists. The booking action
     writes one per reservation, so deleting the reservations above leaves
     rows pointing at nothing — junk in the owner's admin bell whether a test
     made them or not. Matched by the id in the href rather than by text,
     because the text is indistinguishable from a real booking's. */
  const notesRes = await fetch(`${URL_}/rest/v1/notifications?select=id,href`, { headers });
  const notes = notesRes.ok ? await notesRes.json() : [];
  const orphans = [];
  for (const n of notes) {
    /* Both shapes: the booking action once wrote "/admin/reservations/<id>"
       and the 0009 trigger writes the host-agnostic "/reservations/<id>".
       Matching only the first left 16 orphans behind. */
    const id = String(n.href || '').match(/\/reservations\/([0-9a-f-]{36})/)?.[1];
    if (!id) continue;
    const check = await fetch(`${URL_}/rest/v1/reservations?id=eq.${id}&select=id`, { headers });
    const found = check.ok ? await check.json() : [];
    if (found.length === 0) orphans.push(n.id);
  }
  if (orphans.length) {
    await fetch(`${URL_}/rest/v1/notifications?id=in.(${orphans.join(',')})`, { method: 'DELETE', headers });
  }
}

/* ------------------------------------------------------------------ */
/* Prompt 11 helpers: units, and reservations pinned to one of them.   */
/* These write with the SERVICE ROLE, which bypasses RLS but NOT the   */
/* exclusion constraint — so a fixture that would double-book a unit   */
/* fails loudly here instead of silently making a test meaningless.    */
/* ------------------------------------------------------------------ */

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

async function get(pathAndQuery) {
  const res = await fetch(`${URL_}/rest/v1/${pathAndQuery}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${pathAndQuery} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Units of one model, bookable ones first. */
async function unitsOf(vehicleId) {
  if (!available) return [];
  return get(`units?vehicle_id=eq.${vehicleId}&select=id,plate,status&order=plate`);
}

/** Pin a reservation to a unit. Refused by Postgres if that unit is taken. */
async function setUnit(reservationId, unitId) {
  if (!available) return null;
  const res = await fetch(`${URL_}/rest/v1/reservations?id=eq.${reservationId}`, {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify({ unit_id: unitId }),
  });
  if (!res.ok) throw new Error(`assign unit -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json())[0] || null;
}

/** One reservation as the database currently has it — the revert oracle. */
async function reservationById(id) {
  if (!available) return null;
  const rows = await get(`reservations?id=eq.${id}&select=id,reference,start_at,end_at,unit_id,status`);
  return rows[0] || null;
}

/** create_reservation, returning the row it made. */
async function makeReservation({ vehicleId, startAt, endAt, phone, lastName = 'Calendar' }) {
  if (!available) return null;
  const out = await rpc('create_reservation', {
    payload: {
      vehicleId,
      startAt,
      endAt,
      source: 'web',
      locale: 'fr',
      customer: { firstName: 'E2E', lastName, phone, email: TEST_EMAIL, locale: 'fr' },
      quote: { test: true, total: 1000 },
    },
  });
  if (!out?.ok) throw new Error(`create_reservation refused: ${JSON.stringify(out)}`);
  return out.reservation;
}

/** What the database would offer instead of a sold-out car. */
async function alternativesFor(vehicleId, startAt, endAt) {
  if (!available) return [];
  return rpc('availability_alternatives', {
    p_vehicle_id: vehicleId,
    p_start_at: startAt,
    p_end_at: endAt,
    p_limit: 3,
  });
}

/**
 * A model worth booking out: free for the window, and with at least one OTHER
 * free model in its category, so the sold-out answer can actually carry the
 * alternatives the test is there to check.
 */
async function pickModelWithAlternatives(startAt, endAt) {
  if (!available) return null;
  const rows = await searchAvailability(startAt, endAt);
  const free = rows.filter((r) => r.units_free > 0);
  for (const row of free) {
    const alts = await alternativesFor(row.vehicle_id, startAt, endAt);
    if (Array.isArray(alts) && alts.length > 0) {
      return { slug: row.slug, vehicleId: row.vehicle_id, unitsFree: row.units_free, alternatives: alts };
    }
  }
  return null;
}

/** One unit as the database has it — the oracle for the cleaning loop. */
async function unitById(id) {
  if (!available) return null;
  const rows = await get(`units?id=eq.${id}&select=id,plate,status,mileage_km,fuel_pct,vehicle_id`);
  return rows[0] || null;
}

/** Live blocks on a unit — what actually keeps a car off sale. */
async function blocksFor(unitId) {
  if (!available) return [];
  return get(`blocks?unit_id=eq.${unitId}&select=id,kind,period,reason`);
}

/** How many units of one model are free for a window, straight from the RPC. */
async function freeUnits(slug, startAt, endAt) {
  if (!available) return 0;
  const rows = await searchAvailability(startAt, endAt);
  return rows.find((r) => r.slug === slug)?.units_free ?? 0;
}

/** Put a reservation into a given status without going through the UI. */
async function setStatus(reservationId, status) {
  if (!available) return null;
  const res = await fetch(`${URL_}/rest/v1/reservations?id=eq.${reservationId}`, {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`set status -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json())[0] || null;
}

/** The reservation the funnel just made, found by the reference it showed. */
async function reservationByReference(reference) {
  if (!available) return null;
  const rows = await get(`reservations?reference=eq.${encodeURIComponent(reference)}&select=id,reference,start_at,end_at,unit_id,status,vehicle_id`);
  return rows[0] || null;
}

/**
 * Put a unit back where a failed loop test left it: available, no cleaning
 * block. Without this a red test leaves a car off sale for two hours.
 */
async function resetUnit(unitId) {
  if (!available || !unitId) return;
  await fetch(`${URL_}/rest/v1/blocks?unit_id=eq.${unitId}&kind=eq.cleaning`, { method: 'DELETE', headers: headers() });
  await fetch(`${URL_}/rest/v1/units?id=eq.${unitId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ status: 'available' }),
  });
}

module.exports = {
  available,
  bookOut,
  cleanup,
  searchAvailability,
  createHold,
  tryBook,
  unitsOf,
  setUnit,
  reservationById,
  makeReservation,
  alternativesFor,
  pickModelWithAlternatives,
  unitById,
  blocksFor,
  freeUnits,
  setStatus,
  reservationByReference,
  resetUnit,
};
