"use client";

import { Dispatch, FormEvent, SetStateAction, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Scissors,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import {
  ServiceItem,
  useCreateServiceMutation,
  useGetServicesQuery,
  useUpdateServiceMutation,
} from "@/lib/api/owner-admin-api";
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";
import { useRouter } from "next/navigation";

type ServicesSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

type ServiceFormErrors = {
  name?: string;
  price?: string;
};

export function ServicesSection({ canOperate, role }: ServicesSectionProps) {
  const router = useRouter();
  const { Admin, Common, ServicesV2, SharedShell } = Texts;
  const { showToast } = useAppToast();

  const servicesQuery = useGetServicesQuery(undefined, { skip: !canOperate });
  const [createService, createServiceState] = useCreateServiceMutation();
  const [updateService, updateServiceState] = useUpdateServiceMutation();

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceDuration, setServiceDuration] = useState("");
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreviewUrl, setCreateImagePreviewUrl] = useState<
    string | undefined
  >(undefined);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState<
    string | undefined
  >(undefined);
  const [createServiceErrors, setCreateServiceErrors] =
    useState<ServiceFormErrors>({});
  const [editServiceErrors, setEditServiceErrors] = useState<ServiceFormErrors>(
    {},
  );
  const [editingService, setEditingService] = useState<ServiceItem | null>(
    null,
  );
  const [deleteCandidateService, setDeleteCandidateService] =
    useState<ServiceItem | null>(null);

  const services = useMemo(
    () => servicesQuery.data ?? [],
    [servicesQuery.data],
  );

  const filteredServices = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    if (!normalized) {
      return services;
    }

    return services.filter((service) =>
      service.name.toLowerCase().includes(normalized),
    );
  }, [services, searchTerm]);

  const activeServices = useMemo(
    () => filteredServices.filter((service) => service.active),
    [filteredServices],
  );

  const averagePrice = useMemo(() => {
    if (!activeServices.length) {
      return 0;
    }

    const total = activeServices.reduce(
      (sum, service) => sum + service.price,
      0,
    );
    return total / activeServices.length;
  }, [activeServices]);

  const popularCategory = useMemo(() => {
    const categoryCount = new Map<string, number>();

    for (const service of activeServices) {
      const name = service.name.toLowerCase();
      let category = ServicesV2.Categories.General;
      if (name.includes("fade")) category = ServicesV2.Categories.Fades;
      else if (name.includes("beard")) category = ServicesV2.Categories.Beard;
      else if (name.includes("shave")) category = ServicesV2.Categories.Shave;
      else if (name.includes("kid")) category = ServicesV2.Categories.Kids;
      else if (name.includes("style")) category = ServicesV2.Categories.Styling;

      categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);
    }

    return (
      Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      ServicesV2.Categories.General
    );
  }, [activeServices, ServicesV2.Categories]);

  const featuredServices = filteredServices.slice(0, 4);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function normalizeDurationMinutes(value: string | number, fallback = 30) {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) && numeric > 0
      ? Math.trunc(numeric)
      : fallback;
  }

  function formatToastMessage(
    template: string,
    values: Record<string, string | number>,
  ) {
    let output = template;

    for (const [key, value] of Object.entries(values)) {
      output = output.replaceAll(`{${key}}`, String(value));
    }

    return output;
  }

  function validateNameAndPrice(
    name: string,
    priceValue: string | number,
  ): ServiceFormErrors {
    const errors: ServiceFormErrors = {};

    if (!name.trim()) {
      errors.name = ServicesV2.Messages.NameRequired;
    }

    if (String(priceValue).trim().length === 0) {
      errors.price = ServicesV2.Messages.PriceRequired;
    }

    const normalizedPrice = Number(priceValue);
    if (
      String(priceValue).trim().length > 0 &&
      (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)
    ) {
      errors.price = ServicesV2.Messages.PriceInvalid;
    }

    return errors;
  }

  function revokePreviewUrl(value?: string) {
    if (value?.startsWith("blob:")) {
      URL.revokeObjectURL(value);
    }
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateImageFile(null);
    setCreateImagePreviewUrl((current) => {
      revokePreviewUrl(current);
      return undefined;
    });
    setCreateServiceErrors({});
  }

  function closeEditModal() {
    setEditingService(null);
    setEditImageFile(null);
    setEditImagePreviewUrl((current) => {
      revokePreviewUrl(current);
      return undefined;
    });
    setEditServiceErrors({});
  }

  async function uploadServiceImage(file: File) {
    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch("/api/storage/services-image", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      url?: string;
    } | null;

    if (!response.ok || !payload?.url) {
      throw new Error(payload?.message ?? ServicesV2.Messages.ImageUploadError);
    }

    return payload.url;
  }

  function onSelectServiceImage(
    file: File | undefined,
    setImageFile: (value: File | null) => void,
    setPreviewUrl: Dispatch<SetStateAction<string | undefined>>,
  ) {
    if (!file) {
      return;
    }

    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: ServicesV2.Messages.ImageMustBeImage,
        variant: "error",
      });
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: ServicesV2.Messages.ImageTooLarge,
        variant: "error",
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImageFile(file);
    setPreviewUrl((current) => {
      revokePreviewUrl(current);
      return previewUrl;
    });
  }

  async function onCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const durationMinutes = normalizeDurationMinutes(serviceDuration, 30);
      const normalizedName = serviceName.trim();
      const normalizedPrice = Number(servicePrice);
      const validationErrors = validateNameAndPrice(
        normalizedName,
        servicePrice,
      );

      if (validationErrors.name || validationErrors.price) {
        setCreateServiceErrors(validationErrors);
        showToast({
          title: Common.Toasts.ErrorTitle,
          description:
            validationErrors.name ??
            validationErrors.price ??
            Common.Status.Error,
          variant: "error",
        });
        return;
      }

      setCreateServiceErrors({});

      let imageUrl: string | undefined;
      if (createImageFile) {
        imageUrl = await uploadServiceImage(createImageFile);
      }

      await createService({
        name: normalizedName,
        durationMinutes,
        price: normalizedPrice,
        active: true,
        imageUrl,
      }).unwrap();

      setServiceName("");
      setServicePrice("");
      setServiceDuration("");
      closeCreateModal();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: formatToastMessage(ServicesV2.Toasts.Created, {
          name: normalizedName,
          duration: durationMinutes,
          price: formatCurrency(normalizedPrice),
        }),
        variant: "success",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : (getApiErrorMessage(error) ?? Common.Status.Error);

      showToast({
        title: Common.Toasts.ErrorTitle,
        description: errorMessage,
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
      const durationMinutes = normalizeDurationMinutes(
        editingService.durationMinutes,
        30,
      );
      const normalizedName = editingService.name.trim();
      const normalizedPrice = Number(editingService.price);
      const validationErrors = validateNameAndPrice(
        normalizedName,
        editingService.price,
      );

      if (validationErrors.name || validationErrors.price) {
        setEditServiceErrors(validationErrors);
        showToast({
          title: Common.Toasts.ErrorTitle,
          description:
            validationErrors.name ??
            validationErrors.price ??
            Common.Status.Error,
          variant: "error",
        });
        return;
      }

      setEditServiceErrors({});

      let imageUrl = editingService.imageUrl;
      if (editImageFile) {
        imageUrl = await uploadServiceImage(editImageFile);
      }

      await updateService({
        id: editingService.id,
        name: normalizedName,
        durationMinutes,
        price: normalizedPrice,
        active: editingService.active,
        imageUrl,
      }).unwrap();

      closeEditModal();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: formatToastMessage(ServicesV2.Toasts.Updated, {
          name: normalizedName,
          duration: durationMinutes,
          price: formatCurrency(normalizedPrice),
        }),
        variant: "success",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : (getApiErrorMessage(error) ?? Common.Status.Error);

      showToast({
        title: Common.Toasts.ErrorTitle,
        description: errorMessage,
        variant: "error",
      });
    }
  }

  function requestToggleServiceActive(service: ServiceItem) {
    setDeleteCandidateService(service);
  }

  async function onToggleServiceActive(service: ServiceItem) {
    try {
      await updateService({
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
        active: !service.active,
        imageUrl: service.imageUrl,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: service.active
          ? formatToastMessage(ServicesV2.Toasts.Deactivated, {
              name: service.name,
            })
          : formatToastMessage(ServicesV2.Toasts.Restored, {
              name: service.name,
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

  return (
    <>
      <RoleWorkspaceShell
        canOperate={canOperate}
        disabledMessage={ServicesV2.DisabledMessage}
        role={role}
        activeItemId="services"
        onNavigate={(href) => router.push(href)}
        brandTitle={SharedShell.BrandName}
        brandSubtitle={ServicesV2.Sidebar.AdminPanel}
        desktopHeader={
          <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-[#191919]/50 px-8 backdrop-blur-md">
            <div className="max-w-xl flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={ServicesV2.Header.SearchPlaceholder}
                  className="w-full rounded-lg border-none bg-slate-800/40 py-2 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800">
                <Bell className="h-4 w-4" />
              </button>
              <div className="h-6 w-px bg-slate-800" />
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-[#262626] px-4 py-2 text-sm font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                {ServicesV2.Actions.AddNewService}
              </button>
            </div>
          </header>
        }
        desktopBody={
          <div className="flex-1 overflow-y-auto p-8">
            <div className="mb-8">
              <h2 className="mb-2 text-3xl font-black">
                {ServicesV2.Content.Title}
              </h2>
              <p className="text-slate-400">{ServicesV2.Content.Description}</p>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {ServicesV2.Stats.TotalServices}
                </p>
                <p className="text-2xl font-black">{activeServices.length}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {ServicesV2.Stats.AveragePrice}
                </p>
                <p className="text-2xl font-black">
                  {formatCurrency(averagePrice)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-5">
                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  {ServicesV2.Stats.PopularCategory}
                </p>
                <p className="text-2xl font-black">{popularCategory}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {featuredServices.map((service) => (
                <article
                  key={service.id}
                  className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-800/10 transition-all hover:border-slate-600 hover:shadow-xl"
                >
                  <div className="relative h-40 overflow-hidden bg-gradient-to-br from-slate-800 to-slate-700">
                    <div className="absolute right-3 top-3 rounded bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-tighter">
                      {service.active
                        ? ServicesV2.Card.Active
                        : ServicesV2.Card.Hidden}
                    </div>
                    {service.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={service.imageUrl}
                        alt={service.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-4xl text-slate-300">
                        <Scissors className="h-12 w-12" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="mb-4 flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold">{service.name}</h3>
                        <div className="mt-1 flex items-center gap-2">
                          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                          <p className="text-sm text-slate-400">
                            {service.durationMinutes} min
                          </p>
                        </div>
                      </div>
                      <p className="text-xl font-black">
                        {formatCurrency(service.price)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditImageFile(null);
                          setEditImagePreviewUrl((current) => {
                            revokePreviewUrl(current);
                            return undefined;
                          });
                          setEditingService(service);
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800/60 py-2 text-sm font-bold transition hover:bg-slate-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {ServicesV2.Actions.Edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => requestToggleServiceActive(service)}
                        className="rounded-lg border border-slate-700 p-2 text-red-400 transition hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <h3 className="mb-6 mt-12 text-xl font-bold">
              {ServicesV2.Content.DetailedList}
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-800/10">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-800/30 text-xs font-black uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-4">
                      {ServicesV2.Table.ServiceName}
                    </th>
                    <th className="px-6 py-4">{ServicesV2.Table.Duration}</th>
                    <th className="px-6 py-4">{ServicesV2.Table.Price}</th>
                    <th className="px-6 py-4">{ServicesV2.Table.Status}</th>
                    <th className="px-6 py-4 text-right">
                      {ServicesV2.Table.Actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredServices.map((service) => (
                    <tr
                      key={`row-${service.id}`}
                      className="transition-colors hover:bg-slate-800/20"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Scissors className="h-4 w-4 text-slate-400" />
                          <span className="font-bold">{service.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {service.durationMinutes} min
                      </td>
                      <td className="px-6 py-4 font-bold">
                        {formatCurrency(service.price)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded px-2 py-1 text-[10px] font-black uppercase ${
                            service.active
                              ? "bg-green-900/30 text-green-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {service.active
                            ? ServicesV2.Table.Active
                            : ServicesV2.Table.Hidden}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditImageFile(null);
                              setEditImagePreviewUrl((current) => {
                                revokePreviewUrl(current);
                                return undefined;
                              });
                              setEditingService(service);
                            }}
                            className="rounded p-1.5 transition hover:bg-slate-700"
                          >
                            <Pencil className="h-4 w-4 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestToggleServiceActive(service)}
                            className="rounded p-1.5 transition hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        }
        mobileHeader={
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-[#191919] p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push(APP_ROUTES.Dashboard)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800"
              >
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
              <h1 className="text-xl font-bold">{ServicesV2.Mobile.Title}</h1>
            </div>
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
              <Search className="h-4 w-4" />
            </button>
          </header>
        }
        mobileBody={
          <main className="flex-1 overflow-y-auto pb-24">
            <div className="flex items-end justify-between px-4 py-6">
              <div>
                <h2 className="text-2xl font-bold">
                  {ServicesV2.Mobile.ManageCatalog}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {activeServices.length} {ServicesV2.Mobile.ActiveServices}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-[#262626] px-4 py-2 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" />
                {ServicesV2.Mobile.NewService}
              </button>
            </div>

            <div className="space-y-1 px-2">
              {filteredServices.map((service) => (
                <article
                  key={`mobile-${service.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-transparent bg-slate-900/50 p-4 transition-colors hover:border-slate-800"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#262626] text-white shadow-sm">
                    {service.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={service.imageUrl}
                        alt={service.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Scissors className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between">
                      <p className="truncate text-base font-bold">
                        {service.name}
                      </p>
                      <span className="font-bold">
                        {formatCurrency(service.price)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>{service.durationMinutes} min</span>
                    </div>
                  </div>
                  <div className="ml-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditImageFile(null);
                        setEditImagePreviewUrl((current) => {
                          revokePreviewUrl(current);
                          return undefined;
                        });
                        setEditingService(service);
                      }}
                      className="p-2 text-slate-400 transition hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestToggleServiceActive(service)}
                      className="p-2 text-slate-400 transition hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </main>
        }
        mobileFooter={
          <nav className="fixed bottom-0 left-0 right-0 z-20 flex gap-2 border-t border-slate-800 bg-slate-950 px-4 pb-6 pt-3">
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Schedule)}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-slate-400"
            >
              <CalendarDays className="h-4 w-4" />
              <p className="text-[10px] font-medium">
                {ServicesV2.Mobile.Calendar}
              </p>
            </button>
            <button
              type="button"
              className="flex flex-1 flex-col items-center justify-center gap-1 text-white"
            >
              <Scissors className="h-4 w-4" />
              <p className="text-[10px] font-medium">
                {ServicesV2.Mobile.Services}
              </p>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Customers)}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-slate-400"
            >
              <Users className="h-4 w-4" />
              <p className="text-[10px] font-medium">
                {ServicesV2.Mobile.Clients}
              </p>
            </button>
            <button
              type="button"
              onClick={() => router.push(APP_ROUTES.Payments)}
              className="flex flex-1 flex-col items-center justify-center gap-1 text-slate-400"
            >
              <Clock3 className="h-4 w-4" />
              <p className="text-[10px] font-medium">
                {ServicesV2.Sidebar.Payments}
              </p>
            </button>
          </nav>
        }
      />

      {canOperate ? (
        <>
          {isCreateModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-[520px] overflow-hidden rounded border border-slate-700 bg-[#1c1c1c] shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-700 p-6">
                  <h3 className="text-xl font-bold">
                    {ServicesV2.Modal.NewTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="text-slate-400 transition hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form className="space-y-4 p-6" onSubmit={onCreateService}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelName}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <input
                    className={`h-11 w-full rounded border bg-[#121212] px-3 text-sm ${
                      createServiceErrors.name
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    value={serviceName}
                    onChange={(event) => {
                      setServiceName(event.target.value);
                      if (createServiceErrors.name) {
                        setCreateServiceErrors((current) => ({
                          ...current,
                          name: undefined,
                        }));
                      }
                    }}
                    placeholder={Admin.Fields.Name}
                    required
                  />
                  {createServiceErrors.name ? (
                    <p className="text-xs text-red-400">
                      {createServiceErrors.name}
                    </p>
                  ) : null}
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelDuration}
                    <span className="ml-1 text-slate-500">
                      ({ServicesV2.Common.Optional})
                    </span>
                  </label>
                  <input
                    className="h-11 w-full rounded border border-slate-700 bg-[#121212] px-3 text-sm"
                    value={serviceDuration}
                    onChange={(event) => setServiceDuration(event.target.value)}
                    placeholder={ServicesV2.Modal.DurationOptionalPlaceholder}
                    inputMode="numeric"
                  />
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelPrice}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <input
                    className={`h-11 w-full rounded border bg-[#121212] px-3 text-sm ${
                      createServiceErrors.price
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    value={servicePrice}
                    onChange={(event) => {
                      setServicePrice(event.target.value);
                      if (createServiceErrors.price) {
                        setCreateServiceErrors((current) => ({
                          ...current,
                          price: undefined,
                        }));
                      }
                    }}
                    placeholder={Admin.Fields.Price}
                    inputMode="decimal"
                    required
                  />
                  {createServiceErrors.price ? (
                    <p className="text-xs text-red-400">
                      {createServiceErrors.price}
                    </p>
                  ) : null}
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelImage}
                    <span className="ml-1 text-slate-500">
                      ({ServicesV2.Common.Optional})
                    </span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={async (event) =>
                      onSelectServiceImage(
                        event.target.files?.[0],
                        setCreateImageFile,
                        setCreateImagePreviewUrl,
                      )
                    }
                    className="block w-full text-xs text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-600"
                  />
                  <p className="text-xs text-slate-500">
                    {ServicesV2.Modal.ImageHint}
                  </p>
                  {createImagePreviewUrl ? (
                    <div className="overflow-hidden rounded border border-slate-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={createImagePreviewUrl}
                        alt={ServicesV2.Modal.NewTitle}
                        className="h-40 w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center justify-end gap-3 border-t border-slate-700 pt-4">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                    >
                      {ServicesV2.Actions.Back}
                    </button>
                    <LoadingButton
                      type="submit"
                      isLoading={createServiceState.isLoading}
                      loadingText={Admin.Actions.Creating}
                    >
                      {Admin.Actions.CreateService}
                    </LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {editingService ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-[520px] overflow-hidden rounded border border-slate-700 bg-[#1c1c1c] shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-700 p-6">
                  <h3 className="text-xl font-bold">
                    {ServicesV2.Modal.EditTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="text-slate-400 transition hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form className="space-y-4 p-6" onSubmit={onUpdateService}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelName}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <input
                    className={`h-11 w-full rounded border bg-[#121212] px-3 text-sm ${
                      editServiceErrors.name
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    value={editingService.name}
                    onChange={(event) => {
                      setEditingService({
                        ...editingService,
                        name: event.target.value,
                      });
                      if (editServiceErrors.name) {
                        setEditServiceErrors((current) => ({
                          ...current,
                          name: undefined,
                        }));
                      }
                    }}
                    placeholder={Admin.Fields.Name}
                    required
                  />
                  {editServiceErrors.name ? (
                    <p className="text-xs text-red-400">
                      {editServiceErrors.name}
                    </p>
                  ) : null}
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelDuration}
                    <span className="ml-1 text-slate-500">
                      ({ServicesV2.Common.Optional})
                    </span>
                  </label>
                  <input
                    className="h-11 w-full rounded border border-slate-700 bg-[#121212] px-3 text-sm"
                    value={`${editingService.durationMinutes}`}
                    onChange={(event) =>
                      setEditingService({
                        ...editingService,
                        durationMinutes: Number(event.target.value),
                      })
                    }
                    placeholder={ServicesV2.Modal.DurationOptionalPlaceholder}
                    inputMode="numeric"
                  />
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelPrice}
                    <span className="ml-1 text-red-400">*</span>
                  </label>
                  <input
                    className={`h-11 w-full rounded border bg-[#121212] px-3 text-sm ${
                      editServiceErrors.price
                        ? "border-red-500"
                        : "border-slate-700"
                    }`}
                    value={`${editingService.price}`}
                    onChange={(event) => {
                      setEditingService({
                        ...editingService,
                        price: Number(event.target.value),
                      });
                      if (editServiceErrors.price) {
                        setEditServiceErrors((current) => ({
                          ...current,
                          price: undefined,
                        }));
                      }
                    }}
                    placeholder={Admin.Fields.Price}
                    inputMode="decimal"
                    required
                  />
                  {editServiceErrors.price ? (
                    <p className="text-xs text-red-400">
                      {editServiceErrors.price}
                    </p>
                  ) : null}
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    {ServicesV2.Modal.LabelImage}
                    <span className="ml-1 text-slate-500">
                      ({ServicesV2.Common.Optional})
                    </span>
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      onSelectServiceImage(
                        file,
                        setEditImageFile,
                        setEditImagePreviewUrl,
                      );
                    }}
                    className="block w-full text-xs text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-600"
                  />
                  <p className="text-xs text-slate-500">
                    {ServicesV2.Modal.ImageHint}
                  </p>
                  {editImagePreviewUrl || editingService.imageUrl ? (
                    <div className="overflow-hidden rounded border border-slate-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editImagePreviewUrl ?? editingService.imageUrl}
                        alt={editingService.name}
                        className="h-40 w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingService({
                        ...editingService,
                        imageUrl: undefined,
                      });
                      setEditImageFile(null);
                      setEditImagePreviewUrl((current) => {
                        revokePreviewUrl(current);
                        return undefined;
                      });
                    }}
                    className="text-xs font-semibold text-slate-400 transition hover:text-white"
                  >
                    {ServicesV2.Actions.RemoveImage}
                  </button>
                  <div className="flex items-center justify-end gap-3 border-t border-slate-700 pt-4">
                    <button
                      type="button"
                      onClick={closeEditModal}
                      className="px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                    >
                      {ServicesV2.Actions.Back}
                    </button>
                    <LoadingButton
                      type="submit"
                      isLoading={updateServiceState.isLoading}
                      loadingText={Admin.Actions.Saving}
                    >
                      {Admin.Actions.Save}
                    </LoadingButton>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {deleteCandidateService ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-[460px] rounded border border-slate-700 bg-[#171717] p-6 shadow-2xl">
                <h3 className="text-lg font-bold">
                  {ServicesV2.Modal.DeleteConfirmTitle}
                </h3>
                <p className="mt-3 text-sm text-slate-300">
                  {ServicesV2.Modal.DeleteConfirmMessagePrefix} &quot;
                  {deleteCandidateService.name}
                  &quot;?
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteCandidateService(null)}
                    className="px-4 py-2 text-sm text-slate-400 transition hover:text-white"
                  >
                    {ServicesV2.Modal.DeleteConfirmCancel}
                  </button>
                  <LoadingButton
                    type="button"
                    onClick={async () => {
                      await onToggleServiceActive(deleteCandidateService);
                      setDeleteCandidateService(null);
                    }}
                    isLoading={updateServiceState.isLoading}
                    loadingText={Admin.Actions.Updating}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {deleteCandidateService.active
                      ? ServicesV2.Modal.DeleteConfirmAccept
                      : ServicesV2.Actions.Restore}
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
