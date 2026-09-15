# Diab Car — build status

**Updated:** 2026-09-08 · **Branch:** `build/v1` · **Last prompt:** PROMPT 12 — admin fleet, operations, content, settings (Sprint 4c). The closed loop retour → nettoyage → prête → disponibilité publique works end to end and is tested. **Web Push transport still NOT done (PROMPT 10 carry-over). Hosting: Vercel Pro (owner, PROMPT 17).**

This file is the running state of the build. It is rewritten at the end of **every** prompt in `docs/PROMPTS.md`.
Decisions in the *Plan §10* column come from `docs/MASTER-PLAN.md` §10 (keep / rebuild / extend / delete); where §10 is
silent the decision is derived from the section named in *Why*, and every such call is listed under
[Decisions §10 does not settle](#decisions-10-does-not-settle) so no later prompt has to re-litigate it.

**Status column** — `done` = nothing outstanding for this file under the plan (every **keep** row, plus what this
prompt finished). `todo` = a **rebuild / extend / delete** still to execute. Note that **keep** rows still inherit the
Sprint 0 token change and are re-verified in the Sprint 6 accessibility/RTL pass — "keep" means *no rewrite planned*,
not *never touched again*.

---

## Prompt log

| Prompt | Sprint | Scope | State |
|---|---|---|---|
| 00 | — | Onboarding, baseline, checks | **done** |
| 01 | 0a | Tokens, fonts, logo, OG | **done** |
| 02 | 0b | UI kit, motion primitives, dev kit page | todo |
| 03 | 1a | Header, footer, hero, booking module | **done** |
| 04 | 1b | Homepage sections, vehicle card, car images | **done** |
| 05 | 2a | Supabase: schema, roles, storage, seed | **done and APPLIED — 20 tables, 39 policies, 3 buckets, owner created, auth hook live** |
| 06 | 2b | Availability engine: RPCs, holds, realtime | **done and MEASURED — 8.2 ms median search, 23P01 overlap rejection, 5/5 concurrency** |
| 07 | 3a | Results / fleet page with live availability | **done (a11y 100; Lighthouse perf 73, short of the >=90 target)** |
| 08 | 3b | Vehicle page | **done (a11y/BP/SEO 100; Lighthouse perf 66, short of the >=90 target)** |
| 09 | 3c | Booking funnel, confirmation, WhatsApp, email | **removed 2026-09-09** — both public flows deleted at the owner's request; replaced by the pop-up below |
| 10 | 4a | Admin foundation: auth, roles, shell, dashboard | **partial — see PROMPT 10 notes; Web Push transport and 8 routes outstanding** |
| 11 | 4b | Admin reservations, state machine, calendar | **done — 0010 + 0011 applied; 86 unit tests, 2 new e2e green** |
| 12 | 4c | Admin fleet, operations, content, prices, settings | **done — 0012 applied; closed loop measured; two pre-existing trigger bugs fixed; e2e loop green** |
| 13 | 5 | SEO / GEO / AEO pages and content | todo |
| 14 | 6a | WOW motion, view transitions, RTL motion | todo |
| 15 | 6b | QA: a11y, RTL, performance CI, content freeze | todo |
| 16 | 6c | Deploy on Cloudflare Workers Free | todo |
| 17 | — | v1.1 backlog | todo |

---

## Baseline checks — re-measured at PROMPT 03

| Command | Result | Note |
|---|---|---|
| `npm run build` | **pass** | 139 static pages, Next 16.3.4 + Turbopack, 1 warning (see below) |
| `npm run lint` | **10 errors, 1 warning** | all pre-existing in BookingForm/BookingWidget/CookieBanner/CurrencyProvider/Header/LanguageSwitcher/ThemeToggle (React Compiler rules) — see issue 14. The 9 new sections lint clean |
| `npm test` | **pass** — 41/41 | `src/lib/{pricing,whatsapp,format}.test.js` |
| `npm run test:e2e` | **pass** — 12/12 | 4 locales + admin + booking by keyboard (fr/ar) + all 9 homepage sections in 4 locales + the purpose-tile filter |
| `npm run check:messages` | **pass** | 640 leaf keys, identical across fr/en/ar/es |
| `npm run check:contrast` | **pass** | 56 pairs, 56 pass, 0 fail; every token of plan §2.2 declared |
| `npm run lh` — /fr | Perf **69–82** · A11y **97** · BP **100** · SEO **100** | LCP 3.42 s · TBT 1004 ms · CLS 0.005 — see issue 15. Readings swing ±40 % on this machine; Speed Index improved 2.57 → 1.11 s at best |
| `npm run lh` — /fr/location-voiture-casablanca | Perf **64** · A11y **95** · BP **100** · SEO **100** | not re-tuned; the fleet page is rebuilt in PROMPT 07 |

Budget (CLAUDE.md rule 7: LCP ≤ 2.0 s, INP ≤ 200 ms via TBT, CLS ≤ 0.05) — **CLS passes; LCP and TBT
still fail.** PROMPT 03 moved Performance 65 → 74 and TBT 3121 → 882 ms (−72 %) by removing a
`filter: blur()` from the LCP element, hinting its preload, dropping three below-the-fold image
preloads and warming the ISR cache before measuring. What remains is CPU, not bytes: every request
completes by ~284 ms while bootup-time is ~3.5 s under Lighthouse's 4× CPU throttle. Closing the gap
means shipping less homepage JavaScript, which is PROMPT 04 (HomeSections rebuild) and Sprint 6
("performance budget CI").

---

## Open issues carried into Sprint 0

| # | Where | Issue | Action |
|---|---|---|---|
| 1 | `src/styles/globals.css` | ~~light `--success` on `--surface-2` = 4.45:1, plus two `--text-muted` near-misses~~ | **closed at PROMPT 01** — BLACKLINE palette, check:contrast 56/56 |
| 2 | build + dev + start | `⚠ Next.js ignored package-lock.json in C:\Users\yahya because it is outside the current Git repository` — Turbopack infers a workspace root above the repo | one line in `next.config.mjs` (`turbopack.root`/`outputFileTracingRoot`); left alone this prompt (not build-breaking) |
| 3 | `CLAUDE.md` | `next dev` appends a `<!-- BEGIN:nextjs-agent-rules -->` block to CLAUDE.md on every run | stripped at PROMPT 00; permanent fix is `agentRules: false` in `next.config.mjs` — needs Yahya's call |
| 4 | `src/lib/whatsapp.js` | `vehicleInquiryMessage(locale)` with no rental argument renders "…je souhaite reserver la **undefined**" — the `= {}` default only fires on `undefined` | fix when WhatsApp templates are rebuilt (Sprint 3) |
| 5 | `src/lib/pricing.js` | `perDayEffective` is `round(total / days)`, an **average**: 363 × 7 = 2541 ≠ total 2540. CLAUDE.md rule 4 says nothing may appear that was not shown earlier | label it as an average in the UI, or derive it differently (Sprint 3) |
| 6 | `scripts/check-contrast.mjs` | the `--*-soft` tints (`bg-accent-soft text-accent`, `bg-success-soft text-success`, …) are shipped as text backgrounds but are not in the pair list | add a composited soft-tint section once the BLACKLINE palette lands |
| 7 | lint | 6 errors: `react-hooks/set-state-in-effect` in `CookieBanner.js:17`, `CurrencyProvider.js:14`, `Header.js:40`, `ThemeToggle.js:12`; `react-hooks/immutability` in `LanguageSwitcher.js:40`; `react-hooks/preserve-manual-memoization` in `BookingForm.js:61`. 3 warnings: unused eslint-disable in `JsonLd.js:10`, `no-img-element` + `alt-text` in `og.js:78` | not fixed at PROMPT 00 ("fix only build-breaking issues"); CLAUDE.md's definition of done requires lint to pass, so these must clear in Sprint 0 |
| 8 | routing | FR slug `/location-voiture-longue-duree-casablanca` in `src/i18n/routing.js` vs the route folder `/longue-duree` — confirm the public URL against plan §3 | PROMPT 13 |
| 9 | `src/app/favicon.ico` | ~~gold-era binary~~ **closed** — regenerated from the real mark as a 16/32/48 PNG-in-ICO (Next lists favicon.ico first, so this one mattered) | — |
| 10 | brand assets | ~~placeholder shield~~ **closed** — the real mark arrived (`public/brand/badge*.png`, Sept 2026). Wired: header emblem + Archivo wordmark, footer full lockup (light/dark cuts), OG card, `icon.svg`, `icon.png`, `apple-icon.png`, manifest icons incl. maskable, and a regenerated `favicon.ico` (16/32/48). Raster only — no vector was supplied, so `Logo.js` documents the swap-to-SVG path | plan §12 input #1 closed; placeholders `badge-temp*.svg` deleted; the four 1254² masters moved to `docs/inputs/logo/` (the plan's intake folder), only derived files stay in `public/brand/` |
| 20 | brand colour vs tokens | ~~#c80018 vs #b71920~~ **decided (owner, via logic): the token follows the logo.** `--red` is now `#c80018` (light hover `#a80014`, dark hover `#dc0a22`, red-soft/glow retinted); `--red-signal` dark stays `#f0383f`; `--text` stays `#0a0a0a`. Gate: 6.05:1 on white, 5.12 on --surface-2, white-on-red 6.05 | closed — plan §2.2 updated |
| 11 | `--text-muted`, `--success`, `--warning` | deviate from the hexes printed in plan §2.2 (see the token comments for the measured ratios). §2.2's values fail AA on `--surface-1`/`--surface-2` | plan §2.2 needs a one-line amendment, or the deviation is accepted as-is |
| 12 | `--accent*` compatibility aliases in `globals.css` | 37 files still reference the previous palette's token names; they now resolve onto BLACKLINE so nothing breaks | delete each alias as its last caller is rebuilt (prompts 02–13) |
| 13 | Arabic OG cards | satori spaces Arabic words oddly in RTL (visible gap between title words) | cosmetic; revisit when §9.3 moves OG generation to build time |
| 14 | `BookingWidget.js`, `Header.js` | 5 new React Compiler lint errors: `set-state-in-effect` (localStorage-after-mount, media-query sync, time-chip snap-back) and `refs` (a handler that focuses an input). Each is an idiomatic pattern the compiler cannot prove safe | fix with `useSyncExternalStore` in PROMPT 02's kit pass; 3 of the 8 the agents introduced are already fixed with derive-during-render |
| 15 | homepage JS | LCP 2.91 s / TBT 882 ms vs a 2.0 s / 200 ms budget. All bytes land by 284 ms; bootup-time is ~3.5 s — it is JS execution, not transfer | PROMPT 04 (lighter HomeSections) then Sprint 6 performance CI |
| 23 | homepage photography | **8 of 8 supplied and live** — hero, 6 fleet cars and now the airport scene (`scene-airport`, 1672×941, four widths). 20 cars still show category silhouettes | generate the rest from the shot list, or shoot the real fleet (plan §2.5) |
| 24 | PROMPT 05 defects found on re-audit | Four, all of which would have fired on first apply: (a) 0002/0003 only `alter` tables that `supabase/schema.sql` creates, and no run order said so — a fresh project died on `relation "settings" does not exist`; (b) 0005 dropped the starter's `public read reviews` and never recreated one, so anon would have seen **zero** reviews in production while demo mode looked fine; (c) `public_settings` was `security_invoker = true`, which makes the view obey the very RLS it exists to bypass — anon would have got 0 rows and the site would have lost its phone number, hours and trust facts; (d) the adapter read the `settings` **table**, now staff-only, instead of that view | **all four fixed**; run order documented + guarded in 0001, `reviews public read` recreated (and it now excludes `is_sample` at the database, not just in the component), view is definer, adapter split into `getSettings()` / `getSettingsAdmin()`, regression test in `src/lib/data/adapters.test.js` |
| 25 | `0007_verify.sql` used `set local role anon` | `set local` is only honoured inside an explicit transaction block. In a SQL editor that does not give you one it warns and does nothing — the RLS proof would have run as `postgres`, returned non-zero units/customers, and read as "RLS is broken" when the test simply never ran | fixed: plain `set role anon` … `reset role`, plus new assertions for reviews, sample reviews and `index_now_key` non-exposure |
| 16 | ~~`docs/inputs/photos/` empty~~ | partially resolved: `npm run images` is built and self-tested but has nothing to process, so every car is a silhouette and the card hover crossfade has no rear image | blocked on plan §12 input #4 (real fleet photography) |
| 22 | PROMPT 05 not applied | the migrations are written and self-consistent but have **never run against the project**. Nothing in task 8 (counts, anon-RLS proof, overlap proof) can be reported as measured until they do | apply 0001-0006 in the SQL editor, do the two dashboard steps, `npm run db:seed`, then run 0007 |
| 21 | `SUPABASE_SERVICE_ROLE_KEY` | never supplied, so `.env.local` still has the Supabase block commented out and the seed has only been dry-run | paste the key; I write `.env.local` (gitignored) and run the seed |
| 20 | `bookings` vs `reservations` | the starter's `bookings` table is untouched and still backs the current lead form; `reservations` is canonical from here | migrate the funnel in PROMPT 09, then drop `bookings` |
| 19 | places & supplementary services | owner's requirement (Sept 2026): chauffeur and delivery are extras on the **subtotal** (already how `pricing.quote()` works); places must be admin-managed and may be in **other Moroccan cities** (kind `city`, new `city` column in locations.csv, no city pre-filled) | PROMPT 05 schema step 0 · PROMPT 12 step 1b |
| 18 | admin fleet gallery | owner's requirement (Sept 2026): add / replace / remove / reorder photos per car from the admin, per angle; first photo = card image; silhouette fallback when empty. Data model already carries `images[]` + `photoFolder` per vehicle | PROMPT 12 (plan §7.1 updated, PROMPTS.md prompt 12 step 1) |
| 26 | `next_available()` probed at the wrong instant | Found by the new tests, present in BOTH implementations. The probe walked to `upper(period)`, but `free_units()` widens the *request* backwards by the prep buffer too, so a request starting exactly at that end still overlapped it. Every candidate looked occupied and the function returned **null** — the vehicle page would have printed nothing where "disponible à partir du 13 SEP" belongs | fixed in 0008 and `demo-availability.js`: probe at `upper(period) + prep_buffer`, which is two buffers clear of the return — exactly the clearance the exclusion constraint enforces. Pinned by a test |
| 27 | realtime subscribes to `availability_ping`, not `holds`/`reservations` | Plan 6.4 names the two tables directly, but Realtime honours RLS: delivering those rows to a visitor needs an anon SELECT policy, and any policy loose enough to deliver the row also delivers `customer_id`, the travel dates and the stored `quote`. Discarding it client-side is no help — it has already crossed the wire | **deviation from plan 6.4, deliberate.** 0008 adds a two-column table (`vehicle_id`, `updated_at`) written by triggers on holds/reservations/blocks. It says "something moved, ask again"; `/api/availability` stays the only thing that decides what a visitor may know. Plan §6.4 wants a one-line amendment |
| 28 | stale `next start` served phantom test failures | A `next start` left running from an earlier step kept port 3000 and served a build predating the new routes, so all 9 API tests 404'd and, earlier, 12 e2e tests "failed" against unchanged code | no code change; noted because it cost two debugging rounds. Kill the listener on 3000 before trusting an e2e run |
| 17 | `/livraison`, `/automatique` | in the header Services dropdown but the routes do not exist until PROMPT 13; rendered with a "bientôt" marker rather than a dead link | PROMPT 13 |

---

## Measured on the live database — 2026-09-07

Project `vmodgrkxiitwwneqhtbo` (`diabcar`), region **eu-central-1 / Frankfurt** — note plan §9.2 asked for West EU / Paris. Still EU, which is what the CNDP out-of-Morocco transfer wording turns on, so recorded rather than changed.

| Check | Result |
|---|---|
| Schema objects | 20 tables · 1 view · 39 policies · 25 triggers · **2 exclusion constraints** · btree_gist · pg_cron |
| Seed | 1 settings · 8 locations · **27 vehicles** · **36 units** · 10 faqs (9 TODO → unpublished) · 4 reviews |
| Seed idempotency | three consecutive runs → identical counts, no duplicates |
| `search_availability` (27 vehicles) | **8.2 ms median**, 8.05 min, 21.0 cold · planning 0.04 ms · 2497 shared hits, 0 reads |
| Overlapping reservation | rejected — **SQLSTATE 23P01**, `reservations_no_overlap` |
| Prep buffer | period widened 02:00:00 both ends, and follows a date change (trigger, not GENERATED) |
| Concurrency (last car) | **5/5 runs**: exactly one BOOKED, one SOLD_OUT with 3 alternatives, 0 free after · 147–285 ms |
| Anon reads | vehicles 27 · locations 8 · faqs 1 · public_settings 1 · reviews 0 |
| Anon reads (must be zero) | units **0** · customers **0** · reservations **0** · holds **0** · blocks **0** · vehicle_events **0** · audit_log **0** · profiles **0** · settings **0** |
| Owner reads (same tables) | units 36 · customers 3 · settings 1 · audit_log 93 · profiles 1 |
| Auth hook | enabled via the Management API; a real sign-in returns a JWT carrying `user_role: owner` |
| Storage | `vehicles` (public), `inspections` (private), `documents` (private) · 8 policies |
| Realtime | `availability_ping` is in the `supabase_realtime` publication |
| pg_cron | `diabcar-expire-holds` scheduled `* * * * *`, active |
| App on Postgres | `/api/health` reports `mode: supabase`; `/fr`, `/ar`, `/fr/vehicules` render; **e2e 21/21 against Postgres as well as demo** |

The homepage drops its Reviews section in Supabase mode and keeps it in demo — correct, and the clearest demonstration of rule 11 so far: all four seeded reviews are unpublished samples, so anon receives none and the section deletes itself rather than showing a thin row.

---

## PROMPT 07 notes — 2026-09-07

**ISR vs `noindex`, resolved in the proxy.** Reading `searchParams` in the page or its `generateMetadata` opts the whole route out of static rendering, so the two requirements — "static shell (ISR)" and "parametrised URLs are noindex" — cannot both be met in the page. The page therefore never touches `searchParams` (the island reads the URL itself) and `src/proxy.js` sets `X-Robots-Tag: noindex, follow` on any request carrying a query string. Google honours the header exactly like the meta tag, and it works on a cached response. Measured: `/fr/vehicules` has no header, `/fr/vehicules?from=…` returns `noindex, follow`, and the route builds as `● … 1h`.

**Bugs found while wiring it up**

| # | Bug | Why it mattered |
|---|---|---|
| 29 | `pickup` was validated as a fee category (`agency\|airport\|…`) but the booking module puts a LOCATION KEY in the URL (`agence-zerktouni`) | every real search 400'd and the results page showed zero cars. The same mismatch made `submitBooking` look up `locations.find(l => l.key === 'agency')`, which never matched, so **every reservation was stored with a null `pickup_location_id`**. Fixed with one resolver, `src/lib/locations.js`, used by both routes and the action |
| 30 | the island's URL writer ran before `useSyncExternalStore` adopted the query string | on first render the store returns the SERVER snapshot (empty), so `replaceState` wiped the search before it was read — the page silently forgot the dates it had just been given. The URL is now input-only until the first interaction |
| 31 | `pick`/`drop` were referenced inside the `Promise.all` that produced them | a TDZ error the route's own try/catch turned into a silent 500 |
| 32 | footer wordmark link had no accessible name; results count failed contrast on the active chip; card `<h3>` followed `<h1>` with no `<h2>` | **a11y was 92 on the fleet page and 97 on the home page. All three fixed → 100 on both** |

**Not met: Lighthouse ≥ 90 on the bare fleet page.** Measured 57 before optimisation, **73 after** (LCP 4.37 → 3.39 s). Lazy-loading the booking module behind the "✎ Modifier" sheet (`next/dynamic`, `ssr:false`, gated on first open because a `<dialog>` renders its children while closed) is what bought most of that. What remains is TBT — site-wide JS execution, not this page's markup — and the homepage sits at the same 63–69 on unchanged code. This is the "performance budget CI" work in Sprint 6, not something the results page can fix alone. Readings still swing ±40 % on this machine (home measured 37 and 69 in the same session).

---

## PROMPT 08 notes — 2026-09-08

**The three "known bugs" in the prompt, checked rather than assumed**

| Bug | Finding |
|---|---|
| "Kilométrage kilométrage illimité" | **Not present.** `vehicle.includedItems.mileage` already reads `{mileage} inclus` in all four locales, and no label is paired with the value. Rendered output is `KILOMÉTRAGE ILLIMITÉ INCLUS` (screenshot in the report). Nothing to change |
| truncated time select | **Was still real.** The prompt said "now replaced by chips, verify" — chips replaced it in `BookingWidget` only; `VehicleQuote` still used `<Select>`. The vehicle page no longer renders `VehicleQuote`; its dates come from the module in a sheet, which uses chips. `VehicleQuote.js` is now dead on this route and is a delete candidate once the funnel stops using it |
| FAB overlap | **Structurally impossible now.** `WhatsAppFab` already returned null on `/vehicules/`, which STATUS called a workaround — plan 4.6 actually specifies it ("the WhatsApp FAB hides on this page"), because the booking panel and the mobile bar both carry WhatsApp. Verified: `animate-ping` (a FAB-only class) is absent from the vehicle HTML and present on the home page, and an e2e test asserts it |

**Also fixed:** `vehicleInquiryMessage(locale)` with no rental rendered "réserver la **undefined**" (STATUS issue 4). The `= {}` default only fires when the whole argument is missing. Fixed with a per-language fallback that carries its own determiner, plus the price clause plan 4.6 asks for — three regression tests.

**Static Open Graph cards (plan 9.3).** `npm run og` writes `public/og/<locale>/<slug>.png` — 108 cards, 27 vehicles × 4 locales, 8.2 MB — and a manifest `src/lib/seo.js` imports statically, so `ogImageUrl` returns the file when it exists and falls back to the dynamic route otherwise. It generates them by asking the running site for each card rather than importing the renderer: `src/lib/og.js` is JSX, which bare Node cannot parse, and a JSX transform would be a new dependency for one build step. Driving the real route also means there is no second implementation to drift.

**Honest gaps, by design**

- Only `front` exists in the photo pipeline, so the gallery renders one image: the EXTÉRIEUR | INTÉRIEUR toggle and the thumbnail strip appear only when those photos exist. An empty INTÉRIEUR tab would be rule 11 in UI form. Both light up with no code change once `side`/`rear`/`interior`/`dash` land in `docs/inputs/photos/<slug>/`.
- No FAQ is vehicle-scoped yet (none carry `category = vehicle` or a `vehicle_id`, and 9 of 10 seeded rows are unpublished TODOs), so the page falls back to the general published set, capped at 4. `FAQPage` is emitted for exactly what renders — Google requires the structured data to match the visible text.

**Not met: Lighthouse ≥ 90 / LCP ≤ 2.0 s.** Vehicle page measures **Performance 66, Accessibility 100, Best practices 100, SEO 100**; LCP 3.5–4.2 s, TBT 0.9–1.8 s. Same cause as the fleet page: site-wide JS execution under 4× CPU throttle. Sprint 6's performance budget work.

---

## PROMPT 09 notes — 2026-09-08

**Where funnel state lives, and why it is split.** The URL carries step, dates, place, car and chosen extras — shareable and restorable, and the back button works. sessionStorage carries the hold and the customer's name, phone and e-mail. **Personal data never enters a URL:** URLs land in history, in the `Referer` of every third-party request the page makes, in analytics and in screenshots sent to support. Plan 9.4 and Loi 09-08 both say collect the minimum and do not spread it around. The funnel restores completely on reload without a phone number ever appearing in the address bar.

**The confirmation page never reads the database.** `reservations` is staff-only under RLS (0005). Adding an anonymous read keyed by reference would let anyone who guessed a `DC-` code see a stranger's dates and pick-up point, so the funnel hands the confirmation its own figures through sessionStorage instead. Asserted: the server HTML for `?ref=DC-NOPE12` contains no `data-testid="confirmation"`, no `booking-reference` and no `data-car-transition` — the server emits only the loading line. The reference echoed back is shape-checked against `/^DC-[A-Z0-9-]{4,20}$/` rather than reflected raw.

**Turnstile is verified server-side and skipped when unconfigured**, and `submitBooking` reports which happened (`turnstile: 'verified' | 'skipped'`) so it can be asserted rather than assumed. If Cloudflare is unreachable the booking is allowed through and the failure logged — their outage should not become a funnel that cannot take a reservation.

**WOW-3 hook placed early.** `data-car-transition={slug}` is on the funnel summary and on the confirmation's car line. PROMPT 14 attaches the `view-transition-name` to it without touching this markup. An e2e test asserts the attribute exists.

**Two bugs found by running it**

| Bug | Finding |
|---|---|
| the funnel leaked live holds | The first e2e run left **9 live holds** in the database — a visitor who picks a car and then goes back was silently holding a unit. `goToStep` now releases on the way back, and the test asserts the timer disappears. Self-healing anyway (expiry + pg_cron), but it was quietly eating capacity |
| orphan notifications | Each booking writes an admin-bell row; deleting test reservations left rows pointing at nothing. Test cleanup now removes notifications whose `href` names a reservation that no longer exists — matched by id, not by text, because the text is indistinguishable from a real booking's |

Two of my own test assertions were wrong rather than the code: `toContainText('MAD')` fails in Arabic because `formatMAD` renders **درهم**, and `not.toContain('MAD')` on the confirmation matched the footer's `aria-label="MAD / EUR"` currency toggle — site chrome, not data.

**Verified after a full e2e run: 0 reservations, 0 customers, 0 live holds, 0 notifications** — the database is exactly as it was before.

---

## PROMPT 10 notes — 2026-09-08

A read-only audit (5 parallel agents) ran before any code was written. It found two things that would have made the whole rebuild look finished while doing nothing.

**BLOCKER 1 — the admin was reading with an anonymous client.** `selectAll`/`selectOne` in the Supabase adapter use `createPublicClient()`. Every staff-only table — reservations, units, customers, blocks, holds, events, notifications, audit_log — denies anon under the 0005 policies, and PostgREST answers with an **empty array and no error**. The admin would have rendered "0 réservations" over a full database. Fixed with `selectAllAsStaff`/`selectOneAsStaff` on the session client, and an e2e test asserts the fleet total is non-zero precisely to catch a regression.

**BLOCKER 2 — the role claim was ignored.** `claimsAreAdmin` checked `app_metadata.role === 'admin'` or an ADMIN_EMAILS allowlist, but the access-token hook enabled in PROMPT 05 emits **`user_role`** from `profiles.role`. The owner account would have been rejected unless its address happened to be on the list. `roleFromClaims` now reads `user_role` first and keeps both old paths as compatibility, mapping them to `owner`.

**Roles (plan 7.2).** `requireRole()` for actions (throws), `requirePageRole()` / `requirePricingRole()` for pages (redirect). `/tarifs`, `/parametres` and `/seo` are guarded server-side AND hidden from the nav for an agent — hiding alone is decoration, since typing the URL would still work.

**Notifications are real now (0009).** Triggers on reservation insert, on the status changes worth interrupting someone for (cancelled, no-show, returned — `confirmed`/`ready` stay quiet on purpose), and on a unit going to maintenance. `notifications` added to the realtime publication; the missing INSERT policy added. `operations_due()` defines "late" next to the data, and `/api/cron/reminders` turns it into rows — **idempotently**, verified: run 1 created 1, run 2 created 0 for the same overdue return.

**Bug found by the test, then fixed properly.** The bell did not move over Realtime. `postgres_changes` is RLS-filtered, and the socket was connecting before the session was attached, so the subscription was accepted and silently delivered nothing. `realtime.setAuth(access_token)` before `subscribe()`. The bell now reports `data-live` so it degrades honestly and the test waits for SUBSCRIBED instead of racing it — a missed INSERT is never redelivered, which is why it was intermittent.

**NOT DONE — stated plainly**

| Item | Status |
|---|---|
| Web Push transport | **Not built.** VAPID keys are generated (`npm run vapid`, Web Crypto, no dependency) and stored in `.env.local`; `.env.example` documents them. The service worker, the aes128gcm sender, the subscribe button in Système, `push_subscriptions` CRUD and the admin-scoped PWA manifest are all outstanding. The in-app bell works today; nothing reaches a phone that is not looking at the page |
| 8 of plan 3's routes | `/calendrier`, `/blocs`, `/clients`, `/operations/departs`, `/operations/retours`, `/systeme` now render an honest "pas encore disponible" panel naming the prompt that builds them and what to use meanwhile — the nav links to them, and a 404 would read as a broken admin. `/operations/checklist/[id]` and `/flotte/unites/[id]` have no link and no page |
| Global search | The input, the `/` shortcut and the submit exist; it routes to `/reservations?q=`. The reservations page does not yet interpret `q`, so searching currently filters nothing |
| Admin still reads the LEGACY `bookings` table | `/admin/reservations` lists `bookings`, not `reservations`. The dashboard reads the real `reservations`. Migrating that page is PROMPT 11 |

---

## Final sweep — what was checked, and what could not be (2026-09-08)

**The adversarial bug-hunt workflow did not run. Three attempts, three failures on the session /
model limit** — 6 reviewers each time, 0 started. Its result reads `confirmed: []`, and that means
**zero reviewers ran, not zero bugs**. It is recorded here so nobody mistakes an empty list for a
clean bill of health. Worth re-running after 19:20 Africa/Casablanca.

The audit was therefore done by hand, plus one new permanent guard.

**New: `npm run check:i18n`** (`scripts/check-i18n-keys.mjs`). `check:messages` proves the four
locales AGREE; it never reads the code, so it cannot prove the code only asks for keys that exist.
That gap put a raw `faqPage.categories.documents` heading on the live FAQ page while four suites
were green. The new check walks `src/app`, `src/components` and `src/lib`, resolves each translator
to its namespace and verifies every literal key. **491 keys, all present.**

It found its own bug first: the initial version reported 11 missing keys that all exist, because
`const t` is legitimately rebound per function — `seo.faq` inside `generateMetadata`, `faqPage`
inside the component — and it was resolving against the LAST declaration in the file rather than the
nearest preceding one. Fixed, then proved on a planted key.

**Checked by hand, nothing found:**

| Check | Result |
|---|---|
| Every static route × 4 locales, on a live dev server | **56/56 return 200** |
| i18n errors during that sweep | **zero** (the 18-per-page flood is gone) |
| Rule 3, physical CSS in public components | clean — the one hit, `left-1/2` with `-translate-x-1/2`, is the correct direction-safe centring idiom; `start-1/2` would actually break it in RTL |
| Rule 2, raw hex | clean — the remaining three are `themeColor`/manifest metadata, which cannot take a CSS variable, and the Google brand mark, which must keep its own colours |
| `toCamel` and column names containing digits | only `is_24h` was ever broken (fixed); `airport_service24h` has no underscore before the digit and always mapped correctly. `toSnake` stays asymmetric on purpose — every write carrying that key goes through an RPC that reads it by name |

**Suites:** build pass · lint at the 10-error baseline · 99/99 unit · contrast, messages (833 × 4),
css and i18n-keys all pass · **106/108 e2e with 2 flaky, both green on retry**.

**Known flakes, named rather than hidden:** the `/es` homepage sub-resource 404, and the closed-loop
test — which books a window starting thirty minutes out, so it is genuinely timing-sensitive. Both
pass on retry; neither has ever failed twice in a row.

---
## Per-car booking sheet — owner's revision (2026-09-08)

The owner sent screenshots of a competing flow and asked for the same shape: pick a CAR, see a
calendar of the days THAT car is free, choose the pick-up place from priced option cards, then
options, then coordinates. Three steps, one sheet.

**The rule that shaped it.** A per-day free count is a HINT, not the answer. Three units where A
is free Mon–Wed and B Wed–Fri leave every day « free » while no single unit covers Mon–Fri, and
the exclusion constraint is per unit. So the calendar paints days from `vehicle_availability_days()`
and the RANGE is settled by `/api/quote` — which asks `free_units()` for that exact window —
before the continue button opens. The sheet never decides availability (rule 5).

Verified on the live database with a realistic 10:00→10:00 rental over 19–21 Oct: days 19, 20 and
21 grey (out, plus the return day for turnaround), 18 and 22 free. An earlier probe that booked
midnight-to-midnight greyed three days for a one-day rental — an artefact of the test, not the code,
caught before it became a « fix ».

**Migration `0013_vehicle_calendar.sql`** (applied): `casablanca_day()` and
`vehicle_availability_days(vehicle, from, to)` — public, capped at 92 days per call, `NOT_FOUND`
for an unpublished car, and it returns a free-count per day and nothing else: no plate, no unit
status, no reservation, no customer (plan 6.5, asserted by an e2e test).

**The gap that would have made the priced place cards lie.** `quote()` only ever knew
`airportDeliveryFee` and `cityDeliveryFee`, so a screen showing Casablanca +300 / Marrakech +500 /
Agadir +700 would have billed all three the same. Each place now charges its own
`delivery_fee_mad`, with null still meaning « sur devis » rather than a free delivery nobody agreed
to (rule 11). Seven tests pin it — including one that pins the OLD behaviour for the `station`
category, which my first version silently started charging 150 MAD for.

**Payment: unchanged, and stated on screen.** The screenshots show an online payment step. Plan
§9.5 is a locked decision — no online payment — and everything downstream rests on it: `pending`
means a human confirms, prompt 12 built cash/TPE capture at the counter, and the auto-expiry sweep
exists because nobody pays online. Step 3 collects coordinates and says plainly that payment happens
at the agency. An e2e test asserts no card field ever appears. **If Diab Car wants real card
payments, that is a provider, a merchant account and PCI scope — its own prompt, with a line in the plan.**

**Also:** `/reservation` stays alive as the deep-link target and the no-JS path; both flows write
through the same `submitBooking`. Age and country became optional there — a reservation is a
REQUEST, and the licence is checked against the physical document by the pickup checklist that
refuses to complete without « identité vérifiée ». The minimum-age rule still runs whenever an age
is supplied.

**Two bugs of my own, caught before they shipped:** `isoDay()` crashed the whole sheet on open
(`addDays` handed it a number, it called `.getTime()`); and the React Compiler rejected `setState`
inside both effects — fixed by DERIVING « is it loading » and « which inputs is this price for » from
a key stamped on the answer, so a price can never outlive the dates it was calculated for.

**Checks:** build pass · lint at the 10-error baseline · **99/99** unit (+7 delivery-fee) · contrast,
messages (**833 keys × 4**, zero placeholder mismatches) and css pass · **108/108 e2e**, including 7
new ones: the route leaks nothing, an unknown car gets nothing, a backwards range is refused, the
three steps walk and price, no payment field exists, a fully-booked day reads 0, and the sheet works
in Arabic RTL with Western digits.

**Open:** the sheet is mounted on the vehicle page. Putting it on every fleet card as well needs
`locations`/`extras`/labels threaded into `VehicleCard`, which is worth doing but is plumbing, not
design — next pass.

---
## Fix — two bugs `npm run dev` reported and every suite missed (2026-09-08)

Running the dev server after the CSS fixes produced 18 i18n errors per page view and one
missing message. Build, lint, 92 unit tests, three checks and 101 e2e tests were all green
at the time.

**1. The FAQ page rendered a raw translation key to customers.** `/fr/faq` shipped
`<h2>faqPage.categories.documents</h2>` — the key itself, as the heading of the only section
on the page. Cause: `t(\`categories.${c}\`)` builds a translation key out of DATABASE content,
and prompt 12's FAQ editor lets staff type any category they like, while the message files are
static and shipped six. `check:messages` could not catch it — it proves the four locales agree,
not that the code only asks for keys that exist. Fixed at the root: an unlabelled category now
falls back to its humanised slug, so a category invented tomorrow reads « Carburant » rather
than a key; and `documents` — which the live data actually uses, and which plan §8.5 lists — got
a real label in all four locales. The full §8.5 vocabulary lands with the FAQ import in prompt 13;
the fallback covers it until then.

**2. Every fleet page logged 18 formatting errors.** The results page hands label TEMPLATES to a
client island, which interpolates them itself — `labels.showMore.replace('{n}', …)`. Fetching
them with `t()` asks next-intl to format a message whose values are deliberately absent, so it
logged `FORMATTING_ERROR` for each and fell back to returning the raw string. The UI was correct
the whole time, resting on an error path. Nine call sites now use `t.raw()`, which is the
documented way to ask for an unformatted message. The dev log for those pages is silent.

The second one is worth stating plainly: **that noise is how a real bug hides.** The CSS parse
failure fixed earlier the same day sat in the same log.

**Also committed:** the `<!-- BEGIN:nextjs-agent-rules -->` block Next.js 16 writes into
CLAUDE.md on every `next dev`. It re-creates itself if deleted, so committing it once is what
keeps the tree clean; the alternative is `agentRules: false` in next.config.mjs, which would
also suppress a true warning about Next 16 differing from training data.

**Verified:** `/fr/faq` renders « Documents » and `/ar/faq` « الوثائق »; zero i18n errors in the dev
log across four page loads; build pass · lint at the 10-error baseline · 92/92 unit · contrast,
messages (765 keys × 4) and css pass · 100/101 e2e with one known homepage flake.

---
## FAQ — written for the Moroccan market, and a French leak (2026-09-15)

« Analyse the Moroccan market and let the FAQ grow the site for SEO / GEO / AEO. »

**Content.** `docs/inputs/faq.csv` now holds 31 questions from a Moroccan search-intent study (Casablanca prices, airport Mohammed V, MRE diaspora, driving in Morocco, deposit, documents, long term), each fact-checked in three passes against the verified fact sheet. **Not seeded** — the answers make legal and business claims, so the owner reviews them first.

| state | count | what it holds |
|---|---|---|
| ready | 25 | question and short answer in FR/EN/AR/ES; long answer in French (EN/AR/ES show their own short answer) |
| blocked | 6 | the question and `missing_fact` only — no answer text, so a publish click in the admin cannot put an unverified claim live |

Blocked, with the fact each one needs: airport meeting point and fee (`aeroport-01`); a night pick-up at CMN — `settings.airport_service24h` is true while the verified hours end at 20:00 (`aeroport-02`); international permit rules (`Q012`); MRE temporary admission past 6 months (`MRE-01`); speed limits and child seats (`conduite-au-maroc-*`).

Checked by hand after the passes: free cancellation 24 h, deposit release 7 days and the WhatsApp reply time are in `settings.json`; RC / ICE / capital are already public in the footer, the legal notice and the Organization JSON-LD; Morocco's accession to the 1968 Vienna Convention (29 Dec 1982) is in the UN treaty record.

**Three bugs found on the way**

| what | why it mattered |
|---|---|
| French answers on /en, /ar, /es | the long answers are French-only and the picker falls back to French, so the accordion and the FAQPage data both carried French text in three languages. `answerFor()` / `shortAnswerFor()` read the locale exactly; every renderer and `faqJsonLd` go through them. |
| vehicle page FAQPage ≠ visible text | it lists the short answers but indexed the long ones (rule 8). |
| demo mode had no FAQ at all | the placeholder guard required a short answer and the demo rows only carry `answer`, so every FAQ was filtered out (rule 12). |

Also fixed: the seed's CSV reader split on every newline and would have cut the multi-paragraph answers apart (now RFC-4180, proven identical on the three existing CSVs), and the seed no longer fills a missing translation with French.

**Verified:** build · lint clean on every touched file · 138/138 unit · messages, i18n, css, contrast pass · e2e home/claims/vehicle 20/20 on live data · in demo mode, 128 question/answer pairs on 20 pages across 4 languages: every FAQPage answer visible on its page, no French answer on en/ar/es, zero console errors. The live database has no published FAQ row today, which is why the demo run is the meaningful one.

**Open for the owner:** approve the 25 answers, then `node scripts/seed.mjs --only=faqs`; supply the six missing facts; template rows Q001–Q004 and Q007–Q009, if they were ever seeded, stay in the database hidden by the guard — delete them from the admin.

---
## Full verification of the booking pop-up (2026-09-09)

« Run and verify no errors at all ». Everything was run, and a five-dimension
adversarial review (state, pricing, security, i18n/UI, integration — 20 agents,
each candidate defect then attacked by a skeptic) was run over the new code in
parallel. 12 findings survived refutation; all 12 are fixed, plus 2 the full
Playwright suite caught on its own. Details in commit `da7ed77`.

The ones that mattered most:

| what | why it mattered |
|---|---|
| demo calendar off by one day | every cell carried the PREVIOUS day's count, so demo mode blocked free days and offered booked ones (rule 12). Postgres was always right. |
| four booking buttons on the vehicle page | two red « Réserver » buttons went to WhatsApp, not to the booking flow. The panel now owns the pop-up; there is one Réserver per car. |
| the pop-up ignored the visitor's dates | arrived on `?from=&to=`, saw a price on the panel, then got a blank calendar. It now inherits them, splitting the ISO instant in Casablanca time so the moment is preserved exactly. |
| Turnstile token never sent | nothing is broken today because no keys are configured — but the day they are, `verifyTurnstile()` answers `missing-input-response` and EVERY booking fails. |
| `done` never cleared | after one successful booking, re-opening showed the old confirmation with no way to start a second one. |
| « Réessayer » never retried | `setMonth(m => m)` is a no-op React bails out of; the calendar stayed loading for ever. |
| no price per day | rule 4 says price per day AND total. Only the total was shown. |
| « sur devis » printed as 0 MAD | the agency e-mail and both admin surfaces read it as free, so the fee would never be collected. |
| Arabic letter-spaced | hand-rolled `uppercase tracking-wide` instead of `.text-meta`, which globals.css already neutralises for `ar` (rule 3). |

### Booked dates — the owner's specific request

A car booked X→Z must not offer those days and must show they are taken. There
is now a legend under the grid, and a test that proves it against a REAL
booking: it books out every unit, pages the calendar to that month, and asserts
each occupied day reports zero free units, is disabled, is labelled « déjà
réservé », and that a range straddling the blocked run is refused. **Mutation-
checked**: with the availability guard removed the test fails, so it is not
asserting vacuously.

### Numbers

Build passes · lint 9 errors + 1 warning, the documented baseline, every one in
a pre-existing file and **none in the booking code** · 111/111 unit · contrast,
messages (756 keys × 4), css, i18n-keys pass.

Full Playwright suite, both data modes:

| mode | passed | skipped | failed |
|---|---|---|---|
| supabase (real config) | 81 | 11 | 0 |
| demo (rule 12) | 79 | 13 | 0 |

The 11–13 skips are the admin/loop/reservations specs, which need
`E2E_ADMIN_PASSWORD`; that is not set here and they say so rather than passing
vacuously.

**Correction to an earlier note in this file's history:** the e2e suite CAN
reach the live database — `tests/e2e/helpers/db.js` loads `.env.local` itself,
so `db.available` is true regardless of the shell environment. The specs that
write use the marker address `e2e-…@example.invalid` and delete their rows in a
`finally`. Checked after every run: zero marker rows, zero test reservations.

### One unexplained flake

`home.spec.js › /es renders every section without console errors` failed once
in one full run and passed on the two subsequent full runs and a targeted run.
Playwright had already cleared the artefact by then, so the console message was
lost and the cause is unknown. Recorded rather than dismissed.

### Left deliberately

`src/lib/actions/availability.js` (`holdVehicle`, `releaseHold`) is orphaned
since the funnel was deleted. A 10-minute soft lock during checkout is a
plausible addition to this pop-up, so it is flagged, not removed.

---

## The booking pop-up — the owner's new flow (2026-09-09)

The owner asked for the old reservation system to be removed **entirely**
and described its replacement: each car has a « Réserver » button; it
opens a pop-up in the middle of the screen; step 1 is the dates with the
total at the bottom and a next button; step 2 is a multi-choice of
delivery destinations *set from the admin with their prices*, plus other
options they can add later; step 3 is the confirmation, where the client
writes their full name and phone and sees the total with everything.
Reference screenshots followed for the LAYOUT (named step tabs, a car
card, a « Période de location » card with « Modifier », `+300,00 MAD`
rows with a tick, hatched unavailable days).

Not taken from the reference: online payment (plan §9.5 says none), the
competitor's trust badge, and their green — the palette stays on tokens.

### What was removed, in two commits before the build

Thirteen files: `/reservation`, `/reservation/confirmation` and the six
funnel components (prompt 09), the per-car quickbook sheet and
`/api/vehicle-calendar`, and two e2e specs. Then two orphans a sweep
found still pointing at the deleted addresses, `BookingForm.js` and
`VehicleQuote.js`, neither of which was rendered anywhere.

Kept deliberately: the `reservations` table, the availability RPCs,
`/api/quote`, `/api/availability`, `pricing.js` and the whole admin. Those
are not "the way of reservation" — 34 admin files and 10 migrations run on
them. Migration 0013 stayed too; only its route had gone, so restoring
`/api/vehicle-calendar` for the new calendar was a file, not a migration.

### The admin half already existed

Nothing new was needed for "I set the destinations and their prices, and
add other options later". Prompt 12 shipped it: `locations` rows carry
`delivery_fee_mad`, `save_location()` writes them with a mandatory reason,
and `/admin/tarifs` has « Ajouter le lieu » and « Ajouter l'option ». The
pop-up simply READS that catalogue at open time through the new
`/api/booking-options`, so a row added in the dashboard reaches customers
with no deploy and the component knows nothing about any given option.

### A production pricing bug, found by running the endpoint

Every delivery destination was quoting **0 MAD**. `locations` has two fee
columns: `delivery_fee_mad`, which the admin writes, and the starter's
`fee`, `numeric default 0`. The adapter read `deliveryFeeMad ?? fee ??
null` — so an unpriced place answered 0 — and `deliveryFeeFor()` then
computed `Number(null ?? null)`, which is 0 as well. The live table is
exactly that shape:

```
key                       kind       fee   delivery_fee_mad
agence-zerktouni          agency     0     0        <- genuinely free
aeroport-mohammed-v       airport    0     null     <- « sur devis »
maarif / anfa / ain-diab / centre-ville / casa-voyageurs / sidi-maarouf
                          district   0     null     <- « sur devis »
```

So the site was promising free delivery to Aïn Diab, to Anfa and to
Mohammed V, and the agency would have had to absorb the cost or charge at
the counter for something the page never showed — rule 11 and rule 4 in
one line. Migration 0002 had the rule right when it backfilled only
`where fee > 0`; that test now lives in `deliveryFeeOf()` and both call
sites go through it.

Why every existing test missed it: each one builds a location by hand with
a single `deliveryFee` key, and on that shape `deliveryFee ??
deliveryFeeMad` is `null ?? undefined` = undefined, which reads correctly
as "unset". A row off the wire carries BOTH keys, both null. The new tests
use a real row.

### Two bugs found by running the UI rather than reading it

- **« Continuer vers les détails » submitted the form.** React reused one
  `<button>` for next and submit, `setStep` flushed synchronously during
  the click, and the browser ran that click's default action on the node
  it had just turned into a submit button. Step 3 opened with "indiquez
  votre nom complet" under a field nobody had been given the chance to
  fill. Fixed with distinct keys; pinned by a test.
- **The calendar never filled in development.** The month dedupe lives in
  a ref, which survives an effect teardown, while the `alive` flag does
  not — so under StrictMode the second pass skipped the fetch the first
  pass had already disowned. All three effects now let their answers land.

Also fixed while looking at screenshots: `.text-meta` is a LABEL style
(uppercase, 0.12em tracking) and had been used on car names and whole
sentences; red was on the progress bar, the period card AND the primary
button, past the 5% of rule 2; and a Latin street address inside the
Arabic page reordered to "boulevard Zerktouni 356" until it was wrapped
in `<bdi>`.

### Verified

Build passes · lint at the 9-error baseline (10 → 9: one error lived in a
deleted orphan) · **111/111 unit** (99 + 9 for `locations` + 2 for the
real-row fee shape) · contrast, messages (803 keys × 4), css and
i18n-keys all pass.

`tests/e2e/reserve.spec.js` passes in **both** data modes. It drives the
full submit on the demo store — asserting a real `DC-…` reference — and
stops at an armed confirm button when `/api/health` reports `supabase`,
so a test run cannot leave fake customers in the agency's Postgres
(rule 10). Confirmed afterwards that it did not: the test phone is absent
from the live `customers` table.

Screenshots checked at every step in light, dark and Arabic RTL.

### Open

- The delivery destinations all read « sur devis » until the owner sets
  their prices on `/admin/tarifs` → Lieux. That is now the truth rather
  than a wrong 0, but it is the one thing waiting on the owner.
- `extras` is empty in the live database, so step 2 shows "aucune option".
  Adding one on `/admin/tarifs` makes it appear with no deploy.
- « Réserver » is on the vehicle page. Whether it should also sit on every
  fleet CARD is a judgement call left open: the card is a server component
  with a whole-card overlay link, so a button there needs care.

---

## Fix — the button sweep never reversed in Arabic (2026-09-08)

**Symptom** (reported from `npm run dev`, any URL, any locale): the dev overlay refused
`src/styles/globals.css` outright — *Parsing CSS source code failed … Unexpected token in
attribute selector: Dimension { value: 0.1, unit: "s_var" }* at line 3832 of the generated
stylesheet. `npm run build` had never failed on it; it printed *Found 2 warnings while
optimizing generated CSS* and carried on.

**Cause.** One line of `globals.css` targeted a Tailwind arbitrary-value utility by writing
the class name straight into a selector, unescaped:

```text
[dir="rtl"] .motion-safe<COLON>animate-<the animation shorthand in brackets> { … }
```

(written here with the colon and the brackets spelled out on purpose — see the
second fix below for why a real class name in a comment is itself a bug)

CSS reads `:animate-` as a pseudo-class and `[button-sweep_1.1s…]` as an attribute selector,
so this is not a wrong rule — it is not a rule. Lightning CSS (what Turbopack parses CSS with)
dropped it and warned; `next dev` refused the sheet. **The consequence nobody had noticed: the
RTL mirroring it existed to perform had never once applied.** Plan §4.12 requires motion
direction to reverse in Arabic; the sweep inside every busy button ran left-to-right in all
four languages since the rule was written.

**Fix.** A real class, which is what the other three RTL reversals in the same file already use
(`.road-dash`, `.vcard-scan`, `.redline-loading`):

```css
.btn-sweep { animation: button-sweep 1.1s var(--ease-inout) infinite; }
[dir="rtl"] .btn-sweep { animation-direction: reverse; }
```

`Button.js` and `BookingWidget.js` now use `btn-sweep`. The `motion-safe:` variant is dropped
because the global `prefers-reduced-motion` block already zeroes every duration and iteration
count (rule 6) — the same thing `.road-dash` relies on, and its comment says so.

**Second fix, same day: the guard was checking the wrong file.** The first version of
`scripts/check-css.mjs` parsed the stylesheet *as written*. That is not where Tailwind bugs
live. Tailwind v4 scans EVERY file in the project for anything that looks like a class name -
including code comments, including that script's own header, where the broken selector had been
pasted as an illustration with `var(...)` abbreviated. Tailwind dutifully generated a utility
for it, `animation: button-sweep 1.1s var(...)`, which is not valid CSS, and the build failed
on a rule no human wrote at a line in a file that does not exist on disk. The source-only guard
passed the whole time.

`check:css` now runs in two stages: the sheet as written, then the sheet **after the real
PostCSS + Tailwind pipeline has generated it**. Proved by re-introducing the exact string in a
scratch file: the guard fails with the build's own message (`Unexpected token Delim('.')` at
generated line 2898) and passes when it is removed. The remaining illustrations in this file and
in `globals.css` are now written in prose for the same reason.

