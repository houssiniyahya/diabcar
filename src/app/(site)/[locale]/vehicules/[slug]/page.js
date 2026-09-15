import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Breadcrumbs from '@/components/site/Breadcrumbs';
import JsonLd from '@/components/site/JsonLd';
import VehicleCard from '@/components/site/VehicleCard';
import { carShot } from '@/components/site/CarImage';
import VehicleGallery from '@/components/site/vehicle/VehicleGallery';
import VehicleBooking from '@/components/site/vehicle/VehicleBooking';
import { Link } from '@/i18n/navigation';
import { photosByVehicle, photosFor, uploadedAlt } from '@/components/site/vehiclePhotos';
import { getSettings, getVehicleBySlug, listFaqs, listLocations, listVehiclePhotos, listVehicles, t as pick } from '@/lib/data';
import { shortAnswerFor } from '@/lib/faq';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd, localizedMetadata, ogImageUrl, vehicleJsonLd } from '@/lib/seo';

/**
 * The vehicle page (plan 4.6) — a product launch page that tells the truth
 * about availability for the visitor's dates.
 *
 * Statically rendered with ISR. It does NOT read searchParams: doing so would
 * opt the route out of static rendering, and the dates only matter to the
 * booking column, which reads them on the client. Parametrised URLs are marked
 * noindex by src/proxy.js, so `?from=…` never competes with the canonical page
 * (CLAUDE.md rule 8).
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  const vehicles = await listVehicles({ published: true });
  return vehicles.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const v = await getVehicleBySlug(slug);
  if (!v || v.published === false) return {};

  const t = await getTranslations({ locale, namespace: 'seo.vehicle' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const name = `${v.brand} ${v.model}`;

  /* Plan 8.2: the title carries the LOW-SEASON price — the "dès X MAD/jour"
     figure a visitor can actually get, not the high-season one. */
  const price = formatMAD(v.pricePerDay, locale);

  return localizedMetadata({
    locale,
    href: { pathname: '/vehicules/[slug]', params: { slug } },
    title: t('title', { name, price }),
    description: t('description', {
      name,
      price,
      transmission: tc(`transmission.${v.transmission}`).toLowerCase(),
      seats: v.seats,
      deposit: formatMAD(v.deposit, locale),
      mileage: v.mileageLimit ? tc('kmPerDay', { km: v.mileageLimit }) : tc('unlimitedKm').toLowerCase(),
    }),
    type: 'website',
    images: [
      {
        url: ogImageUrl(locale, {
          slug,
          title: `${name} ${v.year}`,
          subtitle: pick(v.description, locale),
          kicker: tc(`categories.${v.category}`),
          car: v.image,
          price: `${formatMAD(v.pricePerDay, 'en')} / ${DAY_WORD[locale] || DAY_WORD.fr}`,
        }),
        width: 1200,
        height: 630,
        alt: name,
      },
    ],
  });
}

const DAY_WORD = { fr: 'jour', en: 'day', ar: 'يوم', es: 'día' };

