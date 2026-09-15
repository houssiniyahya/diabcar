# Putting Diab Car online with Vercel

This is the checklist for the person setting up the hosting. The code is already prepared: `vercel.json` (Paris region, scheduled jobs), `package.json` (Node 24), and the safety checks described below. Everything here is done in the Vercel, Supabase, GitHub and domain-registrar dashboards. **Never paste a key or password into this file, the repository, or a chat.**

Decided in `docs/MASTER-PLAN.md` §9.1: **Vercel Pro**, functions in **`cdg1` (Paris)**.

---

## 0. Before anything else — security

1. **Rotate the Supabase keys that were shared in a conversation.** In Supabase: *Project Settings → API → service_role → Reset*. Also revoke the Personal Access Token under *Account → Access Tokens*. Use only the NEW keys below.
2. **Make the GitHub repository private.** It is public today, so anyone can read the code, the plan and the database structure. On GitHub: *Settings → General → Danger Zone → Change repository visibility → Private*. Vercel Pro deploys private repositories normally.
3. In Supabase, *Authentication → Sign In / Providers*: turn **off** "Allow new users to sign up" and keep **"Confirm email" on**. Staff accounts are created by hand (step 4).

---

## 1. Create the project

1. On vercel.com, use (or upgrade to) a **Pro** team. The Hobby plan forbids commercial use.
2. *Add New → Project → Import* the GitHub repository `houssiniyahya/diabcar`.
3. Framework: **Next.js** (detected). Root directory: the repository root. Leave the build and install commands at their defaults.
4. Before the first deploy, add the environment variables from step 2. The first deployment is always Production.

The region comes from `vercel.json`. After deploying, *Settings → Functions* should show **cdg1 (Paris)**.

---

## 2. Environment variables

*Settings → Environment Variables*. For each one, tick **only** the environments shown. `NEXT_PUBLIC_…` values are built into the site, so after changing one, redeploy.

| Variable | Value / where to get it | Production | Preview |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://diabcar.ma` | ✅ | — |
| `ADMIN_HOST` | `admin.diabcar.ma` | ✅ | — |
| `ADMIN_ALLOW_PATH` | `true` (opens `/admin` on preview addresses) | **never** | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | ✅ | staging project only, or leave empty |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API → publishable (anon) key | ✅ | staging project only, or leave empty |
| `SUPABASE_SERVICE_ROLE_KEY` | the **new** service_role key from step 0 | ✅ | **never** (unless Preview uses a separate staging project) |
| `ADMIN_EMAILS` | the owner's login e-mail(s), comma-separated | ✅ | — |
| `CRON_SECRET` | a long random string (64 characters) — generate it, keep it private | ✅ | — |
| `RESEND_API_KEY` | resend.com → API Keys | ✅ | **never** (a preview would e-mail the agency) |
| `EMAIL_FROM` | `Diab Car <reservations@diabcar.ma>` | ✅ | — |
| `BOOKING_NOTIFY_EMAIL` | the agency inbox that receives bookings | ✅ | — |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile → site key | ✅ | — |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile → secret key (set **both** or neither) | ✅ | — |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 measurement ID (`G-…`) | ✅ | — |
| `INDEXNOW_KEY` | a random 32-character hex string | ✅ | — |

**Do not set on Vercel:** `ADMIN_DEMO_PASSWORD`, `AUTH_SECRET` (development only), `VAPID_*` (Web Push is not built yet), `E2E_*` (local tests only).

What the code does if something is missing:
- **Supabase variables missing in Production:** the build is **refused**, with a message naming them, and the previous version stays online. This stops the public site from ever showing demo cars and prices.
- **A preview without Supabase:** it runs on demo data behind Vercel's login. The demo admin stays **closed** unless Preview is given its own 32+ character `AUTH_SECRET` and a non-default `ADMIN_DEMO_PASSWORD`.
- **`CRON_SECRET` missing:** the scheduled jobs refuse to run (they answer 401), rather than running open.
- **Only one Turnstile key:** the anti-spam check is skipped (with a warning in the logs), never blocking bookings.

