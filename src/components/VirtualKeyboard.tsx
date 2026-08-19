import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Delete, Globe, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, type Locale } from "@/lib/i18n";

export type VkMode = "numeric" | "decimal" | "name" | "email" | "text";

type VkField = {
  id: string;
  mode: VkMode;
  getValue: () => string;
  setValue: (value: string) => void;
};

type VkApi = {
  enabled: boolean;
  activeId: string | null;
  activate: (field: VkField) => void;
  dismiss: () => void;
};

const VkContext = createContext<VkApi>({
  enabled: false,
  activeId: null,
  activate: () => {},
  dismiss: () => {},
});

export function useVirtualKeyboard() {
  return useContext(VkContext);
}

export function VirtualKeyboardProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [active, setActive] = useState<VkField | null>(null);
  const activeRef = useRef<VkField | null>(null);
  activeRef.current = active;

  const dismiss = useCallback(() => setActive(null), []);
  const activate = useCallback((field: VkField) => {
    setActive(field);
  }, []);

  useEffect(() => {
    if (!enabled) setActive(null);
  }, [enabled]);

  useEffect(() => {
    if (!active) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-virtual-keyboard]")) return;
      if (target.closest("[data-vk-field]")) return;
      setActive(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [active]);

  const api = useMemo<VkApi>(
    () => ({
      enabled,
      activeId: active?.id ?? null,
      activate,
      dismiss,
    }),
    [enabled, active?.id, activate, dismiss],
  );

  return (
    <VkContext.Provider value={api}>
      {children}
      {enabled && active ? <VirtualKeyboardOverlay field={active} onHide={dismiss} /> : null}
    </VkContext.Provider>
  );
}

export function useVkFieldProps({
  id,
  mode,
  value,
  onChange,
}: {
  id: string;
  mode: VkMode;
  value: string;
  onChange: (value: string) => void;
}): Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "readOnly" | "inputMode" | "autoComplete" | "onFocus" | "onChange"
> & { "data-vk-field": string; "data-vk-active": string } {
  const vk = useVirtualKeyboard();
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  if (!vk.enabled) {
    return {
      "data-vk-field": id,
      "data-vk-active": "false",
    };
  }

  return {
    "data-vk-field": id,
    "data-vk-active": vk.activeId === id ? "true" : "false",
    readOnly: true,
    inputMode: "none",
    autoComplete: "off",
    onChange: () => {},
    onFocus: () => {
      vk.activate({
        id,
        mode,
        getValue: () => valueRef.current,
        setValue: (next) => onChangeRef.current(next),
      });
    },
  };
}

const EN_TOP = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const EN_MID = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const EN_BOT = ["z", "x", "c", "v", "b", "n", "m"];
const AR_TOP = ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج"];
const AR_MID = ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"];
const AR_BOT = ["ئ", "ء", "ؤ", "ر", "ى", "ة", "و", "ز", "ظ"];
const NUM_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const EMAIL_SYMBOLS = ["@", ".", "_", "-", "+"];

