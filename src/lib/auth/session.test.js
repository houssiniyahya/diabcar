/**
 * Admin session rules that matter once the site is deployed.
 *
 * The regressions these exist for:
 *  - a production deployment missing its Supabase variables fell into demo mode,
 *    printed the password on the login page, and accepted cookies signed with a
 *    default secret that anyone can read in this public repository;
 *  - a role read from user_metadata, which every user can write for themselves,
 *    made anyone who could sign up an owner;
 *  - the login's `next` could send a member of staff to another site.
 */

import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { createDemoToken, demoAdminEnabled, demoPassword, roleFromClaims, safeAdminNext, verifyDemoToken } from './session.js';

const KEYS = ['NODE_ENV', 'AUTH_SECRET', 'ADMIN_DEMO_PASSWORD', 'ADMIN_EMAILS'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(values) {
  for (const k of KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
}

afterEach(() => env(saved));

const STRONG = 'x'.repeat(24) + 'Q7m!r2Zp9w';

describe('the demo admin', () => {
  test('works in development with the defaults, so npm run dev needs no setup (rule 12)', async () => {
    env({ NODE_ENV: 'development' });
    assert.equal(demoAdminEnabled(), true);
    assert.equal(demoPassword(), 'diabcar-demo');
    const token = await createDemoToken('admin@diabcar.ma');
    assert.equal((await verifyDemoToken(token))?.email, 'admin@diabcar.ma');
  });

  test('is closed on a production build with no secret: no password, and a cookie forged with the public default is refused', async () => {
    env({ NODE_ENV: 'development' });
    const forged = await createDemoToken('attacker@example.invalid');

    env({ NODE_ENV: 'production' });
    assert.equal(demoAdminEnabled(), false);
    assert.equal(demoPassword(), null);
    assert.equal(await verifyDemoToken(forged), null);
    await assert.rejects(() => createDemoToken('admin@diabcar.ma'));
  });

  test('stays closed when the secret or the password is only a placeholder', () => {
    env({ NODE_ENV: 'production', AUTH_SECRET: 'change-me-in-production', ADMIN_DEMO_PASSWORD: 'something-private' });
    assert.equal(demoAdminEnabled(), false);
    env({ NODE_ENV: 'production', AUTH_SECRET: STRONG, ADMIN_DEMO_PASSWORD: 'diabcar-demo' });
    assert.equal(demoAdminEnabled(), false);
    env({ NODE_ENV: 'production', AUTH_SECRET: 'short-secret', ADMIN_DEMO_PASSWORD: 'something-private' });
    assert.equal(demoAdminEnabled(), false);
  });

  test('opens in production only with a real secret and a non-default password, and still refuses the public default signature', async () => {
    env({ NODE_ENV: 'development' });
    const forged = await createDemoToken('attacker@example.invalid');

    env({ NODE_ENV: 'production', AUTH_SECRET: STRONG, ADMIN_DEMO_PASSWORD: 'something-private' });
    assert.equal(demoAdminEnabled(), true);
    assert.equal(demoPassword(), 'something-private');
    const token = await createDemoToken('admin@diabcar.ma');
    assert.equal((await verifyDemoToken(token))?.email, 'admin@diabcar.ma');
    assert.equal(await verifyDemoToken(forged), null);
  });
});

describe('roleFromClaims', () => {
  test('a role a user wrote into their own user_metadata grants nothing', () => {
    env({ ADMIN_EMAILS: '' });
    assert.equal(roleFromClaims({ email: 'someone@example.invalid', user_metadata: { role: 'admin' } }), null);
    assert.equal(roleFromClaims({ email: 'someone@example.invalid', user_metadata: { role: 'owner' }, user_role: undefined }), null);
  });

  test('the database claim, app_metadata and the break-glass list still work', () => {
    env({ ADMIN_EMAILS: 'boss@diabcar.ma' });
    assert.equal(roleFromClaims({ user_role: 'agent' }), 'agent');
    assert.equal(roleFromClaims({ app_metadata: { role: 'admin' } }), 'owner');
    assert.equal(roleFromClaims({ email: 'BOSS@diabcar.ma' }), 'owner');
    assert.equal(roleFromClaims(null), null);
  });
});

describe('safeAdminNext', () => {
  test('keeps a path on this site', () => {
    assert.equal(safeAdminNext('/reservations/abc?tab=1', ''), '/reservations/abc?tab=1');
    assert.equal(safeAdminNext('/admin/flotte', '/admin'), '/admin/flotte');
  });

  test('sends anything that leaves the site back to the admin home', () => {
    for (const bad of ['https://evil.example/login', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'evil.example', '', null, undefined, '/x\ny']) {
      assert.equal(safeAdminNext(bad, ''), '/', String(bad));
    }
    assert.equal(safeAdminNext('https://evil.example', '/admin'), '/admin/');
  });
});
