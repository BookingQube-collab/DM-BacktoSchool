import { createFileRoute } from "@tanstack/react-router";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { json } from "@/lib/admin-auth.server";

import { uploadPrivateImage } from "@/lib/image-upload";

import { validateRegistration, parseReceiptImage } from "@/lib/registration";
import { isVirtualKeyboardEnabled } from "@/lib/settings.server";

import {
  aggregateGuestCounts,
  pickFeaturedBySales,
  pickTopBrandFallback,
  searchStores,
  type StoreSummary,
} from "@/lib/stores.server";

async function loadActiveStores() {
  const { data, error } = await supabaseAdmin

    .from("companies")

    .select("id, name, logo_url")

    .eq("is_active", true)

    .order("sort_order", { ascending: true })

    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []) as StoreSummary[];
}

export const Route = createFileRoute("/api/register")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);

          const q = url.searchParams.get("q")?.trim() ?? "";

          const stores = await loadActiveStores();

          if (q) {
            return json({ stores: searchStores(stores, q) });
          }

          const { data: guests, error: guestErr } = await supabaseAdmin

            .from("guests")

            .select("company_id, transaction_value")

            .not("company_id", "is", null);

          if (guestErr) return json({ error: guestErr.message }, 500);

          const counts = aggregateGuestCounts(guests ?? []);

          const bySales = pickFeaturedBySales(stores, counts);

          const featured = bySales.length > 0 ? bySales : pickTopBrandFallback(stores);
          const featuredIds = new Set(featured.map((s) => s.id));
          const orderedStores = [
            ...featured,
            ...stores.filter((s) => !featuredIds.has(s.id)),
          ];

          return json({
            stores: orderedStores,

            featured,

            featured_source: bySales.length > 0 ? "sales" : "top_brands",

            total_stores: stores.length,

            virtual_keyboard_enabled: await isVirtualKeyboardEnabled(),
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);

          return json({ error: message }, 500);
        }
      },

      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;

          const { errors, data } = validateRegistration({
            first_name: String(body.first_name ?? ""),

            last_name: String(body.last_name ?? ""),

            email: String(body.email ?? ""),

            mobile: String(body.mobile ?? ""),

            nationality: String(body.nationality ?? ""),

            address_zone: String(body.address_zone ?? ""),

            transaction_date: String(body.transaction_date ?? ""),

            company_id: String(body.company_id ?? ""),

            transaction_value: Number(body.transaction_value),
          });

          if (errors.length) return json({ error: errors[0], errors }, 400);

          const receipt = parseReceiptImage(
            body.receipt_image ?? body.receipt_image_base64 ?? body.bill_image,
          );

          if (receipt.error || !receipt.bytes || !receipt.contentType) {
            return json({ error: receipt.error || "Bill photo is required" }, 400);
          }

          const { data: store, error: storeErr } = await supabaseAdmin

            .from("companies")

            .select("id, name, is_active")

            .eq("id", data.company_id)

            .maybeSingle();

          if (storeErr) return json({ error: storeErr.message }, 500);

          if (!store || !store.is_active) {
            return json({ error: "Selected store is not available" }, 400);
          }

          const uploaded = await uploadPrivateImage(
            "receipts",

            "receipt",

            receipt.bytes,

            receipt.contentType,
          );

          if ("error" in uploaded) {
            return json(
              { error: `Receipt upload failed: ${uploaded.error}` },

              502,
            );
          }

          const { data: guest, error } = await supabaseAdmin

            .from("guests")

            .insert({
              first_name: data.first_name,

              last_name: data.last_name,

              email: data.email,

              mobile: data.mobile,

              nationality: data.nationality,

              address_zone: data.address_zone,

              transaction_date: data.transaction_date,

              company_id: data.company_id,

              transaction_value: data.transaction_value,

              receipt_image_path: uploaded.path,

              receipt_image_url: uploaded.url,
            })

            .select("id")

            .single();

          if (error) return json({ error: error.message }, 500);

          return json(
            {
              ok: true,

              id: guest.id,

              store: store.name,

              receipt_image_url: uploaded.url,
            },

            201,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);

          return json({ error: message }, 500);
        }
      },
    },
  },
});
