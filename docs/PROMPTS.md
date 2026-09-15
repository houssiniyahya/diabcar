# DIAB CAR — Claude Code build playbook (prompt by prompt)

You and Claude Code, nothing else. One prompt = one session = one commit. Paste each prompt exactly, answer its questions, run the checkpoint yourself, then move to the next one. Every prompt refers to `docs/MASTER-PLAN.md` (the plan) and `CLAUDE.md` (the rules) inside the repo.

Default hosting is **Cloudflare Workers Free** (rule: everything free except the domain). Prompt 16-B is the Vercel Pro alternative if you change your mind.

---

## Before the first prompt (you, once)

1. Install Node 22 LTS, Git, and Claude Code (`npm install -g @anthropic-ai/claude-code`), then log in (`claude`).
2. Unzip `diabcar-starter.zip` into a folder, e.g. `~/Projects/diabcar`. Open a terminal there.
3. `npm install` → `cp .env.example .env.local` → `npm run dev` → open http://localhost:3000. You should see the old gold design in demo mode (no database yet). Admin: http://localhost:3000/admin (login `admin@diabcar.ma` / `diabcar-demo`).
4. Fill what you can in `docs/inputs/` (fleet.csv, locations.csv, facts.md, faq.csv, neighbourhoods.md, logo/, photos/). Prompts say which file they need. Missing inputs are not blockers: Claude Code leaves `TODO` markers and you fill them later.
5. Create free accounts only when a prompt asks: GitHub (Prompt 00), Supabase (05), Resend (09), Cloudflare (16). Google Search Console / GA4 / Business Profile at 16.

### How to run a prompt
- Start a fresh session in the repo: `claude` (or `/clear` inside a running one). Big prompts (03, 05, 06, 09, 10, 11, 12, 14, 16): press **Shift+Tab** until the status line shows **plan mode**, paste the prompt, approve the plan, then let it build.
- Use the strongest model available for 05, 06, 10, 11, 16 (`/model`). The others run fine on the default.
- When it finishes, read its report, run the **Checkpoint** below the prompt, then commit is already done by Claude Code — just `git log -1` to confirm.
- Something broken? Use the FIX template at the end. Session cut in the middle? Use the CONTINUE template.

---

## PROMPT 00 — Onboarding, baseline, checks
Needs: nothing. (Optional: a GitHub repo URL to push to.)

```text
You are working in the Diab Car repository (Next.js 16, JavaScript). First read CLAUDE.md completely, then docs/MASTER-PLAN.md sections 0, 1, 9 and 10. Do not redesign anything in this session — this is the baseline.

Tasks:
1. Run `npm install` and `npm run build`. Report every warning and error. Fix only build-breaking issues.
2. Add these dev tools and npm scripts (JavaScript only):
   - `scripts/check-contrast.mjs`: parses the light and dark token blocks in src/styles/globals.css, computes WCAG contrast for every text token (--text, --text-2, --text-muted, --red / --red-signal) against --bg and --surface-1/--surface-2, prints a table, exits 1 if any text pair is below 4.5:1. Script `check:contrast`.
   - `scripts/check-messages.mjs`: verifies messages/fr.json, en.json, ar.json, es.json have identical key sets; exits 1 on drift. Script `check:messages`.
   - `@playwright/test` (dev dependency, chromium only) with `playwright.config.js` and a smoke test that opens /fr, /en, /ar, /es and the admin login and asserts no console errors. Script `test:e2e`.
   - `lighthouse` (dev dependency) with `scripts/lh.mjs` that builds, starts on port 3000, runs a mobile audit on /fr and /fr/location-voiture-casablanca and prints LCP, INP-proxy (TBT), CLS and the four scores. Script `lh`.
   - `node --test` for unit tests in `src/**/*.test.js`. Script `test`.
3. Write docs/STATUS.md: one table listing every route, component and lib module with its decision from plan section 10 (keep / rebuild / extend / delete) and a status column (todo / done). This file is updated at the end of every future prompt.
4. Git: make sure .gitignore covers .env.local, .next, node_modules, playwright-report; create branch `build/v1`; commit everything as `chore: baseline scaffold + checks`. If I gave you a GitHub remote URL, add it and push.
5. Report: build result, Lighthouse numbers for /fr (mobile), the list of `check:messages` and `check:contrast` results (contrast is expected to fail for the gold palette — just report), and any question.
```

Checkpoint (you): `npm run build` passes · `npm run test:e2e` passes · `git log -1` shows the commit.

---

## PROMPT 01 — Tokens, fonts, logo, OG (Sprint 0a)
Needs: `docs/inputs/logo/` if you have the vector (otherwise a temporary badge is created).

```text
Read CLAUDE.md, then docs/MASTER-PLAN.md section 2 (brand system) in full and section 10. Goal of this session: replace the gold design system with the BLACKLINE tokens, typography and logo. No page layouts change yet.

Tasks:
1. src/styles/globals.css — rewrite the token blocks exactly as plan 2.2 (light on :root, dark under .dark / [data-theme="dark"] as next-themes sets it). Tokens: --bg, --surface-1, --surface-2, --surface-3, --border, --text, --text-2, --text-muted, --red, --red-hover, --red-soft, --red-signal (equals --red in light mode, #F0383F in dark), --red-glow, --silver. Map them in `@theme inline` so Tailwind utilities exist (bg-surface-1, text-text-2, text-red-signal, border-border…). Add motion tokens from plan 5.1 (--dur-micro … --ease-snap). Add utilities: .redline (2px, 40px, expands to 100% on [data-active] and group-hover), .chamfer (18px cut corner, mirrored in RTL), .eyebrow (Meta style: Archivo 11–13px uppercase tracking .12em; no uppercase/tracking under [dir=rtl]), .price (number + unit composition with tabular numerals), .hairline. Delete btn-gold, text-gradient-gold, zellige, arch and the gold plate styles; grep the codebase and replace their usages with neutral equivalents (visual parity is not required yet — pages will be rebuilt next prompts, they just must not break).
2. Fonts (src/styles/fonts.js + src/assets/fonts): add Archivo variable with the wdth+wght axes from the @fontsource-variable/archivo package (copy the latin/latin-ext woff2 files into src/assets/fonts, load with next/font/local, variable name --font-display). Remove Fraunces completely. Keep Manrope (--font-sans), Noto Kufi Arabic (--font-arabic-display) and IBM Plex Sans Arabic (--font-arabic-sans) with preload:false for Arabic. Wire the type scale from plan 2.3 as CSS classes: .text-display-1, .text-display-2, .text-h2, .text-h3, .text-meta, with the Arabic overrides under [dir=rtl] (no uppercase, tracking 0, line-height 1.3/1.7, −6% size).
3. Logo: if docs/inputs/logo contains a vector, convert it to a clean optimized SVG (public/brand/badge.svg, plus badge-mono.svg white and black). If not, create public/brand/badge-temp.svg: a red (#B71920) shield with a white car silhouette and a black band reading DIAB CAR, clearly marked TEMP in a code comment. Rebuild src/components/site/Logo.js: exports Logo (wordmark "DIAB CAR" in Archivo wdth 125 / 700 / tracking .02em, with the small badge on ≥ lg via a `withBadge` prop) and Badge. Update src/app/icon.svg (simplified shield + car), favicon.ico, manifest colours (theme_color #080808 / background #FFFFFF).
4. OG images: recolour src/lib/og.js to black background, white Archivo title (use the Archivo woff already in src/assets/fonts/og or add a static-weight WOFF — satori needs WOFF, not WOFF2), a red line, Manrope subtitle, badge in the corner; Arabic cards keep the Arabic fonts. Verify /fr/og and /ar/og render.
5. Run `npm run check:contrast` — it must pass now. Grep for 'gold', 'c9a85c', '7f6120', 'd4b26a', 'Fraunces', 'zellige' — zero results outside docs/. `npm run build`, `npm run check:messages`, `npm run test:e2e` pass.
6. Update docs/STATUS.md, commit `feat: blackline tokens, fonts, logo, og`. Report with the contrast table.
```

