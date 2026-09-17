/**
 * The model's availability timeline: the window it draws, what lands on a
 * unit's row, and what "unavailable from–to" turns into.
 *
 * The rules these pin: a period greys exactly the Casablanca days the owner
 * typed on the website (inclusive, pulled in by the prep buffer), a cancelled
 * booking disappears from the row — the owner's "auto unavailable, except if I
 * cancel" — overlapping bars never hide each other, and every refusal from the
 * database becomes a sentence.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DAYS,
  MAX_BLOCK_DAYS,
  OFFSITE_PREFIX,
  addDays,
  blockLabel,
  blockRefusalMessage,
  bookingLinkDates,
  dayLabel,
  inclusiveDays,
  isOffsite,
  periodLabel,
  segmentsForUnit,
  timelineWindow,
  unassignedSegments,
  unavailableDraftProblem,
  unavailableRequests,
  unavailableSummary,
  withLanes,
} from './availability-timeline.js';

/* 2026-09-16 12:00 in Casablanca (+01:00). */
const NOW = '2026-09-16T11:00:00.000Z';

describe('timelineWindow', () => {
  test('starts at today 00:00 Casablanca and runs the default six weeks, one slot per day', () => {
    const win = timelineWindow({ nowIso: NOW });
    assert.equal(win.today, '2026-09-16');
    assert.equal(win.from, '2026-09-15T23:00:00.000Z', 'midnight Casablanca is 23:00 UTC the day before');
    assert.equal(win.days, DEFAULT_DAYS);
    assert.equal(win.slots.length, DEFAULT_DAYS);
    assert.equal(win.slots[0].day, '2026-09-16');
    assert.equal(win.slots[0].today, true);
    assert.equal(win.slots[1].today, false);
    assert.equal(win.slots[DEFAULT_DAYS - 1].day, '2026-10-27');
  });

  test('labels the first slot and every first of a month with the month, weekends flagged, Casablanca weekday', () => {
    const win = timelineWindow({ nowIso: NOW, days: 20 });
    assert.match(win.slots[0].monthLabel, /septembre 2026/);
    const oct = win.slots.find((s) => s.day === '2026-10-01');
    assert.match(oct.monthLabel, /octobre 2026/);
    assert.equal(win.slots[1].monthLabel, null);
    /* 2026-09-19 is a Saturday, 20 a Sunday. */
    assert.equal(win.slots.find((s) => s.day === '2026-09-19').weekend, true);
    assert.equal(win.slots.find((s) => s.day === '2026-09-19').weekday, 'S');
    assert.equal(win.slots.find((s) => s.day === '2026-09-21').weekend, false);
  });

  test('an anchor moves the window; a silly day count is clamped, an absent one is the default', () => {
    const win = timelineWindow({ nowIso: NOW, anchor: '2026-12-01', days: 9999 });
    assert.equal(win.slots[0].day, '2026-12-01');
    assert.equal(win.days, 120);
    assert.equal(timelineWindow({ nowIso: NOW, days: -5 }).days, 1);
    assert.equal(timelineWindow({ nowIso: NOW, days: 0 }).days, DEFAULT_DAYS, '0 means "not given"');
    assert.equal(timelineWindow({ nowIso: NOW, days: 'abc' }).days, DEFAULT_DAYS);
  });

  test('month labels follow the fixed +01:00 days, even during Ramadan (tzdata puts Casablanca on +00 then)', () => {
    const win = timelineWindow({ nowIso: '2027-02-20T11:00:00.000Z', days: 20 });
    const march = win.slots.find((s) => s.day === '2027-03-01');
    assert.match(march.monthLabel, /mars 2027/);
    assert.equal(dayLabel('2027-02-20').startsWith('20 '), true, dayLabel('2027-02-20'));
  });
});

const win = { from: '2026-09-15T23:00:00.000Z', to: '2026-09-25T23:00:00.000Z' };
const r = (over) => ({ id: 'r1', unitId: 'u1', status: 'confirmed', reference: 'DC-260916-AAAA', startAt: '2026-09-18T09:00:00.000Z', endAt: '2026-09-20T09:00:00.000Z', source: 'web', ...over });
const b = (over) => ({ id: 'b1', unitId: 'u1', kind: 'maintenance', reason: 'Vidange', startAt: '2026-09-21T23:00:00.000Z', endAt: '2026-09-22T23:00:00.000Z', ...over });

