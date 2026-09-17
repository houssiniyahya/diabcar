'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/server';
import { PRICING_ROLES } from '@/lib/auth/session';
import { createBlock, deleteBlock } from '@/lib/data';

/* Owner and manager only, like the `blocks manage` policy in migration 0005
   and the guard inside create_block()/delete_block() (0014): an agent used to
   pass the JavaScript gate and then get a bare 'SERVER' back. The pages that
   create blocks say so in a sentence instead. */
async function allowed() {
  try {
    await requireRole(PRICING_ROLES);
    return true;
  } catch {
    return false;
  }
}

/* The pages that draw blocks. All force-dynamic, so this is belt and braces
   next to the router.refresh() every form already does. */
const REVALIDATE = ['/admin/calendrier', '/admin/blocs', '/admin/flotte'];

/* The same ceiling create_block() applies: a period longer than a year is a
   typo, not a plan. */
const MAX_MS = 366 * 86400000;

/**
 * Taking a car out of availability (plan 6.1, 7.3), and giving it back.
 *
 * A block is the honest way to say "this unit cannot be rented" — maintenance,
 * cleaning, a transfer, a booking taken outside the website. Postgres decides
 * (create_block, 0014): it refuses a period that lands on a booking of this
 * car, on another period of this car, or that would leave the model unable to
 * honour the bookings still waiting for a plate — and it names what is in the
 * way. This action's job is to check the input and hand that answer back.
 *
 * Like the reservation actions, both RETURN the outcome instead of throwing: a
 * conflict is information, not a crash.
 */

const KINDS = ['maintenance', 'cleaning', 'transfer', 'private', 'other'];

const isDate = (v) => !Number.isNaN(Date.parse(v));

const schema = z
  .object({
    unitId: z.uuid().or(z.string().min(1).max(64)),
    startAt: z.string().max(40).refine(isDate, 'not a date'),
    endAt: z.string().max(40).refine(isDate, 'not a date'),
    kind: z.enum(KINDS).default('maintenance'),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((d) => Date.parse(d.endAt) > Date.parse(d.startAt), { path: ['endAt'], message: 'BAD_DATES' })
  .refine((d) => Date.parse(d.endAt) - Date.parse(d.startAt) <= MAX_MS, { path: ['endAt'], message: 'TOO_LONG' });

const deleteSchema = z.object({
  id: z.uuid().or(z.string().min(1).max(64)),
  reason: z.string().trim().min(1).max(200),
});

/** The refusals create_block() and delete_block() can answer with. */
const KNOWN = new Set(['FORBIDDEN', 'REASON_REQUIRED', 'BAD_DATES', 'PAST', 'TOO_LONG', 'NOT_FOUND', 'BLOCK_OVERLAP', 'CONFLICT', 'CAPACITY']);

function refusal(result) {
  const error = KNOWN.has(result?.error) ? result.error : 'SERVER';
  return {
    ok: false,
    error,
    reference: result?.reference || null,
    status: result?.status || null,
    source: result?.source || null,
    kind: result?.kind || null,
    from: result?.from || null,
    to: result?.to || null,
    waiting: Number(result?.waiting) || null,
    legacy: Boolean(result?.legacy),
  };
}

export async function createBlockAction(input) {
  if (!(await allowed())) return { ok: false, error: 'FORBIDDEN' };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message);
    if (messages.includes('BAD_DATES')) return { ok: false, error: 'BAD_DATES' };
    if (messages.includes('TOO_LONG')) return { ok: false, error: 'TOO_LONG' };
    const fieldErrors = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.code;
    return { ok: false, error: 'VALIDATION', fieldErrors };
  }
  const d = parsed.data;
  if (Date.parse(d.endAt) <= Date.now()) return { ok: false, error: 'PAST' };

  try {
    const result = await createBlock(d);
    if (!result?.ok) return refusal(result);
    for (const path of REVALIDATE) revalidatePath(path);
    return { ok: true, block: result.block, legacy: Boolean(result.legacy) };
  } catch {
    return { ok: false, error: 'SERVER' };
  }
}

/** Giving the dates back takes a reason, like cancelling a booking (rule 5). */
export async function deleteBlockAction(input) {
  if (!(await allowed())) return { ok: false, error: 'FORBIDDEN' };

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    const missingReason = parsed.error.issues.some((i) => i.path[0] === 'reason');
    return { ok: false, error: missingReason ? 'REASON_REQUIRED' : 'VALIDATION' };
  }

  try {
    const result = await deleteBlock(parsed.data.id, parsed.data.reason);
    if (!result?.ok) return refusal(result);
    for (const path of REVALIDATE) revalidatePath(path);
    return { ok: true, legacy: Boolean(result.legacy) };
  } catch {
    return { ok: false, error: 'SERVER' };
  }
}
