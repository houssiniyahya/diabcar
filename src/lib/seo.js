import { getPathname } from '@/i18n/navigation';
import { ogLocales, routing } from '@/i18n/routing';
import { t } from '@/lib/constants';
import { answerFor } from '@/lib/faq';
/* Which Open Graph cards `npm run og` has pre-rendered. Static import, never
   an fs read — this module runs inside the Worker (CLAUDE.md rule 9). */
import ogManifest from '../../public/og/manifest.json';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://diabcar.ma').replace(/\/$/, '');
export const SITE_NAME = 'Diab Car';
export const BUSINESS_ID = `${SITE_URL}/#business`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Absolute, localized URL for an internal href (string or {pathname, params}). */
export function absoluteUrl(locale, href) {
  return `${SITE_URL}${getPathname({ locale, href })}`;
}

/**
 * Metadata for a localized page: canonical, hreflang (4 locales + x-default → fr),
 * Open Graph with locale/alternateLocale, Twitter card. `href` is the internal
 * route (e.g. '/vehicules' or { pathname: '/vehicules/[slug]', params: { slug } }).
 */
/** URL of the dynamic Open Graph card for a page. */
/**
 * The Open Graph card for a page.
 *
 * Prefers a card pre-rendered by `npm run og` (plan 9.3: static per page
 * instead of a runtime image route, so a share costs the Worker nothing).
 * Falls back to the dynamic /[locale]/og route for every page that has no
 * pre-rendered card — which is all of them until the script has run.
 *
 * The manifest is a static JSON import, never an fs read: this runs inside the
 * Worker at request time for dynamic pages (CLAUDE.md rule 9).
 *
 * @param {string} locale
 * @param {{ slug?: string, title?: string, subtitle?: string, kicker?: string, car?: string, price?: string }} [options]
 *   `slug` opts into the static lookup; without it the dynamic route is used.
 */
export function ogImageUrl(locale, { slug, title, subtitle, kicker, car, price } = {}) {
  if (slug && ogManifest?.vehicles?.[locale]?.includes(slug)) {
    return `${SITE_URL}/og/${locale}/${slug}.png`;
  }

  const q = new URLSearchParams();
  if (title) q.set('title', title.replace(/\s*\|\s*Diab Car$/i, '').slice(0, 90));
  if (subtitle) q.set('subtitle', subtitle.slice(0, 140));
  if (kicker) q.set('kicker', kicker.slice(0, 60));
  if (car) q.set('car', car);
  if (price) q.set('price', price.slice(0, 30));
  return `${SITE_URL}/${locale}/og?${q.toString()}`;
}

export function localizedMetadata({ locale, href = '/', title, description, images, type = 'website', noIndex = false, keywords, ogTitle, ogKicker }) {
  const languages = {};
  for (const l of routing.locales) languages[l] = absoluteUrl(l, href);
  languages['x-default'] = absoluteUrl(routing.defaultLocale, href);
  const url = languages[locale];
  const ogImages = images?.length ? images : [{ url: ogImageUrl(locale, { title: ogTitle || title, subtitle: description, kicker: ogKicker }), width: 1200, height: 630, alt: title }];

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords,
    alternates: { canonical: url, languages },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: ogImages,
      locale: ogLocales[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => ogLocales[l]),
    },
    twitter: { card: 'summary_large_image', title, description, images: ogImages.map((i) => i.url) },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  };
}

