import { Metadata } from 'next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sudogwon.com';

interface Transaction {
  amount: number;
  area: number;
  floor: number;
  deal_date: string;
}

interface Apartment {
  id: number;
  name: string;
  dong: string;
  region_name: string;
  build_year: number;
}

interface ApartmentData {
  apartment: Apartment;
  transactions: Transaction[];
}

function formatPrice(amount: number): string {
  if (amount >= 10000) {
    const uk = Math.floor(amount / 10000);
    const man = amount % 10000;
    return man > 0 ? `${uk}억 ${man.toLocaleString()}만원` : `${uk}억원`;
  }
  return `${amount.toLocaleString()}만원`;
}

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const id = resolvedParams.id;

  try {
    const res = await fetch(`${API_BASE}/api/apartments/${id}`, {
      next: { revalidate: 3600 } // 1시간 캐시
    });

    if (!res.ok) {
      return {
        title: '아파트 실거래가',
        description: '아파트 실거래가 정보를 확인하세요.',
      };
    }

    const data: ApartmentData = await res.json();
    const apt = data.apartment;
    const latestTx = data.transactions[0];

    const title = `${apt.name} 실거래가 - ${apt.region_name}`;
    const description = latestTx
      ? `${apt.name} ${latestTx.area}㎡ 최근 거래가 ${formatPrice(latestTx.amount)}. ${apt.build_year}년 준공, ${apt.region_name}.`
      : `${apt.name} 실거래가 정보. ${apt.build_year}년 준공, ${apt.region_name}.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        url: `${SITE_URL}/apartment/${id}`,
        images: [
          {
            url: `${SITE_URL}/api/og/${id}`,
            width: 1200,
            height: 630,
            alt: `${apt.name} 실거래가`,
          }
        ],
        siteName: '수도권 실거래가',
        locale: 'ko_KR',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [`${SITE_URL}/api/og/${id}`],
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: '아파트 실거래가',
      description: '아파트 실거래가 정보를 확인하세요.',
    };
  }
}

export default function ApartmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
