"use client";

import { useState } from "react";
import {
  ChevronRight,
  Settings,
  Save,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  BookingRulesItem,
  useGetBookingRulesQuery,
  useUpdateBookingRulesMutation,
} from "@/lib/api/booking-rules-api";
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";
import { APP_ROUTES } from "@/lib/config/app";
import { useAppToast } from "@/lib/toast/toast-provider";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Texts } from "@/lib/content/texts";

const { BookingRules: T, Common, SharedShell } = Texts;

// ─── Constants ─────────────────────────────────────────────────────────────────

const SLOT_DURATION_OPTIONS = [15, 30, 45, 60] as const;
type SlotDuration = (typeof SLOT_DURATION_OPTIONS)[number];

// ─── Local State Types ─────────────────────────────────────────────────────────

type BookingRulesFormState = {
  slotDurationMinutes: SlotDuration;
  maxDaysInAdvance: number;
  minNoticeHours: number;
  bufferMinutes: number;
};

type FormValidationErrors = {
  slotDurationMinutes?: string;
  maxDaysInAdvance?: string;
  minNoticeHours?: string;
  bufferMinutes?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFormState(data: BookingRulesItem): BookingRulesFormState {
  const slot = SLOT_DURATION_OPTIONS.includes(data.slotDurationMinutes as SlotDuration)
    ? (data.slotDurationMinutes as SlotDuration)
    : 30;

  return {
    slotDurationMinutes: slot,
    maxDaysInAdvance: data.maxDaysInAdvance,
    minNoticeHours: data.minNoticeHours,
    bufferMinutes: data.bufferMinutes,
  };
}

function validateForm(state: BookingRulesFormState): FormValidationErrors {
  const errors: FormValidationErrors = {};

  if (!SLOT_DURATION_OPTIONS.includes(state.slotDurationMinutes)) {
    errors.slotDurationMinutes = T.Validation.SlotDurationInvalid;
  }

  if (!Number.isInteger(state.maxDaysInAdvance) || state.maxDaysInAdvance < 1) {
    errors.maxDaysInAdvance = T.Validation.MaxDaysMin;
  }

  if (!Number.isInteger(state.minNoticeHours) || state.minNoticeHours < 0) {
    errors.minNoticeHours = T.Validation.MinNoticeMin;
  }

  if (!Number.isInteger(state.bufferMinutes) || state.bufferMinutes < 0) {
    errors.bufferMinutes = T.Validation.BufferMin;
  }

  return errors;
}

function hasValidationErrors(errors: FormValidationErrors): boolean {
  return Object.values(errors).some(Boolean);
}

// ─── Field Components ──────────────────────────────────────────────────────────

type NumberFieldProps = {
  label: string;
  hint: string;
  value: number;
  min: number;
  error?: string;
  onChange: (value: number) => void;
};

function NumberField({ label, hint, value, min, error, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
      </label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed)) {
            onChange(parsed);
          }
        }}
        className={cn(
          "h-10 w-full rounded border bg-[#121212] px-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500",
          error ? "border-red-500" : "border-slate-700",
        )}
      />
      {error ? (
        <p className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      ) : (
        <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

type SlotDurationSelectProps = {
  value: SlotDuration;
  error?: string;
  onChange: (value: SlotDuration) => void;
};

function SlotDurationSelect({ value, error, onChange }: SlotDurationSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {T.Fields.SlotDurationLabel}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) as SlotDuration)}
        className={cn(
          "h-10 w-full rounded border bg-[#121212] px-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500",
          error ? "border-red-500" : "border-slate-700",
        )}
      >
        {SLOT_DURATION_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt} minutos
          </option>
        ))}
      </select>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          {T.Fields.SlotDurationHint}
        </p>
      )}
    </div>
  );
}

// ─── Form Panel ────────────────────────────────────────────────────────────────

type BookingRulesFormProps = {
  formState: BookingRulesFormState;
  errors: FormValidationErrors;
  isSaving: boolean;
  onSlotDurationChange: (value: SlotDuration) => void;
  onMaxDaysChange: (value: number) => void;
  onMinNoticeChange: (value: number) => void;
  onBufferChange: (value: number) => void;
  onSave: () => void;
};

