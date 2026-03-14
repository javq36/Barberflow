"use client";

import { Activity, CalendarClock, Scissors, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { OwnerPanelShell } from "@/components/dashboard/owner-panel-shell";
import { Texts } from "@/lib/content/texts";
import { APP_ROUTES } from "@/lib/config/app";
import { AppRole } from "@/lib/auth/permissions";
import { formatDashboardDate } from "@/lib/dashboard/helpers";
import { useGetDashboardSummaryQuery } from "@/lib/api/dashboard-api";

type DashboardShellProps = {
  role: AppRole;
};

export function DashboardShell({ role }: DashboardShellProps) {
  const { Dashboard, Common } = Texts;
  const { data, isLoading, isFetching, error } = useGetDashboardSummaryQuery();

  function navigateTo(href: string) {
    window.location.assign(href);
  }

  return (
    <OwnerPanelShell
      role={role}
      title={Dashboard.Header.Title}
      description={Dashboard.Header.Description}
    >
      <section className="dashboard-panel px-3 py-2">
        <div className="dashboard-pill w-fit">
          {isFetching ? (
            <LoadingIndicator
              label={Dashboard.Header.Refreshing}
              className="text-xs"
              spinnerClassName="h-3 w-3"
            />
          ) : (
            Dashboard.Header.Realtime
          )}
        </div>
      </section>

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
                  {formatDashboardDate(data.proximaCita.appointmentTime)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="dashboard-panel">
          <CardHeader>
            <CardTitle className="dashboard-heading text-base sm:text-lg">
              {Dashboard.Operations.Title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="dashboard-body-muted text-sm">
              {Dashboard.Operations.Description}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigateTo(APP_ROUTES.Services)}
              >
                {Dashboard.Navigation.Services}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigateTo(APP_ROUTES.Barbers)}
              >
                {Dashboard.Navigation.Barbers}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigateTo(APP_ROUTES.Customers)}
              >
                {Dashboard.Navigation.Customers}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigateTo(APP_ROUTES.Schedule)}
              >
                {Dashboard.Actions.OpenSchedule}
              </Button>
            </div>
            {error ? (
              <p className="dashboard-status-error dashboard-microtext rounded-md px-2 py-1">
                {Dashboard.Operations.BackendWarning}
              </p>
            ) : null}
            <span
              className={
                data?.apiOk
                  ? "dashboard-status-ok rounded-md px-2 py-1 text-xs"
                  : "dashboard-status-error rounded-md px-2 py-1 text-xs"
              }
            >
              {data?.apiOk ? Common.Status.Ok : Common.Status.Error}
            </span>
          </CardContent>
        </Card>
      </section>
    </OwnerPanelShell>
  );
}
