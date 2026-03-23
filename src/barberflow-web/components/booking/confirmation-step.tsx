"use client";

import { CheckCircle2, AlertCircle, Scissors, User2, CalendarDays, Clock, ChevronLeft, Loader2, Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreatePublicBookingMutation,
  type PublicBarber,
  type PublicService,
  type PublicSlot,
  type PublicBookingResponse,
} from "@/lib/api/public-api";
import { Texts } from "@/lib/content/texts";
import { getApiErrorMessage } from "@/lib/api/error";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmationStepProps = {
  slug: string;
  selectedService: PublicService;
  selectedBarber: PublicBarber;
  selectedDate: string;
  selectedSlot: PublicSlot;
  customerName: string;
  customerPhone: string;
  onBack: () => void;
  onGoToStep: (step: number) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a "YYYY-MM-DD" string as a full Spanish date, e.g. "Lunes 24 de Marzo, 2026".
 */
function formatFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const weekday = d.toLocaleDateString("es-AR", { weekday: "long" });
  const dayNum = d.getDate();
  const monthName = d.toLocaleDateString("es-AR", { month: "long" });
  const yearNum = d.getFullYear();

  // Capitalise weekday
  const capitalWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const capitalMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return `${capitalWeekday} ${dayNum} de ${capitalMonth}, ${yearNum}`;
}

/**
 * Format an ISO datetime string as "HH:mm".
 */
