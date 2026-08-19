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
import { cn } from "@/lib/utils";
import { useVkComboboxSearch } from "@/components/VirtualKeyboard";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Use inside dialogs so the list stays interactive and above the overlay. */
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  modal = false,
  onOpenChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const searchId = id ? `${id}-search` : "searchable-select-search";
  const { vk, inputProps, popoverProps, onOpenChange: onVkOpen } = useVkComboboxSearch(searchId);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onVkOpen(next);
        onOpenChange?.(next);
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
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selected ? selected.label : placeholder}</span>
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
              {options.map((option, index) => (
                <CommandItem
                  key={`${option.value}-${index}`}
                  value={`${option.label} ${option.value || "all"} ${index}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                    onVkOpen(false);
                    onOpenChange?.(false);
                  }}
                  className="cursor-pointer gap-3 rounded-lg px-3 py-3 text-base text-popover-foreground data-[selected=true]:bg-accent/25 data-[selected=true]:text-popover-foreground"
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
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
