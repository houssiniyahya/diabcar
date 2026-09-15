/**
 * The anti-spam check must never be the thing that stops a real booking. With
 * only one of its two keys configured, the widget cannot send a token, so the
 * check skips rather than refusing every reservation.
 */

import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { turnstileConfigured, verifyTurnstile } from './turnstile.js';

const KEYS = ['TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'NODE_ENV'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(values) {
  for (const k of KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
}

afterEach(() => env(saved));

describe('verifyTurnstile', () => {
  test('no keys at all: skipped', async () => {
    env({});
    assert.equal(turnstileConfigured(), false);
    assert.deepEqual(await verifyTurnstile(undefined), { ok: true, skipped: true });
  });

  test('the secret without the public site key: skipped, not every booking refused', async () => {
    env({ TURNSTILE_SECRET_KEY: 'secret' });
    assert.equal(turnstileConfigured(), false);
    assert.deepEqual(await verifyTurnstile(undefined), { ok: true, skipped: true });
  });

  test('both keys: a missing token is refused', async () => {
    env({ TURNSTILE_SECRET_KEY: 'secret', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site' });
    assert.equal(turnstileConfigured(), true);
    assert.deepEqual(await verifyTurnstile(undefined), { ok: false, codes: ['missing-input-response'] });
  });
});
