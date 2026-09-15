import { getSettingsAdmin } from '@/lib/data';

/**
 * GET /indexnow-key.txt — the IndexNow key file (keyLocation).
 *
 * At the site root, not under /api/: IndexNow only accepts URLs at or below the
 * key file's own location, and robots.txt disallows /api/, so the old
 * /api/indexnow-key could authorise none of the /fr, /en, /ar, /es pages it was
 * submitting. The environment variable wins, because an anonymous request may
 * not be able to read the settings row.
 */
export async function GET() {
  let key = process.env.INDEXNOW_KEY || '';
  if (!key) {
    try {
      key = (await getSettingsAdmin())?.indexNowKey || '';
    } catch {
      key = '';
    }
  }
  if (!key) return new Response('IndexNow key not configured', { status: 404 });
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
