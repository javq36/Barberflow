"use client";

import { User2, AlertCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetPublicBarbersQuery,
  type PublicBarber,
} from "@/lib/api/public-api";
import { Texts } from "@/lib/content/texts";

// ─── Types ────────────────────────────────────────────────────────────────────

// Sentinel value representing "any available barber"
export const ANY_BARBER: PublicBarber = {
  id: "any",
  name: Texts.Booking.BarberStep.AnyBarberName,
};

type BarberStepProps = {
  slug: string;
  selectedBarber: PublicBarber | undefined;
  onSelect: (barber: PublicBarber) => void;
  onNext: () => void;
  onBack: () => void;
};

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function BarberCardSkeleton() {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--bf-border-soft)" }}>
      <div className="flex flex-col items-center gap-3 text-center">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    </div>
  );
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

type BarberAvatarProps = {
  barber: PublicBarber;
  isSelected: boolean;
  isAny?: boolean;
};

function BarberAvatar({ barber, isSelected, isAny = false }: BarberAvatarProps) {
  if (isAny) {
    return (
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full border-2"
        style={{
          borderColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
          backgroundColor: isSelected
            ? "color-mix(in srgb, var(--bf-brand-copper) 18%, var(--background))"
            : "var(--muted)",
        }}
      >
        <Users
          className="h-7 w-7"
          style={{ color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-soft)" }}
        />
      </div>
    );
  }

  if (barber.imageUrl) {
    return (
      <div
        className="h-16 w-16 overflow-hidden rounded-full border-2"
        style={{
          borderColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={barber.imageUrl}
          alt={barber.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-full border-2"
      style={{
        borderColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
        backgroundColor: isSelected
          ? "color-mix(in srgb, var(--bf-brand-copper) 18%, var(--background))"
          : "var(--muted)",
      }}
    >
      <User2
        className="h-7 w-7"
        style={{ color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-soft)" }}
      />
    </div>
  );
}

// ─── Barber Card ──────────────────────────────────────────────────────────────

type BarberCardProps = {
  barber: PublicBarber;
  isSelected: boolean;
  onSelect: () => void;
  isAny?: boolean;
};

function BarberCard({ barber, isSelected, onSelect, isAny = false }: BarberCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative w-full rounded-2xl border p-5 text-center transition-all duration-150",
        "hover:shadow-md active:scale-[0.98]",
        isSelected && "ring-2 shadow-md"
      )}
      style={{
        borderColor: isSelected ? "var(--bf-brand-copper)" : "var(--bf-border-soft)",
        backgroundColor: isSelected
          ? "color-mix(in srgb, var(--bf-brand-copper) 8%, var(--background))"
          : "var(--background)",
        // @ts-expect-error custom CSS property
        "--tw-ring-color": "var(--bf-brand-copper)",
      }}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <span
          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-xs"
          style={{ backgroundColor: "var(--bf-brand-copper)", color: "white" }}
        >
          ✓
        </span>
      )}

      <div className="flex flex-col items-center gap-3">
        <BarberAvatar barber={barber} isSelected={isSelected} isAny={isAny} />
        <div>
          <p
            className={cn(
              "text-sm font-semibold leading-snug",
              isAny && "italic"
            )}
            style={{ color: "var(--bf-text-strong)" }}
          >
            {barber.name}
          </p>
          {isAny && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--bf-text-soft)" }}>
              {Texts.Booking.BarberStep.AnyBarberHint}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BarberStep({
  slug,
  selectedBarber,
  onSelect,
  onNext,
  onBack,
}: BarberStepProps) {
  const { BarberStep: BS, Common: BC } = Texts.Booking;
  const { data: barbers, isLoading, isError } = useGetPublicBarbersQuery({ slug });

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold" style={{ color: "var(--bf-text-strong)" }}>
            {BS.Title}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
            {BS.Subtitle}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <BarberCardSkeleton key={n} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (isError || !barbers) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="h-10 w-10" style={{ color: "var(--bf-status-error-fg)" }} />
        <p className="text-base font-semibold" style={{ color: "var(--bf-text-strong)" }}>
          {BS.ErrorTitle}
        </p>
        <p className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
          {BS.ErrorBody}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--bf-text-strong)" }}>
          {BS.Title}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
          {BS.Subtitle}
        </p>
      </div>

      {/* Barber cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* "Any barber" option — always first */}
        <BarberCard
          barber={ANY_BARBER}
          isSelected={selectedBarber?.id === ANY_BARBER.id}
          onSelect={() => onSelect(ANY_BARBER)}
          isAny
        />

        {barbers.map((barber) => (
          <BarberCard
            key={barber.id}
            barber={barber}
            isSelected={selectedBarber?.id === barber.id}
            onSelect={() => onSelect(barber)}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl px-6 py-3 text-sm font-medium transition-all duration-150 hover:opacity-80"
          style={{ color: "var(--bf-text-body)" }}
        >
          {BC.Back}
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedBarber}
          className={cn(
            "rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150",
            selectedBarber
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
