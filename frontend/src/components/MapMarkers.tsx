"use client";

import { useEffect, useRef } from "react";
import { useAreaUnit, type AreaUnit } from "@/lib/areaUnit";
import { type Box, cullLabels } from "@/lib/cullLabels";
import { areaGroup, areaToPyeong } from "@/lib/format";
import { mapSupply } from "@/lib/mapSupply";
import { SUPPLY_ENABLED, supplyText } from "@/lib/supply";
import { formatMapLabel, type MapBounds, type MapMode } from "@/lib/mapFilters";
import type { MapApartment, MapData, MapRegion } from "@/lib/useMapData";

interface Props {
  map: kakao.maps.Map;
  data: MapData | null;
  mode: MapMode;
  /** 지도가 멈출 때마다 바뀌는 현재 범위. 바뀌면 라벨 겹침을 다시 계산한다. */
  bounds?: MapBounds | null;
  /** false면 미니 지도: 마커 클릭(선택·확대)을 막는다. 기본 true. */
  interactive?: boolean;
  /** 선택된(미리보기 카드가 열린) 단지 id. 이 마커를 어둡게 강조한다. */
  selectedId?: number | null;
  /** 단지 마커 클릭. 이동 대신 미리보기 카드를 여는 데 쓴다. */
  onSelect?: (apartment: MapApartment) => void;
  /** 정비사업 마커가 이미 차지한 화면 영역. 시세 라벨은 이 자리를 피한다(구역이 우선). */
  avoid?: readonly Box[];
}

/** 마커 윗줄에 보이는 단지명의 최대 글자 수(넘으면 …) */
const NAME_MAX_CHARS = 7;

