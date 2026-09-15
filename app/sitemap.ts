import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/scoring', '/privacy'].map(path => ({ url: `https://jachuimap.vercel.app${path}` }));
}
