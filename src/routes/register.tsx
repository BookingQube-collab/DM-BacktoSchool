import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BillCapture } from "@/components/BillCapture";
import { NationalityPicker } from "@/components/NationalityPicker";
import { PhoneIsdInput } from "@/components/PhoneIsdInput";
import { StorePicker, type Store } from "@/components/StorePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayISODate } from "@/lib/registration";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

type Step = 1 | 2 | 3;

const STEP_KEYS = [
  { n: 1 as const, key: "registerStep1" as const },
  { n: 2 as const, key: "registerStep2" as const },
  { n: 3 as const, key: "registerStep3" as const },
];

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  mobile: "",
  nationality: "",
  address_zone: "",
  transaction_date: todayISODate(),
  company_id: "",
  transaction_value: "",
};

function RegisterPage() {
  const { t } = useI18n();
  const [featured, setFeatured] = useState<Store[]>([]);
  const [featuredSource, setFeaturedSource] = useState<"sales" | "top_brands">(
    "top_brands",
  );
  const [storesReady, setStoresReady] = useState(false);
  const [hasStores, setHasStores] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** Remount phone ISD control after each successful registration. */
  const [phoneKey, setPhoneKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/register");
      const data = await res.json();
      if (cancelled) return;
      if (res.ok) {
        setFeatured((data.featured as Store[]) ?? []);
        setFeaturedSource(
          data.featured_source === "sales" ? "sales" : "top_brands",
        );
        setHasStores(Number(data.total_stores) > 0);
        setStoresReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForNextGuest() {
    setForm({ ...emptyForm, transaction_date: todayISODate() });
    setReceiptImage(null);
    setStep(1);
    setPhoneKey((k) => k + 1);
  }

  function validateStep(current: Step): string | null {
    if (current === 1) {
      if (!form.company_id) return t("registerErrSelectStore");
      const value = Number(form.transaction_value);
      if (!Number.isFinite(value) || value < 0) {
        return t("registerErrTxnValue");
      }
      return null;
    }
    if (current === 2) {
      if (!receiptImage) return t("registerErrBillPhoto");
      return null;
    }
    if (!form.first_name.trim()) return t("registerErrFirstName");
    if (!form.last_name.trim()) return t("registerErrLastName");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return t("registerErrEmail");
    }
    if (form.mobile.replace(/\D/g, "").length < 8) {
      return t("registerErrMobile");
    }
    if (!form.nationality) return t("registerErrNationality");
    if (!form.address_zone.trim()) return t("registerErrZone");
    if (!form.transaction_date) return t("registerErrDate");
    return null;
  }

  function goNext() {
    const msg = validateStep(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setSuccess(null);
    setStep((s) => Math.min(3, s + 1) as Step);
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function onRegister() {
    const msg = validateStep(3);
    if (msg) {
      setError(msg);
      return;
    }
    if (!receiptImage) {
      setError(t("registerErrBillRequired"));
      setStep(2);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          transaction_value: Number(form.transaction_value),
          receipt_image: receiptImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("registerErrFailed"));
        return;
      }
      setSuccess(t("registerSuccess", { store: data.store }));
      resetForNextGuest();
    } catch {
      setError(t("commonCouldNotReachServer"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-2xl">
        <img
          src="/smart-start-logo.png"
          alt="Smart Start"
          className="mb-5 h-auto w-[200px] max-w-full object-contain drop-shadow-lg md:w-[240px]"
        />
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-3xl font-bold md:text-4xl">
              {t("registerTitle")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              {t("registerSubtitle")}
            </p>
          </div>
          <Link
            to="/"
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            {t("registerPhotoBooth")}
          </Link>
        </div>

        <div className="mb-5 rounded-3xl border border-border bg-secondary/45 p-4 shadow-xl backdrop-blur md:p-5">
          <p className="mb-3 text-sm font-semibold text-muted-foreground">
            {t("registerStepOf", {
              step,
              label: t(STEP_KEYS[step - 1].key),
            })}
          </p>
          <div className="flex gap-2">
            {STEP_KEYS.map((s) => (
              <div key={s.n} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div
                  className={`h-2 rounded-full transition-colors ${
                    s.n <= step
                      ? "bg-gradient-to-r from-primary to-accent"
                      : "bg-border"
                  }`}
                />
                <span
                  className={`truncate text-xs md:text-sm ${
                    s.n === step
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {t(s.key)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 rounded-3xl border border-border bg-secondary/45 p-5 shadow-xl backdrop-blur md:p-8">
          {step === 1 ? (
            <div className="space-y-5">
              <StorePicker
                featured={featured}
                featuredSource={featuredSource}
                selectedId={form.company_id}
                onSelect={(id) => update("company_id", id)}
                loading={!storesReady}
              />
              <div className="space-y-2">
                <Label htmlFor="transaction_value" className="text-base">
                  {t("registerTxnValue")}
                </Label>
                <Input
                  id="transaction_value"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.transaction_value}
                  onChange={(e) => update("transaction_value", e.target.value)}
                  className="h-12 rounded-xl px-4 text-base"
                  placeholder={t("registerTxnPlaceholder")}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <BillCapture
              previewUrl={receiptImage}
              onCaptured={setReceiptImage}
              onClear={() => setReceiptImage(null)}
            />
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first_name" className="text-base">
                    {t("registerFirstName")}
                  </Label>
                  <Input
                    id="first_name"
                    value={form.first_name}
                    onChange={(e) => update("first_name", e.target.value)}
                    autoComplete="given-name"
                    className="h-12 rounded-xl px-4 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name" className="text-base">
                    {t("registerLastName")}
                  </Label>
                  <Input
                    id="last_name"
                    value={form.last_name}
                    onChange={(e) => update("last_name", e.target.value)}
                    autoComplete="family-name"
                    className="h-12 rounded-xl px-4 text-base"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-base">
                    {t("registerEmail")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    autoComplete="email"
                    className="h-12 rounded-xl px-4 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-base">
                    {t("registerMobile")}
                  </Label>
                  <PhoneIsdInput
                    key={phoneKey}
                    id="mobile"
                    value={form.mobile}
                    onChange={(full) => update("mobile", full)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nationality" className="text-base">
                    {t("commonNationality")}
                  </Label>
                  <NationalityPicker
                    id="nationality"
                    value={form.nationality}
                    onChange={(name) => update("nationality", name)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_zone" className="text-base">
                    {t("registerAddressZone")}
                  </Label>
                  <Input
                    id="address_zone"
                    value={form.address_zone}
                    onChange={(e) => update("address_zone", e.target.value)}
                    placeholder={t("registerZonePlaceholder")}
                    className="h-12 rounded-xl px-4 text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transaction_date" className="text-base">
                  {t("registerTxnDate")}
                </Label>
                <Input
                  id="transaction_date"
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => update("transaction_date", e.target.value)}
                  className="h-12 rounded-xl px-4 text-base"
                />
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-accent">{success}</p> : null}

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            {step > 1 ? (
              <Button
                type="button"
                variant="secondary"
                className="h-12 flex-1 text-base"
                onClick={goBack}
                disabled={loading}
              >
                {t("commonBack")}
              </Button>
            ) : null}
            {step < 3 ? (
              <Button
                type="button"
                size="lg"
                className="h-12 flex-1 text-base"
                onClick={goNext}
                disabled={!storesReady || !hasStores}
              >
                {t("commonContinue")}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-12 flex-1 text-base"
                onClick={() => void onRegister()}
                disabled={loading || !storesReady || !hasStores}
              >
                {loading ? t("commonSaving") : t("registerRegister")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
