"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Eye,
  Pencil,
  Plus,
  Scissors,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { isValidPhoneNumber, type Value } from "react-phone-number-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  AppointmentItem,
  CustomerItem,
  useCreateCustomerMutation,
  useDeleteCustomerMutation,
  useGetAppointmentsQuery,
  useGetCustomersQuery,
  useUpdateCustomerMutation,
} from "@/lib/api/owner-admin-api";
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";
import { useRouter } from "next/navigation";

type CustomersSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

type CustomerFormErrors = {
  name?: string;
  phone?: string;
};

export function CustomersSection({ canOperate, role }: CustomersSectionProps) {
  const router = useRouter();
  const { Admin, Common, ClientsV2, SharedShell } = Texts;
  const { showToast } = useAppToast();

  const customersQuery = useGetCustomersQuery(undefined, { skip: !canOperate });
  const appointmentsQuery = useGetAppointmentsQuery(undefined, {
    skip: !canOperate,
  });
  const [createCustomer, createCustomerState] = useCreateCustomerMutation();
  const [updateCustomer, updateCustomerState] = useUpdateCustomerMutation();
  const [deleteCustomer, deleteCustomerState] = useDeleteCustomerMutation();

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [previewCustomer, setPreviewCustomer] = useState<CustomerItem | null>(
    null,
  );
  const [deleteCandidateCustomer, setDeleteCandidateCustomer] =
    useState<CustomerItem | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [createCustomerErrors, setCreateCustomerErrors] =
    useState<CustomerFormErrors>({});
  const [editCustomerErrors, setEditCustomerErrors] =
    useState<CustomerFormErrors>({});
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null,
  );

  const customers = useMemo(
    () => customersQuery.data ?? [],
    [customersQuery.data],
  );
  const appointments = useMemo(
    () => (appointmentsQuery.data ?? []) as AppointmentItem[],
    [appointmentsQuery.data],
  );

  const customerStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        appointmentCount: number;
        lastVisit: string | null;
        barberName: string | null;
      }
    >();

    for (const appointment of appointments) {
      const current = map.get(appointment.customerId);
      if (!current) {
        map.set(appointment.customerId, {
          appointmentCount: 1,
          lastVisit: appointment.appointmentTime,
          barberName: appointment.barberName,
        });
        continue;
      }

      const prevDate = current.lastVisit ? new Date(current.lastVisit) : null;
      const nextDate = new Date(appointment.appointmentTime);
      const isNewer = !prevDate || nextDate.getTime() > prevDate.getTime();

      map.set(appointment.customerId, {
        appointmentCount: current.appointmentCount + 1,
        lastVisit: isNewer ? appointment.appointmentTime : current.lastVisit,
        barberName: isNewer ? appointment.barberName : current.barberName,
      });
    }

    return map;
  }, [appointments]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    if (!normalizedQuery) {
      return customers;
    }

    return customers.filter((customer) => {
      const name = (customer.name ?? "").toLowerCase();
      const email = (customer.email ?? "").toLowerCase();
      const phone = (customer.phone ?? "").toLowerCase();

      return (
        name.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        phone.includes(normalizedQuery)
      );
    });
  }, [customers, searchTerm]);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalClients = customers.length;
  const newThisMonth = customers.filter((customer) => {
    if (!customer.createdAt) {
      return false;
    }

    const date = new Date(customer.createdAt);
    return (
      date.getMonth() === currentMonth && date.getFullYear() === currentYear
    );
  }).length;

  const returningClients = customers.filter((customer) => {
    const stats = customerStatsMap.get(customer.id);
    return (stats?.appointmentCount ?? 0) > 1;
  }).length;

  const returningRate = totalClients
    ? Math.round((returningClients / totalClients) * 100)
    : 0;

  const topTierClients = customers.filter((customer) => {
    const stats = customerStatsMap.get(customer.id);
    return (stats?.appointmentCount ?? 0) >= 10;
  }).length;

  const visibleDesktopCustomers = filteredCustomers.slice(0, 5);

  function getCustomerInitials(name?: string) {
    const safeName = (name ?? "").trim();
    if (!safeName) {
      return "CL";
    }

    const parts = safeName.split(" ").filter(Boolean);
    return `${parts[0]?.[0] ?? "C"}${parts[1]?.[0] ?? "L"}`.toUpperCase();
  }

  function formatLastVisit(isoDate?: string | null) {
    if (!isoDate) {
      return Common.Status.NoData;
    }

    return new Intl.DateTimeFormat("es-CO", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(isoDate));
  }

  function formatLastVisitDetail(
    isoDate?: string | null,
    barberName?: string | null,
  ) {
    if (!isoDate) {
      return Common.Status.NoData;
    }

    const time = new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(isoDate));

    return `${time} ${ClientsV2.Table.With} ${barberName ?? ClientsV2.Table.Team}`;
  }

  function validateCustomer(name: string, phone: string): CustomerFormErrors {
    const errors: CustomerFormErrors = {};

    if (!name.trim()) {
      errors.name = ClientsV2.Messages.NameRequired;
    }

    if (!phone) {
      errors.phone = ClientsV2.Messages.PhoneRequired;
    } else if (!isValidPhoneNumber(phone)) {
      errors.phone = ClientsV2.Messages.PhoneInvalid;
    }

    return errors;
  }

  async function onCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const normalizedName = customerName.trim();
      const validationErrors = validateCustomer(normalizedName, customerPhone);
      if (validationErrors.name || validationErrors.phone) {
        setCreateCustomerErrors(validationErrors);
        showToast({
          title: Common.Toasts.ErrorTitle,
          description:
            validationErrors.name ??
            validationErrors.phone ??
            Common.Status.Error,
          variant: "error",
        });
        return;
      }

      setCreateCustomerErrors({});

      await createCustomer({
        name: normalizedName,
        email: customerEmail.trim() || undefined,
        phone: customerPhone, // already E.164 from PhoneInput
        notes: customerNotes.trim() || undefined,
        isActive: true,
      }).unwrap();

      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setCustomerNotes("");
      setIsCreateModalOpen(false);

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
      const normalizedName = (editingCustomer.name ?? "").trim();
      const editPhone = editingCustomer.phone ?? "";
      const validationErrors = validateCustomer(normalizedName, editPhone);
      if (validationErrors.name || validationErrors.phone) {
        setEditCustomerErrors(validationErrors);
        showToast({
          title: Common.Toasts.ErrorTitle,
          description:
            validationErrors.name ??
            validationErrors.phone ??
            Common.Status.Error,
          variant: "error",
        });
        return;
      }

      setEditCustomerErrors({});

      await updateCustomer({
        id: editingCustomer.id,
        name: normalizedName,
        email: editingCustomer.email?.trim() || undefined,
        phone: editPhone, // already E.164 from PhoneInput
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

  function requestDeleteCustomer(customer: CustomerItem) {
    setDeleteCandidateCustomer(customer);
  }

  async function confirmDeleteCustomer() {
    if (!deleteCandidateCustomer) {
      return;
    }

    try {
      await deleteCustomer(deleteCandidateCustomer.id).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Admin.Messages.CustomerDeleted,
        variant: "success",
      });

      if (editingCustomer?.id === deleteCandidateCustomer.id) {
        setEditingCustomer(null);
      }

      if (previewCustomer?.id === deleteCandidateCustomer.id) {
        setPreviewCustomer(null);
      }

      setDeleteCandidateCustomer(null);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  return (
    <>
      <RoleWorkspaceShell
        canOperate={canOperate}
        disabledMessage={ClientsV2.DisabledMessage}
        role={role}
        activeItemId="customers"
        onNavigate={(href) => router.push(href)}
        brandTitle={SharedShell.BrandName}
        brandSubtitle={SharedShell.ManagementSubtitle}
        desktopHeader={
          <header className="flex h-16 items-center justify-between border-b border-slate-800 px-8">
            <div className="flex flex-1 items-center gap-6">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-96 border-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  placeholder={ClientsV2.Header.SearchPlaceholder}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                {ClientsV2.Actions.NewClient}
              </button>
              <div className="mx-2 h-8 w-px bg-slate-800" />
              <button
                type="button"
                className="p-2 text-slate-400 transition hover:text-white"
                aria-label={ClientsV2.Header.Notifications}
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>
        }
        desktopBody={
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-8">
              <h2 className="text-4xl font-black tracking-tight text-white">
                {ClientsV2.Content.Title}
              </h2>
              <p className="mt-1 text-slate-400">
                {ClientsV2.Content.Description}
              </p>
            </div>

            <div className="mb-8 grid grid-cols-4 gap-6">
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {ClientsV2.Stats.TotalClients}
                </p>
                <p className="mt-1 text-2xl font-bold">{totalClients}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {ClientsV2.Stats.NewThisMonth}
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-500">
                  +{newThisMonth}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {ClientsV2.Stats.ReturningRate}
                </p>
                <p className="mt-1 text-2xl font-bold">{returningRate}%</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {ClientsV2.Stats.TopTierClients}
                </p>
                <p className="mt-1 text-2xl font-bold">{topTierClients}</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50">
                      <th className="w-1/3 px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        {ClientsV2.Table.Name}
                      </th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        {ClientsV2.Table.TotalAppointments}
                      </th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                        {ClientsV2.Table.LastVisit}
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                        {ClientsV2.Table.Actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {visibleDesktopCustomers.map((customer) => {
                      const stats = customerStatsMap.get(customer.id);
                      const visits = stats?.appointmentCount ?? 0;
                      const vip = visits >= 20;

                      return (
                        <tr
                          key={customer.id}
                          className="transition-colors hover:bg-slate-800/30"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-700 text-xs font-semibold">
                                {getCustomerInitials(customer.name)}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-100">
                                  {customer.name ?? Common.Status.NoData}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {customer.email ??
                                    customer.phone ??
                                    Common.Status.NoData}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                vip
                                  ? "bg-emerald-900/30 text-emerald-400"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {visits}{" "}
                              {vip
                                ? ClientsV2.Table.VisitsVip
                                : ClientsV2.Table.Visits}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-400">
                              {formatLastVisit(stats?.lastVisit)}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {formatLastVisitDetail(
                                stats?.lastVisit,
                                stats?.barberName,
                              )}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewCustomer(customer)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                                aria-label={ClientsV2.Actions.View}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCustomer(customer)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                                aria-label={ClientsV2.Actions.Edit}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteCustomer(customer)}
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
                                aria-label={ClientsV2.Actions.Delete}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 bg-slate-800/20 px-6 py-4">
                <p className="text-xs text-slate-500">
                  {ClientsV2.Table.Showing.replace(
                    "{count}",
                    `${visibleDesktopCustomers.length}`,
                  ).replace("{total}", `${filteredCustomers.length}`)}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 transition hover:text-white"
                    disabled
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-900">
                    1
                  </span>
                  <span className="px-2 text-slate-500">...</span>
                  <span className="text-xs text-slate-500">250</span>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 transition hover:text-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        }
        mobileHeader={
          <header className="sticky top-0 z-10 border-b border-slate-800 bg-[#191919d9] backdrop-blur-md">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight">
                  {ClientsV2.Mobile.Title}
                </h1>
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={ClientsV2.Mobile.SearchPlaceholder}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/40 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>
          </header>
        }
        mobileBody={
          <main className="flex-1 overflow-y-auto px-4 pb-24">
            <div className="flex items-center justify-between py-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {ClientsV2.Mobile.RecentClients}
              </h2>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-slate-100"
              >
                {ClientsV2.Mobile.Filter}
              </button>
            </div>

            <div className="space-y-3">
              {filteredCustomers.map((customer) => {
                const stats = customerStatsMap.get(customer.id);

                return (
                  <button
                    key={`mobile-${customer.id}`}
                    type="button"
                    onClick={() => setPreviewCustomer(customer)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/20 p-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
                        {getCustomerInitials(customer.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-100">
                          {customer.name ?? Common.Status.NoData}
                        </p>
                        <div className="flex flex-col text-sm text-slate-400">
                          <span>
                            {stats?.appointmentCount ?? 0}{" "}
                            {ClientsV2.Table.Appointments}
                          </span>
                          <span>
                            {ClientsV2.Mobile.LastLabel}{" "}
                            {formatLastVisit(stats?.lastVisit)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </main>
        }
        mobileFooter={
          <>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-900 shadow-xl transition active:scale-90"
            >
              <Plus className="h-6 w-6" />
            </button>

            <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-[#191919] px-6 py-3">
              <div className="mx-auto flex max-w-md items-center justify-between">
                <button
                  type="button"
                  onClick={() => router.push(APP_ROUTES.Schedule)}
                  className="flex flex-col items-center gap-1 text-slate-400"
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="text-[10px] font-medium uppercase tracking-tighter">
                    {ClientsV2.Mobile.Schedule}
                  </span>
                </button>
                <button
                  type="button"
                  className="flex flex-col items-center gap-1 text-slate-100"
                >
                  <Users className="h-4 w-4" />
                  <span className="text-[10px] font-medium uppercase tracking-tighter">
                    {ClientsV2.Mobile.Clients}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push(APP_ROUTES.Services)}
                  className="flex flex-col items-center gap-1 text-slate-400"
                >
                  <Scissors className="h-4 w-4" />
                  <span className="text-[10px] font-medium uppercase tracking-tighter">
                    {ClientsV2.Mobile.Services}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push(APP_ROUTES.Payments)}
                  className="flex flex-col items-center gap-1 text-slate-400"
                >
                  <Clock3 className="h-4 w-4" />
                  <span className="text-[10px] font-medium uppercase tracking-tighter">
                    {ClientsV2.Sidebar.Payments}
                  </span>
                </button>
              </div>
            </nav>
          </>
        }
      />

      {canOperate ? (
        <>
          {isCreateModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-[520px] overflow-hidden rounded border border-slate-700 bg-[#1c1c1c] shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-700 p-6">
                  <h3 className="text-xl font-bold text-slate-100">
                    {ClientsV2.Modal.NewTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="text-slate-400 transition hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form className="space-y-4 p-6" onSubmit={onCreateCustomer}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelName}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <input
                    className={`h-11 w-full rounded border bg-[#121212] px-3 text-sm text-slate-100 placeholder:text-slate-500 ${
                      createCustomerErrors.name
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    value={customerName}
                    onChange={(event) => {
                      setCustomerName(event.target.value);
                      if (createCustomerErrors.name) {
                        setCreateCustomerErrors({ name: undefined });
                      }
                    }}
                    placeholder={Admin.Fields.Name}
                    required
                  />
                  {createCustomerErrors.name ? (
                    <p className="text-xs text-red-400">
                      {createCustomerErrors.name}
                    </p>
                  ) : null}
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelEmail}
                    <span className="ml-1 text-slate-500">
                      ({ClientsV2.Common.Optional})
                    </span>
                  </label>
                  <input
                    className="h-11 w-full rounded border border-slate-700 bg-[#121212] px-3 text-sm text-slate-100 placeholder:text-slate-500"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder={Admin.Fields.Email}
                  />
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelPhone}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <PhoneInput
                    value={customerPhone as Value}
                    onChange={(v) => {
                      setCustomerPhone(v ?? "");
                      if (createCustomerErrors.phone) {
                        setCreateCustomerErrors((current) => ({
                          ...current,
                          phone: undefined,
                        }));
                      }
                    }}
                    className={`flex h-11 items-center rounded border bg-[#121212] px-3 text-sm text-slate-100 ${
                      createCustomerErrors.phone
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    inputClassName="text-sm text-slate-100 placeholder:text-slate-500 bg-transparent outline-none flex-1"
                    placeholder={Admin.Fields.Phone}
                  />
                  {createCustomerErrors.phone ? (
                    <p className="text-xs text-red-400">
                      {createCustomerErrors.phone}
                    </p>
                  ) : null}
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelNotes}
                    <span className="ml-1 text-slate-500">
                      ({ClientsV2.Common.Optional})
                    </span>
                  </label>
                  <textarea
                    className="w-full rounded border border-slate-700 bg-[#121212] p-3 text-sm text-slate-100 placeholder:text-slate-500"
                    value={customerNotes}
                    onChange={(event) => setCustomerNotes(event.target.value)}
                    placeholder={Admin.Fields.Notes}
                    rows={3}
                  />
                  <div className="flex items-center justify-end gap-3 border-t border-slate-700 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateModalOpen(false);
                        setCreateCustomerErrors({});
                      }}
                      className="px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                    >
                      {ClientsV2.Actions.Back}
                    </button>
                    <LoadingButton
                      type="submit"
                      isLoading={createCustomerState.isLoading}
                      loadingText={Admin.Actions.Creating}
                    >
                      {Admin.Actions.CreateCustomer}
                    </LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {editingCustomer ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-[520px] overflow-hidden rounded border border-slate-700 bg-[#1c1c1c] shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-700 p-6">
                  <h3 className="text-xl font-bold text-slate-100">
                    {ClientsV2.Modal.EditTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingCustomer(null)}
                    className="text-slate-400 transition hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form className="space-y-4 p-6" onSubmit={onUpdateCustomer}>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelName}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <input
                    className={`h-11 w-full rounded border bg-[#121212] px-3 text-sm text-slate-100 ${
                      editCustomerErrors.name
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    value={editingCustomer.name ?? ""}
                    onChange={(event) => {
                      setEditingCustomer({
                        ...editingCustomer,
                        name: event.target.value,
                      });
                      if (editCustomerErrors.name) {
                        setEditCustomerErrors({ name: undefined });
                      }
                    }}
                    placeholder={Admin.Fields.Name}
                    required
                  />
                  {editCustomerErrors.name ? (
                    <p className="text-xs text-red-400">
                      {editCustomerErrors.name}
                    </p>
                  ) : null}
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelEmail}
                    <span className="ml-1 text-slate-500">
                      ({ClientsV2.Common.Optional})
                    </span>
                  </label>
                  <input
                    className="h-11 w-full rounded border border-slate-700 bg-[#121212] px-3 text-sm text-slate-100"
                    value={editingCustomer.email ?? ""}
                    onChange={(event) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        email: event.target.value,
                      })
                    }
                    placeholder={Admin.Fields.Email}
                  />
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelPhone}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <PhoneInput
                    value={(editingCustomer.phone ?? "") as Value}
                    onChange={(v) => {
                      setEditingCustomer({
                        ...editingCustomer,
                        phone: v ?? "",
                      });
                      if (editCustomerErrors.phone) {
                        setEditCustomerErrors((current) => ({
                          ...current,
                          phone: undefined,
                        }));
                      }
                    }}
                    className={`flex h-11 items-center rounded border bg-[#121212] px-3 text-sm text-slate-100 ${
                      editCustomerErrors.phone
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    inputClassName="text-sm text-slate-100 bg-transparent outline-none flex-1"
                    placeholder={Admin.Fields.Phone}
                  />
                  {editCustomerErrors.phone ? (
                    <p className="text-xs text-red-400">
                      {editCustomerErrors.phone}
                    </p>
                  ) : null}
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {ClientsV2.Modal.LabelNotes}
                    <span className="ml-1 text-slate-500">
                      ({ClientsV2.Common.Optional})
                    </span>
                  </label>
                  <textarea
                    className="w-full rounded border border-slate-700 bg-[#121212] p-3 text-sm text-slate-100"
                    value={editingCustomer.notes ?? ""}
                    onChange={(event) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        notes: event.target.value,
                      })
                    }
                    placeholder={Admin.Fields.Notes}
                    rows={3}
                  />
                  <div className="flex items-center justify-end gap-3 border-t border-slate-700 pt-4">
                    <button
                      type="button"
                      onClick={() => requestDeleteCustomer(editingCustomer)}
                      className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
                    >
                      {ClientsV2.Actions.Delete}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCustomer(null);
                        setEditCustomerErrors({});
                      }}
                      className="px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                    >
                      {ClientsV2.Actions.Back}
                    </button>
                    <LoadingButton
                      type="submit"
                      isLoading={updateCustomerState.isLoading}
                      loadingText={Admin.Actions.Saving}
                    >
                      {Admin.Actions.Save}
                    </LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {previewCustomer ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-[420px] rounded border border-slate-700 bg-[#1c1c1c] p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-slate-100">
                  {ClientsV2.Modal.ViewTitle}
                </h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {ClientsV2.Modal.LabelName}
                    </p>
                    <p className="mt-1 text-slate-100">
                      {previewCustomer.name ?? Common.Status.NoData}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {ClientsV2.Modal.LabelEmail}
                    </p>
                    <p className="mt-1 text-slate-300">
                      {previewCustomer.email ?? Common.Status.NoData}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {ClientsV2.Modal.LabelPhone}
                    </p>
                    <p className="mt-1 text-slate-300">
                      {previewCustomer.phone ?? Common.Status.NoData}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {ClientsV2.Modal.LabelNotes}
                    </p>
                    <p className="mt-1 text-slate-300">
                      {previewCustomer.notes || Common.Status.NoData}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => requestDeleteCustomer(previewCustomer)}
                    className="rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
                  >
                    {ClientsV2.Actions.Delete}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewCustomer(null)}
                    className="rounded bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
                  >
                    {ClientsV2.Actions.Close}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {deleteCandidateCustomer ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-[460px] rounded border border-slate-700 bg-[#171717] p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-slate-100">
                  {ClientsV2.Modal.DeleteConfirmTitle}
                </h3>
                <p className="mt-3 text-sm text-slate-300">
                  {ClientsV2.Modal.DeleteConfirmMessagePrefix} &quot;
                  {deleteCandidateCustomer.name ?? Common.Status.NoData}
                  &quot;?
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteCandidateCustomer(null)}
                    className="px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                  >
                    {ClientsV2.Modal.DeleteConfirmCancel}
                  </button>
                  <LoadingButton
                    type="button"
                    onClick={confirmDeleteCustomer}
                    isLoading={deleteCustomerState.isLoading}
                    loadingText={Admin.Actions.Deleting}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {ClientsV2.Modal.DeleteConfirmAccept}
                  </LoadingButton>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
