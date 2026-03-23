"use client";

import { forwardRef } from "react";
import ReactPhoneInput, {
  type Country,
  type Value,
} from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhoneInputProps = {
  /** E.164 formatted value (e.g. "+573224760877") or undefined */
  value: Value | string | undefined;
  /** Called with E.164 value or undefined when field is empty */
  onChange: (value: Value | undefined) => void;
  /** Tailwind/inline className for the wrapper */
  className?: string;
  /** className passed directly to the inner <input> element */
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Accessibility: associates a <label htmlFor={id}> */
  id?: string;
  onBlur?: () => void;
  hasError?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PhoneInput — international phone field with country flag selector.
 *
 * Wraps react-phone-number-input and outputs E.164 format (+573224760877).
 * Default country: Colombia (CO).
 *
 * Styling is neutral — callers control the look via `className` / `inputClassName`.
 * The library's minimal CSS is imported here (only flag + country select styles).
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    {
      value,
      onChange,
      className,
      inputClassName,
      placeholder = "300 000 0000",
      disabled,
      id,
      onBlur,
      hasError = false,
    },
    _ref,
  ) {
    return (
      <div className={cn("phone-input-wrapper", className)}>
        <ReactPhoneInput
          international
          defaultCountry={"CO" as Country}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          numberInputProps={{
            id,
            onBlur,
            className: cn(
              "phone-number-input flex-1 bg-transparent outline-none",
              inputClassName,
            ),
          }}
        />
      </div>
    );
  },
);

PhoneInput.displayName = "PhoneInput";
