import type { AptRent, AptTrade, MetaFile, RegionFile, SearchIndexRow, StatsFile } from "./types";

function dataUrl(): string {
  const url = process.env.NEXT_PUBLIC_DATA_URL;
  if (!url) throw new Error("NEXT_PUBLIC_DATA_URL is not set");
  return url.replace(/\/+$/, "");
}

/** 404 → null, 그 외 비정상 응답은 throw. 기본 ISR 10분. */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${dataUrl()}${path}`, { next: { revalidate: 600 }, ...init } as RequestInit);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const fetchAptTrade = (id: number, init?: RequestInit) =>
  fetchJson<AptTrade>(`/v1/apt/${id}/trade.json`, init);

export const fetchAptRent = (id: number, init?: RequestInit) =>
  fetchJson<AptRent>(`/v1/apt/${id}/rent.json`, init);

export const fetchRegion = (code: string, init?: RequestInit) =>
  fetchJson<RegionFile>(`/v1/region/${code}.json`, init);

export const fetchStats = (init?: RequestInit) => fetchJson<StatsFile>("/v1/stats/summary.json", init);

export const fetchMeta = (init?: RequestInit) => fetchJson<MetaFile>("/v1/meta.json", init);

let searchIndexPromise: Promise<SearchIndexRow[]> | null = null;

export function fetchSearchIndex(): Promise<SearchIndexRow[]> {
  if (!searchIndexPromise) {
    searchIndexPromise = fetchJson<SearchIndexRow[]>("/v1/search/index.json").then((rows) => {
      if (!rows) throw new Error("search index not found");
      return rows;
    });
    searchIndexPromise.catch(() => {
      searchIndexPromise = null;
    });
  }
  return searchIndexPromise;
}
