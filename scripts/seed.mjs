#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/* scripts/seed.mjs — load Diab Car's real inputs into Supabase.       */
/*                                                                     */
/* Reads the intake files, not the demo seed:                          */
/*   docs/inputs/fleet.csv      -> vehicles + units (from units_count) */
/*   docs/inputs/locations.csv  -> locations                           */
/*   docs/inputs/faq.csv        -> faqs                                */
/*   docs/inputs/settings.json  -> settings (generated on first run    */
/*                                 from src/lib/data/seed.js, then     */
/*                                 edited by hand / by the admin)      */
/*                                                                     */
/* IDEMPOTENT: everything upserts on a natural key (slug / plate /     */
/* faq id), so running it twice changes nothing. Rows removed from a   */
/* CSV are NOT deleted — deleting fleet data is a decision, not a      */
/* side effect of a script.                                            */
/*                                                                     */
/* Needs the SERVICE ROLE key: it writes through RLS. Server-side      */
/* only, never a NEXT_PUBLIC_ variable.                                */
/*                                                                     */
/*   node scripts/seed.mjs [--dry] [--only=vehicles,locations,faqs]    */
/* ------------------------------------------------------------------ */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = path.join(ROOT, 'docs', 'inputs');

/**
 * Load .env.local into process.env.
 *
 * Next does this for the app, but a bare `node scripts/seed.mjs` gets nothing —
 * so the script used to tell you to put the key in .env.local and then ignore
 * the file you put it in. Hand-parsed rather than adding dotenv: one dependency
 * for six lines is not worth a line in the plan (CLAUDE.md rule 9).
 *
 * A real environment variable always wins, so CI and one-off overrides still
 * work: `SUPABASE_SERVICE_ROLE_KEY=… npm run db:seed`.
 */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnvLocal();

const argv = process.argv.slice(2);
/* `--dry-run` is the spelling most people reach for first; accepting both
   avoids answering a typo with a confusing "set SUPABASE_SERVICE_ROLE_KEY". */
const DRY = argv.includes('--dry') || argv.includes('--dry-run');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const wants = (name) => ONLY.length === 0 || ONLY.includes(name);

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/**
 * RFC-4180 parser. A quoted field may hold commas, doubled quotes AND line
 * breaks. The FAQ long answers run to several paragraphs; the reader this
 * replaced split the file on every newline before looking at quotes, which
 * would have cut each of those answers into broken rows.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

async function readCsv(file) {
  return csvRecords(await readFile(path.join(INPUTS, file), 'utf8'));
}

/* Split out from readCsv so the parsing can be checked without the disk.
   Git on Windows may check a file out with CRLF, inside quoted fields too, so
   line breaks inside a value are normalised to \n. */
function csvRecords(raw) {
  const [head, ...rows] = parseCsv(raw.replace(/^\uFEFF/, '').trim());
  const cols = head.map((c) => c.trim());
  return rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(r.map((v, i) => [cols[i], v.replace(/\r\n?/g, '\n').trim()])));
}

const TODO = (v) => !v || v.toUpperCase() === 'TODO';
const num = (v) => (TODO(v) ? null : Number(v));
const int = (v, fallback = null) => (TODO(v) ? fallback : Number.parseInt(v, 10));
const bool = (v) => (TODO(v) ? null : ['yes', 'true', '1'].includes(String(v).toLowerCase()));
const i18n = (fr, en, ar, es) => ({ fr, en: en || fr, ar: ar || fr, es: es || fr });
/* No French stand-in. For answers, a missing translation must stay MISSING so
   the site can fall through to a genuinely translated short answer instead of
   rendering French under an English heading (src/lib/faq.js answerFor). */
const i18nStrict = (fr, en, ar, es) =>
  Object.fromEntries(Object.entries({ fr, en, ar, es }).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));

/* ------------------------------------------------------------------ */
/* settings.json — generated once from the committed seed              */
/* ------------------------------------------------------------------ */

