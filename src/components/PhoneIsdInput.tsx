import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DIAL_CODES,
  DEFAULT_DIAL_CODE,
  combineMobile,
  splitMobile,
  type DialCodeOption,
} from "@/lib/countries";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type PhoneIsdInputProps = {
  id?: string;
  /** Full mobile including ISD (e.g. +97455XXXXXX). Remount to reset. */
  value: string;
  onChange: (fullMobile: string) => void;
  className?: string;
};

function defaultDialOption(value: string): DialCodeOption {
  const { dial } = splitMobile(value);
  return (
    DIAL_CODES.find((d) => d.dial === dial) ??
    DIAL_CODES.find((d) => d.dial === DEFAULT_DIAL_CODE)!
  );
}

export function PhoneIsdInput({
  id,
  value,
  onChange,
  className,
}: PhoneIsdInputProps) {
  const initial = splitMobile(value);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DialCodeOption>(() =>
    defaultDialOption(value),
  );
  const [local, setLocal] = useState(initial.local);
  const { t } = useI18n();

  function emit(option: DialCodeOption, nextLocal: string) {
    onChange(combineMobile(option.dial, nextLocal));
  }

  function selectDial(option: DialCodeOption) {
    setSelected(option);
    setOpen(false);
    emit(option, local);
  }

  function onLocalChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setLocal(digits);
    emit(selected, digits);
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={t("registerDialCode")}
            className="h-12 shrink-0 gap-1.5 rounded-xl border-input bg-transparent px-3 text-base font-normal shadow-sm hover:bg-secondary/60"
          >
            <span className="text-xl leading-none" aria-hidden>
              {selected.flag}
            </span>
            <span className="tabular-nums">{selected.dial}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl"
          align="start"
        >
          <Command className="rounded-xl bg-popover text-popover-foreground">
            <CommandInput
              placeholder={t("registerSearchCountry")}
              className="h-11 text-base"
            />
            <CommandList className="max-h-64">
              <CommandEmpty>{t("registerNoCountry")}</CommandEmpty>
              <CommandGroup>
                {DIAL_CODES.map((c) => (
                  <CommandItem
                    key={`${c.name}-${c.dial}`}
                    value={`${c.name} ${c.dial}`}
                    onSelect={() => selectDial(c)}
                    className="cursor-pointer gap-3 rounded-lg px-3 py-3 text-base data-[selected=true]:bg-accent/25"
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {c.flag}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.dial}
                    </span>
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        selected.name === c.name && selected.dial === c.dial
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={local}
        onChange={(e) => onLocalChange(e.target.value)}
        placeholder="55XXXXXX"
        className="h-12 flex-1 rounded-xl px-4 text-base"
      />
    </div>
  );
}
