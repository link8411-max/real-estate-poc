import type { Metadata } from "next";
import RegionBrowser from "@/components/RegionBrowser";
import { fetchRegion, fetchStats } from "@/lib/data";
import { CITIES } from "@/lib/regions";

export const metadata: Metadata = { title: "지역 탐색" };

type Props = { searchParams: Promise<{ city?: string; region?: string }> };

export default async function BrowsePage({ searchParams }: Props) {
  const { city: cityParam, region: code } = await searchParams;
  const stats = await fetchStats();
  const regions = stats?.regions ?? [];
  const selected = regions.find((r) => r.code === code);
  const city = selected?.city ?? (CITIES.find((c) => c === cityParam) || CITIES[0]);
  const region = selected ? await fetchRegion(selected.code) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">지역 탐색</h1>
      <RegionBrowser regions={regions} city={city} region={region} />
    </main>
  );
}
