"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
} from "lucide-react";
import { useGetSessionQuery, useLogoutMutation } from "@/lib/api/authApi";
import {
  AppointmentItem,
  useGetAppointmentsQuery,
  useUpdateAppointmentStatusMutation,
} from "@/lib/api/owner-admin-api";
import { LoadingButton } from "@/components/ui/loading-button";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";
import { getApiErrorMessage } from "@/lib/api/error";

// ─── Status constants ──────────────────────────────────────────────────────────

const APPOINTMENT_STATUS = {
  Pending: 1,
  Confirmed: 2,
  Cancelled: 3,
  Completed: 4,
} as const;

type AppointmentStatus = (typeof APPOINTMENT_STATUS)[keyof typeof APPOINTMENT_STATUS];

// ─── Date helpers ──────────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimeRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

function parseApiDateTime(value: string): Date {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

// ─── Status badge ──────────────────────────────────────────────────────────────

type StatusBadgeProps = {
  status: number;
};

function StatusBadge({ status }: StatusBadgeProps) {
  const { Schedule } = Texts;

  const config = useMemo(() => {
    switch (status) {
      case APPOINTMENT_STATUS.Pending:
        return {
          label: Schedule.Status.Pending,
          className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        };
      case APPOINTMENT_STATUS.Confirmed:
        return {
          label: Schedule.Status.Confirmed,
          className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        };
      case APPOINTMENT_STATUS.Completed:
        return {
          label: Schedule.Status.Completed,
          className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        };
      case APPOINTMENT_STATUS.Cancelled:
        return {
          label: Schedule.Status.Canceled,
          className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
        };
      default:
        return {
          label: Schedule.Status.Unknown,
          className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
        };
    }
  }, [status, Schedule.Status]);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ─── Appointment card ──────────────────────────────────────────────────────────

type AppointmentCardProps = {
  item: AppointmentItem;
  onComplete: (id: string) => void;
  isCompleting: boolean;
};

function AppointmentCard({ item, onComplete, isCompleting }: AppointmentCardProps) {
  const { Schedule } = Texts;
  const startDate = parseApiDateTime(item.appointmentTime);
  const endDate = parseApiDateTime(item.endTime);
  const canComplete = item.status === APPOINTMENT_STATUS.Pending || item.status === APPOINTMENT_STATUS.Confirmed;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-800 bg-[#1f1f1f] transition-colors hover:border-slate-700">
      <div className="flex items-start gap-4 p-4">
        {/* Time column */}
        <div className="flex w-20 shrink-0 flex-col items-center rounded-lg bg-[#262626] p-3 text-center">
          <Clock3 className="mb-1 h-4 w-4 text-[#E8611C]" />
          <span className="text-[11px] font-bold text-white">
            {new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(startDate)}
          </span>
          <span className="text-[9px] text-slate-500">
            {new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(endDate)}
          </span>
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                {item.customerName}
              </p>
              <p className="truncate text-xs text-slate-400">
                {item.serviceName}
              </p>
            </div>
            <StatusBadge status={item.status} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {formatTimeRange(startDate, endDate)}
            </span>

            {canComplete && (
              <button
                type="button"
                disabled={isCompleting}
                onClick={() => onComplete(item.id)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-400 transition hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {Schedule.Actions.Complete}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function BarberSchedulePage() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const { Common, Schedule, SharedShell } = Texts;
  const hasHandledGuard = useRef(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();
  const isAuthenticated = session?.authenticated ?? false;
  const role = session?.role ?? null;

  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const viewFrom = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const viewTo = useMemo(() => addDays(viewFrom, 1), [viewFrom]);

  const appointmentsQuery = useGetAppointmentsQuery({
    from: viewFrom.toISOString(),
    to: viewTo.toISOString(),
  });

  const [updateStatus] = useUpdateAppointmentStatusMutation();
  const [logout, logoutState] = useLogoutMutation();

  // ─── Auth guard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!isAuthenticated && !hasHandledGuard.current) {
      hasHandledGuard.current = true;
      showToast({
        title: Common.Toasts.SessionExpiredTitle,
        description: Common.Toasts.SessionExpiredDescription,
        variant: "info",
      });
      router.replace(APP_ROUTES.Login);
      return;
    }

    // Only Barbers should access this page.
    if (isAuthenticated && role !== "Barber" && !hasHandledGuard.current) {
      hasHandledGuard.current = true;
      router.replace(APP_ROUTES.Dashboard);
    }
  }, [
    isAuthenticated,
    isSessionLoading,
    role,
    router,
    showToast,
    Common.Toasts.SessionExpiredTitle,
    Common.Toasts.SessionExpiredDescription,
  ]);

  // ─── Appointments for selected day ───────────────────────────────────────────

  const dayAppointments = useMemo(() => {
    return (appointmentsQuery.data ?? [])
      .filter((item) => {
        const start = parseApiDateTime(item.appointmentTime);
        return isSameDay(start, selectedDate);
      })
      .sort(
        (a, b) =>
          parseApiDateTime(a.appointmentTime).getTime() -
          parseApiDateTime(b.appointmentTime).getTime(),
      );
  }, [appointmentsQuery.data, selectedDate]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async function onComplete(id: string) {
    setCompletingId(id);
    try {
      await updateStatus({
        id,
        status: APPOINTMENT_STATUS.Completed,
      }).unwrap();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Schedule.Messages.Completed,
        variant: "success",
      });
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    } finally {
      setCompletingId(null);
    }
  }

  async function onLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Continue redirect even if API call fails.
    }
    showToast({
      title: Common.Toasts.LoggedOutTitle,
      description: Common.Toasts.LoggedOutDescription,
      variant: "info",
    });
    router.replace(APP_ROUTES.Login);
  }

  function shiftDay(direction: "back" | "next") {
    setSelectedDate((prev) => addDays(prev, direction === "back" ? -1 : 1));
  }

  // ─── Guard loading state ──────────────────────────────────────────────────────

  if (isSessionLoading || !isAuthenticated || role !== "Barber") {
    return null;
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────

  const totalToday = dayAppointments.length;
  const pendingToday = dayAppointments.filter(
    (a) => a.status === APPOINTMENT_STATUS.Pending || a.status === APPOINTMENT_STATUS.Confirmed,
  ).length;
  const completedToday = dayAppointments.filter(
    (a) => a.status === APPOINTMENT_STATUS.Completed,
  ).length;

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <main className="relative min-h-screen bg-[#121212] text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#262626] bg-[#1a1a1ad9] px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#262626] text-sm font-bold text-[#E8611C]">
            {SharedShell.BrandMonogram}
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight">{SharedShell.BrandName}</h1>
            <p className="text-xs text-slate-400">{Schedule.Header.Title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={Schedule.Mobile.Alerts}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#262626] text-slate-400 transition hover:text-white"
          >
            <Bell className="h-4 w-4" />
          </button>
          <LoadingButton
            variant="outline"
            size="sm"
            onClick={onLogout}
            isLoading={logoutState.isLoading}
            loadingText={Common.Actions.Loading}
            className="hidden sm:flex"
          >
            <>
              <LogOut className="h-4 w-4" />
              {Common.Actions.Logout}
            </>
          </LoadingButton>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {/* Date navigation */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftDay("back")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#262626] transition hover:bg-slate-700"
            aria-label="Dia anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#E8611C]" />
              {isToday && (
                <span className="rounded-full bg-[#E8611C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {Schedule.Filters.Today}
                </span>
              )}
            </div>
            <h2 className="text-center text-base font-bold capitalize text-white">
              {formatDateLabel(selectedDate)}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => shiftDay("next")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#262626] transition hover:bg-slate-700"
            aria-label="Dia siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-[#1f1f1f] p-4 text-center">
            <p className="text-2xl font-black text-white">{totalToday}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
              {Schedule.Grid.Bookings}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#1f1f1f] p-4 text-center">
            <p className="text-2xl font-black text-amber-400">{pendingToday}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
              {Schedule.Status.Pending}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#1f1f1f] p-4 text-center">
            <p className="text-2xl font-black text-emerald-400">{completedToday}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
              {Schedule.Status.Completed}
            </p>
          </div>
        </div>

        {/* Appointments list */}
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            {Schedule.Mobile.TodaySchedule}
          </h3>

          {appointmentsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-slate-500">{Common.Actions.Loading}</p>
            </div>
          ) : dayAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 py-16 text-center">
              <Calendar className="mb-3 h-8 w-8 text-slate-700" />
              <p className="text-sm font-medium text-slate-500">
                {Schedule.Empty.NoData}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {dayAppointments.map((item) => (
                <AppointmentCard
                  key={item.id}
                  item={item}
                  onComplete={onComplete}
                  isCompleting={completingId === item.id}
                />
              ))}
            </div>
          )}
        </section>

        {/* Mobile logout */}
        <div className="mt-8 sm:hidden">
          <LoadingButton
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onLogout}
            isLoading={logoutState.isLoading}
            loadingText={Common.Actions.Loading}
          >
            <>
              <LogOut className="h-4 w-4" />
              {Common.Actions.Logout}
            </>
          </LoadingButton>
        </div>
      </div>
    </main>
  );
}