describe('segmentsForUnit', () => {
  test('places this unit’s bookings and blocks, sorted by start, as percentages of the window', () => {
    const segs = segmentsForUnit({ unitId: 'u1', reservations: [r()], blocks: [b()], win });
    assert.deepEqual(segs.map((s) => [s.kind, s.id]), [['reservation', 'r1'], ['block', 'b1']]);
    assert.ok(segs[0].leftPct > 0 && segs[0].widthPct > 0 && segs[0].leftPct + segs[0].widthPct <= 100);
    assert.equal(segs[0].reference, 'DC-260916-AAAA');
    assert.equal(segs[1].reason, 'Vidange');
  });

  test('carries the customer name the page sends, so the panel can say who booked', () => {
    const [seg] = segmentsForUnit({ unitId: 'u1', reservations: [r({ customer: 'Karim El Fassi' })], blocks: [], win });
    assert.equal(seg.customer, 'Karim El Fassi');
    const [none] = segmentsForUnit({ unitId: 'u1', reservations: [r()], blocks: [], win });
    assert.equal(none.customer, '');
  });

  test('a cancelled booking is gone from the row — the owner’s "except if I cancel"', () => {
    for (const status of ['cancelled', 'no_show', 'closed', 'returned']) {
      assert.equal(segmentsForUnit({ unitId: 'u1', reservations: [r({ status })], blocks: [], win }).length, 0, status);
    }
    for (const status of ['pending', 'confirmed', 'ready', 'active']) {
      assert.equal(segmentsForUnit({ unitId: 'u1', reservations: [r({ status })], blocks: [], win }).length, 1, status);
    }
  });

  test('another unit’s rows and anything outside the window are ignored', () => {
    const segs = segmentsForUnit({ unitId: 'u1', reservations: [r({ unitId: 'u2' }), r({ id: 'r-past', startAt: '2026-08-01T09:00:00.000Z', endAt: '2026-08-03T09:00:00.000Z' })], blocks: [b({ unitId: 'u2' })], win });
    assert.equal(segs.length, 0);
  });

  test('a block with no end runs to the window’s edge', () => {
    const [seg] = segmentsForUnit({ unitId: 'u1', reservations: [], blocks: [b({ endAt: null })], win });
    assert.equal(seg.clippedEnd, false);
    assert.ok(Math.abs(seg.leftPct + seg.widthPct - 100) < 0.001);
    assert.equal(seg.endAt, null);
  });

  test('website bookings without a plate yet are drawn in the unassigned row, never on a unit', () => {
    const pending = r({ id: 'r-web', unitId: null, status: 'pending' });
    assert.equal(segmentsForUnit({ unitId: 'u1', reservations: [pending], blocks: [], win }).length, 0);
    const [seg] = unassignedSegments({ reservations: [pending], win });
    assert.equal(seg.id, 'r-web');
    assert.equal(seg.status, 'pending');
  });
});

describe('withLanes', () => {
  test('overlapping bars get their own lane; a bar after the first ended reuses lane 0', () => {
    const a = r({ id: 'a', unitId: null, startAt: '2026-09-18T09:00:00.000Z', endAt: '2026-09-20T09:00:00.000Z' });
    const b2 = r({ id: 'b', unitId: null, startAt: '2026-09-19T09:00:00.000Z', endAt: '2026-09-21T09:00:00.000Z' });
    const c = r({ id: 'c', unitId: null, startAt: '2026-09-20T09:00:00.000Z', endAt: '2026-09-22T09:00:00.000Z' });
    const { segments, lanes } = withLanes(unassignedSegments({ reservations: [c, a, b2], win }));
    assert.deepEqual(segments.map((s) => [s.id, s.lane]), [['a', 0], ['b', 1], ['c', 0]]);
    assert.equal(lanes, 2);
  });

  test('an empty row still has one lane; an open-ended block keeps its lane forever', () => {
    assert.equal(withLanes([]).lanes, 1);
    const open = { id: 'o', startAt: '2026-09-18T00:00:00.000Z', endAt: null };
    const later = { id: 'l', startAt: '2026-10-18T00:00:00.000Z', endAt: '2026-10-19T00:00:00.000Z' };
    assert.deepEqual(withLanes([open, later]).segments.map((s) => s.lane), [0, 1]);
  });
});

describe('inclusive days', () => {
  test('a buffered period and a midnight period both read as the days the owner typed', () => {
    assert.deepEqual(inclusiveDays('2026-09-20T01:00:00.000Z', '2026-09-22T21:00:00.000Z'), { from: '2026-09-20', to: '2026-09-22' });
    assert.deepEqual(inclusiveDays('2026-09-19T23:00:00.000Z', '2026-09-22T23:00:00.000Z'), { from: '2026-09-20', to: '2026-09-22' });
    assert.equal(inclusiveDays('2026-09-19T23:00:00.000Z', null).to, null);
    assert.match(periodLabel('2026-09-19T23:00:00.000Z', '2026-09-22T23:00:00.000Z'), /^du 20 .* au 22 /);
    assert.match(periodLabel('2026-09-20T01:00:00.000Z', '2026-09-20T21:00:00.000Z'), /^le 20 /);
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  });

  test('the real-booking link returns the car the day after the last inclusive day', () => {
    assert.deepEqual(bookingLinkDates({ from: '2026-09-20', to: '2026-09-22' }), { from: '2026-09-20', to: '2026-09-23' });
    assert.deepEqual(bookingLinkDates({ from: '2026-09-20', to: '2026-09-20' }), { from: '2026-09-20', to: '2026-09-21' });
    assert.equal(bookingLinkDates({ from: '2026-09-22', to: '2026-09-20' }), null);
    assert.equal(bookingLinkDates({ from: '', to: '2026-09-20' }), null);
  });
});

