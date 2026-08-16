import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import {
  deleteGuestById,
  deleteGuestsFiltered,
  guestSearchOrFilter,
} from "@/lib/admin-delete.server";
import {
  aggregateNamedCounts,
  type NamedCount,
  type StoreValueBucket,
} from "@/lib/admin-charts";
import {
  defaultRegistrationsFromDate,
  todayISODate,
  validateRegistration,
} from "@/lib/registration";

const GUEST_SELECT =
  "id, first_name, last_name, email, mobile, nationality, address_zone, transaction_date, transaction_value, receipt_image_path, receipt_image_url, created_at, company_id, companies(id, name)";

function csvEscape(value: unknown) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Normalize YYYY-MM-DD; reject garbage so PostgREST date filters stay safe. */
function parseDateParam(value: string | null, fallback: string) {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? fallback : value;
}

function parseOptionalNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type GuestListRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  nationality: string;
  address_zone: string;
  transaction_date: string;
  transaction_value: number | string | null;
  receipt_image_path: string | null;
  receipt_image_url: string | null;
  created_at: string;
  company_id: string | null;
  companies: { id?: string; name?: string } | null;
};

function applyGuestFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  opts: {
    from: string;
    to: string;
    storeId: string | null;
    q: string | null;
    nationality: string | null;
    zone: string | null;
    minValue: number | null;
    maxValue: number | null;
  },
) {
  let q = query
    .gte("transaction_date", opts.from)
    .lte("transaction_date", opts.to);

  if (opts.storeId) q = q.eq("company_id", opts.storeId);
  if (opts.nationality) q = q.eq("nationality", opts.nationality);
  if (opts.zone) q = q.eq("address_zone", opts.zone);
  if (opts.minValue != null) q = q.gte("transaction_value", opts.minValue);
  if (opts.maxValue != null) q = q.lte("transaction_value", opts.maxValue);

  const searchOr = opts.q ? guestSearchOrFilter(opts.q) : null;
  if (searchOr) q = q.or(searchOr);

  return q;
}

function mapRegistration(row: GuestListRow) {
  const store = row.companies;
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    mobile: row.mobile,
    nationality: row.nationality,
    address_zone: row.address_zone,
    transaction_date: row.transaction_date,
    transaction_value: Number(row.transaction_value || 0),
    receipt_image_path: row.receipt_image_path,
    receipt_image_url: row.receipt_image_url,
    store_id: row.company_id,
    store_name: store?.name ?? "Unassigned",
    created_at: row.created_at,
  };
}

function buildAggregates(
  registrations: ReturnType<typeof mapRegistration>[],
): {
  total_value: number;
  by_store: StoreValueBucket[];
  by_nationality: NamedCount[];
  by_zone: NamedCount[];
} {
  const storeMap = new Map<string, StoreValueBucket>();
  for (const row of registrations) {
    const key = row.store_id ?? row.store_name;
    const existing = storeMap.get(key) ?? {
      store_id: row.store_id,
      store_name: row.store_name,
      receipts: 0,
      transaction_value: 0,
    };
    existing.receipts += 1;
    existing.transaction_value += row.transaction_value;
    storeMap.set(key, existing);
  }

  const by_store = [...storeMap.values()].sort(
    (a, b) =>
      b.transaction_value - a.transaction_value ||
      b.receipts - a.receipts ||
      a.store_name.localeCompare(b.store_name),
  );

  return {
    total_value: registrations.reduce((s, r) => s + r.transaction_value, 0),
    by_store,
    by_nationality: aggregateNamedCounts(
      registrations.map((r) => r.nationality),
    ),
    by_zone: aggregateNamedCounts(registrations.map((r) => r.address_zone)),
  };
}

