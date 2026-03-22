"use client";

import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { Scissors } from "lucide-react";
import { ServiceStep } from "@/components/booking/service-step";
import { BarberStep } from "@/components/booking/barber-step";
import { DateTimeStep } from "@/components/booking/datetime-step";
import { ContactStep } from "@/components/booking/contact-step";
import { ConfirmationStep } from "@/components/booking/confirmation-step";
import { useGetPublicServicesQuery, type PublicBarber, type PublicService, type PublicSlot } from "@/lib/api/public-api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5;

type WizardState = {
  step: WizardStep;
  selectedService?: PublicService;
  selectedBarber?: PublicBarber;
  selectedDate?: string;
  selectedSlot?: PublicSlot;
  customerName?: string;
  customerPhone?: string;
};

// ─── Step label map ───────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  1: "Servicio",
  2: "Barbero",
  3: "Fecha y hora",
  4: "Tus datos",
  5: "Confirmación",
};

const TOTAL_STEPS = 5;

// ─── Step indicator ───────────────────────────────────────────────────────────

type StepIndicatorProps = {
  currentStep: WizardStep;
};

function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="w-full">
      {/* Progress bar */}
      <div
        className="mb-3 h-1 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--bf-border-soft)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${(currentStep / TOTAL_STEPS) * 100}%`,
            backgroundColor: "var(--bf-brand-copper)",
          }}
        />
      </div>

      {/* Step dots + labels */}
      <div className="flex items-center justify-between">
        {(Object.keys(STEP_LABELS) as unknown as WizardStep[]).map((step) => {
          const stepNum = Number(step) as WizardStep;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <div key={stepNum} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                  isCompleted && "text-white",
                  isCurrent && "text-white ring-2 ring-offset-2",
                  !isCompleted && !isCurrent && "text-sm"
                )}
                style={{
                  backgroundColor: isCompleted || isCurrent
                    ? "var(--bf-brand-copper)"
                    : "var(--bf-border-soft)",
                  color: isCompleted || isCurrent ? "white" : "var(--bf-text-soft)",
                  // @ts-expect-error custom CSS property
                  "--tw-ring-color": "var(--bf-brand-copper)",
                  "--tw-ring-offset-color": "var(--background)",
                }}
              >
                {isCompleted ? "✓" : stepNum}
              </div>
              <span
                className="hidden text-[10px] font-medium sm:block"
                style={{
                  color: isCurrent ? "var(--bf-brand-copper)" : "var(--bf-text-soft)",
                }}
              >
                {STEP_LABELS[stepNum]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile step label */}
      <p className="mt-2 text-center text-xs sm:hidden" style={{ color: "var(--bf-text-soft)" }}>
        Paso {currentStep} de {TOTAL_STEPS} — {STEP_LABELS[currentStep]}
      </p>
    </div>
  );
}

// ─── 404 Guard component (client-side) ────────────────────────────────────────

// We fetch services as a slug-validation probe. If the backend returns 404,
// the RTK Query slice will expose `isError` + status 404 in `error`.
type SlugGuardProps = {
  slug: string;
  children: React.ReactNode;
};

