import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  // Shared pages must remain crawlable for OG; their own metadata sets noindex.
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: 'https://jachuimap.vercel.app/sitemap.xml' };
}
