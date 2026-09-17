# DIAB CAR — MASTER PLAN v1

Status: PLAN ONLY. Nothing built, nothing changed in the repo. Written 6 Sept 2026 for review by Yahya (BrandHub.ma). Once approved, this file becomes the brief Claude Code builds from.

Source inputs: Yahya's brief (design direction "Black road / White space / Red signal", motion system, live availability engine, admin fleet-OS, SEO/GEO/AEO), the business card (logo, palette, contacts), the existing Next.js 16 codebase (gold design, to be re-skinned), web verification done 6 Sept 2026 (sources at the end).

---

## 0. Locked decisions (the non-negotiables)

| # | Decision | Why |
|---|----------|-----|
| 1 | Next.js 16 App Router, **JavaScript** (JSDoc + zod at boundaries, no TypeScript), Tailwind v4, Supabase (Postgres, Auth, Storage, Realtime), built by Claude Code from this plan. | Your standing rule: code strictly in JavaScript. Existing codebase is already JS. |
| 2 | **Everything free except the domain.** Free-tier stack, verified against current plan terms (section 9). | Your instruction. |
| 3 | Hosting: **Cloudflare Workers Free** via `@opennextjs/cloudflare` (commercial use allowed), code kept 100% Vercel-portable. Vercel Hobby is free but its terms say "non-commercial, personal use only" → a client's rental business on Hobby risks account pause. Vercel Pro ($20/mo) breaks rule #2. | Verified 6 Sept 2026 (Vercel docs, Cloudflare docs). Your call between "free + compliant (Cloudflare)" and "Vercel + $20/mo". |
| 4 | Design direction **BLACKLINE**: black/white/neutral ≥ 90% of any screen, red ≤ 5% as a *signal* (CTA, availability, active state, thin lines). Never a red section background. Never black text on red. | Your brief + contrast maths (section 2.2). |
| 5 | Logo: keep the existing badge (vectorised) as the brand mark; add a wide-caps wordmark "DIAB CAR" for the header. Both live together. | You asked for "this palette and logo"; the brief's wordmark idea becomes the header treatment, not a replacement. |
| 6 | Homepage opens with the **booking engine**: 2-line headline → booking module (location, dates, times) → car. Live availability, not a catalogue. | Your brief; competitors verified weak here (section 8.1). |
| 7 | **Pricing clarity law**: once dates are known, every price shows *per day* + *total for these dates*; full breakdown before confirmation; no fee appears later that was not shown earlier. | Your brief ("pas de mauvaise surprise"). |
| 8 | Availability is enforced in the database (exclusion constraint on physical car + period). Double booking is impossible, not just unlikely. Holds of 10 min during checkout. | Your brief; Postgres `btree_gist` exclusion constraints. |
| 9 | WhatsApp is a first-class channel with prefilled contextual messages (car, dates, location, price). **No online payment, by decision**: the customer reserves online, Diab Car confirms on WhatsApp, payment is in cash or by TPE (card terminal) at pickup. No payment gateway is ever integrated. | Yahya's decision (6 Sept 2026). |
| 10 | Motion: exactly **three WOW moments** (hero ignition, fleet selection, car travels into booking). Everything else 150–350 ms. `prefers-reduced-motion` = static site. LCP is never sacrificed. | Your brief; LCP rules verified (section 5.2). |
| 11 | Mobile-first: sticky bottom CTA in the funnel, one card per row, tap = hover, swipe = drag. | Your brief. |
| 12 | FR / EN / AR / ES with localized keyword URLs, geo-default language, **true RTL** including motion direction. | Existing routing already does this; RTL motion rules added (section 4.12). |
| 13 | SEO: one URL = one intent. Casablanca cluster first. Other cities **only where the service is real** (delivery / one-way). No doorway pages. AEO = answer blocks + FAQ database. No "AI SEO" gimmicks (Google: no extra requirements — verified). | Your brief + Google Search Central. |
| 14 | Admin = fleet operating system with an append-only **event log** as the backbone. v1 scope = what one agency needs on day one (section 7); multi-branch, transfers, profitability = later, but the schema supports them from day one. | Your brief, scoped to reality (single agency, 356 bd Zerktouni). |

---

## 1. Where this plan deviates from your brief (explicit, with reasons)

| Brief said | Plan does | Reason |
|-----------|-----------|--------|
| TypeScript | JavaScript | Your standing rule; existing code is JS. |
| Hero intro: black screen 1.2–1.8 s, red line, then car enters | 900 ms "ignition" *over a hero that is already painted* (headline + car visible at first paint, animated with transforms only) | Chrome does not count `opacity:0` elements as LCP candidates; a black intro pushes LCP past 2.5 s on mobile and raises bounce. You get the same feeling without paying for it in Core Web Vitals. **Revised 2026-09-15 (owner request):** a ≈1 s brand veil (DIAB CAR · red line · RENT A CAR) now plays once per tab *on top of* the already-painted page. The hero stays at full opacity underneath and remains the LCP element, the veil never takes a pointer event, reduced motion never sees it, and the ignition starts as it lifts. See §5.3, "Page transitions". |
| Lenis smooth scroll | Not in v1 (native scroll + CSS scroll-driven animations + GSAP ScrollTrigger on native scroll) | Scroll hijacking hurts INP on mid-range Android, complicates RTL and accessibility. Can be added later as desktop-only progressive enhancement. |
| Three.js / WebGL for one or two hero moments | No WebGL | No 3D assets exist; a fake 3D car looks cheap (your own "avoid" list). "2.5D" from real multi-angle photography + CSS 3D transforms gives the physical feel. |
| Satoshi as a font option | Rejected; OFL fonts only (Archivo + Manrope + Noto Kufi Arabic + IBM Plex Sans Arabic) | Satoshi's ITF Free Font License forbids modification/subsetting → no performance subsetting, and it is not open source. |
| City pages Marrakech / Rabat / Agadir / Tanger / Fès | Only after you confirm Diab Car really delivers or accepts one-way returns there | Google treats near-duplicate location pages for places you do not serve as doorway pages. |
| Online payment (CMI) | None. Online reservation → WhatsApp confirmation → cash or TPE at pickup. | Yahya's decision. Also keeps the stack free (CMI: bank contract, 2,500–4,000 MAD setup, 1.5–2.5% per transaction; Stripe unavailable in Morocco). |
| Compare up to 3 cars | v1.1 (right after launch) | Not conversion-critical for a ~15-car fleet; keeps launch scope tight. |
| Driver mobile app, inter-branch transfers, vehicle profitability, condition score | Phase 3 | One agency, one location today. Schema supports it; UI later. |
| Multi-city availability map in results | Phase 3 | Same reason. Morocco map stays as a brand/navigation section on the homepage. |
| Host on Vercel | Cloudflare Workers Free (Vercel-portable code) | Rule #2 vs Vercel Hobby "non-commercial" clause. Your decision (section 9.1). |

Everything else in your brief is kept.

---

## 2. Brand system