function SlugGuard({ slug, children }: SlugGuardProps) {
  const { data, isLoading, isError, error } = useGetPublicServicesQuery({ slug });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent"
            style={{ borderColor: "var(--bf-border-soft)", borderTopColor: "var(--bf-brand-copper)" }}
          />
          <p className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
            Cargando...
          </p>
        </div>
      </div>
    );
  }

  // 404 from the backend means slug doesn't exist
  const is404 =
    isError &&
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404;

  if (is404 || (isError && !data)) {
    notFound();
  }

  return <>{children}</>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookingWizardPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [wizard, setWizard] = useState<WizardState>({ step: 1 });

  function goToStep(step: WizardStep) {
    setWizard((prev) => ({ ...prev, step }));
  }

  function selectService(service: PublicService) {
    setWizard((prev) => ({ ...prev, selectedService: service }));
  }

  function selectBarber(barber: PublicBarber) {
    setWizard((prev) => ({ ...prev, selectedBarber: barber }));
  }

  function selectDate(date: string) {
    // Clear slot when date changes so stale selection isn't carried over
    setWizard((prev) => ({ ...prev, selectedDate: date, selectedSlot: undefined }));
  }

  function selectSlot(slot: PublicSlot) {
    // Guard against the "clear" sentinel emitted when date changes
    if (!slot.start) return;
    setWizard((prev) => ({ ...prev, selectedSlot: slot }));
  }

  function changeCustomerName(name: string) {
    setWizard((prev) => ({ ...prev, customerName: name }));
  }

  function changeCustomerPhone(phone: string) {
    setWizard((prev) => ({ ...prev, customerPhone: phone }));
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--background)" }}
    >
      {/* Atmosphere layer (same brand gradient as dashboard) */}
      <div className="dashboard-atmosphere" aria-hidden="true" />

      {/* Page container */}
      <div className="relative mx-auto max-w-lg px-4 py-8 sm:px-6">
        {/* Branding header */}
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: "var(--bf-brand-copper)",
              color: "white",
            }}
          >
            <Scissors className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "var(--bf-text-strong)" }}>
            Reservá tu turno
          </h1>
          <p className="text-sm" style={{ color: "var(--bf-text-soft)" }}>
            Rápido, fácil y sin llamadas
          </p>
        </div>

        {/* Wizard card */}
        <SlugGuard slug={slug}>
          <div
            className="rounded-3xl border p-6 shadow-xl backdrop-blur-sm sm:p-8"
            style={{
              backgroundColor: "var(--bf-surface-panel-strong)",
              borderColor: "var(--bf-border-soft)",
            }}
          >
            {/* Step indicator */}
            <div className="mb-8">
              <StepIndicator currentStep={wizard.step} />
            </div>

            {/* Step content */}
            {wizard.step === 1 && (
              <ServiceStep
                slug={slug}
                selectedService={wizard.selectedService}
                onSelect={selectService}
                onNext={() => goToStep(2)}
              />
            )}

            {wizard.step === 2 && (
              <BarberStep
                slug={slug}
                selectedBarber={wizard.selectedBarber}
                onSelect={selectBarber}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
              />
            )}

            {wizard.step === 3 && wizard.selectedBarber && wizard.selectedService && (
              <DateTimeStep
                slug={slug}
                selectedBarber={wizard.selectedBarber}
                selectedService={wizard.selectedService}
                selectedDate={wizard.selectedDate}
                selectedSlot={wizard.selectedSlot}
                onSelectDate={selectDate}
                onSelectSlot={selectSlot}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}

            {wizard.step === 4 && (
              <ContactStep
                customerName={wizard.customerName ?? ""}
                customerPhone={wizard.customerPhone ?? ""}
                onChangeName={changeCustomerName}
                onChangePhone={changeCustomerPhone}
                onNext={() => goToStep(5)}
                onBack={() => goToStep(3)}
              />
            )}

            {wizard.step === 5 &&
              wizard.selectedService &&
              wizard.selectedBarber &&
              wizard.selectedDate &&
              wizard.selectedSlot && (
                <ConfirmationStep
                  slug={slug}
                  selectedService={wizard.selectedService}
                  selectedBarber={wizard.selectedBarber}
                  selectedDate={wizard.selectedDate}
                  selectedSlot={wizard.selectedSlot}
                  customerName={wizard.customerName ?? ""}
                  customerPhone={wizard.customerPhone ?? ""}
                  onBack={() => goToStep(4)}
                  onGoToStep={(step) => goToStep(step as WizardStep)}
                />
              )}
          </div>
        </SlugGuard>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs" style={{ color: "var(--bf-text-soft)" }}>
          Tu información es privada y solo se usa para confirmar tu turno
        </p>
      </div>
    </div>
  );
}
