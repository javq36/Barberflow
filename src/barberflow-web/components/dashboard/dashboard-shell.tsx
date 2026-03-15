"use client";

import {
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock3,
  DollarSign,
  LayoutDashboard,
  Scissors,
  Search,
  Settings,
  TrendingDown,
  TrendingUp,
  Users,
  UserSquare2,
  Wallet,
} from "lucide-react";
import { Texts } from "@/lib/content/texts";
import { APP_ROUTES } from "@/lib/config/app";
import { AppRole } from "@/lib/auth/permissions";
import { formatDashboardDate } from "@/lib/dashboard/helpers";
import { useGetDashboardSummaryQuery } from "@/lib/api/dashboard-api";

type DashboardShellProps = {
  role: AppRole;
};

export function DashboardShell({ role }: DashboardShellProps) {
  const { DashboardV2, SharedShell } = Texts;
  const { data, isLoading, isFetching, error } = useGetDashboardSummaryQuery();
  const roleLabel =
    role === "SuperAdmin" ? "SuperAdmin" : DashboardV2.Header.Role;

  function navigateTo(href: string) {
    window.location.assign(href);
  }

  function formatHourLabel(value?: string) {
    if (!value) {
      return DashboardV2.Fallback.Time;
    }
    return new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  const metrics = [
    {
      id: "revenue",
      icon: <DollarSign className="h-4 w-4" />,
      label: DashboardV2.Metrics.Revenue,
      value: DashboardV2.Fallback.Revenue,
      trend: "+12.5%",
      positive: true,
    },
    {
      id: "appointments",
      icon: <CalendarDays className="h-4 w-4" />,
      label: DashboardV2.Metrics.Appointments,
      value: `${data?.citasHoy ?? 0}`,
      trend: "+2",
      positive: true,
    },
    {
      id: "occupancy",
      icon: <Clock3 className="h-4 w-4" />,
      label: DashboardV2.Metrics.Occupancy,
      value: DashboardV2.Fallback.Occupancy,
      trend: "+5%",
      positive: true,
    },
    {
      id: "clients",
      icon: <Users className="h-4 w-4" />,
      label: DashboardV2.Metrics.NewClients,
      value: `${Math.min(data?.clientesRegistrados ?? 0, 4)}`,
      trend: "-1%",
      positive: false,
    },
  ];

  const team = [
    {
      name: `${DashboardV2.Team.Title} 1`,
      status: DashboardV2.Team.Status.InSession,
      value: "$420.00",
      color: "bg-[#10B981]",
    },
    {
      name: `${DashboardV2.Team.Title} 2`,
      status: DashboardV2.Team.Status.Break,
      value: "$385.00",
      color: "bg-[#F59E0B]",
    },
    {
      name: `${DashboardV2.Team.Title} 3`,
      status: DashboardV2.Team.Status.Available,
      value: "$210.00",
      color: "bg-[#10B981]",
    },
  ];

  const nextUp = [
    {
      id: data?.proximaCita?.id ?? "a1",
      customer:
        data?.proximaCita?.customerName ?? DashboardV2.Fallback.Customer,
      service: data?.proximaCita?.serviceName ?? DashboardV2.Fallback.Service,
      barber: data?.proximaCita?.barberName ?? DashboardV2.Fallback.Barber,
      time: formatHourLabel(data?.proximaCita?.appointmentTime),
      active: true,
    },
  ];

  const revenueBars = [40, 58, 34, 80, 66, 92, 76, 22];

  return (
    <main className="min-h-screen bg-[#0F1113] text-[#FFFFFF]">
      <div className="hidden h-screen overflow-hidden lg:flex">
        <aside className="flex w-64 flex-col border-r border-[#2F3336] bg-black">
          <div className="flex items-center gap-3 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#10B981] text-black">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {SharedShell.BrandName}
              </h1>
              <p className="text-xs text-[#9CA3AF]">
                {DashboardV2.Header.BrandSubtitle}
              </p>
            </div>
          </div>

          <nav className="mt-4 space-y-2 px-4">
            <button
              type="button"
              onClick={() => navigateTo(APP_ROUTES.Dashboard)}
              className="flex w-full items-center gap-3 rounded-lg bg-[#10B9811A] px-3 py-2.5 text-left text-[#10B981]"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="text-sm font-medium">
                {DashboardV2.Sidebar.Command}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo(APP_ROUTES.Schedule)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
            >
              <CalendarDays className="h-4 w-4" />
              <span className="text-sm font-medium">
                {DashboardV2.Sidebar.Calendar}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo(APP_ROUTES.Customers)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
            >
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">
                {DashboardV2.Sidebar.Clients}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo(APP_ROUTES.Barbers)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
            >
              <UserSquare2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {DashboardV2.Sidebar.Staff}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo(APP_ROUTES.Payments)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
            >
              <Wallet className="h-4 w-4" />
              <span className="text-sm font-medium">
                {DashboardV2.Sidebar.Payments}
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">
                {DashboardV2.Sidebar.Settings}
              </span>
            </button>
          </nav>

          <div className="mt-auto p-4">
            <button
              type="button"
              onClick={() => navigateTo(APP_ROUTES.Schedule)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#E8611C] py-3 text-sm font-bold text-white shadow-lg shadow-[#E8611C33] transition hover:bg-[#d95719]"
            >
              <CalendarPlus className="h-4 w-4" />
              {DashboardV2.Actions.NewAppointment}
            </button>
          </div>
        </aside>

        <section className="flex flex-1 flex-col overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#2F3336] bg-[#0F1113F2] px-8 backdrop-blur">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-4 w-4 text-[#10B981]" />
              <h2 className="text-xl font-bold">
                {DashboardV2.Header.TodaysOverview}
              </h2>
              {isFetching ? (
                <span className="rounded bg-[#1A1D1F] px-2 py-1 text-xs text-[#9CA3AF]">
                  {DashboardV2.Header.Refreshing}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-6">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4B5563]" />
                <input
                  type="search"
                  placeholder={DashboardV2.Header.SearchPlaceholder}
                  className="w-64 rounded-lg border border-[#2F3336] bg-[#1A1D1F] py-1.5 pl-10 pr-4 text-sm text-white placeholder:text-[#4B5563]"
                />
              </div>
              <div className="flex items-center gap-3 border-l border-[#2F3336] pl-6">
                <button
                  type="button"
                  aria-label={DashboardV2.Header.Notifications}
                  className="relative text-[#9CA3AF] transition hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-[#E8611C]" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2F3336] text-xs font-bold">
                    SM
                  </div>
                  <div className="leading-tight">
                    <p className="text-sm font-medium">
                      {DashboardV2.Header.User}
                    </p>
                    <p className="text-[11px] text-[#9CA3AF]">{roleLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="space-y-8 p-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <article
                  key={metric.id}
                  className="rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-6"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium uppercase tracking-wider text-[#9CA3AF]">
                      {metric.label}
                    </p>
                    <span className="text-[#4B5563]">{metric.icon}</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <h3 className="text-3xl font-bold">{metric.value}</h3>
                    <span
                      className={`flex items-center gap-1 text-sm font-bold ${
                        metric.positive ? "text-[#10B981]" : "text-[#EF4444]"
                      }`}
                    >
                      {metric.positive ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                      {metric.trend}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <section className="grid grid-cols-12 gap-8">
              <div className="col-span-12 space-y-8 xl:col-span-8">
                <article className="rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-6">
                  <div className="mb-8 flex items-center justify-between">
                    <h3 className="text-lg font-bold">
                      {DashboardV2.Chart.RevenueTrends}
                    </h3>
                    <select className="rounded-lg border border-[#2F3336] bg-[#0F1113] px-3 py-1 text-xs text-[#9CA3AF]">
                      <option>{DashboardV2.Chart.WeeklyView}</option>
                      <option>{DashboardV2.Chart.MonthlyView}</option>
                    </select>
                  </div>
                  <div className="flex h-48 items-end justify-between gap-4 px-2">
                    {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map(
                      (day, index) => (
                        <div
                          key={day}
                          className="group flex flex-1 flex-col items-center gap-2"
                        >
                          <div
                            className={`w-full rounded-t-lg transition-all ${index === 3 ? "bg-[#10B981]" : "bg-[#2F3336] group-hover:bg-[#10B981]"}`}
                            style={{
                              height: `${[66, 50, 80, 90, 60, 100, 25][index]}%`,
                            }}
                          />
                          <span className="text-xs text-[#4B5563]">{day}</span>
                        </div>
                      ),
                    )}
                  </div>
                </article>

                <div className="grid gap-8 md:grid-cols-2">
                  <article className="rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-6">
                    <h3 className="mb-4 text-lg font-bold">
                      {DashboardV2.Team.Title}
                    </h3>
                    <div className="space-y-4">
                      {team.map((person) => (
                        <div
                          key={person.name}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-8 w-8 rounded-full ${person.color}`}
                            />
                            <span className="text-sm font-medium">
                              {person.name}
                            </span>
                          </div>
                          <span className="rounded bg-[#2F3336] px-2 py-0.5 text-[10px] font-bold uppercase text-[#9CA3AF]">
                            {person.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-6">
                    <h3 className="mb-4 text-lg font-bold">
                      {DashboardV2.Services.Title}
                    </h3>
                    <div className="space-y-4">
                      {[
                        { name: "Classic Fade", value: 42 },
                        { name: "Beard Sculpture", value: 28 },
                        { name: "The Executive Cut", value: 15 },
                        { name: "Kids Haircut", value: 10 },
                      ].map((service) => (
                        <div key={service.name}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>{service.name}</span>
                            <span className="font-bold">{service.value}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#2F3336]">
                            <div
                              className="h-full bg-[#10B981]"
                              style={{ width: `${service.value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              </div>

              <aside className="col-span-12 h-fit overflow-hidden rounded-xl border border-[#2F3336] bg-[#1A1D1F] xl:col-span-4">
                <div className="flex items-center justify-between border-b border-[#2F3336] p-6">
                  <h3 className="text-lg font-bold">
                    {DashboardV2.NextUp.Title}
                  </h3>
                  <span className="text-[#4B5563]">...</span>
                </div>
                <div className="divide-y divide-[#2F3336]">
                  {nextUp.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      className={`flex w-full items-start gap-4 p-5 text-left transition hover:bg-white/5 ${
                        appointment.active ? "border-l-4 border-[#10B981]" : ""
                      }`}
                    >
                      <div
                        className={`rounded-lg p-2 ${
                          appointment.active
                            ? "bg-[#10B981] text-black"
                            : "bg-[#2F3336] text-[#9CA3AF]"
                        }`}
                      >
                        <span className="block text-xs font-bold leading-none">
                          {appointment.time
                            .replace(" AM", "")
                            .replace(" PM", "")}
                        </span>
                        <span className="text-[10px] font-medium opacity-70">
                          {appointment.time.includes("PM") ? "PM" : "AM"}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-bold">
                          {appointment.customer}
                        </h4>
                        <p className="text-xs text-[#9CA3AF]">
                          {appointment.service}
                        </p>
                        <p className="mt-2 text-[10px] text-[#4B5563]">
                          {DashboardV2.NextUp.With}{" "}
                          <span className="text-[#9CA3AF]">
                            {appointment.barber}
                          </span>
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#4B5563]" />
                    </button>
                  ))}
                </div>
                <div className="bg-[#0F111380] p-4">
                  <button
                    type="button"
                    onClick={() => navigateTo(APP_ROUTES.Schedule)}
                    className="w-full text-center text-xs font-bold text-[#9CA3AF] transition hover:text-white"
                  >
                    {DashboardV2.NextUp.ViewAll}
                  </button>
                </div>
              </aside>
            </section>
          </div>
        </section>
      </div>

      <div className="relative flex min-h-screen w-full flex-col pb-24 lg:hidden">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#2F3336] bg-[#0F1113F2] p-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1A1D1F] text-white shadow-lg">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">
                {SharedShell.BrandName}
              </h1>
              <p className="text-xs font-medium text-[#9CA3AF]">
                {DashboardV2.Header.CommandCenter}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={DashboardV2.Header.Notifications}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#1A1D1F] text-[#9CA3AF]"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-[#0F1113] bg-[#EF4444]" />
          </button>
        </header>

        <main className="flex flex-col gap-6 pt-4">
          <section className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4">
            <article className="min-w-[220px] snap-center rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-5">
              <div className="mb-3 flex items-center justify-between">
                <DollarSign className="h-4 w-4 text-[#9CA3AF]" />
                <span className="text-xs font-bold text-[#10B981]">+12%</span>
              </div>
              <p className="text-2xl font-bold">
                {DashboardV2.Fallback.Revenue}
              </p>
              <p className="text-sm text-[#9CA3AF]">
                {DashboardV2.Metrics.DailyRevenue}
              </p>
            </article>

            <article className="min-w-[220px] snap-center rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-5">
              <div className="mb-3 flex items-center justify-between">
                <CalendarDays className="h-4 w-4 text-[#9CA3AF]" />
                <span className="text-xs font-bold text-[#9CA3AF]">
                  {data?.citasHoy ?? 0}/{DashboardV2.Fallback.Slots}
                </span>
              </div>
              <p className="text-2xl font-bold">{data?.citasHoy ?? 0}</p>
              <p className="text-sm text-[#9CA3AF]">
                {DashboardV2.Metrics.Appointments}
              </p>
            </article>

            <article className="min-w-[220px] snap-center rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-5">
              <div className="mb-3 flex items-center justify-between">
                <Users className="h-4 w-4 text-[#9CA3AF]" />
                <span className="text-xs font-bold text-[#9CA3AF]">
                  {DashboardV2.Team.Active}
                </span>
              </div>
              <p className="text-2xl font-bold">{data?.barberosActivos ?? 0}</p>
              <p className="text-sm text-[#9CA3AF]">
                {DashboardV2.Team.Online}
              </p>
            </article>
          </section>

          <section className="px-4">
            <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
              {DashboardV2.Mobile.AtGlance}
            </h2>
            <article className="relative overflow-hidden rounded-xl bg-[#1A1D1F] p-6 text-white shadow-xl">
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-xs font-medium text-[#9CA3AF]">
                      {DashboardV2.Mobile.UpcomingAppointment}
                    </p>
                    <h3 className="text-xl font-bold">
                      {data?.proximaCita?.customerName ??
                        DashboardV2.Fallback.Customer}
                    </h3>
                    <p className="text-sm text-[#9CA3AF]">
                      {data?.proximaCita?.serviceName ??
                        DashboardV2.Fallback.Service}
                    </p>
                  </div>
                  <div className="rounded-full bg-white/10 px-3 py-1 backdrop-blur-sm">
                    <span className="text-xs font-bold">
                      {formatHourLabel(data?.proximaCita?.appointmentTime)}
                    </span>
                  </div>
                </div>

                <div className="py-2">
                  <span className="text-xs text-[#9CA3AF]">
                    {DashboardV2.Mobile.Barber}
                  </span>
                  <p className="text-sm font-semibold">
                    {data?.proximaCita?.barberName ??
                      DashboardV2.Fallback.Barber}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigateTo(APP_ROUTES.Schedule)}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-[#0F1113] transition active:scale-[0.98]"
                >
                  <UserSquare2 className="h-4 w-4" />
                  {DashboardV2.Mobile.CheckInNow}
                </button>
              </div>
              <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
            </article>
          </section>

          <section className="px-4">
            <article className="rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-5">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="font-bold">
                  {DashboardV2.Mobile.HourlyRevenue}
                </h3>
                <span className="text-xs text-[#9CA3AF]">
                  {DashboardV2.Mobile.Last8Hours}
                </span>
              </div>
              <div className="flex h-20 items-end justify-between gap-1">
                {revenueBars.map((bar, index) => (
                  <div
                    key={`${bar}-${index}`}
                    className={`flex-1 rounded-t-sm ${index === 6 ? "bg-[#E5E7EB]" : "bg-[#2F3336]"}`}
                    style={{ height: `${bar}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-medium text-[#4B5563]">
                <span>08:00</span>
                <span>12:00</span>
                <span>16:00</span>
              </div>
            </article>
          </section>

          <section className="px-4 pb-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="px-1 text-sm font-semibold uppercase tracking-wider text-[#9CA3AF]">
                {DashboardV2.Team.TodaysTeam}
              </h2>
              <button
                type="button"
                onClick={() => navigateTo(APP_ROUTES.Barbers)}
                className="text-xs font-bold text-[#9CA3AF]"
              >
                {DashboardV2.Team.ViewAll}
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {team.map((person) => (
                <article
                  key={`${person.name}-mobile`}
                  className="flex items-center justify-between rounded-xl border border-[#2F3336] bg-[#1A1D1F] p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 rounded-full border-2 border-[#10B981] bg-[#2F3336]">
                      <span
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0F1113] ${person.color}`}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{person.name}</p>
                      <p className="text-xs text-[#9CA3AF]">{person.status}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold">{person.value}</p>
                    <p className="text-[10px] text-[#9CA3AF]">
                      {DashboardV2.Team.Today}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {data?.apiOk === false || error ? (
              <p className="mt-4 rounded-lg border border-[#EF444433] bg-[#EF44441A] px-3 py-2 text-xs text-[#EF4444]">
                {DashboardV2.Status.BackendWarning}
              </p>
            ) : null}

            {isLoading ? (
              <p className="mt-3 text-xs text-[#9CA3AF]">
                {DashboardV2.Header.Loading}
              </p>
            ) : null}
            {!isLoading && data?.proximaCita?.appointmentTime ? (
              <p className="mt-3 text-xs text-[#9CA3AF]">
                {DashboardV2.NextUp.DateLabel}{" "}
                {formatDashboardDate(data.proximaCita.appointmentTime)}
              </p>
            ) : null}
          </section>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[#2F3336] bg-[#0F1113F2] px-4 pb-6 pt-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => navigateTo(APP_ROUTES.Dashboard)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-white"
          >
            <LayoutDashboard className="h-4 w-4" />
            <p className="text-[10px] font-bold uppercase tracking-tighter">
              {DashboardV2.Mobile.Command}
            </p>
          </button>
          <button
            type="button"
            onClick={() => navigateTo(APP_ROUTES.Schedule)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[#9CA3AF]"
          >
            <CalendarDays className="h-4 w-4" />
            <p className="text-[10px] font-medium uppercase tracking-tighter">
              {DashboardV2.Mobile.Schedule}
            </p>
          </button>
          <button
            type="button"
            onClick={() => navigateTo(APP_ROUTES.Barbers)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[#9CA3AF]"
          >
            <Users className="h-4 w-4" />
            <p className="text-[10px] font-medium uppercase tracking-tighter">
              {DashboardV2.Mobile.Team}
            </p>
          </button>
          <button
            type="button"
            onClick={() => navigateTo(APP_ROUTES.Payments)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[#9CA3AF]"
          >
            <Wallet className="h-4 w-4" />
            <p className="text-[10px] font-medium uppercase tracking-tighter">
              {DashboardV2.Mobile.Payments}
            </p>
          </button>
        </nav>
      </div>
    </main>
  );
}
