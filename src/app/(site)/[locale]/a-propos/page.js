import { getTranslations } from 'next-intl/server';
import PageHero from '@/components/site/PageHero';
import JsonLd from '@/components/site/JsonLd';
import Reveal, { Stagger, StaggerItem } from '@/components/ui/Reveal';
import { CtaBand } from '@/components/site/HomeSections';
import { CheckIcon } from '@/components/site/icons';
import { getSettings } from '@/lib/data';
import { formatMAD } from '@/lib/format';
import { absoluteUrl, localizedMetadata, webPageJsonLd } from '@/lib/seo';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.about' });
  /* The founding year is a CLAIM (rule 11). This title used to say "depuis 2013"
     as fixed text in all four message files, putting an unverified year in the
     <title> Google shows as the result headline, in the og/twitter titles, and
     in the generated share image a WhatsApp or Facebook preview renders.
     getSettings() reads public_settings, which returns founded_year only once
     it is verified — so the year appears exactly then, and not before. */
  const s = await getSettings();
  const title = s.foundedYear ? t('titleWithYear', { year: s.foundedYear }) : t('title');
  return localizedMetadata({ locale, href: '/a-propos', title, description: t('description') });
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const tn = await getTranslations({ locale, namespace: 'nav' });
  const tseo = await getTranslations({ locale, namespace: 'seo.about' });
  const s = await getSettings();
  const url = absoluteUrl(locale, '/a-propos');

  /* No `|| 2013`. The founding year is a CLAIM: public_settings returns it only
     once verified_claims.foundedYear is true, and the demo adapter does the same.
     A fallback here put the year straight back on the About page in all four
     languages while the database said it was unverified (rule 11). No verified
     year means the intro simply does not state one. */
  return (
    <>
      <PageHero crumbs={[{ name: tn('home'), href: '/', url: absoluteUrl(locale, '/') }, { name: tn('about'), url }]} eyebrow={t('eyebrow')} title={t('title')} answer={s.foundedYear ? t('intro', { year: s.foundedYear }) : t('introNoYear')} image="coupe" />

      <section className="section-y bg-surface-1/60">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <h2 className="text-display-2 text-text">{t('story.title')}</h2>
          </Reveal>
          <Reveal className="space-y-5 text-lg leading-relaxed text-text-2 lg:col-span-7">
            <p>{t('story.p1')}</p>
            <p>{t('story.p2')}</p>
            <p>{t('story.p3')}</p>
          </Reveal>
        </div>
      </section>

      <section className="section-y">
        <div className="container-x">
          <Reveal>
            <h2 className="text-display-2 text-text">{t('values.title')}</h2>
          </Reveal>
          <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['1', '2', '3', '4'].map((k) => (
              <StaggerItem key={k} className="card p-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <CheckIcon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-sans text-lg font-semibold text-text">{t(`values.items.${k}.title`)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-2">{t(`values.items.${k}.text`)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section-y bg-surface-1/60">
        <div className="container-x">
          <Reveal className="card p-6 md:p-8">
            <h2 className="font-display text-2xl text-text">{t('legalTitle')}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-text-2">{t('legalText', { legalName: s.legalName, capital: formatMAD(s.capitalMad, locale), rc: s.rc, ice: s.ice })}</p>
          </Reveal>
        </div>
      </section>

      <CtaBand settings={s} />
      {/* Same rule as generateMetadata: the WebPage name a crawler reads carries the
          founding year only once public_settings says it is verified, so the
          <title> and this name can never disagree about it. */}
      <JsonLd data={webPageJsonLd({ url, name: s.foundedYear ? tseo('titleWithYear', { year: s.foundedYear }) : tseo('title'), description: tseo('description'), locale })} />
    </>
  );
}