describe('unavailableDraftProblem', () => {
  const ok = { from: '2026-09-20', to: '2026-09-22', unitIds: ['u1'], reason: 'Client au téléphone', today: '2026-09-16' };

  test('a complete draft passes', () => {
    assert.equal(unavailableDraftProblem(ok), null);
    assert.equal(unavailableDraftProblem({ ...ok, to: ok.from }), null, 'a single day is fine');
  });

  test('each missing or impossible part is named', () => {
    assert.match(unavailableDraftProblem({ ...ok, from: '' }), /date de début/);
    assert.match(unavailableDraftProblem({ ...ok, to: '2026-09-19' }), /après la date de début/);
    assert.match(unavailableDraftProblem({ ...ok, from: '2026-09-01', to: '2026-09-10' }), /déjà passée/);
    assert.match(unavailableDraftProblem({ ...ok, unitIds: [] }), /unité/);
    assert.match(unavailableDraftProblem({ ...ok, reason: '   ' }), /motif/);
    /* 365 days is the longest allowed; 367 is refused. */
    assert.equal(unavailableDraftProblem({ ...ok, to: '2027-09-20' }), null);
    assert.match(unavailableDraftProblem({ ...ok, to: '2027-09-22' }), new RegExp(String(MAX_BLOCK_DAYS)));
  });
});

describe('unavailableRequests', () => {
  test('one block per unit, the inclusive days pulled in by the prep buffer (default 120 min)', () => {
    const rows = unavailableRequests({ unitIds: ['u1', 'u2'], from: '2026-09-20', to: '2026-09-22', choice: 'maintenance', reason: 'Vidange' });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((x) => x.unitId), ['u1', 'u2']);
    assert.equal(rows[0].startAt, '2026-09-20T01:00:00.000Z', '02:00 Casablanca on the 20th');
    assert.equal(rows[0].endAt, '2026-09-22T21:00:00.000Z', '22:00 Casablanca on the 22nd: the 22nd is included, the 23rd is not');
    assert.equal(rows[0].kind, 'maintenance');
    assert.equal(rows[0].reason, 'Vidange');
  });

  test('greys exactly the typed days on the public calendar: each day is asked widened by the same buffer', () => {
    /* vehicle_availability_days (0013) asks free_units() for [day 00:00, day+1 00:00)
       widened by the buffer on both sides (booking_window, 0008). A half-open overlap
       with the stored block decides whether the day is greyed. */
    const buffer = 120 * 60000;
    const [row] = unavailableRequests({ unitIds: ['u1'], from: '2026-09-20', to: '2026-09-22', choice: 'offsite', reason: 'x', bufferMinutes: 120 });
    const greyed = (day) => {
      const start = Date.parse(day + 'T00:00:00+01:00') - buffer;
      const end = Date.parse(day + 'T00:00:00+01:00') + 86400000 + buffer;
      return start < Date.parse(row.endAt) && Date.parse(row.startAt) < end;
    };
    assert.deepEqual(['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'].map(greyed), [false, true, true, true, false]);
  });

  test('a car with no buffer gets whole midnight days; an absurd buffer is clamped so a single day keeps a length', () => {
    const [zero] = unavailableRequests({ unitIds: ['u1'], from: '2026-09-20', to: '2026-09-20', choice: 'other', reason: 'x', bufferMinutes: 0 });
    assert.equal(zero.startAt, '2026-09-19T23:00:00.000Z');
    assert.equal(zero.endAt, '2026-09-20T23:00:00.000Z');
    const [huge] = unavailableRequests({ unitIds: ['u1'], from: '2026-09-20', to: '2026-09-20', choice: 'other', reason: 'x', bufferMinutes: 5000 });
    assert.ok(Date.parse(huge.endAt) - Date.parse(huge.startAt) >= 12 * 3600000);
  });

  test('an off-site booking is stored as kind other with a recognisable prefix, and is read back as such', () => {
    const [row] = unavailableRequests({ unitIds: ['u1'], from: '2026-09-20', to: '2026-09-20', choice: 'offsite', reason: 'M. Alami, 06 12 34 56 78' });
    assert.equal(row.kind, 'other');
    assert.equal(row.reason, `${OFFSITE_PREFIX} — M. Alami, 06 12 34 56 78`);
    assert.equal(isOffsite(row), true);
    assert.equal(isOffsite({ reason: 'Vidange' }), false);
    assert.equal(blockLabel({ kind: 'other', reason: row.reason }, { other: 'Autre' }), OFFSITE_PREFIX);
    assert.equal(blockLabel({ kind: 'maintenance', reason: 'Vidange' }, { maintenance: 'Maintenance' }), 'Maintenance');
  });

  test('the reason never exceeds what the action accepts, and an unknown choice falls back to other', () => {
    const [row] = unavailableRequests({ unitIds: ['u1'], from: '2026-09-20', to: '2026-09-20', choice: 'nope', reason: 'x'.repeat(300) });
    assert.equal(row.kind, 'other');
    assert.equal(row.reason.length, 200);
  });
});

