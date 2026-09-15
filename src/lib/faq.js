/**
 * Keeping unwritten answers off the public site (CLAUDE.md rule 11:
 * "Only verifiable facts render on the site. Unverified = hidden, not
 * invented").
 *
 * `docs/inputs/faq.csv` ships as a TEMPLATE — every answer in it reads
 * "TODO — réponse complète" until Diab Car writes the real one. On 2026-09-10
 * exactly one of those rows was published in the live database, and the
 * placeholder was rendering on seven public pages: the FAQ page in all four
 * languages, and the FAQ block on each homepage. Worse, it was inside the
 * FAQPage structured data as
 *
 *     "acceptedAnswer": { "@type": "Answer", "text": "TODO — réponse complète" }
 *
 * which is the text Google would have indexed and shown as the agency's own
 * answer.
 *
 * The guard lives at the data layer rather than in the FAQ page, because the
 * rows are read by four callers — the FAQ page, both homepages' FAQ blocks, the
 * airport page and the vehicle page — and a filter in one of them protects only
 * that one. The admin deliberately still sees these rows: hiding them from the
 * owner would remove the only place they can be found and finished.
 */

/**
 * Openers that mean "nobody has written this yet". Anchored at the start, so a
 * real answer that happens to contain the word — "…todo incluido" in Spanish,
 * which is simply "all-inclusive" — is never mistaken for one. That false
 * positive is not hypothetical: a naive /todo/i match flagged the Spanish
 * homepage and fleet page, both of which are correct copy.
 */
const PLACEHOLDER = /^\s*(?:todo\b|tbd\b|fixme\b|xxx+|lorem ipsum|à compléter|a completer|por completar|pendiente de completar|قيد الإنجاز)/i;

/** True when a single localized string is missing or is still a placeholder. */
export function isPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  if (!text) return true;
  return PLACEHOLDER.test(text);
}

/**
 * Every string inside a `{ fr, en, ar, es }` bag, or a plain string.
 * A row is judged on ALL of its languages, not just the reference one: an
 * English page falls back to the French value when its own is empty, so a
 * placeholder in any language can reach a reader.
 */
function values(field) {
  if (field === null || field === undefined) return [];
  if (typeof field === 'string') return [field];
  if (typeof field === 'object') return Object.values(field).filter((v) => typeof v === 'string');
  return [];
}

/**
 * Is this FAQ row finished enough to show a customer?
 *
 * It needs a question and a short answer, and no part of it — including the
 * long answer, which is what the structured data carries — may still be a
 * placeholder. An entry that fails is dropped whole rather than shown with a
 * blank answer: a question the site refuses to answer reads worse than a
 * question it never asked.
 *
 * A row with no short answer at all may answer through the legacy single
 * `answer` bag instead. That is the whole shape of the demo seed's FAQs
 * (src/lib/data/seed.js), and requiring a short answer outright removed every
 * one of them: demo mode rendered no FAQ anywhere (CLAUDE.md rule 12).
 */
export function isAnswered(faq) {
  if (!faq) return false;

  const question = values(faq.question);
  const short = values(faq.shortAnswer ?? faq.short_answer);
  const long = values(faq.longAnswer ?? faq.long_answer);
  const legacy = values(faq.answer);
  const answer = short.length ? short : legacy;

  if (question.length === 0 || question.every(isPlaceholder)) return false;
  if (answer.length === 0 || answer.every(isPlaceholder)) return false;

  /* Any single placeholder anywhere disqualifies it: the locale that holds it
     is the locale that would render it. The legacy bag is scanned too, since
     answerFor() can fall back to it. */
  return ![...question, ...short, ...long, ...legacy].some(isPlaceholder);
}

/** The rows that are safe to publish. */
export function publishable(faqs = []) {
  return faqs.filter(isAnswered);
}

/**
 * The answer a reader sees for this question in `locale` — and, because
 * src/lib/seo.js calls this same function, exactly the text the FAQPage
 * structured data carries (rule 8: visible text = structured data).
 *
 * The richest text that genuinely exists in that language:
 *   1. the long answer, in this locale;
 *   2. the short answer, in this locale;
 *   3. the legacy single `answer` bag, with the usual French fallback — the demo
 *      seed's FAQs, which predate short/long answers;
 *   4. as a last resort, the short or long answer in ANY language. A FAQ typed
 *      in the admin in French only still gets a French answer on the English
 *      page, rather than an empty panel and an empty (invalid) Answer in the
 *      structured data.
 *
 * Steps 1 and 2 read the locale EXACTLY, with no fallback, and that is the
 * point. The long answers exist in French only, and the site's general picker
 * falls back to French for a missing language — so the accordion rendered
 * French paragraphs on the English, Arabic and Spanish pages and put the same
 * French text into their structured data. Reading the locale exactly lets an
 * English page fall through to its genuinely English short answer instead.
 * For that to work the seed must not paper over a missing translation either:
 * scripts/seed.mjs builds the answer bags without a French stand-in.
 */
export function answerFor(faq, locale) {
  if (!faq) return '';
  const exact = (bag) => (bag && typeof bag === 'object' && typeof bag[locale] === 'string' ? bag[locale].trim() : '');

  const long = exact(faq.longAnswer ?? faq.long_answer);
  if (long) return long;

  const short = exact(faq.shortAnswer ?? faq.short_answer);
  if (short) return short;

  const legacy = faq.answer;
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  const fromLegacy = exact(legacy) || anyLanguage(legacy);
  if (fromLegacy) return fromLegacy;

  return anyLanguage(faq.shortAnswer ?? faq.short_answer) || anyLanguage(faq.longAnswer ?? faq.long_answer);
}

/** French first, then English, then whichever language the bag holds. */
function anyLanguage(bag) {
  if (!bag || typeof bag !== 'object') return '';
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  return text(bag.fr) || text(bag.en) || Object.values(bag).map(text).find(Boolean) || '';
}

/**
 * The SHORT answer for `locale`, for a page that lists questions compactly
 * (the vehicle page). Same locale-exact rule as answerFor; a locale with no
 * short answer falls through to answerFor. A page that displays this must also
 * pass it to faqJsonLd, so its structured data carries the same short text.
 */
export function shortAnswerFor(faq, locale) {
  if (!faq) return '';
  const bag = faq.shortAnswer ?? faq.short_answer;
  const short = bag && typeof bag === 'object' && typeof bag[locale] === 'string' ? bag[locale].trim() : '';
  return short || answerFor(faq, locale);
}
