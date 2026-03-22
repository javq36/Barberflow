"use client";

import { CalendarDays, Clock, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetPublicAvailabilityQuery,
  useGetPublicBarbersQuery,
  type PublicBarber,
  type PublicService,
  type PublicSlot,
} from "@/lib/api/public-api";
import { Texts } from "@/lib/content/texts";

// ─── Types ────────────────────────────────────────────────────────────────────

type DateTimeStepProps = {
  slug: string;
  selectedBarber: PublicBarber;
  selectedService: PublicService;
  selectedDate: string | undefined;
  selectedSlot: PublicSlot | undefined;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: PublicSlot) => void;
  /**
   * Called when the user picks a slot in "any barber" mode and the slot carries
   * a barberId. The wizard updates its selectedBarber so the correct barber is
   * passed to the confirmation step.
   */
  onAutoSelectBarber: (barber: PublicBarber) => void;
  onNext: () => void;
  onBack: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate the next `count` dates from today (inclusive) as "YYYY-MM-DD" strings.
 */
function getUpcomingDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/**
 * Format a "YYYY-MM-DD" string as a short localised label, e.g. "Lun 24 Mar".
 */
function formatDatePill(dateStr: string): { day: string; date: string; month: string } {
  // Parse without timezone offset issues
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);

  const dayName = d.toLocaleDateString("es-AR", { weekday: "short" });
  const dayNum = d.getDate().toString();
  const monthName = d.toLocaleDateString("es-AR", { month: "short" });

  return {
    day: dayName.charAt(0).toUpperCase() + dayName.slice(1).replace(".", ""),
    date: dayNum,
    month: monthName.charAt(0).toUpperCase() + monthName.slice(1).replace(".", ""),
  };
}

/**
 * Check if a "YYYY-MM-DD" string is today.
 */
function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

/**
 * Format an ISO datetime string as "HH:mm".
 */
function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ─── Skeleton components ──────────────────────────────────────────────────────

function DatePillSkeleton() {
  return <Skeleton className="h-[72px] w-14 shrink-0 rounded-2xl" />;
}

function SlotSkeleton() {
  return <Skeleton className="h-10 rounded-xl" />;
}

// ─── Date Pill ────────────────────────────────────────────────────────────────

type DatePillProps = {
  dateStr: string;
  isSelected: boolean;
  onSelect: () => void;
};

function DatePill({ dateStr, isSelected, onSelect }: DatePillProps) {
  const { day, date, month } = formatDatePill(dateStr);
  const today = isToday(dateStr);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-1 py-3 transition-all duration-150",
        "hover:shadow-sm active:scale-[0.97]",
        isSelected && "ring-2 shadow-sm"
      )}
      style={{
        borderColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
        backgroundColor: isSelected
          ? "color-mix(in srgb, var(--bf-brand-copper) 12%, var(--background))"
          : "var(--background)",
        // @ts-expect-error custom CSS property
        "--tw-ring-color": "var(--bf-brand-copper)",
      }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-soft)" }}
      >
        {day}
      </span>
      <span
        className="text-lg font-bold leading-none"
        style={{ color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-strong)" }}
      >
        {date}
      </span>
      <span
        className="text-[10px] font-medium"
        style={{ color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-soft)" }}
      >
        {month}
      </span>
      {today && (
        <span
          className="mt-0.5 rounded-full px-1.5 py-px text-[9px] font-bold"
          style={{
            backgroundColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
            color: isSelected ? "white" : "var(--bf-text-soft)",
          }}
        >
          {Texts.Booking.Common.Today}
        </span>
      )}
    </button>
  );
}

// ─── Slot Button ──────────────────────────────────────────────────────────────

type SlotButtonProps = {
  slot: PublicSlot;
  isSelected: boolean;
  onSelect: () => void;
};

