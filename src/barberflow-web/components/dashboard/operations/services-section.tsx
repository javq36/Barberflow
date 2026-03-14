"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  ServiceItem,
  useCreateServiceMutation,
  useGetServicesQuery,
  useUpdateServiceMutation,
} from "@/lib/api/owner-admin-api";
import { getApiErrorMessage } from "@/lib/api/error";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

type ServicesSectionProps = {
  canOperate: boolean;
};

export function ServicesSection({ canOperate }: ServicesSectionProps) {
  const { Admin, Common, Dashboard } = Texts;
  const { showToast } = useAppToast();

  const servicesQuery = useGetServicesQuery(undefined, { skip: !canOperate });
  const [createService, createServiceState] = useCreateServiceMutation();
  const [updateService, updateServiceState] = useUpdateServiceMutation();

  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceDuration, setServiceDuration] = useState("");
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  async function onCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createService({
        name: serviceName.trim(),
        durationMinutes: Number(serviceDuration),
        price: Number(servicePrice),
        active: true,
      }).unwrap();

      setServiceName("");
      setServicePrice("");
      setServiceDuration("");

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Sections.CreateService,
        variant: "success",
      });
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

      setEditingService(null);
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.ServiceUpdated,
        variant: "success",
      });
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onToggleServiceActive(service: ServiceItem) {
    try {
      await updateService({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
        active: !service.active,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.ServiceUpdated,
        variant: "success",
      });
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  return (
    <Card id="services" className="dashboard-panel">
      <CardHeader>
        <CardTitle className="dashboard-heading text-lg">
          {Dashboard.Operations.ServicesTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canOperate ? (
          <p className="dashboard-microtext">{Dashboard.Operations.DisabledMessage}</p>
        ) : null}

        {canOperate ? (
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={onCreateService}>
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
              placeholder={Admin.Fields.Name}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={serviceDuration}
              onChange={(event) => setServiceDuration(event.target.value)}
              placeholder={Admin.Fields.DurationMinutes}
              inputMode="numeric"
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={servicePrice}
              onChange={(event) => setServicePrice(event.target.value)}
              placeholder={Admin.Fields.Price}
              inputMode="decimal"
            />
            <LoadingButton
              type="submit"
              isLoading={createServiceState.isLoading}
              loadingText={Admin.Actions.Creating}
            >
              {Admin.Actions.CreateService}
            </LoadingButton>
          </form>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="px-3 py-2">{Admin.Fields.Name}</th>
                <th className="px-3 py-2">{Admin.Fields.DurationMinutes}</th>
                <th className="px-3 py-2">{Admin.Fields.Price}</th>
                <th className="px-3 py-2">{Admin.Fields.Status}</th>
                <th className="px-3 py-2">{Admin.Actions.Edit}</th>
              </tr>
            </thead>
            <tbody>
              {(servicesQuery.data ?? []).map((service) => (
                <tr key={service.id} className="border-b border-border/40">
                  <td className="px-3 py-2">{service.name}</td>
                  <td className="px-3 py-2">{service.durationMinutes}</td>
                  <td className="px-3 py-2">{service.price}</td>
                  <td className="px-3 py-2">
                    {service.active ? Common.Status.Ok : Common.Status.Error}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingService(service)}
                      >
                        {Admin.Actions.Edit}
                      </Button>
                      <LoadingButton
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggleServiceActive(service)}
                        isLoading={updateServiceState.isLoading}
                        loadingText={Admin.Actions.Updating}
                      >
                        {service.active
                          ? Admin.Actions.Deactivate
                          : Admin.Actions.Activate}
                      </LoadingButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingService ? (
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={onUpdateService}>
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingService.name}
              onChange={(event) =>
                setEditingService({ ...editingService, name: event.target.value })
              }
              placeholder={Admin.Fields.Name}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={`${editingService.durationMinutes}`}
              onChange={(event) =>
                setEditingService({
                  ...editingService,
                  durationMinutes: Number(event.target.value),
                })
              }
              placeholder={Admin.Fields.DurationMinutes}
              inputMode="numeric"
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={`${editingService.price}`}
              onChange={(event) =>
                setEditingService({
                  ...editingService,
                  price: Number(event.target.value),
                })
              }
              placeholder={Admin.Fields.Price}
              inputMode="decimal"
            />
            <div className="flex gap-2">
              <LoadingButton
                type="submit"
                isLoading={updateServiceState.isLoading}
                loadingText={Admin.Actions.Saving}
              >
                {Admin.Actions.Save}
              </LoadingButton>
              <Button type="button" variant="outline" onClick={() => setEditingService(null)}>
                {Admin.Actions.Cancel}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
