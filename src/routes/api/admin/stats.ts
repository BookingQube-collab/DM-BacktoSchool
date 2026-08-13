import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import {
  aggregateByDay,
  aggregateNamedCounts,
  boothDateKey,
  fillDayRange,
  type DayBucket,
  type NamedCount,
  type StoreValueBucket,
} from "@/lib/admin-charts";
import { getFreepikApiKey } from "@/lib/settings.server";
import {
  defaultRegistrationsFromDate,
  todayISODate,
} from "@/lib/registration";

type StoreAgg = StoreValueBucket;

function parseDateParam(value: string | null, fallback: string) {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? fallback : value;
}

function dayStartIso(date: string) {
  return `${date}T00:00:00.000+03:00`;
}

function dayEndIso(date: string) {
  return `${date}T23:59:59.999+03:00`;
}

export const Route = createFileRoute("/api/admin/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const url = new URL(request.url);
          const today = todayISODate();
          const from = parseDateParam(
            url.searchParams.get("from"),
            defaultRegistrationsFromDate(),
          );
          const to = parseDateParam(url.searchParams.get("to"), today);

          const [companies, guestsAll, sessions, freepik, rangeRows, photoRows] =
            await Promise.all([
              supabaseAdmin
                .from("companies")
                .select("id, name, is_active, logo_url"),
              supabaseAdmin
                .from("guests")
                .select("id", { count: "exact", head: true }),
              supabaseAdmin
                .from("photo_sessions")
                .select("id", { count: "exact", head: true }),
              getFreepikApiKey(),
              supabaseAdmin
                .from("guests")
                .select(
                  "id, transaction_value, transaction_date, nationality, address_zone, company_id, companies(name)",
                )
                .gte("transaction_date", from)
                .lte("transaction_date", to),
              supabaseAdmin
                .from("photo_sessions")
                .select("profession_title, created_at")
                .gte("created_at", dayStartIso(from))
                .lte("created_at", dayEndIso(to)),
            ]);

          if (companies.error) return json({ error: companies.error.message }, 500);
          if (guestsAll.error) return json({ error: guestsAll.error.message }, 500);
          if (sessions.error) return json({ error: sessions.error.message }, 500);
          if (rangeRows.error) return json({ error: rangeRows.error.message }, 500);
          if (photoRows.error) return json({ error: photoRows.error.message }, 500);

          const rows = rangeRows.data ?? [];
          const dailyRegistrations = rows.length;
          const dailyTransactionValue = rows.reduce(
            (sum, row) => sum + Number(row.transaction_value || 0),
            0,
          );

          const byStoreMap = new Map<string, StoreAgg>();
          for (const company of companies.data ?? []) {
            byStoreMap.set(company.id, {
              store_id: company.id,
              store_name: company.name,
              receipts: 0,
              transaction_value: 0,
            });
          }

          for (const row of rows) {
            const storeId = row.company_id ?? "unknown";
            const companyRel = row.companies as { name?: string } | null;
            const existing = byStoreMap.get(storeId) ?? {
              store_id: row.company_id,
              store_name: companyRel?.name || "Unassigned",
              receipts: 0,
              transaction_value: 0,
            };
            existing.receipts += 1;
            existing.transaction_value += Number(row.transaction_value || 0);
            byStoreMap.set(storeId, existing);
          }

          const byStore = [...byStoreMap.values()].sort(
            (a, b) =>
              b.transaction_value - a.transaction_value ||
              b.receipts - a.receipts ||
              a.store_name.localeCompare(b.store_name),
          );
          const withReceipts = [...byStore]
            .filter((s) => s.receipts > 0)
            .sort(
              (a, b) =>
                b.receipts - a.receipts ||
                b.transaction_value - a.transaction_value ||
                a.store_name.localeCompare(b.store_name),
            );
          const highestStore = withReceipts[0] ?? null;
          const lowestStore =
            withReceipts.length > 0
              ? withReceipts[withReceipts.length - 1]
              : null;
          const topStores = byStore
            .filter((s) => s.receipts > 0)
            .slice(0, 10);

          const byDayRaw = aggregateByDay(
            rows.map((r) => String(r.transaction_date)),
            rows.map((r) => Number(r.transaction_value || 0)),
          );
          const by_day: DayBucket[] = fillDayRange(from, to, byDayRaw);

          const by_nationality: NamedCount[] = aggregateNamedCounts(
            rows.map((r) => r.nationality),
            "Unknown",
          );
          const by_zone: NamedCount[] = aggregateNamedCounts(
            rows.map((r) => r.address_zone),
            "Unknown",
          );

          const photos = photoRows.data ?? [];
          const by_profession: NamedCount[] = aggregateNamedCounts(
            photos.map((p) => p.profession_title),
            "Unknown",
          );
          const photosByDayRaw = aggregateByDay(
            photos.map((p) => boothDateKey(String(p.created_at))),
          );
          const photos_by_day: DayBucket[] = fillDayRange(
            from,
            to,
            photosByDayRaw,
          );

          const companyList = companies.data ?? [];
          const stores_with_logo = companyList.filter((c) =>
            Boolean(c.logo_url),
          ).length;

          return json({
            from,
            to,
            companies: companyList.length,
            guests: guestsAll.count ?? 0,
            photo_sessions: sessions.count ?? 0,
            freepik_configured: Boolean(freepik),
            daily_registrations: dailyRegistrations,
            daily_transaction_value: dailyTransactionValue,
            by_store: byStore,
            top_stores: topStores,
            highest_store: highestStore,
            lowest_store: lowestStore,
            by_day,
            by_nationality,
            by_zone,
            by_profession,
            photos_by_day,
            stores_with_logo,
            stores_without_logo: Math.max(
              0,
              companyList.length - stores_with_logo,
            ),
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});
