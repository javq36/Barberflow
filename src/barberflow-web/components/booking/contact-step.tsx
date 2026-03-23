"use client";

import { useState } from "react";
import { User, ChevronLeft } from "lucide-react";
import { isValidPhoneNumber, type Value } from "react-phone-number-input";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { Texts } from "@/lib/content/texts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactStepProps = {
  customerName: string;
  customerPhone: string;
  onChangeName: (name: string) => void;
  onChangePhone: (phone: string) => void;
  onNext: () => void;
  onBack: () => void;
};

// ─── Validation helpers ───────────────────────────────────────────────────────

const { Validation } = Texts.Booking.ContactStep;

function validateName(value: string): string | null {
  if (!value.trim()) return Validation.NameRequired;
  if (value.trim().length < 2) return Validation.NameMinLength;
  return null;
}

function validatePhone(value: string): string | null {
  if (!value) return Validation.PhoneRequired;
  if (!isValidPhoneNumber(value)) return Validation.PhoneInvalid;
  return null;
}

// ─── Field component ──────────────────────────────────────────────────────────

type FieldProps = {
  id: string;
  label: string;
  type?: "text" | "tel";
  value: string;
  placeholder: string;
  icon: React.ReactNode;
  error: string | null;
  touched: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

function Field({
  id,
  label,
  type = "text",
  value,
  placeholder,
  icon,
  error,
  touched,
  onChange,
  onBlur,
}: FieldProps) {
  const hasError = touched && error !== null;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-sm font-semibold"
        style={{ color: "var(--bf-text-strong)" }}
      >
        {label}
      </label>

      <div className="relative">
        {/* Icon */}
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: hasError ? "var(--bf-status-error-fg)" : "var(--bf-text-soft)" }}
        >
          {icon}
        </span>

        {/* Input */}
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={type === "tel" ? "tel" : "name"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn(
            "w-full rounded-xl border bg-transparent py-3 pl-10 pr-4 text-sm transition-all duration-150",
            "outline-none placeholder:text-sm",
            "focus:ring-2 focus:ring-offset-0"
          )}
          style={{
            borderColor: hasError ? "var(--bf-status-error-fg)" : "var(--bf-border-soft)",
            color: "var(--bf-text-body)",
            // @ts-expect-error custom CSS property
            "--tw-ring-color": hasError
              ? "var(--bf-status-error-fg)"
              : "var(--bf-brand-copper)",
            "--tw-ring-offset-color": "var(--background)",
          }}
        />
      </div>

      {/* Error message */}
      {hasError && (
        <p className="text-xs" style={{ color: "var(--bf-status-error-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContactStep({
  customerName,
  customerPhone,
  onChangeName,
  onChangePhone,
  onNext,
  onBack,
}: ContactStepProps) {
  const { ContactStep: CS, Common: BC } = Texts.Booking;
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const nameError = validateName(customerName);
  const phoneError = validatePhone(customerPhone);
  const isValid = nameError === null && phoneError === null;

  function handleNext() {
    // Touch both fields to show all errors before proceeding
    setNameTouched(true);
    setPhoneTouched(true);
    if (isValid) {
      onNext();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--bf-text-strong)" }}>
          {CS.Title}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
          {CS.Subtitle}
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <Field
          id="customer-name"
          label={CS.NameLabel}
          type="text"
          value={customerName}
          placeholder={CS.NamePlaceholder}
          icon={<User className="h-4 w-4" />}
          error={nameError}
          touched={nameTouched}
          onChange={onChangeName}
          onBlur={() => setNameTouched(true)}
        />

        {/* Phone field with country selector */}
        <div className="space-y-1.5">
          <label
            htmlFor="customer-phone"
            className="block text-sm font-semibold"
            style={{ color: "var(--bf-text-strong)" }}
          >
            {CS.PhoneLabel}
          </label>

          <PhoneInput
            id="customer-phone"
            value={customerPhone as Value}
            onChange={(v) => onChangePhone(v ?? "")}
            onBlur={() => setPhoneTouched(true)}
            hasError={phoneTouched && phoneError !== null}
            className={cn(
              "flex w-full items-center rounded-xl border bg-transparent py-3 pl-3.5 pr-4 text-sm transition-all duration-150",
              "focus-within:ring-2 focus-within:ring-offset-0",
              phoneTouched && phoneError !== null
                ? "border-[var(--bf-status-error-fg)] [--tw-ring-color:var(--bf-status-error-fg)]"
                : "border-[var(--bf-border-soft)] [--tw-ring-color:var(--bf-brand-copper)]",
            )}
            inputClassName="text-sm text-[var(--bf-text-body)] placeholder:text-[var(--bf-text-soft)] bg-transparent outline-none"
            placeholder={CS.PhonePlaceholder}
          />

          {phoneTouched && phoneError !== null && (
            <p className="text-xs" style={{ color: "var(--bf-status-error-fg)" }}>
              {phoneError}
            </p>
          )}
        </div>
      </div>

      {/* Privacy note */}
      <p className="text-xs" style={{ color: "var(--bf-text-soft)" }}>
        {CS.PrivacyNote}
      </p>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-150 hover:opacity-80"
          style={{ color: "var(--bf-text-body)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          {BC.BackIcon}
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={!isValid}
          className={cn(
            "rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150",
            isValid
              ? "hover:opacity-90 active:scale-[0.98]"
              : "cursor-not-allowed opacity-40"
          )}
          style={{
            backgroundColor: "var(--bf-brand-copper)",
            color: "white",
          }}
        >
          {BC.Next}
        </button>
      </div>
    </div>
  );
}
