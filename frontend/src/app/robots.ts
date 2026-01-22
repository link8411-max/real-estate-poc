import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sudogwon.com';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/perf-test', '/monitor', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
