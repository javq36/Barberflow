"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Scissors,
  Search,
  Star,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  BarberItem,
  useCreateBarberMutation,
  useDeleteBarberMutation,
  useGetBarbersQuery,
  useUpdateBarberMutation,
} from "@/lib/api/owner-admin-api";
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";
import { useRouter } from "next/navigation";

type BarbersSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

type BarberFormErrors = {
  name?: string;
  email?: string;
  phone?: string;
};

const COLOMBIA_PHONE_LENGTH = 10;

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function BarbersSection({ canOperate, role }: BarbersSectionProps) {
  const router = useRouter();
  const { Common, BarbersV2, SharedShell } = Texts;
  const { showToast } = useAppToast();

  const barbersQuery = useGetBarbersQuery(undefined, { skip: !canOperate });
  const [createBarber, createBarberState] = useCreateBarberMutation();
  const [updateBarber, updateBarberState] = useUpdateBarberMutation();
  const [deleteBarber, deleteBarberState] = useDeleteBarberMutation();

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormErrors, setCreateFormErrors] = useState<BarberFormErrors>(
    {},
  );
  const [editFormErrors, setEditFormErrors] = useState<BarberFormErrors>({});
  const [deleteCandidateBarber, setDeleteCandidateBarber] =
    useState<BarberItem | null>(null);

  const [barberName, setBarberName] = useState("");
  const [barberEmail, setBarberEmail] = useState("");
  const [barberPhone, setBarberPhone] = useState("");
  const [editingBarber, setEditingBarber] = useState<BarberItem | null>(null);

  const barbers = useMemo(() => barbersQuery.data ?? [], [barbersQuery.data]);

  const filteredBarbers = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    if (!normalized) {
      return barbers;
    }

    return barbers.filter((barber) => {
      const name = barber.name.toLowerCase();
      const email = (barber.email ?? "").toLowerCase();
      const phone = (barber.phone ?? "").toLowerCase();
      return (
        name.includes(normalized) ||
        email.includes(normalized) ||
        phone.includes(normalized)
      );
    });
  }, [barbers, searchTerm]);

  const totalBarbers = barbers.length;
  const activeBarbers = useMemo(
    () => barbers.filter((barber) => barber.isActive),
    [barbers],
  );

  const awayBarbers = totalBarbers - activeBarbers.length;

  const newThisMonth = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return barbers.filter((barber) => {
      const date = new Date(barber.createdAt);
      return date.getMonth() === month && date.getFullYear() === year;
    }).length;
  }, [barbers]);

  const performanceMap = useMemo(() => {
    const map = new Map<
      string,
      {
        rating: number;
        efficiency: number;
        role: string;
        specialties: string;
      }
    >();

    const roles = BarbersV2.Roles;
    const specialties = BarbersV2.Specialties;

    filteredBarbers.forEach((barber, index) => {
      let seed = 0;
      for (const char of barber.id) {
        seed += char.charCodeAt(0);
      }

      const rating = Number((4.2 + ((seed + index) % 9) / 10).toFixed(1));
      const efficiency = 72 + ((seed + index * 7) % 27);

      map.set(barber.id, {
        rating,
        efficiency,
        role: roles[(seed + index) % roles.length],
        specialties: specialties[(seed + index) % specialties.length],
      });
    });

    return map;
  }, [BarbersV2.Roles, BarbersV2.Specialties, filteredBarbers]);

  const averageRating = useMemo(() => {
    if (!filteredBarbers.length) {
      return 0;
    }

    const total = filteredBarbers.reduce((sum, barber) => {
      return sum + (performanceMap.get(barber.id)?.rating ?? 0);
    }, 0);

    return Number((total / filteredBarbers.length).toFixed(2));
  }, [filteredBarbers, performanceMap]);

  const topPerformer = useMemo(() => {
    if (!filteredBarbers.length) {
      return null;
    }

    return filteredBarbers.reduce((currentBest, barber) => {
      const currentRating = performanceMap.get(currentBest.id)?.rating ?? 0;
      const contenderRating = performanceMap.get(barber.id)?.rating ?? 0;
      return contenderRating > currentRating ? barber : currentBest;
    }, filteredBarbers[0]);
  }, [filteredBarbers, performanceMap]);

  function getInitials(name: string) {
    const parts = name.trim().split(" ").filter(Boolean);
    return `${parts[0]?.[0] ?? "B"}${parts[1]?.[0] ?? "F"}`.toUpperCase();
  }

  function formatToastMessage(
    template: string,
    values: Record<string, string>,
  ) {
    let output = template;
    for (const [key, value] of Object.entries(values)) {
      output = output.replaceAll(`{${key}}`, value);
    }
    return output;
  }

  function getEfficiencyWidthClass(value: number) {
    if (value >= 95) return "w-[95%]";
    if (value >= 90) return "w-[90%]";
    if (value >= 85) return "w-[85%]";
    if (value >= 80) return "w-[80%]";
    if (value >= 75) return "w-[75%]";
    return "w-[70%]";
  }

  function validateBarber(
    name: string,
    email: string,
    phone: string,
  ): BarberFormErrors {
    const errors: BarberFormErrors = {};

    if (!name.trim()) {
      errors.name = BarbersV2.Messages.NameRequired;
    }

    const normalizedEmail = email.trim();
    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      errors.email = BarbersV2.Messages.EmailInvalid;
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      errors.phone = BarbersV2.Messages.PhoneRequired;
    } else if (normalizedPhone.length !== COLOMBIA_PHONE_LENGTH) {
      errors.phone = BarbersV2.Messages.PhoneInvalid;
    }

    return errors;
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateFormErrors({});
    setBarberName("");
    setBarberEmail("");
    setBarberPhone("");
  }

  function closeEditModal() {
    setEditingBarber(null);
    setEditFormErrors({});
  }

  async function onCreateBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const normalizedName = barberName.trim();
      const normalizedEmail = barberEmail.trim().toLowerCase();
      const normalizedPhone = normalizePhone(barberPhone);
      const validationErrors = validateBarber(
        normalizedName,
        normalizedEmail,
        normalizedPhone,
      );

      if (
        validationErrors.name ||
        validationErrors.email ||
        validationErrors.phone
      ) {
        setCreateFormErrors(validationErrors);
        showToast({
          title: Common.Toasts.ErrorTitle,
          description:
            validationErrors.name ??
            validationErrors.email ??
            validationErrors.phone ??
            Common.Status.Error,
          variant: "error",
        });
        return;
      }

      setCreateFormErrors({});

      await createBarber({
        name: normalizedName,
        email: normalizedEmail || undefined,
        phone: normalizedPhone,
        isActive: true,
      }).unwrap();

      closeCreateModal();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: formatToastMessage(BarbersV2.Toasts.Created, {
          name: normalizedName,
        }),
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
      const normalizedName = editingBarber.name.trim();
      const normalizedEmail = (editingBarber.email ?? "").trim().toLowerCase();
      const normalizedPhone = normalizePhone(editingBarber.phone ?? "");
      const validationErrors = validateBarber(
        normalizedName,
        normalizedEmail,
        normalizedPhone,
      );

      if (
        validationErrors.name ||
        validationErrors.email ||
        validationErrors.phone
      ) {
        setEditFormErrors(validationErrors);
        showToast({
          title: Common.Toasts.ErrorTitle,
          description:
            validationErrors.name ??
            validationErrors.email ??
            validationErrors.phone ??
            Common.Status.Error,
          variant: "error",
        });
        return;
      }

      setEditFormErrors({});

      await updateBarber({
        id: editingBarber.id,
        name: normalizedName,
        email: normalizedEmail || undefined,
        phone: normalizedPhone,
        isActive: editingBarber.isActive,
      }).unwrap();

      closeEditModal();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: formatToastMessage(BarbersV2.Toasts.Updated, {
          name: normalizedName,
        }),
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
          phone: normalizePhone(barber.phone ?? "") || undefined,
          isActive: true,
        }).unwrap();
      }

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: barber.isActive
          ? formatToastMessage(BarbersV2.Toasts.Deactivated, {
              name: barber.name,
            })
          : formatToastMessage(BarbersV2.Toasts.Activated, {
              name: barber.name,
            }),
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

  function requestToggleBarberActive(barber: BarberItem) {
    setDeleteCandidateBarber(barber);
  }

  return (
    <>
      <RoleWorkspaceShell
        canOperate={canOperate}
        disabledMessage={BarbersV2.DisabledMessage}
        role={role}
        activeItemId="barbers"
        onNavigate={(href) => router.push(href)}
        brandTitle={SharedShell.BrandName}
        brandSubtitle={BarbersV2.Sidebar.PlanName}
        desktopHeader={
          <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-[#191919] px-8">
            <div className="max-w-xl flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={BarbersV2.Header.SearchPlaceholder}
                  className="w-full rounded-lg border-none bg-slate-800/40 py-2 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="relative rounded-lg p-2 text-slate-400 transition hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
              </button>
              <div className="h-6 w-px bg-slate-800" />
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-[#262626] px-4 py-2 text-sm font-bold text-white"
              >
                <UserPlus className="h-4 w-4" />
                {BarbersV2.Actions.InviteNewBarber}
              </button>
            </div>
          </header>
        }
        desktopBody={
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <h2 className="mb-2 text-3xl font-black">
                  {BarbersV2.Content.Title}
                </h2>
                <p className="text-slate-400">
                  {BarbersV2.Content.Description}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-2 text-sm font-semibold"
                >
                  {BarbersV2.Actions.ExportReport}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900"
                >
                  {BarbersV2.Actions.InviteNewBarber}
                </button>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {BarbersV2.Stats.TotalBarbers}
                </p>
                <p className="text-3xl font-black">{totalBarbers}</p>
                <p className="mt-2 text-xs font-bold text-emerald-400">
                  +{newThisMonth} {BarbersV2.Stats.ThisMonth}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {BarbersV2.Stats.ActiveNow}
                </p>
                <p className="text-3xl font-black">{activeBarbers.length}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {awayBarbers} {BarbersV2.Stats.AwayLabel}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {BarbersV2.Stats.AvgRating}
                </p>
                <p className="text-3xl font-black">{averageRating}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {BarbersV2.Stats.MonthlyRevenue}
                </p>
                <p className="text-3xl font-black">
                  {BarbersV2.Stats.DemoRevenue}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-800/10">
              <div className="flex items-center justify-between border-b border-slate-800 px-6">
                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    className="border-b-2 border-slate-100 py-4 text-sm font-bold"
                  >
                    {BarbersV2.Table.AllBarbers}
                  </button>
                  <button type="button" className="py-4 text-sm text-slate-400">
                    {formatToastMessage(BarbersV2.Table.PendingInvites, {
                      count: "0",
                    })}
                  </button>
                  <button type="button" className="py-4 text-sm text-slate-400">
                    {BarbersV2.Table.AwayLeave}
                  </button>
                </div>
                <button type="button" className="text-slate-400">
                  <Filter className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-800/30 text-xs font-black uppercase tracking-widest text-slate-500">
                      <th className="px-6 py-4">{BarbersV2.Table.Barber}</th>
                      <th className="px-6 py-4">{BarbersV2.Table.Role}</th>
                      <th className="px-6 py-4">{BarbersV2.Table.Status}</th>
                      <th className="px-6 py-4 text-center">
                        {BarbersV2.Table.Efficiency}
                      </th>
                      <th className="px-6 py-4 text-center">
                        {BarbersV2.Table.Rating}
                      </th>
                      <th className="px-6 py-4 text-right">
                        {BarbersV2.Table.Actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredBarbers.map((barber) => {
                      const performance = performanceMap.get(barber.id);
                      const statusTone = barber.isActive
                        ? "bg-emerald-500"
                        : "bg-amber-500";
                      const statusLabel = barber.isActive
                        ? BarbersV2.Status.ActiveNow
                        : BarbersV2.Status.Away;

                      return (
                        <tr
                          key={barber.id}
                          className="transition-colors hover:bg-slate-800/20"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700 text-xs font-black">
                                {getInitials(barber.name)}
                              </div>
                              <div>
                                <p className="text-sm font-bold">
                                  {barber.name}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {barber.email ?? Common.Status.NoData}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="rounded bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase text-slate-300">
                              {performance?.role ?? BarbersV2.Roles[0]}
                            </span>
                            <p className="mt-1 text-xs text-slate-400">
                              {performance?.specialties ??
                                BarbersV2.Specialties[0]}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${statusTone}`}
                              />
                              <span className="text-xs font-medium">
                                {statusLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="mx-auto flex w-24 flex-col gap-1">
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className={`h-full bg-emerald-500 ${getEfficiencyWidthClass(
                                    performance?.efficiency ?? 80,
                                  )}`}
                                />
                              </div>
                              <span className="text-center text-[10px] font-bold text-slate-500">
                                {performance?.efficiency ?? 80}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex items-center gap-1">
                              <span className="text-sm font-bold">
                                {performance?.rating ?? 4.7}
                              </span>
                              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingBarber(barber)}
                                className="rounded-lg bg-slate-800/60 p-2 text-slate-300 transition hover:bg-slate-700"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  requestToggleBarberActive(barber)
                                }
                                className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-700"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-800/10 p-6 lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold">
                    {BarbersV2.Content.QuickInviteTitle}
                  </h3>
                  <span className="text-xs text-slate-400">
                    {BarbersV2.Content.QuickInviteHint}
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  {BarbersV2.Content.QuickInviteDescription}
                </p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="rounded-lg bg-slate-100 px-5 py-2 text-sm font-bold text-slate-900"
                  >
                    {BarbersV2.Actions.OpenInviteForm}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-yellow-400" />
                  <h3 className="text-lg font-bold">
                    {BarbersV2.Content.TopPerformer}
                  </h3>
                </div>
                {topPerformer ? (
                  <>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-yellow-500/40 bg-slate-700 text-xs font-black">
                        {getInitials(topPerformer.name)}
                      </div>
                      <div>
                        <p className="font-bold">{topPerformer.name}</p>
                        <p className="text-xs text-slate-400">
                          {performanceMap.get(topPerformer.id)?.role}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          {BarbersV2.Content.TopMetricOne}
                        </span>
                        <span className="font-bold">
                          {performanceMap.get(topPerformer.id)?.efficiency}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          {BarbersV2.Content.TopMetricTwo}
                        </span>
                        <span className="font-bold">
                          {performanceMap.get(topPerformer.id)?.rating}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">
                    {BarbersV2.Empty.NoBarbers}
                  </p>
                )}
              </div>
            </div>
          </div>
        }
        desktopSidebarFooter={
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {BarbersV2.Sidebar.CurrentPlan}
            </p>
            <p className="mb-3 text-sm font-bold">
              {BarbersV2.Sidebar.PlanName}
            </p>
            <button
              type="button"
              className="w-full rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-900"
            >
              {BarbersV2.Sidebar.UpgradePlan}
            </button>
          </div>
        }
        mobileHeader={
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-[#191919]/90 p-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push(APP_ROUTES.Dashboard)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800"
              >
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
              <h1 className="text-xl font-bold">{BarbersV2.Mobile.Title}</h1>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-900"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </header>
        }
        mobileBody={
          <main className="flex-1 overflow-y-auto pb-24">
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={BarbersV2.Mobile.SearchPlaceholder}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/40 py-2 pl-10 pr-4 text-sm"
                />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-700 bg-slate-800/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {BarbersV2.Stats.TotalBarbers}
                  </p>
                  <p className="text-2xl font-black">{totalBarbers}</p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-800/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {BarbersV2.Stats.ActiveNow}
                  </p>
                  <p className="text-2xl font-black text-emerald-400">
                    {activeBarbers.length}
                  </p>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  {BarbersV2.Mobile.DirectoryTitle}
                </h2>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-slate-400"
                >
                  {BarbersV2.Mobile.Filter}
                  <Filter className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                {filteredBarbers.map((barber) => {
                  const statusClass = barber.isActive
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400";
                  const statusLabel = barber.isActive
                    ? BarbersV2.Status.Active
                    : BarbersV2.Status.Away;

                  return (
                    <article
                      key={`mobile-${barber.id}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/20 px-3 py-3"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-xs font-black">
                        {getInitials(barber.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold">
                            {barber.name}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <p className="truncate text-xs text-slate-400">
                          {performanceMap.get(barber.id)?.role}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingBarber(barber)}
                        className="rounded-lg p-2 text-slate-400"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
                <h3 className="text-base font-bold">
                  {BarbersV2.Mobile.InviteTitle}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {BarbersV2.Mobile.InviteDescription}
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-4 w-full rounded-lg bg-slate-100 py-2 text-sm font-bold text-slate-900"
                >
                  {BarbersV2.Mobile.InviteAction}
                </button>
              </div>
            </div>
          </main>
        }
        mobileFooter={
          <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-slate-800 bg-[#191919] px-3 pb-5 pt-2">
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Dashboard)}
              className="flex flex-1 flex-col items-center gap-1 text-slate-500"
            >
              <CalendarDays className="h-5 w-5" />
              <span className="text-[10px]">{BarbersV2.Mobile.Home}</span>
            </button>
            <button
              type="button"
              className="flex flex-1 flex-col items-center gap-1 text-slate-100"
            >
              <Users className="h-5 w-5" />
              <span className="text-[10px] font-bold">
                {BarbersV2.Mobile.Staff}
              </span>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Services)}
              className="flex flex-1 flex-col items-center gap-1 text-slate-500"
            >
              <Scissors className="h-5 w-5" />
              <span className="text-[10px]">{BarbersV2.Mobile.Services}</span>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Schedule)}
              className="flex flex-1 flex-col items-center gap-1 text-slate-500"
            >
              <CalendarDays className="h-5 w-5" />
              <span className="text-[10px]">{BarbersV2.Mobile.Schedule}</span>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Payments)}
              className="flex flex-1 flex-col items-center gap-1 text-slate-500"
            >
              <Clock3 className="h-5 w-5" />
              <span className="text-[10px]">{BarbersV2.Sidebar.Payments}</span>
            </button>
          </nav>
        }
      />

      {canOperate ? (
        <>
          {isCreateModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#1c1c1c] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold">
                    {BarbersV2.Modal.NewTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded p-1 text-slate-400 hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form className="space-y-4" onSubmit={onCreateBarber}>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      {BarbersV2.Modal.LabelName} *
                    </label>
                    <input
                      value={barberName}
                      onChange={(event) => setBarberName(event.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
                        createFormErrors.name
                          ? "border-red-500 bg-red-950/20"
                          : "border-slate-700 bg-slate-800/50"
                      }`}
                      placeholder={BarbersV2.Modal.PlaceholderName}
                    />
                    {createFormErrors.name ? (
                      <p className="mt-1 text-xs text-red-400">
                        {createFormErrors.name}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      {BarbersV2.Modal.LabelPhone} *
                    </label>
                    <input
                      value={barberPhone}
                      onChange={(event) => setBarberPhone(event.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
                        createFormErrors.phone
                          ? "border-red-500 bg-red-950/20"
                          : "border-slate-700 bg-slate-800/50"
                      }`}
                      placeholder={BarbersV2.Modal.PlaceholderPhone}
                    />
                    {createFormErrors.phone ? (
                      <p className="mt-1 text-xs text-red-400">
                        {createFormErrors.phone}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        {BarbersV2.Modal.PhoneHint}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      {BarbersV2.Modal.LabelEmail} ({BarbersV2.Common.Optional})
                    </label>
                    <input
                      value={barberEmail}
                      onChange={(event) => setBarberEmail(event.target.value)}
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
                        createFormErrors.email
                          ? "border-red-500 bg-red-950/20"
                          : "border-slate-700 bg-slate-800/50"
                      }`}
                      placeholder={BarbersV2.Modal.PlaceholderEmail}
                    />
                    {createFormErrors.email ? (
                      <p className="mt-1 text-xs text-red-400">
                        {createFormErrors.email}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300"
                    >
                      {BarbersV2.Actions.Cancel}
                    </button>
                    <LoadingButton
                      type="submit"
                      isLoading={createBarberState.isLoading}
                      loadingText={BarbersV2.Actions.Creating}
                      className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900"
                    >
                      {BarbersV2.Actions.CreateBarber}
                    </LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {editingBarber ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#1c1c1c] p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold">
                    {BarbersV2.Modal.EditTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="rounded p-1 text-slate-400 hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form className="space-y-4" onSubmit={onUpdateBarber}>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      {BarbersV2.Modal.LabelName} *
                    </label>
                    <input
                      value={editingBarber.name}
                      onChange={(event) =>
                        setEditingBarber({
                          ...editingBarber,
                          name: event.target.value,
                        })
                      }
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
                        editFormErrors.name
                          ? "border-red-500 bg-red-950/20"
                          : "border-slate-700 bg-slate-800/50"
                      }`}
                      placeholder={BarbersV2.Modal.PlaceholderName}
                    />
                    {editFormErrors.name ? (
                      <p className="mt-1 text-xs text-red-400">
                        {editFormErrors.name}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      {BarbersV2.Modal.LabelPhone} *
                    </label>
                    <input
                      value={editingBarber.phone ?? ""}
                      onChange={(event) =>
                        setEditingBarber({
                          ...editingBarber,
                          phone: event.target.value,
                        })
                      }
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
                        editFormErrors.phone
                          ? "border-red-500 bg-red-950/20"
                          : "border-slate-700 bg-slate-800/50"
                      }`}
                      placeholder={BarbersV2.Modal.PlaceholderPhone}
                    />
                    {editFormErrors.phone ? (
                      <p className="mt-1 text-xs text-red-400">
                        {editFormErrors.phone}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        {BarbersV2.Modal.PhoneHint}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold">
                      {BarbersV2.Modal.LabelEmail} ({BarbersV2.Common.Optional})
                    </label>
                    <input
                      value={editingBarber.email ?? ""}
                      onChange={(event) =>
                        setEditingBarber({
                          ...editingBarber,
                          email: event.target.value,
                        })
                      }
                      className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
                        editFormErrors.email
                          ? "border-red-500 bg-red-950/20"
                          : "border-slate-700 bg-slate-800/50"
                      }`}
                      placeholder={BarbersV2.Modal.PlaceholderEmail}
                    />
                    {editFormErrors.email ? (
                      <p className="mt-1 text-xs text-red-400">
                        {editFormErrors.email}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => requestToggleBarberActive(editingBarber)}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300"
                    >
                      {editingBarber.isActive
                        ? BarbersV2.Actions.Deactivate
                        : BarbersV2.Actions.Activate}
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={closeEditModal}
                        className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300"
                      >
                        {BarbersV2.Actions.Cancel}
                      </button>
                      <LoadingButton
                        type="submit"
                        isLoading={updateBarberState.isLoading}
                        loadingText={BarbersV2.Actions.Saving}
                        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900"
                      >
                        {BarbersV2.Actions.Save}
                      </LoadingButton>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {deleteCandidateBarber ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#1c1c1c] p-6">
                <h3 className="text-lg font-bold">
                  {BarbersV2.Modal.ConfirmTitle}
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  {BarbersV2.Modal.ConfirmMessagePrefix}{" "}
                  {deleteCandidateBarber.name}?
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteCandidateBarber(null)}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300"
                  >
                    {BarbersV2.Actions.Cancel}
                  </button>
                  <LoadingButton
                    type="button"
                    onClick={async () => {
                      const candidate = deleteCandidateBarber;
                      setDeleteCandidateBarber(null);
                      if (!candidate) {
                        return;
                      }
                      await onToggleBarberActive(candidate);
                      if (editingBarber?.id === candidate.id) {
                        closeEditModal();
                      }
                    }}
                    isLoading={
                      deleteBarberState.isLoading || updateBarberState.isLoading
                    }
                    loadingText={BarbersV2.Actions.Updating}
                    className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900"
                  >
                    {BarbersV2.Actions.Confirm}
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
