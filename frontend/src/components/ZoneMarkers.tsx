"use client";

import { useEffect, useRef } from "react";
import { cullLabels } from "@/lib/cullLabels";
import type { MapBounds } from "@/lib/mapFilters";
import { zoneColor, zoneLabel, zoneLabelWidth } from "@/lib/redevelopment";
import type { Zone } from "@/lib/types";

interface Props {
  map: kakao.maps.Map;
  /** 그릴 구역(좌표·필터·범위는 이미 걸러진 것) */
  zones: Zone[];
  /** 지도가 멈출 때마다 바뀌는 범위. 바뀌면 라벨 겹침을 다시 계산한다. */
  bounds?: MapBounds | null;
  /** false면 클릭을 막는다. 기본 true. */
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (zone: Zone) => void;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * 구역 한 개의 마커: 유형 색 마름모 + "재건축 · 착공" 라벨.
 * 위치가 동 단위 대략(dong_approx)이면 마름모 속을 비워 정확한 위치가 아님을 보여 준다.
 */
function build(z: Zone, selected: boolean, onSelect: ((z: Zone) => void) | null): HTMLElement {
  const c = zoneColor(z.type_group, z.stage_order);
  const hollow = z.geo === "dong_approx";
  const root = el("button", "group flex cursor-pointer items-center gap-1");
  root.setAttribute("type", "button");
  root.dataset.zoneId = z.zone_id;
  if (hollow) root.dataset.hollow = "true";
  root.title = z.name;
  const d = el("span", "block h-3.5 w-3.5 shrink-0 rotate-45");
  d.dataset.diamond = "";
  d.dataset.fill = c.fill;
  d.style.backgroundColor = hollow ? "transparent" : c.fill;
  d.style.border = hollow ? `3px solid ${c.fill}` : `2px solid ${c.border}`;
  d.style.boxShadow = "0 0 0 1.5px #fff";
  const label = el(
    "span",
    `whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-semibold leading-tight shadow ring-1 group-hover:bg-gray-900 group-hover:text-white ${
      selected ? "bg-gray-900 text-white ring-gray-900" : "bg-white/95 text-gray-900 ring-gray-300"
    }`,
    zoneLabel(z),
  );
  root.append(d, label);
  if (onSelect) root.addEventListener("click", () => onSelect(z));
  else root.classList.add("pointer-events-none");
  return root;
}

/** 화면에서 겹치는 구역 라벨을 거른다: 선택한 것 > 진행 단계가 높은 것 > 위치가 정확한 것 */
function visibleZones(map: kakao.maps.Map, zones: Zone[], selectedId: string | null): Zone[] {
  const projection = map.getProjection();
  return cullLabels(zones, (z) => projection.containerPointFromCoords(new kakao.maps.LatLng(z.lat!, z.lng!)), {
    // 라벨 폭 추정(7px/자)에 맞춰 같은 길이의 자리표시 문자열을 넘긴다
    label: (z) => "x".repeat(Math.ceil(zoneLabelWidth(zoneLabel(z)) / 7)),
    weight: (z) => (z.zone_id === selectedId ? Infinity : (z.stage_order ?? 0) * 2 + (z.geo === "dong_approx" ? 0 : 1)),
  });
}

/** 정비사업 레이어: 단지 마커와 별개의 CustomOverlay 묶음. 갱신 때는 key·sig로 비교해 바뀐 것만 다시 만든다. */
export default function ZoneMarkers({ map, zones, bounds, interactive = true, selectedId = null, onSelect }: Props) {
  const overlays = useRef(new Map<string, { overlay: kakao.maps.CustomOverlay; sig: string }>());

  useEffect(() => {
    const select = interactive && onSelect ? onSelect : null;
    const shown = visibleZones(map, zones, selectedId);
    const current = overlays.current;
    const next = new Set(shown.map((z) => z.zone_id));
    for (const [key, o] of current) {
      if (!next.has(key)) {
        o.overlay.setMap(null);
        current.delete(key);
      }
    }
    for (const z of shown) {
      const selected = z.zone_id === selectedId;
      const sig = `${zoneLabel(z)}|${z.geo}|${selected}|${select ? 1 : 0}`;
      const existing = current.get(z.zone_id);
      if (existing?.sig === sig) continue;
      const content = build(z, selected, select);
      const zIndex = selected ? 10 : 0;
      if (existing) {
        existing.overlay.setContent(content);
        existing.overlay.setZIndex(zIndex);
        existing.sig = sig;
        continue;
      }
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(z.lat!, z.lng!),
        content,
        map,
        clickable: true,
        yAnchor: 0.5,
      });
      overlay.setZIndex(zIndex);
      current.set(z.zone_id, { overlay, sig });
    }
  }, [map, zones, bounds, interactive, selectedId, onSelect]);

  useEffect(() => {
    const current = overlays.current;
    return () => {
      for (const o of current.values()) o.overlay.setMap(null);
      current.clear();
    };
  }, [map]);

  return null;
}
