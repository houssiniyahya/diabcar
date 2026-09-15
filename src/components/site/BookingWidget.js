'use client';

/* ------------------------------------------------------------------ */
/* THE booking module (plan 4.2) — three zones, dashboard look.        */
/*                                                                     */
/*   1. LIEU     searchable combobox, grouped airport / agency /       */
/*               livraison (fee inline) / free-text address.           */
/*   2. DÉPART   one range calendar (lazy chunk) + time chips.         */
/*      RETOUR                                                         */
/*   3. ☐ Retour dans un autre lieu → a second combobox.               */
/*                                                                     */
/* Everything the visitor can read comes from next-intl. Every colour  */
/* comes from a token utility. Every tap target in here is ≥ 48 px.    */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import Button from '@/components/ui/Button';
import { localeTags } from '@/i18n/routing';
import { addDays, formatMAD, todayISO, toISO } from '@/lib/format';
import { cn } from '@/lib/cn';
import { navigateBehindVeil } from '@/lib/motion/brandVeil';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** The free-text "Autre adresse à Casablanca" pseudo-location. Not a DB row. */
export const OTHER_LOCATION_KEY = 'autre-adresse';

/** localStorage keys are namespaced so nothing else on the origin collides. */
const RECENT_KEY = 'dc.booking.recentLocation';
const ADDRESS_KEY = 'dc.booking.pickupAddress';

/**
 * Every half hour of the day. The two components that used to import it
 * (BookingForm, VehicleQuote) went with the old booking flow; it is kept
 * exported because the widget itself is built from it and the new flow
 * will want the same half-hour grid.
 */
export const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** 08:00 → 22:00, the default counter hours (plan 4.2). */
const DAY_TIMES = TIMES.slice(16, 45);

const DEFAULT_TIME = '10:00';
const MIN_HOURS = 24;

/* ------------------------------------------------------------------ */
/* The calendar is a separate chunk, fetched when the field is opened.  */
/* This call stays at module scope (never inside render) so the lazy    */
/* component identity is stable and the chunk is requested once.        */
/* ------------------------------------------------------------------ */
const RangeCalendarPanel = dynamic(() => import('./RangeCalendarPanel'), {
  ssr: false,
  loading: () => <CalendarSkeleton />,
});