export default async function VehiclePage({ params }) {
  const { locale, slug } = await params;
  const v = await getVehicleBySlug(slug);
  if (!v || v.published === false) notFound();

  const [settings, locations, all, faqs, photoRows] = await Promise.all([
    getSettings(),
    listLocations(),
    listVehicles({ published: true }),
    listFaqs({ published: true }),
    /* The whole table rather than `{ vehicleId }`: the gallery needs this
       car's photos and the "similar" row below needs three other cars', so one
       unfiltered read beats four filtered ones. Public read, no cookies — the
       route stays statically rendered (plan 7.1). */
    listVehiclePhotos({}),
  ]);
  const byVehicle = photosByVehicle(photoRows);
  const ownPhotos = photosFor(byVehicle, v);

  const t = await getTranslations({ locale, namespace: 'vehicle' });
  const tc = await getTranslations({ locale, namespace: 'common' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tf = await getTranslations({ locale, namespace: 'fleet' });

  const name = `${v.brand} ${v.model}`;
  const url = absoluteUrl(locale, { pathname: '/vehicules/[slug]', params: { slug } });
  const fleetUrl = absoluteUrl(locale, '/vehicules');
  const mileage = v.mileageLimit ? tc('kmPerDay', { km: v.mileageLimit }) : tc('unlimitedKm');

  /* ---- gallery ------------------------------------------------------
     Descriptive alt per language (rule 8), and an alt the operator typed on
     the upload wins over the template — they saw the frame. Angles that do not
     exist are simply absent, whether they were never shot or never uploaded —
     the gallery hides its toggle and strip accordingly. */
  const shotFor = (angle, altKey) => {
    const shot = carShot(v, angle, ownPhotos);
    if (!shot) return null;
    const alt = uploadedAlt(ownPhotos, angle, locale) || t(`alt.${altKey}`, { name, category: tc(`categories.${v.category}`) });
    return { ...shot, alt };
  };
  const exterior = [shotFor('front', 'front'), shotFor('side', 'side'), shotFor('rear', 'rear')].filter(Boolean);
  const interior = [shotFor('interior', 'interior'), shotFor('dash', 'dash')].filter(Boolean);

  /* ---- specs: typography, no cartoon icons (plan 4.6) ---- */
  const specs = [
    tc('seatsCount', { count: v.seats }),
    tc(`transmission.${v.transmission}`),
    tc(`fuel.${v.fuel}`),
    tc('doorsCount', { count: v.doors }),
    v.ac ? tc('features.ac') : null,
    tc('luggageCount', { count: v.luggage }),
    /* KILOMÉTRAGE ILLIMITÉ only when it is actually unlimited. */
    v.mileageLimit ? null : tc('unlimitedKm'),
  ].filter(Boolean);

  /* The four that float over the lead image. */
  const floating = specs.slice(0, 4);

  /* ---- FAQ ----------------------------------------------------------
     Prefer questions written for this car; fall back to the general published
     set, because a page with an empty FAQ helps nobody. Whatever ends up here
     is what goes into FAQPage — Google requires the structured data to match
     the visible text (plan 8.2). */
  const own = faqs.filter((f) => f.vehicleId === v.id || f.category === 'vehicle');
  const shownFaqs = (own.length ? own : faqs).slice(0, 4);

  /* ---- similar: same category first, then closest price (plan 4.6) ---- */
  const similar = all
    .filter((x) => x.id !== v.id)
    .sort(
      (a, b) =>
        Number(b.category === v.category) - Number(a.category === v.category) ||
        Math.abs(a.pricePerDay - v.pricePerDay) - Math.abs(b.pricePerDay - v.pricePerDay),
    )
    .slice(0, 3);

  const bookingLabels = {
    pricePerDay: t('booking.pricePerDay'),
    perDay: t('booking.perDay'),
    chooseDates: t('booking.chooseDates'),
    checking: t('booking.checking'),
    availableForDates: t('booking.availableForDates'),
    unavailableUntil: t('booking.unavailableUntil'),
    unavailable: t('booking.unavailable'),
    alternatives: t('booking.alternatives'),
    checkFailed: t('booking.checkFailed'),
    pickDates: t('booking.pickDates'),
    totalFor: t('booking.totalFor'),
    deposit: t('booking.deposit'),
    book: t('booking.book'),
    bookShort: t('booking.bookShort'),
    whatsapp: t('booking.whatsapp'),
    close: t('booking.close'),
  };


  return (
    <div className="pt-[calc(var(--header-h)+1.5rem)]">
      <div className="container-x">
        <Breadcrumbs
          items={[
            { name: tn('home'), href: '/', url: absoluteUrl(locale, '/') },
            { name: tf('title'), href: '/vehicules', url: fleetUrl },
            { name, url },
          ]}
        />

        <Link href="/vehicules" className="text-meta mt-6 inline-flex items-center gap-2 font-semibold text-text-2 transition-colors hover:text-text">
          <svg viewBox="0 0 24 24" className="h-4 w-4 rotate-180 rtl:rotate-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
          {t('backToFleet')}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-12">
          {/* ---------------------------------------------- left column */}
          <div className="lg:col-span-8">
            <p className="eyebrow">{tc(`categories.${v.category}`)}</p>
            {/* The name breaks over two lines: brand, then model (plan 4.6). */}
            <h1 className="mt-3 text-text">
              <span className="text-display-1 block">{v.brand}</span>
              <span className="text-display-1 block">{v.model}</span>
            </h1>

            <div className="relative mt-8">
              <VehicleGallery exterior={exterior} interior={interior} labels={{ ...galleryLabels(t) }} priority />

              {/* Four Meta specs floating over the lead image (plan 4.6). */}
              {floating.length ? (
                <ul className="pointer-events-none absolute inset-x-0 bottom-0 hidden flex-wrap gap-2 p-4 sm:flex">
                  {floating.map((s) => (
                    <li key={s} className="text-meta rounded-full bg-bg/85 px-3 py-1.5 font-semibold text-text backdrop-blur-sm">
                      {s}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* ---- typographic spec grid ---- */}
            <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-8 sm:grid-cols-3">
              {specs.map((s) => (
                <li key={s} className="text-meta font-semibold text-text">
                  {s}
                </li>
              ))}
            </ul>

            {pick(v.description, locale) ? (
              <p className="mt-10 max-w-2xl text-lg leading-relaxed text-text-2">{pick(v.description, locale)}</p>
            ) : null}

            {/* ---- included / not included, from settings ---- */}
            <div className="mt-12 grid gap-10 sm:grid-cols-2">
              <div>
                <p className="eyebrow">{t('included')}</p>
                <ul className="mt-4 space-y-2.5">
                  {[
                    t('includedItems.insurance'),
                    t('includedItems.mileage', { mileage }),
                    t('includedItems.assistance'),
                    t('includedItems.taxes'),
                  ].map((s) => (
                    <li key={s} className="text-meta flex gap-3 text-text-2">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-signal" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow">{t('notIncluded')}</p>
                <ul className="mt-4 space-y-2.5">
                  {[t('notIncludedItems.fuel'), t('notIncludedItems.tolls'), t('notIncludedItems.extras'), t('notIncludedItems.oneWay')].map((s) => (
                    <li key={s} className="text-meta flex gap-3 text-text-muted">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-text-muted" aria-hidden="true" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ---- FAQ ---- */}
            {shownFaqs.length ? (
              <section className="mt-14 border-t border-border pt-10">
                <h2 className="text-h2 text-text">{t('faqTitle')}</h2>
                <dl className="mt-6 space-y-6">
                  {shownFaqs.map((f) => (
                    <div key={f.id}>
                      <dt className="text-meta font-semibold text-text">{pick(f.question, locale)}</dt>
                      <dd className="mt-2 text-text-2">{shortAnswerFor(f, locale)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>

          {/* ---------------------------------------------- right column */}
          <aside className="lg:col-span-4">
            {/* The way this car is booked (owner, Sept 2026): dates, delivery
                and options for THIS car, in a pop-up, without leaving the page.
                The panel owns it — « Réserver cette voiture » and the mobile bar
                both open it — so there is exactly one Réserver per car. */}
            <VehicleBooking
              vehicle={{ slug: v.slug, name, basePerDay: v.pricePerDay, category: v.category }}
              locations={locations}
              labels={bookingLabels}
              locale={locale}
              whatsappNumber={settings?.whatsapp || null}
            />
          </aside>
        </div>

        {/* ---- similar ---- */}
        {similar.length ? (
          <section className="section-y">
            <h2 className="text-h2 text-text">{t('similar')}</h2>
            <div className="mt-8 grid gap-5 pb-28 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((s) => (
                <VehicleCard key={s.id} vehicle={s} photos={photosFor(byVehicle, s)} fleet={all} className="h-full" />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <JsonLd
        data={[
          vehicleJsonLd(v, locale, url),
          breadcrumbJsonLd([
            { name: tn('home'), url: absoluteUrl(locale, '/') },
            { name: tf('title'), url: fleetUrl },
            { name, url },
          ]),
          /* FAQPage only for the questions actually on the page (plan 8.2). */
          ...(shownFaqs.length ? [faqJsonLd(shownFaqs, locale, shortAnswerFor)] : []),
        ]}
      />
    </div>
  );
}

function galleryLabels(t) {
  return {
    exterior: t('gallery.exterior'),
    interior: t('gallery.interior'),
    open: t('gallery.open'),
    close: t('gallery.close'),
    previous: t('gallery.previous'),
    next: t('gallery.next'),
    counter: t('gallery.counter'),
  };
}
