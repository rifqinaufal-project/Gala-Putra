"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  disabled?: boolean;
  readOnly?: boolean;
  "aria-label"?: string;
  required?: boolean;
  id?: string;
}

/** Format number to Indonesian rupiah display: 1000000 → "1.000.000" */
function formatRupiah(num: number): string {
  if (!num || num === 0) return "";
  return num.toLocaleString("id-ID");
}

/** Strip all non-digit characters and parse to number */
function parseRupiah(str: string): number {
  const digits = str.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function CurrencyInput({
  value,
  onChange,
  onFocus,
  onBlur,
  className,
  placeholder = "0",
  min = 0,
  disabled = false,
  readOnly = false,
  "aria-label": ariaLabel,
  required,
  id,
}: CurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatRupiah(value));

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Show raw digits on focus for easier editing
      setDisplayValue(value > 0 ? String(value) : "");
      setTimeout(() => e.target.select(), 0);
      onFocus?.(e);
    },
    [value, onFocus]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      const parsed = parseRupiah(displayValue);
      const clamped = min !== undefined ? Math.max(min, parsed) : parsed;
      onChange(clamped);
      setDisplayValue(formatRupiah(clamped));
      onBlur?.(e);
    },
    [displayValue, min, onChange, onBlur]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow only digits and dots/commas while typing
      const digitsOnly = raw.replace(/\D/g, "");
      
      // Format with thousand separators while typing
      const num = digitsOnly ? parseInt(digitsOnly, 10) : 0;
      const formatted = num > 0 ? num.toLocaleString("id-ID") : "";
      
      setDisplayValue(formatted);
      onChange(num);
    },
    [onChange]
  );

  return (
    <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground select-none">
        Rp
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={isFocused ? displayValue : formatRupiah(value)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        className={cn(
          "h-10 w-full rounded-xl border border-input bg-white/90 pl-8 pr-3 text-right text-sm font-semibold tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/60",
          "focus:border-ring focus:ring-2 focus:ring-ring/15",
          disabled && "cursor-not-allowed opacity-50",
          readOnly && "cursor-default bg-muted",
          className
        )}
      />
    </div>
  );
}
