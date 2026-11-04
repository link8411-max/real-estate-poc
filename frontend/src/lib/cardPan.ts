/** 모바일 카드 위쪽으로 여유를 둘 거리(px): 마커(라벨)의 높이와 카드 그림자를 감안한다 */
const MOBILE_MARGIN = 60;
/** 데스크톱에서 마커를 카드 왼쪽으로 빼낼 때 카드와 띄울 거리(px) */
const DESKTOP_GAP = 80;
/** 카드의 화면 여백(Tailwind: 모바일 bottom-14, md+ bottom-8 / right-4 / w-[360px]) */
const MOBILE_BOTTOM = 56;
const DESKTOP_BOTTOM = 32;
const DESKTOP_RIGHT = 16;
const DESKTOP_WIDTH = 360;

interface Input {
  /** 마커의 지도 컨테이너 기준 픽셀 좌표 */
  marker: { x: number; y: number };
  /** 카드가 놓이는 영역(지도와 같은 좌표계)의 크기 */
  container: { width: number; height: number };
  cardHeight: number;
  /** md(768px) 이상이면 카드가 오른쪽 아래에 붙는다 */
  desktop: boolean;
}

/**
 * 선택한 마커가 미리보기 카드에 가리면 지도를 얼마나 옮겨야 하는지 계산한다(panBy 인자).
 * 가리지 않으면 null. 모바일은 카드 위 남은 공간의 가운데로, 데스크톱은 카드 왼쪽으로 뺀다.
 */
export function panForCard({ marker, container, cardHeight, desktop }: Input): { dx: number; dy: number } | null {
  if (cardHeight <= 0) return null;
  if (desktop) {
    const left = container.width - DESKTOP_RIGHT - DESKTOP_WIDTH;
    const right = container.width - DESKTOP_RIGHT;
    const top = container.height - DESKTOP_BOTTOM - cardHeight;
    const bottom = container.height - DESKTOP_BOTTOM;
    const under = marker.x >= left && marker.x <= right && marker.y >= top && marker.y <= bottom;
    return under ? { dx: marker.x - (left - DESKTOP_GAP), dy: 0 } : null;
  }
  const cardTop = container.height - MOBILE_BOTTOM - cardHeight;
  if (marker.y <= cardTop - MOBILE_MARGIN) return null;
  // 마커를 위로 올리려면 지도 중심을 아래로(+dy) 옮긴다
  return { dx: 0, dy: marker.y - cardTop / 2 };
}
