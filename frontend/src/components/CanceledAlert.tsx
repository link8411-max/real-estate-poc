export default function CanceledAlert({ total, highs }: { total: number; highs: number }) {
  if (total === 0) return null;
  return (
    <a href="#canceled" className="block rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      최근 1년 취소된 거래 {total}건{highs > 0 ? ` · 그중 신고가였던 거래 ${highs}건` : ""}
    </a>
  );
}
