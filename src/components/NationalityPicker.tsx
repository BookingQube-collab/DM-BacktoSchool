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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NATIONALITIES, type NationalityOption } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useVkComboboxSearch } from "@/components/VirtualKeyboard";

type NationalityPickerProps = {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  className?: string;
  onOpenChange?: (open: boolean) => void;
};

export function NationalityPicker({
  id,
  value,
  onChange,
  className,
  onOpenChange,
}: NationalityPickerProps) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const searchId = id ? `${id}-search` : "nationality-search";
  const { vk, inputProps, popoverProps, onOpenChange: onVkOpen } = useVkComboboxSearch(searchId);
  const selected: NationalityOption | undefined = NATIONALITIES.find((n) => n.name === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onVkOpen(next);
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-vk-field={vk.enabled ? searchId : undefined}
          className={cn(
            "h-12 w-full justify-between rounded-xl border-input bg-transparent px-4 text-base font-normal shadow-sm hover:bg-secondary/60 landscape:h-14 landscape:text-lg",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2 truncate">
              <span className="text-xl leading-none" aria-hidden>
                {selected.flag}
              </span>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            t("registerSelectNationality")
          )}
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[var(--radix-popover-trigger-width)] rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl"
        align="start"
        collisionPadding={12}
        {...popoverProps}
      >
        <Command className="rounded-xl bg-popover text-popover-foreground">
          <CommandInput
            placeholder={t("registerSearchNationality")}
            className="h-11 text-base"
            {...inputProps}
          />
          <CommandList className="max-h-64 landscape:max-h-[min(36dvh,12rem)]">
            <CommandEmpty>{t("registerNoNationality")}</CommandEmpty>
            <CommandGroup>
              {NATIONALITIES.map((n) => (
                <CommandItem
                  key={n.name}
                  value={n.name}
                  onSelect={() => {
                    onChange(n.name);
                    setOpen(false);
                    onVkOpen(false);
                    onOpenChange?.(false);
                  }}
                  className="cursor-pointer gap-3 rounded-lg px-3 py-3 text-base data-[selected=true]:bg-accent/25"
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {n.flag}
                  </span>
                  <span className="flex-1 truncate">{n.name}</span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === n.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
