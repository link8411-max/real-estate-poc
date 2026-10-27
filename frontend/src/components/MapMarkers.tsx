"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { formatMapLabel, type MapMode } from "@/lib/mapFilters";
import type { MapApartment, MapData, MapRegion } from "@/lib/useMapData";

interface Props {
  map: kakao.maps.Map;
  data: MapData | null;
  mode: MapMode;
}

/** 지도 위에 올릴 오버레이 한 개의 명세. sig가 같으면 기존 오버레이를 그대로 둔다. */
interface Spec {
  key: string;
  lat: number;
  lng: number;
  sig: string;
  build: () => HTMLElement;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function apartmentSpec(a: MapApartment, mode: MapMode, go: (id: number) => void): Spec | null {
  const amount = mode === "rent" ? a.latest_jeonse_deposit : a.latest_trade_amount;
  if (amount === null) return null;
  const label = formatMapLabel(amount);
  return {
    key: `a:${a.id}`,
    lat: a.lat,
    lng: a.lng,
    sig: `${label}|${a.name}`,
    build: () => {
      const root = el("button", "group relative block cursor-pointer");
      root.setAttribute("type", "button");
      root.title = a.name;
      root.append(
        el("span", `rounded-full px-2 py-0.5 text-xs font-bold text-white shadow ${mode === "rent" ? "bg-emerald-600" : "bg-blue-600"} group-hover:bg-gray-900`, label),
        el("span", "absolute left-1/2 top-full mt-0.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-white/95 px-1.5 text-[11px] text-gray-800 shadow group-hover:block", a.name),
      );
      root.addEventListener("click", () => go(a.id));
      return root;
    },
  };
}

function regionSpec(r: MapRegion, zoom: (lat: number, lng: number) => void): Spec {
  const avg = r.avg_amount === null ? "-" : formatMapLabel(r.avg_amount);
  return {
    key: `r:${r.code}`,
    lat: r.lat,
    lng: r.lng,
    sig: `${r.name}|${avg}`,
    build: () => {
      const root = el(
        "button",
        "flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-full bg-blue-600/90 text-white shadow-lg ring-2 ring-white hover:bg-blue-700",
      );
      root.setAttribute("type", "button");
      root.append(el("span", "text-xs font-semibold leading-tight", r.name), el("span", "text-[11px] leading-tight text-blue-100", avg));
      root.addEventListener("click", () => zoom(r.lat, r.lng));
      return root;
    },
  };
}

/** 호버한 라벨(과 단지명)이 이웃 라벨에 가리지 않게 맨 위로 올린다. */
function raiseOnHover(overlay: kakao.maps.CustomOverlay, content: HTMLElement) {
  content.addEventListener("mouseenter", () => overlay.setZIndex(10));
  content.addEventListener("mouseleave", () => overlay.setZIndex(0));
}

/** 단지 라벨/지역 원을 CustomOverlay로 그린다. 갱신 때는 key로 비교해 바뀐 것만 다시 만든다. */
export default function MapMarkers({ map, data, mode }: Props) {
  const router = useRouter();
  const overlays = useRef(new Map<string, { overlay: kakao.maps.CustomOverlay; sig: string }>());

  useEffect(() => {
    const go = (id: number) => router.push(`/apartment/${id}`);
    const zoom = (lat: number, lng: number) => {
      map.setCenter(new kakao.maps.LatLng(lat, lng));
      map.setLevel(6);
    };
    const specs: Spec[] = !data
      ? []
      : data.type === "apartments"
        ? data.items.flatMap((a) => apartmentSpec(a, mode, go) ?? [])
        : data.items.map((r) => regionSpec(r, zoom));

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
        raiseOnHover(existing.overlay, content);
        continue;
      }
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        content,
        map,
        clickable: true,
        yAnchor: 0.5,
      });
      raiseOnHover(overlay, content);
      current.set(s.key, { overlay, sig: s.sig });
    }
  }, [map, data, mode, router]);

  useEffect(() => {
    const current = overlays.current;
    return () => {
      for (const o of current.values()) o.overlay.setMap(null);
      current.clear();
    };
  }, [map]);

  return null;
}