function formatTime(isoString: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}min` : `${hours}h`;
}

/**
 * Check if an RTK Query error is a 409 Conflict.
 */
function is409(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 409
  );
}

// ─── Summary Row ─────────────────────────────────────────────────────────────

type SummaryRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
};

function SummaryRow({ icon, label, value }: SummaryRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 shrink-0"
        style={{ color: "var(--bf-brand-copper)" }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--bf-text-soft)" }}>
          {label}
        </p>
        <p className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

type SuccessScreenProps = {
  booking: PublicBookingResponse;
  selectedDate: string;
  selectedSlot: PublicSlot;
};

function SuccessScreen({ booking, selectedDate, selectedSlot }: SuccessScreenProps) {
  const { ConfirmationStep: CS } = Texts.Booking;
  const startLabel = formatTime(selectedSlot.start);
  const endLabel = formatTime(selectedSlot.end);

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      {/* Success icon */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--bf-brand-copper) 12%, var(--background))" }}
      >
        <CheckCircle2
          className="h-10 w-10"
          style={{ color: "var(--bf-brand-copper)" }}
        />
      </div>

      {/* Heading */}
      <div>
        <h2 className="text-2xl font-black" style={{ color: "var(--bf-text-strong)" }}>
          {CS.SuccessTitle}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
          {CS.SuccessSubtitle}
        </p>
      </div>

      {/* Booking summary card */}
      <div
        className="w-full rounded-2xl border p-5 text-left"
        style={{
          borderColor: "var(--bf-border-soft)",
          backgroundColor: "var(--background)",
        }}
      >
        <div className="space-y-4">
          <SummaryRow
            icon={<Scissors className="h-4 w-4" />}
            label={CS.LabelService}
            value={booking.serviceName}
          />
          <SummaryRow
            icon={<User2 className="h-4 w-4" />}
            label={CS.LabelBarber}
            value={booking.barberName}
          />
          <SummaryRow
            icon={<CalendarDays className="h-4 w-4" />}
            label={CS.LabelDate}
            value={formatFullDate(selectedDate)}
          />
          <SummaryRow
            icon={<Clock className="h-4 w-4" />}
            label={CS.LabelTime}
            value={`${startLabel} – ${endLabel}`}
          />
        </div>
      </div>

      {/* Status badge */}
      <div
        className="inline-flex items-center gap-2 rounded-full px-4 py-2"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bf-brand-copper) 10%, var(--background))",
          border: "1px solid var(--bf-brand-copper)",
        }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--bf-brand-copper)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--bf-brand-copper)" }}>
          {CS.SuccessStatus}
        </span>
      </div>

      {/* Appointment ID */}
      <p className="text-xs" style={{ color: "var(--bf-text-soft)" }}>
        {CS.BookingIdPrefix}{booking.appointmentId.slice(0, 8).toUpperCase()}
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmationStep({
  slug,
  selectedService,
  selectedBarber,
  selectedDate,
  selectedSlot,
  customerName,
  customerPhone,
  onBack,
  onGoToStep,
}: ConfirmationStepProps) {
  const { ConfirmationStep: CS, Common: BC } = Texts.Booking;
  const [createBooking, { isLoading, data: booking, error, reset }] =
    useCreatePublicBookingMutation();

  const startLabel = formatTime(selectedSlot.start);
  const endLabel = formatTime(selectedSlot.end);
  const slotConflict = is409(error);

  // ── Success state ──
  if (booking) {
    return (
      <SuccessScreen
        booking={booking}
        selectedDate={selectedDate}
        selectedSlot={selectedSlot}
      />
    );
  }

  async function handleSubmit() {
    await createBooking({
      slug,
      body: {
        serviceId: selectedService.id,
        barberId: selectedBarber.id,
        slotStart: selectedSlot.start,
        customerName,
        customerPhone,
      },
    });
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

      {/* Booking summary */}
      <div
        className="rounded-2xl border p-5 space-y-4"
        style={{
          borderColor: "var(--bf-border-soft)",
          backgroundColor: "var(--background)",
        }}
      >
        <SummaryRow
          icon={<Scissors className="h-4 w-4" />}
          label={CS.LabelService}
          value={`${selectedService.name} · ${formatDuration(selectedService.durationMinutes)} · ${formatPrice(selectedService.price)}`}
        />
        <SummaryRow
          icon={<User2 className="h-4 w-4" />}
          label={CS.LabelBarber}
          value={selectedBarber.name}
        />
        <SummaryRow
          icon={<CalendarDays className="h-4 w-4" />}
          label={CS.LabelDate}
          value={formatFullDate(selectedDate)}
        />
        <SummaryRow
          icon={<Clock className="h-4 w-4" />}
          label={CS.LabelTime}
          value={`${startLabel} – ${endLabel}`}
        />

        {/* Divider */}
        <div className="border-t" style={{ borderColor: "var(--bf-border-soft)" }} />

        <SummaryRow
          icon={<User className="h-4 w-4" />}
          label={CS.LabelName}
          value={customerName}
        />
        <SummaryRow
          icon={<Phone className="h-4 w-4" />}
          label={CS.LabelPhone}
          value={customerPhone}
        />
      </div>

      {/* Error states */}
      {error && slotConflict && (
        <div
          className="flex flex-col gap-3 rounded-2xl border p-4"
          style={{
            borderColor: "var(--bf-status-error-fg)",
            backgroundColor: "color-mix(in srgb, var(--bf-status-error-fg) 6%, var(--background))",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: "var(--bf-status-error-fg)" }}
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
                {CS.ConflictTitle}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--bf-text-soft)" }}>
                {CS.ConflictBody}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              onGoToStep(3);
            }}
            className="self-start rounded-xl px-5 py-2.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "var(--bf-brand-copper)", color: "white" }}
          >
            {CS.ConflictAction}
          </button>
        </div>
      )}

      {error && !slotConflict && (
        <div
          className="flex flex-col gap-3 rounded-2xl border p-4"
          style={{
            borderColor: "var(--bf-status-error-fg)",
            backgroundColor: "color-mix(in srgb, var(--bf-status-error-fg) 6%, var(--background))",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: "var(--bf-status-error-fg)" }}
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
                {CS.ErrorTitle}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--bf-text-soft)" }}>
                {getApiErrorMessage(error)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              void handleSubmit();
            }}
            className="self-start rounded-xl px-5 py-2.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "var(--bf-brand-copper)", color: "white" }}
          >
            {CS.RetryAction}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-1 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-150",
            isLoading ? "cursor-not-allowed opacity-40" : "hover:opacity-80"
          )}
          style={{ color: "var(--bf-text-body)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          {BC.BackIcon}
        </button>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isLoading || Boolean(error)}
          className={cn(
            "flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150",
            isLoading || Boolean(error)
              ? "cursor-not-allowed opacity-60"
              : "hover:opacity-90 active:scale-[0.98]"
          )}
          style={{
            backgroundColor: "var(--bf-brand-copper)",
            color: "white",
          }}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isLoading ? CS.Submitting : CS.Submit}
        </button>
      </div>
    </div>
  );
}
