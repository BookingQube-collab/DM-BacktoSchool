/** Shared helpers for admin analytics charts. */

import { BOOTH_TIME_ZONE } from "@/lib/registration";

export type NamedCount = {
  name: string;
  count: number;
};

export type DayBucket = {
  date: string;
  count: number;
  transaction_value?: number;
};

export type StoreValueBucket = {
  store_id: string | null;
  store_name: string;
  receipts: number;
  transaction_value: number;
};

/** Coral / amber / indigo palette matching admin dark theme. */
export const ADMIN_CHART_COLORS = [
  "oklch(0.72 0.19 25)",
  "oklch(0.82 0.17 75)",
  "oklch(0.62 0.12 285)",
  "oklch(0.68 0.14 40)",
  "oklch(0.58 0.1 200)",
  "oklch(0.7 0.11 140)",
  "oklch(0.65 0.16 350)",
  "oklch(0.6 0.08 80)",
] as const;

export function chartColor(index: number) {
  return ADMIN_CHART_COLORS[index % ADMIN_CHART_COLORS.length]!;
}

export function aggregateNamedCounts(
  values: Array<string | null | undefined>,
  emptyLabel = "Unknown",
): NamedCount[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const name = (raw ?? "").trim() || emptyLabel;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function aggregateByDay(
  dates: string[],
  values?: number[],
): DayBucket[] {
  const map = new Map<string, DayBucket>();
  dates.forEach((date, i) => {
    const key = date.slice(0, 10);
    const existing = map.get(key) ?? {
      date: key,
      count: 0,
      transaction_value: 0,
    };
    existing.count += 1;
    if (values) {
      existing.transaction_value =
        (existing.transaction_value ?? 0) + Number(values[i] || 0);
    }
    map.set(key, existing);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function fillDayRange(
  from: string,
  to: string,
  buckets: DayBucket[],
): DayBucket[] {
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  const out: DayBucket[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return buckets;
  }
  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const key = d.toISOString().slice(0, 10);
    out.push(
      byDate.get(key) ?? { date: key, count: 0, transaction_value: 0 },
    );
  }
  return out;
}

/** Calendar YYYY-MM-DD in booth timezone (for timestamptz → day buckets). */
export function boothDateKey(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BOOTH_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function shortDateLabel(isoDate: string) {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function truncateLabel(label: string, max = 18) {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