/** 지도 위에 올릴 오버레이 한 개의 명세. sig가 같으면 기존 오버레이를 그대로 둔다. */
interface Spec {
  key: string;
  lat: number;
  lng: number;
  sig: string;
  /** 평소 zIndex(선택된 마커는 앞으로) */
  z: number;
  build: () => HTMLElement;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const amountOf = (a: MapApartment, mode: MapMode) => (mode === "rent" ? a.latest_jeonse_deposit : a.latest_trade_amount);

const shortName = (name: string) => (name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS)}…` : name);

/** 마커 윗줄: "단지명 · 25평"(전세 모드는 "단지명 · 전세"). 면적이 없으면 단지명만. */
function topLine(a: MapApartment, mode: MapMode, unit: AreaUnit): string {
  const name = shortName(a.name);
  if (mode === "rent") return `${name} · 전세`;
  if (a.latest_trade_area === null) return name;
  const g = areaGroup(a.latest_trade_area);
  if (SUPPLY_ENABLED) {
    const sp = mapSupply(a);
    return `${name} · ${unit === "m2" || !sp ? `${g}㎡` : supplyText(sp)}`;
  }
  return `${name} · ${unit === "m2" ? `${g}㎡` : `${areaToPyeong(g)}평`}`;
}

interface AptOpts {
  unit: AreaUnit;
  selected: boolean;
  onSelect: ((a: MapApartment) => void) | null;
}

function apartmentSpec(a: MapApartment, mode: MapMode, o: AptOpts): Spec | null {
  const amount = amountOf(a, mode);
  if (amount === null) return null;
  const label = formatMapLabel(amount);
  const top = topLine(a, mode, o.unit);
  return {
    key: `a:${a.id}`,
    lat: a.lat,
    lng: a.lng,
    sig: `${mode}|${label}|${top}|${o.selected}`,
    z: o.selected ? 10 : 0,
    build: () => {
      const root = el("button", "group relative block cursor-pointer");
      root.setAttribute("type", "button");
      root.title = a.name;
      const tone = o.selected ? "bg-gray-900" : mode === "rent" ? "bg-emerald-600" : "bg-blue-600";
      const pill = el("span", `flex flex-col items-center rounded-xl px-1.5 py-px text-white shadow ${tone} group-hover:bg-gray-900`);
      pill.append(el("span", "whitespace-nowrap text-[10px] font-medium leading-tight text-white/80", top), el("span", "text-xs font-bold leading-tight", label));
      root.append(pill);
      if (o.onSelect) root.addEventListener("click", () => o.onSelect?.(a));
      else root.classList.add("pointer-events-none");
      return root;
    },
  };
}

/** 지역 원의 둘째 줄. avg_amount는 매매 평균이라 전세 모드에서는 단지 수를 보여준다. */
function regionSubtitle(r: MapRegion, mode: MapMode): string {
  if (mode === "rent") return r.apartment_count === null ? "-" : `단지 ${r.apartment_count.toLocaleString("en-US")}개`;
  return r.avg_amount === null ? "-" : formatMapLabel(r.avg_amount);
}

function regionSpec(r: MapRegion, mode: MapMode, zoom: ((lat: number, lng: number) => void) | null): Spec {
  const avg = regionSubtitle(r, mode);
  return {
    key: `r:${r.code}`,
    lat: r.lat,
    lng: r.lng,
    sig: `${r.name}|${avg}`,
    z: 0,
    build: () => {
      const root = el(
        "button",
        "flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-full bg-blue-600/90 text-white shadow-lg ring-2 ring-white hover:bg-blue-700",
      );
      root.setAttribute("type", "button");
      root.append(el("span", "text-xs font-semibold leading-tight", r.name), el("span", "text-[11px] leading-tight text-blue-100", avg));
      if (zoom) root.addEventListener("click", () => zoom(r.lat, r.lng));
      else root.classList.add("pointer-events-none");
      return root;
    },
  };
}

/** 호버한 라벨(과 단지명)이 이웃 라벨에 가리지 않게 맨 위로 올린다. */
function raiseOnHover(overlay: kakao.maps.CustomOverlay, content: HTMLElement, base: number) {
  overlay.setZIndex(base);
  content.addEventListener("mouseenter", () => overlay.setZIndex(11));
  content.addEventListener("mouseleave", () => overlay.setZIndex(base));
}

/** 단지 라벨/지역 원을 CustomOverlay로 그린다. 갱신 때는 key로 비교해 바뀐 것만 다시 만든다. */
/** 화면에서 겹치는 단지 라벨을 거래 수 우선으로 거른다. */
function visibleApartments(map: kakao.maps.Map, items: MapApartment[], mode: MapMode, unit: AreaUnit, selectedId: number | null, avoid?: readonly Box[]): MapApartment[] {
  const projection = map.getProjection();
  const priced = items.filter((a) => amountOf(a, mode) !== null);
  return cullLabels(priced, (a) => projection.containerPointFromCoords(new kakao.maps.LatLng(a.lat, a.lng)), {
    label: (a) => formatMapLabel(amountOf(a, mode)!),
    top: (a) => topLine(a, mode, unit),
    occupied: avoid,
    // 선택한 마커는 겹쳐도 남긴다
    weight: (a) => (a.id === selectedId ? Infinity : (a.trade_count ?? 0)),
  });
}

export default function MapMarkers({ map, data, mode, bounds, interactive = true, selectedId = null, onSelect, avoid }: Props) {
  const [unit] = useAreaUnit();
  const overlays = useRef(new Map<string, { overlay: kakao.maps.CustomOverlay; sig: string }>());

  useEffect(() => {
    const select = interactive && onSelect ? onSelect : null;
    const zoom = interactive
      ? (lat: number, lng: number) => {
          map.setLevel(6);
          map.setCenter(new kakao.maps.LatLng(lat, lng));
        }
      : null;
    const specs: Spec[] = !data
      ? []
      : data.type === "apartments"
        ? visibleApartments(map, data.items, mode, unit, selectedId, avoid).flatMap((a) => apartmentSpec(a, mode, { unit, selected: a.id === selectedId, onSelect: select }) ?? [])
        : data.items.map((r) => regionSpec(r, mode, zoom));

    const current = overlays.current;
    const next = new Set(specs.map((s) => s.key));
    for (const [key, o] of current) {
      if (!next.has(key)) {
        o.overlay.setMap(null);
        current.delete(key);
      }
    }
    for (const s of specs) {
      const existing = current.get(s.key);
      if (existing?.sig === s.sig) continue;
      const content = s.build();
      if (existing) {
        existing.overlay.setContent(content);
        existing.sig = s.sig;
        raiseOnHover(existing.overlay, content, s.z);
        continue;
      }
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        content,
        map,
        clickable: true,
        yAnchor: 0.5,
      });
      raiseOnHover(overlay, content, s.z);
      current.set(s.key, { overlay, sig: s.sig });
    }
  }, [map, data, mode, bounds, interactive, unit, selectedId, onSelect, avoid]);

  useEffect(() => {
    const current = overlays.current;
    return () => {
      for (const o of current.values()) o.overlay.setMap(null);
      current.clear();
    };
  }, [map]);

  return null;
}
