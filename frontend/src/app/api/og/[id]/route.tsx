import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const runtime = 'edge';

interface Transaction {
  amount: number;
  area: number;
  floor: number;
  deal_date: string;
}

interface AreaStat {
  area: number;
  max_amount: number;
  latest_amount: number | null;
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
  area_stats: AreaStat[];
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

export async function GET(request: NextRequest, { params }: Props) {
  const resolvedParams = await params;
  const id = resolvedParams.id;

  try {
    const res = await fetch(`${API_BASE}/api/apartments/${id}`);

    if (!res.ok) {
      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f3f4f6',
              fontSize: 32,
              color: '#6b7280',
            }}
          >
            아파트 정보를 찾을 수 없습니다
          </div>
        ),
        { width: 1200, height: 630 }
      );
    }

    const data: ApartmentData = await res.json();
    const apt = data.apartment;
    const latestTx = data.transactions[0];
    const areaStat = data.area_stats[0];

    // 전고점 회복률 계산
    let recoveryRate: number | null = null;
    if (areaStat?.max_amount && latestTx) {
      recoveryRate = Math.round((latestTx.amount / areaStat.max_amount) * 100);
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            padding: '60px',
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '28px', color: '#6b7280' }}>
              {apt.region_name}
            </span>
            <span style={{ fontSize: '24px', color: '#9ca3af' }}>
              수도권 실거래가
            </span>
          </div>

          {/* 아파트명 */}
          <div
            style={{
              fontSize: '56px',
              fontWeight: 'bold',
              marginTop: '30px',
              marginBottom: '20px',
              color: '#111827',
              display: 'flex',
            }}
          >
            {apt.name}
          </div>

          {/* 가격 정보 */}
          {latestTx ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '20px',
              }}
            >
              <span
                style={{
                  fontSize: '72px',
                  fontWeight: 'bold',
                  color: '#2563eb',
                }}
              >
                {formatPrice(latestTx.amount)}
              </span>
              <span style={{ fontSize: '28px', color: '#6b7280' }}>
                {latestTx.area}m² | {latestTx.deal_date}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '36px', color: '#9ca3af', display: 'flex' }}>
              거래 정보 없음
            </div>
          )}

          {/* 인사이트 배지 */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '40px',
            }}
          >
            {recoveryRate && recoveryRate < 100 && (
              <div
                style={{
                  backgroundColor: '#dbeafe',
                  color: '#1d4ed8',
                  padding: '12px 24px',
                  borderRadius: '999px',
                  fontSize: '24px',
                  fontWeight: 600,
                  display: 'flex',
                }}
              >
                전고점 대비 -{100 - recoveryRate}%
              </div>
            )}
            {recoveryRate && recoveryRate >= 100 && (
              <div
                style={{
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  padding: '12px 24px',
                  borderRadius: '999px',
                  fontSize: '24px',
                  fontWeight: 600,
                  display: 'flex',
                }}
              >
                신고가
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #e5e7eb',
              paddingTop: '30px',
            }}
          >
            <span style={{ fontSize: '22px', color: '#9ca3af' }}>
              {apt.build_year}년 준공
            </span>
            <span
              style={{ fontSize: '28px', fontWeight: 600, color: '#2563eb' }}
            >
              sudogwon.com
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f3f4f6',
            fontSize: 32,
            color: '#6b7280',
          }}
        >
          이미지 생성 오류
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
