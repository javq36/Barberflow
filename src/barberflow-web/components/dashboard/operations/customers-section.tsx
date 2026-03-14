"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  CustomerItem,
  useCreateCustomerMutation,
  useDeleteCustomerMutation,
  useGetCustomersQuery,
  useUpdateCustomerMutation,
} from "@/lib/api/owner-admin-api";
import { getApiErrorMessage } from "@/lib/api/error";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

type CustomersSectionProps = {
  canOperate: boolean;
};

export function CustomersSection({ canOperate }: CustomersSectionProps) {
  const { Admin, Common, Dashboard } = Texts;
  const { showToast } = useAppToast();

  const customersQuery = useGetCustomersQuery(undefined, { skip: !canOperate });
  const [createCustomer, createCustomerState] = useCreateCustomerMutation();
  const [updateCustomer, updateCustomerState] = useUpdateCustomerMutation();
  const [deleteCustomer, deleteCustomerState] = useDeleteCustomerMutation();

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null,
  );

  async function onCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createCustomer({
        name: customerName.trim(),
        email: customerEmail.trim() || undefined,
        phone: customerPhone.trim() || undefined,
        notes: customerNotes.trim() || undefined,
        isActive: true,
      }).unwrap();

      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setCustomerNotes("");

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Sections.CreateCustomer,
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
        isActive: editingCustomer.isActive,
      }).unwrap();

      setEditingCustomer(null);
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.CustomerUpdated,
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

  async function onToggleCustomerActive(customer: CustomerItem) {
    try {
      if (customer.isActive) {
        await deleteCustomer(customer.id).unwrap();
      } else {
        await updateCustomer({
          id: customer.id,
          name: (customer.name ?? "").trim(),
          email: customer.email?.trim() || undefined,
          phone: customer.phone?.trim() || undefined,
          notes: customer.notes?.trim() || undefined,
          isActive: true,
        }).unwrap();
      }

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.CustomerUpdated,
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
    <Card id="customers" className="dashboard-panel">
      <CardHeader>
        <CardTitle className="dashboard-heading text-lg">
          {Dashboard.Operations.CustomersTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canOperate ? (
          <p className="dashboard-microtext">{Dashboard.Operations.DisabledMessage}</p>
        ) : null}

        {canOperate ? (
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={onCreateCustomer}>
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder={Admin.Fields.Name}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder={Admin.Fields.Email}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder={Admin.Fields.Phone}
            />
            <LoadingButton
              type="submit"
              isLoading={createCustomerState.isLoading}
              loadingText={Admin.Actions.Creating}
            >
              {Admin.Actions.CreateCustomer}
            </LoadingButton>
            <textarea
              className="sm:col-span-4 w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={customerNotes}
              onChange={(event) => setCustomerNotes(event.target.value)}
              placeholder={Admin.Fields.Notes}
              rows={2}
            />
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
              {(customersQuery.data ?? []).map((customer) => (
                <tr key={customer.id} className="border-b border-border/40">
                  <td className="px-3 py-2">{customer.name ?? Common.Status.NoData}</td>
                  <td className="px-3 py-2">{customer.email ?? Common.Status.NoData}</td>
                  <td className="px-3 py-2">{customer.phone ?? Common.Status.NoData}</td>
                  <td className="px-3 py-2">
                    {customer.isActive ? Common.Status.Ok : Common.Status.Error}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingCustomer(customer)}
                      >
                        {Admin.Actions.Edit}
                      </Button>
                      <LoadingButton
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onToggleCustomerActive(customer)}
                        isLoading={
                          deleteCustomerState.isLoading ||
                          updateCustomerState.isLoading
                        }
                        loadingText={Admin.Actions.Updating}
                      >
                        {customer.isActive
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

        {editingCustomer ? (
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={onUpdateCustomer}>
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingCustomer.name ?? ""}
              onChange={(event) =>
                setEditingCustomer({
                  ...editingCustomer,
                  name: event.target.value,
                })
              }
              placeholder={Admin.Fields.Name}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingCustomer.email ?? ""}
              onChange={(event) =>
                setEditingCustomer({
                  ...editingCustomer,
                  email: event.target.value,
                })
              }
              placeholder={Admin.Fields.Email}
            />
            <input
              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingCustomer.phone ?? ""}
              onChange={(event) =>
                setEditingCustomer({
                  ...editingCustomer,
                  phone: event.target.value,
                })
              }
              placeholder={Admin.Fields.Phone}
            />
            <div className="flex gap-2">
              <LoadingButton
                type="submit"
                isLoading={updateCustomerState.isLoading}
                loadingText={Admin.Actions.Saving}
              >
                {Admin.Actions.Save}
              </LoadingButton>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingCustomer(null)}
              >
                {Admin.Actions.Cancel}
              </Button>
            </div>
            <textarea
              className="sm:col-span-4 w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
              value={editingCustomer.notes ?? ""}
              onChange={(event) =>
                setEditingCustomer({
                  ...editingCustomer,
                  notes: event.target.value,
                })
              }
              placeholder={Admin.Fields.Notes}
              rows={2}
            />
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