function BookingRulesForm({
  formState,
  errors,
  isSaving,
  onSlotDurationChange,
  onMaxDaysChange,
  onMinNoticeChange,
  onBufferChange,
  onSave,
}: BookingRulesFormProps) {
  const hasErrors = hasValidationErrors(errors);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-800/10">
      <div className="space-y-5 p-6">
        <SlotDurationSelect
          value={formState.slotDurationMinutes}
          error={errors.slotDurationMinutes}
          onChange={onSlotDurationChange}
        />

        <NumberField
          label={T.Fields.MaxDaysLabel}
          hint={T.Fields.MaxDaysHint}
          value={formState.maxDaysInAdvance}
          min={1}
          error={errors.maxDaysInAdvance}
          onChange={onMaxDaysChange}
        />

        <NumberField
          label={T.Fields.MinNoticeLabel}
          hint={T.Fields.MinNoticeHint}
          value={formState.minNoticeHours}
          min={0}
          error={errors.minNoticeHours}
          onChange={onMinNoticeChange}
        />

        <NumberField
          label={T.Fields.BufferLabel}
          hint={T.Fields.BufferHint}
          value={formState.bufferMinutes}
          min={0}
          error={errors.bufferMinutes}
          onChange={onBufferChange}
        />
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
        {hasErrors ? (
          <p className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-4 w-4" />
            {T.Footer.ErrorHint}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {T.Footer.SuccessHint}
          </p>
        )}
        <LoadingButton
          type="button"
          onClick={onSave}
          isLoading={isSaving}
          loadingText={T.Actions.Saving}
          disabled={hasErrors}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold",
            hasErrors
              ? "cursor-not-allowed bg-slate-700 text-slate-400"
              : "bg-slate-100 text-slate-900 hover:bg-white",
          )}
        >
          <Save className="h-4 w-4" />
          {T.Actions.Save}
        </LoadingButton>
      </div>
    </div>
  );
}

// ─── Main Section Component ────────────────────────────────────────────────────

type BookingRulesSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

