"use client";

import { useState } from "react";
import {
  ChevronRight,
  Clock,
  Save,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  WorkingHourItem,
  useGetWorkingHoursQuery,
  useUpsertWorkingHourMutation,
} from "@/lib/api/working-hours-api";
import {
  BarberItem,
  useGetBarbersQuery,
} from "@/lib/api/owner-admin-api";
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";
import { APP_ROUTES } from "@/lib/config/app";
import { useAppToast } from "@/lib/toast/toast-provider";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// ─── Day Configuration ────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
] as const;

type DayValue = (typeof DAYS_OF_WEEK)[number]["value"];

// ─── Local State Types ────────────────────────────────────────────────────────

type DaySchedule = {
  dayOfWeek: DayValue;
  startTime: string;
  endTime: string;
  isActive: boolean;
  existingId?: string;
};

type DayValidationError = {
  startTime?: string;
  endTime?: string;
};

type ScheduleMap = Record<DayValue, DaySchedule>;
type ValidationMap = Record<DayValue, DayValidationError>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";

function buildScheduleMap(serverData: WorkingHourItem[]): ScheduleMap {
  const map = Object.fromEntries(
    DAYS_OF_WEEK.map(({ value }) => [
      value,
      {
        dayOfWeek: value,
        startTime: DEFAULT_START,
        endTime: DEFAULT_END,
        isActive: false,
        existingId: undefined,
      } satisfies DaySchedule,
    ]),
  ) as ScheduleMap;

  for (const item of serverData) {
    const day = item.dayOfWeek as DayValue;
    if (day in map) {
      map[day] = {
        dayOfWeek: day,
        startTime: item.startTime,
        endTime: item.endTime,
        isActive: item.isActive,
        existingId: item.id,
      };
    }
  }

  return map;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function validateScheduleMap(scheduleMap: ScheduleMap): ValidationMap {
  const errors: ValidationMap = {} as ValidationMap;

  for (const { value } of DAYS_OF_WEEK) {
    const day = scheduleMap[value];
    const dayErrors: DayValidationError = {};

    if (day.isActive) {
      if (!day.startTime) {
        dayErrors.startTime = "La hora de inicio es requerida.";
      }
      if (!day.endTime) {
        dayErrors.endTime = "La hora de fin es requerida.";
      }
      if (
        day.startTime &&
        day.endTime &&
        timeToMinutes(day.endTime) <= timeToMinutes(day.startTime)
      ) {
        dayErrors.endTime = "La hora de fin debe ser posterior al inicio.";
      }
    }

    errors[value] = dayErrors;
  }

  return errors;
}

function hasValidationErrors(errors: ValidationMap): boolean {
  return DAYS_OF_WEEK.some(({ value }) => {
    const e = errors[value];
    return Boolean(e.startTime ?? e.endTime);
  });
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

type DayRowProps = {
  day: DaySchedule;
  label: string;
  errors: DayValidationError;
  onToggle: () => void;
  onStartChange: (time: string) => void;
  onEndChange: (time: string) => void;
};

function DayRow({
  day,
  label,
  errors,
  onToggle,
  onStartChange,
  onEndChange,
}: DayRowProps) {
  const isDisabled = !day.isActive;

  return (
    <div
      className={cn(
        "grid grid-cols-[140px_56px_1fr_1fr] items-start gap-4 rounded-lg border px-5 py-4 transition-colors",
        isDisabled
          ? "border-slate-800 bg-slate-900/30 opacity-60"
          : "border-slate-700 bg-slate-800/20",
      )}
    >
      {/* Day name */}
      <span className="pt-1 text-sm font-semibold text-slate-200">{label}</span>

      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${isDisabled ? "Activar" : "Desactivar"} ${label}`}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
          isDisabled ? "bg-slate-700" : "bg-emerald-500",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            isDisabled ? "translate-x-0.5" : "translate-x-5",
          )}
        />
      </button>

      {/* Start time */}
      <div className="flex flex-col gap-1">
        <input
          type="time"
          value={day.startTime}
          onChange={(e) => onStartChange(e.target.value)}
          disabled={isDisabled}
          className={cn(
            "h-9 w-full rounded border bg-[#121212] px-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-40",
            errors.startTime ? "border-red-500" : "border-slate-700",
          )}
        />
        {errors.startTime ? (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {errors.startTime}
          </p>
        ) : null}
      </div>

      {/* End time */}
      <div className="flex flex-col gap-1">
        <input
          type="time"
          value={day.endTime}
          onChange={(e) => onEndChange(e.target.value)}
          disabled={isDisabled}
          className={cn(
            "h-9 w-full rounded border bg-[#121212] px-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-40",
            errors.endTime ? "border-red-500" : "border-slate-700",
          )}
        />
        {errors.endTime ? (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {errors.endTime}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Barber Selector ──────────────────────────────────────────────────────────

type BarberSelectorProps = {
  barbers: BarberItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function BarberSelector({ barbers, selectedId, onSelect }: BarberSelectorProps) {
  return (
    <div className="mb-6">
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
        Barbero
      </label>
      <select
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="h-10 w-full max-w-xs rounded border border-slate-700 bg-[#121212] px-3 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
      >
        <option value="" disabled>
          Seleccionar barbero...
        </option>
        {barbers.map((barber) => (
          <option key={barber.id} value={barber.id}>
            {barber.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Schedule Grid ────────────────────────────────────────────────────────────

type WeeklyScheduleGridProps = {
  scheduleMap: ScheduleMap;
  validationErrors: ValidationMap;
  isSaving: boolean;
  onToggleDay: (day: DayValue) => void;
  onStartChange: (day: DayValue, time: string) => void;
  onEndChange: (day: DayValue, time: string) => void;
  onSave: () => void;
};

function WeeklyScheduleGrid({
  scheduleMap,
  validationErrors,
  isSaving,
  onToggleDay,
  onStartChange,
  onEndChange,
  onSave,
}: WeeklyScheduleGridProps) {
  const hasErrors = hasValidationErrors(validationErrors);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-800/10">
      {/* Column headers */}
      <div className="grid grid-cols-[140px_56px_1fr_1fr] gap-4 border-b border-slate-800 px-5 py-3">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">
          Día
        </span>
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">
          Activo
        </span>
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">
          Apertura
        </span>
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">
          Cierre
        </span>
      </div>

      {/* Day rows */}
      <div className="space-y-2 p-4">
        {DAYS_OF_WEEK.map(({ value, label }) => (
          <DayRow
            key={value}
            day={scheduleMap[value]}
            label={label}
            errors={validationErrors[value]}
            onToggle={() => onToggleDay(value)}
            onStartChange={(time) => onStartChange(value, time)}
            onEndChange={(time) => onEndChange(value, time)}
          />
        ))}
      </div>

      {/* Footer with save */}
      <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
        {hasErrors ? (
          <p className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-4 w-4" />
            Corrige los errores antes de guardar.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Los cambios se aplicarán a los turnos futuros.
          </p>
        )}
        <LoadingButton
          type="button"
          onClick={onSave}
          isLoading={isSaving}
          loadingText="Guardando..."
          disabled={hasErrors}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold",
            hasErrors
              ? "cursor-not-allowed bg-slate-700 text-slate-400"
              : "bg-slate-100 text-slate-900 hover:bg-white",
          )}
        >
          <Save className="h-4 w-4" />
          Guardar horarios
        </LoadingButton>
      </div>
    </div>
  );
}

// ─── Main Section Component ───────────────────────────────────────────────────

type WorkingHoursSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

export function WorkingHoursSection({
  canOperate,
  role,
}: WorkingHoursSectionProps) {
  const router = useRouter();
  const { showToast } = useAppToast();

  const barbersQuery = useGetBarbersQuery(undefined, { skip: !canOperate });
  const barbers = barbersQuery.data ?? [];

  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(
    barbers[0]?.id ?? null,
  );

  const activeBarbers = barbers.filter((b) => b.isActive);
  const resolvedBarberId = selectedBarberId ?? activeBarbers[0]?.id ?? null;

  const workingHoursQuery = useGetWorkingHoursQuery(resolvedBarberId ?? "", {
    skip: !resolvedBarberId || !canOperate,
  });

  const [upsertWorkingHour, upsertState] = useUpsertWorkingHourMutation();

  // Local schedule state — derived from server data
  const [scheduleOverride, setScheduleOverride] = useState<ScheduleMap | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationMap>(
    () =>
      Object.fromEntries(DAYS_OF_WEEK.map(({ value }) => [value, {}])) as ValidationMap,
  );

  const serverScheduleMap = workingHoursQuery.data
    ? buildScheduleMap(workingHoursQuery.data)
    : null;

  const scheduleMap: ScheduleMap =
    scheduleOverride ??
    serverScheduleMap ??
    (Object.fromEntries(
      DAYS_OF_WEEK.map(({ value }) => [
        value,
        {
          dayOfWeek: value,
          startTime: DEFAULT_START,
          endTime: DEFAULT_END,
          isActive: false,
        } satisfies DaySchedule,
      ]),
    ) as ScheduleMap);

  // Reset local override when barber changes
  function handleSelectBarber(id: string): void {
    setSelectedBarberId(id);
    setScheduleOverride(null);
    setValidationErrors(
      Object.fromEntries(DAYS_OF_WEEK.map(({ value }) => [value, {}])) as ValidationMap,
    );
  }

  function updateDay(day: DayValue, patch: Partial<DaySchedule>): void {
    const current = scheduleOverride ?? scheduleMap;
    const next: ScheduleMap = {
      ...current,
      [day]: { ...current[day], ...patch },
    };
    setScheduleOverride(next);

    // Re-validate only this day
    const errors = validateScheduleMap(next);
    setValidationErrors(errors);
  }

  function handleToggleDay(day: DayValue): void {
    updateDay(day, { isActive: !scheduleMap[day].isActive });
  }

  function handleStartChange(day: DayValue, time: string): void {
    updateDay(day, { startTime: time });
  }

  function handleEndChange(day: DayValue, time: string): void {
    updateDay(day, { endTime: time });
  }

  async function handleSave(): Promise<void> {
    if (!resolvedBarberId) {
      return;
    }

    const errors = validateScheduleMap(scheduleMap);
    setValidationErrors(errors);

    if (hasValidationErrors(errors)) {
      showToast({
        title: "Operacion fallida",
        description: "Corrige los errores antes de guardar.",
        variant: "error",
      });
      return;
    }

    // Optimistic: commit local state immediately, capture snapshot for rollback
    const snapshot = scheduleOverride ?? buildScheduleMap(workingHoursQuery.data ?? []);

    try {
      const requests = DAYS_OF_WEEK.map(({ value }) =>
        upsertWorkingHour({
          barberId: resolvedBarberId,
          dayOfWeek: value,
          startTime: scheduleMap[value].startTime,
          endTime: scheduleMap[value].endTime,
          isActive: scheduleMap[value].isActive,
        }).unwrap(),
      );

      await Promise.all(requests);

      setScheduleOverride(null); // Reset to server data after successful save
      showToast({
        title: "Operacion completada",
        description: "Horarios guardados correctamente.",
        variant: "success",
      });
    } catch (error) {
      // Rollback to snapshot
      setScheduleOverride(snapshot);
      showToast({
        title: "Operacion fallida",
        description:
          getApiErrorMessage(error) ?? "No se pudieron guardar los horarios.",
        variant: "error",
      });
    }
  }

  const isLoadingBarbers = barbersQuery.isLoading;
  const isLoadingHours = workingHoursQuery.isLoading;

  // ─── Desktop Body ────────────────────────────────────────────────────────────

  const desktopBody = (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mb-8">
        <h2 className="mb-2 text-3xl font-black">Horarios de trabajo</h2>
        <p className="text-slate-400">
          Configurá los horarios de atención de cada barbero para cada día de la
          semana.
        </p>
      </div>

      {isLoadingBarbers ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando barberos...
        </div>
      ) : activeBarbers.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-800/10 p-8 text-center text-sm text-slate-400">
          No hay barberos activos. Creá un barbero primero.
        </div>
      ) : (
        <>
          <BarberSelector
            barbers={activeBarbers}
            selectedId={resolvedBarberId}
            onSelect={handleSelectBarber}
          />

          {isLoadingHours ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando horarios...
            </div>
          ) : (
            <WeeklyScheduleGrid
              scheduleMap={scheduleMap}
              validationErrors={validationErrors}
              isSaving={upsertState.isLoading}
              onToggleDay={handleToggleDay}
              onStartChange={handleStartChange}
              onEndChange={handleEndChange}
              onSave={handleSave}
            />
          )}
        </>
      )}
    </div>
  );

  // ─── Mobile Body ─────────────────────────────────────────────────────────────

  const mobileBody = (
    <main className="flex-1 overflow-y-auto pb-24">
      <div className="p-4">
        <h2 className="mb-1 text-2xl font-bold">Horarios</h2>
        <p className="mb-6 text-sm text-slate-400">
          Configurá la disponibilidad por día.
        </p>

        {isLoadingBarbers ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando...
          </div>
        ) : activeBarbers.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-800/10 p-6 text-center text-sm text-slate-400">
            No hay barberos activos.
          </div>
        ) : (
          <>
            <BarberSelector
              barbers={activeBarbers}
              selectedId={resolvedBarberId}
              onSelect={handleSelectBarber}
            />

            {isLoadingHours ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando horarios...
              </div>
            ) : (
              <div className="space-y-2">
                {DAYS_OF_WEEK.map(({ value, label }) => {
                  const day = scheduleMap[value];
                  const errors = validationErrors[value];
                  return (
                    <div
                      key={value}
                      className={cn(
                        "rounded-xl border p-4 transition-colors",
                        !day.isActive
                          ? "border-slate-800 bg-slate-900/30 opacity-60"
                          : "border-slate-700 bg-slate-800/20",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-semibold text-slate-200">
                          {label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleDay(value)}
                          aria-label={`${!day.isActive ? "Activar" : "Desactivar"} ${label}`}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                            !day.isActive ? "bg-slate-700" : "bg-emerald-500",
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                              !day.isActive ? "translate-x-0.5" : "translate-x-5",
                            )}
                          />
                        </button>
                      </div>

                      {day.isActive ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-500">
                              Apertura
                            </label>
                            <input
                              type="time"
                              value={day.startTime}
                              onChange={(e) =>
                                handleStartChange(value, e.target.value)
                              }
                              className={cn(
                                "h-9 w-full rounded border bg-[#121212] px-2 text-sm text-slate-100",
                                errors.startTime
                                  ? "border-red-500"
                                  : "border-slate-700",
                              )}
                            />
                            {errors.startTime ? (
                              <p className="text-xs text-red-400">
                                {errors.startTime}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-500">
                              Cierre
                            </label>
                            <input
                              type="time"
                              value={day.endTime}
                              onChange={(e) =>
                                handleEndChange(value, e.target.value)
                              }
                              className={cn(
                                "h-9 w-full rounded border bg-[#121212] px-2 text-sm text-slate-100",
                                errors.endTime
                                  ? "border-red-500"
                                  : "border-slate-700",
                              )}
                            />
                            {errors.endTime ? (
                              <p className="text-xs text-red-400">
                                {errors.endTime}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Día cerrado</p>
                      )}
                    </div>
                  );
                })}

                <div className="pt-4">
                  <LoadingButton
                    type="button"
                    onClick={handleSave}
                    isLoading={upsertState.isLoading}
                    loadingText="Guardando..."
                    disabled={hasValidationErrors(validationErrors)}
                    className="w-full rounded-lg bg-slate-100 py-3 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Guardar horarios
                  </LoadingButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );

  return (
    <RoleWorkspaceShell
      canOperate={canOperate}
      disabledMessage="Necesitás una barbería activa para configurar horarios."
      role={role}
      activeItemId="working-hours"
      onNavigate={(href) => router.push(href)}
      brandTitle="BarberFlow"
      brandSubtitle="Configuración"
      desktopHeader={
        <header className="flex h-16 items-center gap-3 border-b border-slate-800 bg-[#191919]/50 px-8 backdrop-blur-md">
          <Clock className="h-5 w-5 text-slate-400" />
          <div>
            <h1 className="text-sm font-bold">Horarios de trabajo</h1>
            <p className="text-xs text-slate-500">
              Administrá la disponibilidad por barbero
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
          <h1 className="text-xl font-bold">Horarios</h1>
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
            <Clock className="h-4 w-4" />
            <p className="text-[10px] font-medium">Dashboard</p>
          </button>
        </nav>
      }
    />
  );
}
