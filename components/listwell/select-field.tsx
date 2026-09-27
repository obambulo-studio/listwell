"use client";

import type { ReactNode } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const ListwellSelect = ({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  disabled,
  className,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <Field className={className}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  </Field>
);

export const listwellSelectItemClassName = cn("w-full");
