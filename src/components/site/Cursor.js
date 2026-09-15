'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import * as m from 'motion/react-m';
import { useMotionValue, useSpring, useReducedMotion } from 'motion/react';

/**
 * The custom cursor (plan 5.3): a 10 px dot that tracks the pointer exactly and
 * a 28 px ring that lags behind it, with a contextual label over anything that
 * declares one.
 *
 * Three things keep it from costing what custom cursors usually cost.
 *
 * The pointer position never becomes React state. It is written to motion
 * values and read by the compositor, so moving the mouse re-renders nothing —
 * a setState per mousemove is the classic way these wreck INP (rule 7). Only
 * the LABEL is state, and that changes when you enter or leave a target.
 *
 * It is not rendered at all unless the device has a fine pointer, read through
 * `useSyncExternalStore` rather than a mount effect: this repo lints
 * `set-state-in-effect` as an error, and the usual `useEffect(() =>
 * setMounted(true))` would add one. The server snapshot is `false`, so nothing
 * ships to a phone and nothing flashes during hydration.
 *
 * `mix-blend-mode: difference` means it stays visible over the hero photo, the
 * red CTA and both themes without a single colour of its own — which is also
 * why it needs no dark-mode variant (rule 3).
 *
 * To give an element a label, put `data-cursor="voir"` on it; the label text
 * comes from the messages, so it is translated in all four languages. Both the
 * uppercasing and the tracking are `ltr:`-only: Arabic letters join, and
 * letter-spacing pulls those joins apart (rule 3).
 */

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function subscribe(onChange) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export default function Cursor({ labels = {} }) {
  const finePointer = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
  const reduce = useReducedMotion();

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  /* The dot is nearly rigid, the ring trails it — that lag is the whole effect. */
  const dotX = useSpring(x, { stiffness: 1400, damping: 60, mass: 0.2 });
  const dotY = useSpring(y, { stiffness: 1400, damping: 60, mass: 0.2 });
  const ringX = useSpring(x, { stiffness: 240, damping: 24, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 240, damping: 24, mass: 0.5 });

  const [label, setLabel] = useState('');
  const [active, setActive] = useState(false);

  const onMove = useCallback(
    (event) => {
      x.set(event.clientX);
      y.set(event.clientY);

      const target = event.target instanceof Element ? event.target : null;
      /* A form field keeps the platform caret: replacing it with a dot makes
         text impossible to place (plan 5.3). */
      const field = target?.closest('input, textarea, select, [contenteditable="true"]');
      const hit = field ? null : target?.closest('[data-cursor]');
      const next = hit ? labels[hit.getAttribute('data-cursor')] || '' : '';
      const isActive = Boolean(hit) || Boolean(field ? false : target?.closest('a, button, [role="button"], [role="option"]'));

      setLabel((prev) => (prev === next ? prev : next));
      setActive((prev) => (prev === isActive ? prev : isActive));
    },
    [x, y, labels],
  );

  /* On the window, not on the layer: the layer is `pointer-events: none` so
     that it never eats a click, which also means it never receives a move.
     Attached only while the cursor is actually rendered. */
  const live = finePointer && !reduce;
  useEffect(() => {
    if (!live) return undefined;
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.setAttribute('data-cursor-on', '');
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeAttribute('data-cursor-on');
    };
  }, [live, onMove]);

  /* Nothing at all on touch, on a coarse pointer, or under reduced motion —
     where a lagging ring is exactly the kind of thing being asked to stop. */
  if (!live) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80] hidden lg:block"
      data-testid="cursor-layer"
    >
      {/* `left`/`top`, NOT the logical `start` — on the OUTER point and on the
          shape inside it. clientX/clientY are measured
          from the viewport's left and top in every writing direction, so an
          RTL page anchoring to `start` (the right edge) would send the cursor
          the wrong way across the screen. The inner shape needs `left-0` for a
          second reason: an absolutely positioned box with `left: auto` falls
          back to its static position, which in RTL is its container's RIGHT
          edge — so the label sat a full width to the left of the pointer in
          Arabic while being pixel-perfect in French. This is the rare case
          where physical properties are the correct ones. Each layer is a bare point and
          the visible shape centres itself inside it, so growing into a pill
          stays centred on the pointer. */}
      <m.span style={{ x: ringX, y: ringY }} className="absolute left-0 top-0 block">
        <m.span
          className={
            label
              ? 'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center whitespace-nowrap rounded-full bg-text px-3 text-[10px] font-semibold text-bg ltr:uppercase ltr:tracking-[0.08em]'
              : 'absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 block rounded-full border border-white mix-blend-difference'
          }
          animate={{ width: label ? 'auto' : 28, height: label ? 26 : 28, opacity: active || label ? 1 : 0.55 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          {/* The labelled state drops mix-blend-difference for solid tokens.
              Difference is perfect for a bare ring on any backdrop, but it
              turns 10px type to mud over the mid-greys of a car photo — and
              a label nobody can read is worse than no label. bg-text/text-bg
              inverts itself correctly in both themes (rule 3). */}
          {label || null}
        </m.span>
      </m.span>

      <m.span style={{ x: dotX, y: dotY }} className="absolute left-0 top-0 block">
        <m.span
          className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 block h-2.5 w-2.5 rounded-full bg-white mix-blend-difference"
          animate={{ scale: label ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      </m.span>
    </div>
  );
}
