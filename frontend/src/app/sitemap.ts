import { MetadataRoute } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sudogwon.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/browse`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/stats`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    },
  ];

  // 동적 페이지 (아파트 상세) - API에서 ID 목록 조회
  try {
    const res = await fetch(`${API_BASE}/api/apartments/ids`, {
      next: { revalidate: 86400 } // 24시간 캐시
    });

    if (!res.ok) {
      console.error('Failed to fetch apartment IDs for sitemap');
      return staticPages;
    }

    const ids: number[] = await res.json();

    const apartmentPages: MetadataRoute.Sitemap = ids.map(id => ({
      url: `${SITE_URL}/apartment/${id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));

    return [...staticPages, ...apartmentPages];
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return staticPages;
  }
}