export const Route = createFileRoute("/api/admin/registrations")({
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
          const format = url.searchParams.get("format");
          const storeId = url.searchParams.get("store_id");
          const q = url.searchParams.get("q");
          const nationality = url.searchParams.get("nationality");
          const zone = url.searchParams.get("zone");
          const minValue = parseOptionalNumber(url.searchParams.get("min_value"));
          const maxValue = parseOptionalNumber(url.searchParams.get("max_value"));

          const filterOpts = {
            from,
            to,
            storeId: storeId || null,
            q: q?.trim() || null,
            nationality: nationality?.trim() || null,
            zone: zone?.trim() || null,
            minValue,
            maxValue,
          };

          let listQuery = applyGuestFilters(
            supabaseAdmin.from("guests").select(GUEST_SELECT),
            filterOpts,
          )
            .order("transaction_date", { ascending: false })
            .order("created_at", { ascending: false });

          // Facets from date (+ store) only so dropdowns stay populated while refining.
          let facetsQuery = supabaseAdmin
            .from("guests")
            .select("nationality, address_zone")
            .gte("transaction_date", from)
            .lte("transaction_date", to);
          if (storeId) facetsQuery = facetsQuery.eq("company_id", storeId);

          const [listResult, totalResult, facetsResult] = await Promise.all([
            listQuery,
            supabaseAdmin
              .from("guests")
              .select("id", { count: "exact", head: true }),
            facetsQuery,
          ]);

          if (listResult.error) return json({ error: listResult.error.message }, 500);
          if (totalResult.error) {
            return json({ error: totalResult.error.message }, 500);
          }
          if (facetsResult.error) {
            return json({ error: facetsResult.error.message }, 500);
          }

          const totalGuests = totalResult.count ?? 0;
          const registrations = ((listResult.data ?? []) as GuestListRow[]).map(
            mapRegistration,
          );
          const aggregates = buildAggregates(registrations);

          const nationalities = [
            ...new Set(
              (facetsResult.data ?? [])
                .map((r) => (r.nationality ?? "").trim())
                .filter(Boolean),
            ),
          ].sort((a, b) => a.localeCompare(b));
          const zones = [
            ...new Set(
              (facetsResult.data ?? [])
                .map((r) => (r.address_zone ?? "").trim())
                .filter(Boolean),
            ),
          ].sort((a, b) => a.localeCompare(b));

          if (format === "csv") {
            const header = [
              "Transaction Date",
              "First Name",
              "Last Name",
              "Email",
              "Mobile",
              "Nationality",
              "Address Zone",
              "Store Name",
              "Transaction Value",
              "Receipt URL",
              "Registered At",
            ];
            const lines = [
              header.join(","),
              ...registrations.map((r) =>
                [
                  r.transaction_date,
                  r.first_name,
                  r.last_name,
                  r.email,
                  r.mobile,
                  r.nationality,
                  r.address_zone,
                  r.store_name,
                  r.transaction_value,
                  r.receipt_image_url ?? "",
                  r.created_at,
                ]
                  .map(csvEscape)
                  .join(","),
              ),
            ];
            return new Response(lines.join("\n"), {
              status: 200,
              headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="registrations-${from}-to-${to}.csv"`,
              },
            });
          }

          return json({
            from,
            to,
            total_guests: totalGuests,
            filtered_count: registrations.length,
            registrations,
            aggregates,
            facets: {
              nationalities,
              zones,
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
      PUT: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const body = (await request.json()) as Partial<{
            id: string;
            first_name: string;
            last_name: string;
            email: string;
            mobile: string;
            nationality: string;
            address_zone: string;
            transaction_date: string;
            company_id: string;
            transaction_value: number | string;
          }>;

          const id = typeof body.id === "string" ? body.id.trim() : "";
          if (!id) return json({ error: "Registration id is required" }, 400);

          const { errors, data } = validateRegistration({
            ...body,
            transaction_value:
              body.transaction_value === undefined
                ? undefined
                : Number(body.transaction_value),
          });
          if (errors.length) return json({ error: errors[0], errors }, 400);

          const { data: store, error: storeErr } = await supabaseAdmin
            .from("companies")
            .select("id")
            .eq("id", data.company_id)
            .maybeSingle();
          if (storeErr) return json({ error: storeErr.message }, 500);
          if (!store) return json({ error: "Store not found" }, 400);

          const { data: updated, error } = await supabaseAdmin
            .from("guests")
            .update({
              first_name: data.first_name,
              last_name: data.last_name,
              email: data.email,
              mobile: data.mobile,
              nationality: data.nationality,
              address_zone: data.address_zone,
              transaction_date: data.transaction_date,
              company_id: data.company_id,
              transaction_value: data.transaction_value,
            })
            .eq("id", id)
            .select(GUEST_SELECT)
            .maybeSingle();

          if (error) return json({ error: error.message }, 500);
          if (!updated) return json({ error: "Registration not found" }, 404);

          return json({
            ok: true,
            registration: mapRegistration(updated as GuestListRow),
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
      DELETE: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          const scope = url.searchParams.get("scope"); // "filter" | "all"

          if (id) {
            const result = await deleteGuestById(id);
            if (!result.deleted) {
              return json({ error: "Registration not found" }, 404);
            }
            return json({ ok: true, ...result });
          }

          if (scope === "all") {
            const result = await deleteGuestsFiltered({ all: true });
            return json({ ok: true, ...result });
          }

          if (scope === "filter") {
            const today = todayISODate();
            const from = parseDateParam(
              url.searchParams.get("from"),
              defaultRegistrationsFromDate(),
            );
            const to = parseDateParam(url.searchParams.get("to"), today);
            const storeId = url.searchParams.get("store_id");
            const q = url.searchParams.get("q");
            const nationality = url.searchParams.get("nationality");
            const zone = url.searchParams.get("zone");
            const minValue = parseOptionalNumber(
              url.searchParams.get("min_value"),
            );
            const maxValue = parseOptionalNumber(
              url.searchParams.get("max_value"),
            );
            const result = await deleteGuestsFiltered({
              from,
              to,
              storeId: storeId || null,
              q: q?.trim() || null,
              nationality: nationality?.trim() || null,
              zone: zone?.trim() || null,
              minValue,
              maxValue,
            });
            return json({ ok: true, from, to, ...result });
          }

          return json(
            { error: "Provide id, or scope=filter / scope=all" },
            400,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});
