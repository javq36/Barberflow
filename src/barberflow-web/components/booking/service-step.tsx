"use client";

import { Clock3, Scissors, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetPublicServicesQuery,
  type PublicService,
} from "@/lib/api/public-api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStepProps = {
  slug: string;
  selectedService: PublicService | undefined;
  onSelect: (service: PublicService) => void;
  onNext: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}min` : `${hours}h`;
}

// ─── Skeleton Cards ───────────────────────────────────────────────────────────

function ServiceCardSkeleton() {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--bf-border-soft)" }}>
      <div className="mb-4 flex items-start gap-4">
        <Skeleton className="h-14 w-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-1/3" />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ServiceStep({
  slug,
  selectedService,
  onSelect,
  onNext,
}: ServiceStepProps) {
  const { data: services, isLoading, isError } = useGetPublicServicesQuery({ slug });

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold" style={{ color: "var(--bf-text-strong)" }}>
            ¿Qué servicio buscás?
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
            Seleccioná el servicio que querés reservar
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <ServiceCardSkeleton key={n} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (isError || !services) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="h-10 w-10" style={{ color: "var(--bf-status-error-fg)" }} />
        <p className="text-base font-semibold" style={{ color: "var(--bf-text-strong)" }}>
          No pudimos cargar los servicios
        </p>
        <p className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
          Intentá recargar la página o contactá a la barbería
        </p>
      </div>
    );
  }

  // ── Empty state ──
  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Scissors className="h-10 w-10" style={{ color: "var(--bf-text-soft)" }} />
        <p className="text-base font-semibold" style={{ color: "var(--bf-text-strong)" }}>
          No hay servicios disponibles
        </p>
        <p className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
          Esta barbería no tiene servicios activos por el momento
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold" style={{ color: "var(--bf-text-strong)" }}>
          ¿Qué servicio buscás?
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--bf-text-soft)" }}>
          Seleccioná el servicio que querés reservar
        </p>
      </div>

      {/* Service cards grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {services.map((service) => {
          const isSelected = selectedService?.id === service.id;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSelect(service)}
              className={cn(
                "group relative w-full rounded-2xl border p-5 text-left transition-all duration-150",
                "hover:shadow-md active:scale-[0.98]",
                isSelected
                  ? "ring-2 shadow-md"
                  : "hover:border-opacity-60"
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
              {/* Selected indicator */}
              {isSelected && (
                <span
                  className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full text-xs"
                  style={{
                    backgroundColor: "var(--bf-brand-copper)",
                    color: "white",
                  }}
                >
                  ✓
                </span>
              )}

              <div className="flex items-start gap-4">
                {/* Icon / Image */}
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                  style={{
                    backgroundColor: isSelected
                      ? "color-mix(in srgb, var(--bf-brand-copper) 18%, var(--background))"
                      : "var(--muted)",
                  }}
                >
                  {service.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={service.imageUrl}
                      alt={service.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Scissors
                      className="h-6 w-6"
                      style={{
                        color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-soft)",
                      }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-base font-semibold"
                    style={{ color: "var(--bf-text-strong)" }}
                  >
                    {service.name}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Clock3
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--bf-text-soft)" }}
                    />
                    <span className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
                      {formatDuration(service.durationMinutes)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="mt-4">
                <span
                  className="text-lg font-bold"
                  style={{
                    color: isSelected ? "var(--bf-brand-copper)" : "var(--bf-text-strong)",
                  }}
                >
                  {formatPrice(service.price)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!selectedService}
          className={cn(
            "rounded-xl px-8 py-3 text-sm font-semibold transition-all duration-150",
            selectedService
              ? "hover:opacity-90 active:scale-[0.98]"
              : "cursor-not-allowed opacity-40"
          )}
          style={{
            backgroundColor: "var(--bf-brand-copper)",
            color: "white",
          }}
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}