The lesson, which is the actual finding: **a comment in this repo is executable.** A plausible
class name written anywhere - a `.js`, a `.mjs`, a `.md` - becomes CSS.

**Guard.** `npm run check:css` (new, `scripts/check-css.mjs`) parses every stylesheet with
Lightning CSS — already inside Tailwind v4, so no new dependency — and fails on any warning
that is not one of Tailwind's own at-rules. It exits 1 on the old file and 0 on the new one.
Added to the definition of done.

**Verified:** the built CSS now contains `[dir=rtl] .btn-sweep{animation-direction:reverse}`;
before the fix that rule was absent from the output entirely. build pass · lint at the 10-error
baseline · 92/92 unit · contrast, messages and css all pass · **101/101 e2e**.

---
## PROMPT 12 notes — 2026-09-08

**The closed loop, measured on the live database, not assumed.** `free_units()` for one model across the loop:

| Step | free units | unit | reservation |
|---|---|---|---|
| before | 2 | available | — |
| booked + confirmed | 1 | available | confirmed |
| **complete_pickup** | 1 | **rented** | **active** |
| **complete_return** | held by the cleaning block | **cleaning** | **returned** |
| **mark_unit_ready** | **back on sale** | **available** | returned |

Why a block and not the status: `unit_is_bookable()` (0008) is period-blind — it excludes maintenance | blocked | out_of_service for EVERY window, past and future. Adding `cleaning` there would take a car being wiped down this afternoon off sale for next month too. Availability is a question about a PERIOD, so the answer is period-shaped: `complete_return` writes a `blocks` row of kind `cleaning` for `[now, now + settings.cleaning_minutes)`, `mark_unit_ready` deletes it, and `refresh_cleaning_blocks()` (pg_cron every 10 min, or `/api/cron/expire-reservations`) re-extends it while the status is still `cleaning`. If the cron never runs, the exposure is bounded by the same prep buffer the whole engine already trusts — stated, not hidden.