/** Loader = the red line, never the word "Loading" (plan 4.13). */
function CalendarSkeleton() {
  return (
    <div className="h-64 w-full pt-2" aria-hidden="true">
      <span className="relative block h-0.5 w-full overflow-hidden bg-surface-2">
        <span className="btn-sweep absolute inset-y-0 start-0 w-1/3 bg-red-signal" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Accent- and case-insensitive fold, so "Ain" finds "Aïn" (plan 4.2). */
function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** localStorage throws in private mode and in some in-app browsers. */
function readStore(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* a missing preference is not an error */
  }
}

/**
 * Split whatever the URL or a caller handed us into a Casablanca-local
 * `yyyy-mm-dd` + `HH:mm`. Deterministic (fixed time zone, fixed locale), so it
 * returns the same thing on the server and in the browser.
 * @param {string} [value] `yyyy-mm-dd` or a full ISO datetime
 * @returns {{date: string, time: string|null}|null}
 */
function splitDateTime(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  if (value.length === 10) return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { date: value, time: null } : null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  const minutes = Number(get('minute'));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${minutes >= 30 ? '30' : '00'}`,
  };
}

/** Whole days between two `yyyy-mm-dd` values, DST-proof (both read as UTC). */
function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * `06` + `SEP` for the closed field. Arabic keeps the full localized
 * abbreviation (never truncated); `.text-meta` handles the casing, and it
 * already neutralises uppercase under `[dir="rtl"]`.
 */
function dayMonth(date, locale) {
  if (!date) return null;
  const stamp = Date.parse(`${date}T12:00:00+01:00`);
  if (Number.isNaN(stamp)) return null;
  const parts = new Intl.DateTimeFormat(`${localeTags[locale] || 'fr-MA'}-u-nu-latn`, {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Casablanca',
  }).formatToParts(new Date(stamp));
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  const month = get('month');
  return { day: get('day'), month: locale === 'ar' ? month : month.replace(/\./g, '').slice(0, 3) };
}

/** `+ 150 MAD`, nothing, or "sur devis" — never `+ 0 MAD`, never an invented number. */
function feeLabel(fee, locale, onRequestLabel) {
  if (fee === null) return onRequestLabel;
  if (typeof fee === 'number' && fee > 0) return `+ ${formatMAD(fee, locale)}`;
  return '';
}

/** `is24h === null` means "not confirmed" and counts as NOT 24/7 (CLAUDE.md rule 11). */
function isRoundTheClock(location) {
  return location ? location.is24h === true : false;
}

function outsideHours(location, time) {
  if (!location || isRoundTheClock(location)) return false;
  const hours = location.hours;
  if (!hours || !hours.opens || !hours.closes) return false;
  return time < hours.opens || time > hours.closes;
}

/* ------------------------------------------------------------------ */
/* Zone 1 — the searchable location combobox                           */
/* ------------------------------------------------------------------ */

/**
 * A real combobox (role="combobox" + role="listbox"), never a native
 * `<select>`: the plan asks for grouping, an inline delivery fee, typeahead
 * and a free-text escape hatch.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.label visible label
 * @param {string} props.value selected location key
 * @param {(key: string) => void} props.onChange
 * @param {Array<object>} props.locations
 * @param {string|null} [props.recentKey] key hoisted to the top; read from localStorage after mount
 * @param {string} [props.describedBy]
 * @param {boolean} [props.invalid]
 * @param {string} props.testId
 */
function LocationSelect({ id, label, value, onChange, locations, recentKey, describedBy, invalid, testId }) {
  const t = useTranslations('widget');
  const tl = useTranslations('locations');
  const locale = useLocale();

  const nameOf = useCallback((location) => (location.name && (location.name[locale] || location.name.fr)) || location.key, [locale]);

  const selected = useMemo(() => {
    if (value === OTHER_LOCATION_KEY) return tl('otherAddress');
    const found = locations.find((l) => l.key === value);
    return found ? nameOf(found) : '';
  }, [locations, nameOf, tl, value]);

  const [open, setOpen] = useState(false);
  // What is actually in the box. Seeded from the selection so the server HTML
  // already carries the right label (no post-hydration flash).
  const [text, setText] = useState(selected);
  const [active, setActive] = useState(0);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = `${id}-listbox`;

  // Follow the selection when it is changed from outside (e.g. the pickup
  // choice mirrored into the drop-off field). Adjusted DURING render, which is
  // React's documented way to derive state from a prop - an effect here would
  // paint the stale label first and cost a cascading render.
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setText(selected);
  }

  /**
   * Opening by click must show the whole list, so only filter once the text
   * actually diverges from the selected label.
   */
  const needle = open && text !== selected ? fold(text) : '';

  const groups = useMemo(() => {
    const usable = locations.filter((l) => l.active !== false);
    const byKind = (kind) => usable.filter((l) => l.kind === kind);
    const toOption = (l) => ({
      key: l.key,
      label: nameOf(l),
      fee: feeLabel(l.deliveryFee, locale, tl('feeOnRequest')),
      hint: l.kind === 'district' ? tl('deliveryHint') : '',
    });

    const raw = [
      { id: 'airport', label: tl('groups.airport'), options: byKind('airport').map(toOption) },
      { id: 'agency', label: tl('groups.agency'), options: byKind('agency').map(toOption) },
      { id: 'delivery', label: tl('groups.delivery'), options: byKind('district').map(toOption) },
      { id: 'other', label: tl('groups.other'), options: [{ key: OTHER_LOCATION_KEY, label: tl('otherAddress'), fee: '', hint: '' }] },
    ];

    // Recent choice first. The option MOVES rather than being duplicated, so
    // no location is announced twice by a screen reader.
    let recent = null;
    const hoisted = raw.map((group) => {
      if (!recentKey || group.id === 'other') return group;
      const found = group.options.find((o) => o.key === recentKey);
      if (!found) return group;
      recent = found;
      return { ...group, options: group.options.filter((o) => o.key !== recentKey) };
    });
    const ordered = recent ? [{ id: 'recent', label: tl('groups.recent'), options: [recent] }, ...hoisted] : hoisted;

    return ordered
      // The free-text escape hatch stays reachable whatever is typed.
      .map((group) => (group.id === 'other' || !needle ? group : { ...group, options: group.options.filter((o) => fold(o.label).includes(needle)) }))
      .filter((group) => group.options.length > 0);
  }, [locale, locations, nameOf, needle, recentKey, tl]);

  const flat = useMemo(() => groups.flatMap((g) => g.options.map((o) => ({ ...o, groupId: g.id }))), [groups]);
  const optionId = (groupId, key) => `${listboxId}-${groupId}-${key}`;
  const activeOption = flat[active];

  /* What the typed text actually names: a label typed out in full, or the only
     row still standing after filtering. Anything vaguer is not a choice and is
     deliberately NOT guessed at. */
  const resolveTyped = useCallback(() => {
    const needleNow = fold(text);
    if (!needleNow) return null;
    const exact = flat.find((o) => fold(o.label) === needleNow);
    if (exact) return exact;
    return flat.length === 1 ? flat[0] : null;
  }, [text, flat]);

  /* Closing WITHOUT having clicked a row used to throw the typed text away and
     put the old label back. That is the worst path in this module: a visitor
     types « Anfa », sees Anfa in the list, and goes straight for the red CTA.
     The pointerdown that begins that click lands outside the combobox, fires
     this first — on the capture phase, before the button ever sees it — and
     reverted the field while leaving `pickup` on the airport. The search then
     ran on a place they had not chosen, with a delivery fee they had not
     chosen, and the only tell was a field flickering back as the page left.
     Tab did the same thing.
     So a close now COMMITS what the text unambiguously names. When it names
     nothing definite the old label comes back, as before — but that is a
     genuinely ambiguous entry, not a discarded choice. */
  const dismiss = useCallback(
    (restoreFocus) => {
      setOpen(false);
      const hit = resolveTyped();
      if (hit) {
        if (hit.key !== value) {
          onChange(hit.key);
          if (hit.key !== OTHER_LOCATION_KEY) writeStore(RECENT_KEY, hit.key);
        }
        setText(hit.label);
      } else {
        setText(selected);
      }
      if (restoreFocus && inputRef.current) inputRef.current.focus();
    },
    [selected, resolveTyped, onChange, value],
  );

  // Same pattern: the highlight resets when the filter or the open state
  // changes, derived during render rather than in an effect.
  const listKey = `${needle}|${open}`;
  const [lastListKey, setLastListKey] = useState(listKey);
  if (listKey !== lastListKey) {
    setLastListKey(listKey);
    setActive(0);
  }

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) dismiss(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [dismiss, open]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector('[data-highlighted="true"]');
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(option) {
    if (!option) return;
    onChange(option.key);
    if (option.key !== OTHER_LOCATION_KEY) writeStore(RECENT_KEY, option.key);
    setText(option.label);
    setOpen(false);
    if (inputRef.current) inputRef.current.focus();
  }

  function onKeyDown(event) {
    const last = flat.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) return setOpen(true);
        return setActive((i) => (i >= last ? 0 : i + 1));
      case 'ArrowUp':
        event.preventDefault();
        if (!open) return setOpen(true);
        return setActive((i) => (i <= 0 ? last : i - 1));
      case 'Home':
        if (!open) return undefined;
        event.preventDefault();
        return setActive(0);
      case 'End':
        if (!open) return undefined;
        event.preventDefault();
        return setActive(last);
      case 'Enter':
        if (!open) return undefined;
        // Never let the module submit while a listbox is open.
        event.preventDefault();
        return pick(activeOption);
      case 'Escape':
        if (!open) return undefined;
        event.preventDefault();
        event.stopPropagation();
        return dismiss(true);
      case 'Tab':
        if (open) dismiss(false);
        return undefined;
      default:
        return undefined;
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <label htmlFor={id} className="eyebrow mb-2 block">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && activeOption ? optionId(activeOption.groupId, activeOption.key) : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          data-testid={testId}
          value={text}
          placeholder={t('locationPlaceholder')}
          // Selecting the text on focus means the first keystroke replaces the
          // label instead of appending to it.
          onFocus={(event) => event.target.select()}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'min-h-12 w-full rounded-[var(--radius-input)] border bg-surface-1 px-4 pe-10 text-[15px] text-text placeholder:text-text-muted',
            /* The house pattern from ui/Field.js. `focus:outline-none` alone
               removed the base-layer red ring and put nothing back. */
            'transition-colors duration-[var(--dur-micro)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
            invalid ? 'border-red-signal' : 'border-border hover:border-border-strong',
          )}
        />
        <svg
          viewBox="0 0 24 24"
          className={cn(
            'pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted transition-transform duration-[var(--dur-micro)]',
            open && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open ? (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute start-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(22rem,60vh)] w-full overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface-1 p-1.5 shadow-[var(--shadow-float)]"
        >
          {flat.length === 0 ? (
            /* role=status: with nothing to highlight, Enter has nothing to
               pick and is a no-op, so the only thing that can tell a keyboard
               or screen-reader user why is this line — and it was silent. */
            <p role="status" className="px-3 py-4 text-sm text-text-muted">
              {t('noLocation')}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} role="group" aria-label={group.label}>
                <p className="eyebrow px-3 pb-1 pt-3" aria-hidden="true">
                  {group.label}
                </p>
                {group.options.map((option) => {
                  const index = flat.findIndex((o) => o.groupId === group.id && o.key === option.key);
                  const highlighted = index === active;
                  const isSelected = option.key === value;
                  return (
                    <div
                      key={option.key}
                      id={optionId(group.id, option.key)}
                      role="option"
                      aria-selected={isSelected}
                      data-highlighted={highlighted ? 'true' : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick({ ...option, groupId: group.id })}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-button)] px-3 py-2',
                        highlighted ? 'bg-surface-2' : 'bg-transparent',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-text">{option.label}</span>
                        {option.hint ? <span className="block truncate text-[12px] text-text-muted">{option.hint}</span> : null}
                      </span>
                      {option.fee ? <span className="text-meta tnum shrink-0 text-text-2">{option.fee}</span> : null}
                      {isSelected ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-signal" aria-hidden="true" /> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Zone 2 — time chips                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value `HH:mm`
 * @param {(time: string) => void} props.onChange
 * @param {string[]} props.times
 * @param {string} props.testId
 * @param {string} [props.describedBy]
 */
function TimeChips({ label, value, onChange, times, testId, describedBy }) {
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} data-testid={testId}>
      {/* `.eyebrow` owns its colour; the red lives in the error line below,
          so nothing here depends on which utility wins the cascade. */}
      <p className="eyebrow mb-2">{label}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {times.map((time) => {
          const selected = time === value;
          return (
            <button
              key={time}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(time)}
              className={cn(
                'tnum min-h-12 shrink-0 rounded-[var(--radius-chip)] px-4 text-[14px] transition-colors duration-[var(--dur-micro)]',
                selected ? 'bg-red font-semibold text-on-red' : 'bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text',
              )}
            >
              {time}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The `06 SEP ━━━ 12 SEP · 6 JOURS` stamp                             */
/* ------------------------------------------------------------------ */

function DayStamp({ date, locale }) {
  const stamp = dayMonth(date, locale);
  if (!stamp) return null;
  return (
    <span className="text-meta inline-flex items-baseline gap-1 text-text">
      <span className="tnum text-[1.3em]">{stamp.day}</span>
      <span>{stamp.month}</span>
    </span>
  );
}

/** The red line, used here as the "départ → retour" rule (plan 2.4, one motif). */
function RangeRule() {
  return (
    <span className="inline-block w-10 shrink-0 align-middle" aria-hidden="true">
      <span className="redline" data-active="" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The module                                                          */
/* ------------------------------------------------------------------ */

/**
 * The booking module (plan 4.2) — homepage hero and, in `compact` form, the
 * fleet page.
 *
 * @param {object} props
 * @param {Array<object>} [props.locations] rows from `listLocations()`
 * @param {boolean} [props.compact] denser padding, used on the fleet page
 * @param {string} [props.className]
 * @param {{pickup?: string, dropoff?: string, from?: string, to?: string, ft?: string, tt?: string}} [props.initial]
 * @param {string} [props.today] server-computed `yyyy-mm-dd`; pass it to close the
 *   last hydration gap (see the note on `baseToday`)
 */
/**
 * @param {object} props
 * @param {(query: {pickup:string,dropoff:string,from:string,to:string}) => void} [props.onSearch]
 *   When given, the module reports the search instead of navigating. The
 *   results page passes this so "✎ Modifier" refreshes the list in place and
 *   only rewrites the URL (plan 4.4) — a full navigation there would throw away
 *   the fetched availability and the user's scroll position.
 */
export default function BookingWidget({ locations = [], compact = false, className, initial = {}, today: todayProp, onSearch }) {
  const t = useTranslations('widget');
  const tl = useTranslations('locations');
  const locale = useLocale();
  const router = useRouter();
  const uid = useId();
  const [isPending, startTransition] = useTransition();

  /**
   * `todayISO()` reads the UTC calendar day, so the server and the browser
   * agree everywhere except in the single render tick that straddles UTC
   * midnight. It is read once, in a lazy initialiser — never during render —
   * so nothing here re-reads the clock while React is rendering. Pass `today`
   * from a server component to close the gap completely.
   */
  const [baseToday] = useState(() => todayProp || todayISO());

  const [defaults] = useState(() => {
    const from = splitDateTime(initial.from);
    const to = splitDateTime(initial.to);
    return {
      from: (from && from.date) || addDays(baseToday, 1),
      ft: initial.ft || (from && from.time) || DEFAULT_TIME,
      // Plan 4.2 default: pickup tomorrow, return four days later -> a 4-day
      // rental, so +5 from today, not +4.
      to: (to && to.date) || addDays(baseToday, 5),
      tt: initial.tt || (to && to.time) || DEFAULT_TIME,
    };
  });

  const defaultPickup = useMemo(() => {
    if (initial.pickup === OTHER_LOCATION_KEY) return OTHER_LOCATION_KEY;
    const known = locations.find((l) => l.key === initial.pickup);
    if (known) return known.key;
    const airport = locations.find((l) => l.kind === 'airport' && l.active !== false);
    return (airport && airport.key) || (locations[0] && locations[0].key) || '';
  }, [initial.pickup, locations]);

  const [pickup, setPickup] = useState(defaultPickup);
  const [dropoff, setDropoff] = useState(() => (locations.some((l) => l.key === initial.dropoff) ? initial.dropoff : defaultPickup));
  const [different, setDifferent] = useState(Boolean(initial.dropoff && initial.dropoff !== initial.pickup));
  const [address, setAddress] = useState('');
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [ft, setFt] = useState(defaults.ft);
  const [tt, setTt] = useState(defaults.tt);
  const [datesOpen, setDatesOpen] = useState(false);
  const [recentKey, setRecentKey] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const datesRef = useRef(null);
  const datesTriggerRef = useRef(null);
  const datesPanelId = `${uid}-dates-panel`;

  /**
   * Hydration-safe recent choice: localStorage is read AFTER mount, never
   * during render, so the server HTML and the first client render match.
   */
  useEffect(() => {
    const stored = readStore(RECENT_KEY);
    if (stored) setRecentKey(stored);
  }, []);

  const pickupLocation = useMemo(() => locations.find((l) => l.key === pickup) || null, [locations, pickup]);
  const dropoffLocation = useMemo(
    () => (different ? locations.find((l) => l.key === dropoff) || null : pickupLocation),
    [different, dropoff, locations, pickupLocation],
  );

  /* `+ 150 MAD`, `sur devis`, or '' when the place is free — never `+ 0 MAD`
     and never a number nobody configured (rule 11). */
  const pickupFee = useMemo(
    () => (pickupLocation ? feeLabel(pickupLocation.deliveryFee, locale, tl('feeOnRequest')) : ''),
    [pickupLocation, locale, tl],
  );

  const pickupTimes = isRoundTheClock(pickupLocation) ? TIMES : DAY_TIMES;
  const returnTimes = isRoundTheClock(dropoffLocation) ? TIMES : DAY_TIMES;

  // Switching to a location that is not open around the clock can strand the
  // selected chip; snap back to a time that location actually offers.
  useEffect(() => {
    if (!pickupTimes.includes(ft)) setFt(DEFAULT_TIME);
  }, [ft, pickupTimes]);
  useEffect(() => {
    if (!returnTimes.includes(tt)) setTt(DEFAULT_TIME);
  }, [returnTimes, tt]);

  const days = daysBetween(from, to);

  /** Inline, Meta-styled, under the field. Never a modal (plan 4.2). */
  const errors = useMemo(() => {
    const found = {};
    if (!pickup) found.location = t('errors.locationRequired');
    else if (pickup === OTHER_LOCATION_KEY && !address.trim()) found.location = t('errors.addressRequired');

    if (from < baseToday || to < baseToday) found.dates = t('errors.past');
    else {
      const start = Date.parse(toISO(from, ft));
      const end = Date.parse(toISO(to, tt));
      if (!(end - start >= MIN_HOURS * 3600000)) found.dates = t('errors.minDuration', { hours: String(MIN_HOURS) });
    }

    if (outsideHours(pickupLocation, ft)) {
      found.pickupTime = t('errors.hours', { opens: pickupLocation.hours.opens, closes: pickupLocation.hours.closes });
    }
    if (outsideHours(dropoffLocation, tt)) {
      found.returnTime = t('errors.hours', { opens: dropoffLocation.hours.opens, closes: dropoffLocation.hours.closes });
    }
    return found;
  }, [address, baseToday, dropoffLocation, from, ft, pickup, pickupLocation, t, to, tt]);

  const errorId = (name) => `${uid}-err-${name}`;
  const showError = (name) => (submitted && errors[name] ? errors[name] : '');

  // Escape closes the date panel and hands focus back to its trigger; a
  // pointer press anywhere outside it (the mobile scrim included) closes too.
  useEffect(() => {
    if (!datesOpen) return undefined;
    const onPointerDown = (event) => {
      if (!datesRef.current) return;
      const inside = datesRef.current.contains(event.target) && !event.target.closest('[data-dates-scrim]');
      if (!inside) setDatesOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      /* Cancelled, exactly as LocationSelect cancels its own Escape. On the
         results and vehicle pages this module lives inside a native <dialog>;
         an un-cancelled Escape closed the calendar AND the sheet around it,
         throwing away everything the visitor was editing. */
      event.preventDefault();
      event.stopPropagation();
      setDatesOpen(false);
      if (datesTriggerRef.current) datesTriggerRef.current.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [datesOpen]);

  function onSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      // The two time errors live inside the panel — open it so they are read.
      if (errors.pickupTime || errors.returnTime) setDatesOpen(true);
      return;
    }
    // The typed address cannot travel in the URL — the plan fixes the query to
    // pickup/dropoff/from/to — so it rides in sessionStorage for the funnel
    // (plan 4.7: "state in URL + sessionStorage").
    if (pickup === OTHER_LOCATION_KEY && address.trim()) {
      try {
        window.sessionStorage.setItem(ADDRESS_KEY, address.trim());
      } catch {
        /* private mode — the funnel asks again */
      }
    }
    const query = {
      pickup,
      dropoff: different && dropoff ? dropoff : pickup,
      from: toISO(from, ft),
      to: toISO(to, tt),
    };
    if (onSearch) {
      onSearch(query);
      return;
    }
    /* Behind the brand veil when it can play (RouteVeil.js), straight away otherwise. */
    navigateBehindVeil(() => {
      startTransition(() => {
        router.push({ pathname: '/vehicules', query });
      });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t('title')}
      data-testid="booking-widget"
      className={cn('card relative', compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6 lg:p-7', className)}
    >
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        {/* ---------------- Zone 1 — LIEU ---------------- */}
        <div>
          <LocationSelect
            id={`${uid}-pickup`}
            testId="pickup-combobox"
            label={t('locationLabel')}
            value={pickup}
            onChange={(key) => {
              setPickup(key);
              if (!different) setDropoff(key);
            }}
            locations={locations}
            recentKey={recentKey}
            describedBy={errorId('location')}
            invalid={Boolean(showError('location'))}
          />

          {pickup === OTHER_LOCATION_KEY ? (
            <div className="mt-3">
              <label htmlFor={`${uid}-address`} className="eyebrow mb-2 block">
                {tl('otherAddressLabel')}
              </label>
              <input
                id={`${uid}-address`}
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={tl('otherAddressPlaceholder')}
                data-testid="pickup-address"
                aria-describedby={errorId('location')}
                aria-invalid={showError('location') ? true : undefined}
                className="min-h-12 w-full rounded-[var(--radius-input)] border border-border bg-surface-1 px-4 text-[15px] text-text placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
          ) : null}

          {/* The chosen place keeps its price on screen. `feeLabel` was only
              ever rendered inside the dropdown, so the moment a visitor picked
              the airport the figure vanished and they reached the results page
              without having been told a delivery fee applies at all — the
              opposite of rule 4, and plan 4.2 asks for it inline. A place that
              costs nothing says nothing; there is no « + 0 MAD ». */}
          {pickupFee ? (
            <p className="mt-2 text-[13px] text-text-2 first-letter:uppercase" data-testid="pickup-fee">
              <span className="text-text-muted">{tl('deliveryHint')} </span>
              <span className="tnum">{pickupFee}</span>
            </p>
          ) : null}

          <p id={errorId('location')} aria-live="polite" className="text-meta mt-2 text-red-signal empty:mt-0">
            {showError('location')}
          </p>

          {/* Zone 3 — a second location for the return */}
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[14px] text-text-2">
            <input
              type="checkbox"
              checked={different}
              aria-expanded={different}
              aria-controls={`${uid}-dropoff-zone`}
              data-testid="different-dropoff"
              onChange={(event) => {
                setDifferent(event.target.checked);
                if (!event.target.checked) setDropoff(pickup);
              }}
              className="h-5 w-5 shrink-0 accent-[var(--red)]"
            />
            {t('differentDropoff')}
          </label>

          <div id={`${uid}-dropoff-zone`} hidden={!different} className="mt-2">
            <LocationSelect
              id={`${uid}-dropoff`}
              testId="dropoff-combobox"
              label={t('dropoffLabel')}
              value={dropoff}
              onChange={setDropoff}
              locations={locations}
              recentKey={recentKey}
            />
          </div>
        </div>

        {/* ---------------- Zone 2 — DÉPART / RETOUR ---------------- */}
        <div className="relative" ref={datesRef}>
          <span className="eyebrow mb-2 block" id={`${uid}-dates-label`}>
            {t('datesLabel')}
          </span>
          <button
            ref={datesTriggerRef}
            type="button"
            aria-expanded={datesOpen}
            aria-controls={datesOpen ? datesPanelId : undefined}
            aria-labelledby={`${uid}-dates-label ${uid}-dates-value`}
            aria-describedby={errorId('dates')}
            data-testid="date-range-trigger"
            onClick={() => setDatesOpen((v) => !v)}
            className={cn(
              'relative flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-input)] border bg-surface-1 px-4 pe-10 py-2 text-start',
              'transition-colors duration-[var(--dur-micro)]',
              showError('dates') ? 'border-red-signal' : 'border-border hover:border-border-strong',
            )}
          >
            {/* The control used to be bare text. Beside a location select that
                carries a chevron, that reads as a caption, not as something you
                can press — so the dates looked fixed and the calendar behind
                them was undiscoverable. A calendar mark opens it and a chevron
                closes the pair; both are decorative, the button already names
                itself through aria-labelledby. */}
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-text-muted" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 11h18" />
            </svg>

            {/* Two lines, deliberately: the stamp, then everything that
                qualifies it. Letting the duration share the first line made it
                wrap to a third line on a 390px phone and pushed the icon down
                beside « 4 jours », where it read as decorating the duration
                rather than opening the calendar. */}
            <span id={`${uid}-dates-value`} className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <DayStamp date={from} locale={locale} />
                <RangeRule />
                <DayStamp date={to} locale={locale} />
              </span>
              <span className="tnum block text-[12px] text-text-muted">
                {t('days', { count: days, n: String(days) })} · {ft} <span className="inline-block rtl:-scale-x-100" aria-hidden="true">→</span> {tt}
              </span>
            </span>

            <svg
              viewBox="0 0 24 24"
              className={cn(
                'pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted transition-transform duration-[var(--dur-micro)]',
                datesOpen && 'rotate-180',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <p id={errorId('dates')} aria-live="polite" className="text-meta mt-2 text-red-signal empty:mt-0">
            {showError('dates')}
          </p>

          {datesOpen ? (
            <>
              {/* Mobile = a sheet, not a modal (plan 4.11) */}
              <div data-dates-scrim="" className="fixed inset-0 z-40 bg-bg/70 sm:hidden" aria-hidden="true" />
              <div
                id={datesPanelId}
                role="group"
                aria-label={t('datesLabel')}
                className={cn(
                  'fixed bottom-0 start-0 end-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-card)] border border-border bg-surface-1 p-3 shadow-[var(--shadow-float)]',
                  'sm:absolute sm:bottom-auto sm:end-auto sm:top-[calc(100%+0.5rem)] sm:max-h-none sm:w-[min(38rem,calc(100vw-3rem))] sm:rounded-[var(--radius-card)] sm:p-4',
                )}
              >
                <RangeCalendarPanel
                  locale={locale}
                  from={from}
                  to={to}
                  minDate={baseToday}
                  labels={{ calendar: t('calendarLabel'), previousMonth: t('previousMonth'), nextMonth: t('nextMonth') }}
                  onChange={(nextFrom, nextTo) => {
                    setFrom(nextFrom);
                    setTo(nextTo);
                  }}
                />

                <div className="mt-5 grid gap-3">
                  <TimeChips
                    label={t('pickupTime')}
                    value={ft}
                    onChange={setFt}
                    times={pickupTimes}
                    testId="time-chips-pickup"
                    describedBy={errorId('pickupTime')}
                  />
                  <p id={errorId('pickupTime')} aria-live="polite" className="text-meta text-red-signal">
                    {showError('pickupTime')}
                  </p>

                  <TimeChips
                    label={t('returnTime')}
                    value={tt}
                    onChange={setTt}
                    times={returnTimes}
                    testId="time-chips-return"
                    describedBy={errorId('returnTime')}
                  />
                  <p id={errorId('returnTime')} aria-live="polite" className="text-meta text-red-signal">
                    {showError('returnTime')}
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="dates-done"
                  onClick={() => {
                    setDatesOpen(false);
                    if (datesTriggerRef.current) datesTriggerRef.current.focus();
                  }}
                  className="text-meta mt-4 min-h-12 w-full rounded-[var(--radius-button)] bg-surface-2 text-text transition-colors duration-[var(--dur-micro)] hover:bg-surface-3"
                >
                  {t('datesDone')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ---------------- CTA — full width of the module ---------------- */}
      <div className="mt-5">
        <Button type="submit" size="xl" loading={isPending} loadingLabel={t('searching')} data-testid="booking-submit" data-cursor="reserver" className="w-full">
          {t('submit')}
          <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* The docked bar for the fleet page (prompt 07)                       */
/* ------------------------------------------------------------------ */

/**
 * `lieu · dates · Modifier` on one row. Display only — it owns no form state
 * and fires `onModify` so the page can reopen the real module.
 *
 * @param {object} props
 * @param {string} [props.pickup] location key
 * @param {string} [props.from] ISO datetime or `yyyy-mm-dd`
 * @param {string} [props.to] ISO datetime or `yyyy-mm-dd`
 * @param {Array<object>} [props.locations]
 * @param {() => void} props.onModify
 * @param {string} [props.className]
 */
export function CompactSearchBar({ pickup, from, to, locations = [], onModify, className }) {
  const t = useTranslations('widget');
  const tl = useTranslations('locations');
  const locale = useLocale();

  const fromDate = (splitDateTime(from) || {}).date;
  const toDate = (splitDateTime(to) || {}).date;
  const days = fromDate && toDate ? daysBetween(fromDate, toDate) : 0;

  const location = locations.find((l) => l.key === pickup);
  const label =
    pickup === OTHER_LOCATION_KEY ? tl('otherAddress') : (location && location.name && (location.name[locale] || location.name.fr)) || '';

  return (
    <div data-testid="compact-search-bar" className={cn('card flex min-h-14 w-full items-center gap-3 px-4 py-2 sm:gap-5 sm:px-5', className)}>
      {label ? (
        <span className="text-meta min-w-0 flex-1 truncate text-text" title={label}>
          {label}
        </span>
      ) : null}

      {fromDate && toDate ? (
        <span className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DayStamp date={fromDate} locale={locale} />
          <RangeRule />
          <DayStamp date={toDate} locale={locale} />
          <span className="text-meta hidden text-text-muted sm:inline">· {t('days', { count: days, n: String(days) })}</span>
        </span>
      ) : null}

      <button
        type="button"
        onClick={onModify}
        data-testid="compact-modify"
        className="text-meta ms-auto inline-flex min-h-12 shrink-0 items-center gap-2 rounded-[var(--radius-button)] px-3 text-text transition-colors duration-[var(--dur-micro)] hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {t('modify')}
      </button>
    </div>
  );
}