---

## 3. Domains

*Settings → Domains*:

1. Add **`diabcar.ma`**. If Vercel suggests "redirect to www (recommended)", **decline**: every link, sitemap and Google listing of the site uses `https://diabcar.ma`.
2. Add **`www.diabcar.ma`** → *Edit* → **Redirect to `diabcar.ma`** (308, permanent).
3. Add **`admin.diabcar.ma`** as a normal domain, **no redirect**. The same project serves the admin there.

At the `.ma` registrar, create **exactly** the DNS records each domain card shows (an A record for `diabcar.ma`, CNAME records for `www` and `admin`). Copy the values from Vercel. Do not use old values from the internet: newer projects get project-specific targets. Remove any other A/AAAA records on `diabcar.ma`. HTTPS certificates are issued automatically once DNS resolves.

---

## 4. Supabase

1. *Authentication → URL Configuration*: **Site URL** `https://admin.diabcar.ma`; add `https://admin.diabcar.ma/**` to Redirect URLs.
2. Staff accounts: *Authentication → Users → Add user → Create new user* (e-mail + password, auto-confirm). Then give the account a role, as described in `supabase/migrations/0005b_dashboard_steps.md`.
3. Keep sign-ups off and "Confirm email" on (step 0). Admin access comes only from the role the database stores. A role a user writes into their own profile is ignored.

---

## 5. E-mail and anti-spam

- **Resend:** *Domains → Add `diabcar.ma`* and create the SPF / DKIM / DMARC records it lists at the registrar. Until the domain is verified, booking e-mails are not delivered.
- **Cloudflare Turnstile:** allowed hostname **`diabcar.ma`** (it covers `www` and `admin`).

---

## 6. Scheduled jobs (already in `vercel.json`)

| Job | Every | What it does |
|---|---|---|
| `/api/cron/expire-holds` | minute | frees cars held in unfinished bookings |
| `/api/cron/reminders` | 5 minutes | notifies staff: pickup within 45 min not ready, return due, return late |
| `/api/cron/expire-reservations` | 15 minutes | cancels requests nobody confirmed in time; keeps cleaning blocks honest |
| `/api/health` | 6 hours | keep-alive, so the Supabase project is never paused for inactivity |

Vercel runs them **only on Production**, in **UTC**, and sends `CRON_SECRET` by itself. Every job is safe to run twice.

---

## 7. After the first deploy — check each one

1. `https://diabcar.ma/api/health` shows `"ok":true` and **`"mode":"supabase"`**. `demo` means the Supabase variables are wrong.
2. `https://diabcar.ma/fr`, `/en`, `/ar`, `/es` load. Arabic is right-to-left. `https://www.diabcar.ma` redirects to `https://diabcar.ma`.
3. `https://admin.diabcar.ma` asks for a login, accepts a real staff account, and refuses a wrong password **without** showing any password hint.
4. *Settings → Cron Jobs*: press **Run** on each job, then *View Logs*. Each must answer **200** with `{"ok":true,…}`. A 401 means `CRON_SECRET` is missing.
5. Make one real test booking. The agency e-mail arrives, the booking shows in the admin, and the WhatsApp button opens with the car and dates. Then cancel it in the admin.
6. `https://diabcar.ma/indexnow-key.txt` shows the key. In Google Search Console, submit `https://diabcar.ma/sitemap.xml`.
7. Run a Lighthouse test on the live site. The budget is LCP ≤ 2.0 s and CLS ≤ 0.05 on mobile.

---

## Day to day

- **A push to `main`** deploys Production. **Any other branch or pull request** gets a Preview: a private address behind Vercel's login, never indexed by Google.
- **Undo a bad release:** *Deployments → an earlier deployment → Promote* (Instant Rollback). A rollback does not change the scheduled jobs.
- The page-routing layer runs in all Vercel regions. Pages, the admin and the database calls run in Paris, next to the Supabase project.
