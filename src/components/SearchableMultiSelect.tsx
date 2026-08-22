import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useVkComboboxSearch } from "@/components/VirtualKeyboard";
import type { SearchableSelectOption } from "@/components/SearchableSelect";

type SearchableMultiSelectProps = {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  modal?: boolean;
};

export function SearchableMultiSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  modal = false,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const searchId = id ? `${id}-search` : "searchable-multi-select-search";
  const { vk, inputProps, popoverProps, onOpenChange: onVkOpen } = useVkComboboxSearch(searchId);
  const selected = options.filter((option) => value.includes(option.value) && option.value);
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0].label
        : selected.map((option) => option.label).join(", ");

  function toggle(next: string) {
    if (!next) return;
    if (value.includes(next)) {
      onChange(value.filter((id) => id !== next));
    } else {
      onChange([...value, next]);
    }
  }

  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onVkOpen(next);
        }}
        modal={modal}
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
              "h-12 w-full justify-between rounded-xl border-input bg-transparent px-4 text-base font-normal shadow-sm hover:bg-secondary/60 hover:text-foreground landscape:h-11",
              selected.length === 0 && "text-muted-foreground",
              className,
            )}
          >
            <span className="min-w-0 truncate">{summary}</span>
            <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[100] w-[var(--radix-popover-trigger-width)] min-w-[16rem] rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl"
          align="start"
          collisionPadding={12}
          {...popoverProps}
        >
          <Command className="rounded-xl bg-popover text-popover-foreground">
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-11 text-base"
              {...inputProps}
            />
            <CommandList className="max-h-64 landscape:max-h-[min(36dvh,12rem)]">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option, index) => {
                  const checked = value.includes(option.value);
                  return (
                    <CommandItem
                      key={`${option.value}-${index}`}
                      value={`${option.label} ${option.value || "all"} ${index}`}
                      onSelect={() => toggle(option.value)}
                      className="cursor-pointer gap-3 rounded-lg px-3 py-3 text-base text-popover-foreground data-[selected=true]:bg-accent/25 data-[selected=true]:text-popover-foreground"
                    >
                      <span className="flex-1 truncate">{option.label}</span>
                      <Check
                        className={cn("h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-secondary/70 px-2 py-0.5 text-xs font-medium"
            >
              <span className="truncate">{option.label}</span>
              <X className="size-3 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
