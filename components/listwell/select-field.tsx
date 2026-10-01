"use client";

import { Combobox } from "@base-ui/react/combobox";
import { ChevronDownIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { z } from "zod";

import { Icon } from "@/components/icon";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  businessCategoryLabels,
  CATEGORY_LABEL_MAX_LENGTH,
} from "@/lib/category";

const categoryOptions = businessCategoryLabels();
const categoryOptionSchema = z.string();

export const ListwellSelect = ({
  id,
  label,
  value,
  items,
  onValueChange,
  placeholder,
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <Field className={className}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select
      value={value}
      items={items}
      onValueChange={(next) => onValueChange(next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </Field>
);

export const ListwellCategoryField = ({
  id,
  label,
  value,
  onValueChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Combobox.Root
      items={categoryOptions}
      value={value.trim() ? value : null}
      inputValue={value}
      onInputValueChange={(next, details) => {
        if (details.reason === "input-clear") {
          return;
        }
        onValueChange(next);
      }}
      onValueChange={(next) => {
        if (next === null) {
          return;
        }
        onValueChange(categoryOptionSchema.parse(next));
      }}
      disabled={disabled}
      autoComplete="off"
    >
      <div className="relative">
        <Combobox.Input
          id={id}
          placeholder="Type a category"
          disabled={disabled}
          maxLength={CATEGORY_LABEL_MAX_LENGTH}
          render={<Input className="pr-8" />}
        />
        <Combobox.Trigger
          className="text-muted-foreground absolute inset-y-0 right-0 flex w-8 items-center justify-center"
          aria-label="Show categories"
          disabled={disabled}
        >
          <Icon
            className="pointer-events-none"
            icon={ChevronDownIcon}
            size={16}
          />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="z-50" sideOffset={4}>
          <Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 max-h-(--available-height) w-(--anchor-width) min-w-36 overflow-x-hidden overflow-y-auto rounded-lg p-1 shadow-md ring-1">
            <Combobox.List>
              {(option: string) => (
                <Combobox.Item
                  key={option}
                  value={option}
                  className="data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full cursor-default items-center rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none"
                >
                  {option}
                  <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                    <Icon icon={Tick02Icon} size={16} />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  </Field>
);