async function loadSettings() {
  const file = path.join(INPUTS, 'settings.json');
  if (!existsSync(file)) {
    const { seedSettings } = await import('../src/lib/data/seed.js');
    const template = {
      _README: [
        'Generated from src/lib/data/seed.js on the first `npm run db:seed`.',
        'This file is the source of truth for the settings row from now on:',
        'edit it here (or in the admin once prompt 12 lands) and re-run the seed.',
        'Values marked UNVERIFIED in docs/inputs/facts.md must be confirmed by',
        'Diab Car before launch (CLAUDE.md rule 11).',
      ],
      ...seedSettings,
    };
    await writeFile(file, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
    console.log(`  created docs/inputs/settings.json from the committed seed — edit it, then re-run.`);
    return template;
  }
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  delete parsed._README;
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DRY && (!url || !key)) {
  console.error('\n  FAILED  set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  The service-role key is server-only. Put it in .env.local, never in a NEXT_PUBLIC_ variable.\n');
  process.exit(2);
}

const sb = DRY ? null : createClient(url, key, { auth: { persistSession: false } });
const snake = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), v]));

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) { console.log(`  ${table.padEnd(12)} nothing to write`); return []; }
  if (DRY) { console.log(`  ${table.padEnd(12)} ${String(rows.length).padStart(3)} rows (dry run)`); return []; }
  const { data, error } = await sb.from(table).upsert(rows.map(snake), onConflict ? { onConflict } : undefined).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table.padEnd(12)} ${String(data.length).padStart(3)} rows`);
  return data;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n  Diab Car — seeding ${DRY ? '(dry run)' : url}\n`);

  /* ---- settings ------------------------------------------------- */
  if (wants('settings')) {
    const s = await loadSettings();
    await upsert('settings', [{ ...s, id: 1 }], 'id');
  }

  /* ---- locations ------------------------------------------------ */
  let locations = [];
  if (wants('locations')) {
    const rows = await readCsv('locations.csv');
    locations = rows.map((r, i) => ({
      slug: r.slug,
      key: r.slug,
      kind: r.kind,
      city: r.city || 'Casablanca',
      name: i18n(r.name_fr, r.name_en, r.name_ar, r.name_es),
      address: r.address || null,
      lat: num(r.lat),
      lng: num(r.lng),
      /* TODO in the CSV means "not yet known" -> null -> the UI says
         "sur devis". Never 0, which would promise free delivery. */
      /* delivery_fee_mad only. The starter's `locations` also has a legacy
         `fee` column, and an earlier draft of this map wrote a `deliveryFee`
         key that matches neither — PostgREST rejected the whole batch with
         "Could not find the 'delivery_fee' column". */
      deliveryFeeMad: num(r.delivery_fee_mad),
      hours: TODO(r.hours) ? null : { opens: r.hours.split('-')[0], closes: r.hours.split('-')[1] },
      /* Written in snake_case already: snake() only splits on capitals, so
         `is24h` would stay `is24h` and never reach the `is_24h` column. */
      is_24h: bool(r.is_24h),
      sort: (i + 1) * 10,
      active: true,
    }));
    await upsert('locations', locations, 'slug');
  }

  /* ---- vehicles + units ----------------------------------------- */
  if (wants('vehicles')) {
    const rows = await readCsv('fleet.csv');
    const vehicles = rows.map((r, i) => ({
      slug: r.slug,
      brand: r.brand,
      model: r.model,
      year: int(r.year, null),
      category: r.category,
      transmission: r.transmission,
      fuel: r.fuel,
      seats: int(r.seats, 5),
      doors: int(r.doors, 5),
      luggage: int(r.luggage, 2),
      ac: bool(r.ac) ?? true,
      pricePerDay: num(r.price_low_season_mad),
      priceHighSeason: num(r.price_high_season_mad),
      /* Market-derived until Diab Car confirms each one (rule 11). */
      priceVerified: false,
      deposit: num(r.deposit_mad) ?? 0,
      mileageLimit: r.km_per_day === 'unlimited' ? null : int(r.km_per_day, null),
      minDays: int(r.min_days, 1),
      prepBufferMinutes: int(r.prep_buffer_minutes, 120),
      purposeTags: (r.purpose_tags || '').split(';').map((t) => t.trim()).filter(Boolean),
      unitsCount: int(r.units_count, 1),
      photoFolder: r.photo_folder || r.slug,
      isPublished: true,
      published: true,
      sortOrder: (i + 1) * 10,
    }));
    const saved = await upsert('vehicles', vehicles, 'slug');

    /* Units: one physical car per plate, or `units_count` placeholders when no
       plate is known yet. Upserted on plate so re-running never duplicates;
       placeholder plates are deterministic for the same reason.

       Built in a dry run too, so the operator sees how many physical cars the
       CSV expands to BEFORE anything touches the database — that count is the
       one the fleet is actually measured by (plan 6.1: 27 vehicles, 36 units). */
    const bySlug = Object.fromEntries(saved.map((v) => [v.slug, v.id]));
    const units = [];
    for (const r of rows) {
      const vehicleId = bySlug[r.slug];
      if (!DRY && !vehicleId) continue;
      const plates = (r.plates || '').split(';').map((p) => p.trim()).filter(Boolean);
      const count = int(r.units_count, 1) || 1;
      for (let i = 0; i < count; i += 1) {
        units.push({
          vehicleId,
          /* No real plate yet -> a stable placeholder so the unit exists and
             availability can be counted. The admin replaces it (prompt 12). */
          plate: plates[i] || `TBD-${r.slug}-${i + 1}`,
          year: int(r.year, null),
          status: 'available',
        });
      }
    }
    await upsert('units', units, 'plate');
  }

  /* ---- faqs ------------------------------------------------------ */
  if (wants('faqs')) {
    /* The same placeholder rule the site applies at runtime (src/lib/faq.js).
       The check this replaced was `!v || v.toUpperCase() === 'TODO'`, which only
       caught the bare word. The template answers read "TODO -- reponse
       complete", passed as answered, and one row was seeded PUBLISHED: it
       rendered on seven public pages and inside the FAQPage structured data. */
    const { isPlaceholder } = await import('../src/lib/faq.js');
    const rows = await readCsv('faq.csv');

    const faqs = rows.map((r, i) => {
      /* A row the content pass marked blocked stays unpublished whatever its
         cells hold: it is the owner's to-do, not an answer. */
      const blocked = String(r.status || '').trim().toLowerCase() === 'blocked';
      const shortReady = !isPlaceholder(r.short_answer_fr);
      const longReady = !isPlaceholder(r.long_answer_fr);
      /* Question, short answer AND long answer, as before. The long answer is
         what the FAQPage structured data carries, so a row without one would
         publish an empty acceptedAnswer. */
      const publish = !blocked && !isPlaceholder(r.question_fr) && shortReady && longReady;
      return {
        slug: r.id,
        category: r.category || 'general',
        citySlug: r.city_slug || null,
        /* All four languages when the CSV has them. i18n() falls back to French
           for a missing one, so a French-only row still renders -- in French --
           rather than as an empty string. Passing only the French column is why
           French questions used to appear on the English and Arabic pages. */
        question: i18n(r.question_fr, r.question_en, r.question_ar, r.question_es),
        shortAnswer: shortReady ? i18nStrict(r.short_answer_fr, r.short_answer_en, r.short_answer_ar, r.short_answer_es) : {},
        longAnswer: longReady ? i18nStrict(r.long_answer_fr, r.long_answer_en, r.long_answer_ar, r.long_answer_es) : {},
        answer: longReady ? i18nStrict(r.long_answer_fr, r.long_answer_en, r.long_answer_ar, r.long_answer_es) : {},
        sort: (i + 1) * 10,
        sortOrder: (i + 1) * 10,
        isPublished: publish,
        published: publish,
      };
    });
    await upsert('faqs', faqs, 'slug');
    const unpublished = faqs.filter((f) => !f.published).length;
    if (unpublished) console.log('  note: ' + unpublished + '/' + faqs.length + ' FAQ rows seeded unpublished (blocked, or not yet answered).');
  }
  /* ---- reviews --------------------------------------------------- */
  /* Sample reviews are seeded flagged, and the site only renders them in demo
     mode. Real Google reviews are imported from the admin (plan 8.4). */
  if (wants('reviews')) {
    const { seedReviews } = await import('../src/lib/data/seed.js');
    /* `vehicleId` is dropped along with `id`: the demo store keys vehicles as
       'v-tucson' and Postgres wants a uuid, so passing it through failed with
       `22P02 invalid input syntax for type uuid: "v-tucson"`. These four rows
       are unpublished design placeholders — the link buys nothing, and
       inventing a uuid to satisfy the column would be worse. Real reviews
       arrive with a real vehicle from the admin import (plan 8.4). */
    /* Replace, don't append. Sample reviews have no natural key to upsert on —
       they are not Google rows, so `(source, external_id)` is null for all of
       them — and passing no conflict target made every run insert four more.
       Two runs produced eight rows, which is exactly the kind of drift the
       "idempotent" requirement exists to stop. The seed owns these rows
       entirely, so it clears its own before writing. Real reviews are never
       touched: the delete is scoped to is_sample. */
    if (!DRY) {
      const { error } = await sb.from('reviews').delete().eq('is_sample', true);
      if (error) throw new Error(`reviews cleanup: ${error.message}`);
    }
    await upsert(
      'reviews',
      seedReviews.map(({ id, vehicleId, ...r }) => ({ ...r, vehicleId: null, isSample: true, published: false })),
      undefined,
    );
  }

  console.log('\n  Done. Run supabase/migrations/0007_verify.sql to check counts and RLS.\n');
}

main().catch((error) => {
  console.error(`\n  FAILED  ${error.message}\n`);
  process.exit(1);
});