Checkpoint: open http://localhost:3000/fr in light and dark (toggle in header) — colours are black/white/red, headings are wide Archivo caps, no gold anywhere. Contrast script passes.

---

## PROMPT 02 — UI kit, motion primitives, dev kit page (Sprint 0b)
Needs: nothing.

```text
Read CLAUDE.md, docs/MASTER-PLAN.md sections 2.4, 5.1, 5.3 and 5.4. Goal: the component kit and motion primitives every later page will use. Keep everything JavaScript, tokens only, light + dark + RTL + reduced-motion.

Build in src/components/ui/ (replace the existing Button if present):
1. Button: variants primary (red fill, white text), secondary (outline), ghost, whatsapp (green #25D366 is allowed only for this variant, tokenised as --whatsapp); sizes sm/md/lg; optional trailing arrow that slides 4px on hover (mirrored in RTL); a red light sweep across the surface on hover (gradient on a pseudo-element, translateX, --dur-hover); pressed scale .98; `loading` state that swaps the label for the passed loadingLabel and shows an indeterminate red line inside the button; `magnetic` prop using a `useMagnetic` hook (pointer:fine only, ≤ 8px displacement within 80px, returns with --ease-snap). Works as <button> or as a next-intl Link via `href`.
2. Input, Textarea, Select (native <select> styled, chevron mirrored in RTL), Checkbox, Radio, Chip (selectable, removable variant with ×), Card (surface-1, 1px border, light shadow only in light mode, optional chamfer on its media slot), RedLine, Divider (the "road" divider: two lines with a dashed centre whose dashes drift with scroll via CSS scroll-driven animation; static under reduced motion), Sheet (bottom sheet on < 768px, side panel on desktop; focus trap, Escape, scroll lock, restores focus), Skeleton (silhouette pulse at 4% opacity), Toast (bottom-start, one at a time), Stepper (01–04 progress with the current step red; order mirrored in RTL), NumberCounter (count-up on mount/visibility, tnum, --dur-section, respects reduced motion).
3. src/components/ui/Cursor.js: custom cursor (10px dot + 28px ring, mix-blend-mode difference) that follows the pointer with a light lag and shows labels from `data-cursor="VOIR|EXPLORER|RÉSERVER|DRAG"` on hovered elements (labels come from messages so they localise). Mounted once in the site layout; renders nothing on touch devices, < 1024px, or reduced motion; native cursor stays on inputs and textareas.
4. Theme transition: extend src/components/site/ThemeToggle.js so that, when `document.startViewTransition` exists and reduced motion is off, the switch runs inside a view transition whose ::view-transition-new(root) is revealed by a circle clip-path expanding from the toggle's position (--dur-hero); otherwise a 250ms colour transition.
5. src/lib/motion/: countUp.js, useMagnetic.js, useReducedMotion.js, transitions.js (exported variant presets for Motion using the tokens). Keep motion imports as `motion/react-m` inside the existing LazyMotion strict provider.
6. Dev kit page: src/app/(site)/[locale]/dev/kit/page.js, returns notFound() in production. Shows every component in all states with three toggles: theme, direction (sets dir on the preview container and uses the Arabic messages), reduced-motion emulation.
7. Checks: keyboard navigation through the whole kit with visible focus rings (--red-signal, 2px offset); `npm run build`, lint, check:messages (add every new string to the four message files), test:e2e (add a kit page test that opens it in fr and ar and checks no console errors).
8. docs/STATUS.md, commit `feat: ui kit and motion primitives`. Report.
```

Checkpoint: open http://localhost:3000/fr/dev/kit — try every control with the keyboard; flip to dark, to RTL (arrows and chevrons must flip); theme toggle animates from the button.

---

## PROMPT 03 — Header, footer, hero, booking module (Sprint 1a)
Needs: `docs/inputs/locations.csv` (fees can stay TODO), `docs/inputs/facts.md` hours if known. Car photo for the hero if you have one in `docs/inputs/photos/<slug>/front.jpg` (else the existing placeholder is used).

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 4.1, 4.2, 4.11, 4.12, 5.2 (WOW 1 only) and 2.5. Goal: the new header, footer, hero and the booking module — the most important component of the site.