/* ------------------------------------------------------------------ */
/* JSON-LD builders                                                    */
/* ------------------------------------------------------------------ */
const DAY_MAP = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function businessJsonLd(settings, locale) {
  const s = settings || {};
  const sameAs = [s.facebookUrl, s.instagramUrl, s.tiktokUrl, s.gbpUrl].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AutoRental',
        '@id': BUSINESS_ID,
        name: s.name || SITE_NAME,
        legalName: s.legalName,
        alternateName: ['Diab Car Casablanca', 'DiabCar'],
        description: t(s.tagline, locale),
        url: `${SITE_URL}/${locale}`,
        logo: `${SITE_URL}/icon.svg`,
        telephone: s.phonePrimary,
        email: s.email || undefined,
        foundingDate: s.foundedYear ? String(s.foundedYear) : undefined,
        address: {
          '@type': 'PostalAddress',
          streetAddress: s.addressLine,
          addressLocality: s.city || 'Casablanca',
          addressRegion: s.region || 'Casablanca-Settat',
          postalCode: s.postalCode,
          addressCountry: 'MA',
        },
        geo: s.lat && s.lng ? { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } : undefined,
        hasMap: s.googleMapsUrl || undefined,
        openingHoursSpecification: (s.hours || []).map((h) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: h.days.map((d) => DAY_MAP[d]),
          opens: h.opens,
          closes: h.closes,
        })),
        priceRange: '250-2800 MAD',
        currenciesAccepted: 'MAD',
        paymentAccepted: 'Cash, Credit Card, Bank Transfer',
        areaServed: [
          { '@type': 'City', name: 'Casablanca' },
          { '@type': 'Airport', name: 'Casablanca Mohammed V International Airport', iataCode: 'CMN' },
          { '@type': 'AdministrativeArea', name: 'Casablanca-Settat' },
        ],
        knowsLanguage: ['fr', 'ar', 'en', 'es'],
        sameAs: sameAs.length ? sameAs : undefined,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'reservations',
          telephone: s.whatsapp || s.phonePrimary,
          availableLanguage: ['French', 'Arabic', 'English', 'Spanish'],
          areaServed: 'MA',
        },
        image: [ogImageUrl(locale, { title: s.name || SITE_NAME, subtitle: t(s.tagline, locale) })],
        identifier: s.ice ? [{ '@type': 'PropertyValue', propertyID: 'ICE', value: s.ice }, { '@type': 'PropertyValue', propertyID: 'RC Casablanca', value: s.rc }] : undefined,
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: locale,
        publisher: { '@id': BUSINESS_ID },
      },
    ],
  };
}

export function vehicleJsonLd(vehicle, locale, url) {
  const v = vehicle;
  const name = `${v.brand} ${v.model} ${v.year}`;
  return {
    '@context': 'https://schema.org',
    '@type': ['Product', 'Car'],
    '@id': `${url}#vehicle`,
    url,
    inLanguage: locale,
    name,
    brand: { '@type': 'Brand', name: v.brand },
    model: v.model,
    vehicleModelDate: String(v.year),
    vehicleTransmission: v.transmission === 'automatic' ? 'AutomaticTransmission' : 'ManualTransmission',
    fuelType: v.fuel,
    seatingCapacity: v.seats,
    numberOfDoors: v.doors,
    image: v.images?.length ? v.images : [`${SITE_URL}/images/cars/${v.image || 'berline'}.svg`],
    description: t(v.description, locale),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'MAD',
      price: v.pricePerDay,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: v.pricePerDay,
        priceCurrency: 'MAD',
        unitCode: 'DAY',
        unitText: 'day',
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'DAY' },
      },
      availability: v.published ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      seller: { '@id': BUSINESS_ID },
    },
    ...(v.reviewCount > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: v.rating, reviewCount: v.reviewCount } } : {}),
  };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

/**
 * FAQPage structured data, or nothing at all.
 *
 * An FAQPage whose `mainEntity` is `[]` is invalid — Search Console reports it
 * as a missing-field error — and that is exactly what this emitted once the
 * unfinished answers stopped being published: the markup stayed, the questions
 * did not. `JsonLd` filters falsy values, so returning null here removes the
 * script entirely on all four pages that call this.
 */
export function faqJsonLd(faqs, locale, answer = answerFor) {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: t(f.question, locale),
      /* `answer` must be the function the page DISPLAYS with, so the text
         indexed is exactly the text a reader sees (rule 8). The default,
         answerFor, is what FaqAccordion renders; the vehicle page lists short
         answers and passes shortAnswerFor. The t(f.answer) this replaced fell
         back to French and indexed French answers on the en/ar/es pages. */
      acceptedAnswer: { '@type': 'Answer', text: answer(f, locale) },
    })),
  };
}

export function serviceJsonLd({ name, description, url, locale, serviceType, priceFrom, areaServed }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name,
    description,
    url,
    inLanguage: locale,
    serviceType,
    provider: { '@id': BUSINESS_ID },
    areaServed: areaServed || [{ '@type': 'City', name: 'Casablanca' }],
    ...(priceFrom ? { offers: { '@type': 'Offer', priceCurrency: 'MAD', price: priceFrom, priceSpecification: { '@type': 'UnitPriceSpecification', price: priceFrom, priceCurrency: 'MAD', unitCode: 'DAY' } } } : {}),
  };
}

export function articleJsonLd(post, locale, url, settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: t(post.title, locale),
    description: t(post.excerpt, locale),
    inLanguage: locale,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    mainEntityOfPage: url,
    image: [`${SITE_URL}/images/cars/${post.cover || 'berline'}.svg`],
    author: { '@type': 'Organization', '@id': BUSINESS_ID, name: settings?.name || SITE_NAME },
    publisher: { '@id': BUSINESS_ID },
  };
}

export function webPageJsonLd({ url, name, description, locale }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: locale,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': BUSINESS_ID },
  };
}