**Two pre-existing bugs found by the loop test, both real, both fixed in the file that owns them.**

1. **Every write to `blocks` had been failing since PROMPT 06.** `touch_availability_ping()` (0008) resolved `new.vehicle_id` inside a `CASE`; plpgsql plans the whole expression up front, `blocks` has no such column, and the AFTER trigger raised `record "new" has no field "vehicle_id"` — aborting the write. Prompt 11's « + Bloc » never worked; its only caller wrapped the insert in a `catch`. Rewritten through `to_jsonb()`.
2. **PROMPT 04's `log_reservation_transition()` already writes PICKUP/RETURN events**, so the checklists were producing two rows per handover in an append-only evidence table. The checklists now raise a transaction-local flag (`app.skip_transition_event`) and the trigger stands aside; it still fires for every other path.

**Migration `0012_fleet_ops_content.sql`** (applied): `vehicle_photos` table (public read, staff write); `settings.{auto_expire_hours, cleaning_minutes, deposit_by_category, sla, last_backup_at, payment_methods, verified_claims}`; `reservations.payment` (what was actually taken at the counter, audited); RPCs `save_vehicle`, `save_unit`, `set_unit_status`, `save_vehicle_photo`, `delete_vehicle_photo`, `reorder_vehicle_photos`, `unit_dossier`, `operations_day`, `complete_pickup`, `complete_return`, `mark_unit_ready`, `refresh_cleaning_blocks`, `expire_unconfirmed_reservations`, `save_season`, `save_extra`, `save_location`, `save_settings`, `save_faq`, `save_review`, `admin_delete` (literal whitelist), `system_metrics`. Audit triggers extended to seasons, extras, locations, faqs, reviews, posts, vehicle_photos. Verified as anon: every guarded function answers FORBIDDEN / `[]` / `null`.

