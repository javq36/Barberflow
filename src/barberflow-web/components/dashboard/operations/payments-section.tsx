"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  MoreHorizontal,
  Search,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import {
  AppointmentItem,
  useGetAppointmentsQuery,
  useGetServicesQuery,
} from "@/lib/api/owner-admin-api";
import { AppRole } from "@/lib/auth/permissions";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useRouter } from "next/navigation";

type PaymentsSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

type RangeKey = "7d" | "30d" | "ytd";
type MobileTabKey = "daily" | "weekly" | "monthly";
type PaymentStatus = "paid" | "pending" | "failed";

type TransactionItem = {
  id: string;
  clientName: string;
  serviceName: string;
  appointmentTime: Date;
  amount: number;
  status: PaymentStatus;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function toPercentage(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / previous) * 100;
}

function toSignedPercent(value: number) {
  const rounded = Number(value.toFixed(1));
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function heightClassByPercent(percent: number) {
  if (percent >= 95) return "h-[95%]";
  if (percent >= 90) return "h-[90%]";
  if (percent >= 85) return "h-[85%]";
  if (percent >= 80) return "h-[80%]";
  if (percent >= 75) return "h-[75%]";
  if (percent >= 70) return "h-[70%]";
  if (percent >= 65) return "h-[65%]";
  if (percent >= 60) return "h-[60%]";
  if (percent >= 55) return "h-[55%]";
  if (percent >= 50) return "h-[50%]";
  if (percent >= 45) return "h-[45%]";
  if (percent >= 40) return "h-[40%]";
  if (percent >= 35) return "h-[35%]";
  if (percent >= 30) return "h-[30%]";
  if (percent >= 25) return "h-[25%]";
  if (percent >= 20) return "h-[20%]";
  if (percent >= 15) return "h-[15%]";
  if (percent >= 10) return "h-[10%]";
  return "h-[6%]";
}

function mapAppointmentStatus(value: number): PaymentStatus {
  if (value === 4) {
    return "paid";
  }

  if (value === 3) {
    return "failed";
  }

  return "pending";
}

function rangeWindow(range: RangeKey, now: Date) {
  const end = endOfDay(now);

  if (range === "7d") {
    return {
      start: startOfDay(addDays(now, -6)),
      end,
    };
  }

  if (range === "30d") {
    return {
      start: startOfDay(addDays(now, -29)),
      end,
    };
  }

  return {
    start: new Date(now.getFullYear(), 0, 1),
    end,
  };
}

function previousRangeWindow(start: Date, end: Date) {
  const duration = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration);

  return {
    start: previousStart,
    end: previousEnd,
  };
}

