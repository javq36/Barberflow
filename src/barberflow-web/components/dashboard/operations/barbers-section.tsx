"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  BarberItem,
  useCreateBarberMutation,
  useDeleteBarberMutation,
  useGetBarbersQuery,
  useUpdateBarberMutation,
} from "@/lib/api/owner-admin-api";
import { getApiErrorMessage } from "@/lib/api/error";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

type BarbersSectionProps = {
  canOperate: boolean;
};

export function BarbersSection({ canOperate }: BarbersSectionProps) {
  const { Admin, Common, Dashboard } = Texts;
  const { showToast } = useAppToast();

  const barbersQuery = useGetBarbersQuery(undefined, { skip: !canOperate });
  const [createBarber, createBarberState] = useCreateBarberMutation();
  const [updateBarber, updateBarberState] = useUpdateBarberMutation();
  const [deleteBarber, deleteBarberState] = useDeleteBarberMutation();

  const [barberName, setBarberName] = useState("");
  const [barberEmail, setBarberEmail] = useState("");
  const [barberPhone, setBarberPhone] = useState("");
  const [editingBarber, setEditingBarber] = useState<BarberItem | null>(null);

  async function onCreateBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createBarber({
        name: barberName.trim(),
        email: barberEmail.trim() || undefined,
        phone: barberPhone.trim() || undefined,
        isActive: true,
      }).unwrap();

      setBarberName("");
      setBarberEmail("");
      setBarberPhone("");

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Sections.CreateBarber,
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

      setEditingBarber(null);
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.BarberUpdated,
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

  async function onToggleBarberActive(barber: BarberItem) {
    try {
      if (barber.isActive) {
        await deleteBarber(barber.id).unwrap();
      } else {
        await updateBarber({
          id: barber.id,
          name: barber.name.trim(),
          email: barber.email?.trim() || undefined,
          phone: barber.phone?.trim() || undefined,
          isActive: true,
        }).unwrap();
      }

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.BarberUpdated,
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
    <Card id="barbers" className="dashboard-panel">
      <CardHeader>
        <CardTitle className="dashboard-heading text-lg">
          {Dashboard.Operations.BarbersTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canOperate ? (
          <p className="dashboard-microtext">{Dashboard.Operations.DisabledMessage}</p>
        ) : null}

        {canOperate ? (
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={onCreateBarber}>
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={barberName}
              onChange={(event) => setBarberName(event.target.value)}
              placeholder={Admin.Fields.Name}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={barberEmail}
              onChange={(event) => setBarberEmail(event.target.value)}
              placeholder={Admin.Fields.Email}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={barberPhone}
              onChange={(event) => setBarberPhone(event.target.value)}
              placeholder={Admin.Fields.Phone}
            />
            <LoadingButton
              type="submit"
              isLoading={createBarberState.isLoading}
              loadingText={Admin.Actions.Creating}
            >
              {Admin.Actions.CreateBarber}
            </LoadingButton>
          </form>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="px-3 py-2">{Admin.Fields.Name}</th>
                <th className="px-3 py-2">{Admin.Fields.Email}</th>
                <th className="px-3 py-2">{Admin.Fields.Phone}</th>
                <th className="px-3 py-2">{Admin.Fields.Status}</th>
                <th className="px-3 py-2">{Admin.Actions.Edit}</th>
              </tr>
            </thead>
            <tbody>
              {(barbersQuery.data ?? []).map((barber) => (
                <tr key={barber.id} className="border-b border-border/40">
                  <td className="px-3 py-2">{barber.name}</td>
                  <td className="px-3 py-2">{barber.email ?? Common.Status.NoData}</td>
                  <td className="px-3 py-2">{barber.phone ?? Common.Status.NoData}</td>
                  <td className="px-3 py-2">
                    {barber.isActive ? Common.Status.Ok : Common.Status.Error}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingBarber(barber)}
                      >
                        {Admin.Actions.Edit}
                      </Button>
                      <LoadingButton
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggleBarberActive(barber)}
                        isLoading={
                          deleteBarberState.isLoading || updateBarberState.isLoading
                        }
                        loadingText={Admin.Actions.Updating}
                      >
                        {barber.isActive
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

        {editingBarber ? (
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={onUpdateBarber}>
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingBarber.name}
              onChange={(event) =>
                setEditingBarber({ ...editingBarber, name: event.target.value })
              }
              placeholder={Admin.Fields.Name}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingBarber.email ?? ""}
              onChange={(event) =>
                setEditingBarber({ ...editingBarber, email: event.target.value })
              }
              placeholder={Admin.Fields.Email}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingBarber.phone ?? ""}
              onChange={(event) =>
                setEditingBarber({ ...editingBarber, phone: event.target.value })
              }
              placeholder={Admin.Fields.Phone}
            />
            <div className="flex gap-2">
              <LoadingButton
                type="submit"
                isLoading={updateBarberState.isLoading}
                loadingText={Admin.Actions.Saving}
              >
                {Admin.Actions.Save}
              </LoadingButton>
              <Button type="button" variant="outline" onClick={() => setEditingBarber(null)}>
                {Admin.Actions.Cancel}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