**Rule 11 with teeth.** `public_settings` now NULLs `google_rating`, `google_review_count` and `founded_year` unless `verified_claims` marks them true — enforced in the VIEW, so no component can leak an unverified number even by asking for it. Consequence: « depuis 2013 » and the Google rating are OFF the public site until someone ticks « vérifié » in Paramètres. Plan §12.10 lists that claim as unconfirmed; this is the rule working. The demo adapter mirrors the gate (tested).

**`save_vehicle` / `save_unit` PATCH rather than overwrite** (proved: a partial save keeps `minDays`, `prepBufferMinutes`, `purposeTags`, mileage and fuel). Without this an older form would have reset the prep buffer — the thing that stops the same car being promised thirty minutes after a return — every time somebody fixed a typo.

**Images: no server processing anywhere.** `src/lib/images/browser.js` decodes, resizes on a canvas, encodes WebP at 480/768/1080/1600/2000 (never upscaling) plus a JPEG fallback and a 24 px blur, then uploads straight to the `vehicles` bucket. Inspection photos and signatures go to the private `inspections` bucket, read back through 15-minute signed URLs. `CarImage` renders a build-time manifest photo and an uploaded row with identical markup; the fleet, results, vehicle and airport pages now thread `vehicle_photos` through, one query per page.

**Admin routes now real:** `/flotte`, `/flotte/[id]` (content ×4, specs, purpose tags, prices, publish, photo manager), `/flotte/unites`, `/flotte/unites/[id]` (Aperçu · Timeline with evidence thumbnails · Réservations · Blocs · Documents placeholder), `/operations/departs`, `/operations/retours` (with overdue and à préparer), `/operations/checklist/[id]?mode=pickup|return` (three ticks, SVG condition map with 19 keyboard-reachable zones, photos, signature canvas, payment record), `/contenu/faq` (×4 languages, short + long answer, category/city/vehicle), `/contenu/avis` (first name + initial, sample flag explained), `/contenu/blog` list, `/tarifs` (seasons, unlimited tiers, extras, deposit by category, delivery per place, misc fees — every write with a reason), `/parametres` (agency, repeatable hour bands, legal/CNDP, trust numbers with « vérifié », SLA ×4, auto-expiry, cleaning minutes, backup date), `/systeme` (DB and storage against the free limits, counts, honest « not readable from here » for Workers requests and Resend quota), `/seo` (+ OG regeneration instructions). `/vehicules*` and `/avis` redirect.

**Fixed after the agents' cross-review** (each flagged in a file it did not own): `toCamel` never converted `is_24h`; `listLocations` returned `deliveryFeeMad` while the booking module read `deliveryFee`, so **every place rendered « sur devis » in production** while working in demo; `listVehicles`/`getVehicleById` read as anon so the admin could not see drafts; `save_settings` skipped `lat`/`lng`; `payment_methods` missing from `public_settings`; `unit_dossier` key naming; nav shortcut and role gating; a duplicate `upsertUnit` export that broke the build. Prompt 11's four reservation actions and the block delete gained zod (rule 1). Deleted as orphans: `VehicleForm.js`, `SettingsForm.js`, `BookingStatusForm.js` and twelve dead FormData actions in `actions/admin.js`.

**Checks**

| Command | Result |
|---|---|
| `npm run build` | pass — every new route registered |
| `npm run lint` | 10 errors, 1 warning — the pre-existing baseline; **zero raw hex in 65 changed files** |
| `npm test` | **92 / 92** (+6: deposit by category, verified-claims gate) |
| `npm run check:contrast` / `check:messages` | pass / pass (764 keys × 4) |
| live DB: closed loop, 22-RPC surface, anon refusals, patch semantics | all verified, fixtures removed |
| `tests/e2e/loop.spec.js` | **1 passed (16.1 s)** — site booking → assign → confirm → départ → retour → prête → bookable again |
| `npm run test:e2e` | **62 passed · 1 flaky (the /en homepage sub-resource 404, green on retry) · 0 failed** — including the new closed-loop test |

**NOT DONE / open — stated plainly**

| Item | Status |
|---|---|
| Adversarial audit workflow | **Did not run** — all six reviewers hit the session limit before starting. The security pass was done by hand instead (every action gated + zod, no secret in a client bundle, no raw hex, ConditionMap keyboard-reachable). Re-run the workflow when the limit resets |
| A location's own `delivery_fee_mad` | Not charged by `quote()` yet — it still derives delivery from the settings fee by category. Zero customer impact today (no `city` places exist), but Rabat at 400 MAD will need `quote()` to take the resolved place's fee. Prompt 13 or 15 |
| Numeric settings cannot be CLEARED | `save_settings` keeps the old value on a blank numeric; the supported way to remove a trust number is to untick « vérifié » |
| Public FAQ still reads the legacy `answer` | `save_faq` mirrors the long answer into it so nothing breaks; the short AEO answer reaches the FAQ page and JSON-LD in prompt 13 |
| Web Push transport | unchanged from PROMPT 10 |
| Lighthouse | not re-measured; one extra public-read query on four ISR pages — check in prompt 15 |
| Cron for the new sweeps | `expire_unconfirmed_reservations` and `refresh_cleaning_blocks` are scheduled in pg_cron by 0012 and exposed at `/api/cron/expire-reservations`; the Vercel Cron entry lands with the deploy prompt |

---

## PROMPT 11 notes — 2026-09-08

**The whole point: the admin has no side door.** Every operational write goes through an RPC that
re-checks `is_staff()` and re-runs the same conflict test the exclusion constraint would: a booking
taken at the counter for the last car is refused with the same message and the same alternatives a
customer gets, and a bar dragged onto another booking on the calendar does not move. Two Playwright
tests exist to say exactly that, and both pass.

**Closed from PROMPT 10.** `/admin/reservations` now reads the real `reservations` table instead of
the legacy `bookings` one, and the global search box finally does something: `?q=` matches a
reference, a customer name, a phone, an e-mail or a model. `/calendrier` and `/clients` are real
pages, not placeholders.

**Security fix found while writing 0010.** `has_role()` returned `NULL` for a caller with no JWT,
because `NULL = any(roles)` is NULL, not false. In plpgsql `if not NULL then …` does **not** fire, so
a guard written as `if not can_manage_pricing() then return FORBIDDEN` FELL THROUGH to the privileged
path — `override_reservation_price` succeeded unauthenticated. Fixed with `coalesce(…, false)` in
`0005_roles_rls.sql`; verified: `has_role('{owner}')` → false and `can_manage_pricing()` → false with
no JWT, and all four customer functions in 0011 answer `FORBIDDEN`/`[]`/`null` to `anon`.

**Migrations applied to the live database.**

| File | Contents |
|---|---|
| `0010_reservation_ops.sql` | `reservation_next_states`, `set_reservation_status`, `assign_reservation_unit`, `move_reservation`, `override_reservation_price`, `units_free_for_reservation`, `calendar_rows`. `authenticated` only, each re-checking its own guard |
| `0011_customers.sql` | `phone_key` (+ index), `customer_duplicates`, `customer_profile`, `set_customer_notes`, `merge_customers` |

**Why each operation is ONE RPC.** `set_reason()` is transaction-scoped and PostgREST runs one
transaction per request, so "set the reason, then write" from the app would lose the reason before the
audit trigger ever saw it. Verified end to end: the reason reaches `audit_log` for a status change, a
price override, a date move and a customer merge.

**Conflicts are answers, not errors.** Every RPC looks the conflict up *before* it writes, so the
payload names the booking in the way and its dates — « CONFLIT — DC-260908-XXXX occupe déjà cette
voiture du 10 au 15 sept » — which is what lets an operator solve the problem. The server actions
return these outcomes instead of throwing.

**The calendar is plain CSS grid and pointer events**, no library (rule 9). Drag-to-move and
drag-to-resize are expressed as a whole number of SLOTS, never as an absolute snap, so a 10:00 pick-up
is still 10:00 after being dragged a day later. Optimistic: the bar moves, Postgres is asked, and a
refusal drops the override so the bar returns to where the database says it is. The window maths lives
in `src/lib/calendar.js` with 20 tests against a fixed +01:00 Casablanca, so a server in UTC and a
laptop in Casablanca draw the same grid.

**Duplicate clients.** `customers.phone` is UNIQUE, so exact duplicates cannot exist — which is
precisely why the real ones do: `+212612345678` and `0612345678` are one human and three different
values. `phone_key()` (last nine digits) finds them; the merge moves the reservations first, then
deletes, inheriting only what the survivor was missing. `customers` carries no audit trigger on
purpose (every public booking inserts one, and copying names and numbers into `audit_log` each time
would duplicate the customer table), so the merge writes its own journal row — by id and count, with
the reason, no PII.

**Verified on the live database**

| Check | Result |
|---|---|
| anon calling the four 0011 functions | `[]`, `null`, `FORBIDDEN`, `FORBIDDEN` |
| `phone_key('+212 612-345678') = phone_key('0612345678')` | true |
| merge without a reason / onto itself | `REASON_REQUIRED` / `SAME` |
| merge of two files, one with a reservation | ok, `moved: 1`, survivor inherited the e-mail, notes joined, dropped row gone |
| journal after the merge | `DELETE` on `customers` with actor `57b71502…` and reason « fusion doublon », body = ids + count only |
| audit reason on the moved reservation | « doublon telephone » |

**Checks**

| Command | Result |
|---|---|
| `npm run build` | pass |
| `npm run lint` | 10 errors, 1 warning — **exactly the pre-existing baseline**; every new file lints clean |
| `npm test` | **86 / 86 pass** (was 66; +20 from `src/lib/calendar.test.js`, plus the adapter-parity assertions picking up the new methods) |
| `npm run check:contrast` | pass — 56 / 56 |
| `npm run check:messages` | pass — 764 leaf keys × 4 locales |
| `npm run test:e2e` | 59 passed · 2 flaky (home 404 on a sub-resource, green on retry) · 1 flaky-to-failing: see below |

**NOT DONE / open — stated plainly**

| Item | Status |
|---|---|
| The bell Realtime test | `admin.spec.js › a new reservation raises the bell without a reload` is **intermittent**. Alone it passes in ~6 s; after the five earlier tests in the same file it sometimes times out. Investigated rather than papered over: the notification trigger still fires (probed directly on the live DB — row created, `unread`), and the DOM shows no unread badge, so the `postgres_changes` event is not being delivered, not the trigger failing. A longer timeout does not fix it, so the timeout was reverted. Pre-existing from PROMPT 10; not caused by this prompt |
| Web Push transport | Still not built — unchanged from PROMPT 10 |
| `/operations/checklist/[id]`, `/flotte/unites/[id]` | Still no page (PROMPT 12) |
| `/blocs` page | Blocks can now be created and deleted from the calendar; the standalone `/blocs` list is still a placeholder (PROMPT 12) |
| Staff booking form | Deliberately quote-then-create, and the create button locks again if any pricing field changes. It does **not** yet offer extras quantities or a delivery address field |
| Lighthouse | Not re-measured; the admin is not in the public performance budget |

---
## Inventory — every route, component, lib module and asset

167 files · **keep 76** · **rebuild 61** · **extend 26** · **delete 4** · 76 done / 91 todo

