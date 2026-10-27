import { Suspense } from "react";
import MapView from "@/components/MapView";

export default function MapPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-81px)] w-full bg-gray-100 md:h-[calc(100dvh-53px)]" />}>
      <MapView />
    </Suspense>
  );
}
