import { getLocale, getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';
import FaqAccordion from '@/components/site/FaqAccordion';
import JsonLd from '@/components/site/JsonLd';
import { t as pick } from '@/lib/constants';
import { answerFor } from '@/lib/faq';

/**
 * Five questions on the homepage (plan 4.3 §9), reusing the existing
 * FaqAccordion — it is `<details name>` based, so it is exclusive-open,
 * keyboard-operable and fully in the HTML for crawlers with no JavaScript at
 * all. Section 10 keeps it for exactly that reason.
 *
 * The FAQPage JSON-LD carries the same five answers that are visible on the
 * page, never more (CLAUDE.md rule 8: visible text = structured data).
 *
 * @param {{ faqs: object[] }} props
 */
export default async function FaqSection({ faqs = [] }) {
  const t = await getTranslations('home.faq');
  const locale = await getLocale();

  const items = faqs
    .filter((f) => f.published !== false)
    .sort((a, b) => (a.sortOrder ?? a.sort ?? 0) - (b.sortOrder ?? b.sort ?? 0))
    .slice(0, 5);

  if (items.length === 0) return null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: pick(f.question, locale),
      /* answerFor(), the function FaqAccordion renders with. pick(f.answer) fell
         back to French and indexed the French long answer on every homepage. */
      acceptedAnswer: { '@type': 'Answer', text: answerFor(f, locale) },
    })),
  };

  return (
    <section id="faq" className="section-y">
      <div className="container-x">
        <p className="eyebrow">{t('eyebrow')}</p>
        <h2 className="text-h2 mt-3 text-text">{t('title')}</h2>

        <FaqAccordion faqs={items} locale={locale} name="home-faq" className="mt-8" />

        <div className="mt-8">
          <Button href="/faq" variant="secondary" size="md">
            {t('cta')}
          </Button>
        </div>
      </div>
      <JsonLd data={schema} />
    </section>
  );
}
