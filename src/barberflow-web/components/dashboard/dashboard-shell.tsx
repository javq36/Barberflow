"use client";

import { Activity, CalendarClock, Scissors, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetDashboardSummaryQuery } from "@/lib/api/dashboard-api";
import { StatCard } from "@/components/dashboard/stat-card";

function formatDate(value?: string) {
  if (!value) {
    return "Sin datos";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardShell() {
  const { data, isLoading, isFetching, error } = useGetDashboardSummaryQuery();

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-6 md:px-8 md:py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_10%,#f9cf58_0%,transparent_30%),radial-gradient(circle_at_90%_20%,#8fd3c6_0%,transparent_28%),linear-gradient(145deg,#f8fafc_0%,#eef2ff_55%,#ecfeff_100%)]" />

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-3xl border border-white/40 bg-white/65 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="rounded-full bg-slate-900 px-3 py-1 text-xs tracking-wide text-white hover:bg-slate-900">
                BarberFlow · Panel Owner
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                Dashboard operativo
              </h1>
              <p className="max-w-2xl text-sm text-slate-600 md:text-base">
                Vista inicial para controlar salud del sistema, agenda de hoy y actividad base del negocio.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              {isFetching ? "Actualizando metricas..." : "Datos en tiempo real del backend"}
            </div>
          </div>
        </header>

        {isLoading ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-2xl" />
            ))}
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Citas de hoy"
              value={`${data?.citasHoy ?? 0}`}
              hint="Agendadas para la fecha actual"
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <StatCard
              title="Barberos activos"
              value={`${data?.barberosActivos ?? 0}`}
              hint="Disponibles para atender"
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              title="Clientes"
              value={`${data?.clientesRegistrados ?? 0}`}
              hint="Base de clientes registrada"
              icon={<Activity className="h-4 w-4" />}
            />
            <StatCard
              title="Servicios activos"
              value={`${data?.serviciosActivos ?? 0}`}
              hint="Servicios publicados"
              icon={<Scissors className="h-4 w-4" />}
            />
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-white/20 bg-white/80 backdrop-blur-sm shadow-[0_12px_30px_-20px_rgba(16,24,40,0.55)]">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">Proxima cita</CardTitle>
              <CardDescription>La siguiente atencion programada en agenda.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              {!data?.proximaCita ? (
                <p>No hay citas futuras por ahora.</p>
              ) : (
                <>
                  <p>
                    <span className="font-medium text-slate-900">Cliente:</span> {data.proximaCita.customerName}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Servicio:</span> {data.proximaCita.serviceName}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Barbero:</span> {data.proximaCita.barberName}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Fecha:</span> {formatDate(data.proximaCita.appointmentTime)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/20 bg-white/80 backdrop-blur-sm shadow-[0_12px_30px_-20px_rgba(16,24,40,0.55)]">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">Estado del sistema</CardTitle>
              <CardDescription>Chequeo rapido para soporte operativo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>API disponible</span>
                <Badge
                  className={
                    data?.apiOk
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                      : "bg-rose-100 text-rose-800 hover:bg-rose-100"
                  }
                >
                  {data?.apiOk ? "OK" : "Error"}
                </Badge>
              </div>

              <Separator />

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Nota de seguridad
                </div>
                <p className="text-xs leading-relaxed">
                  Para consumir endpoints privados, guarda el JWT en localStorage con la clave
                  <code className="ml-1 rounded bg-amber-100 px-1 py-0.5">bf_access_token</code>.
                </p>
              </div>

              {error ? (
                <p className="text-xs text-rose-700">
                  No se pudieron cargar algunos datos protegidos. Verifica login/token y que la API este corriendo.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}
