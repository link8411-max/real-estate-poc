import { Clock, Flame, Percent, TrendingDown } from "lucide-react";
import type { Metrics } from "@/lib/types";

interface Badge {
  label: string;
  className: string;
  Icon: typeof Flame;
}

function badgesFor(m: Metrics): Badge[] {
  const out: Badge[] = [];
  if (m.bargain_percent != null && m.bargain_percent <= -5)
    out.push({ label: "급매", className: "bg-red-100 text-red-700", Icon: Flame });
  if (m.recovery_rate != null && m.recovery_rate < 80)
    out.push({
      label: `전고점 대비 -${Math.round(100 - m.recovery_rate)}%`,
      className: "bg-blue-100 text-blue-700",
      Icon: TrendingDown,
    });
  if (m.days_since_last_tx != null && m.days_since_last_tx >= 180)
    out.push({ label: `거래 없음 ${m.days_since_last_tx}일`, className: "bg-gray-100 text-gray-600", Icon: Clock });
  if (m.jeonse_ratio != null)
    out.push({ label: `전세가율 ${Math.round(m.jeonse_ratio)}%`, className: "bg-green-100 text-green-700", Icon: Percent });
  return out;
}

export default function InsightBadges({ metrics }: { metrics: Metrics }) {
  const badges = badgesFor(metrics);
  if (badges.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {badges.map(({ label, className, Icon }) => (
        <li key={label} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${className}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