export function PaymentsSection({ canOperate, role }: PaymentsSectionProps) {
  const router = useRouter();
  const { PaymentsV2, SharedShell } = Texts;

  const [searchTerm, setSearchTerm] = useState("");
  const [desktopRange, setDesktopRange] = useState<RangeKey>("7d");
  const [mobileTab, setMobileTab] = useState<MobileTabKey>("daily");

  const now = useMemo(() => new Date(), []);
  const dataWindow = useMemo(() => {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = endOfDay(now);

    return {
      from: start.toISOString(),
      to: end.toISOString(),
    };
  }, [now]);

  const appointmentsQuery = useGetAppointmentsQuery(dataWindow, {
    skip: !canOperate,
  });
  const servicesQuery = useGetServicesQuery(undefined, { skip: !canOperate });

  const services = useMemo(
    () => servicesQuery.data ?? [],
    [servicesQuery.data],
  );
  const appointments = useMemo(
    () => (appointmentsQuery.data ?? []) as AppointmentItem[],
    [appointmentsQuery.data],
  );

  const servicePriceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const service of services) {
      map.set(service.id, service.price);
    }
    return map;
  }, [services]);

  const fallbackServicePriceByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const service of services) {
      map.set(service.name.trim().toLowerCase(), service.price);
    }
    return map;
  }, [services]);

  const transactions = useMemo(() => {
    const items: TransactionItem[] = appointments.map((appointment) => {
      const amountById = servicePriceById.get(appointment.serviceId);
      const amountByName = fallbackServicePriceByName.get(
        appointment.serviceName.trim().toLowerCase(),
      );

      return {
        id: appointment.id,
        clientName: appointment.customerName,
        serviceName: appointment.serviceName,
        appointmentTime: new Date(appointment.appointmentTime),
        amount: amountById ?? amountByName ?? 0,
        status: mapAppointmentStatus(appointment.status),
      };
    });

    return items.sort(
      (a, b) => b.appointmentTime.getTime() - a.appointmentTime.getTime(),
    );
  }, [appointments, fallbackServicePriceByName, servicePriceById]);

  const searchedTransactions = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) {
      return transactions;
    }

    return transactions.filter((item) => {
      return (
        item.clientName.toLowerCase().includes(normalized) ||
        item.serviceName.toLowerCase().includes(normalized) ||
        item.status.toLowerCase().includes(normalized)
      );
    });
  }, [searchTerm, transactions]);

  const desktopWindow = useMemo(
    () => rangeWindow(desktopRange, now),
    [desktopRange, now],
  );

  const previousDesktopWindow = useMemo(
    () => previousRangeWindow(desktopWindow.start, desktopWindow.end),
    [desktopWindow.end, desktopWindow.start],
  );

  const desktopTransactions = useMemo(() => {
    return searchedTransactions.filter(
      (item) =>
        item.appointmentTime >= desktopWindow.start &&
        item.appointmentTime <= desktopWindow.end,
    );
  }, [desktopWindow.end, desktopWindow.start, searchedTransactions]);

  const previousDesktopTransactions = useMemo(() => {
    return searchedTransactions.filter(
      (item) =>
        item.appointmentTime >= previousDesktopWindow.start &&
        item.appointmentTime <= previousDesktopWindow.end,
    );
  }, [
    previousDesktopWindow.end,
    previousDesktopWindow.start,
    searchedTransactions,
  ]);

  const desktopRevenue = useMemo(() => {
    return desktopTransactions
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + item.amount, 0);
  }, [desktopTransactions]);

  const previousRevenue = useMemo(() => {
    return previousDesktopTransactions
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + item.amount, 0);
  }, [previousDesktopTransactions]);

  const totalAppointments = desktopTransactions.length;
  const previousAppointments = previousDesktopTransactions.length;

  const paidCount = desktopTransactions.filter(
    (item) => item.status === "paid",
  ).length;
  const previousPaidCount = previousDesktopTransactions.filter(
    (item) => item.status === "paid",
  ).length;

  const avgTicketValue = paidCount ? desktopRevenue / paidCount : 0;
  const previousAvgTicketValue = previousPaidCount
    ? previousRevenue / previousPaidCount
    : 0;

  const revenueDelta = toSignedPercent(
    toPercentage(desktopRevenue, previousRevenue),
  );
  const appointmentsDelta = toSignedPercent(
    toPercentage(totalAppointments, previousAppointments),
  );
  const avgTicketDelta = toSignedPercent(
    toPercentage(avgTicketValue, previousAvgTicketValue),
  );

  const monthlyChart = useMemo(() => {
    const currentYear = now.getFullYear();
    const monthCount = 12;
    const actual = Array.from({ length: monthCount }, () => 0);

    for (const item of transactions) {
      if (item.status !== "paid") {
        continue;
      }

      const date = item.appointmentTime;
      if (date.getFullYear() !== currentYear) {
        continue;
      }

      const month = date.getMonth();
      actual[month] += item.amount;
    }

    const currentMonth = now.getMonth();
    const projection = [...actual];
    const recentActual = actual.slice(
      Math.max(0, currentMonth - 2),
      currentMonth + 1,
    );
    const baseline = recentActual.some((value) => value > 0)
      ? recentActual.reduce((sum, value) => sum + value, 0) /
        recentActual.length
      : 100;

    for (let month = currentMonth + 1; month < monthCount; month += 1) {
      projection[month] = baseline;
    }

    const maxValue = Math.max(1, ...projection, ...actual);

    return actual.map((value, month) => {
      const projectionValue = projection[month];
      const actualPercent = Math.max(6, Math.round((value / maxValue) * 100));
      const projectionPercent = Math.max(
        6,
        Math.round((projectionValue / maxValue) * 100),
      );

      return {
        month,
        actualValue: value,
        projectionValue,
        actualHeightClass: heightClassByPercent(actualPercent),
        projectionHeightClass: heightClassByPercent(projectionPercent),
      };
    });
  }, [now, transactions]);

  const mobileWindow = useMemo(() => {
    if (mobileTab === "daily") {
      return { start: startOfDay(now), end: endOfDay(now) };
    }

    if (mobileTab === "weekly") {
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    }

    return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
  }, [mobileTab, now]);

  const mobileTransactions = useMemo(() => {
    return searchedTransactions.filter(
      (item) =>
        item.appointmentTime >= mobileWindow.start &&
        item.appointmentTime <= mobileWindow.end,
    );
  }, [mobileWindow.end, mobileWindow.start, searchedTransactions]);

  const mobileRevenue = useMemo(() => {
    return mobileTransactions
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + item.amount, 0);
  }, [mobileTransactions]);

  const weeklySeries = useMemo(() => {
    const values = Array.from({ length: 7 }, () => 0);

    for (const item of searchedTransactions) {
      if (item.status !== "paid") {
        continue;
      }

      const daysAgo = Math.floor(
        (endOfDay(now).getTime() - item.appointmentTime.getTime()) / 86400000,
      );

      if (daysAgo < 0 || daysAgo > 6) {
        continue;
      }

      const index = 6 - daysAgo;
      values[index] += item.amount;
    }

    const maxValue = Math.max(1, ...values);

    return values.map((value) => {
      const percent = Math.max(8, Math.round((value / maxValue) * 100));
      return {
        value,
        className: heightClassByPercent(percent),
      };
    });
  }, [now, searchedTransactions]);

  const recentDesktopTransactions = desktopTransactions.slice(0, 6);
  const recentMobileTransactions = mobileTransactions.slice(0, 4);

  function statusBadgeClasses(status: PaymentStatus) {
    if (status === "paid") {
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    }

    if (status === "pending") {
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    }

    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  }

  function statusLabel(status: PaymentStatus) {
    if (status === "paid") {
      return PaymentsV2.Status.Paid;
    }

    if (status === "pending") {
      return PaymentsV2.Status.Pending;
    }

    return PaymentsV2.Status.Failed;
  }

  function statusIcon(status: PaymentStatus) {
    if (status === "paid") {
      return <CheckCircle2 className="h-5 w-5" />;
    }

    if (status === "pending") {
      return <Clock3 className="h-5 w-5" />;
    }

    return <XCircle className="h-5 w-5" />;
  }

  return (
    <RoleWorkspaceShell
      canOperate={canOperate}
      disabledMessage={PaymentsV2.DisabledMessage}
      role={role}
      activeItemId="payments"
      onNavigate={(href) => router.push(href)}
      brandTitle={SharedShell.BrandName}
      brandSubtitle={PaymentsV2.Sidebar.AdminPanel}
      desktopHeader={
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-800 bg-[#191919]/70 px-8 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold">{PaymentsV2.Header.Title}</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-64 rounded-lg border border-slate-700 bg-slate-800/40 py-1.5 pl-10 pr-4 text-sm"
                placeholder={PaymentsV2.Header.SearchPlaceholder}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-800"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900"
            >
              <Download className="h-4 w-4" />
              {PaymentsV2.Header.Export}
            </button>
          </div>
        </header>
      }
      desktopBody={
        <div className="space-y-8 overflow-y-auto p-8">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDesktopRange("7d")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                desktopRange === "7d"
                  ? "bg-slate-100 text-slate-900"
                  : "border border-slate-700 bg-slate-800/30 text-slate-300"
              }`}
            >
              {PaymentsV2.Filters.Last7Days}
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDesktopRange("30d")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                desktopRange === "30d"
                  ? "bg-slate-100 text-slate-900"
                  : "border border-slate-700 bg-slate-800/30 text-slate-300"
              }`}
            >
              {PaymentsV2.Filters.Last30Days}
            </button>
            <button
              type="button"
              onClick={() => setDesktopRange("ytd")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                desktopRange === "ytd"
                  ? "bg-slate-100 text-slate-900"
                  : "border border-slate-700 bg-slate-800/30 text-slate-300"
              }`}
            >
              {PaymentsV2.Filters.YearToDate}
            </button>
            <button
              type="button"
              onClick={() => setDesktopRange("ytd")}
              className="ml-auto flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-2 text-sm font-medium text-slate-300"
            >
              <CalendarDays className="h-4 w-4" />
              {PaymentsV2.Filters.CustomRange}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <article className="rounded-xl border border-slate-800 bg-slate-800/20 p-6">
              <div className="mb-4 flex items-start justify-between">
                <span className="text-sm font-medium text-slate-400">
                  {PaymentsV2.Metrics.TotalRevenue}
                </span>
                <Wallet className="h-4 w-4 text-slate-500" />
              </div>
              <div className="flex items-end gap-2">
                <h3 className="text-3xl font-bold">
                  {formatCurrency(desktopRevenue)}
                </h3>
                <span className="text-sm font-semibold text-emerald-400">
                  {revenueDelta}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {PaymentsV2.Metrics.PreviousPeriod.replace(
                  "{value}",
                  formatCurrency(previousRevenue),
                )}
              </p>
            </article>

            <article className="rounded-xl border border-slate-800 bg-slate-800/20 p-6">
              <div className="mb-4 flex items-start justify-between">
                <span className="text-sm font-medium text-slate-400">
                  {PaymentsV2.Metrics.TotalAppointments}
                </span>
                <CalendarDays className="h-4 w-4 text-slate-500" />
              </div>
              <div className="flex items-end gap-2">
                <h3 className="text-3xl font-bold">{totalAppointments}</h3>
                <span className="text-sm font-semibold text-emerald-400">
                  {appointmentsDelta}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {PaymentsV2.Metrics.PreviousPeriod.replace(
                  "{value}",
                  String(previousAppointments),
                )}
              </p>
            </article>

            <article className="rounded-xl border border-slate-800 bg-slate-800/20 p-6">
              <div className="mb-4 flex items-start justify-between">
                <span className="text-sm font-medium text-slate-400">
                  {PaymentsV2.Metrics.AvgTicketValue}
                </span>
                <TrendingUp className="h-4 w-4 text-slate-500" />
              </div>
              <div className="flex items-end gap-2">
                <h3 className="text-3xl font-bold">
                  {formatCurrency(avgTicketValue)}
                </h3>
                <span className="text-sm font-semibold text-emerald-400">
                  {avgTicketDelta}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {PaymentsV2.Metrics.PreviousPeriod.replace(
                  "{value}",
                  formatCurrency(previousAvgTicketValue),
                )}
              </p>
            </article>
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-800/20 p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-bold">
                  {PaymentsV2.Metrics.RevenueTrend}
                </h4>
                <p className="text-sm text-slate-400">
                  {PaymentsV2.Metrics.RevenueTrendDescription}
                </p>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-100" />
                  <span>{PaymentsV2.Metrics.Actual}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-600" />
                  <span>{PaymentsV2.Metrics.Projection}</span>
                </div>
              </div>
            </div>

            <div className="grid h-64 grid-cols-12 items-end gap-3 px-2">
              {monthlyChart.map((bar, index) => (
                <div
                  key={`month-${index}`}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      className={`w-2 rounded-t bg-slate-600 ${bar.projectionHeightClass}`}
                      title={`${PaymentsV2.Metrics.Projection}: ${formatCurrency(
                        bar.projectionValue,
                      )}`}
                    />
                    <div
                      className={`w-2 rounded-t bg-slate-100 ${bar.actualHeightClass}`}
                      title={`${PaymentsV2.Metrics.Actual}: ${formatCurrency(
                        bar.actualValue,
                      )}`}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {PaymentsV2.Months[index]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-800/20">
            <div className="flex items-center justify-between border-b border-slate-800 p-6">
              <h4 className="text-lg font-bold">
                {PaymentsV2.Metrics.RecentTransactions}
              </h4>
              <button
                type="button"
                className="text-sm font-semibold text-slate-400"
              >
                {PaymentsV2.Metrics.ViewAll}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="bg-slate-800/30">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {PaymentsV2.Table.Client}
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {PaymentsV2.Table.Service}
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {PaymentsV2.Table.Date}
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {PaymentsV2.Table.Amount}
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {PaymentsV2.Table.Status}
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                      {PaymentsV2.Table.Action}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recentDesktopTransactions.map((item) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-slate-800/30"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                            {item.clientName
                              .split(" ")
                              .slice(0, 2)
                              .map((part) => part[0] ?? "")
                              .join("")
                              .toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">
                            {item.clientName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {item.serviceName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {formatDateTime(item.appointmentTime)}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClasses(
                            item.status,
                          )}`}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button type="button" className="text-slate-400">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      }
      mobileHeader={
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-[#191919] p-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold leading-tight">
                {SharedShell.BrandName}
              </h1>
              <p className="text-xs text-slate-500">
                {PaymentsV2.Mobile.RevenueDashboard}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800"
          >
            <Bell className="h-5 w-5" />
          </button>
        </header>
      }
      mobileBody={
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="px-4 pt-4">
            <div className="flex gap-8 border-b border-slate-800">
              <button
                type="button"
                onClick={() => setMobileTab("daily")}
                className={`border-b-2 pb-3 pt-2 text-sm ${
                  mobileTab === "daily"
                    ? "border-slate-100 font-bold text-slate-100"
                    : "border-transparent text-slate-500"
                }`}
              >
                {PaymentsV2.Filters.Daily}
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("weekly")}
                className={`border-b-2 pb-3 pt-2 text-sm ${
                  mobileTab === "weekly"
                    ? "border-slate-100 font-bold text-slate-100"
                    : "border-transparent text-slate-500"
                }`}
              >
                {PaymentsV2.Filters.Weekly}
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("monthly")}
                className={`border-b-2 pb-3 pt-2 text-sm ${
                  mobileTab === "monthly"
                    ? "border-slate-100 font-bold text-slate-100"
                    : "border-transparent text-slate-500"
                }`}
              >
                {PaymentsV2.Filters.Monthly}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 p-4">
            <article className="flex min-w-[150px] flex-1 flex-col gap-2 rounded-xl border border-slate-800 bg-slate-800/30 p-5">
              <div className="flex items-center gap-2 text-slate-500">
                <Wallet className="h-4 w-4" />
                <p className="text-sm font-medium">
                  {PaymentsV2.Metrics.TotalRevenue}
                </p>
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(mobileRevenue)}
              </p>
              <div className="flex items-center gap-1 text-emerald-400">
                <TrendingUp className="h-4 w-4" />
                <p className="text-xs font-semibold">{revenueDelta}</p>
              </div>
            </article>

            <article className="flex min-w-[150px] flex-1 flex-col gap-2 rounded-xl border border-slate-800 bg-slate-800/30 p-5">
              <div className="flex items-center gap-2 text-slate-500">
                <CalendarDays className="h-4 w-4" />
                <p className="text-sm font-medium">
                  {PaymentsV2.Metrics.Appointments}
                </p>
              </div>
              <p className="text-2xl font-bold">{mobileTransactions.length}</p>
              <div className="flex items-center gap-1 text-emerald-400">
                <TrendingUp className="h-4 w-4" />
                <p className="text-xs font-semibold">{appointmentsDelta}</p>
              </div>
            </article>
          </div>

          <section className="px-4 py-2">
            <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-5">
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">
                    {PaymentsV2.Metrics.RevenueTrend}
                  </p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(mobileRevenue)}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {PaymentsV2.Metrics.Last7Days}
                </p>
              </div>

              <div className="grid h-32 grid-cols-7 items-end gap-2 px-1">
                {weeklySeries.map((bar, index) => (
                  <div
                    key={`week-${index}`}
                    className="flex h-full flex-col items-center gap-2"
                  >
                    <div
                      className={`w-full rounded-t-sm bg-slate-500 ${bar.className}`}
                    />
                    <p className="text-[10px] font-bold text-slate-500">
                      {PaymentsV2.WeekDays[index]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {PaymentsV2.Metrics.RecentTransactions}
              </h3>
              <button
                type="button"
                className="text-sm font-semibold text-slate-400"
              >
                {PaymentsV2.Metrics.ViewAll}
              </button>
            </div>

            <div className="space-y-3">
              {recentMobileTransactions.map((item) => (
                <article
                  key={`mobile-${item.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/30 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${statusBadgeClasses(
                        item.status,
                      )}`}
                    >
                      {statusIcon(item.status)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{item.clientName}</p>
                      <p className="text-xs text-slate-400">
                        {item.serviceName} •{" "}
                        {new Intl.DateTimeFormat("es-CO", {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(item.appointmentTime)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {formatCurrency(item.amount)}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClasses(
                        item.status,
                      )}`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      }
      mobileFooter={
        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-[#191919] px-4 pb-6 pt-2">
          <div className="mx-auto flex max-w-md items-center justify-around">
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Schedule)}
              className="flex flex-col items-center gap-1 text-slate-500"
            >
              <CalendarDays className="h-6 w-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {PaymentsV2.Mobile.Schedule}
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Customers)}
              className="flex flex-col items-center gap-1 text-slate-500"
            >
              <Users className="h-6 w-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {PaymentsV2.Mobile.Clients}
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-1 text-slate-100"
            >
              <div className="-mt-8 mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-900 shadow-lg">
                <Wallet className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {PaymentsV2.Mobile.Revenue}
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-1 text-slate-500"
            >
              <TrendingUp className="h-6 w-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {PaymentsV2.Mobile.Growth}
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Dashboard)}
              className="flex flex-col items-center gap-1 text-slate-500"
            >
              <Settings className="h-6 w-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {PaymentsV2.Mobile.Settings}
              </span>
            </button>
          </div>
        </nav>
      }
    />
  );
}
