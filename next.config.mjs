import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

/* A production deployment must never build on the in-memory demo store. With
   the Supabase variables missing, the public site would serve demo cars and
   prices as if they were real, and every booking would vanish on the next cold
   start. So the build fails instead, and Vercel keeps the last good deployment.
   VERCEL_ENV exists only on Vercel: local builds, the e2e suite (which builds
   in demo mode on purpose) and any other host are unaffected. */
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
if (process.env.VERCEL_ENV === 'production' && !hasSupabase) {
  throw new Error(
    'Production build refused: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the Production environment in Vercel (docs/DEPLOY-VERCEL.md).',
  );
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Variants are generated once at build by scripts/images.mjs (AVIF + WebP at
    // 480-2000 px). No per-request optimizer: free on Cloudflare Workers, and
    // portable to any host (plan 2.5 / 9.1).
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    qualities: [60, 75, 85],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/fonts/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