### 2.1 Logo
- Needed from Diab Car: the **vector** badge (AI / EPS / PDF / SVG). If none exists, BrandHub redraws it faithfully in vector (flag: input #1 in section 12).
- Roles: **badge** = identity (footer, OG image, favicon simplified to red shield + white car silhouette, WhatsApp/GBP avatar, confirmation screen). **Wordmark** = header ("DIAB CAR" in Archivo, width axis 125, weight 700, tracking +0.02em, uppercase). On ≥1024 px the header shows the mini badge + wordmark; on mobile the wordmark only.
- Variants to produce: full colour; white on black; black on white; red on white; monochrome. Clear space = height of the "D". Minimum size 24 px badge / 88 px wordmark.

### 2.2 Colour tokens — light and dark designed separately (contrast ratios computed, WCAG 2.2)

Light mode ("white space")

| Token | Value | Use | Contrast |
|-------|-------|-----|----------|
| `--bg` | `#FFFFFF` | page | — |
| `--surface-1` | `#F5F5F5` | cards, booking module | — |
| `--surface-2` | `#ECECEC` | chips, inputs on cards | — |
| `--border` | `#E4E4E4` | hairlines (1 px) | non-text |
| `--text` | `#0A0A0A` | headings, prices | 19.8:1 on white |
| `--text-2` | `#5C5C5C` | body secondary | 6.7:1 |
| `--text-muted` | `#757575` | meta ≥ 12 px only | 4.6:1 (AA minimum) |
| `--red` | `#C80018` | CTA fill, red text, lines, dots | red on white 6.1:1; white on red 6.1:1 — **re-matched to the delivered logo, Sept 2026** (artwork samples at #C80018; was #B71920) |
| `--red-hover` | `#A80014` | CTA hover | white on it 7.9:1 |
| `--red-soft` | `rgba(200,0,24,.08)` | selected chip/tint | non-text |
| `--silver` | `#C9CCD1` | metal accents, dividers in hero | non-text |

Dark mode ("black road")

| Token | Value | Use | Contrast |
|-------|-------|-----|----------|
| `--bg` | `#080808` | page | — |
| `--surface-1` | `#0F0F0F` | cards | — |
| `--surface-2` | `#151515` | inputs, chips | — |
| `--surface-3` | `#1B1B1B` | hover / raised | — |
| `--border` | `rgba(255,255,255,.08)` | hairlines | non-text |
| `--text` | `#FFFFFF` | headings | 20:1 |
| `--text-2` | `#A5A5A5` | body secondary | 8.1:1 |
| `--text-muted` | `#8A8A8A` | meta | 5.8:1 |
| `--red` | `#C80018` | **fills only** (buttons with white text 6.1:1) | as text on `#080808` = 3.3:1 → fails AA for text |
| `--red-signal` | `#F0383F` | red **text, thin lines, dots, focus rings** in dark mode | 5.1:1 on `#080808` |
| `--red-glow` | `rgba(240,56,63,.35)` | hover glow, scanline | non-text |
| `--silver` | `#C9CCD1` | numbers/instrument accents | 12.4:1 |

Rules: red area ≤ 5% per screen; red text never under 12 px; **never black text on red** (3.27:1, fails); errors = red text + 1 px red border + icon (never a filled red box); the availability dot is red (signal = "look here", as in your brief), unavailable = hollow grey circle; admin adds amber `#D98E04` (attention) and green `#1F8A4C` (ready/completed) — nothing else.

### 2.3 Typography

| Role | Face | Why | Loading |
|------|------|-----|---------|
| Display / headlines / wordmark | **Archivo** variable (OFL; `wdth` 62–125, `wght` 100–900) used at width 112–125, uppercase, tracking −0.01 to +0.02em | Wide grotesque caps echo the logo's extended letters; one variable file covers wordmark, headlines and meta labels | `@fontsource-variable/archivo` (wdth+wght), Latin + Latin-ext subset, preloaded |
| Body / UI / numbers | **Manrope** variable (OFL, already vendored) with `font-feature-settings: "tnum"` for prices and dates | Neutral geometric, excellent tabular numerals | preloaded |
| Arabic display | **Noto Kufi Arabic** (OFL, vendored) | Geometric Kufi pairs with the wide grotesque | loaded on `/ar` only |
| Arabic body/UI | **IBM Plex Sans Arabic** (OFL, vendored) | Technical, readable at small sizes | loaded on `/ar` only |

Scale (desktop → mobile): Display-1 `clamp(56px, 8vw, 136px)`, line-height .92; Display-2 48–80; H2 36–56; H3 24–32 (vehicle names); Body 16–18; Meta 11–13 uppercase tracking .12em ("instrument" labels). Arabic: no uppercase, tracking 0, line-heights 1.3 display / 1.7 body, sizes −6%. Numbers as visual objects: price `650` at H2 size with `MAD` and `/ jour` at Meta size; dates as `06` over `SEP`.

### 2.4 Shape, space, depth
- Radius: cards 16–20 px, buttons 12 px (chips pill), inputs 14 px. One brand shape: a **chamfered corner** (18 px cut, top-right in LTR, top-left in RTL) on hero and card image containers — derived from the shield's angles.
- 4-pt grid. Section rhythm 96/128 px desktop, 64/80 mobile. Container 1280 px, gutters 24 px mobile / 40 px desktop.
- Light: 1 px border + `0 2px 8px rgba(0,0,0,.04)` ("objects on paper"). Dark: layered surfaces, no shadows, 1 px `rgba(255,255,255,.08)` borders.
- **The Red Line**: 2 px tall, 40 px wide at rest, expands to 100% on hover/active; same element becomes progress bar, calendar range, route, scanline, checkmark stroke. One motif everywhere.

### 2.5 Imagery standard (the #1 quality risk)
- Shoot the **real fleet** (each car): front ¾ (card + hero), side, rear ¾, interior, dashboard. Same lens height, same 35–50 mm equivalent, same time of day. Two environments only: light (clean pale ground, soft shadow) and dark (near-black, one-side rim light, small red accent light). Categories share environments so the fleet reads as one catalogue.
- Locations for city pages: Corniche / Ain Diab, Mohammed V airport arrivals, boulevard Zerktouni agency front, Casa-Port skyline, a hand on the wheel — Moroccan context through real Casablanca places, not decoration.
- Delivery: 3000 px masters → AVIF + WebP at 480 / 768 / 1080 / 1600 / 2000 px; hero mobile ≤ 120 KB; card ≤ 45 KB. Variants are generated once at upload (client-side canvas resize in the admin uploader) — no per-request image service, so it is free on any host.
- Until real photos exist: neutral silhouettes on the correct backgrounds. No stock cars, no Google Images.

---

## 3. Information architecture and URL map (4 languages)

Existing routing (`src/i18n/routing.js`) already maps internal keys to localized slugs. Keep it; extend it. Priorities: **P0 = launch**, **P1 = first month after launch**, **P2 = when the service is confirmed real**.

| Key | FR | EN | AR (transliterated slug, Arabic title/H1) | ES | Intent | Pri |
|-----|----|----|----|----|--------|-----|
| `/` | `/fr` | `/en` | `/ar` | `/es` | brand + booking engine | P0 |
| `/vehicules` | `/location-voiture-casablanca` | `/car-rental-casablanca` | `/car-rental-casablanca` | `/alquiler-coches-casablanca` | fleet + live availability | P0 |
| `/vehicules/[slug]` | `/location-voiture-casablanca/peugeot-208` | `/car-rental-casablanca/peugeot-208` | same | `/alquiler-coches-casablanca/peugeot-208` | vehicle | P0 |
| `/aeroport` | `/location-voiture-aeroport-casablanca` | `/car-rental-casablanca-airport` | same | `/alquiler-coches-aeropuerto-casablanca` | airport CMN | P0 |
| `/reservation` (+ `/confirmation`) | `/reservation` | `/booking` | `/booking` | `/reserva` | funnel (noindex) | P0 |
| `/faq`, `/contact`, `/a-propos`, legal ×3, `/blog`, `/blog/[slug]` | existing | existing | existing | existing | support / trust | P0 |
| `/longue-duree` | `/location-longue-duree-casablanca` | `/long-term-car-rental-casablanca` | same | `/alquiler-larga-duracion-casablanca` | monthly rental | P1 |
| `/automatique` | `/location-voiture-automatique-casablanca` | `/automatic-car-rental-casablanca` | same | `/alquiler-coche-automatico-casablanca` | "Manuel & Automatique" is on the card → real differentiator | P1 |
| `/suv` | `/location-suv-casablanca` | `/suv-rental-casablanca` | same | `/alquiler-suv-casablanca` | category intent | P1 |
| `/quartier/[q]` | `/location-voiture-casablanca-maarif`, `-anfa`, `-ain-diab`, `-centre-ville`, `-casa-voyageurs`, `-sidi-maarouf` | `/car-rental-casablanca-maarif` … | same | `/alquiler-coches-casablanca-maarif` … | neighbourhood delivery pages, each with unique local content (landmarks, hotels, parking, delivery time) | P1 |
| `/livraison` | `/livraison-voiture-casablanca` | `/car-delivery-casablanca` | same | `/entrega-coche-casablanca` | delivery service | P1 |
| ~~`/avec-chauffeur`~~ | — | — | — | — | **CUT (owner, 2026-09-09)**. The agency rents self-drive and delivers to the places it configures; a driver, if offered at all, is an OPTION on a booking (the `chauffeur` row in `extras`), not a service page. The route and its four localized slugs are deleted. | — |
| `/villes/[city]` | `/location-voiture-marrakech` … | … | … | … | only for cities with confirmed delivery/one-way | P2 |
| `/guides/[slug]` | `/guides/conduire-au-maroc`, `/guides/casablanca-marrakech-en-voiture` … | … | … | … | tourist pre-intent content | P2 |
| `/comparer` | `/comparer` | `/compare` | same | `/comparar` | comparison (noindex) | v1.1 |

Arabic slugs stay ASCII (transliterated) to avoid percent-encoded URLs in WhatsApp/SMS sharing; Arabic titles, H1s and content are real Arabic. Primary Arabic term = **كراء السيارات** (Moroccan usage, on the card); **تأجير السيارات** appears in titles/answers as the secondary term for Gulf/Mashreq searchers.

Admin (`admin.diabcar.ma`, served by the same app through the host rewrite that already exists in `proxy.js`): `/login`, `/` dashboard, `/reservations`, `/reservations/[id]`, `/calendrier`, `/flotte` (models), `/flotte/[id]`, `/flotte/unites/[id]` (car dossier), `/blocs` (maintenance/cleaning blocks), `/clients`, `/clients/[id]`, `/operations/departs`, `/operations/retours`, `/operations/checklist/[reservationId]`, `/contenu/faq`, `/contenu/blog`, `/contenu/avis`, `/tarifs`, `/parametres`, `/seo`, `/journal` (activity log), `/notifications`.

---

## 4. Public UX specification (screen by screen)

### 4.1 Header
Desktop: wordmark (+ mini badge ≥ lg) · Flotte · Aéroport · Services (dropdown: longue durée, livraison, automatique) · FAQ · Contact · `FR ▾` · `◐` · WhatsApp (ghost) · **Réserver** (red). Never more than 6 links. Transparent over the hero, solid `--bg/85` + blur after 24 px scroll (exists). Active link = red line under label.
Mobile: wordmark · WhatsApp icon · `☰`. Menu = full-screen black panel with 5 links in Display-2, language list, theme toggle; red line slides under the tapped item before navigation.

### 4.2 Hero + booking module (homepage, the most important component)
- Eyebrow (Meta): `LOCATION DE VOITURES · CASABLANCA` (AR: `كراء السيارات · الدار البيضاء`).
- Headline (Display-1, 2 lines max): FR `Votre route.` / `Votre voiture.` · EN `Your road.` / `Your car.` · AR `طريقك.` / `سيارتك.` · ES `Tu ruta.` / `Tu coche.`
- Red line (40 → 120 px on load).
- Car image: front ¾, ~60% of hero width on desktop, overflows its chamfered container by ~8%; on mobile it sits between headline and module at 100% width.
- Booking module (dashboard look, 3 zones, big tap targets ≥ 48 px):
  - `LIEU` — searchable select, grouped: **Aéroport Mohammed V (CMN)**, **Agence — 356 bd Zerktouni**, then neighbourhoods (Maarif, Anfa, Ain Diab, Centre-ville, Casa Voyageurs, Sidi Maarouf) as "livraison" options with fee shown inline (`+ 150 MAD` — from settings), then "Autre adresse à Casablanca". Recent choice first (localStorage).
  - `DÉPART` / `RETOUR` — one range calendar (react-aria-components `RangeCalendar`, accessible, locale-aware, RTL-correct, lazy-loaded on open) + time chips (08:00–22:00 step 30 min; airport = 24/7 if you confirm). Defaults: today + 1 day 10:00 → +4 days 10:00 (the median rental you can confirm later).
  - `☐ Retour dans un autre lieu` (reveals a second location select).
  - CTA `RECHERCHER UNE VOITURE →` full width of the module.
  - Validation inline: return must be ≥ départ + 24 h; opening hours respected unless airport; errors in Meta red text under the field, never a modal.
- Trust strip under the module (only verified facts): `★ 4,9/5 Google (n avis)` · `Depuis 2013` · `Manuel & Automatique` · `Assistance 24/7*` (asterisk → footnote with the real policy). Placeholder numbers are removed at launch if not verified.
- Sticky behaviour: when the module scrolls out, a compact bar (location · dates · `Modifier`) docks under the header on desktop and at the bottom on mobile.

### 4.3 Homepage sections (order is the conversion order from your brief)
1. Hero + module. 2. **Choisir par usage** (5 tiles: Ville & petit budget · Famille · SUV & routes · Business · Premium; each sets the category filter and scrolls to fleet). 3. **Flotte** (6 cards, live availability if dates known, "Voir les 15 véhicules"). 4. **Aéroport** banner: `ATTERRIR. RÉCUPÉRER. ROULER.` with runway red line + car sliding across on scroll. 5. **Comment ça marche** (01 Choisissez · 02 Réservez · 03 Récupérez · 04 Roulez) as horizontal editorial rows with the red line growing. 6. **Pourquoi Diab Car** as 4 big statements (only verifiable ones). 7. **Avis** (one large review, `01 / 05`, prev/next, Google link). 8. **Drive Morocco** (SVG map of Morocco, cities as points, Casablanca highlighted; hover/tap = distance + drive time from Casablanca; links to guides/P2 city pages). 9. **FAQ** (5 questions, `+` → `×`). 10. **CTA final** `PRÊT À PRENDRE LA ROUTE ?` + `Réserver` + `WhatsApp`. 11. Footer.

### 4.4 Results / availability page (`/location-voiture-casablanca?...`)
- Header block: `CASABLANCA MOHAMMED V` · `06 SEP → 12 SEP · 6 JOURS` · `✎ Modifier` (opens a sheet; results refresh in place, URL updates with `?from&to&pickup&dropoff` — these parametrised URLs are `noindex`, the bare page is indexable with default content).
- Title line: `18 VOITURES PRÊTES POUR VOTRE ROUTE` (count animates when filters change). Without dates: `15 véhicules · choisissez vos dates pour voir les disponibilités`.
- Filter row (horizontal chips): Tous · Économique · Compact · SUV · Premium · Automatique · 7 places; `FILTRES +` sheet: prix/jour slider, transmission, carburant, places, climatisation. Active filters become removable chips; counts update live; sort: Recommandé (availability certainty → price → popularity) · Prix ↑ · Prix ↓ · Premium.
- Cards enter progressively (stagger 40 ms, max 12 visible then "Voir plus").
- Unavailable cars for these dates are collapsed under `12 autres véhicules indisponibles pour ces dates ▾`; when opened, each shows `○ INDISPONIBLE · disponible à partir du 13 SEP · [Modifier les dates]`.
- Empty state: `PAS DE VOITURE. POUR L'INSTANT.` + `Modifier les dates` · `Changer de lieu` · `WhatsApp` (message includes the searched dates so staff can propose a car).
- Skeleton: card silhouettes pulse at 4% opacity; never a spinner.
- Selected state: tapping a card (not its CTA) outlines it in red, dims the others 10%, and the mobile bottom bar shows `Peugeot 208 · 390 MAD/j · 2 340 MAD · CONTINUER →`.

### 4.5 Vehicle card (spec)
```
┌───────────────────────────────┐
│ POPULAIRE            ● DISPONIBLE │  Meta labels; dot red = available for the chosen dates
│         [ front ¾ image ]      │  chamfered corner; hover/tap → crossfade to rear ¾
│                        ↗ VOIR  │  desktop cursor label
├───────────────────────────────┤
│ COMPACT                        │  Meta
│ PEUGEOT 208                    │  H3 Archivo wide
│ ───                            │  red line 40 px → 100% on hover
│ AUTOMATIQUE · 5 PLACES · ESSENCE │  Meta, max 3 specs (+ `2 BAGAGES` on desktop)
│ À PARTIR DE                    │
│ 390 MAD  / JOUR                │  price object
│ 2 340 MAD · 6 JOURS            │  only when dates are known
│ [ RÉSERVER → ]                 │  arrow slides 4 px on hover
└───────────────────────────────┘
```
States: available · `● DERNIÈRE DISPONIBILITÉ` (1 unit left) · `○ INDISPONIBLE` (greyed image, "disponible à partir du…") · `↗ DEMANDE ÉLEVÉE` (≥ 3 bookings in 30 days, computed nightly). Badges: MEILLEUR PRIX (lowest per-day in category) · POPULAIRE (most rentals 90 days) · FAMILLE (≥ 7 seats) · AUTOMATIQUE · PREMIUM — one badge maximum, never covering the car.

### 4.6 Vehicle page
- Top: `← RETOUR À LA FLOTTE` · huge name split on two lines (`PEUGEOT` / `208`) · right column price object `650 MAD / JOUR` · availability block for the chosen dates (`● DISPONIBLE POUR VOS DATES 06 → 12 SEP` or `○ INDISPONIBLE · prochaine disponibilité 13 SEP · [Voir les alternatives]` listing 3 cars of the same category available for the same dates).
- Full-width image (front ¾) with 4 floating Meta specs; `EXTÉRIEUR | INTÉRIEUR` toggle switches the gallery through a circular mask; gallery = 1 large + 3 small; tap opens a full-screen swipe gallery (`DRAG →` cursor on desktop).
- Sticky booking panel (desktop right column): price/day, dates, total, `RÉSERVER CETTE VOITURE →`, `Réserver par WhatsApp` (prefilled message). Mobile: sticky bottom bar `650 MAD / jour · RÉSERVER →`. The WhatsApp FAB hides on this page (the bar has WhatsApp).
- Typographic spec grid (no cartoon icons): 5 PLACES · AUTOMATIQUE · DIESEL · 5 PORTES · CLIMATISATION · 2 BAGAGES · `KILOMÉTRAGE ILLIMITÉ` only if true.
- `CE QUI EST INCLUS` / `NON INCLUS` (two calm lists; content from settings so it stays truthful).
- FAQ specific to the car (3–5 from the FAQ database, category = vehicle), then 3 similar cars.
- JSON-LD: `Product` + `Car` with `offers` (`UnitPriceSpecification` per DAY, MAD), `BreadcrumbList`, `FAQPage` only for the visible questions.

### 4.7 Booking funnel (4 steps, one URL `/reservation`, state in URL + sessionStorage)
Progress: `01 RECHERCHE ── 02 VOITURE ── 03 OPTIONS ── 04 CONFIRMATION` (current step red; RTL reverses order and direction).
1. **Recherche** — the same module (prefilled if coming from results).
2. **Voiture** — results in compact mode; selecting starts a **10-minute hold** (timer `09:47` in the summary; expiry → `HOLD EXPIRÉ · Vérifier la disponibilité` and re-check).
3. **Options** — extras with per-day/per-rental price and live total: Conducteur supplémentaire · Siège bébé · Rehausseur · GPS · Assurance rachat de franchise (only if offered) · Livraison (auto-selected if a delivery location was chosen).
4. **Confirmation** — customer: Nom, Prénom, Téléphone (E.164, WhatsApp default = same number, checkbox "c'est mon WhatsApp"), Email, Numéro de vol (only for airport), Message. Then `VOTRE RÉSERVATION` summary: car · dates · lieux · `Location 390 × 6 = 2 340` · `Options 300` · `Livraison 0` · `TOTAL 2 640 MAD` · `Caution 5 000 MAD (bloquée, restituée sous 7 jours)` (from settings) · payment line (information, not a choice): `Paiement à la prise en charge : espèces ou carte bancaire (TPE). Aucun paiement en ligne.` Consent checkbox (CNDP wording, unchecked by default) + Turnstile anti-spam. CTA `CONFIRMER LA RÉSERVATION`.
- Confirmation screen sequence (≈1.4 s total, skippable): red line travels → becomes `✓` → car image appears → `RÉSERVATION CONFIRMÉE` + reference `DC-260906-4F2K` → summary → `OUVRIR SUR WHATSAPP` (prefilled: "Bonjour DIAB CAR, réservation DC-… : Peugeot 208 automatique du 06/09 10:00 au 12/09 10:00, prise en charge Aéroport Mohammed V, total affiché 2 640 MAD. Merci de confirmer.") + `Ajouter au calendrier` (.ics) + what happens next (staff confirms within X minutes during opening hours — value from settings).
- Server truth: the server re-validates availability, re-quotes, writes the reservation + event, releases the hold, emails the agency (Resend) and pushes a web notification to admin phones.

### 4.8 Airport page (`/location-voiture-aeroport-casablanca`)
Hero `ATTERRIR. RÉCUPÉRER. ROULER.` with the runway animation; answer block (AEO) at the top: "Diab Car livre votre voiture à l'aéroport Mohammed V (CMN), terminal 1 et 2, 24h/24 sur réservation, frais X MAD" (facts from settings, only if true); booking module prefilled with CMN; how it works (01 Atterrissez · 02 Point de rencontre · 03 Clés & état des lieux · 04 Roulez) with an image per step revealed on scroll; meeting-point photo + short video (Phase 2); fleet; FAQ (flight delay, night arrival, documents); `Service` + `FAQPage` JSON-LD.

### 4.9 Neighbourhood / city page template (P1/P2)
Editorial hero (`LOUEZ VOTRE VOITURE À MAARIF`), answer block, booking module prefilled with that delivery location, local facts (landmarks, hotels served, parking, delivery time and fee), 4 relevant cars, local FAQ, internal links to airport + fleet + guides. Each page must contain ≥ 40% unique content or it is not published.

### 4.10 Trust, reviews, FAQ, footer
Reviews = real Google reviews (imported via the admin, with the customer's first name + initial, city, car). Sample reviews in the seed are flagged `isSample` and never render in production. FAQ accordion: rows, `+` → `×`, no heavy borders. Footer (dark, editorial, big wordmark): tagline, 3 link columns (Navigation · Services & lieux · Contact), address + phone + WhatsApp + email (`diabcar@gmail.com` until a `contact@diabcar.ma` mailbox exists), hours, language row, legal row (`© 2026 DIAB CAR SARL · RC · ICE`, CGV, mentions légales, confidentialité, récépissé CNDP n°…), "Site par BrandHub".

### 4.11 Mobile rules
One card per row < 640 px; images stay large; bottom sticky bar in fleet/vehicle/funnel (`price · CTA`), replaced by `← Votre réservation 2/4` during the funnel; tap = hover (second image, spec reveal); swipe = drag (galleries); pinned scroll sequences are shortened to simple reveals < 768 px; no autoplay video on mobile; sheet-style panels (filters, modify search) instead of modals.

### 4.12 RTL rules (Arabic)
`dir="rtl"` on `<html>`; logical properties only (`ms-/me-/ps-/pe-`, `start/end`); arrows and chevrons flip (`→` becomes `←`, drawn as a rotated SVG, never a mirrored text glyph); progress bars, calendars, carousels, sliders, breadcrumbs and the chamfered corner mirror; **motion direction reverses** (next = enters from the left in RTL); numbers stay Western Arabic digits (`2 340 MAD`) with `<bdi>` around phone numbers; Arabic never letter-spaced or uppercased; Kufi for display, Plex Arabic for UI.

### 4.13 Copy rules for states
Empty: `PAS DE VOITURE. POUR L'INSTANT.` Error: `DATE INVALIDE` + one sentence + `← Modifier`. Hold expired: `VOTRE VOITURE A ÉTÉ LIBÉRÉE` + `Vérifier la disponibilité`. Vehicle just taken by someone else: `⚠ CE VÉHICULE VIENT D'ÊTRE RÉSERVÉ` + `3 alternatives pour vos dates`. Loader: the red line, never "Loading…".

---

## 5. Motion system (implementation level)

### 5.1 Philosophy and tokens
"Fast when moving. Smooth when transforming. Precise when interacting. Still when communicating price."

| Token | Value | Used for |
|-------|-------|----------|
| `--dur-micro` | 160 ms | arrows, chips, toggles, focus rings |
| `--dur-hover` | 280 ms | card lift, image crossfade, red line expand |
| `--dur-panel` | 380 ms | sheets, dropdowns, calendar open |
| `--dur-section` | 600 ms | reveals, count-ups, filter re-flow |
| `--dur-hero` | 900 ms | ignition, confirmation sequence (≤ 1 400 ms total) |
| `--ease-out` | `cubic-bezier(.2,.7,.2,1)` | entrances |
| `--ease-inout` | `cubic-bezier(.65,0,.35,1)` | transforms, morphs |
| `--ease-snap` | `cubic-bezier(.3,1.2,.4,1)` | magnetic return, chip selection |

Budget: 85% of the site is calm; motion is transform/opacity/clip-path only (compositor); no layout animation on scroll; ≤ 1 animation library evaluated per route (see 5.4); `prefers-reduced-motion: reduce` → all durations 0, reveals visible, cursor off, sequences replaced by a static end state.

### 5.2 The three WOW moments (and how each is built without hurting Core Web Vitals)

**WOW 1 — Hero ignition (homepage first paint).** Frame 0: headline, car and module are in the DOM at full opacity (the car `<img>` is the LCP element, `fetchpriority="high"`, AVIF, preloaded). Animation (900 ms, CSS keyframes only, no JS needed): red line draws 0 → 120 px (`scaleX`, transform-origin start); headline lines rise 24 px with a mask (`translateY` inside `overflow:hidden`); car slides in from +6% X with a 6 px blur that resolves to sharp (`filter: blur()` → 0, GPU) and a 1 px vertical "suspension settle" (`translateY` 2 px overshoot); module fades from `opacity:.01` (not 0, so it stays an LCP candidate) with a 6 px rise. Plays once per session (sessionStorage flag); second visits get a 300 ms version. Rule verified: Chrome ignores `opacity:0` elements for LCP, so the visible-at-first-paint approach protects the metric.

**WOW 2 — Fleet selection transforms the interface.** In results/fleet, selecting a card: the card's red outline draws (clip-path stroke), siblings dim to 90% and scale .98, the bottom/side summary slides in with the car name (vertical text swap with masks), the price count-ups (own 40-line util, no library), the daily → total line draws. Hover on desktop: image crossfade to rear ¾ + scanline (a 1 px `--red-glow` line sweeping left→right over 600 ms, `translateX` on a pseudo-element) + specs lift 4 px + `↗ VOIR` cursor label. Built with Motion (`motion/react-m` inside `LazyMotion strict`) for state transitions; the scanline and crossfade are pure CSS.

**WOW 3 — The car travels into the booking.** The selected car image carries `view-transition-name: car-<slug>` in results → vehicle page → funnel summary → confirmation. Navigation uses the **View Transitions API** (same-document view transitions are Baseline across Chrome, Edge, Safari and Firefox 144+ since 14 Oct 2025); in Next.js 16 this is `experimental.viewTransition: true` + React's `unstable_ViewTransition` (experimental API, used in production by Vercel's own dashboard; we isolate it behind one `<CarTransition>` component so it can be swapped). Fallback for older browsers: 200 ms crossfade. Rule: only one element per page carries a given `view-transition-name` (duplicates abort the transition); fixed headers get their own `view-transition-name` so they do not slide.

### 5.3 Component micro-interactions (catalogue)

| Component | Interaction | Technique |
|-----------|-------------|-----------|
| Primary button | arrow slides 4 px on hover; a red light sweep (`--red-glow` gradient, `translateX`) crosses on hover; pressed = scale .98; loading = label swaps to `RECHERCHE…` with the red line progressing (indeterminate, `scaleX` loop) | CSS + one `data-state` |
| Magnetic buttons (Réserver, Rechercher, WhatsApp, Voir la voiture) | within 80 px the button moves ≤ 8 px toward the pointer, returns with `--ease-snap` | 30-line pointer-move hook, desktop `(pointer:fine)` only |
| Custom cursor | 10 px dot + 28 px ring; labels `VOIR`, `EXPLORER`, `RÉSERVER`, `DRAG ↔` over targets; `mix-blend-mode: difference` | desktop only, hidden ≤ 1024 px / touch / reduced-motion; native cursor kept on form fields |
| Theme toggle | a red circle expands from the toggle (`clip-path: circle()` on the new theme layer, 500 ms), surfaces then settle | View-transition on `html` with `::view-transition-new(root)` clip-path animation; fallback = 250 ms colour transition |
| Language switch | current text slides out toward "past", new text slides in from "future"; direction flips in RTL; `dir` swaps mid-transition | view transition `slide` names on `main` only (header/footer excluded) |
| Section reveals | image opens from a 12% clipped strip to full (`clip-path: inset()`), text rises 16 px, stagger 60 ms | CSS scroll-driven animations (`animation-timeline: view()`), zero JS — already in the codebase |
| Count-ups | prices, "18 voitures", stats | own util, `requestAnimationFrame`, `tnum` digits so width does not jump |
| Calendar | pickup selection = red disc expands; hover/tap preview draws the range; final = `06 SEP ━━━━━ 12 SEP · 6 JOURS` | react-aria RangeCalendar + CSS |
| Location select | choosing CMN draws a tiny route (SVG `stroke-dashoffset`) from airport → agency in the panel | 30 kB inline SVG, once |
| Road divider | dashed centre line drifts as you scroll (`background-position` bound to scroll timeline) | CSS scroll-driven |
| Airport banner | runway line grows, a car silhouette crosses it while the section is pinned (desktop) / simple reveal (mobile) | GSAP ScrollTrigger pin (desktop ≥ 1024 only) |
| Hero → fleet handoff (desktop) | as the user scrolls, the hero car shrinks and lands into the first fleet card slot | GSAP ScrollTrigger scrub on `transform` only, computed from a FLIP measurement at mount; disabled < 1024 px and under reduced motion |
| Results loading | search button morphs into a status bar `VÉRIFICATION DES DISPONIBILITÉS ━━━━━──` then `21 → 18 → 12 véhicules` counts | Motion layout animation + count-up |
| Confirmation | red line → checkmark (`stroke-dashoffset`), car appears (view transition), reference types in | CSS + view transition |
| Page transitions: the **brand veil** (revised 2026-09-15, owner request; replaces "current view compresses 2%, next rises 24 px") | A dark veil sweeps in from the inline start (`--dur-hover`), DIAB CAR and the red line appear, the route commits underneath, and the veil sweeps out through the inline end (`--dur-hover`) while the page fades in and its blocks rise 12 px (`--dur-panel`). It runs only for plain same-origin clicks to another page, and for the search form. It never runs on query-only changes, hash jumps, back/forward, new-tab or modified clicks, external / tel / mailto / WhatsApp links, while a dialog is open or the theme sweeps, or under reduced motion. Fail-safe: the veil lifts after 2.5 s whatever the router does. | one persistent client component (`RouteVeil`) + CSS `clip-path`, config and tests in `src/lib/motion/brandVeil.js`; no library. View Transitions stay reserved for the theme iris and WOW 3. |
| Skeletons | pulsing silhouettes 4% opacity | CSS |

### 5.4 Library decisions (verified)

| Need | Choice | Status |
|------|--------|--------|
| Reveals, dividers, parallax | CSS scroll-driven animations | native, 0 kB, present in codebase |
| UI state / layout transitions | **Motion 13** (`motion/react`, `LazyMotion strict` + `m` components) | already installed |
| Pinned scroll chapters (2 uses: airport runway, hero→fleet handoff) | **GSAP 3 + ScrollTrigger** — 100% free including all former Club plugins since 30 Apr 2025 (Webflow), commercial use allowed | add; load only on the homepage, only ≥ 1024 px |
| Cross-page car continuity, theme and language transitions | **View Transitions API** (Baseline since Oct 2025) via Next `experimental.viewTransition` | add behind one component |
| Smooth scrolling | none (native) | deliberate |
| 3D | none | deliberate |
| Count-ups, magnetic, cursor | in-house JS (≈ 150 lines total) | no dependency |

Performance guardrails: home JS ≤ 160 kB gzipped (GSAP chunk lazy ≈ 30 kB only on desktop home); animations never touch `width/height/top/left`; `will-change` only during an animation; every sequence tested on a throttled Moto-G-class profile (Lighthouse mobile) with target LCP ≤ 2.0 s, INP ≤ 200 ms, CLS ≤ 0.05.

---

## 6. Live availability engine (data model + rules)

### 6.1 Concepts
- **Vehicle** = the marketed model (page, SEO, price): "Peugeot 208 automatique 2024".
- **Unit** = a physical car of that model (plate, VIN, mileage, colour, status). A model with 3 units can be booked 3 times for the same dates. This is what makes `DERNIÈRE DISPONIBILITÉ` true instead of decorative.
- **Reservation** = customer + vehicle + (optionally) assigned unit + period + quote snapshot + status.
- **Block** = a unit taken out of service for a period (maintenance, cleaning, transfer, private use) with a reason.
- **Hold** = a 10-minute soft lock on a vehicle (and unit when assigned) during checkout.
- **Event** = append-only fact about a unit or reservation (who/what/when/where/state/proof).

### 6.2 Tables (additions to the existing `supabase/schema.sql`)

```
locations         id, slug, kind (agency|airport|district|custom), name_i18n jsonb, address, lat, lng, delivery_fee_mad, hours jsonb, is_24h, sort
  ↳ owner's requirement (Sept 2026): places are managed entirely from the admin — add / edit / disable a place, its kind (airport · agency · district · **city** for other Moroccan cities such as Rabat, Marrakech, Tangier), its `city`, delivery fee, hours, is_24h. A place with kind `city` appears in the booking module under its own "Autres villes" group and its fee joins the subtotal like any delivery. Nothing is pre-filled beyond Casablanca and Mohammed V: cities are added by Diab Car, never guessed.
vehicles          (exists) + prep_buffer_minutes int default 120, min_days int default 1, is_published, purpose_tags text[] (city|family|suv|business|premium), popularity_score
units             id, vehicle_id, plate, vin, color, year, mileage_km, fuel_pct, status unit_status, current_location_id, notes, created_at
reservations      (exists) + unit_id nullable, pickup_location_id, dropoff_location_id, period tstzrange GENERATED (start_at - prep, end_at + prep), status reservation_status, quote jsonb (snapshot), source (web|whatsapp|phone|walkin|admin), locale, hold_id, customer_id
customers         id, first_name, last_name, phone (E.164, unique), whatsapp, email, locale, notes, document refs (private storage paths), created_at
blocks            id, unit_id, kind (maintenance|cleaning|transfer|private|other), period tstzrange, reason, created_by
holds             id, vehicle_id, unit_id nullable, period tstzrange, session_token, expires_at, released_at
vehicle_events    id, unit_id, reservation_id nullable, type event_type, at timestamptz, actor_id, location_id, mileage_km, fuel_pct, condition jsonb, notes, photos text[], signature_path, data jsonb, reason
audit_log         id, table_name, row_id, action, before jsonb, after jsonb, actor_id, reason, at
notifications     id, level (urgent|action|info), title, body, href, for_role, read_at, created_at
push_subscriptions id, user_id, endpoint, keys jsonb
faqs              (exists) + category, city_slug, vehicle_id nullable, short_answer_i18n, long_answer_i18n, sort, is_published
reviews           (exists) + source (google|manual), external_id, vehicle_id, city, rating, is_sample
seasons, extras, settings, posts (exist)
```

Enums: `unit_status` = available | reserved | rented | returned | cleaning | maintenance | blocked | out_of_service. `reservation_status` = pending | confirmed | ready | active | returned | closed | cancelled | no_show. `event_type` = PURCHASED · STATUS_CHANGED · PICKUP · RETURN · INSPECTION · DAMAGE_REPORTED · CLEANING_STARTED · CLEANING_COMPLETED · MAINTENANCE_STARTED · MAINTENANCE_COMPLETED · DOCUMENT_UPDATED · TRANSFER_STARTED · TRANSFER_COMPLETED · NOTE.

### 6.3 Integrity rules (enforced in Postgres, not in the UI)
- `CREATE EXTENSION btree_gist;`
- `reservations`: `EXCLUDE USING gist (unit_id WITH =, period WITH &&) WHERE (unit_id IS NOT NULL AND status IN ('confirmed','ready','active'))` → a unit can never be double-booked.
- `blocks`: `EXCLUDE USING gist (unit_id WITH =, period WITH &&)`; plus a trigger that rejects a block overlapping a confirmed reservation on that unit (and offers the conflict in the error payload → admin shows "Conflit: réservé 10–15 sept").
- Model-level over-booking (pending reservations without unit): `create_reservation()` SQL function takes `SELECT … FOR UPDATE` on the vehicle row, counts free units for the period (units in a bookable status − overlapping reservations − overlapping blocks − live holds), and inserts only if `free > 0`; otherwise returns `SOLD_OUT` with up to 3 alternatives (same category, available, sorted by price).
- Holds: `create_hold()` uses the same count; `expires_at = now() + 10 min`; a cron (pg_cron on Supabase, or a Cloudflare Cron Trigger calling a route) releases expired holds every minute.
- Prep buffer: `period` is widened by `prep_buffer_minutes` on both ends so the same car is never promised 30 minutes after a return.
- Every status change writes a `vehicle_events` row (trigger) and an `audit_log` row with before/after and the `reason` supplied by the UI.

### 6.4 Queries (RPCs) and where they run
- `search_availability(pickup_location_id, dropoff_location_id, start_at, end_at, locale)` → for every published vehicle: `units_total`, `units_free`, `next_available_at` (if 0 free), `base_per_day`, plus vehicle card data. Runs in Postgres (one query, indexes on `period` GiST and `vehicle_id`).
- Pricing stays in the existing `src/lib/pricing.js` (seasons, tiers, extras, delivery, one-way, deposit) executed **server-side** in the route handler / server action on top of the RPC output; the quote is snapshotted into `reservations.quote` at booking time. One implementation, one source of truth, tested.
- `next_available(vehicle_id, from)` for the "disponible à partir du 13 SEP" line.
- Results page = static shell + thin JSON route (`/api/availability`) fetched on load and on every filter/date change. Rationale: keeps SEO pages cacheable and keeps per-request CPU tiny (matters on the free Workers plan, section 9.2).
- **Realtime**: the results and vehicle pages subscribe (Supabase Realtime, `postgres_changes`) to `holds` and `reservations` filtered by `vehicle_id`; when `units_free` for the viewed dates drops to 0 the page shows `⚠ CE VÉHICULE VIENT D'ÊTRE RÉSERVÉ` + alternatives. Reconnection and a 30-s poll fallback included.
- Demand badge and popularity computed nightly by a cron SQL job (no per-request cost).

### 6.5 Public vs internal
Public shows only: available / dernière disponibilité / indisponible + next date. Internal statuses (cleaning, maintenance, blocked) never leak. Prices shown to the public come from `seasons` + `vehicles.price_per_day` only; the admin can override per reservation with a `reason`.

---

## 7. Admin — fleet operating system (admin.diabcar.ma)

### 7.1 v1 scope (launch) vs later

| v1 (launch) | v1.1 (month 1–2) | Phase 3 |
|-------------|------------------|---------|
| Dashboard: today (départs, retours, disponibles, en maintenance), **ACTION REQUISE** list, today's operations timeline | Comparison tool on the site, review import from Google, WhatsApp Cloud API templates | Driver mobile view (pickups/deliveries/transfers with GPS + signature) |
| Réservations: list (filters, search), detail (customer · vehicle · money), state machine actions with reason, create by staff with conflict check + alternatives | Customer documents upload (licence/ID) with expiry reminders | Inter-branch transfers, multi-location map |
| Calendrier: horizontal Gantt per unit (day/week/month), drag to move dates (conflict check before save), click = side panel | Finance: payments list, deposits, receipts PDF | Vehicle profitability (revenue vs costs), utilisation rate, condition score |
| Flotte: models (content, prices, purpose tags, publish), **per-car gallery managed entirely from the admin — add, replace, remove and reorder photos per angle (front, side, rear, interior, dash), variants generated on upload, first photo = card image, no code change ever needed (owner's requirement, Sept 2026)**, units (plate, status, mileage, fuel), blocks (maintenance/cleaning with drag on the calendar). **Revised 2026-09-16 (owner request):** the model page opens with the car's photos, then its name, then its category; under them a six-week **availability timeline** (one row per plate: every occupying reservation whatever its source, every block, plus a row for web requests not yet assigned a plate) with a typed « rendre indisponible du … au … » form — one block per chosen plate, inclusive days, the public calendar stops offering them at once — and, on any bar, delete (block) or cancel with a reason (reservation). A booking taken by the agency (`createReservationByStaff`) is given a free plate and confirmed on creation, so the unconfirmed-request sweep never removes it and the per-unit constraints protect it. **Migration 0014 (2026-09-17)** makes the database the authority for these periods: `create_block()` is the only write path and refuses a period that lands on a booking of that car (a pending one included), on another period of that car, or that would leave the model unable to honour the bookings still waiting for a plate — naming what is in the way; `delete_block()` takes a reason; `free_units()` no longer subtracts a period on a car that is already off the site; `mark_unit_ready()` closes only the period running now, so a transfer planned for next week survives. Each period is stored pulled in by the car's prep buffer, so the public calendar greys exactly the days typed and not their neighbours. | Document vault per unit (registration, insurance, inspection) with 30/15/7/1-day alerts | Accountant role, invoices, exports |
| Opérations: **pickup checklist** (identity ✓, documents ✓, unit ✓, condition map, mileage, fuel, photos, signature) and **return checklist** (mileage, fuel, damage, photos, signature → auto `cleaning` → `ready` → public availability) | Damage cases with before/after photo compare | Cost tracking per unit |
| Clients: profile, history, notes | | |
| Contenu: FAQ database (categories, city, vehicle), blog, avis; Tarifs: saisons, extras, remises, caution, livraison | | |
| Notifications: bell + **web push** to staff phones (new reservation, pickup in 45 min, return due/overdue, hold-to-reservation, document expiry), email to the agency | | |
| Journal: activity log with before/after + reason; global search (`/`) across reservations, customers, units, plates | | |
| Paramètres: agency facts, hours, legal texts, CNDP receipt, SEO tools (existing: revalidate, IndexNow) | | |

### 7.2 Roles (Supabase Auth + `profiles.role` in the JWT via a custom access-token hook → RLS policies)
`owner` (Yahya / Diab Car boss: everything) · `manager` (reservations, fleet, content, prices) · `agent` (reservations, customers, pickup/return checklists; no prices/settings) · `driver` (Phase 3). Every write requires a role; every sensitive write (price override, cancellation, block) requires a `reason`.

### 7.3 Design language for admin
Same tokens, dark by default, dense: thin dividers, tiny status dots (red = action required, amber = attention, green = ready/completed, grey = inactive, white = normal), compact tables, slide-over panels that keep context, large type only for the numbers that matter. Keyboard: `/` search, `n` new reservation, `g d` dashboard, `g r` reservations, `g c` calendar. No card-everywhere layouts. The dashboard answers "what needs my attention now" before it shows any chart.

### 7.4 Notifications — free path
`notifications` rows are created by DB triggers (new reservation, status change) and by a cron (returns due in 2 h / overdue, pickups in 45 min, document expiry). Delivery: in-app bell (Realtime), **Web Push** (VAPID, free, works on Android Chrome and iOS 16.4+ when the admin is installed to the home screen as a PWA — the manifest already exists), and email via Resend free tier. WhatsApp automation is Phase 2 (paid per template message).

---

## 8. SEO · GEO · AEO — one knowledge system, localized four times

### 8.1 What the Casablanca competition actually does (checked 6 Sept 2026)
- carrentcasablanca.com (airport page): no booking engine, per-day prices only (no total), ~7 000 words of repetitive SEO text, stock photos, booking = leave the site to WhatsApp.
- voiture-location-maroc.com (Casacar): booking form with dates but **no total price before submitting**, French only, 20+ model links in the footer, keyword-stuffed FAQ, no fuel/age/deposit facts.
- avis.ma (CMN agency page): no price before submitting, birthdate required up front, no WhatsApp, French only.
Diab Car wins by execution: live availability + total price on the first screen, four languages, WhatsApp with context, real photos, real facts.

### 8.2 Page templates (P0) — title / H1 / answer block / schema / links

| Page | Title pattern (FR shown; localized per language) | H1 | Answer block (AEO, ≤ 2 sentences, facts from settings) | JSON-LD | Links to |
|------|---------------------------------------------------|----|-------------------------------------------------------|---------|----------|
| Home | `Diab Car — Location de voiture à Casablanca · Manuel & Automatique` | `Location de voitures à Casablanca` (Display) | "Diab Car loue des voitures manuelles et automatiques à Casablanca, à l'agence (356 bd Zerktouni) ou livrées à l'aéroport Mohammed V, à partir de X MAD/jour." | `AutoRental` (LocalBusiness) + `WebSite` + `FAQPage` | fleet, airport, automatique, FAQ, contact |
| Fleet | `Location voiture Casablanca : nos véhicules et prix par jour` | `Nos voitures à Casablanca` | "X véhicules, de la citadine au SUV, prix par jour affichés TTC, total calculé pour vos dates." | `ItemList` of `Product/Car` | each car, categories, airport |
| Vehicle | `Location Peugeot 208 automatique à Casablanca — dès 390 MAD/jour` | `Peugeot 208` | "La Peugeot 208 automatique se loue à Casablanca à partir de 390 MAD/jour chez Diab Car, caution X MAD, kilométrage Y." | `Product` + `Car` + `Offer` (`UnitPriceSpecification` DAY) + `BreadcrumbList` + `FAQPage` | fleet, similar cars, airport, booking |
| Airport | `Location voiture aéroport Casablanca Mohammed V (CMN) — livraison 24h/24` | `Location de voiture à l'aéroport Mohammed V` | "Diab Car livre votre voiture à l'aéroport Mohammed V sur réservation; frais X MAD; point de rencontre …" | `Service` + `FAQPage` + `BreadcrumbList` | fleet, booking, FAQ (documents, retard de vol) |
| FAQ | `Questions fréquentes — louer une voiture à Casablanca` | `Questions fréquentes` | — | `FAQPage` | money pages |
| Contact | `Contact Diab Car — 356 bd Zerktouni, Casablanca` | `Contactez Diab Car` | NAP + hours | `AutoRental` with `openingHoursSpecification` | Maps, WhatsApp |
| About | `Diab Car — agence de location de voitures à Casablanca depuis 2013` | … | — | `AboutPage` | — |

Rules: one H1 per page; visible text = structured data (Google requirement); `FAQPage` only where the questions are visible; `alternates.languages` hreflang ×4 + `x-default` (exists); per-language canonical; funnel and parametrised results = `noindex`; images named `peugeot-208-automatique-location-casablanca.avif` with descriptive `alt` in each language; `llms.txt` (exists) kept as a courtesy, not as a ranking tactic.

### 8.3 GEO — Google Business Profile first (outside the website)
Checklist for Yahya/Diab Car: claim/verify GBP for "Diab Car", category *Agence de location de voitures*, NAP exactly `Diab Car · 356 Boulevard Zerktouni, Casablanca 20000 · +212 5 22 26 03 05`, website `https://diabcar.ma/fr` (UTM-tagged), hours, attributes (livraison, aéroport), services list (each car category, airport delivery, long-term), 20+ real photos (agency front, cars, team, airport meeting point), logo, Q&A seeded with the 10 top FAQs, weekly posts (new car, seasonal price), messaging on. Same NAP on the site footer, `AutoRental` JSON-LD (`geo`, `areaServed`: Casablanca, Mohammed V airport), Facebook page, and Moroccan directories (Pages Jaunes Maroc, Kerix, Avito Pro, Maps of hotels partners). No fake secondary locations.

### 8.4 Reviews engine (free)
After `returned` → next day at 10:00 a `notifications` row + WhatsApp deep link for staff ("Envoyer la demande d'avis à Ahmed") with a prefilled message containing the Google review short link; the admin imports the new review (text, first name + initial, rating, car) into `reviews` (source google) → shown on the site next to the booking flow. Never write reviews, never incentivise.

### 8.5 AEO — the answer database
`faqs` becomes the single source: question + short answer (≤ 40 words, factual) + long answer, per language, tagged by category (prix, documents, aéroport, assurance, caution, carburant, kilométrage, conducteur, paiement, annulation, livraison, longue durée, véhicules, conduite au Maroc), city and vehicle. Pages pull the relevant questions (money page ≤ 6, vehicle ≤ 4); the FAQ page lists everything by category; the same rows feed the WhatsApp quick replies for staff. Launch target: 60 verified questions in FR, 40 EN, 30 AR, 20 ES, growing from real customer questions logged in the admin.

### 8.6 Measurement (all free)
Google Search Console (4 language sitemaps), Bing Webmaster + IndexNow (exists), GA4 with consent-gated events: `search_availability`, `view_vehicle`, `select_vehicle`, `start_booking`, `hold_created`, `booking_confirmed`, `whatsapp_click` (with page + vehicle), `call_click`, `theme_toggle`, `language_switch`; Cloudflare Web Analytics (cookieless) as the always-on baseline; GBP insights monthly; a monthly manual check of 12 queries across Google, AI Overviews/AI Mode, ChatGPT, Perplexity, Gemini and Copilot logged in a sheet (mentioned? cited? which URL? which competitor?).

### 8.7 Technical SEO already in place (keep)
Localized routes with hreflang/x-default, canonical per language, `sitemap.js`, `robots.js`, `manifest.js`, `icon.svg`, OG image route per locale (recolour), JSON-LD helpers, bot → `/fr` (never geo-redirect bots), security headers, `revalidatePath` + IndexNow from the admin.

---

## 9. Technical architecture and the free-tier stack (verified 6 Sept 2026)

### 9.1 Hosting decision (yours to make; my recommendation first)

| Option | Cost | Terms | Fit |
|--------|------|-------|-----|
| **A. Cloudflare Workers Free + `@opennextjs/cloudflare`** (recommended) | 0 | No non-commercial clause in Cloudflare's free plan (Cloudflare MVPs confirm commercial projects may use it); 100 000 requests/day, **10 ms CPU per invocation** (waiting on the database does not count), 64 MiB bundle (limit raised 4 Sept 2026), 5 cron triggers; Next.js 16 App Router, ISR, server actions, `proxy`, PPR supported by the adapter | Fits a single agency's traffic many times over; the 10 ms CPU rule forces the right architecture anyway (static pages + thin JSON) |
| B. Vercel Hobby | 0 | Vercel's own docs: Hobby "restricts users to non-commercial, personal use only" | Not acceptable for a client's business site (account can be paused); fine for previews |
| C. Vercel Pro | $20 / month + usage | Commercial OK, best Next.js DX, `cdg1` Paris region | Breaks "everything free" |

The code stays portable: no host-specific APIs in app code; cron jobs are plain route handlers triggered by Cloudflare Cron Triggers (or Vercel Cron); images are pre-sized at upload; caching uses standard Next.js APIs. Moving A → C later is a config change, not a rewrite.

> **DECIDED (owner, PROMPT 17): option C — Vercel Pro, region `cdg1` (Paris).**
> This overrides the recommendation above, and the portability clause is what
> makes it a config change rather than a rewrite: `@opennextjs/cloudflare`,
> `wrangler.jsonc`, the R2 incremental cache and the Durable Object ISR queue
> are **not** added, and the Cloudflare cron triggers become Vercel Cron entries
> in `vercel.json`.
>
> What the decision buys, concretely: the **10 ms CPU per invocation** ceiling
> disappears. That ceiling was the one real risk hanging over the fleet page,
> which Lighthouse already scores 66–73 on CPU rather than bytes, and which
> Sprint 6 adds GSAP and view transitions to. It also removes the Hobby plan's
> non-commercial clause, which ruled option B out for a client's business site.
>
> **Implemented 2026-09-15:** `vercel.json` pins functions to `cdg1` and runs
> four Vercel Cron jobs (expire-holds every minute, reminders every 5 minutes,
> expire-reservations every 15, a keep-alive on `/api/health` every 6 hours);
> `package.json` pins Node 24.x; a Vercel production build refuses to build
> without the Supabase variables. The owner's setup steps (environment
> variables and their scopes, domains, Supabase, DNS, checks after the first
> deploy) are in `docs/DEPLOY-VERCEL.md`.
>
> What it costs: $20/month, so "everything free except the domain" is no longer
> true and §13's cost line is updated accordingly. Supabase Free, Resend Free,
> GA4, Cloudflare Web Analytics and UptimeRobot are unaffected — only the host
> changes.
>
> Images stay `unoptimized` with pre-sized variants (plan §2.5, prompt 12's
> browser uploader): Vercel's image optimisation is billed per source image and
> would re-introduce a per-request image service the architecture deliberately
> does without — and keeping it off is what preserves the option to move back.

### 9.2 Runtime layout
- **Next.js 16** App Router, JavaScript, Turbopack, `proxy.js` (exists: admin host rewrite, geo language, bots), next-intl 4 routing (exists), Tailwind 4 tokens (rebuilt), Motion 13, GSAP (desktop home only), react-aria-components (calendar only), zod 4.
- Rendering strategy: every indexable page is **static/ISR** (`generateStaticParams` for locales, vehicles, neighbourhoods); availability, quotes, holds and bookings run through **thin route handlers / server actions** that call Postgres RPCs; admin pages are dynamic (auth) but light.
- On Cloudflare: OpenNext with R2 incremental cache (free 10 GB, no egress fees) and Durable Object queue for ISR revalidation; static assets served from Cloudflare's asset layer. Fallback if ISR misbehaves: full static rebuild triggered by an admin "Publier" button via a GitHub Actions workflow (free minutes) — 2–3 minutes to go live, availability stays live regardless.
- **Supabase Free** (region **West EU (Paris) `eu-west-3`**, closest to Casablanca): Postgres 500 MB (a 15-car agency uses a few MB), Storage 1 GB (fleet photos ≈ 60 MB; inspection photos compressed to ≤ 150 KB → ~300 rentals per GB; when 800 MB is reached move inspections to **R2 free 10 GB**), Auth 50 000 MAU, Realtime 2 M messages, 200 concurrent, 2 projects (prod + staging). Free projects **pause after 1 week of inactivity** → a 6-hourly health ping (Cloudflare Cron) keeps it awake; **no automatic backups on Free** → weekly `pg_dump` via GitHub Actions to a private repo (free) + monthly manual export. Pro ($25/mo) removes both limits if the agency later wants it.
- Email: **Resend Free** (3 000 emails/month, custom domain `diabcar.ma` with SPF/DKIM/DMARC) for booking notifications and customer confirmations; inbound stays on `diabcar@gmail.com` until a mailbox on the domain exists.
- Notifications: Web Push (VAPID keys, free), in-app Realtime.
- WhatsApp: `wa.me` deep links with prefilled text (free). WhatsApp Business Platform later: per-message pricing since 1 July 2025; customer-service replies within the 24 h window are free; utility templates (confirmations, reminders) are billed per message → Phase 2 only if worth it.
- Anti-spam: Cloudflare Turnstile (free) on booking/contact; rate limiting on server actions (KV counter on Cloudflare / in-memory on Vercel).
- Analytics: GA4 (consent-gated) + Cloudflare Web Analytics (cookieless). Monitoring: Cloudflare/Workers logs, UptimeRobot free, Sentry free tier optional.
- Domain: `diabcar.ma` at a Moroccan registrar (the only paid item), DNS on Cloudflare (free), `diabcar.ma` + `www` + `admin` records; `admin.diabcar.ma` is the same Worker with the host rewrite; HTTPS automatic.
- Environments: `staging` (Supabase project 2 + Workers preview) and `production`; secrets in Cloudflare/Vercel env, never in the repo; `.env.example` exists.

### 9.3 Caching map
| Route | Strategy |
|-------|----------|
| Home, fleet, vehicle, airport, neighbourhoods, FAQ, blog, legal | static + ISR 1 h; admin edits call `revalidatePath` (exists) |
| `/api/availability`, `/api/quote` | dynamic, `Cache-Control: no-store`, ≤ 1 DB round-trip each |
| `/reservation` | dynamic client state; server action for holds/confirm |
| OG images | static per page (generated at build) instead of a runtime image route → zero CPU per request on Workers |
| Admin | dynamic, RLS-protected, `noindex` header (exists) |

### 9.4 Security and compliance (Morocco, Loi 09-08 / CNDP)
- RLS on every table (public reads only published vehicles/FAQ/reviews/settings; writes only via RPC/server actions; admin by role claim).
- Personal data: customers' documents in a **private** bucket with signed URLs (15 min), photos of inspections private; data minimisation (no birthdate unless a legal age rule requires it — you confirm the policy).
- CNDP guidance for websites: **prior declaration** of the personal-data processing (booking form, contact form, newsletter) and display of the **CNDP receipt number** on the forms/legal pages; consent (unchecked checkbox) with identity/purposes/recipients/rights wording; **consent before non-essential cookies** (the existing cookie banner gates GA4 — keep, and make the banner text CNDP-compliant); a **transfer request** because hosting/processing is outside Morocco (Cloudflare/Supabase EU). This is Diab Car's legal obligation; the site provides the wording and the fields.
- Prices displayed TTC in MAD (EUR only as an indicative conversion, exists).

### 9.5 Payments — none online (decided)
The site takes reservations, not payments. Flow: online reservation → staff confirms on WhatsApp/phone → cash or TPE (card terminal) at pickup; deposit taken at pickup per the settings. Consequences: no PCI scope, no gateway fees, no payment webhooks; the funnel shows the payment line as information only; the admin records the payment method (cash / TPE) and the deposit at pickup in the checklist. Researched and rejected: Stripe (not available to Moroccan merchants), CMI (bank contract, 2,500–4,000 MAD setup, 1.5–2.5% per transaction), Payzone (2–3%), PayPal (withdrawals to Moroccan banks restricted).

### 9.6 Observability of the free limits
A tiny `/admin/systeme` panel shows: Supabase DB size, storage used, Workers requests today, email quota used, last backup date — so the "free" architecture never surprises anyone.

---

## 10. Existing codebase — keep / rebuild / extend / delete

| Area | Files | Decision |
|------|-------|----------|
| Routing, locales, geo default, bots, admin host | `src/i18n/*`, `src/proxy.js` | **Keep** (add new page keys) |
| Auth (Supabase + demo token), admin base | `src/lib/auth/*`, `src/lib/supabase/*` | **Keep**; add role claim hook + RLS by role |
| Data layer (adapter pattern, demo store) | `src/lib/data/*` | **Extend** for units, blocks, holds, events, customers, notifications; demo adapter keeps working for local dev |
| Pricing, formatting, SEO helpers, JSON-LD, sitemap/robots/manifest, llms.txt, IndexNow, email, WhatsApp | `src/lib/pricing.js`, `format.js`, `seo.js`, `indexnow.js`, `email.js`, `whatsapp.js`, `src/app/sitemap.js` … | **Keep**; add `Car`/`ItemList`/`Service` variants, richer WhatsApp templates |
| Design tokens, fonts, utilities | `src/styles/globals.css`, `src/styles/fonts.js` | **Rebuild** with section 2 tokens (light/dark), Archivo replaces Fraunces; delete `btn-gold`, `text-gradient-gold`, `zellige`, `arch`, gold `plate` |
| Logo | `src/components/site/Logo.js`, `src/app/icon.svg`, OG renderer `src/lib/og.js` | **Rebuild** (badge SVG + wordmark; OG recoloured black/white/red) |
| Header, Footer, Hero, HeroTitle, HomeSections, VehicleCard, BookingWidget, FleetFilters, VehicleQuote, BookingForm, PageHero, Marquee, WhatsAppFab, FaqAccordion | `src/components/site/*` | **Rebuild** to sections 4–5 (structure reused where it fits: FleetFilters URL sync, BookingForm zod schema, FaqAccordion a11y) — Marquee becomes the road divider |
| Reveal (CSS scroll-driven), Price (server), Currency, Theme, Language, Cookie banner, JsonLd, Breadcrumbs, Markdown | `src/components/ui/Reveal.js`, `Price.js`, providers | **Keep** (tokens change under them) |
| Admin shell + pages | `src/components/admin/*`, `src/app/(admin)/*` | **Rebuild** IA to section 7; keep server actions pattern, forms, revalidate/IndexNow tools |
| Schema + seed | `supabase/schema.sql`, `supabase/seed.mjs`, `src/lib/data/seed.js` | **Extend** (section 6.2), fix contacts (fax `+212 5 22 26 03 61`, email `diabcar@gmail.com`), remove sample reviews from production, mark unverified numbers |
| Known bugs to fix in the rebuild | mileage label duplication on vehicle page, time select truncation, FAB overlap on vehicle pages | included in Sprint 1/3 |

---

## 11. Build plan for Claude Code (sprints, acceptance criteria)

Estimates are working days of focused Claude Code sessions, not calendar promises.

| Sprint | Scope | Acceptance criteria (must pass before the next sprint) | Est. |
|--------|-------|--------------------------------------------------------|------|
| **0 — Foundation & rebrand** | Tokens (light/dark), fonts, logo assets (badge SVG, wordmark, favicon, OG), base UI kit (Button with sweep/magnetic, Input, Select, Chip, Card, RedLine, Sheet, Cursor, Skeleton), motion tokens, theme transition, reduced-motion switch, contrast lint | Automated contrast check on every text/background pair ≥ 4.5:1 (UI ≥ 3:1); Lighthouse mobile ≥ 95 on the empty shell; RTL screenshot of the kit matches LTR mirrored; no gold token remains (grep) | 2–3 d |
| **1 — Home, booking module, cards, footer** | Hero + ignition, booking module with range calendar and smart locations, purpose tiles, fleet section, airport banner (static version), steps, trust, reviews, map (SVG), FAQ, CTA, footer; vehicle card in all states | LCP ≤ 2.0 s / INP ≤ 200 ms / CLS ≤ 0.05 on Lighthouse mobile for all 4 locales; hero image is the LCP element; keyboard-only booking search works; Arabic layout audit passed | 4–5 d |
| **2 — Availability engine** | Migrations (units, locations, blocks, holds, events, audit, customers, notifications), exclusion constraints, RPCs (`search_availability`, `create_hold`, `create_reservation`, `next_available`), cron release of holds, Realtime channel, demo-adapter parity, seed with real fleet | Concurrency test: 2 parallel bookings for the last unit → exactly one succeeds, the other gets alternatives; overlapping insert rejected by the DB; hold expires at 10 min; RPC ≤ 50 ms on seed data | 3–4 d |
| **3 — Results, vehicle page, funnel, confirmation, WhatsApp** | Results page with live counts/filters/modify-search/unavailable list/empty state; vehicle page with sticky panel, availability block, alternatives, gallery; 4-step funnel with hold timer, extras, customer form, summary, Turnstile; confirmation sequence; emails; WhatsApp templates in 4 languages; bug fixes (mileage label, time select, FAB) | Playwright e2e in 4 locales: search → select → hold → confirm → confirmation reference; WhatsApp message contains car, dates, location, price; results parametrised URLs `noindex`; bare fleet page indexable | 5–6 d |
| **4 — Admin v1** | Dashboard (today, action required, timeline), reservations (list/detail/state machine/create with conflict + alternatives), calendar Gantt with drag, fleet (models/units/photos with variant generation/blocks), pickup & return checklists (condition map, photos, signature), customers, content (FAQ DB, blog, reviews), prices, settings, notifications (bell + web push + email), activity log, global search, roles + RLS | Return checklist → cleaning → ready flips public availability with no manual step; every state change has an event + audit row with actor and reason; agent role cannot see prices/settings (RLS test); push notification received on a phone for a new booking | 6–8 d |
| **5 — SEO / GEO / AEO** | Airport page, `automatique`, `suv`, `longue durée`, 6 neighbourhood pages with unique content, FAQ database (60/40/30/20), answer blocks, JSON-LD variants, image naming/alt, static OG per page, GBP checklist executed by Diab Car, citations list, review flow | Rich Results Test clean on home/vehicle/airport/FAQ; hreflang validator clean ×4; sitemap lists every indexable URL and nothing else; each neighbourhood page ≥ 40% unique text | 3–4 d |
| **6 — WOW motion, polish, QA, launch** | View transitions (car continuity, theme, language), hero→fleet handoff and runway (GSAP, desktop), cursor, count-ups, RTL motion mirroring, a11y audit (axe, keyboard, screen reader on the funnel), performance budget CI (Lighthouse CI), content freeze, DNS cutover, Search Console/Bing submission, IndexNow, backups job, uptime monitor, CNDP wording in place | Lighthouse mobile ≥ 90 perf / 100 a11y / 100 SEO on home, fleet, vehicle, airport in FR and AR; reduced-motion run shows no animation; all 3 WOW moments signed off by Yahya on desktop and mobile | 4–5 d |
| **v1.1** | Compare (3 cars), Google review import, customer documents + reminders, finance basics (cash/TPE payments, deposits, receipts), WhatsApp templates if worth it | — | later |

Total ≈ 27–35 working days of Claude Code sessions. Sprints 1 and 2 can run in parallel worktrees (UI vs database).

Claude Code working rules (to put in `CLAUDE.md` when building starts): JavaScript only; tokens only (no raw hex in components); every new component ships light + dark + RTL + reduced-motion; every price shows day + total when dates exist; every DB write goes through an RPC/server action with zod validation and a `reason` when sensitive; no library added without a line in this plan; Lighthouse mobile budget checked before each merge.

---

## 12. Inputs needed from you / Diab Car

Blocking for Sprint 0–1
1. Vector logo (AI/EPS/PDF/SVG) or written approval to redraw it.
2. The real fleet: model, year, transmission, fuel, seats, doors, luggage, colour, **number of units per model**, plates (admin only), price per day by season, deposit, included km/day or unlimited, insurance included/excluded, min age and licence years, fuel policy, prep time between rentals.
3. Locations and fees: airport delivery fee and meeting point, neighbourhood delivery fees, hours (agency and airport), one-way policy, cities really served for delivery/one-way.
4. Photos of the real cars (or a date for a half-day shoot; shot list in 2.5).
5. Legal facts to print: legal name, RC, ICE, capital (the seed has researched values — confirm), CNDP receipt number (or start the declaration), cancellation and modification policy, deposit release delay.
6. Accounts (all free): Cloudflare, Supabase, Resend, GitHub, Google Search Console/GA4/GBP access, registrar access for `diabcar.ma` DNS.
7. ~~The WhatsApp number that receives bookings and the phone for calls~~ — **confirmed**: WhatsApp `06 59 77 55 82` (printed on Diab Car's own announcement), calls `05 22 26 03 05`, fax `05 22 26 03 61`, e-mail `diabcar@gmail.com`.

Nice to have
8. Any inspiration links for photography and motion you still want to add.
9. 5–10 real customer reviews (with permission) and the Google review link.
10. Short brand story for "À propos" (founding year 2013 — confirm), team names/roles for admin accounts.

---

## 13. Risks and open questions

| Risk / question | Impact | Mitigation / decision needed |
|-----------------|--------|------------------------------|
| No real photos at launch | The design collapses without cinematic cars | Shoot before Sprint 1 ends; silhouettes are a stopgap, not a launch option |
| 10 ms CPU limit on Workers Free | A heavy dynamic route could throw errors | Static-first architecture; measure in `wrangler dev`; fallback = Workers Paid ($5/mo) or Vercel Pro ($20/mo) — decide only if measured |
| Supabase Free pauses/backups | Data loss or a sleeping database | Keep-alive cron + weekly `pg_dump` in GitHub Actions; upgrade to Pro ($25/mo) when the agency wants daily backups |
| Unverified trust numbers (clients, rating, "since 2013") | Legal/credibility risk | Only verified numbers render; placeholders removed at content freeze |
| View transitions in Firefox lack "types" | Slightly simpler transitions on Firefox | Feature-detect; crossfade fallback |
| Arabic terminology (كراء vs تأجير) | Search reach vs local naturalness | Both used (primary كراء on the card; تأجير in titles/answers) |
| Doorway-page temptation for other cities | Google penalty | P2 pages only with confirmed service + unique content |
| CNDP compliance is Diab Car's obligation | Fines / takedown risk | Site ships compliant wording, fields and consent; Diab Car files the declaration and transfer request |
| Hold length and confirmation timing (no prepayment, so a reservation is only a promise until staff confirm) | Lost bookings vs blocked cars | 10 min hold, then `pending` until staff confirm on WhatsApp within the SLA shown on the confirmation page; unconfirmed reservations auto-expire after a settings-defined delay (default 12 h) and free the car — confirm the SLA and the delay |
| Fonts: Archivo width axis file size | +1 font file on first load | Latin subset only, `wdth+wght` single file, preloaded; measured in Sprint 0 |

---

## Sources checked on 6 Sept 2026
- Vercel Hobby plan terms (non-commercial): https://vercel.com/docs/plans/hobby
- Vercel regions (cdg1 Paris, default iad1): https://vercel.com/docs/regions
- Cloudflare Workers limits (100k req/day, 10 ms CPU, cron): https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare free plan for commercial projects (community answer by a Cloudflare MVP): https://community.cloudflare.com/t/use-free-plan-for-commercial-project/453559
- Cloudflare Worker size limit raised to 64 MiB (4 Sept 2026): https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/
- OpenNext Cloudflare adapter (Next.js 16 support, features): https://opennext.js.org/cloudflare
- Supabase regions (West EU Paris eu-west-3): https://supabase.com/docs/guides/platform/regions
- Supabase pricing (Free limits, pausing, backups; Pro $25): https://supabase.com/pricing
- Same-document View Transitions Baseline (Firefox 144, 14 Oct 2025): https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available
- React 19.2 / Next.js 16 view transitions (experimental flag, unstable_ViewTransition, browser coverage): https://www.digitalapplied.com/blog/react-19-2-view-transitions-animate-navigation-nextjs-16
- GSAP 100% free incl. former Club plugins, commercial use (30 Apr 2025): https://webflow.com/updates/gsap-becomes-free
- LCP ignores opacity:0 elements (DebugBear): https://www.debugbear.com/blog/opacity-animation-poor-lcp
- Google: AI features need no additional technical requirements: https://developers.google.com/search/docs/appearance/ai-features
- Stripe global availability (Morocco not listed): https://stripe.com/global
- Moroccan payment gateways (CMI fees/setup, Payzone): https://azulweb.ma/en/accept-online-payments-morocco/ and https://www.king4media.com/blog/paiement-en-ligne-maroc-cmi-2026
- WhatsApp Business Platform per-message pricing since 1 July 2025 (third-party summary; official page requires login): https://blueticks.co/blog/whatsapp-business-api-pricing-2026
- CNDP guidelines for websites (Loi 09-08): https://cndp.ma/wp-content/uploads/2023/01/CNDP-guide-conformite-sites-web-fr.pdf
- Satoshi / ITF Free Font License limits: https://www.uwarp.design/blog/satoshi-font-guide
- Archivo variable (wdth/wght) on Fontsource: https://fontsource.org/fonts/archivo/install
- Competitors reviewed: https://carrentcasablanca.com/location-voiture-casablanca-aeroport/ · https://voiture-location-maroc.com/voiture-casablanca/ · https://www.avis.ma/location-voiture-maroc/agences-aeroport/location-voiture-casablanca-aeroport
