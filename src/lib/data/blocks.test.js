/**
 * Unavailability periods in demo mode (rule 12), written from
 * supabase/migrations/0014_safe_unavailability.sql.
 *
 * What these pin, each one a way a car could have been sold twice or a period
 * lost before 0014:
 *   - a block never takes the last car a booking without a plate relies on;
 *   - a block never lands on a booking of that car, pending included;
 *   - a block on a car already off the site changes no count;
 *   - a block is compared as stored, never widened by the prep buffer;
 *   - « Marquer prête » closes only the period running now;
 *   - giving dates back takes a reason.
 */

import test, { beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';

import { demoAdapter } from './demo-adapter.js';
import { freeUnits } from './demo-availability.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
/* Ten days ahead, on a Casablanca midnight, so nothing here is "in the past". */
const D0 = Math.floor((Date.now() + 10 * DAY) / DAY) * DAY - HOUR;
const iso = (t) => new Date(t).toISOString();

let store;

beforeEach(() => {
  store = {
    vehicles: [
      { id: 'v1', slug: 'logan', brand: 'Dacia', model: 'Logan', prepBufferMinutes: 120, minDays: 1, published: true },
      { id: 'v2', slug: 'accent', brand: 'Hyundai', model: 'Accent', prepBufferMinutes: 120, minDays: 1, published: true },
    ],
    units: [
      { id: 'u1', vehicleId: 'v1', plate: 'A-1', status: 'available' },
      { id: 'u2', vehicleId: 'v1', plate: 'A-2', status: 'available' },
      { id: 'u3', vehicleId: 'v2', plate: 'B-1', status: 'available' },
    ],
    reservations: [],
    blocks: [],
    holds: [],
    customers: [],
    events: [],
    notifications: [],
    settings: { cleaningMinutes: 120 },
  };
  globalThis.__diabcarStore = store;
});

const reservation = (over) => ({
  id: `r-${Math.random().toString(36).slice(2, 8)}`,
  reference: 'DC-TEST-0001',
  vehicleId: 'v1',
  unitId: null,
  status: 'pending',
  source: 'web',
  startAt: iso(D0 + 10 * HOUR),
  endAt: iso(D0 + DAY + 10 * HOUR),
  ...over,
});
const period = (over) => ({ unitId: 'u1', startAt: iso(D0 + 2 * HOUR), endAt: iso(D0 + DAY - 2 * HOUR), kind: 'other', reason: 'Réservation hors site — test', ...over });

describe('free units', () => {
  test('a block on a car already at the garage does not take a second car off the site', () => {
    store.units[1].status = 'maintenance';
    store.blocks.push({ id: 'b1', unitId: 'u2', kind: 'maintenance', startAt: iso(D0), endAt: iso(D0 + 5 * DAY) });
    assert.equal(freeUnits(store, 'v1', iso(D0 + DAY), iso(D0 + 2 * DAY)), 1, 'the working car is still for sale');
  });

  test('a block is compared as stored: pulled in by the buffer, it greys its own day only', () => {
    store.blocks.push({ id: 'b1', unitId: 'u1', kind: 'other', startAt: iso(D0 + 2 * HOUR), endAt: iso(D0 + DAY - 2 * HOUR) });
    const day = (n) => freeUnits(store, 'v1', iso(D0 + n * DAY), iso(D0 + (n + 1) * DAY));
    assert.deepEqual([day(-1), day(0), day(1)], [2, 1, 2]);
  });
});

describe('createBlock', () => {
  test('refuses a period with no reason, backwards, in the past, too long, or on an unknown car', async () => {
    assert.equal((await demoAdapter.createBlock(period({ reason: '  ' }))).error, 'REASON_REQUIRED');
    assert.equal((await demoAdapter.createBlock(period({ endAt: iso(D0) }))).error, 'BAD_DATES');
    assert.equal((await demoAdapter.createBlock(period({ startAt: iso(Date.now() - 3 * DAY), endAt: iso(Date.now() - DAY) }))).error, 'PAST');
    assert.equal((await demoAdapter.createBlock(period({ endAt: iso(D0 + 400 * DAY) }))).error, 'TOO_LONG');
    assert.equal((await demoAdapter.createBlock(period({ unitId: 'nope' }))).error, 'NOT_FOUND');
    assert.equal(store.blocks.length, 0);
  });

  test('refuses a period on a booking of this car — a pending one included — and names it', async () => {
    store.reservations.push(reservation({ unitId: 'u1', reference: 'DC-PEND-0001' }));
    const result = await demoAdapter.createBlock(period());
    assert.equal(result.error, 'CONFLICT');
    assert.equal(result.reference, 'DC-PEND-0001');
    assert.equal(result.status, 'pending');
  });

  test('a cancelled booking no longer stands in the way', async () => {
    store.reservations.push(reservation({ unitId: 'u1', status: 'cancelled' }));
    assert.equal((await demoAdapter.createBlock(period())).ok, true);
  });

  test('refuses to take the last car a booking without a plate relies on, and names that booking', async () => {
    store.units[1].status = 'out_of_service';
    store.reservations.push(reservation({ reference: 'DC-WEB-0001' }));
    const result = await demoAdapter.createBlock(period());
    assert.equal(result.error, 'CAPACITY');
    assert.equal(result.reference, 'DC-WEB-0001');
    assert.equal(result.source, 'web');
    assert.equal(store.blocks.length, 0);
  });

  test('with a second car free, the same period is accepted — and the one after it is refused', async () => {
    store.reservations.push(reservation());
    const first = await demoAdapter.createBlock(period({ unitId: 'u1' }));
    assert.equal(first.ok, true);
    assert.equal(first.block.unitId, 'u1');
    const second = await demoAdapter.createBlock(period({ unitId: 'u2' }));
    assert.equal(second.error, 'CAPACITY', 'blocking both cars would leave the web request with none');
  });

  test('a booking waiting for a plate on another day does not matter', async () => {
    store.units[1].status = 'out_of_service';
    store.reservations.push(reservation({ startAt: iso(D0 + 5 * DAY), endAt: iso(D0 + 6 * DAY) }));
    assert.equal((await demoAdapter.createBlock(period())).ok, true);
  });

  test('a car already off the site can always get its period: no count changes', async () => {
    store.units[0].status = 'maintenance';
    store.units[1].status = 'out_of_service';
    store.reservations.push(reservation());
    assert.equal((await demoAdapter.createBlock(period({ kind: 'maintenance', reason: 'garage' }))).ok, true);
  });

  test('refuses a period overlapping another period of the same car, and says which', async () => {
    store.blocks.push({ id: 'b1', unitId: 'u1', kind: 'cleaning', startAt: iso(D0 + 8 * HOUR), endAt: iso(D0 + 10 * HOUR) });
    const result = await demoAdapter.createBlock(period());
    assert.equal(result.error, 'BLOCK_OVERLAP');
    assert.equal(result.kind, 'cleaning');
    assert.equal((await demoAdapter.createBlock(period({ unitId: 'u2' }))).ok, true, 'the other car is free to block');
  });
});

describe('deleteBlock', () => {
  test('takes a reason, or nothing happens', async () => {
    store.blocks.push({ id: 'b1', unitId: 'u1', kind: 'other', startAt: iso(D0), endAt: iso(D0 + DAY) });
    assert.equal((await demoAdapter.deleteBlock('b1', ' ')).error, 'REASON_REQUIRED');
    assert.equal(store.blocks.length, 1);
    assert.equal((await demoAdapter.deleteBlock('nope', 'x')).error, 'NOT_FOUND');
    assert.equal((await demoAdapter.deleteBlock('b1', 'client a annulé')).ok, true);
    assert.equal(store.blocks.length, 0);
  });
});

describe('markUnitReady', () => {
  test('closes the cleaning running now and keeps a transfer planned for later', async () => {
    store.units[0].status = 'cleaning';
    store.blocks.push(
      { id: 'now', unitId: 'u1', kind: 'cleaning', startAt: iso(Date.now() - HOUR), endAt: iso(Date.now() + HOUR) },
      { id: 'later', unitId: 'u1', kind: 'transfer', startAt: iso(D0), endAt: iso(D0 + 2 * DAY) },
    );
    const result = await demoAdapter.markUnitReady({ unitId: 'u1', reason: 'prête' });
    assert.equal(result.ok, true);
    assert.equal(result.blocksClosed, 1);
    assert.deepEqual(store.blocks.map((b) => b.id), ['later']);
  });

  test('the cleaning safety net ignores a future cleaning period and skips a car whose window is taken', async () => {
    store.units[0].status = 'cleaning';
    store.blocks.push({ id: 'later', unitId: 'u1', kind: 'cleaning', startAt: iso(D0), endAt: iso(D0 + DAY) });
    const first = await demoAdapter.refreshCleaningBlocks();
    assert.equal(first.refreshed, 1, 'a period next week is not the cleaning running now');
    const again = await demoAdapter.refreshCleaningBlocks();
    assert.equal(again.refreshed, 0, 'now there is one');
  });
});

describe('windowed reads', () => {
  test('listBlocks keeps these units and this window; listReservations these states and this window', async () => {
    store.blocks.push(
      { id: 'in', unitId: 'u1', startAt: iso(D0), endAt: iso(D0 + DAY) },
      { id: 'other-unit', unitId: 'u3', startAt: iso(D0), endAt: iso(D0 + DAY) },
      { id: 'too-late', unitId: 'u2', startAt: iso(D0 + 30 * DAY), endAt: iso(D0 + 31 * DAY) },
    );
    const blocks = await demoAdapter.listBlocks({ unitIds: ['u1', 'u2'], from: iso(D0 - DAY), to: iso(D0 + 5 * DAY) });
    assert.deepEqual(blocks.map((b) => b.id), ['in']);
    assert.deepEqual(await demoAdapter.listBlocks({ unitIds: [] }), []);

    store.reservations.push(reservation({ id: 'live' }), reservation({ id: 'gone', status: 'cancelled' }), reservation({ id: 'far', startAt: iso(D0 + 40 * DAY), endAt: iso(D0 + 41 * DAY) }));
    const rows = await demoAdapter.listReservations({ vehicleId: 'v1', statuses: ['pending', 'confirmed'], from: iso(D0 - DAY), to: iso(D0 + 5 * DAY) });
    assert.deepEqual(rows.map((r) => r.id), ['live']);
  });
});
