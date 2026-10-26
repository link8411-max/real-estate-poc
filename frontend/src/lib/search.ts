import type { SearchIndexRow } from "./types";

const CHOSUNG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

export function toChosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c >= 0xac00 && c <= 0xd7a3 ? CHOSUNG[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return out;
}

const strip = (s: string) => s.replace(/\s+/g, "");
const ONLY_JAMO = /^[ㄱ-ㅎ]+$/;

export function searchIndex(rows: SearchIndexRow[], q: string, limit = 30): SearchIndexRow[] {
  const query = strip(q);
  if (!query) return [];
  const jamo = ONLY_JAMO.test(query);
  const scored: { row: SearchIndexRow; rank: number; len: number }[] = [];
  for (const row of rows) {
    const name = strip(row[1]);
    const dong = strip(row[2]);
    let rank = 0;
    if (name.startsWith(query)) rank = 1;
    else if (name.includes(query)) rank = 2;
    else if (dong.includes(query)) rank = 3;
    else if (jamo && toChosung(name).includes(query)) rank = 4;
    if (rank) scored.push({ row, rank, len: name.length });
  }
  scored.sort((a, b) => a.rank - b.rank || a.len - b.len || a.row[0] - b.row[0]);
  return scored.slice(0, limit).map((s) => s.row);
}