Tasks:
1. Header (src/components/site/Header.js): desktop = wordmark(+badge ≥ lg) · Flotte · Aéroport · Services (dropdown: longue durée, livraison, automatique — links may point to pages that do not exist yet; keep them in the NAV config) · FAQ · Contact · language menu · theme toggle · WhatsApp ghost button · Réserver primary. Transparent over the hero, solid --bg/85 + blur after 24px (keep the existing scroll logic). Active link = red line under the label. Mobile = wordmark · WhatsApp icon · burger; full-screen black panel (dark tokens regardless of theme), 5 links in Display-2, language list, theme toggle; the red line slides under the tapped item, then navigates.
2. Footer (src/components/site/Footer.js) per plan 4.10: big wordmark, tagline, three columns (Navigation · Services & lieux · Contact), address, phone, WhatsApp, email, hours, language row, legal row with RC/ICE and a slot for the CNDP receipt number (from settings; hidden when empty), "Site par BrandHub". Contacts come from settings: fix the seed so phone landline = +212 5 22 26 03 05, GSM/WhatsApp = +212 6 59 77 55 82, fax = +212 5 22 26 03 61, email = diabcar@gmail.com.
3. Locations data: load docs/inputs/locations.csv into the seed (src/lib/data/seed.js → seedLocations with kind, i18n names, coordinates, delivery fee, hours, is_24h). Fees marked TODO become null and render as "sur devis" until filled.
4. Booking module (src/components/site/BookingWidget.js, rebuild): three zones — LIEU (searchable select grouped: airport, agency, districts as delivery with the fee inline, "Autre adresse à Casablanca" free text; recent choice first via localStorage, guarded with try/catch), DÉPART/RETOUR (one range calendar built with react-aria-components RangeCalendar + @internationalized/date, lazy-loaded when opened, locale-aware for fr/en/ar/es, RTL-correct, red disc on pickup, range preview on hover/tap, final state "06 SEP ━━━ 12 SEP · 6 JOURS"; time chips 08:00–22:00 every 30 min, or 24h if the location is_24h), "Retour dans un autre lieu" toggle revealing a second select, full-width CTA "RECHERCHER UNE VOITURE →" (Button loading state on submit). Defaults: tomorrow 10:00 → +4 days 10:00. Validation inline in Meta red text: return ≥ pickup + 24h, hours respected unless 24h location, dates not in the past. Submit navigates to the fleet route with ?pickup&dropoff&from&to (ISO local Africa/Casablanca). Export a `CompactSearchBar` (location · dates · Modifier) that the fleet page will dock under the header on desktop / bottom on mobile.
5. Hero (src/components/site/Hero.js + HeroTitle.js): eyebrow, two-line headline from messages (FR "Votre route." / "Votre voiture."; EN, AR, ES per plan 4.2), red line, car image in a chamfered container overflowing 8% on desktop, booking module, trust strip (renders only items whose value exists in settings and is flagged verified). WOW 1 "ignition" exactly as plan 5.2: CSS keyframes only, everything visible at first paint, the car <img> is the LCP element (priority, fetchPriority high, correct sizes, AVIF/WebP variants), animation runs once per session (sessionStorage flag) and is skipped under reduced motion. No element starts at opacity 0.
6. Messages: add every string to the four files; run check:messages.
7. Performance: run `npm run lh`; target LCP ≤ 2.0s, CLS ≤ 0.05 on /fr mobile. If LCP is above, fix (image size/format/preload, font loading) before finishing. Paste the numbers in the report.
8. Tests: Playwright test that fills the module (location, dates via keyboard, times) and asserts the resulting URL params in fr and ar. docs/STATUS.md, commit `feat: header, footer, hero, booking module`.
```

Checkpoint: http://localhost:3000/fr — hero ignition plays once; the calendar works with keyboard; Arabic (/ar) is fully mirrored; Lighthouse numbers in the report meet the budget.

---

## PROMPT 04 — Homepage sections, vehicle card, car images (Sprint 1b)
Needs: photos in `docs/inputs/photos/` if available (otherwise placeholders); `facts.md` trust numbers if verified.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 4.3, 4.5, 2.5 and 5.3. Goal: the complete homepage and the vehicle card used everywhere.

Tasks:
1. Car images pipeline (build-time, portable to any host): scripts/images.mjs (sharp as a devDependency) reads docs/inputs/photos/<slug>/{front,side,rear,interior,dash}.jpg and writes public/images/cars/<slug>/<angle>-{480,768,1080,1600,2000}.{avif,webp} plus a 24px blurred placeholder; a manifest public/images/cars/manifest.json records which angles exist. Set images.unoptimized = true in next.config.mjs and build src/components/site/CarImage.js (<picture> with AVIF/WebP sources, sizes, width/height to avoid CLS, lazy except when `priority`). Cars without photos use a neutral silhouette SVG per category on the correct background. Update the seed `image` fields to the new manifest.
2. VehicleCard (rebuild) exactly as plan 4.5: badges (max one), availability states (available / dernière disponibilité / indisponible with next date / demande élevée), name in Archivo wide, red line 40px → 100% on hover, max 3 specs (+ luggage on desktop), price object (per day, and total + days when the card receives `dates`), CTA with arrow, hover: lift 6px, crossfade front → rear image, scanline sweep, specs lift; tap on mobile toggles the second image. Accessible: the whole card is one link target with a proper name; badges have text.
3. Homepage sections in src/components/site/HomeSections.js (split into files if long): purpose tiles (5, set category filter and scroll to the fleet block), fleet (6 cards + "Voir les N véhicules"), airport banner (headline ATTERRIR. RÉCUPÉRER. ROULER. with the runway red line growing on scroll via CSS scroll-driven animation; the animated car crossing is added in Prompt 14), how-it-works rows (01–04 with number, title, line that grows on hover), 4 trust statements (from settings, verified only), reviews (one large review, 01/05 counter, prev/next, Google link; sample reviews render only in demo mode), Drive Morocco (inline simplified SVG silhouette of Morocco with city points: Casablanca highlighted, Rabat, Marrakech, Tanger, Agadir, Fès, Essaouira; hover/tap shows distance and driving time from Casablanca from a static table; links only to routes that exist), FAQ (5), final CTA band, all using the road Divider between sections.
4. Replace the brand Marquee with the road divider; delete Marquee.js if unused.
5. Every string in four languages; RTL check of every section; reduced-motion check.
6. `npm run lh` for /fr mobile — LCP ≤ 2.0s, CLS ≤ 0.05, performance ≥ 90; fix before finishing. Playwright: homepage renders all sections in 4 locales without console errors; purpose tile filters the fleet.
7. docs/STATUS.md, commit `feat: homepage sections and vehicle card`. Report with Lighthouse numbers.
```

Checkpoint: scroll the whole homepage in light/dark, FR and AR, on a phone-sized window; cards crossfade on hover; no layout jump when images load.

---

## PROMPT 05 — Supabase: schema, roles, storage, seed (Sprint 2a)
Needs: a Supabase project (free, region **West EU (Paris)**): give Claude Code the Project URL, the publishable (anon) key, the secret (service role) key and the database connection string — paste them in the chat when asked; they go to `.env.local` only. `docs/inputs/fleet.csv` and `facts.md` as complete as possible.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 6.1, 6.2, 6.3, 6.5, 7.2 and 9.4. Goal: the real database. Work in supabase/migrations (numbered SQL files) and keep the demo adapter in parity.

