import { SITE_URL } from '@/lib/seo';

/**
 * IndexNow: notifies Bing (and partner engines) instantly when URLs change.
 * Google does not use IndexNow; the sitemap + Search Console cover it.
 */
export async function pingIndexNow(urls, key) {
  if (!key || !urls?.length) return { ok: false, skipped: true };
  const host = new URL(SITE_URL).host;
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${SITE_URL}/indexnow-key.txt`, urlList: urls.slice(0, 10000) }),
    });
    return { ok: res.ok || res.status === 202, status: res.status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