function applyKey(current: string, key: string, mode: VkMode): string {
  if (key === "backspace") return current.slice(0, -1);
  const ch = key === "space" ? " " : key;
  if (mode === "numeric") {
    return /^\d$/.test(ch) ? current + ch : current;
  }
  if (mode === "decimal") {
    if (ch === ".") return current.includes(".") ? current : current + ch;
    return /^\d$/.test(ch) ? current + ch : current;
  }
  if (mode === "name") {
    return ch === " " || /^[\p{L}'’-]$/u.test(ch) ? current + ch : current;
  }
  if (mode === "email") {
    return /^[a-zA-Z0-9@._+-]$/.test(ch) ? current + ch : current;
  }
  if (ch === " " || /^[\p{L}\p{N}&.'’-]$/u.test(ch)) return current + ch;
  return current;
}

function KeyButton({
  label,
  className,
  wide,
  onPress,
  ariaLabel,
}: {
  label: ReactNode;
  className?: string;
  wide?: boolean;
  onPress: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-1.5 text-base font-semibold text-foreground shadow-sm active:bg-accent/40",
        wide ? "flex-[1.6]" : "flex-1",
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
    >
      {label}
    </button>
  );
}

function VirtualKeyboardOverlay({ field, onHide }: { field: VkField; onHide: () => void }) {
  const { t, locale } = useI18n();
  const [shift, setShift] = useState(false);
  const [digits, setDigits] = useState(false);
  const [kbLang, setKbLang] = useState<Locale>(locale);

  useEffect(() => {
    setKbLang(locale);
    setShift(false);
    setDigits(false);
  }, [field.id, locale]);

  function press(key: string) {
    const next = applyKey(field.getValue(), key, field.mode);
    field.setValue(next);
    if (shift && key.length === 1) setShift(false);
  }

  const letterRows =
    kbLang === "ar"
      ? [AR_TOP, AR_MID, AR_BOT]
      : [
          EN_TOP.map((k) => (shift ? k.toUpperCase() : k)),
          EN_MID.map((k) => (shift ? k.toUpperCase() : k)),
          EN_BOT.map((k) => (shift ? k.toUpperCase() : k)),
        ];

  const isNumeric = field.mode === "numeric" || field.mode === "decimal";
  const showLetters = !isNumeric && !digits;
  const showEmailSymbols = field.mode === "email" && !digits;

  return (
    <div
      data-virtual-keyboard
      dir={showLetters && kbLang === "ar" ? "rtl" : "ltr"}
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-white/15 bg-secondary/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 pb-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Keyboard className="h-4 w-4" />
          {t("settingsVkTitle")}
        </p>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-accent hover:bg-white/10"
          onPointerDown={(e) => {
            e.preventDefault();
            onHide();
          }}
        >
          {t("vkHide")}
        </button>
      </div>

      {isNumeric ? (
        <div className="mx-auto grid max-w-sm grid-cols-3 gap-1.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
            <KeyButton key={k} label={k} onPress={() => press(k)} />
          ))}
          {field.mode === "decimal" ? (
            <KeyButton label="." onPress={() => press(".")} />
          ) : (
            <KeyButton
              label={<Delete className="h-5 w-5" />}
              ariaLabel={t("vkBackspace")}
              onPress={() => press("backspace")}
            />
          )}
          <KeyButton label="0" onPress={() => press("0")} />
          {field.mode === "decimal" ? (
            <KeyButton
              label={<Delete className="h-5 w-5" />}
              ariaLabel={t("vkBackspace")}
              onPress={() => press("backspace")}
            />
          ) : (
            <KeyButton label={t("vkDone")} onPress={onHide} />
          )}
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {showLetters ? (
            letterRows.map((row, i) => (
              <div key={i} className="flex gap-1.5">
                {i === 2 && kbLang === "en" ? (
                  <KeyButton
                    wide
                    label="⇧"
                    className={shift ? "bg-accent/40 text-accent-foreground" : ""}
                    onPress={() => setShift((s) => !s)}
                  />
                ) : null}
                {row.map((k) => (
                  <KeyButton key={k} label={k} onPress={() => press(k)} />
                ))}
                {i === 2 ? (
                  <KeyButton
                    wide
                    label={<Delete className="h-5 w-5" />}
                    ariaLabel={t("vkBackspace")}
                    onPress={() => press("backspace")}
                  />
                ) : null}
              </div>
            ))
          ) : (
            <>
              <div className="flex gap-1.5">
                {NUM_ROW.map((k) => (
                  <KeyButton key={k} label={k} onPress={() => press(k)} />
                ))}
              </div>
              {field.mode === "email" ? (
                <div className="flex gap-1.5">
                  {EMAIL_SYMBOLS.map((k) => (
                    <KeyButton key={k} label={k} onPress={() => press(k)} />
                  ))}
                  <KeyButton
                    wide
                    label={<Delete className="h-5 w-5" />}
                    ariaLabel={t("vkBackspace")}
                    onPress={() => press("backspace")}
                  />
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <KeyButton
                    wide
                    label={<Delete className="h-5 w-5" />}
                    ariaLabel={t("vkBackspace")}
                    onPress={() => press("backspace")}
                  />
                </div>
              )}
            </>
          )}

          {showEmailSymbols ? (
            <div className="flex gap-1.5">
              {EMAIL_SYMBOLS.map((k) => (
                <KeyButton key={k} label={k} onPress={() => press(k)} />
              ))}
            </div>
          ) : null}

          <div className="flex gap-1.5">
            {field.mode !== "name" ? (
              <KeyButton
                wide
                label={digits ? t("vkLetters") : t("vkNumbers")}
                onPress={() => setDigits((d) => !d)}
              />
            ) : null}
            {(field.mode === "name" || field.mode === "text") && showLetters ? (
              <KeyButton
                wide
                label={
                  <span className="flex items-center gap-1">
                    <Globe className="h-4 w-4" />
                    {kbLang === "ar" ? "EN" : "ع"}
                  </span>
                }
                onPress={() => setKbLang((l) => (l === "ar" ? "en" : "ar"))}
              />
            ) : null}
            <KeyButton
              wide
              className="flex-[4]"
              label={t("vkSpace")}
              onPress={() => press("space")}
            />
            <KeyButton wide label={t("vkDone")} onPress={onHide} />
          </div>
        </div>
      )}
    </div>
  );
}