Tasks:
0. Places (owner's requirement): the `locations` table carries `kind` (airport | agency | district | city), `city`, `delivery_fee_mad` (nullable = on quote), `hours`, `is_24h`, `active`, `sort_order`; seed it from docs/inputs/locations.csv. A `city` place is a delivery / one-way destination in another Moroccan city. Extras (`chauffeur` per day, child seat, extra driver…) are rows in `extras` and are added to the reservation subtotal — never folded into the daily price.
1. Migrations: locations, vehicles (extend: prep_buffer_minutes, min_days, is_published, purpose_tags, popularity_score), units, customers, reservations (extend: unit_id, pickup/dropoff location ids, generated tstzrange `period` widened by the vehicle's prep buffer on both ends, status enum, quote jsonb, source, locale, hold_id, customer_id), blocks, holds, vehicle_events, audit_log, notifications, push_subscriptions, faqs (extend), reviews (extend), profiles (id = auth.users.id, role enum owner|manager|agent|driver, display_name). Enums exactly as plan 6.2.
2. Integrity: `create extension btree_gist`; exclusion constraint on reservations (unit_id, period) for statuses confirmed/ready/active; exclusion on blocks (unit_id, period); trigger rejecting a block that overlaps a confirmed reservation with a JSON error payload naming the conflict; triggers writing vehicle_events on unit status changes and on reservation pickup/return; generic audit trigger writing before/after + actor + reason (reason passed through a `set_config('app.reason', …)` session setting) on reservations, units, vehicles, blocks, settings.
3. Roles: SQL for a custom access token hook that copies profiles.role into the JWT claim `user_role`; helper `is_staff()` / `has_role(text[])`; RLS: public (anon) reads only published vehicles, locations, published faqs/reviews/posts, public settings view (no internal fields); staff by role per plan 7.2 (agent cannot update prices/settings); customers and units readable by staff only; holds insertable by anon through RPC only (next prompt). Tell me the two things I must click in the Supabase dashboard: enable the hook under Auth → Hooks, and create the first owner user, then set his profile role — give me the exact SQL.
4. Storage: buckets `vehicles` (public read), `inspections` and `documents` (private, staff only), with policies.
5. Seed: scripts/seed.mjs reads docs/inputs/fleet.csv, locations.csv, faq.csv and facts.md-derived settings (write a small JSON template docs/inputs/settings.json generated from facts.md the first time, and read it after) and upserts everything through the service key; creates units from units_count and plates; marks sample reviews is_sample. Idempotent.
6. src/lib/data/supabase-adapter.js: extend for the new tables; src/lib/data/index.js keeps choosing demo vs supabase by env; demo adapter gets units, holds, blocks, events in memory so `npm run dev` without env still works.
7. Env: write .env.local from the keys I paste (never commit); document every variable in .env.example.
8. Verify and paste in the report: `select count(*)` for vehicles, units, locations, faqs; an anon query proving RLS hides units and customers; a deliberately overlapping reservation insert failing with the exclusion error.
9. docs/STATUS.md, commit `feat: supabase schema, roles, storage, seed`.
```

Checkpoint: in the Supabase dashboard, Table editor shows your fleet; run the owner SQL Claude gave you; `npm run dev` with the Supabase env shows the real fleet on the site.

---

## PROMPT 06 — Availability engine: RPCs, holds, realtime, tests (Sprint 2b)
Needs: nothing new.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 6.3, 6.4, 6.5 and 9.3. Goal: availability that is true in the database and fast in the browser.

Tasks:
1. SQL functions (security definer, minimal grants): search_availability(pickup_location_id, dropoff_location_id, start_at, end_at) → per published vehicle: units_total, units_free (units in bookable status minus overlapping reservations, blocks and live holds, buffer included), next_available_at when 0, base price data, card fields; create_hold(vehicle_id, start_at, end_at, session_token) → hold row or SOLD_OUT + up to 3 alternatives (same category, free, by price); release_hold(hold_id, session_token); create_reservation(payload jsonb) → serialises on the vehicle row with SELECT … FOR UPDATE, re-checks free units, inserts pending reservation + customer upsert by phone, releases the hold, writes events; next_available(vehicle_id, from); expire_holds() and a pg_cron schedule every minute (if pg_cron is unavailable on the project, tell me and expose /api/cron/expire-holds protected by CRON_SECRET instead). Indexes: GiST on period columns, btree on vehicle_id/status.
2. Next.js: route handlers GET /api/availability (validates with zod, calls the RPC, applies src/lib/pricing.js server-side to add per-day and total for the dates, `Cache-Control: no-store`) and GET /api/quote (vehicle + dates + extras + locations → full breakdown); server actions holdVehicle, releaseHold, submitBooking (rewrite the existing submitBooking to use create_reservation and to snapshot the quote). Demo adapter implements the same functions in memory.
3. Realtime: src/lib/realtime/useVehicleAvailability.js subscribes to postgres_changes on holds and reservations for a vehicle id (and a channel for the results list), debounced refetch of /api/availability, 30s polling fallback, cleans up on unmount. Public reads of holds/reservations are NOT allowed — subscribe to a `availability_changes` broadcast emitted by a trigger via `realtime.broadcast_changes` (or a lightweight `availability_ping` table with RLS-open reads containing only vehicle_id and updated_at). Choose the option that keeps customer data private and explain it in the report.
4. Tests: src/lib/pricing.test.js (tiers, seasons, extras, delivery, one-way, deposit); scripts/test-concurrency.mjs runs two parallel create_reservation calls for the last free unit and asserts exactly one success and one SOLD_OUT with alternatives; a Playwright test hitting /api/availability with valid and invalid params.
5. Report: timings of search_availability on the seed (EXPLAIN ANALYZE summary), the concurrency test output, and the realtime approach chosen. docs/STATUS.md, commit `feat: availability engine`.
```

Checkpoint: open `http://localhost:3000/api/availability?pickup=aeroport-mohammed-v&dropoff=aeroport-mohammed-v&from=<tomorrow>T10:00&to=<+4d>T10:00` — JSON lists cars with units_free, per-day and total.

---

## PROMPT 07 — Results / fleet page with live availability (Sprint 3a)
Needs: nothing new.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 4.4, 4.11, 4.13 and 5.3 (results loading). Goal: the fleet page as a live availability page.

Tasks:
1. Route: the existing `/vehicules` page becomes a static shell (ISR) that renders the full fleet without dates for SEO (indexable), and a client island that reads ?pickup&dropoff&from&to, fetches /api/availability, and re-renders. Parametrised URLs get `<meta name="robots" content="noindex">` via generateMetadata; the bare URL stays indexable with canonical to itself.
2. Header block: location · dates · days · "✎ Modifier" opening the Sheet with the booking module; results refresh in place and the URL updates (history.replaceState) — no full navigation. Title line "18 VOITURES PRÊTES POUR VOTRE ROUTE" with NumberCounter; without dates the alternative line from plan 4.4.
3. Search transition: on submit, the module compresses into the compact bar and a status line "VÉRIFICATION DES DISPONIBILITÉS" with the indeterminate red line, then counts 21 → 18 → 12 (total → free → matching filters) over ≤ 800ms, then cards enter with a 40ms stagger (max 12, then "Voir plus"). Skeleton silhouettes while loading. Under reduced motion: instant.
4. Filters: chip row (Tous, Économique, Compact, SUV, Premium, Automatique, 7 places) + "FILTRES +" Sheet (price/day range, transmission, fuel, seats, climatisation); active filters as removable chips; live counts; sort select (Recommandé = free units desc, then price asc, then popularity; Prix ↑; Prix ↓; Premium). Keep FleetFilters' URL-sync approach.
5. Unavailable cars collapsed under "N autres véhicules indisponibles pour ces dates" with next available date and "Modifier les dates". Empty state per plan 4.13 with the three actions (the WhatsApp message includes the searched dates and location).
6. Selected state: tapping a card outlines it in red, dims siblings, and the mobile bottom bar shows name · price/day · total · CONTINUER →; desktop shows a side summary. CONTINUER goes to the vehicle page keeping the params.
7. Realtime: use useVehicleAvailability so counts update when a hold/reservation happens elsewhere (test with two browser windows).
8. Playwright: search from home → results show totals for the dates → filter Automatique changes the count → empty state when dates have no free units (seed a block to force it). Lighthouse on the bare fleet page (mobile) ≥ 90. docs/STATUS.md, commit `feat: live results page`.
```

Checkpoint: two windows side by side — book (or hold) a car in one (via API for now), the other window's count changes.

---

## PROMPT 08 — Vehicle page (Sprint 3b)
Needs: photos if available.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 4.6, 4.13, 8.2 (vehicle row) and 5.3 (gallery, interior toggle). Goal: the vehicle page as a product launch page, with true availability for the visitor's dates.

Tasks:
1. Layout: back link, name split on two lines in Display-1, category eyebrow, price object, availability block reading ?from&to (● DISPONIBLE POUR VOS DATES … / ○ INDISPONIBLE · prochaine disponibilité … + 3 alternatives from the API), full-width CarImage with 4 floating Meta specs, EXTÉRIEUR | INTÉRIEUR toggle switching the gallery through a circular clip-path mask, gallery 1 large + 3 small, full-screen swipe gallery (data-cursor="DRAG", keyboard arrows, Escape).
2. Sticky booking panel on desktop (price/day, dates from params or a compact date picker, total, RÉSERVER CETTE VOITURE →, Réserver par WhatsApp with the prefilled message from src/lib/whatsapp.js extended with car/dates/location/price); mobile sticky bottom bar; hide WhatsAppFab on this route.
3. Typographic spec grid, included / not included lists from settings (plan 4.6), vehicle FAQs from the faqs table (category vehicle or matching vehicle_id, max 4), 3 similar cars (same category, then price proximity).
4. Fix the known bugs: the "Kilométrage kilométrage illimité" duplication (change the message to "{mileage} inclus" style in 4 languages), the truncated time select (now replaced by chips, verify), FAB overlap.
5. SEO: metadata per plan 8.2 (title pattern with price from the low season), Product + Car + Offer (UnitPriceSpecification per DAY, MAD) + BreadcrumbList + FAQPage (visible questions only) JSON-LD; hreflang ×4; descriptive image alt in each language; static OG image per vehicle generated at build into public/og/<locale>/<slug>.png by a script using the existing renderOg (satori) — and update ogImageUrl to point to the static file when it exists.
6. Playwright: vehicle page in 4 locales, availability block states (free / sold out via a seeded block), gallery keyboard nav; Lighthouse mobile ≥ 90 with LCP ≤ 2.0s. docs/STATUS.md, commit `feat: vehicle page`.
```

Checkpoint: open a car with dates where it is free, then with dates where it is blocked — the block changes and alternatives appear; the sticky panel follows on desktop; bottom bar on mobile.

---

## PROMPT 09 — Booking funnel, confirmation, WhatsApp, email (Sprint 3c)
Needs: Resend account + API key (free) and the sender domain you will verify later (for now emails can go to the console); Cloudflare Turnstile site key + secret (free, create at dash.cloudflare.com → Turnstile) — optional until launch.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 4.7, 4.13, 5.2 (WOW 3 placeholder), 5.3 (confirmation), 9.4. Goal: the 4-step funnel with holds, extras, customer form, server-side truth, confirmation sequence, WhatsApp and email.

Tasks:
1. /reservation: one route, Stepper 01–04, state in URL params + sessionStorage (restore on reload). Step 1 = booking module prefilled; Step 2 = compact results (reuse Prompt 07 islands) — selecting calls holdVehicle and starts the 10-minute timer shown in the summary (mm:ss, tnum); expiry → "VOTRE VOITURE A ÉTÉ LIBÉRÉE" + re-check button; Step 3 = extras from the extras table with per-day/per-rental pricing and live total via /api/quote (delivery auto-selected when a delivery location was chosen); Step 4 = customer form (nom, prénom, téléphone E.164 with country default MA, "c'est mon WhatsApp" checkbox, email, numéro de vol only for airport pickup, message), summary with the full breakdown (location × days, options, livraison, one-way, TOTAL, caution line from settings), a payment information line (no choice, no gateway — decided): "Paiement à la prise en charge : espèces ou carte bancaire (TPE). Aucun paiement en ligne." in 4 languages, CNDP consent checkbox (unchecked, text from messages with the receipt number from settings), Turnstile widget (skipped when keys are absent in dev), CONFIRMER LA RÉSERVATION.
2. Server: submitBooking validates with zod, verifies Turnstile server-side when configured, re-quotes, calls create_reservation (hold → reservation), sends the agency email (Resend; console log when no key) and the customer confirmation email in the customer's locale, creates a notifications row, returns the reference. Persistent summary component shows the selected car (this element will carry the view-transition name in Prompt 14 — add `data-car-transition={slug}` now).
3. Confirmation page: sequence per plan 4.7 (red line → checkmark → car → reference → summary → OUVRIR SUR WHATSAPP with the prefilled message + "Ajouter au calendrier" .ics + "what happens next" with the SLA from settings), skippable, static under reduced motion. Confirmation is noindex.
4. WhatsApp templates in src/lib/whatsapp.js for fr/en/ar/es: generic, from results (dates + location), from vehicle (car + dates + location + displayed total), after booking (reference + everything). Numbers formatted with <bdi>.
5. Emails (src/lib/email.js): plain, black/white/red, text alternative, all 4 locales; agency email contains the customer's phone as a wa.me link.
6. Playwright e2e in fr and ar: home → search → select → hold timer visible → extras change the total → form → confirmation with a DC- reference; API-level test that a second booking for the last unit during a hold gets SOLD_OUT. docs/STATUS.md, commit `feat: booking funnel and confirmation`.
```

Checkpoint: complete a booking on your phone (same Wi-Fi, `npm run dev -- -H 0.0.0.0`): the sticky bar, the timer, the confirmation animation and the WhatsApp button all work; the reservation appears in Supabase.

---

## PROMPT 10 — Admin foundation: auth, roles, shell, dashboard, notifications (Sprint 4a)
Needs: your owner account created in Supabase (Prompt 05); VAPID keys will be generated by Claude Code.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 7.1 (v1 column), 7.2, 7.3, 7.4 and 3 (admin routes). Goal: the admin becomes a real fleet control centre. Keep the host-based routing in src/proxy.js.

Tasks:
1. Auth: replace the demo login with Supabase email + password (keep the demo path only when Supabase env is empty); read the role from the JWT claim; requireRole() helper; "agent" users cannot open prices/settings routes (server-side redirect + hidden nav).
2. Shell (src/components/admin/AdminShell.js): left nav exactly as plan 3 (Dashboard · Réservations · Calendrier · Flotte · Blocs · Clients · Opérations (Départs, Retours) · Contenu (FAQ, Blog, Avis) · Tarifs · Paramètres · SEO · Journal · Notifications · Système), user block at the bottom, top bar with global search (`/` focuses it; searches reservations by reference/phone/name, customers, units by plate, vehicles) and the notifications bell with unread count (Realtime). Dark tokens by default with a light option. Dense tables, slide-over panels (Sheet), keyboard shortcuts g d / g r / g c / n.
3. Dashboard per plan 7.1: greeting + date + agency; strip (départs aujourd'hui, retours aujourd'hui, disponibles, en maintenance, ACTION REQUISE count); ACTION REQUISE list (pending reservations to confirm, pickups in < 60 min not marked ready, returns overdue, holds converting, documents missing when that exists later); today's operations timeline (events + planned pickups/returns sorted by time, colour-coded: red action, grey done, white upcoming); a small fleet status table (available / reserved / rented / cleaning / maintenance counts).
4. Notifications: table already exists; DB triggers create rows for new reservation and status changes; a cron route /api/cron/reminders (CRON_SECRET) creates pickup-in-45-min, return-due-2h and overdue rows; Web Push with VAPID using a Web-Crypto-based implementation portable to Cloudflare Workers (no Node-only dependency at runtime; generate the VAPID keys with a script and put them in .env.local); service worker for the admin scope, push_subscriptions table, "Activer les notifications sur ce téléphone" button in Système; the admin manifest makes admin.diabcar.ma installable (PWA) so iOS can receive pushes.
5. Journal: activity log page reading audit_log with filters (table, actor, date), before/after diff view and the reason.
6. Playwright: login as owner, dashboard renders, a new booking from the public site appears in ACTION REQUISE and increments the bell without reload. docs/STATUS.md, commit `feat: admin foundation`.
```

Checkpoint: log in at http://localhost:3000/admin (ADMIN_ALLOW_PATH=true in dev); make a booking on the public site; the bell and ACTION REQUISE update live; a push arrives on your phone after enabling it.

---

## PROMPT 11 — Admin reservations, state machine, calendar (Sprint 4b)
Needs: nothing new.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 6.1–6.3, 7.1 (Réservations, Calendrier), 7.3. Goal: reservations as operational objects and the Gantt calendar.

Tasks:
1. Réservations list: filters (status, date range, location, vehicle, source), search, pagination, status chips; row → detail. Detail page with three columns (client · véhicule/unité · argent), state machine actions with confirmation + mandatory reason for cancellation/no-show/price override (pending → confirmed → ready → active → returned → closed; cancelled; no_show), unit assignment (only units free for the period; conflict shows the exact overlap), price override with reason (audit), notes, links to WhatsApp (prefilled in the customer's locale) and to the customer profile, timeline of events for this reservation.
2. Create by staff: form (customer by phone with autocomplete/upsert, vehicle, unit optional, locations, dates/times, source, price from the quote with override) using create_reservation; on SOLD_OUT show "⚠ CONFLIT" with the overlapping reservation and the alternatives.
3. Calendrier: horizontal Gantt per unit (rows grouped by model), day/week/month zoom, today line, bars coloured by status (reservation) or kind (block), click → side panel, drag to move a reservation's dates and resize ends with a server-side conflict check before saving (optimistic UI reverted on error), "+ Bloc" by dragging on an empty range (maintenance/cleaning/transfer/private with reason), keyboard accessible alternative (edit dates in the panel). Built with plain JavaScript + CSS grid (no calendar library).
4. Customers: list + profile (history, totals, notes), merge duplicates by phone.
5. Playwright: create a reservation for the last unit, try to create an overlapping one → conflict + alternatives; drag a bar onto a conflict → error and revert. docs/STATUS.md, commit `feat: admin reservations and calendar`.
```

Checkpoint: create a maintenance block on a car for next week in the calendar, then search those dates on the public site — the car is unavailable with the right "disponible à partir du" date.

---

## PROMPT 12 — Admin fleet, operations checklists, content, prices, settings (Sprint 4c)
Needs: nothing new (photos help).

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 7.1 (Flotte, Opérations, Contenu, Tarifs, Paramètres, Système), 6.2, 9.6, 2.5. Goal: the rest of admin v1 and the closed loop return → cleaning → ready → public availability.

Tasks:
1. Per-car gallery in the admin (owner's requirement): on each vehicle page, add / replace / remove / reorder photos per angle (front, side, rear, interior, dash). Upload resizes client-side (canvas) to the plan 2.5 widths, stores AVIF+WebP in Supabase Storage (public bucket, deterministic paths `cars/<slug>/<angle>-<w>.<fmt>`), writes the manifest row; the first photo is the card image; removing the last photo falls back to the category silhouette. Every change audited with actor + reason. `scripts/images.mjs` stays the bulk/offline path and must produce the same paths so both sources are interchangeable.
1b. Lieux (owner's requirement): an admin page to add / edit / disable places — name ×4 languages, kind (airport · agency · district · city), city, delivery fee (blank = "sur devis"), hours, 24h, pin on a map, sort order — so Diab Car can open delivery to Mohammed V, Rabat, Marrakech, Tangier or any city without a code change. The booking module and the fleet filters read this list live.
2. Flotte — models: content in 4 languages, specs, purpose tags, prices, publish toggle, photo manager: uploads resize in the browser (canvas) to 480/768/1080/1600/2000 WebP + a JPEG fallback + blur placeholder before upload to the `vehicles` bucket (no server image processing), angle assignment (front/side/rear/interior/dash), reorder; CarImage reads Storage URLs when the manifest is remote. Units: plate, VIN, colour, mileage, fuel, status with reason, current location; unit dossier page with tabs Aperçu · Timeline (vehicle_events, newest first, evidence thumbnails) · Réservations · Blocs · Documents (placeholder list for v1.1).
3. Opérations — Départs du jour and Retours du jour lists; pickup checklist (identity ✓, documents ✓, correct unit ✓, condition map: SVG top-view with tappable zones → damage entries with type/severity/photos, mileage, fuel %, photos to the private `inspections` bucket (browser-resized), signature canvas → PNG, COMPLETE PICKUP → status active + PICKUP event); return checklist (mileage, fuel, new damage, photos, signature, COMPLETE RETURN → returned + RETURN event → unit status cleaning → task in ACTION REQUISE → "Marquer prête" → ready/available; the public availability must flip automatically because it derives from unit status and blocks).
4. Contenu — FAQ database editor (question/short/long ×4 languages, category, city, vehicle, publish, order), blog (existing form restyled), reviews (manual entry with source, rating, first name + initial, city, car; sample flag).
5. Tarifs — seasons, tiers, extras, deposit by category, delivery fees per location, one-way fee; every change audited with reason. Paramètres — agency facts, hours, legal texts, CNDP receipt, trust numbers with a "verified" checkbox (unverified never renders publicly), SLA text, auto-expiry delay for unconfirmed reservations (default 12 h; a cron moves them to cancelled with reason 'non confirmée' and frees the units). In the pickup checklist add the payment record: method (espèces / TPE), amount received, deposit taken (amount + method) — stored on the reservation and audited. Système — DB size, storage used, requests today (if the host exposes it), email quota, last backup date, push status, "Activer les notifications".
6. SEO tools page keeps revalidate + IndexNow; add "Regenerate OG images" instructions (build-time script).
7. Playwright: full loop — booking on the site → confirm → pickup checklist → return checklist → mark ready → the car is bookable again for those dates on the public site. docs/STATUS.md, commit `feat: admin fleet, operations, content, settings`.
```

Checkpoint: do the loop above on your phone as the agent role.

---

## PROMPT 13 — SEO / GEO / AEO pages and content (Sprint 5)
Needs: `docs/inputs/faq.csv` filled in French (Claude Code translates, you review), `docs/inputs/neighbourhoods.md`, `facts.md` airport section, Google review link.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 3, 4.8, 4.9, 8.2–8.7. Goal: the money pages and the answer system, without doorway pages.

Tasks:
1. Pages: airport (plan 4.8, with runway reveal), automatique, suv, longue-duree (rebuild the existing page in the new system), livraison, and the six neighbourhood pages from docs/inputs/neighbourhoods.md — each with an answer block at the top, the booking module prefilled, 4 relevant cars, local facts, local FAQ, internal links; a page whose unique content is below 40% of its text is not published (leave it unpublished with a TODO in STATUS.md). Add the routes to src/i18n/routing.js pathnames with the localized slugs from plan section 3; sitemap includes only published pages; hreflang ×4.
2. FAQ system: import faq.csv, translate to EN/AR/ES (mark translations "à relire" for me), wire the answer blocks (plan 8.5) and per-page FAQ selection; FAQ page grouped by category; FAQPage JSON-LD only for visible questions.
3. Structured data audit: AutoRental on home/contact with geo, areaServed, openingHoursSpecification, sameAs; Service on airport/livraison/longue durée; ItemList on fleet; Car/Product on vehicles; BreadcrumbList everywhere below home. Visible text must match. Validate with the schema validator locally (fetch the HTML and check JSON-LD parses; list what to paste in Google's Rich Results Test).
4. Static OG images for every published page at build (extend the script from Prompt 08).
5. Write docs/GBP-CHECKLIST.md (plan 8.3) and docs/REVIEWS-FLOW.md (plan 8.4) for me to execute; add the review-request notification (day after return at 10:00) with the prefilled WhatsApp message containing the Google review link from settings.
6. Playwright: every published route in 4 locales returns 200 with one H1, canonical, 4 hreflang + x-default; sitemap lists exactly the published URLs. docs/STATUS.md, commit `feat: seo pages, faq system, structured data`.
```

Checkpoint: run each new page through Google's Rich Results Test (paste the HTML) — no errors; read the Arabic FAQ translations and correct facts.

---

## PROMPT 14 — WOW motion: view transitions, car handoff, cursor labels, RTL motion (Sprint 6a)
Needs: nothing new.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 5.1–5.4 and 4.12. Goal: the three WOW moments, finished, without breaking the performance budget.

Tasks:
1. View transitions: enable experimental.viewTransition in next.config.mjs; create src/components/motion/CarTransition.js wrapping React's unstable_ViewTransition (isolated so it can be swapped); give the selected car image a unique view-transition-name (car-<slug>) in results → vehicle → funnel summary → confirmation; page transitions for main (old compresses 2%, new rises 24px, 300ms); language switch slides main out toward the past and in from the future (direction flips in RTL); header/footer excluded with their own names. Feature-detect and fall back to a 200ms crossfade. Verify no duplicate view-transition-name on any page.
2. Hero → fleet handoff (desktop ≥ 1024 only, not under reduced motion): GSAP + ScrollTrigger loaded dynamically on the homepage; the hero car scales and translates along the scroll into the first fleet card slot using a FLIP measurement at mount and on resize; transform only.
3. Airport banner: the car silhouette crosses the runway line while the section is pinned on desktop; simple reveal on mobile.
4. Cursor labels everywhere (VOIR on cards, EXPLORER on the map, RÉSERVER on CTAs, DRAG on galleries); magnetic on the four key buttons.
5. Search-button morph into the status bar (Motion layout animation) and the results count-up; theme toggle circle reveal check; confirmation sequence polish.
6. RTL motion mirroring pass: every directional animation reads a `dir` and flips (arrows, slides, stagger origin, scanline direction, handoff path).
7. Budget check: `npm run lh` on / and /location-voiture-casablanca (mobile) must stay LCP ≤ 2.0s, performance ≥ 90; home JS ≤ 160 kB gzipped (print the chunk sizes). Reduced-motion run shows no animation (Playwright with `reducedMotion: 'reduce'`). docs/STATUS.md, commit `feat: wow motion`.
```

Checkpoint: desktop — scroll the homepage slowly; click a car from results and watch it travel to the vehicle page and into the booking summary; switch FR → AR and watch the slide flip; mobile — nothing feels heavier than before.

---

## PROMPT 15 — QA: accessibility, RTL, performance CI, content freeze (Sprint 6b)
Needs: your final content in `docs/inputs/` and the verified trust numbers.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 11 (Sprint 6 criteria), 12 and 13. Goal: launch quality.

Tasks:
1. Accessibility: run axe (playwright + @axe-core/playwright) on every public route in fr and ar and on the admin dashboard; fix everything serious; keyboard-only run of the funnel; screen-reader labels on the calendar, stepper, cards, timer; focus management in Sheets and galleries; colour-only information check (status dots always have text).
2. RTL audit: screenshot every page in ar at 390px and 1280px, compare against fr, fix mirroring bugs (padding, icons, chamfers, progress, carousels, breadcrumbs, number bidi).
3. Performance CI: lighthouse-ci config with budgets (LCP 2.0s, CLS 0.05, TBT 200ms, total JS 160 kB on home) run in a GitHub Actions workflow on every push to build/v1 plus lint, tests and e2e; fix regressions.
4. Cross-browser notes: test Safari (iOS) behaviours we cannot run in CI — list what I must check on an iPhone (view transitions fallback, push after install, calendar).
5. Content freeze: remove every sample/demo item from production data paths (sample reviews, placeholder photos, TODO fees → hidden or "sur devis"), ensure unverified numbers do not render, legal pages contain the real texts from settings, CNDP receipt slot filled or hidden, cookie banner CNDP-compliant (consent before GA4), robots blocks admin and funnel.
6. Write docs/LAUNCH-CHECKLIST.md (DNS, env, cron, backups, Search Console, Bing, GBP link, uptime monitor, first-week monitoring). docs/STATUS.md, commit `chore: qa and content freeze`.
```

Checkpoint: CI is green on GitHub; you did the iPhone checks listed in the report.

---

## PROMPT 16 — Deploy on Cloudflare Workers Free (Sprint 6c)
Needs: a Cloudflare account (free) with your domain's DNS moved to Cloudflare (change nameservers at your .ma registrar — do this first, it can take hours); `wrangler login` done in your terminal; GitHub repo pushed.

```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 9.1, 9.2, 9.3, 9.6 and docs/LAUNCH-CHECKLIST.md. Goal: production on Cloudflare Workers Free with the code still Vercel-portable.

Tasks:
1. Add @opennextjs/cloudflare and wrangler (dev dependencies); open-next.config.js with the R2 incremental cache and the Durable Object queue for ISR; wrangler.jsonc with the Worker name, nodejs_compat flag, assets binding, R2 bucket `diabcar-cache`, cron triggers: every minute expire holds (if pg_cron is not used), every 6 hours keep-alive ping to Supabase (a route that runs a trivial query), daily 08:00 Africa/Casablanca reminders + document checks; routes for diabcar.ma, www.diabcar.ma (redirect to apex) and admin.diabcar.ma. Scripts: `preview` (opennextjs-cloudflare build + preview) and `deploy`.
2. Make sure nothing at runtime uses Node-only modules (sharp, fs, web-push); fix anything the build flags. Confirm proxy.js works on Workers (host rewrite, geo headers: use request.cf?.country when available, fall back to the existing header logic).
3. Secrets: list every production variable; I will set them with `wrangler secret put` (give me the exact commands, never write real values into files).
4. GitHub Actions: `ci.yml` (lint, tests, e2e, lighthouse-ci) and `deploy.yml` (deploy on push to main using CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets), `backup.yml` (weekly pg_dump of Supabase via the connection string secret, uploaded as an encrypted artifact/private repo file, 90-day retention) — all free.
5. Domain: give me the exact DNS records and the Workers custom domain steps for diabcar.ma, www and admin; Resend DNS records (SPF/DKIM/DMARC) for diabcar.ma; instructions for Search Console (domain property), Bing Webmaster import, IndexNow key file, GA4 property, UptimeRobot monitor on /api/health.
6. Deploy to a preview URL first; run the smoke e2e against it; measure CPU time per request in the Workers dashboard for /, the fleet page, /api/availability and a booking; report the numbers against the 10ms free-plan limit and tell me plainly if any route is at risk (then the options are Workers Paid $5/mo or Vercel Pro $20/mo).
7. Merge build/v1 into main, deploy, verify https://diabcar.ma/fr, /ar, /admin login, a real booking, the WhatsApp link, an email. docs/STATUS.md, commit `chore: cloudflare deployment`.
```

Checkpoint: the site is live on the domain in 4 languages; admin on admin.diabcar.ma; a test booking arrives as a push on your phone and an email; Search Console sees the sitemap.

### PROMPT 16-B — Alternative: deploy on Vercel Pro ($20/month)
```text
Read CLAUDE.md and docs/MASTER-PLAN.md section 9. Deploy on Vercel Pro: functions region cdg1 (Paris), Vercel Cron for expire-holds (every minute), expire-reservations (every 15 minutes), reminders (every 5 minutes: the pickup nudge covers the next 45 minutes, so daily would never fire in time) and a keep-alive on /api/health (every 6 hours), environment variables per .env.example (I set them in the dashboard), domains diabcar.ma / www / admin.diabcar.ma on the same project, GitHub integration for preview deployments, `deploy.yml` not needed. Keep images unoptimized (pre-sized variants) to stay portable. Then the same verification list as Prompt 16 step 7.
```

---

## PROMPT 17 — v1.1 backlog (after launch, one item per session)
```text
Read CLAUDE.md and docs/MASTER-PLAN.md sections 1 and 7.1 (v1.1 column). Implement ONLY: <one of: compare up to 3 cars (plan 4.4/§1) | Google review import in admin (8.4) | customer documents upload + expiry reminders (7.1) | finance basics: cash/TPE payments list, deposits, receipts PDF (no online payment — decided) | WhatsApp Cloud API utility templates (9.2)>. Same definition of done as every prompt.
```

---

## Templates

### FIX (paste after a checkpoint fails)
```text
Bug in the current build. Symptom: <what you see, on which URL, which browser/device, light or dark, which language>. Expected: <what the plan says — cite the section>. Reproduce it first (add a failing Playwright test or a script), then fix the root cause without changing unrelated code, run build/lint/tests, commit `fix: <what>`, and report what the cause was.
```

### CONTINUE (session cut mid-prompt)
```text
The previous session was interrupted while working on PROMPT <NN> from docs/PROMPTS.md. Read CLAUDE.md, docs/STATUS.md and `git status`/`git diff` to see what is done and what is half-done. Finish the remaining tasks of PROMPT <NN> only, run all checks, commit, and report.
```

### REVIEW (optional, after a big prompt)
```text
Review the last commit against docs/MASTER-PLAN.md and CLAUDE.md as a strict senior reviewer: rules broken (raw hex, missing RTL/dark/reduced-motion, prices without totals, DB writes outside RPCs, new dependencies, secrets), accessibility issues, performance risks, anything that would fail the sprint's acceptance criteria. Fix what is clear, list what needs my decision.
```

### INPUT DELIVERY (whenever you add facts/photos/logo)
```text
I added new inputs in docs/inputs/: <files>. Read them, update the seed/settings/FAQ accordingly, re-run the image pipeline if photos changed, verify the public site renders the new facts in 4 languages, and commit `content: <what>`.
```
