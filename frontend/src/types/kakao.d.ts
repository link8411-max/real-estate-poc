/** 카카오맵 JS SDK 중 이 앱이 쓰는 부분만의 최소 타입. */
declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  class Point {
    x: number;
    y: number;
  }

  interface MapProjection {
    containerPointFromCoords(latlng: LatLng): Point;
  }

  class LatLngBounds {
    getSouthWest(): LatLng;
    getNorthEast(): LatLng;
  }

  interface MapOptions {
    center: LatLng;
    level?: number;
  }

  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    getBounds(): LatLngBounds;
    getLevel(): number;
    getCenter(): LatLng;
    setLevel(level: number, options?: { anchor?: LatLng; animate?: boolean | { duration: number } }): void;
    panTo(latlng: LatLng): void;
    setCenter(latlng: LatLng): void;
    relayout(): void;
    getProjection(): MapProjection;
  }

  interface CustomOverlayOptions {
    position: LatLng;
    content: HTMLElement | string;
    map?: Map;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
  }

  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
    setContent(content: HTMLElement | string): void;
    setZIndex(z: number): void;
  }

  namespace event {
    function addListener(target: Map, type: string, handler: () => void): void;
    function removeListener(target: Map, type: string, handler: () => void): void;
  }

  function load(callback: () => void): void;
}

interface Window {
  kakao?: typeof kakao;
}
