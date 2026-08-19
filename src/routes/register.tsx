import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BillCapture } from "@/components/BillCapture";
import { NationalityPicker } from "@/components/NationalityPicker";
import { PhoneIsdInput } from "@/components/PhoneIsdInput";
import { SearchableSelect } from "@/components/SearchableSelect";
import { StorePicker, type Store } from "@/components/StorePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  VirtualKeyboardProvider,
  useVirtualKeyboard,
  useVkFieldProps,
} from "@/components/VirtualKeyboard";
import { QATAR_AREA_OPTIONS } from "@/lib/qatar-areas";
import { MIN_TRANSACTION_VALUE, todayISODate } from "@/lib/registration";
import { cn } from "@/lib/utils";
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
  const [vkEnabled, setVkEnabled] = useState(false);
  return (
    <VirtualKeyboardProvider enabled={vkEnabled}>
      <RegisterForm onVkEnabled={setVkEnabled} />
    </VirtualKeyboardProvider>
  );
}

function RegisterForm({ onVkEnabled }: { onVkEnabled: (enabled: boolean) => void }) {
  const { t } = useI18n();
  const vk = useVirtualKeyboard();
  const dismissKeyboard = vk.dismiss;
  const [featured, setFeatured] = useState<Store[]>([]);
  const [featuredSource, setFeaturedSource] = useState<"sales" | "top_brands">("top_brands");
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

  const txnVk = useVkFieldProps({
    id: "transaction_value",
    mode: "decimal",
    value: form.transaction_value,
    onChange: (value) => update("transaction_value", value),
  });
  const firstNameVk = useVkFieldProps({
    id: "first_name",
    mode: "name",
    value: form.first_name,
    onChange: (value) => update("first_name", value),
  });
  const lastNameVk = useVkFieldProps({
    id: "last_name",
    mode: "name",
    value: form.last_name,
    onChange: (value) => update("last_name", value),
  });
  const emailVk = useVkFieldProps({
    id: "email",
    mode: "email",
    value: form.email,
    onChange: (value) => update("email", value),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/register");
      const data = await res.json();
      if (cancelled) return;
      if (res.ok) {
        setFeatured((data.featured as Store[]) ?? []);
        setFeaturedSource(data.featured_source === "sales" ? "sales" : "top_brands");
        setHasStores(Number(data.total_stores) > 0);
        setStoresReady(true);
        onVkEnabled(Boolean(data.virtual_keyboard_enabled));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onVkEnabled]);

  useEffect(() => {
    dismissKeyboard();
  }, [step, dismissKeyboard]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForNextGuest() {
    setForm({ ...emptyForm, transaction_date: todayISODate() });
    setReceiptImage(null);
    setStep(1);
    setPhoneKey((k) => k + 1);
    vk.dismiss();
  }

  function validateStep(current: Step): string | null {
    if (current === 1) {
      if (!form.company_id) return t("registerErrSelectStore");
      const value = Number(form.transaction_value);
      if (!form.transaction_value.trim() || !Number.isFinite(value) || value < 0) {
        return t("registerErrTxnValue");
      }
      if (value < MIN_TRANSACTION_VALUE) {
        return t("registerErrTxnMin", { min: MIN_TRANSACTION_VALUE });
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
    vk.dismiss();
    setStep((s) => Math.min(3, s + 1) as Step);
  }

  function goBack() {
    setError(null);
    vk.dismiss();
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

  const fieldClass =
    "h-12 scroll-mt-3 scroll-mb-[var(--vk-height,8rem)] rounded-xl px-4 text-base landscape:h-11 data-[vk-active=true]:ring-2 data-[vk-active=true]:ring-accent";
  const labelClass = "text-base landscape:text-sm";
  const fieldWrapClass = "space-y-2 landscape:space-y-1";

  return (
    <div
      data-register-page
      className={cn(
        "relative h-dvh max-h-dvh overflow-x-hidden overflow-y-scroll overscroll-y-contain text-foreground",
        "px-4 pt-12 pb-8 md:px-6",
        "landscape:flex landscape:flex-col landscape:px-5 landscape:pt-3 landscape:pb-2",
        vk.activeId && "pb-[calc(var(--vk-height,18rem)+1rem)] landscape:pb-[calc(var(--vk-height,16rem)+0.75rem)]",
      )}
    >
      <div className="mx-auto w-full min-w-0 max-w-2xl landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-col landscape:max-w-6xl">
        <div className="mb-6 landscape:mb-2 landscape:flex landscape:items-center landscape:gap-4">
          <img
            src="/smart-start-logo.png"
            alt="Smart Start"
            className="mb-5 h-auto w-[200px] max-w-full object-contain drop-shadow-lg md:w-[240px] landscape:mb-0 landscape:w-[96px] md:landscape:w-[108px]"
          />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-4 landscape:items-center">
            <div className="min-w-0">
              <p className="font-display text-3xl font-bold md:text-4xl landscape:text-xl md:landscape:text-2xl">
                {t("registerTitle")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground md:text-base landscape:hidden">
                {t("registerSubtitle")}
              </p>
            </div>
            <Link
              to="/"
              className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary landscape:py-1.5"
            >
              {t("registerPhotoBooth")}
            </Link>
          </div>
        </div>

        <div className="mb-5 rounded-3xl border border-border bg-secondary/45 p-4 shadow-xl backdrop-blur md:p-5 landscape:mb-2 landscape:rounded-2xl landscape:p-2.5 md:landscape:p-3">
          <p className="mb-3 text-sm font-semibold text-muted-foreground landscape:mb-1.5 landscape:text-xs">
            {t("registerStepOf", {
              step,
              label: t(STEP_KEYS[step - 1].key),
            })}
          </p>
          <div className="flex gap-2">
            {STEP_KEYS.map((s) => (
              <div key={s.n} className="flex min-w-0 flex-1 flex-col gap-1.5 landscape:gap-1">
                <div
                  className={`h-2 rounded-full transition-colors landscape:h-1.5 ${
                    s.n <= step ? "bg-gradient-to-r from-primary to-accent" : "bg-border"
                  }`}
                />
                <span
                  className={`truncate text-xs md:text-sm landscape:hidden ${
                    s.n === step ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t(s.key)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-5 rounded-3xl border border-border bg-secondary/45 p-5 shadow-xl backdrop-blur md:p-8 landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-col landscape:gap-2 landscape:space-y-0 landscape:rounded-2xl landscape:p-3 md:landscape:p-3.5">
          {step === 1 ? (
            <div className="min-w-0 w-full space-y-5 landscape:grid landscape:min-h-0 landscape:flex-1 landscape:grid-cols-1 landscape:gap-3 landscape:space-y-0 lg:landscape:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:landscape:items-start">
              <StorePicker
                featured={featured}
                featuredSource={featuredSource}
                selectedId={form.company_id}
                onSelect={(id) => update("company_id", id)}
                loading={!storesReady}
              />
              <div className={cn(fieldWrapClass, "min-w-0")}>
                <Label htmlFor="transaction_value" className={labelClass}>
                  {t("registerTxnValue")}
                </Label>
                <Input
                  id="transaction_value"
                  type={vk.enabled ? "text" : "number"}
                  min={MIN_TRANSACTION_VALUE}
                  step="0.01"
                  inputMode={vk.enabled ? "none" : "decimal"}
                  value={form.transaction_value}
                  onChange={(e) => update("transaction_value", e.target.value)}
                  className={fieldClass}
                  placeholder={t("registerTxnPlaceholder")}
                  {...txnVk}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="landscape:min-h-0 landscape:flex-1">
              <BillCapture
                previewUrl={receiptImage}
                onCaptured={setReceiptImage}
                onClear={() => setReceiptImage(null)}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4 sm:grid-cols-2 landscape:min-h-0 landscape:flex-1 landscape:grid-cols-3 landscape:content-start landscape:gap-2.5">
              <div className={fieldWrapClass}>
                <Label htmlFor="first_name" className={labelClass}>
                  {t("registerFirstName")}
                </Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => update("first_name", e.target.value)}
                  autoComplete="given-name"
                  className={fieldClass}
                  {...firstNameVk}
                />
              </div>
              <div className={fieldWrapClass}>
                <Label htmlFor="last_name" className={labelClass}>
                  {t("registerLastName")}
                </Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => update("last_name", e.target.value)}
                  autoComplete="family-name"
                  className={fieldClass}
                  {...lastNameVk}
                />
              </div>
              <div className={fieldWrapClass}>
                <Label htmlFor="email" className={labelClass}>
                  {t("registerEmail")}
                </Label>
                <Input
                  id="email"
                  type={vk.enabled ? "text" : "email"}
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  autoComplete="email"
                  className={fieldClass}
                  {...emailVk}
                />
              </div>
              <div className={fieldWrapClass}>
                <Label htmlFor="mobile" className={labelClass}>
                  {t("registerMobile")}
                </Label>
                <PhoneIsdInput
                  key={phoneKey}
                  id="mobile"
                  value={form.mobile}
                  onChange={(full) => update("mobile", full)}
                />
              </div>
              <div className={fieldWrapClass}>
                <Label htmlFor="nationality" className={labelClass}>
                  {t("commonNationality")}
                </Label>
                <NationalityPicker
                  id="nationality"
                  value={form.nationality}
                  onChange={(name) => update("nationality", name)}
                />
              </div>
              <div className={fieldWrapClass}>
                <Label htmlFor="address_zone" className={labelClass}>
                  {t("registerAddressZone")}
                </Label>
                <SearchableSelect
                  id="address_zone"
                  value={form.address_zone}
                  onChange={(area) => update("address_zone", area)}
                  options={QATAR_AREA_OPTIONS}
                  placeholder={t("registerSelectArea")}
                  searchPlaceholder={t("registerSearchArea")}
                  emptyText={t("registerNoArea")}
                />
              </div>
              <div className={cn(fieldWrapClass, "sm:col-span-2 landscape:col-span-1")}>
                <Label htmlFor="transaction_date" className={labelClass}>
                  {t("registerTxnDate")}
                </Label>
                <Input
                  id="transaction_date"
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => update("transaction_date", e.target.value)}
                  onFocus={() => vk.dismiss()}
                  className="h-12 rounded-xl px-4 text-base landscape:h-11"
                />
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-accent">{success}</p> : null}

          <div
            data-vk-keep
            className={cn(
              "relative mt-4 flex w-full min-w-0 shrink-0 flex-col gap-3 self-stretch pt-3 sm:flex-row sm:items-stretch",
              "landscape:mt-auto landscape:gap-2 landscape:pt-2 landscape:pb-0.5",
            )}
          >
            {step > 1 ? (
              <Button
                type="button"
                variant="secondary"
                className="h-12 w-full min-w-0 flex-1 text-base landscape:h-11"
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
                className="h-12 w-full min-w-0 flex-1 px-4 text-base landscape:h-11"
                onClick={goNext}
                disabled={!storesReady || !hasStores}
              >
                {t("commonContinue")}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full min-w-0 flex-1 px-4 text-base landscape:h-11"
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