function SlotButton({ slot, isSelected, onSelect }: SlotButtonProps) {
  const startLabel = formatTime(slot.start);
  const endLabel = formatTime(slot.end);

  if (!slot.available) {
    return (
      <div
        className="flex h-10 items-center justify-center rounded-xl border text-sm font-medium"
        style={{
          borderColor: "var(--bf-border-soft)",
          color: "var(--bf-text-soft)",
          backgroundColor: "var(--muted)",
          opacity: 0.4,
          cursor: "not-allowed",
        }}
      >
        {startLabel}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${startLabel} – ${endLabel}`}
      className={cn(
        "flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-all duration-150",
        "hover:shadow-sm active:scale-[0.97]",
        isSelected && "ring-2"
      )}
      style={{
        borderColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
        backgroundColor: isSelected ? "var(--bf-brand-copper)" : "var(--background)",
        color: isSelected ? "white" : "var(--bf-text-strong)",
        // @ts-expect-error custom CSS property
        "--tw-ring-color": "var(--bf-brand-copper)",
      }}
    >
      {startLabel}
    </button>
  );
}

// ─── Slot section (queries availability) ──────────────────────────────────────

type SlotSectionProps = {
  slug: string;
  /**
   * Pass the barber's GUID string for a specific barber, or "any" to get
   * merged availability across all barbers.
   */
  barberId: string;
  serviceId: string;
  selectedDate: string;
  selectedSlot: PublicSlot | undefined;
  onSelectSlot: (slot: PublicSlot) => void;
};

function SlotSection({
  slug,
  barberId,
  serviceId,
  selectedDate,
  selectedSlot,
  onSelectSlot,
}: SlotSectionProps) {
  const queryBarberId = barberId === "any" ? undefined : barberId;

  const { data: slots, isLoading, isError } = useGetPublicAvailabilityQuery({
    slug,
    barberId: queryBarberId,
    serviceId,
    date: selectedDate,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <SlotSkeleton key={n} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <AlertCircle className="h-8 w-8" style={{ color: "var(--bf-status-error-fg)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
          {Texts.Booking.DateTimeStep.SlotErrorTitle}
        </p>
        <p className="text-xs" style={{ color: "var(--bf-text-soft)" }}>
          {Texts.Booking.DateTimeStep.SlotErrorBody}
        </p>
      </div>
    );
  }

  const availableSlots = slots?.filter((s) => s.available) ?? [];

  if (!slots || availableSlots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Clock className="h-8 w-8" style={{ color: "var(--bf-text-soft)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
          {Texts.Booking.DateTimeStep.SlotEmptyTitle}
        </p>
        <p className="text-xs" style={{ color: "var(--bf-text-soft)" }}>
          {Texts.Booking.DateTimeStep.SlotEmptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => (
        <SlotButton
          key={slot.start}
          slot={slot}
          isSelected={selectedSlot?.start === slot.start}
          onSelect={() => slot.available && onSelectSlot(slot)}
        />
      ))}
    </div>
  );
}

// ─── "Any barber" slot handler ────────────────────────────────────────────────

/**
 * Inner component that handles slot selection in "any barber" mode.
 * It fetches the barber list so it can resolve a barberId → PublicBarber when
 * the user picks a slot.
 */
type AnyBarberSlotSectionProps = {
  slug: string;
  serviceId: string;
  selectedDate: string;
  selectedSlot: PublicSlot | undefined;
  onSelectSlot: (slot: PublicSlot) => void;
  onAutoSelectBarber: (barber: PublicBarber) => void;
};

function AnyBarberSlotSection({
  slug,
  serviceId,
  selectedDate,
  selectedSlot,
  onSelectSlot,
  onAutoSelectBarber,
}: AnyBarberSlotSectionProps) {
  const { data: barbers } = useGetPublicBarbersQuery({ slug });

  function handleSlotSelect(slot: PublicSlot) {
    onSelectSlot(slot);
    // If the slot carries a barberId, resolve and auto-assign the barber.
    if (slot.barberId && barbers) {
      const match = barbers.find((b) => b.id === slot.barberId);
      if (match) {
        onAutoSelectBarber(match);
      }
    }
  }

  return (
    <SlotSection
      slug={slug}
      barberId="any"
      serviceId={serviceId}
      selectedDate={selectedDate}
      selectedSlot={selectedSlot}
      onSelectSlot={handleSlotSelect}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const DATES_TO_SHOW = 14;

export function DateTimeStep({
  slug,
  selectedBarber,
  selectedService,
  selectedDate,
  selectedSlot,
  onSelectDate,
  onSelectSlot,
  onAutoSelectBarber,
  onNext,
  onBack,
}: DateTimeStepProps) {
  const { DateTimeStep: DT, Common: BC } = Texts.Booking;
  const dates = getUpcomingDates(DATES_TO_SHOW);
  const isAnyBarber = selectedBarber.id === "any";
  // In "any barber" mode, also require that the slot carries a barberId so we
  // know which barber will be assigned (auto-set via onAutoSelectBarber).
  const canProceed = Boolean(
    selectedDate &&
    selectedSlot &&
    (!isAnyBarber || selectedSlot.barberId)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--bf-text-strong)" }}>
          {DT.Title}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
          {DT.Subtitle}
        </p>
      </div>

      {/* Date picker */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: "var(--bf-brand-copper)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
            {DT.DateLabel}
          </span>
        </div>

        {/* Horizontally scrollable date strip */}
        <div className="relative">
          <div
            className="flex gap-2 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "none" }}
          >
            {dates.map((d) => (
              <DatePill
                key={d}
                dateStr={d}
                isSelected={selectedDate === d}
                onSelect={() => {
                  onSelectDate(d);
                  // Clear slot when date changes
                  if (selectedSlot) {
                    onSelectSlot({ start: "", end: "", available: false });
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" style={{ color: "var(--bf-brand-copper)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--bf-text-strong)" }}>
              {DT.TimeLabel}
            </span>
          </div>

          {isAnyBarber ? (
            <AnyBarberSlotSection
              slug={slug}
              serviceId={selectedService.id}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              onSelectSlot={onSelectSlot}
              onAutoSelectBarber={onAutoSelectBarber}
            />
          ) : (
            <SlotSection
              slug={slug}
              barberId={selectedBarber.id}
              serviceId={selectedService.id}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              onSelectSlot={onSelectSlot}
            />
          )}
        </div>
      )}

      {/* Prompt to pick a date first */}
      {!selectedDate && (
        <div
          className="flex items-center gap-2 rounded-2xl border border-dashed p-4"
          style={{ borderColor: "var(--bf-border-soft)" }}
        >
          <ChevronRight
            className="h-4 w-4 shrink-0"
            style={{ color: "var(--bf-text-soft)" }}
          />
          <p className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
            {DT.PickDatePrompt}
          </p>
        </div>
      )}

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
          onClick={onNext}
          disabled={!canProceed}
          className={cn(
            "rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150",
            canProceed
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
