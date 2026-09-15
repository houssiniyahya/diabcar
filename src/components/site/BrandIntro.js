import BrandLockup from '@/components/site/BrandLockup';
import { INTRO_SCRIPT } from '@/lib/motion/brandVeil';

/**
 * The first-visit brand intro (owner request 2026-09-15; plan §1 and §5.3):
 * a dark veil, DIAB CAR, the red line, RENT A CAR, then the veil sweeps away
 * across the page in the reading direction. About one second, once per tab.
 *
 * How it stays out of the way:
 *   - CSS only. The blocking script decides; globals.css animates. There is no
 *     client component, no hydration dependency and no timer that could stick.
 *   - The veil sits OVER a page that is already rendered and painting. The
 *     hero car is at full opacity underneath from frame 0, so it stays the LCP
 *     element (rule 6), and the intro never waits for anything.
 *   - pointer-events: none throughout. A click during the intro reaches the
 *     page, and no test or visitor is ever blocked.
 *   - Reduced motion, no JavaScript, or storage that throws: no attribute, so
 *     the veil is never shown.
 *   - The ignition (WOW 1) is timed to start as the veil lifts, instead of
 *     playing unseen underneath it.
 *
 * Render it FIRST inside <body>: the script has to run before the parser
 * reaches the markup and before anything paints.
 */
export default function BrandIntro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      <div className="brand-veil brand-veil--intro dark" aria-hidden="true" data-testid="brand-intro">
        <span className="brand-veil__stage">
          <BrandLockup tagline />
        </span>
      </div>
    </>
  );
}
