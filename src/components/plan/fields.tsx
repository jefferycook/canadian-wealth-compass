import { useEffect, useRef, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Inputs that distinguish "not answered" from zero: an empty box stays empty
 * and reports `null`, it never silently becomes 0.
 */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  min,
  max,
  step,
  className,
}: {
  label: string;
  hint?: string | undefined;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string | undefined;
  suffix?: string | undefined;
  placeholder?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  className?: string | undefined;
}) {
  /**
   * The box keeps whatever the person typed, including an empty box. Without
   * this, a parent that stores 0 re-renders "0" the instant the field is
   * cleared and the zero becomes impossible to delete.
   */
  const [text, setText] = useState(value == null ? "" : String(value));
  const typing = useRef(false);

  useEffect(() => {
    if (typing.current) {
      typing.current = false;
      return;
    }
    const current = text === "" ? null : Number(text);
    if (current !== value) setText(value == null ? "" : String(value));
  }, [value, text]);

  return (
    <Field label={label} hint={hint} className={className}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <Input
          type="number"
          inputMode="decimal"
          className={cn("tabular", prefix && "pl-7", suffix && "pr-10")}
          value={text}
          placeholder={placeholder ?? ""}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => {
            const raw = e.target.value;
            typing.current = true;
            setText(raw);
            onChange(raw === "" ? null : Number(raw));
          }}
        />

        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string | undefined;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        value={value}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  hint?: string | undefined;
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string | undefined;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function DateField({
  label,
  hint,
  value,
  onChange,
  max,
}: {
  label: string;
  hint?: string | undefined;
  value: string | null;
  onChange: (v: string | null) => void;
  max?: string | undefined;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="date"
        className="tabular"
        value={value ?? ""}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      />
    </Field>
  );
}

/** Whole years between a date of birth and today. Null when no date is given. */
export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export const money = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