describe('refusal sentences', () => {
  test('every refusal create_block() can answer becomes a sentence naming what is in the way', () => {
    assert.match(
      blockRefusalMessage({ error: 'CONFLICT', reference: 'DC-1', status: 'pending', from: '2026-09-20T09:00:00Z', to: '2026-09-22T09:00:00Z' }, { plate: '1-A-2' }),
      /^1-A-2 : la réservation DC-1 \(en attente\) occupe déjà cette voiture du 20 .* au 22 /,
    );
    const capacity = blockRefusalMessage({ error: 'CAPACITY', reference: 'DC-2', status: 'pending', source: 'web', from: '2026-09-20T09:00:00Z', to: '2026-09-21T09:00:00Z' }, { plate: '1-A-2' });
    assert.match(capacity, /déjà promises/);
    assert.match(capacity, /DC-2 \(site web, en attente\)/);
    assert.match(capacity, /attribuez-lui une voiture ou annulez-la/);
    assert.match(blockRefusalMessage({ error: 'BLOCK_OVERLAP', kind: 'cleaning', from: '2026-09-20T08:00:00Z', to: '2026-09-20T10:00:00Z' }), /déjà indisponible .*Nettoyage/);
    for (const error of ['PAST', 'TOO_LONG', 'BAD_DATES', 'REASON_REQUIRED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'SERVER', undefined]) {
      const text = blockRefusalMessage({ error });
      assert.ok(text.length > 10 && !/undefined|null/.test(text), String(error) + ': ' + text);
    }
  });

  test('the report after « Rendre indisponible » says what happened to each plate and what the site now shows', () => {
    const ok = (plate, bookable = true) => ({ plate, ok: true, bookable, result: { ok: true } });
    const all = unavailableSummary({ outcomes: [ok('A'), ok('B')], from: '2026-09-20', to: '2026-09-22', bookableCount: 2 });
    assert.equal(all.tone, 'success');
    assert.match(all.lines[0], /du 20 .* au 22 .* : A, B\./);
    assert.equal(all.lines[1], 'Le site ne propose plus ce modèle sur ces dates.');

    const one = unavailableSummary({ outcomes: [ok('A')], from: '2026-09-20', to: '2026-09-20', bookableCount: 3 });
    assert.match(one.lines[0], /^Indisponible le 20 /);
    assert.equal(one.lines[1], 'Le site propose 1 voiture de moins sur ces dates.');

    const garage = unavailableSummary({ outcomes: [ok('G', false)], from: '2026-09-20', to: '2026-09-20', bookableCount: 2 });
    assert.match(garage.lines[1], /ne change pas/);

    const mixed = unavailableSummary({
      outcomes: [
        ok('A'),
        { plate: 'B', ok: false, bookable: true, result: { error: 'CONFLICT', reference: 'DC-9', status: 'confirmed', from: '2026-09-20T09:00:00Z', to: '2026-09-21T09:00:00Z' } },
        ok('C'),
      ],
      from: '2026-09-20',
      to: '2026-09-22',
      bookableCount: 3,
    });
    assert.equal(mixed.tone, 'warning');
    assert.match(mixed.lines[0], /A, C/);
    assert.equal(mixed.lines[1], 'Le site propose 2 voitures de moins sur ces dates.', 'never "plus ce modèle" when one plate was refused');
    assert.match(mixed.lines[2], /^B : la réservation DC-9/);

    const past = unavailableSummary({
      outcomes: [
        { plate: 'A', ok: false, result: { error: 'PAST' } },
        { plate: 'B', ok: false, result: { error: 'PAST' } },
      ],
      from: '2026-09-01',
      to: '2026-09-02',
      bookableCount: 2,
    });
    assert.equal(past.tone, 'danger');
    assert.deepEqual(past.lines, ['Cette période est déjà passée.'], 'the same sentence once, not once per plate');
  });
});
