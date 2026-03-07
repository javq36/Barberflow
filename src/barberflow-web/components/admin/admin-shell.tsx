"use client";

import { FormEvent, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarberItem,
  CustomerItem,
  ServiceItem,
  useCreateBarberMutation,
  useCreateCustomerMutation,
  useCreateServiceMutation,
  useDeleteBarberMutation,
  useDeleteCustomerMutation,
  useDeleteServiceMutation,
  useGetAppointmentsQuery,
  useGetBarbersQuery,
  useGetCustomersQuery,
  useGetServicesQuery,
  useUpdateBarberMutation,
  useUpdateCustomerMutation,
  useUpdateServiceMutation,
} from "@/lib/api/owner-admin-api";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

function getApiErrorMessage(error: unknown): string | null {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }

  return null;
}

export function AdminShell() {
  const router = useRouter();
  const { Admin, Common } = Texts;
  const { showToast } = useAppToast();

  const servicesQuery = useGetServicesQuery();
  const barbersQuery = useGetBarbersQuery();
  const customersQuery = useGetCustomersQuery();
  const appointmentsQuery = useGetAppointmentsQuery();

  const [createService, createServiceState] = useCreateServiceMutation();
  const [updateService, updateServiceState] = useUpdateServiceMutation();
  const [deleteService, deleteServiceState] = useDeleteServiceMutation();

  const [createBarber, createBarberState] = useCreateBarberMutation();
  const [updateBarber, updateBarberState] = useUpdateBarberMutation();
  const [deleteBarber, deleteBarberState] = useDeleteBarberMutation();

  const [createCustomer, createCustomerState] = useCreateCustomerMutation();
  const [updateCustomer, updateCustomerState] = useUpdateCustomerMutation();
  const [deleteCustomer, deleteCustomerState] = useDeleteCustomerMutation();

  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceDuration, setServiceDuration] = useState("");

  const [barberName, setBarberName] = useState("");
  const [barberEmail, setBarberEmail] = useState("");
  const [barberPhone, setBarberPhone] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const [editingService, setEditingService] = useState<ServiceItem | null>(
    null,
  );
  const [editingBarber, setEditingBarber] = useState<BarberItem | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null,
  );

  const stats = useMemo(
    () => ({
      services: servicesQuery.data?.length ?? 0,
      barbers: barbersQuery.data?.length ?? 0,
      customers: customersQuery.data?.length ?? 0,
      appointments: appointmentsQuery.data?.length ?? 0,
    }),
    [
      appointmentsQuery.data,
      barbersQuery.data,
      customersQuery.data,
      servicesQuery.data,
    ],
  );

  async function onCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createService({
        name: serviceName.trim(),
        durationMinutes: Number(serviceDuration),
        price: Number(servicePrice),
        active: true,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Sections.CreateService,
        variant: "success",
      });

      setServiceName("");
      setServiceDuration("");
      setServicePrice("");
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onCreateBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createBarber({
        name: barberName.trim(),
        email: barberEmail.trim() || undefined,
        phone: barberPhone.trim() || undefined,
        isActive: true,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Sections.CreateBarber,
        variant: "success",
      });

      setBarberName("");
      setBarberEmail("");
      setBarberPhone("");
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createCustomer({
        name: customerName.trim(),
        email: customerEmail.trim() || undefined,
        phone: customerPhone.trim() || undefined,
        notes: customerNotes.trim() || undefined,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Sections.CreateCustomer,
        variant: "success",
      });

      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setCustomerNotes("");
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onUpdateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingService) {
      return;
    }

    try {
      await updateService({
        id: editingService.id,
        name: editingService.name.trim(),
        durationMinutes: Number(editingService.durationMinutes),
        price: Number(editingService.price),
        active: editingService.active,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.ServiceUpdated,
        variant: "success",
      });
      setEditingService(null);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onDeleteService(id: string) {
    if (!window.confirm(Admin.Messages.ConfirmDeleteService)) {
      return;
    }

    try {
      await deleteService(id).unwrap();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.ServiceDeleted,
        variant: "success",
      });
      if (editingService?.id === id) {
        setEditingService(null);
      }
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onUpdateBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBarber) {
      return;
    }

    try {
      await updateBarber({
        id: editingBarber.id,
        name: editingBarber.name.trim(),
        email: editingBarber.email?.trim() || undefined,
        phone: editingBarber.phone?.trim() || undefined,
        isActive: editingBarber.isActive,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.BarberUpdated,
        variant: "success",
      });
      setEditingBarber(null);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onDeleteBarber(id: string) {
    if (!window.confirm(Admin.Messages.ConfirmDeleteBarber)) {
      return;
    }

    try {
      await deleteBarber(id).unwrap();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.BarberDeleted,
        variant: "success",
      });
      if (editingBarber?.id === id) {
        setEditingBarber(null);
      }
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onUpdateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCustomer) {
      return;
    }

    try {
      await updateCustomer({
        id: editingCustomer.id,
        name: (editingCustomer.name ?? "").trim(),
        email: editingCustomer.email?.trim() || undefined,
        phone: editingCustomer.phone?.trim() || undefined,
        notes: editingCustomer.notes?.trim() || undefined,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.CustomerUpdated,
        variant: "success",
      });
      setEditingCustomer(null);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onDeleteCustomer(id: string) {
    if (!window.confirm(Admin.Messages.ConfirmDeleteCustomer)) {
      return;
    }

    try {
      await deleteCustomer(id).unwrap();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.CustomerDeleted,
        variant: "success",
      });
      if (editingCustomer?.id === id) {
        setEditingCustomer(null);
      }
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="dashboard-atmosphere" />

      <section className="dashboard-container">
        <header className="dashboard-hero p-4 sm:p-6 md:p-8">
          <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge className="dashboard-badge-brand">
                {Admin.Actions.OpenAdmin}
              </Badge>
              <h1 className="dashboard-heading text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                {Admin.Title}
              </h1>
              <p className="dashboard-body-muted max-w-2xl text-sm leading-relaxed sm:text-base">
                {Admin.Description}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(APP_ROUTES.Dashboard)}
            >
              {Admin.Actions.GoDashboard}
            </Button>
          </div>
        </header>

        <section className="dashboard-grid-stats">
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base">
                {Admin.Stats.Services}
              </CardTitle>
            </CardHeader>
            <CardContent className="dashboard-heading text-3xl font-semibold">
              {stats.services}
            </CardContent>
          </Card>
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base">
                {Admin.Stats.Barbers}
              </CardTitle>
            </CardHeader>
            <CardContent className="dashboard-heading text-3xl font-semibold">
              {stats.barbers}
            </CardContent>
          </Card>
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base">
                {Admin.Stats.Customers}
              </CardTitle>
            </CardHeader>
            <CardContent className="dashboard-heading text-3xl font-semibold">
              {stats.customers}
            </CardContent>
          </Card>
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base">
                {Admin.Stats.Appointments}
              </CardTitle>
            </CardHeader>
            <CardContent className="dashboard-heading text-3xl font-semibold">
              {stats.appointments}
            </CardContent>
          </Card>
        </section>

        <section className="dashboard-grid-panels">
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.CreateService}
              </CardTitle>
              <CardDescription className="dashboard-description">
                {Admin.Api.CreateService}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={onCreateService}>
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder={Admin.Fields.Name}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={serviceDuration}
                  onChange={(e) => setServiceDuration(e.target.value)}
                  placeholder={Admin.Fields.DurationMinutes}
                  inputMode="numeric"
                />
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  placeholder={Admin.Fields.Price}
                  inputMode="decimal"
                />
                <Button type="submit" disabled={createServiceState.isLoading}>
                  {Admin.Actions.CreateService}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.CreateBarber}
              </CardTitle>
              <CardDescription className="dashboard-description">
                {Admin.Api.CreateBarber}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={onCreateBarber}>
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={barberName}
                  onChange={(e) => setBarberName(e.target.value)}
                  placeholder={Admin.Fields.Name}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={barberEmail}
                  onChange={(e) => setBarberEmail(e.target.value)}
                  placeholder={Admin.Fields.Email}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={barberPhone}
                  onChange={(e) => setBarberPhone(e.target.value)}
                  placeholder={Admin.Fields.Phone}
                />
                <Button type="submit" disabled={createBarberState.isLoading}>
                  {Admin.Actions.CreateBarber}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.CreateCustomer}
              </CardTitle>
              <CardDescription className="dashboard-description">
                {Admin.Api.CreateCustomer}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={onCreateCustomer}>
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={Admin.Fields.Name}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder={Admin.Fields.Email}
                />
                <input
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={Admin.Fields.Phone}
                />
                <textarea
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder={Admin.Fields.Notes}
                  rows={3}
                />
                <Button type="submit" disabled={createCustomerState.isLoading}>
                  {Admin.Actions.CreateCustomer}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.RecentAppointments}
              </CardTitle>
              <CardDescription className="dashboard-description">
                {Admin.Api.GetAppointments}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {appointmentsQuery.isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : null}
              {!appointmentsQuery.isLoading &&
              (appointmentsQuery.data?.length ?? 0) === 0 ? (
                <p className="dashboard-microtext">
                  {Admin.Empty.Appointments}
                </p>
              ) : null}
              {(appointmentsQuery.data ?? []).slice(0, 6).map((appointment) => (
                <article
                  key={appointment.id}
                  className="rounded-xl border border-border/60 p-3"
                >
                  <p className="dashboard-heading text-sm font-medium">
                    {appointment.customerName}
                  </p>
                  <p className="dashboard-microtext">
                    {appointment.serviceName} · {appointment.barberName}
                  </p>
                  <p className="dashboard-microtext">
                    {new Date(appointment.appointmentTime).toLocaleString(
                      Admin.Format.Locale,
                    )}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="dashboard-grid-panels">
          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.ManageServices}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {servicesQuery.isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : null}
              {!servicesQuery.isLoading &&
              (servicesQuery.data?.length ?? 0) === 0 ? (
                <p className="dashboard-microtext">{Admin.Empty.Services}</p>
              ) : null}
              {(servicesQuery.data ?? []).map((service) => (
                <article
                  key={service.id}
                  className="rounded-xl border border-border/60 p-3"
                >
                  {editingService?.id === service.id ? (
                    <form className="space-y-2" onSubmit={onUpdateService}>
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingService.name}
                        onChange={(e) =>
                          setEditingService({
                            ...editingService,
                            name: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Name}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={`${editingService.durationMinutes}`}
                        onChange={(e) =>
                          setEditingService({
                            ...editingService,
                            durationMinutes: Number(e.target.value),
                          })
                        }
                        placeholder={Admin.Fields.DurationMinutes}
                        inputMode="numeric"
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={`${editingService.price}`}
                        onChange={(e) =>
                          setEditingService({
                            ...editingService,
                            price: Number(e.target.value),
                          })
                        }
                        placeholder={Admin.Fields.Price}
                        inputMode="decimal"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editingService.active}
                          onChange={(e) =>
                            setEditingService({
                              ...editingService,
                              active: e.target.checked,
                            })
                          }
                        />
                        {editingService.active
                          ? Admin.Actions.Deactivate
                          : Admin.Actions.Activate}
                      </label>
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={updateServiceState.isLoading}
                        >
                          {Admin.Actions.Save}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingService(null)}
                        >
                          {Admin.Actions.Cancel}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-1">
                      <p className="dashboard-heading text-sm font-medium">
                        {service.name}
                      </p>
                      <p className="dashboard-microtext">
                        {service.durationMinutes} min · {service.price}
                      </p>
                      <p className="dashboard-microtext">
                        {service.active
                          ? Common.Status.Ok
                          : Common.Status.Error}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingService(service)}
                        >
                          {Admin.Actions.Edit}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onDeleteService(service.id)}
                          disabled={deleteServiceState.isLoading}
                        >
                          {Admin.Actions.Delete}
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.ManageBarbers}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {barbersQuery.isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : null}
              {!barbersQuery.isLoading &&
              (barbersQuery.data?.length ?? 0) === 0 ? (
                <p className="dashboard-microtext">{Admin.Empty.Barbers}</p>
              ) : null}
              {(barbersQuery.data ?? []).map((barber) => (
                <article
                  key={barber.id}
                  className="rounded-xl border border-border/60 p-3"
                >
                  {editingBarber?.id === barber.id ? (
                    <form className="space-y-2" onSubmit={onUpdateBarber}>
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingBarber.name}
                        onChange={(e) =>
                          setEditingBarber({
                            ...editingBarber,
                            name: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Name}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingBarber.email ?? ""}
                        onChange={(e) =>
                          setEditingBarber({
                            ...editingBarber,
                            email: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Email}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingBarber.phone ?? ""}
                        onChange={(e) =>
                          setEditingBarber({
                            ...editingBarber,
                            phone: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Phone}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editingBarber.isActive}
                          onChange={(e) =>
                            setEditingBarber({
                              ...editingBarber,
                              isActive: e.target.checked,
                            })
                          }
                        />
                        {editingBarber.isActive
                          ? Admin.Actions.Deactivate
                          : Admin.Actions.Activate}
                      </label>
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={updateBarberState.isLoading}
                        >
                          {Admin.Actions.Save}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingBarber(null)}
                        >
                          {Admin.Actions.Cancel}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-1">
                      <p className="dashboard-heading text-sm font-medium">
                        {barber.name}
                      </p>
                      <p className="dashboard-microtext">
                        {barber.email ?? Common.Status.NoData}
                      </p>
                      <p className="dashboard-microtext">
                        {barber.phone ?? Common.Status.NoData}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingBarber(barber)}
                        >
                          {Admin.Actions.Edit}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onDeleteBarber(barber.id)}
                          disabled={deleteBarberState.isLoading}
                        >
                          {Admin.Actions.Delete}
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="dashboard-panel">
            <CardHeader>
              <CardTitle className="dashboard-heading text-base sm:text-lg">
                {Admin.Sections.ManageCustomers}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {customersQuery.isLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : null}
              {!customersQuery.isLoading &&
              (customersQuery.data?.length ?? 0) === 0 ? (
                <p className="dashboard-microtext">{Admin.Empty.Customers}</p>
              ) : null}
              {(customersQuery.data ?? []).map((customer) => (
                <article
                  key={customer.id}
                  className="rounded-xl border border-border/60 p-3"
                >
                  {editingCustomer?.id === customer.id ? (
                    <form className="space-y-2" onSubmit={onUpdateCustomer}>
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingCustomer.name ?? ""}
                        onChange={(e) =>
                          setEditingCustomer({
                            ...editingCustomer,
                            name: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Name}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingCustomer.email ?? ""}
                        onChange={(e) =>
                          setEditingCustomer({
                            ...editingCustomer,
                            email: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Email}
                      />
                      <input
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingCustomer.phone ?? ""}
                        onChange={(e) =>
                          setEditingCustomer({
                            ...editingCustomer,
                            phone: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Phone}
                      />
                      <textarea
                        className="w-full rounded-xl border border-border bg-background/80 px-3 py-2 text-sm text-foreground"
                        value={editingCustomer.notes ?? ""}
                        onChange={(e) =>
                          setEditingCustomer({
                            ...editingCustomer,
                            notes: e.target.value,
                          })
                        }
                        placeholder={Admin.Fields.Notes}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={updateCustomerState.isLoading}
                        >
                          {Admin.Actions.Save}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingCustomer(null)}
                        >
                          {Admin.Actions.Cancel}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-1">
                      <p className="dashboard-heading text-sm font-medium">
                        {customer.name ?? Common.Status.NoData}
                      </p>
                      <p className="dashboard-microtext">
                        {customer.email ?? Common.Status.NoData}
                      </p>
                      <p className="dashboard-microtext">
                        {customer.phone ?? Common.Status.NoData}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCustomer(customer)}
                        >
                          {Admin.Actions.Edit}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onDeleteCustomer(customer.id)}
                          disabled={deleteCustomerState.isLoading}
                        >
                          {Admin.Actions.Delete}
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </CardContent>
          </Card>
        </section>
      </section>
    </main>
  );
}
