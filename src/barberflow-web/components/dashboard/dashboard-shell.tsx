"use client";

import {
  Activity,
  CalendarClock,
  LogOut,
  Scissors,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogoutMutation } from "@/lib/api/authApi";
import { useGetDashboardSummaryQuery } from "@/lib/api/dashboard-api";
import { StatCard } from "@/components/dashboard/stat-card";
import { Texts } from "@/lib/content/texts";
import { APP_ROUTES } from "@/lib/config/app";
import { AUTH_COOKIE_NAME } from "@/lib/config/auth";
import { useAppToast } from "@/lib/toast/toast-provider";

function formatDate(value?: string) {
  if (!value) {
    return Texts.Common.Status.NoData;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardShell() {
  const router = useRouter();
  const { data, isLoading, isFetching, error } = useGetDashboardSummaryQuery();
  const [logout] = useLogoutMutation();
  const { Dashboard, Common, Admin } = Texts;
  const { showToast } = useAppToast();

  async function onLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Route transition should still happen even if logout request fails.
    }

    showToast({
      title: Common.Toasts.LoggedOutTitle,
      description: Common.Toasts.LoggedOutDescription,
      variant: "info",
    });
    router.replace(APP_ROUTES.Login);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="dashboard-atmosphere" />

      <section className="dashboard-container">
        <header className="dashboard-hero p-4 sm:p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="dashboard-badge-brand">
                {Dashboard.Header.Badge}
              </Badge>
              <h1 className="dashboard-heading text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                {Dashboard.Header.Title}
              </h1>
              <p className="dashboard-body-muted max-w-2xl text-sm leading-relaxed sm:text-base">
                {Dashboard.Header.Description}
              </p>
            </div>
            <div className="flex w-fit self-start gap-2 md:self-end">
              <div className="dashboard-pill">
                {isFetching
                  ? Dashboard.Header.Refreshing
                  : Dashboard.Header.Realtime}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
                {Common.Actions.Logout}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push(APP_ROUTES.Admin)}
              >
                {Admin.Actions.OpenAdmin}
              </Button>
            </div>
          </div>
        </header>

        {isLoading ? (
          <section className="dashboard-grid-stats">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-2xl sm:h-36" />
            ))}
          </section>
        ) : (
          <section className="dashboard-grid-stats">
            <StatCard
              title={Dashboard.Stats.AppointmentsToday.Title}
              value={`${data?.citasHoy ?? 0}`}
              hint={Dashboard.Stats.AppointmentsToday.Hint}
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <StatCard
              title={Dashboard.Stats.ActiveBarbers.Title}
              value={`${data?.barberosActivos ?? 0}`}
              hint={Dashboard.Stats.ActiveBarbers.Hint}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              title={Dashboard.Stats.Customers.Title}
              value={`${data?.clientesRegistrados ?? 0}`}
              hint={Dashboard.Stats.Customers.Hint}
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
              title={Dashboard.Stats.ActiveServices.Title}
              value={`${data?.serviciosActivos ?? 0}`}
              hint={Dashboard.Stats.ActiveServices.Hint}
              icon={<Scissors className="h-4 w-4" />}
            />
          </section>
        )}

        <section className="dashboard-grid-panels">
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Dashboard.Upcoming.Title}
              </CardTitle>
              <CardDescription className="dashboard-description">
                {Dashboard.Upcoming.Description}
              </CardDescription>
            </CardHeader>
            <CardContent className="dashboard-body-muted space-y-2.5 text-sm sm:space-y-3">
              {!data?.proximaCita ? (
                <p>{Dashboard.Upcoming.Empty}</p>
              ) : (
                <>
                  <p>
                    <span className="dashboard-heading font-medium">
                      {Dashboard.Upcoming.Customer}
                    </span>{" "}
                    {data.proximaCita.customerName}
                  </p>
                  <p>
                    <span className="dashboard-heading font-medium">
                      {Dashboard.Upcoming.Service}
                    </span>{" "}
                    {data.proximaCita.serviceName}
                  </p>
                  <p>
                    <span className="dashboard-heading font-medium">
                      {Dashboard.Upcoming.Barber}
                    </span>{" "}
                    {data.proximaCita.barberName}
                  </p>
                  <p>
                    <span className="dashboard-heading font-medium">
                      {Dashboard.Upcoming.Date}
                    </span>{" "}
                    {formatDate(data.proximaCita.appointmentTime)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Dashboard.System.Title}
              </CardTitle>
              <CardDescription className="dashboard-description">
                {Dashboard.System.Description}
              </CardDescription>
            </CardHeader>
            <CardContent className="dashboard-body-muted space-y-2.5 text-sm sm:space-y-3">
              <div className="flex items-center justify-between">
                <span>{Dashboard.System.ApiAvailable}</span>
                <Badge
                  className={
                    data?.apiOk
                      ? "dashboard-status-ok"
                      : "dashboard-status-error"
                  }
                >
                  {data?.apiOk ? Common.Status.Ok : Common.Status.Error}
                </Badge>
              </div>

              <Separator />

              <div className="dashboard-security-box">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  {Dashboard.System.SecurityNoteTitle}
                </div>
                <p className="text-xs leading-relaxed">
                  {Dashboard.System.SecurityNotePrefix}
                  <code className="dashboard-inline-code">
                    {AUTH_COOKIE_NAME}
                  </code>
                  .
                </p>
              </div>

              {error ? (
                <p className="dashboard-status-error dashboard-microtext rounded-md px-2 py-1">
                  {Dashboard.System.ProtectedDataError}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}
