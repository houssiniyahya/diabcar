import { t as pick } from '@/lib/constants';
import { cn } from '@/lib/cn';

/**
 * Accessible accordion built on <details name="…"> (exclusive open, no JS).
 * Answers are in the HTML for crawlers and AI engines.
 *
 * KEEP IT FREE OF JAVASCRIPT. That is not a style choice: OpenAI's crawler
 * does not execute JavaScript, and an answer that only exists after a script
 * runs is invisible to it and to every other non-rendering AI crawler. The
 * FAQ exists to be quoted by answer engines (plan 8.6). An "animated
 * accordion" that mounts its panels from JS would quietly remove every answer
 * from that audience. Animate the existing <details> with CSS if you must.
 */
export default function FaqAccordion({ faqs = [], locale, name = 'faq', className, defaultOpen = 0 }) {
  return (
    <div className={cn('divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface-1', className)}>
      {faqs.map((f, i) => (
        <details key={f.id || i} name={name} open={i === defaultOpen ? true : undefined} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-start text-[15px] font-semibold text-text transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
            <span itemProp="name">{pick(f.question, locale)}</span>
            <span className="relative h-6 w-6 shrink-0 rounded-full border border-border text-text-muted transition-transform duration-300 group-open:rotate-45 group-open:border-accent group-open:text-accent" aria-hidden="true">
              <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-current" />
              <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-current" />
            </span>
          </summary>
          <div className="px-5 pb-5 text-[15px] leading-relaxed text-text-2">
            <p>{pick(f.answer, locale)}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
