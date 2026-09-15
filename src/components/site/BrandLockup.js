import { BRAND_TAGLINE, BRAND_WORDMARK } from '@/lib/motion/brandVeil';

/**
 * The brand veil's mark: the wordmark, the red line and, for the intro, the
 * tagline. Shared by BrandIntro (server) and RouteVeil (client); it has no
 * hooks, so both can render it.
 *
 * Latin in every locale, like the header wordmark (Logo.js), so it is marked
 * lang="en" dir="ltr" and never picks up the Arabic faces, RTL letter order or
 * the Arabic letter-spacing reset.
 *
 * The words are drawn from data-text by a ::before rule in globals.css rather
 * than text nodes. The mark only repeats the header's brand name, and generated
 * content keeps "DIAB CAR RENT A CAR" out of the page text that crawlers, AI
 * answer engines and screen readers take in.
 *
 * @param {{ tagline?: boolean }} props
 */
export default function BrandLockup({ tagline = false }) {
  return (
    <span className="brand-veil__lockup" lang="en" dir="ltr" translate="no">
      <span className="brand-veil__word" data-text={BRAND_WORDMARK} />
      <span className="brand-veil__rule" />
      {tagline ? <span className="brand-veil__tag" data-text={BRAND_TAGLINE} /> : null}
    </span>
  );
}