export function BookingRulesSection({ canOperate, role }: BookingRulesSectionProps) {
  const router = useRouter();
  const { showToast } = useAppToast();

  const rulesQuery = useGetBookingRulesQuery(undefined, { skip: !canOperate });
  const [updateBookingRules, updateState] = useUpdateBookingRulesMutation();

  // Local override — starts as null, populated from server on first load
  const [formOverride, setFormOverride] = useState<BookingRulesFormState | null>(null);
  const [validationErrors, setValidationErrors] = useState<FormValidationErrors>({});

  const serverFormState = rulesQuery.data ? buildFormState(rulesQuery.data) : null;

  const formState: BookingRulesFormState = formOverride ??
    serverFormState ?? {
      slotDurationMinutes: 30,
      maxDaysInAdvance: 30,
      minNoticeHours: 1,
      bufferMinutes: 10,
    };

  function updateField(patch: Partial<BookingRulesFormState>): void {
    const next: BookingRulesFormState = { ...formState, ...patch };
    setFormOverride(next);
    setValidationErrors(validateForm(next));
  }

  async function handleSave(): Promise<void> {
    const errors = validateForm(formState);
    setValidationErrors(errors);

    if (hasValidationErrors(errors)) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: T.Toast.ValidationError,
        variant: "error",
      });
      return;
    }

    const snapshot = formOverride ?? serverFormState;

    try {
      await updateBookingRules({
        slotDurationMinutes: formState.slotDurationMinutes,
        maxDaysInAdvance: formState.maxDaysInAdvance,
        minNoticeHours: formState.minNoticeHours,
        bufferMinutes: formState.bufferMinutes,
      }).unwrap();

      setFormOverride(null);
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: T.Toast.SaveSuccess,
        variant: "success",
      });
    } catch (error) {
      if (snapshot) {
        setFormOverride(snapshot);
      }
      showToast({
        title: Common.Toasts.ErrorTitle,
        description:
          getApiErrorMessage(error) ?? T.Toast.SaveError,
        variant: "error",
      });
    }
  }

  const isLoading = rulesQuery.isLoading;

  // ─── Desktop Body ──────────────────────────────────────────────────────────

  const desktopBody = (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mb-8">
        <h2 className="mb-2 text-3xl font-black">{T.PageTitle}</h2>
        <p className="text-slate-400">
          {T.PageDescription}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {T.LoadingDesktop}
        </div>
      ) : (
        <div className="max-w-lg">
          <BookingRulesForm
            formState={formState}
            errors={validationErrors}
            isSaving={updateState.isLoading}
            onSlotDurationChange={(v) => updateField({ slotDurationMinutes: v })}
            onMaxDaysChange={(v) => updateField({ maxDaysInAdvance: v })}
            onMinNoticeChange={(v) => updateField({ minNoticeHours: v })}
            onBufferChange={(v) => updateField({ bufferMinutes: v })}
            onSave={handleSave}
          />
        </div>
      )}
    </div>
  );

  // ─── Mobile Body ───────────────────────────────────────────────────────────

  const mobileBody = (
    <main className="flex-1 overflow-y-auto pb-24">
      <div className="p-4">
        <h2 className="mb-1 text-2xl font-bold">{T.MobileTitle}</h2>
        <p className="mb-6 text-sm text-slate-400">
          {T.MobileDescription}
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {Common.Actions.Loading}
          </div>
        ) : (
          <>
            <div className="space-y-5 rounded-xl border border-slate-800 bg-slate-800/10 p-4">
              <SlotDurationSelect
                value={formState.slotDurationMinutes}
                error={validationErrors.slotDurationMinutes}
                onChange={(v) => updateField({ slotDurationMinutes: v })}
              />

              <NumberField
                label={T.Fields.MaxDaysMobileLabel}
                hint={T.Fields.MaxDaysMobileHint}
                value={formState.maxDaysInAdvance}
                min={1}
                error={validationErrors.maxDaysInAdvance}
                onChange={(v) => updateField({ maxDaysInAdvance: v })}
              />

              <NumberField
                label={T.Fields.MinNoticeLabel}
                hint={T.Fields.MinNoticeMobileHint}
                value={formState.minNoticeHours}
                min={0}
                error={validationErrors.minNoticeHours}
                onChange={(v) => updateField({ minNoticeHours: v })}
              />

              <NumberField
                label={T.Fields.BufferMobileLabel}
                hint={T.Fields.BufferMobileHint}
                value={formState.bufferMinutes}
                min={0}
                error={validationErrors.bufferMinutes}
                onChange={(v) => updateField({ bufferMinutes: v })}
              />
            </div>

            <div className="pt-4">
              <LoadingButton
                type="button"
                onClick={handleSave}
                isLoading={updateState.isLoading}
                loadingText={T.Actions.Saving}
                disabled={hasValidationErrors(validationErrors)}
                className="w-full rounded-lg bg-slate-100 py-3 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {T.Actions.Save}
              </LoadingButton>
            </div>
          </>
        )}
      </div>
    </main>
  );

  return (
    <RoleWorkspaceShell
      canOperate={canOperate}
      disabledMessage={T.DisabledMessage}
      role={role}
      activeItemId="booking-rules"
      onNavigate={(href) => router.push(href)}
      brandTitle={SharedShell.BrandName}
      brandSubtitle={T.BrandSubtitle}
      desktopHeader={
        <header className="flex h-16 items-center gap-3 border-b border-slate-800 bg-[#191919]/50 px-8 backdrop-blur-md">
          <Settings className="h-5 w-5 text-slate-400" />
          <div>
            <h1 className="text-sm font-bold">{T.PageTitle}</h1>
            <p className="text-xs text-slate-500">
              {T.HeaderDescription}
            </p>
          </div>
        </header>
      }
      desktopBody={desktopBody}
      mobileHeader={
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-800 bg-[#191919] p-4">
          <button
            type="button"
            onClick={() => router.push(APP_ROUTES.Dashboard)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <h1 className="text-xl font-bold">{T.MobileTitle}</h1>
        </header>
      }
      mobileBody={mobileBody}
      mobileFooter={
        <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-slate-800 bg-slate-950 px-4 pb-6 pt-3">
          <button
            type="button"
            onClick={() => router.push(APP_ROUTES.Dashboard)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-slate-400"
          >
            <Settings className="h-4 w-4" />
            <p className="text-[10px] font-medium">{T.Mobile.DashboardNav}</p>
          </button>
        </nav>
      }
    />
  );
}