| Area | Path | Public URL (FR) | Purpose | Plan §10 | Why | Sprint | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| Public route | `src/app/(site)/[locale]/[...rest]/page.js` | `/fr/*` | Catch-all inside locale segment; renders localized 404 | **keep** | §10 'Routing, locales, geo default, bots… => Keep (add new page keys)' | — | done | Four-line file; unaffected by rebrand |
| Public route | `src/app/(site)/[locale]/a-propos/page.js` | `/fr/a-propos` | About page: story, values, stats, WebPage schema | **extend** | §8.2 About template (AboutPage schema); §11 Sprint 5 | 5 | todo | Emits WebPage not AboutPage; 'depuis 2013' still unverified (§12.10) |
| Public route | `src/app/(site)/[locale]/aeroport/page.js` | `/fr/location-voiture-aeroport-casablanca` | Airport CMN page: facts, steps, fleet, FAQ, Service schema | **rebuild** | §4.8 airport spec + §8.2 Airport template; §11 Sprint 5 'Airport page' | 5 | todo | Needs runway animation, prefilled booking module, verified meeting-point and fee facts |
| Public route | `src/app/(site)/[locale]/avec-chauffeur/page.js` | `/fr/location-voiture-avec-chauffeur-casablanca` | Chauffeur service page with pricing tiers and lead form | **keep** | §3 URL map — **confirmed** as a real service by Diab Car's own announcement (Sept 2026); now P1 | 5 | done | Service confirmed; the 350 MAD transfer and 0.6x half-day figures on the page are still invented — rule 11, fix in PROMPT 13 |
| Public route | `src/app/(site)/[locale]/blog/[slug]/page.js` | `/fr/blog/[slug]` | Blog article: markdown body, breadcrumbs, related posts | **extend** | §10 tokens row: 'delete … zellige … gold plate'; Markdown/Breadcrumbs row = Keep | 0 | todo | Uses gold `plate` and `zellige` classes; Article JSON-LD already present |
| Public route | `src/app/(site)/[locale]/blog/page.js` | `/fr/blog` | Blog index listing published posts with covers | **extend** | §10 tokens row: 'delete btn-gold, text-gradient-gold, zellige, arch, gold plate' | 0 | todo | Uses gold `plate` class; PageHero under it is rebuilt |
| Public route | `src/app/(site)/[locale]/conditions/page.js` | `/fr/conditions-generales-de-location` | Rental terms page, ten sections from messages | **keep** | §10 silent on legal routes; content is message/settings-driven; §11 Sprint 6 content freeze | 6 | done | Cancellation and modification policy still pending from Diab Car (§12.5) |
| Public route | `src/app/(site)/[locale]/confidentialite/page.js` | `/fr/politique-de-confidentialite` | Privacy policy page, six sections from messages | **extend** | §9.4 CNDP: receipt number, consent and transfer wording; §11 Sprint 6 | 6 | todo | Must print CNDP receipt number and out-of-Morocco transfer wording |
| Public route | `src/app/(site)/[locale]/contact/page.js` | `/fr/contact` | Contact page: NAP, map embed, lead form | **extend** | §8.2 Contact template: AutoRental JSON-LD with openingHoursSpecification | 5 | todo | Currently emits WebPage schema; NAP must match GBP exactly (§8.3) |
| Public route | `src/app/(site)/[locale]/faq/page.js` | `/fr/faq` | FAQ page grouping accordions by category | **extend** | §8.5 answer database + §8.2 FAQ template; §11 Sprint 5 | 5 | todo | Categories derived ad hoc; §8.5 wants tagged 60/40/30/20 question set |
| Public route | `src/app/(site)/[locale]/layout.js` | `/fr/*` | Locale shell: providers, header, footer, fonts, business JSON-LD | **extend** | §10 providers row = Keep (tokens change under them) + tokens/fonts row = Rebuild | 0 | todo | themeColor now BLACKLINE; Header/Footer/WhatsAppFab still rebuild in Sprint 1. |
| Public route | `src/app/(site)/[locale]/longue-duree/page.js` | `/fr/location-voiture-longue-duree-casablanca` | Monthly rental page: tiers, lead form, FAQ | **extend** | §3 P1 key /longue-duree; §11 Sprint 5 scope 'longue durée' | 5 | todo | FR slug differs from §3 (/location-longue-duree-casablanca); monthly prices fall back to hardcoded |
| Public route | `src/app/(site)/[locale]/mentions-legales/page.js` | `/fr/mentions-legales` | Legal notice printing company identity from settings | **keep** | §10 schema/seed row: 'fix contacts … mark unverified numbers' (data, not page) | 6 | done | RC, ICE and capital come from settings; values await confirmation (§12.5) |
| Public route | `src/app/(site)/[locale]/not-found.js` | — | Localized 404 screen with fleet and home CTAs | **keep** | §10 'Reveal, Price, providers… => Keep (tokens change under them)' | 0 | done | Only kit/token refresh; copy should follow §4.13 state wording |
| Public route | `src/app/(site)/[locale]/page.js` | `/fr` | Homepage composing hero and all marketing sections | **rebuild** | §10 'Header, Footer, Hero, HeroTitle, HomeSections… => Rebuild'; §11 Sprint 1 | 1 | todo | Section order respecified in §4.3; booking module replaces current Hero widget |
| Public route | `src/app/(site)/[locale]/reservation/confirmation/page.js` | `/fr/reservation/confirmation` | Booking confirmation with reference, summary, WhatsApp link | **rebuild** | §4.7 confirmation sequence; §11 Sprint 3 'confirmation sequence; emails' | 3 | todo | Already noindex; needs 1.4s reveal, .ics export and staff SLA |
| Public route | `src/app/(site)/[locale]/reservation/page.js` | `/fr/reservation` | Booking funnel page hosting client BookingForm | **rebuild** | §10 'BookingForm … => Rebuild' (zod schema reused); §4.7 four-step funnel; Sprint 3 | 3 | todo | No hold, no step progress today; needs Turnstile and server re-quote |
| Public route | `src/app/(site)/[locale]/vehicules/[slug]/page.js` | `/fr/location-voiture-casablanca/[slug]` | Vehicle detail: specs, quote panel, similar cars | **rebuild** | §10 'VehicleCard, VehicleQuote … => Rebuild' + known-bugs row (mileage label); §4.6; Sprint 3 | 3 | todo | Gold Badge tone, `plate` and `zellige` classes; mileage label duplication bug |
| Public route | `src/app/(site)/[locale]/vehicules/page.js` | `/fr/location-voiture-casablanca` | Fleet listing with filters, booking widget, ItemList schema | **rebuild** | §10 'VehicleCard, BookingWidget, FleetFilters … => Rebuild'; §4.4 results page; Sprint 3 | 3 | todo | Parametrised URLs not noindex yet; no live availability counts |
| Public route handler | `src/app/(site)/[locale]/og/route.js` | `/fr/og` | Runtime Open Graph card renderer per locale | **rebuild** | §10 Logo row: 'OG renderer src/lib/og.js => Rebuild'; §8.7 'OG image route per locale (recolour)' | 0 | done | Unchanged surface; the renderer under it was recoloured. |
| App root — SEO | `src/app/llms.txt/route.js` | `/llms.txt` | Plain-text site map for AI assistants | **keep** | §10 'llms.txt … => Keep'; §8.2 'llms.txt (exists) kept as a courtesy' | 5 | done | Hardcoded prices, ages and policies must stay verifiable (rule 11) |
| App root — SEO | `src/app/manifest.js` | `/manifest.webmanifest` | PWA web manifest: name, icons, theme colour | **keep** | §10 'sitemap/robots/manifest … => Keep'; §8.7; colours from §2 | 0 | done | Icons: /icons/icon-192, icon-512, maskable-512, apple-icon; theme #080808. |
| App root — SEO | `src/app/robots.js` | `/robots.txt` | robots.txt allowing search and AI answer crawlers | **keep** | §10 'sitemap/robots/manifest, llms.txt, IndexNow … => Keep'; §8.7 | 5 | done | Already disallows /admin, /api/ and parametrised fleet URLs |
| App root — SEO | `src/app/sitemap.js` | `/sitemap.xml` | Sitemap with hreflang alternates for every locale | **keep** | §10 files column names src/app/sitemap.js => Keep | 5 | done | Add P1 keys (automatique, suv, quartiers, livraison) once those routes exist |
| App root — icon | `src/app/favicon.ico` | `/favicon.ico` | Legacy ICO favicon served at site root | **rebuild** | §10 Logo group (Rebuild); §11 Sprint 0 'logo assets (badge SVG, wordmark, favicon, OG)' | 0 | done | Regenerated from the real mark: 16/32/48 PNG-in-ICO. |
| App root — icon | `src/app/icon.svg` | `/icon.svg` | Site icon SVG, current gold star mark | **rebuild** | §10 Logo row names src/app/icon.svg => Rebuild (badge SVG + wordmark) | 0 | done | Real mark, white on brand red, PNG inlined in SVG until vector artwork exists. |
| App root — API | `src/app/api/health/route.js` | `/api/health` | Health endpoint reporting data mode and business name | **keep** | §10 silent; §9.2 6-hourly keep-alive ping, §9.6 free-limit observability | 6 | done | Keeps free Supabase project from pausing; wire to Cloudflare Cron |
| App root — API | `src/app/api/indexnow-key/route.js` | `/api/indexnow-key` | Serves IndexNow key file for engine verification | **keep** | §10 'IndexNow … => Keep'; §8.6 'Bing Webmaster + IndexNow (exists)' | 5 | done | Reads key from settings or INDEXNOW_KEY env; 404 when unset |
| Admin route | `src/app/(admin)/admin/avis/page.js` | `/avis` | Customer reviews table with add and delete forms | **rebuild** | §10 "Rebuild IA to section 7"; §3 admin map moves it to /contenu/avis | 4 | todo | Route moves under /contenu; sample reviews removed from production (§10 schema row) |
| Admin route | `src/app/(admin)/admin/contenu/blog/[id]/page.js` | `/contenu/blog/[id]` | Blog post editor route wrapping PostForm, delete action | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 Contenu: blog | 4 | todo | Handles id=new; delete needs audit row with actor and reason |
| Admin route | `src/app/(admin)/admin/contenu/blog/page.js` | `/contenu/blog` | Blog article list with new and edit links | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 Contenu: blog | 4 | todo | Keep the list/edit pattern; add role gate and activity logging |
| Admin route | `src/app/(admin)/admin/contenu/faq/page.js` | `/contenu/faq` | FAQ list plus four-language inline question editor | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 Contenu: FAQ database (categories, city, vehicle) | 4 | todo | Needs city and vehicle scoping; answer-block content produced in Sprint 5 |
| Admin route | `src/app/(admin)/admin/login/page.js` | `/login` | Login route rendering LoginForm with data mode | **rebuild** | §10 "Rebuild IA to section 7"; §3 admin URL map lists /login | 4 | todo | Route survives rename-free; needs role claim from §7.2 auth hook |
| Admin route | `src/app/(admin)/admin/page.js` | `/` | Dashboard: four stat tiles and recent bookings table | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 dashboard (today, ACTION REQUISE, timeline) | 4 | todo | Missing ACTION REQUISE list and today's départs/retours operations timeline |
| Admin route | `src/app/(admin)/admin/parametres/page.js` | `/parametres` | Settings route loading agency settings into SettingsForm | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 Paramètres (agency facts, hours, legal texts, CNDP) | 4 | todo | Owner/manager only under RLS; add CNDP receipt and legal texts |
| Admin route | `src/app/(admin)/admin/reservations/[id]/page.js` | `/reservations/[id]` | Booking detail: customer, rental, breakdown, WhatsApp confirm | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 detail + state machine with reason | 4 | todo | State changes need event and audit rows with actor and reason |
| Admin route | `src/app/(admin)/admin/reservations/page.js` | `/reservations` | Bookings list with status filter chips and links | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 Réservations list (filters, search) | 4 | todo | No text search, date filters, or staff-create with conflict check |
| Admin route | `src/app/(admin)/admin/seo/page.js` | `/seo` | SEO tools, technical file links, offsite GEO checklist | **rebuild** | §10 "Rebuild IA to section 7", explicitly keeping the revalidate/IndexNow tools; §3 lists /seo | 4 | todo | Tools kept as-is; checklist content re-authored against §8.3 in Sprint 5 |
| Admin route | `src/app/(admin)/admin/tarifs/page.js` | `/tarifs` | Pricing tiers, seasons, extras and delivery fees editor | **rebuild** | §10 "Rebuild IA to section 7"; §7.1 Tarifs (saisons, extras, remises, caution, livraison) | 4 | todo | Must be RLS-hidden from agent role (§7.2); add deposit management |
| Admin route | `src/app/(admin)/admin/vehicules/[id]/page.js` | `/vehicules/[id]` | Vehicle edit route wrapping VehicleForm with delete action | **rebuild** | §10 "Rebuild IA to section 7"; §3 renames to /flotte/[id] plus /flotte/unites/[id] | 4 | todo | Needs units (plate, mileage, fuel), photo variant generation, blocks |
| Admin route | `src/app/(admin)/admin/vehicules/page.js` | `/vehicules` | Fleet table: photo, category, price, deposit, status | **rebuild** | §10 "Rebuild IA to section 7"; §3 admin map renames this to /flotte | 0, 4 | todo | Uses gold `plate` class deleted in Sprint 0; models/units split needed |
| Admin infrastructure | `src/app/(admin)/admin/layout.js` | — | Admin root HTML layout: fonts, theme, intl, shell | **rebuild** | §10 row "Admin shell + pages \| src/components/admin/*, src/app/(admin)/* \| Rebuild IA to section 7" | 0, 4 | todo | themeColor now BLACKLINE; admin IA still rebuilds in Sprint 4. |
| Admin infrastructure | `src/app/(admin)/admin/not-found.js` | — | Admin 404 fallback screen | **rebuild** | §10 row "Admin shell + pages … Rebuild IA to section 7" | 4 | todo | Trivial file; only token restyle plus dark/RTL pass needed |
| Admin component | `src/components/admin/AdminShell.js` | — | Sidebar nav, mobile drawer, header, theme toggle, logout | **rebuild** | §10 "Admin shell + pages … Rebuild IA to section 7"; §7.3 design language | 4 | todo | Nav lacks calendrier, opérations, clients, journal, notifications; no keyboard shortcuts or search |
| Admin component | `src/components/admin/BookingStatusForm.js` | — | Booking status select and internal notes update form | **rebuild** | §10 "Rebuild … keep server actions pattern, forms"; §7.1 state machine actions with reason | 4 | todo | useActionState pattern reused; every change needs event, audit, reason |
| Admin component | `src/components/admin/LoginForm.js` | — | Email/password admin login form with demo hint | **rebuild** | §10 "Admin shell + pages … Rebuild"; §7.2 roles via Supabase Auth | 0, 4 | todo | Uses btn-gold and zellige, both deleted in Sprint 0 rebrand |
| Admin component | `src/components/admin/PostForm.js` | — | Blog post form with four-language Markdown content tabs | **rebuild** | §10 "Rebuild … keep server actions pattern, forms"; §7.1 Contenu: blog | 4 | todo | Locale tab pattern worth reusing; cover limited to CAR_IMAGES illustrations |
| Admin component | `src/components/admin/SeoTools.js` | — | Revalidate site cache and IndexNow Bing ping buttons | **keep** | §10 same row's explicit carve-out "keep … revalidate/IndexNow tools"; §7.1 "SEO tools (existing: revalidate, IndexNow)" | 4 | done | Token restyle only; inherits btn-gold indirectly through ui.js SubmitButton |
| Admin component | `src/components/admin/SettingsForm.js` | — | Agency identity, contact, hours, legal and integrations form | **rebuild** | §10 "Rebuild … keep server actions pattern, forms"; §7.1 Paramètres | 4 | todo | Add CNDP receipt field; contact facts corrected per §10 schema row |
| Admin component | `src/components/admin/ui.js` | — | Admin primitives: PageTitle, Card, Stat, Table, badges | **rebuild** | §10 "Admin shell + pages … Rebuild"; §7.3 dense admin design language | 0, 4 | todo | btn-gold used twice; Sprint 0 gate requires no gold token remains |
| Admin component | `src/components/admin/VehicleForm.js` | — | Vehicle identity, pricing, features, photos, four-language descriptions | **rebuild** | §10 "Rebuild … keep server actions pattern, forms"; §7.1 Flotte models and units | 4 | todo | Model/unit split, plates, purpose tags and photo variants all missing |
| Site component — shell | `src/components/site/CookieBanner.js` | — | Consent-gated GA4 loader with accept/decline banner | **keep** | §10 row "…Cookie banner, JsonLd, Breadcrumbs, Markdown → Keep" | 0 | done | Uses btn-gold class; must move to red/neutral tokens. |
| Site component — shell | `src/components/site/CurrencyProvider.js` | — | MAD/EUR context, localStorage, CSS-driven price toggle | **keep** | §10 row "…Currency, Theme, Language… → Keep" | 0 | done | Default eurRate 10.8 hard-coded; verify or move to settings. |
| Site component — shell | `src/components/site/Footer.js` | — | Server footer: nav, services, contact, legal, hours | **rebuild** | §10 row "Header, Footer, Hero, … FaqAccordion → Rebuild" | 1 | done | 3 columns, full contact block, CNDP slot hidden while settings.cndpReceipt is empty. |
| Site component — booking | `src/components/site/RangeCalendarPanel.js` | — | Lazy-loaded react-aria RangeCalendar, locale-aware, RTL | **keep** | plan §4.2 range calendar; §5.4 "react-aria-components (calendar only)" | 1 | done | next/dynamic ssr:false — never in the initial homepage bundle |
| Dev tooling | `scripts/images.mjs` | — | Build-time AVIF/WebP car image pipeline + manifest | **keep** | plan §2.5 delivery sizes; §9.1 zero per-request CPU | 1 | done | Self-tested on a synthetic master; no real photos to process yet |
| Dev tooling | `tests/e2e/booking.spec.js` | — | Fills the booking module by keyboard in fr and ar | **keep** | PROMPT 03 task 8 | 1 | done | Asserts the ?pickup&dropoff&from&to search URL |
| Public asset | `public/images/cars/manifest.json` | `/images/cars/manifest.json` | Which photo angles exist per vehicle | **extend** | plan §2.5 | 1 | todo | Empty until docs/inputs/photos receives masters |
| Site component — home | `src/components/site/home/FleetSection.js` | — | Purpose tiles + fleet block, all 27 cards prerendered | **keep** | plan §4.3 §2–3 | 1 | done | Filtering toggles `hidden` on server-rendered cards: crawlable, ISR-safe, no refetch |
| Site component — home | `src/components/site/home/PurposeTiles.js` | — | Five usage tiles, set the filter and scroll to the fleet | **keep** | plan §4.3 §2 | 1 | done | Strings arrive as props — the 6.6 kB `home` namespace never ships to the client |
| Site component — home | `src/components/site/home/FleetGrid.js` | — | Client filter, six visible at a time | **keep** | plan §4.3 §3 | 1 | done | Queries the DOM per effect rather than caching a mutable list |
| Site component — home | `src/components/site/home/purposes.js` | — | Purpose → category map, shared server + client | **keep** | plan §4.3 §2 | 1 | done | Deliberately not 'use client': a client export reaches a server component as a reference, not a value |
| Site component — home | `src/components/site/home/purposeStore.js` | — | useSyncExternalStore for the active tile | **keep** | plan §4.3 §2 | 1 | done | Server snapshot null, so hydration cannot mismatch |
| Site component — home | `src/components/site/home/AirportBanner.js` | — | ATTERRIR. RÉCUPÉRER. ROULER. + scroll-driven runway | **keep** | plan §4.3 §4 | 1 | done | Only renders proof points settings can support; car crossing is PROMPT 14 |
| Site component — home | `src/components/site/home/HowItWorks.js` | — | Four numbered rows, red line grows on hover | **keep** | plan §4.3 §5 | 1 | done | Numbering is real sequence information, not decoration |
| Site component — home | `src/components/site/home/Trust.js` | — | Four big statements, verified facts only | **keep** | plan §4.3 §6; rule 11 | 1 | done | Renders nothing below two verified facts; rating/review count suppressed |
| Site component — home | `src/components/site/home/Reviews.js` | — | One large review, 01/05 counter, prev/next | **keep** | plan §4.3 §7 | 1 | done | Sample reviews render ONLY in demo mode; Google link only if the URL exists |
| Site component — home | `src/components/site/home/ReviewsCarousel.js` | — | The client island for the review carousel | **keep** | plan §4.3 §7 | 1 | done | Arrow keys, aria-live, RTL-correct direction |
| Site component — home | `src/components/site/home/DriveMorocco.js` | — | Drive Morocco section, localized server-side | **keep** | plan §4.3 §8 | 1 | done | Rows resolved to plain strings; a function prop cannot cross the RSC boundary |
| Site component — home | `src/components/site/home/MoroccoMap.js` | — | Inline SVG silhouette + the city list | **keep** | plan §4.3 §8 | 1 | done | Map wrapped in dir=ltr — RTL mirrors UI, not geography |
| Site component — home | `src/components/site/home/moroccoRoutes.js` | — | Static distance/time table from Casablanca | **keep** | plan §4.3 §8 | 1 | done | Marked approximate; only links to the one blog guide that exists |
| Site component — home | `src/components/site/home/FaqSection.js` | — | Five questions + FAQPage JSON-LD | **keep** | plan §4.3 §9 | 1 | done | Reuses the zero-JS FaqAccordion; schema matches the visible text (rule 8) |
| Site component — home | `src/components/site/home/CtaBand.js` | — | PRÊT À PRENDRE LA ROUTE ? + the two booking channels | **keep** | plan §4.3 §10 | 1 | done | Black in both themes via the `dark` class, no hexes |
| Site component — shell | `src/components/site/Header.js` | — | Sticky site header: nav, logo, theme, language, CTA | **rebuild** | §10 row "Header, Footer, Hero, … FaqAccordion → Rebuild" | 1 | done | Services dropdown, redline active state, full-screen mobile panel with the slide-then-navigate. |
| Site component — shell | `src/components/site/LanguageSwitcher.js` | — | Locale dropdown writing NEXT_LOCALE cookie, swapping route | **keep** | §10 row "…Theme, Language, Cookie banner… → Keep" | 0 | done | Token-only changes; language view transition added in sprint 6. |
| Site component — shell | `src/components/site/Logo.js` | — | Logo wordmark plus gold gradient mark SVG | **rebuild** | §10 row "Logo → Rebuild (badge SVG + wordmark)" | 0 | done | Real mark (light/dark cuts) + Archivo wordmark; LogoLockup for the footer; LogoMark alias kept. |
| Site component — shell | `src/components/site/MotionProvider.js` | — | LazyMotion strict wrapper with reduced-motion MotionConfig | **keep** | §10 silent; matches locked stack §5.4 (Motion 13, LazyMotion strict) | 0 | done | Only the easing constant changes when motion tokens land. |
| Site component — shell | `src/components/site/ThemeProvider.js` | — | next-themes provider, class attribute, system default | **keep** | §10 row "…Theme, Language… → Keep (tokens change under them)" | 0 | done | Unchanged; the theme view-transition work sits in ThemeToggle. |
| Site component — shell | `src/components/site/ThemeToggle.js` | — | Dark/light toggle using startViewTransition and masked icon | **keep** | §10 "Theme" keep group (provider named, toggle implied); §11 sprint 0 theme transition | 0 | done | Hard-coded theme-color hexes violate token rule; swap for §2 values. |
| Site component — shell | `src/components/site/WhatsAppFab.js` | — | Floating WhatsApp button hidden on funnel pages | **rebuild** | §10 row "…, Marquee, WhatsAppFab, FaqAccordion → Rebuild" | 3 | todo | Currently hidden on vehicle pages to dodge overlap bug; fix properly. |
| Site component — home | `src/components/site/Hero.js` | — | Homepage hero: title, CTAs, trust counters, booking widget | **rebuild** | §10 row "Header, Footer, Hero, HeroTitle… → Rebuild" | 1 | done | WOW 1 ignition, plain <img> LCP element with a hinted preload, verified-only trust strip. |
| Site component — home | `src/components/site/HeroTitle.js` | — | CSS-keyframe masked hero line reveal plus FadeIn | **rebuild** | §10 row "Header, Footer, Hero, HeroTitle… → Rebuild" | 1 | done | Two-line masked reveal; nothing starts at opacity 0. |
| Site component — home | `src/components/site/HomeSections.js` | — | Ten homepage sections: categories, fleet, pricing, reviews, FAQ | **rebuild** | §10 row "…HomeSections, VehicleCard… → Rebuild" to §§4–5 | 1 | todo | 20 kB monolith; section set and order change per §4.3. |
| Site component — booking | `src/components/site/BookingForm.js` | — | Multi-step reservation form with quote and server action | **rebuild** | §10 row "…BookingForm… → Rebuild (structure reused: BookingForm zod schema)" | 3 | todo | Zod schema reused; needs hold timer, Turnstile, gold classes removed. |
| Site component — booking | `src/components/site/BookingWidget.js` | — | Search widget: locations, dates, times, promo code | **rebuild** | §10 row "…BookingWidget, FleetFilters… → Rebuild"; spec in §4.2 | 1 | done | Searchable combobox, lazy RangeCalendar, time chips, inline validation, CompactSearchBar. |
| Site component — booking | `src/components/site/FleetFilters.js` | — | Category, transmission and sort filters synced to URL | **rebuild** | §10 row "…FleetFilters… → Rebuild (structure reused: FleetFilters URL sync)" | 3 | todo | URL-sync logic explicitly reused; counts become live availability in sprint 3. |
| Site component — booking | `src/components/site/VehicleQuote.js` | — | Sticky vehicle-page panel: dates, extras, live total | **rebuild** | §10 row "…VehicleQuote, BookingForm… → Rebuild"; spec in §4.6 | 3 | todo | Add availability block and alternatives; FAB overlap and select bugs here. |
| Site component — fleet | `src/components/site/VehicleCard.js` | — | Fleet card: image, badges, specs, price, link | **rebuild** | §10 row "…VehicleCard, BookingWidget… → Rebuild"; spec in §4.5 | 1 | todo | Needs every availability state from §4.5; zellige/plate utilities removed. |
| Site component — content | `src/components/site/Breadcrumbs.js` | — | Breadcrumb trail plus BreadcrumbList JSON-LD output | **keep** | §10 row "…JsonLd, Breadcrumbs, Markdown → Keep" | 0 | done | Only hover:text-accent needs the token rename. |
| Site component — content | `src/components/site/FaqAccordion.js` | — | Zero-JS details accordion exposing FAQ answers to crawlers | **rebuild** | §10 row "…FaqAccordion → Rebuild (a11y reused: FaqAccordion a11y)" | 1 | todo | a11y pattern explicitly reused; FAQ database arrives in sprint 5. |
| Site component — content | `src/components/site/JsonLd.js` | — | Serializes JSON-LD graphs into escaped script tags | **keep** | §10 row "…Cookie banner, JsonLd, Breadcrumbs… → Keep" | — | done | No change; new graph variants live in src/lib/seo.js. |
| Site component — content | `src/components/site/LeadForm.js` | — | Generic contact/lead form with WhatsApp fallback link | **rebuild** | §10 silent; Rebuild row's file glob is src/components/site/*; forms respecified §4.13 | 3 | todo | Server action and WhatsApp fallback reusable; needs kit restyle, Turnstile. |
| Site component — content | `src/components/site/LegalPage.js` | — | Shared shell for terms, legal notice, privacy | **keep** | §10 silent; token-only dependency, no §4 respecification | 0 | done | Only prose/typography tokens change; CNDP wording lands sprint 6. |
| Site component — content | `src/components/site/Markdown.js` | — | Dependency-free Markdown renderer for blog and editorial | **keep** | §10 row "…Breadcrumbs, Markdown → Keep" | 0 | done | Only the text-accent link colour needs the new red token. |
| Site component — content | `src/components/site/PageHero.js` | — | Landing header: breadcrumbs, H1, answer-first block | **rebuild** | §10 row "…PageHero, Marquee… → Rebuild" | 5 | todo | Uses deleted zellige/arch/plate utilities; answer block feeds AEO. |
| Site component — primitives | `src/components/site/icons.js` | — | Inline SVG icons: WhatsApp, arrow, check, star | **extend** | §10 silent; §11 sprint 0 base UI kit needs more icons | 0 | todo | currentColor and palette-free except the brand-coloured Google mark. |
| Site component — primitives | `src/components/site/Price.js` | — | Server-rendered MAD price with CSS-revealed EUR approximation | **keep** | §10 row "Reveal (CSS scroll-driven), Price (server)… → Keep" | 0 | done | Callers must show day and total once dates known. |
| UI kit | `src/components/ui/Badge.js` | — | Pill badge with six semantic colour tones | **rebuild** | §10 silent; §11 sprint 0 kit lists Chip | 0 | todo | gold tone dies with the palette; uppercase already disabled for RTL. |
| UI kit | `src/components/ui/Button.js` | — | Button or link with variants, sizes, gold primary | **rebuild** | §10 silent; §11 sprint 0 "base UI kit (Button with sweep/magnetic…)" | 0 | todo | Gained loading + loadingLabel (red line, not a spinner); full kit rebuild is PROMPT 02. |
| UI kit | `src/components/ui/Counter.js` | — | Animated count-up rendering final value in SSR | **keep** | §10 silent; §11 sprint 6 lists count-ups as polish, not rebuild | 1 | done | Palette-free and reduced-motion aware; only verifiable numbers may render. |
| UI kit | `src/components/ui/Field.js` | — | Form primitives: Label, Input, Select, Textarea, Checkbox | **rebuild** | §10 silent; §11 sprint 0 kit lists Input, Select | 0 | todo | Inline hex in the select chevron data-URI; fix time-select truncation. |
| UI kit | `src/components/ui/Magnetic.js` | — | Magnetic pointer-follow wrapper for primary CTAs | **keep** | §10 silent; §5.3 micro-interactions keep magnetic CTA | 0 | done | Palette-free, 8px clamp, reduced-motion aware; may fold into Button. |
| UI kit | `src/components/ui/Reveal.js` | — | CSS scroll-driven reveal and stagger wrapper components | **keep** | §10 row "Reveal (CSS scroll-driven)… → Keep (tokens change under them)" | 0 | done | Motion tokens change under it; already keeps LCP out of opacity. |
| UI kit | `src/components/ui/SectionHeading.js` | — | Eyebrow, title and subtitle block wrapped in Reveal | **keep** | §10 silent; composition primitive, typography tokens change under it | 1 | done | Archivo replaces Fraunces under text-display-2; structure survives. |
| Routing & i18n | `src/i18n/client-messages.js` | — | Filters message namespaces sent down to client components | **keep** | §10 row 1: `src/i18n/*` => Keep (add new page keys) | 1 | done | Namespace list must follow the Sprint 1 component rebuild; no palette debt. |
| Routing & i18n | `src/i18n/navigation.js` | — | next-intl navigation helpers: Link, redirect, usePathname, useRouter, getPathname | **keep** | §10 row 1: `src/i18n/*` => Keep | — | done | Four lines derived from routing.js; no rebrand impact. |
| Routing & i18n | `src/i18n/request.js` | — | Per-request next-intl config: messages, timezone, MAD and date formats | **keep** | §10 row 1: `src/i18n/*` => Keep | — | done | MAD/date formats already match the §2.3 Latin-digit tabular-numeral rule. |
| Routing & i18n | `src/i18n/routing.js` | — | Locales, RTL list, localized pathname map for four languages | **keep** | §10 row 1: `src/i18n/*`, `src/proxy.js` => Keep (add new page keys) | 5 | done | Missing keys: automatique, suv, quartier, livraison, comparer; longue-duree slug differs from §3. |
| Routing & i18n | `src/proxy.js` | — | Middleware: admin host rewrite, geo locale redirect, bot handling | **keep** | §10 row 1: `src/proxy.js` => Keep; §3 admin host rewrite "already exists in proxy.js" | — | done | Admin gating is boolean; §7.2 roles may need a finer check in Sprint 4. |
| i18n messages | `messages/ar.json` | — | Arabic UI copy, largest file, RTL strings | **extend** | §10 "Routing, locales … Keep (add new page keys)"; §4.12 RTL, §8 AEO | 1 | todo | Must keep كراء primary, تأجير secondary; never uppercase Arabic |
| i18n messages | `messages/en.json` | — | English UI copy mirroring the French namespace tree | **extend** | §10 "Routing, locales … Keep (add new page keys)"; new copy per §4/§8 | 1 | todo | Parity enforced by check:messages; needs P1 page and funnel keys |
| i18n messages | `messages/es.json` | — | Spanish UI copy mirroring the French namespace tree | **extend** | §10 "Routing, locales … Keep (add new page keys)"; new copy per §4/§8 | 1 | todo | Parity enforced by check:messages; needs P1 page and funnel keys |
| i18n messages | `messages/fr.json` | — | French UI copy, 19 namespaces, reference locale | **extend** | §10 "Routing, locales … Keep (add new page keys)"; new copy per §4/§8 | 1 | todo | Section 10 silent; chauffeur namespace stays — the service is confirmed |
| Lib — auth | `src/lib/auth/server.js` | — | Server-side admin session read, admin base path, requireAdmin guard | **keep** | §10 row 2: `src/lib/auth/*` => Keep; add role claim hook + RLS by role | 4 | done | requireAdmin must return the role for §7.2 agent/manager/admin authorisation. |
| Lib — auth | `src/lib/auth/session.js` | — | Admin claims check plus HMAC-signed demo-token cookie helpers | **keep** | §10 row 2: `src/lib/auth/*` => Keep; add role claim hook + RLS by role | 4 | done | claimsAreAdmin is boolean only; §7.2 needs a real role claim hook. |
| Lib — Supabase | `src/lib/supabase/client.js` | — | Browser Supabase client for login form and admin uploads | **keep** | §10 row 2: `src/lib/supabase/*` => Keep | 4 | done | Will carry the §2.5 client-side image-variant uploader added in Sprint 4. |
| Lib — Supabase | `src/lib/supabase/proxy.js` | — | Refreshes Supabase session cookies in middleware, returns JWT claims | **keep** | §10 row 2: `src/lib/supabase/*` => Keep | — | done | Standard @supabase/ssr rotation pattern; untouched by the rebrand. |
| Lib — Supabase | `src/lib/supabase/server.js` | — | Session-aware and anonymous Supabase clients for server code | **keep** | §10 row 2: `src/lib/supabase/*` => Keep; add role claim hook + RLS by role | 4 | done | Needs an RPC-capable path for the §6.4 availability calls in Sprint 2. |
| Lib — data | `src/lib/data/demo-adapter.js` | — | In-memory CRUD implementation of the data adapter contract | **extend** | §10 row 3: `src/lib/data/*` => Extend; demo adapter keeps working for local dev | 2 | todo | CLAUDE.md rule 12: must still boot with no Supabase after §6 extension. |
| Lib — data | `src/lib/data/demo-store.js` | — | globalThis-backed in-memory store created from the seed fixtures | **extend** | §10 row 3: `src/lib/data/*` => Extend (demo store named explicitly) | 2 | todo | Add §6.2 collections so demo-adapter parity tests in Sprint 2 pass. |
| Lib — data | `src/lib/data/index.js` | — | Adapter selector plus convenience read and write wrappers | **extend** | §10 row 3: `src/lib/data/*` => Extend for units, blocks, holds, events, customers, notifications | 2 | todo | Add wrappers for §6.2 units, blocks, holds, events, customers, notifications. |
| Lib — data | `src/lib/data/seed.js` | — | Demo seed: settings, fleet, seasons, extras, FAQs, posts, reviews | **extend** | §10 row 9 (Schema + seed): `src/lib/data/seed.js` => Extend (§6.2), fix contacts, remove sample reviews | 2 | todo | Contacts fixed and all 8 locations loaded from the CSV; units/blocks/holds still Sprint 2. |
| Lib — data | `src/lib/data/supabase-adapter.js` | — | Postgres adapter mapping camelCase models to snake_case tables | **extend** | §10 row 3: `src/lib/data/*` => Extend for units, blocks, holds, events, customers, notifications | 2 | todo | No RPC helper yet; §6.4 search_availability, create_hold, create_reservation must be added. |
| Lib — server actions | `src/lib/actions/admin.js` | — | Admin server actions: vehicles, content, prices, settings, revalidate | **rebuild** | §10 row 8 (Admin shell + pages) => Rebuild IA to section 7; keep server actions pattern, forms, revalidate/IndexNow tools | 4 | todo | Admin IA changes wholesale in §7; the zod server-action pattern is reused. |
| Lib — server actions | `src/lib/actions/auth.js` | — | Admin login and logout actions, Supabase or demo password | **keep** | §10 row 2 (Auth Supabase + demo token, admin base) => Keep; add role claim hook | 4 | done | Keep the flow; add the role claim so agents cannot reach prices/settings. |
| Lib — server actions | `src/lib/actions/booking.js` | — | Validates booking input, recomputes totals, creates booking request | **rebuild** | §11 Sprint 3 funnel with hold timer; §6.3 availability truth is Postgres, writes via RPC | 3 | todo | Writes directly today; §6.4 requires create_hold then create_reservation RPCs. |
| Lib — server actions | `src/lib/actions/contact.js` | — | Validates the contact form and emails it via Resend | **keep** | §10 row 4 (email helper) => Keep; §3 keeps /contact as an existing P0 page | — | done | Works as is; Turnstile arrives with the Sprint 3 funnel forms. |
| Lib — pricing | `src/lib/pricing.js` | — | Pure quote engine: days, seasons, tiers, extras, deposit | **keep** | §10 row 4: `src/lib/pricing.js` => Keep | — | done | Already satisfies the day-plus-total pricing law; no gold debt. |
| Lib — format | `src/lib/format.js` | — | MAD, date, phone and slug formatting with Latin digits | **keep** | §10 row 4: `format.js` => Keep | — | done | Thin-space grouping and Latin digits already match §2.3 and rule 4. |
| Lib — SEO | `src/lib/indexnow.js` | — | Pings IndexNow so Bing recrawls the changed URLs | **keep** | §10 row 4: `indexnow.js` => Keep; §10 admin row keeps the IndexNow tool | 6 | done | Driven by the admin tool; Sprint 6 submits URLs at launch. |
| Lib — SEO | `src/lib/seo.js` | — | Canonical, hreflang metadata and JSON-LD builders per template | **keep** | §10 row 4: `seo.js` … => Keep; add `Car`/`ItemList`/`Service` variants | 5 | done | Add Car and ItemList variants; parametrised results still need noindex wiring. |
| Lib — WhatsApp | `src/lib/whatsapp.js` | — | Builds wa.me links with localized prefilled inquiry messages | **keep** | §10 row 4: `whatsapp.js` => Keep; richer WhatsApp templates | 3 | done | Sprint 3 message must carry car, dates, location and price. |
| Lib — email | `src/lib/email.js` | — | Sends booking confirmation and staff notification through Resend | **keep** | §10 row 4: `email.js` => Keep | 3 | done | Body is French only; Sprint 3 adds the four-language templates. |
| Lib — OG | `src/lib/og.js` | — | Renders the 1200x630 Open Graph card with fonts | **rebuild** | §10 row 6 (Logo): `src/lib/og.js` => Rebuild (badge SVG + wordmark; OG recoloured black/white/red) | 0 | done | Real white mark in the corner (data URL); satori imgs decorative. |
| Lib — helpers | `src/lib/cn.js` | — | Dependency-free className joiner used across every component | **keep** | §10 row 5 lists "utilities" as CSS only; no plan line asks to change this | — | done | Zero dependencies and palette-agnostic; nothing to change at rebrand. |
| Lib — helpers | `src/lib/constants.js` | — | Shared enums, localized-text picker, vehicle image fallback helper | **extend** | §10 row 3 (data layer) => Extend; §6.2 adds unit/hold/event states these enums must cover | 2 | todo | CAR_IMAGES points at placeholder SVGs that §2.5 real photography replaces. |
| Lib — tests | `src/lib/format.test.js` | — | node:test coverage of the display formatting helpers | **keep** | §10 row 4 keeps `format.js`, so its test suite stays | — | done | Also guards the alias hook in scripts/test-register.mjs; keep it running. |
| Lib — tests | `src/lib/pricing.test.js` | — | node:test coverage of countDays, tierDiscount, quote, reference | **keep** | §10 row 4 keeps `pricing.js`, so its test suite stays | — | done | Extend when Sprint 2 introduces hold or unit-level pricing rules. |
| Lib — tests | `src/lib/whatsapp.test.js` | — | node:test coverage of WhatsApp links across four locales | **keep** | §10 row 4 keeps `whatsapp.js`, so its test suite stays | 3 | done | Four-locale regression guard; extend alongside the richer Sprint 3 templates. |
| Styles | `src/styles/fonts.js` | — | Self-hosted variable font loaders and CSS variable class names | **rebuild** | §10 row 5: `src/styles/fonts.js` => Rebuild; Archivo replaces Fraunces | 0 | done | Archivo variable (wdth+wght) replaces Fraunces; Arabic faces still preload:false. |
| Styles | `src/styles/globals.css` | — | Tailwind v4 theme tokens, base layer, utilities, keyframes | **rebuild** | §10 row 5: `src/styles/globals.css` => Rebuild with section 2 tokens; delete `btn-gold`, `text-gradient-gold`, `zellige`, `arch`, gold `plate` | 0 | done | BLACKLINE tokens, motion tokens, redline/chamfer/price/eyebrow utilities, type scale. |
| Font — Latin display | `src/assets/fonts/archivo-latin-wdth.woff2` | — | Archivo variable wdth 62–125 + wght 100–900, display face | **keep** | §2.3 typography table; §10 tokens row "Archivo replaces Fraunces" | 1 | done | 90 kB, preloaded — the single biggest item in the LCP budget |
| Font — Latin display | `src/assets/fonts/archivo-latin-ext-wdth.woff2` | — | Archivo latin-ext cut, vendored but not wired in | **keep** | §2.3 "Latin + Latin-ext subset" | 1 | todo | Unused: fr/en/es all fit inside U+0000–00FF. Wire in when a locale needs it |
| Font — OG renderer | `src/assets/fonts/og/archivo-700.woff` | — | Archivo 700 static woff read by the OG renderer | **keep** | §2.3; satori reads WOFF, not WOFF2 | 1 | done | From @fontsource/archivo (static), not the variable package |
| Font — Latin text | `src/assets/fonts/manrope-latin-wght.woff2` | — | Manrope variable body/UI face with tabular numerals | **keep** | §2.3 "Manrope variable (OFL, already vendored)"; §10 fonts row rebuilds loader only | 0 | done | Needs font-feature-settings tnum for prices per §2.3 |
| Font — Arabic display | `src/assets/fonts/noto-kufi-arabic-wght.woff2` | — | Noto Kufi Arabic variable display face, /ar only | **keep** | §2.3 "Noto Kufi Arabic (OFL, vendored)", loaded on /ar only | 0 | done | 123 kB, largest font; preload false is correct |
| Font — Arabic text | `src/assets/fonts/ibm-plex-sans-arabic-400.woff2` | — | IBM Plex Sans Arabic regular weight for Arabic body | **keep** | §2.3 "IBM Plex Sans Arabic (OFL, vendored)", loaded on /ar only | 0 | done | Static weight file; consider variable subset if budget tightens |
| Font — Arabic text | `src/assets/fonts/ibm-plex-sans-arabic-500.woff2` | — | IBM Plex Sans Arabic medium weight for Arabic UI | **keep** | §2.3 "IBM Plex Sans Arabic (OFL, vendored)", loaded on /ar only | 0 | done | Static weight file; consider variable subset if budget tightens |
| Font — Arabic text | `src/assets/fonts/ibm-plex-sans-arabic-600.woff2` | — | IBM Plex Sans Arabic semibold weight for Arabic UI | **keep** | §2.3 "IBM Plex Sans Arabic (OFL, vendored)", loaded on /ar only | 0 | done | Static weight file; consider variable subset if budget tightens |
| Font — Arabic text | `src/assets/fonts/ibm-plex-sans-arabic-700.woff2` | — | IBM Plex Sans Arabic bold weight for Arabic UI | **keep** | §2.3 "IBM Plex Sans Arabic (OFL, vendored)", loaded on /ar only | 0 | done | Static weight file; consider variable subset if budget tightens |
| Font — OG renderer | `src/assets/fonts/og/manrope-500.woff` | — | Manrope 500 static woff read by OG image renderer | **keep** | §2.3 Manrope retained; §10 logo row rebuilds OG colours only | 0 | done | Still read by the recoloured OG renderer. |
| Font — OG renderer | `src/assets/fonts/og/plex-arabic-600.woff` | — | IBM Plex Arabic 600 static woff for Arabic OG cards | **keep** | §2.3 IBM Plex Sans Arabic retained; §10 logo row rebuilds OG colours only | 0 | done | Still read by the recoloured OG renderer. |
| Supabase | `supabase/migrations/0001_extensions_enums.sql` | — | btree_gist + the eight enums of plan §6.2 | **extend** | plan §6.2 | 2 | done | Idempotent; every enum guarded |
| Supabase | `supabase/migrations/0002_core_tables.sql` | — | profiles, units, customers, holds, reservations, blocks; widens locations/vehicles/settings | **extend** | plan §6.1/§6.2 | 2 | done | `period` is GENERATED from a per-row prep buffer copied by trigger |
| Supabase | `supabase/migrations/0003_events_audit_content.sql` | — | vehicle_events, audit_log, notifications, push_subscriptions; widens faqs/reviews | **extend** | plan §6.2 | 2 | done | Events are append-only |
| Supabase | `supabase/migrations/0004_integrity.sql` | — | Exclusion constraints, block-vs-reservation trigger, audit + event triggers, set_reason | **extend** | plan §6.3 | 2 | done | Double-booking is impossible in Postgres, not in the UI |
| Supabase | `supabase/migrations/0005_roles_rls.sql` | — | Access-token hook, role helpers, RLS on every table, public_settings view | **extend** | plan §7.2/§9.4 | 2 | done | agent cannot touch prices or settings; ga_id/index_now_key never exposed |
| Supabase | `supabase/migrations/0005b_dashboard_steps.md` | — | The two dashboard clicks SQL cannot do | **keep** | plan §7.2 | 2 | done | Enable the hook; create the owner and set the role |
| Supabase | `supabase/migrations/0006_storage.sql` | — | Buckets vehicles (public) / inspections / documents (private) + policies | **extend** | plan §9.4 | 2 | done | Inspection photos are evidence: no staff delete |
| Supabase | `supabase/migrations/0007_verify.sql` | — | Counts, anon-RLS proof, overlap proof, prep-buffer proof | **keep** | PROMPT 05 task 8 | 2 | todo | Run after applying 0001-0006 |
| Dev tooling | `scripts/seed.mjs` | — | Loads fleet/locations/faq CSV + settings.json into Postgres | **keep** | PROMPT 05 task 5 | 2 | done | Idempotent; expands units_count into unit rows |
| Docs — inputs | `docs/inputs/settings.json` | — | The settings row, generated once from the committed seed | **extend** | PROMPT 05 task 5 | 2 | todo | 48 keys; confirm the UNVERIFIED ones before launch |
| Supabase | `supabase/schema.sql` | — | Postgres schema: 9 tables, RLS policies, storage bucket rules | **extend** | §10 row "Schema + seed → Extend (section 6.2)"; tables per §6.2/§6.3 | 2 | todo | Needs units, holds, blocks, events, audit, customers, btree_gist exclusions |
| Supabase | `supabase/seed.mjs` | — | Service-role script upserting demo seed data into Supabase | **extend** | §10 row "Schema + seed → Extend"; §11 Sprint 2 "seed with real fleet" | 2 | todo | Fix fax/email contacts; already skips sample reviews; add units/locations |
| Public asset | `public/images/cars/berline.svg` | `/images/cars/berline.svg` | Dark-gradient sedan silhouette placeholder for cards and blog | **rebuild** | §2.5 imagery standard (two environments, real fleet); §13 "silhouettes are a stopgap" | 1 | todo | Dark-only gradients break light mode; raw hex; default fallback image |
| Public asset | `public/images/cars/citadine.svg` | `/images/cars/citadine.svg` | Dark-gradient city-car silhouette placeholder for category tiles | **rebuild** | §2.5 imagery standard (two environments, real fleet); §13 "silhouettes are a stopgap" | 1 | todo | Dark-only gradients break light mode; replaced by real photos |
| Public asset | `public/images/cars/coupe.svg` | `/images/cars/coupe.svg` | Dark-gradient coupe silhouette placeholder for category tiles | **rebuild** | §2.5 imagery standard (two environments, real fleet); §13 "silhouettes are a stopgap" | 1 | todo | Dark-only gradients break light mode; replaced by real photos |
| Public asset | `public/images/cars/suv-premium.svg` | `/images/cars/suv-premium.svg` | Dark-gradient premium SUV silhouette used as hero LCP image | **rebuild** | §2.5 imagery standard; §5.2 WOW 1 hero image is LCP element | 1 | todo | Currently the homepage hero LCP element; must become real AVIF photo |
| Public asset | `public/images/cars/suv.svg` | `/images/cars/suv.svg` | Dark-gradient SUV silhouette placeholder for category tiles | **rebuild** | §2.5 imagery standard (two environments, real fleet); §13 "silhouettes are a stopgap" | 1 | todo | Dark-only gradients break light mode; replaced by real photos |
| Public asset | `public/images/cars/van.svg` | `/images/cars/van.svg` | Dark-gradient van silhouette placeholder for category tiles | **rebuild** | §2.5 imagery standard (two environments, real fleet); §13 "silhouettes are a stopgap" | 1 | todo | Dark-only gradients break light mode; replaced by real photos |
| Root config | `.env.example` | — | Documented environment contract: site, Supabase, demo, Resend, SEO | **extend** | §9.2 ".env.example exists"; new services in §9.2/§9.4 (Turnstile, VAPID, cron) | 2 | todo | Section 10 silent; add service-role, cron secret, Turnstile, VAPID keys |
| Root config | `.gitignore` | — | Ignores node_modules, .next, env files, playwright and lighthouse output | **keep** | §10 rule that .env.example stays tracked; §9.2 secrets never in repo | 0 | done | Section 10 silent; already covers .wrangler/.open-next for Cloudflare |
| Root config | `CLAUDE.md` | — | Working rules, stack, commands and definition of done | **keep** | §11 "Claude Code working rules (to put in CLAUDE.md when building starts)" | 0 | done | Section 10 silent; already matches §11 rules; update only if stack shifts |
| Root config | `eslint.config.mjs` | — | ESLint flat config extending next core-web-vitals rules | **keep** | §11 Sprint 0 lint/contrast gates; section 10 lists no lint change | 0 | done | Section 10 silent; may add no-raw-hex rule for token discipline |
| Root config | `jsconfig.json` | — | Maps the @/* import alias to src/* | **keep** | §9.2 JavaScript-only App Router layout; section 10 lists no change | 0 | done | Section 10 silent; alias is used throughout, no reason to touch |
| Root config | `next.config.mjs` | — | next-intl plugin, security headers, image formats and remote patterns | **extend** | §5.2 WOW 3 experimental.viewTransition; §9.2 runtime layout | 0 | todo | Section 10 silent; add viewTransition flag; drop unused cloudinary pattern |
| Root config | `package-lock.json` | — | Pinned dependency tree | **extend** | plan §5.4, §9.2 add libraries | — | todo | Regenerated whenever a planned dependency lands |
| Root config | `package.json` | — | Dependencies and npm scripts (dev, build, checks, tests) | **extend** | §5.4 library decisions (GSAP, view transitions); §2.3 Archivo; §9.1 OpenNext | 0 | todo | Section 10 silent; add gsap, react-aria-components, archivo, @opennextjs/cloudflare |
| Root config | `postcss.config.mjs` | — | PostCSS pipeline loading the Tailwind v4 plugin | **keep** | §9.2 "Tailwind 4 tokens (rebuilt)" — pipeline unchanged, tokens change | 0 | done | Section 10 silent; only globals.css changes under it |
| Dev tooling | `playwright.config.js` | — | Chromium-only e2e config, builds if needed | **keep** | PROMPT 00; plan §11 acceptance criteria | 0 | done | workers 1 — parallel Chromium launches flake on Windows |
| Dev tooling | `scripts/check-contrast.mjs` | — | WCAG AA gate over the design tokens | **keep** | PROMPT 00; plan §2.2, §11 Sprint 0 | 0 | done | Exits 1 today: --success on --surface-2 = 4.45:1 |
| Dev tooling | `scripts/check-messages.mjs` | — | 4-language message key parity gate | **keep** | PROMPT 00; CLAUDE.md rule 3 | 0 | done | Passes: 506 identical leaf keys |
| Dev tooling | `scripts/lh.mjs` | — | Lighthouse mobile audit + budget report | **keep** | PROMPT 00; CLAUDE.md rule 7 | 0 | done | Reporting only; --strict makes it a gate |
| Dev tooling | `scripts/test-register.mjs` | — | Teaches bare Node the "@/" alias for node:test | **keep** | PROMPT 00 | 0 | done | Also fails loudly when the test glob matches nothing |
| Dev tooling | `tests/e2e/smoke.spec.js` | — | 4 locales + admin login render with clean console | **extend** | PROMPT 00; every later prompt adds e2e | 0 | todo | 5/5 pass at baseline |
| Docs | `docs/MASTER-PLAN.md` | — | The plan: brand, IA, UX, motion, data, SEO, sprints | **keep** | §10 itself is the authority; CLAUDE.md names it the decision record | — | done | Authority document; amend only by adding a line, never silently |
| Docs | `docs/PROMPTS.md` | — | Prompt-by-prompt build playbook with checkpoints per session | **keep** | CLAUDE.md "Built prompt by prompt from docs/PROMPTS.md"; §11 sprint mapping | — | done | Prompt 16-B is the Vercel alternative; keep in sync with §11 |
| Docs — inputs | `docs/inputs/facts.md` | — | Blank questionnaire for legal, contact, airport and rental facts | **keep** | §12 inputs 1–7 (blocking for Sprint 0–1); §11 content freeze | 0 | done | Entirely unfilled; rule 11 means unverified facts stay hidden |
| Docs — inputs | `docs/inputs/faq.csv` | — | Ten-row FAQ template with TODO French answers | **keep** | §8.5 answer database; §11 Sprint 5 "FAQ database (60/40/30/20)" | 5 | done | All answers are TODO placeholders; feeds faqs table per §6.2 |
| Docs — inputs | `docs/inputs/fleet.csv` | — | Fleet intake template: specs, units, plates, prices, buffers | **keep** | §12 input 2 (real fleet, units per model); §11 Sprint 2 seed | 2 | done | Two example rows only; units_count drives the availability engine |
| Docs — inputs | `docs/inputs/locations.csv` | — | Locations intake: agency, airport, six districts with fees | **keep** | §12 input 3 (locations and fees); §6.2 locations table | 2 | done | Delivery fees and airport hours still TODO; coordinates unconfirmed |
| Docs — inputs | `docs/inputs/logo/README.md` | — | Drop instructions for the vector logo or redraw approval | **keep** | §2.1 logo (vector needed or redraw); §12 input 1 blocking Sprint 0 | 0 | done | "Redraw approved" line still blank; blocks the badge/wordmark rebuild |
| Docs — inputs | `docs/inputs/neighbourhoods.md` | — | Blank per-district facts template for neighbourhood landing pages | **keep** | §3 /quartier/[q] P1 pages; §11 Sprint 5 "6 neighbourhood pages" | 5 | done | Empty fields; each page needs ≥40% unique text to pass |
| Docs — inputs | `docs/inputs/photos/README.md` | — | Photo shot list and folder naming convention per vehicle | **keep** | §2.5 imagery standard (shot list); §12 input 4; §13 photo risk | 1 | done | No photos supplied yet; silhouettes are stopgap, not a launch option |

---

## Decisions §10 does not settle

Plan §10 groups files by area, so it is silent on a number of individual files. Each call below was derived from the
plan section named, and is recorded here so a later prompt inherits the reasoning instead of re-deriving it. Anything
marked **needs Yahya** is a product decision, not a technical one.

**Needs Yahya**

- ~~`src/app/(site)/[locale]/avec-chauffeur/page.js` — pending confirmation~~ **Resolved:** Diab Car's own announcement lists "professional driver on request". The route stays, plan §3 updated to P1.
- `public/images/cars/*.svg` — the six placeholder silhouettes. Marked **rebuild** because §2.5 needs two environments (pale ground / near-black with rim light); they become **delete** the day real fleet photography exists.
- Admin route relocations (§3 renames `/vehicules` → `/flotte`, moves `/avis` under `/contenu`). Recorded as **rebuild**; if a move counts as delete-then-create, those rows flip to **delete**.
- `docs/inputs/*` — still the empty intake contract from §12. Every unfilled file is a TODO that later prompts will stub rather than invent (CLAUDE.md rule 11).

**Derived, no decision needed**

<details>
<summary>All 52 derivations in full</summary>

- src/components/admin/SeoTools.js — marked `keep` rather than the group's `rebuild`. Section 10's Admin row reads "Rebuild IA to section 7; keep server actions pattern, forms, revalidate/IndexNow tools", and §7.1 lists the SEO tools as "existing: revalidate, IndexNow". This file IS the revalidate/IndexNow tool, so the carve-out names it directly. If the parent prefers strict group inheritance, flip it to `rebuild` — the functional change is nil either way (it only inherits btn-gold via ui.js SubmitButton).
- src/components/admin/BookingStatusForm.js, VehicleForm.js, PostForm.js, SettingsForm.js — same carve-out ("keep server actions pattern, forms") could be read as `keep`. I chose `rebuild` because each must change substantively for section 7 (units/plates/blocks, event+audit rows with reason, role gating) and for the new tokens; only the useActionState + server-action shape is reused.
- src/app/(admin)/admin/avis/page.js — `rebuild` assumes a route move to /contenu/avis (§3 admin URL map). If the parent counts a route relocation as delete-then-create, this is `delete`.
- src/app/(admin)/admin/vehicules/page.js and vehicules/[id]/page.js — same relocation question: §3 renames /vehicules to /flotte, /flotte/[id] and adds /flotte/unites/[id]. Kept as `rebuild` since section 10 groups them under Rebuild, but a `delete` reading is defensible.
- src/app/(admin)/admin/not-found.js and layout.js — section 10 covers them only via the blanket `src/app/(admin)/*` glob, and neither is part of the section 7 IA. `rebuild` is inherited from the group; in practice layout.js needs a token/hex fix (Sprint 0) and not-found.js needs almost nothing.
- messages/fr.json, messages/en.json, messages/ar.json, messages/es.json — Section 10 names src/i18n/* (Keep, add new page keys) but never the message catalogues themselves. Chose `extend` because the rebuilt sections 4-5 components and the P1/P5 pages in §3 need new keys while the existing 19 namespaces (common, nav, footer, widget, home, fleet, vehicle, booking, airport, longTerm, chauffeur, about, contact, faqPage, blog, legal, seo, notFound, cookie) all survive the rebrand — copy is not gold-coloured. `rebuild` would needlessly discard 4-language parity work. The `chauffeur` namespace stays: the service was confirmed by Diab Car's own announcement.
- public/images/cars/berline.svg, citadine.svg, coupe.svg, suv.svg, suv-premium.svg, van.svg — Section 10 is silent on public/. Chose `rebuild` rather than `keep` or `delete`: §2.5 requires two environments (light pale ground and near-black rim-lit) and these SVGs are dark-gradient only with hard-coded hexes, so they fail the light-mode and token rules; but §13 still allows silhouettes as a stopgap and src/lib/constants.js, seo.js, og.js and six components resolve /images/cars/<x>.svg as the default image, so deleting them before real photos exist would break the fleet, blog and OG paths. Sprint 1 per §11 ("vehicle card in all states", hero LCP).
- package.json — Section 10 silent. Chose `extend`: §5.4 adds gsap + ScrollTrigger and the View Transitions flag, §2.3 adds @fontsource-variable/archivo, §9.1 adds @opennextjs/cloudflare, and §4 adds react-aria-components for the calendar. Nothing currently listed is removed by the plan (lucide-react, next-themes, motion, next-intl, zod all survive), so `rebuild` is wrong.
- next.config.mjs — Section 10 silent. Chose `extend`: §5.2 requires experimental.viewTransition: true and §9.2 keeps the existing proxy/next-intl wiring, security headers and AVIF/WebP image formats. The res.cloudinary.com remote pattern looks unused and is a candidate for removal inside that same extend, not a reason to rebuild.
- eslint.config.mjs — Section 10 silent. Chose `keep`: it is a thin flat config over eslint-config-next/core-web-vitals with no brand or architecture content. A possible additive change (a rule banning raw hex, to enforce CLAUDE.md rule 2 and the §11 Sprint 0 grep gate) would be an extend, but the plan never asks for it, so `keep` is the defensible reading.
- postcss.config.mjs — Section 10 silent. Chose `keep`: §9.2 keeps Tailwind 4, and section 10's rebuild targets src/styles/globals.css tokens, not the PostCSS pipeline that compiles them.
- jsconfig.json — Section 10 silent. Chose `keep`: the @/* alias is orthogonal to every decision in the plan and §9.2 keeps the same src layout.
- .env.example — Section 10 silent; §9.2 only notes ".env.example exists". Chose `extend` because new services in the plan need new documented keys: SUPABASE_SERVICE_ROLE_KEY and a cron secret for the hold-release job (§6.3, Sprint 2), Cloudflare Turnstile keys (§9.2, Sprint 3) and Web Push VAPID keys (§9.2/§7.4, Sprint 4). Sprint set to 2 because that is the earliest addition.
- .gitignore — Section 10 silent. Chose `keep`: it already tracks .env.example deliberately and already ignores .wrangler/.open-next for the §9.1 Cloudflare path, so no plan item forces a change.
- CLAUDE.md — Section 10 silent. Chose `keep`: §11 says the Claude Code working rules go "in CLAUDE.md when building starts", and the file already carries exactly those rules (JS only, tokens only, light+dark+RTL+reduced-motion, pricing law, RPC writes, no library without a plan line, Lighthouse budget). It is a live rulebook, not code to rebuild.
- docs/MASTER-PLAN.md and docs/PROMPTS.md — Section 10 does not inventory itself. Chose `keep` for both; they are the authority and the build script, and sprint is "—" since no sprint produces them.
- docs/inputs/facts.md, faq.csv, fleet.csv, locations.csv, neighbourhoods.md, logo/README.md, photos/README.md — Section 10 silent. Chose `keep` for all seven: §12 defines them as the intake contract from Diab Car and PROMPTS.md step 4 tells Yahya to fill them, so they are data-collection templates rather than code. They are all still unfilled (TODO/EXAMPLE markers throughout), which is a content risk (§13) rather than a code decision. Sprint numbers assigned by the sprint that first consumes each file.
- src/lib/cn.js — section 10 is silent. Its row 5 word "utilities" refers to the CSS @utility blocks in globals.css, not this JS helper. cn.js is a 7-line dependency-free string joiner with no colour, font or data coupling, so nothing in the rebrand or the availability engine touches it. Chose keep.
- src/lib/constants.js — section 10 is silent. It sits between the data layer (row 3, Extend) and the design rebuild (row 5). Its BOOKING_STATUSES and CATEGORIES enums must grow for §6.2 units/blocks/holds/events, and CAR_IMAGES names the placeholder SVGs that §2.5 replaces with real photography — that is additive, not a rewrite, so chose extend (Sprint 2). Defensible alternative: keep, if the new state machine lands only in Postgres.
- src/lib/actions/admin.js — section 10 names `src/components/admin/*` and `src/app/(admin)/*` but not `src/lib/actions/*`. The same row says "Rebuild IA to section 7; keep server actions pattern, forms, revalidate/IndexNow tools". Since §7.1 replaces the entity set (units, blocks, checklists, customers, notifications) the action module is effectively rewritten while the zod + revalidatePath + redirect pattern survives, so chose rebuild (Sprint 4). Defensible alternative: extend, reading "keep server actions pattern" as keeping this file.
- src/lib/actions/auth.js — section 10 is silent; the nearest row is "Auth (Supabase + demo token), admin base | src/lib/auth/*, src/lib/supabase/* | Keep; add role claim hook". This file is the login/logout half of exactly that auth system and only needs the role claim added, so chose keep (Sprint 4). It is listed here only because its path is under actions/, not auth/.
- src/lib/actions/booking.js — section 10 is silent. Justified from §6.3/§6.4 (availability truth is Postgres, every write through an RPC) and §11 Sprint 3 (4-step funnel with a 10-minute hold timer). The current action validates with zod then calls createBooking directly with no hold, no unit assignment and no conflict handling, so chose rebuild (Sprint 3); the zod schema is reusable, which is why extend is a defensible alternative.
- src/lib/actions/contact.js — section 10 is silent. §3 keeps /contact as an existing P0 page and §10 row 4 keeps the email helper this action leans on. It needs only Turnstile and localized subjects later, so chose keep.
- src/lib/pricing.test.js — section 10 never mentions tests. Its subject, src/lib/pricing.js, is explicitly Keep in row 4, so the suite is kept with it. Chose keep.
- src/lib/format.test.js — section 10 never mentions tests. Its subject, src/lib/format.js, is explicitly Keep in row 4, and this file doubles as the regression test for the scripts/test-register.mjs alias hook that `npm test` depends on. Chose keep.
- src/lib/whatsapp.test.js — section 10 never mentions tests. Its subject, src/lib/whatsapp.js, is Keep in row 4 with "richer WhatsApp templates" added, so the suite is kept and extended in Sprint 3 rather than rebuilt. Chose keep.
- src/components/site/icons.js — §10 never names it. Chose extend: every icon is currentColor and palette-agnostic so nothing must be discarded, but §11 sprint 0's kit (Chip, RedLine, Sheet, Cursor, Skeleton, calendar) will need icons added to this same file. Could defensibly be keep if no icons are added.
- src/components/site/LeadForm.js — §10 never names it, yet the Rebuild row's Files column is the glob `src/components/site/*`. Chose rebuild: it is built entirely on Button/Field (both rebuilt in sprint 0), uses card/gold styling, and §4.13 respecifies form state copy while sprint 3 adds Turnstile. The submitContact server action and WhatsApp fallback are the reusable parts, so extend is the defensible alternative.
- src/components/site/LegalPage.js — §10 never names it. Chose keep: it is a layout shell with no gold utilities, only prose-dc and text-display-2, so a token sweep in sprint 0 is enough. CNDP wording (sprint 6) changes the pages, not this shell.
- src/components/site/MotionProvider.js — §10 never names it. Chose keep: it encodes the locked stack decision in §5.4 (Motion 13, LazyMotion strict, reducedMotion="user"); only the hard-coded ease array moves to the motion tokens.
- src/components/site/ThemeToggle.js — §10's keep row says "Theme … providers", which literally means ThemeProvider.js, but the same row keeps "Language", and LanguageSwitcher is a control rather than a provider, so I read "Theme" as covering the toggle too. Chose keep. Counter-argument for rebuild/extend: it hard-codes #0c0b09 and #f7f3ec for the theme-color meta, which are gold-era palette values and break the no-raw-hex rule, and §11 sprint 0 lists "theme transition" as sprint-0 work.
- src/components/ui/Button.js — §10 never names it (only Reveal.js and Price.js are named under ui/). Chose rebuild because §11 sprint 0 explicitly rebuilds the "base UI kit (Button with sweep/magnetic…)" and the file is saturated with btn-gold plus hard-coded rgba(201,168,92,…) shadows.
- src/components/ui/Field.js — §10 never names it. Chose rebuild: §11 sprint 0 lists Input and Select as kit items, the select chevron embeds a literal #8b8173 hex, and §10's known-bug list puts "time select truncation" in the rebuild.
- src/components/ui/Badge.js — §10 never names it. Chose rebuild: its `gold` tone and accent-soft background disappear with the palette, and §11 sprint 0 lists Chip as the kit equivalent. Extend would be defensible if the component keeps its shape and only loses one tone.
- src/components/ui/Counter.js — §10 never names it. Chose keep: palette-free, reduced-motion aware, and it already renders the final value in SSR HTML. Sprint set to 1 because the rebuilt hero consumes it; §11 sprint 6 lists "count-ups" as polish, so 6 is an equally arguable sprint.
- src/components/ui/Magnetic.js — §10 never names it. Chose keep: no colour, ≤8px travel, hover/pointer-fine and reduced-motion guarded, exactly matching §5.3. Risk: §11 sprint 0 describes "Button with sweep/magnetic", so this wrapper could be absorbed into Button and deleted.
- src/components/ui/SectionHeading.js — §10 never names it. Chose keep: it is a thin composition over Reveal with only typography utilities (eyebrow, text-display-2), which survive the token rebuild even though Archivo replaces Fraunces underneath. Rebuild would only be right if §4 changes the heading anatomy itself.
- GENERAL — src/app/(site)/** : section 10 has no row for public route files at all; it lists only src/components/site/*, src/components/ui/*, src/lib/*, src/styles/*, src/app/sitemap.js, src/app/icon.svg and src/app/(admin)/*. Every decision for a (site) page.js/layout.js is therefore inherited from the components it composes plus the sprint that respecifies the screen (§4/§8.2/§11). Rebuild was applied where §4 gives the screen a full new spec (home 4.2-4.3, results 4.4, vehicle 4.6, funnel 4.7, airport 4.8); extend where only schema/tokens/gold-class debt changes; keep where the file is a thin shell over message/settings data.
- src/app/(site)/[locale]/layout.js — extend. §10 marks providers Keep and tokens/fonts Rebuild, so the provider tree survives but the file itself carries gold-era themeColor hexes (#f7f3ec/#0c0b09) and mounts Header/Footer/WhatsAppFab which are Rebuild. Could equally be argued as keep if the hexes move into tokens.
- src/app/(site)/[locale]/not-found.js — keep. §10 is silent; decision inherited from the 'Keep (tokens change under them)' row for UI kit/providers. Rebuild is arguable because §4.13 rewrites all state copy.
- src/app/(site)/[locale]/[...rest]/page.js — keep. §10 is silent; it is pure routing glue and the routing row is Keep. No sprint owns it.
- src/app/(site)/[locale]/aeroport/page.js — rebuild. §10 is silent; §4.8 gives a full new spec (runway animation, prefilled module, meeting point) and Sprint 5 lists 'Airport page' as scope. Extend would be defensible since answer block and Service JSON-LD already exist.
- src/app/(site)/[locale]/a-propos/page.js — extend. §10 silent; §8.2 requires AboutPage schema instead of the current WebPage, and the 'depuis 2013' claim is unconfirmed (§12.10). Keep would be defensible if the schema swap counts as a token-level change.
- src/app/(site)/[locale]/avec-chauffeur/page.js — keep (pending confirmation). §10 silent; §3 marks the key 'P1/cut — only if Diab Car really offers it (confirm)', so delete is a live possibility. Kept because the cut depends on an unanswered input from Diab Car, and the page currently renders unverified prices (350 MAD transfer, 0.6x half-day) that rule 11 forbids either way.
- src/app/(site)/[locale]/conditions/page.js — keep. §10 silent on legal routes. Content is entirely messages + settings, so the plan's changes (§12.5 cancellation policy) land in messages, not this file.
- src/app/(site)/[locale]/confidentialite/page.js — extend. §10 silent; §9.4 requires the CNDP receipt number and out-of-Morocco transfer wording to be displayed, which needs a visible field this page does not have. Keep is arguable if that wording is added purely in messages/*.json.
- src/app/(site)/[locale]/mentions-legales/page.js — keep. §10 silent; the RC/ICE/capital fixes named in the schema/seed row are data changes, not page changes.
- src/app/(site)/[locale]/contact/page.js — extend, and src/app/(site)/[locale]/faq/page.js — extend. §10 silent; both decisions come from the §8.2 P0 templates (AutoRental + openingHoursSpecification for contact, FAQPage/answer database for FAQ) and Sprint 5.
- src/app/(site)/[locale]/longue-duree/page.js — extend. §10 silent; §3 lists it P1 and Sprint 5 names 'longue durée'. Note the routing.js FR slug (/location-voiture-longue-duree-casablanca) does not match §3 (/location-longue-duree-casablanca) — one of the two must change.
- src/app/(site)/[locale]/og/route.js — rebuild, but this is the weakest call in the set. §10's Logo row names only the renderer src/lib/og.js (Rebuild) and §8.7 says 'OG image route per locale (recolour)' = keep; however §9.3 caching map says 'OG images: static per page (generated at build) instead of a runtime image route → zero CPU per request on Workers' and Sprint 5 says 'static OG per page'. If that is executed literally the correct decision becomes delete.
- src/app/favicon.ico — rebuild. §10 names src/app/icon.svg but not favicon.ico; treated as a member of the Logo group because Sprint 0 explicitly lists 'favicon' among the logo assets.
- src/app/api/health/route.js — keep. §10 is silent on src/app/api/*. Justified by §9.2 (6-hourly keep-alive so the free Supabase project does not pause) and §9.6 (free-limit observability panel). Sprint assignment (6, uptime monitor) is a guess; it is arguably needed from Sprint 2 onward.

</details>
