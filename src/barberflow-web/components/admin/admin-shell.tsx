"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Menu,
  Scissors,
  Search,
  ShieldUser,
  Store,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import {
  BarberItem,
  CreateBarbershopRequest,
  CustomerItem,
  ServiceItem,
  useCreateBarbershopMutation,
  useCreateBarberMutation,
  useCreateCustomerMutation,
  useCreateServiceMutation,
  useDeleteBarberMutation,
  useDeleteCustomerMutation,
  useDeleteServiceMutation,
  useGetAppointmentsQuery,
  useGetBarbershopProfileQuery,
  useGetBarbersQuery,
  useGetCustomersQuery,
  useGetServicesQuery,
  useUpdateBarbershopProfileMutation,
  useUpdateBarberMutation,
  useUpdateCustomerMutation,
  useUpdateServiceMutation,
} from "@/lib/api/owner-admin-api";
import { useLogoutMutation } from "@/lib/api/authApi";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";
import { AppRole, hasPermission } from "@/lib/auth/permissions";

type AdminRole = AppRole;

type AdminShellProps = {
  role: AdminRole;
  barbershopId: string | null;
};

type CatalogView = "quick" | "services" | "barbers" | "customers";
type AdminSectionId = "overview" | "barbershop" | "operations" | "superadmin";

const COLOMBIA_DEPARTMENT_CITY_MAP: Record<string, string[]> = {
  Antioquia: ["Medellin", "Bello", "Envigado", "Itagui"],
  Atlantico: ["Barranquilla", "Soledad", "Puerto Colombia"],
  Bogota: ["Bogota"],
  Bolivar: ["Cartagena", "Turbaco"],
  Boyaca: ["Tunja", "Duitama", "Sogamoso"],
  Caldas: ["Manizales", "Villamaria"],
  Cauca: ["Popayan"],
  Cesar: ["Valledupar"],
  Cordoba: ["Monteria"],
  Cundinamarca: ["Soacha", "Facatativa", "Chia"],
  Huila: ["Neiva", "Pitalito"],
  Magdalena: ["Santa Marta"],
  Meta: ["Villavicencio"],
  Narino: ["Pasto", "Ipiales"],
  NorteDeSantander: ["Cucuta", "VillaDelRosario", "LosPatios"],
  Quindio: ["Armenia"],
  Risaralda: ["Pereira", "Dosquebradas"],
  Santander: ["Bucaramanga", "Floridablanca", "Giron"],
  Tolima: ["Ibague"],
  ValleDelCauca: ["Cali", "Palmira", "Buenaventura"],
};

function AccordionSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="dashboard-panel overflow-hidden" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-1">
          <span className="dashboard-heading text-base sm:text-lg">
            {title}
          </span>
          {description ? (
            <span className="dashboard-description text-sm">{description}</span>
          ) : null}
        </div>
      </summary>
      <Separator />
      <div className="p-4 sm:p-6">{children}</div>
    </details>
  );
}

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

export function AdminShell({ role, barbershopId }: AdminShellProps) {
  const router = useRouter();
  const { Admin, Common, SharedShell } = Texts;
  const { showToast } = useAppToast();

  const canOperate = Boolean(barbershopId);

  const servicesQuery = useGetServicesQuery(undefined, { skip: !canOperate });
  const barbersQuery = useGetBarbersQuery(undefined, { skip: !canOperate });
  const customersQuery = useGetCustomersQuery(undefined, { skip: !canOperate });
  const appointmentsQuery = useGetAppointmentsQuery(undefined, {
    skip: !canOperate,
  });

  const [createBarbershop, createBarbershopState] =
    useCreateBarbershopMutation();
  const { data: barbershopProfile, isLoading: isBarbershopProfileLoading } =
    useGetBarbershopProfileQuery(undefined, {
      skip: !canOperate,
    });
  const [updateBarbershopProfile, updateBarbershopProfileState] =
    useUpdateBarbershopProfileMutation();
  const [logout] = useLogoutMutation();

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

  const [barbershopName, setBarbershopName] = useState("");
  const [barbershopPhone, setBarbershopPhone] = useState("");
  const [barbershopAddressLine, setBarbershopAddressLine] = useState("");
  const [barbershopDepartment, setBarbershopDepartment] = useState("");
  const [barbershopCity, setBarbershopCity] = useState("");
  const [barbershopTimezone, setBarbershopTimezone] =
    useState("America/Bogota");
  const [isBarbershopEditMode, setIsBarbershopEditMode] = useState(false);

  const [editingService, setEditingService] = useState<ServiceItem | null>(
    null,
  );
  const [editingBarber, setEditingBarber] = useState<BarberItem | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null,
  );
  const [catalogView, setCatalogView] = useState<CatalogView>("quick");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        isActive: true,
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
        isActive: editingCustomer.isActive,
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

  function onOpenCatalogView(view: CatalogView) {
    setCatalogView(view);
  }

  function onBackToQuickView() {
    setCatalogView("quick");
    setEditingService(null);
    setEditingBarber(null);
    setEditingCustomer(null);
  }

  function onNavigateToSection(
    sectionId: AdminSectionId,
    nextCatalogView?: CatalogView,
  ) {
    if (nextCatalogView) {
      setCatalogView(nextCatalogView);
    }

    setIsSidebarOpen(false);

    requestAnimationFrame(() => {
      const target = document.getElementById(sectionId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function onToggleBarberActive(barber: BarberItem) {
    if (barber.isActive) {
      await onDeleteBarber(barber.id);
      return;
    }

    try {
      await updateBarber({
        id: barber.id,
        name: barber.name.trim(),
        email: barber.email?.trim() || undefined,
        phone: barber.phone?.trim() || undefined,
        isActive: true,
      }).unwrap();

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

  async function onToggleCustomerActive(customer: CustomerItem) {
    if (customer.isActive) {
      await onDeleteCustomer(customer.id);
      return;
    }

    try {
      await updateCustomer({
        id: customer.id,
        name: (customer.name ?? "").trim(),
        email: customer.email?.trim() || undefined,
        phone: customer.phone?.trim() || undefined,
        notes: customer.notes?.trim() || undefined,
        isActive: true,
      }).unwrap();

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

  async function onCreateBarbershop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!barbershopName.trim()) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: "El nombre de la barberia es obligatorio.",
        variant: "error",
      });
      return;
    }

    const locationSuffix = [barbershopCity, barbershopDepartment]
      .filter((value) => Boolean(value?.trim()))
      .join(", ");

    const composedAddress = [barbershopAddressLine.trim(), locationSuffix]
      .filter((value) => Boolean(value))
      .join(" - ");

    const payload: CreateBarbershopRequest = {
      name: barbershopName.trim(),
      phone: barbershopPhone.trim() || undefined,
      address: composedAddress || undefined,
      timezone: barbershopTimezone.trim() || "America/Bogota",
    };

    try {
      await createBarbershop(payload).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description:
          "Barberia creada correctamente. Inicia sesion para actualizar permisos.",
        variant: "success",
      });

      try {
        await logout().unwrap();
      } catch {
        // Even if logout request fails, force login route to refresh auth flow.
      }

      router.replace(APP_ROUTES.Login);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  const isSuperAdmin = role === "SuperAdmin";
  const canManageBarbershop = hasPermission(role, "barbershop.edit");
  const canManageServices = hasPermission(role, "services.manage");
  const canManageBarbers = hasPermission(role, "barbers.manage");
  const canManageCustomers = hasPermission(role, "customers.manage");
  const canViewAppointments = hasPermission(role, "appointments.view");

  async function onUpdateBarbershopProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageBarbershop) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: "No tienes permisos para editar la barberia.",
        variant: "error",
      });
      return;
    }

    const locationSuffix = [barbershopCity, barbershopDepartment]
      .filter((value) => Boolean(value?.trim()))
      .join(", ");

    const composedAddress = [barbershopAddressLine.trim(), locationSuffix]
      .filter((value) => Boolean(value))
      .join(" - ");

    try {
      await updateBarbershopProfile({
        name: barbershopName.trim(),
        phone: barbershopPhone.trim() || undefined,
        address: composedAddress || undefined,
        timezone: barbershopTimezone.trim() || "America/Bogota",
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: "Barberia actualizada.",
        variant: "success",
      });
      setIsBarbershopEditMode(false);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  function onStartBarbershopUpdate() {
    if (!canManageBarbershop) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: "No tienes permisos para editar la barberia.",
        variant: "error",
      });
      return;
    }

    setBarbershopName(barbershopProfile?.name ?? "");
    setBarbershopPhone(barbershopProfile?.phone ?? "");
    setBarbershopAddressLine(barbershopProfile?.address ?? "");
    setBarbershopTimezone(barbershopProfile?.timezone ?? "America/Bogota");
    setIsBarbershopEditMode(true);
  }

  function onCancelBarbershopUpdate() {
    setIsBarbershopEditMode(false);
  }

  const barbershopDepartmentOptions = Object.keys(COLOMBIA_DEPARTMENT_CITY_MAP);
  const barbershopCityOptions =
    barbershopDepartment && COLOMBIA_DEPARTMENT_CITY_MAP[barbershopDepartment]
      ? COLOMBIA_DEPARTMENT_CITY_MAP[barbershopDepartment]
      : [];

  const sectionTitleClass = "dashboard-heading text-base sm:text-lg";
  const isOperationalDataRefreshing =
    servicesQuery.isFetching ||
    barbersQuery.isFetching ||
    customersQuery.isFetching ||
    appointmentsQuery.isFetching;
  const roleLabel =
    role === "SuperAdmin" ? "SuperAdmin" : SharedShell.DemoOwnerRole;

  return (
    <main className="relative min-h-screen overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="dashboard-atmosphere" />

      <section className="dashboard-container grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className={`dashboard-panel fixed inset-y-3 left-3 z-40 h-auto w-[260px] overflow-y-auto p-3 transition-transform duration-200 lg:sticky lg:top-4 lg:z-auto lg:block lg:h-fit lg:w-auto lg:translate-x-0 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-[110%]"
          }`}
        >
          <div className="mb-4 flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20 text-orange-300">
              <Scissors className="h-4 w-4" />
            </div>
            <div>
              <p className="dashboard-heading text-base font-semibold">
                {SharedShell.BrandName}
              </p>
              <p className="dashboard-microtext text-xs">
                {Admin.Actions.OpenAdmin}
              </p>
            </div>
          </div>
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => onNavigateToSection("overview")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <LayoutDashboard className="h-4 w-4" />
              {Admin.Navigation.Overview}
            </button>
            <button
              type="button"
              onClick={() => onNavigateToSection("barbershop")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <Store className="h-4 w-4" />
              {Admin.Navigation.Barbershop}
            </button>
            <button
              type="button"
              onClick={() => onNavigateToSection("operations", "quick")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <Wrench className="h-4 w-4" />
              {Admin.Navigation.Operations}
            </button>
            <button
              type="button"
              onClick={() => onNavigateToSection("operations", "services")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <Scissors className="h-4 w-4" />
              {Admin.Navigation.Services}
            </button>
            <button
              type="button"
              onClick={() => onNavigateToSection("operations", "barbers")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <Users className="h-4 w-4" />
              {Admin.Navigation.Barbers}
            </button>
            <button
              type="button"
              onClick={() => onNavigateToSection("operations", "customers")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <CalendarDays className="h-4 w-4" />
              {Admin.Navigation.Customers}
            </button>
            {isSuperAdmin ? (
              <button
                type="button"
                onClick={() => onNavigateToSection("superadmin")}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
              >
                <ShieldUser className="h-4 w-4" />
                {Admin.Navigation.SuperAdmin}
              </button>
            ) : null}
          </nav>
        </aside>

        {isSidebarOpen ? (
          <button
            type="button"
            aria-label={Admin.Navbar.CloseMenu}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          />
        ) : null}

        <div className="space-y-4">
          <header className="dashboard-panel p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <Badge className="dashboard-badge-brand">
                  {Admin.Actions.OpenAdmin}
                </Badge>
                <h1 className="dashboard-heading text-xl font-semibold tracking-tight sm:text-2xl">
                  {Admin.Title}
                </h1>
                <p className="dashboard-body-muted text-sm">
                  {Admin.Description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={
                    isSidebarOpen
                      ? Admin.Navbar.CloseMenu
                      : Admin.Navbar.OpenMenu
                  }
                  onClick={() => setIsSidebarOpen((previous) => !previous)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100 lg:hidden"
                >
                  {isSidebarOpen ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Menu className="h-4 w-4" />
                  )}
                </button>
                <div className="relative min-w-[220px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="search"
                    placeholder={Admin.Navbar.SearchPlaceholder}
                    className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <button
                  type="button"
                  aria-label={Admin.Navbar.Notifications}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-400" />
                </button>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-100">
                    AU
                  </div>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold text-zinc-100">
                      {Admin.Navbar.UserName}
                    </p>
                    <p className="text-[11px] text-zinc-400">{roleLabel}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(APP_ROUTES.Dashboard)}
                >
                  {Admin.Actions.GoDashboard}
                </Button>
              </div>
            </div>
          </header>

          <section id="overview" className="dashboard-grid-stats">
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

          <section className="space-y-4">
            <div id="barbershop">
              <AccordionSection
                title="Barberia"
                description="Configuracion general, datos y estado operativo de la barberia."
              >
                <Card className="dashboard-panel">
                  <CardHeader>
                    <CardTitle className={sectionTitleClass}>
                      Estado de barberia
                    </CardTitle>
                    <CardDescription className="dashboard-description">
                      {canOperate
                        ? "Barberia configurada. Ya puedes ejecutar el resto del flujo operativo."
                        : "Aun no tienes barberia asignada. Crea tu barberia para habilitar servicios, barberos, clientes y citas."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {canOperate ? (
                      <div className="space-y-4">
                        {isBarbershopEditMode ? (
                          <form
                            className="space-y-3"
                            onSubmit={onUpdateBarbershopProfile}
                          >
                            <input
                              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                              value={barbershopName}
                              onChange={(e) =>
                                setBarbershopName(e.target.value)
                              }
                              placeholder="Nombre de la barberia"
                            />
                            <input
                              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                              value={barbershopPhone}
                              onChange={(e) =>
                                setBarbershopPhone(e.target.value)
                              }
                              placeholder={Admin.Fields.Phone}
                            />
                            <input
                              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                              value={barbershopAddressLine}
                              onChange={(e) =>
                                setBarbershopAddressLine(e.target.value)
                              }
                              placeholder="Direccion (calle, carrera, numero)"
                            />
                            <input
                              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                              value={barbershopTimezone}
                              onChange={(e) =>
                                setBarbershopTimezone(e.target.value)
                              }
                              placeholder="Zona horaria"
                            />
                            <div className="flex gap-2">
                              <LoadingButton
                                type="submit"
                                disabled={
                                  !canManageBarbershop ||
                                  updateBarbershopProfileState.isLoading
                                }
                                isLoading={
                                  updateBarbershopProfileState.isLoading
                                }
                                loadingText={Admin.Actions.Updating}
                              >
                                Guardar barberia
                              </LoadingButton>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={onCancelBarbershopUpdate}
                              >
                                {Admin.Actions.Cancel}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="rounded-xl border border-border/60 p-4">
                              {isBarbershopProfileLoading ? (
                                <Skeleton className="h-20 rounded-xl" />
                              ) : (
                                <dl className="space-y-3">
                                  <div>
                                    <dt className="dashboard-microtext">
                                      {Admin.Fields.Name}
                                    </dt>
                                    <dd className="dashboard-heading text-sm font-medium">
                                      {barbershopProfile?.name ??
                                        Common.Status.NoData}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="dashboard-microtext">
                                      {Admin.Fields.Phone}
                                    </dt>
                                    <dd className="dashboard-heading text-sm font-medium">
                                      {barbershopProfile?.phone ??
                                        Common.Status.NoData}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="dashboard-microtext">
                                      Direccion
                                    </dt>
                                    <dd className="dashboard-heading text-sm font-medium">
                                      {barbershopProfile?.address ??
                                        Common.Status.NoData}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="dashboard-microtext">
                                      Zona horaria
                                    </dt>
                                    <dd className="dashboard-heading text-sm font-medium">
                                      {barbershopProfile?.timezone ??
                                        "America/Bogota"}
                                    </dd>
                                  </div>
                                </dl>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={onStartBarbershopUpdate}
                              disabled={
                                !canManageBarbershop ||
                                isBarbershopProfileLoading
                              }
                            >
                              {Admin.Actions.Update}
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <form className="space-y-3" onSubmit={onCreateBarbershop}>
                        <input
                          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                          value={barbershopName}
                          onChange={(e) => setBarbershopName(e.target.value)}
                          placeholder="Nombre de la barberia"
                        />
                        <input
                          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                          value={barbershopPhone}
                          onChange={(e) => setBarbershopPhone(e.target.value)}
                          placeholder={Admin.Fields.Phone}
                        />
                        <input
                          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                          value={barbershopAddressLine}
                          onChange={(e) =>
                            setBarbershopAddressLine(e.target.value)
                          }
                          placeholder="Direccion (calle, carrera, numero)"
                        />
                        <select
                          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                          value={barbershopDepartment}
                          onChange={(e) => {
                            setBarbershopDepartment(e.target.value);
                            setBarbershopCity("");
                          }}
                        >
                          <option value="">Selecciona departamento</option>
                          {barbershopDepartmentOptions.map((department) => (
                            <option key={department} value={department}>
                              {department}
                            </option>
                          ))}
                        </select>
                        <select
                          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                          value={barbershopCity}
                          onChange={(e) => setBarbershopCity(e.target.value)}
                          disabled={!barbershopDepartment}
                        >
                          <option value="">Selecciona ciudad</option>
                          {barbershopCityOptions.map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </select>
                        <input
                          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                          value={barbershopTimezone}
                          onChange={(e) =>
                            setBarbershopTimezone(e.target.value)
                          }
                          placeholder="Zona horaria"
                        />
                        <LoadingButton
                          type="submit"
                          isLoading={createBarbershopState.isLoading}
                          loadingText={Admin.Actions.Creating}
                        >
                          Crear barberia
                        </LoadingButton>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </AccordionSection>
            </div>

            <div id="operations">
              <AccordionSection
                title="Operacion Diaria"
                description="Altas rapidas para servicios, barberos, clientes y visibilidad de citas."
              >
                {!canOperate ? (
                  <p className="dashboard-microtext">
                    Debes primero crear tu barberia en la seccion
                    &quot;Barberia&quot; para habilitar estas operaciones.
                  </p>
                ) : null}
                {canOperate && isOperationalDataRefreshing ? (
                  <p className="dashboard-microtext">
                    <LoadingIndicator label={Common.Actions.Loading} />
                  </p>
                ) : null}
                {canOperate ? (
                  catalogView === "quick" ? (
                    <section className="dashboard-grid-panels">
                      <Card className="dashboard-panel">
                        <CardHeader>
                          <CardTitle className={sectionTitleClass}>
                            {Admin.Sections.CreateService}
                          </CardTitle>
                          <CardDescription className="dashboard-description">
                            {Admin.Api.CreateService}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <form
                            className="space-y-3"
                            onSubmit={onCreateService}
                          >
                            <input
                              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                              value={serviceName}
                              onChange={(e) => setServiceName(e.target.value)}
                              placeholder={Admin.Fields.Name}
                            />
                            <input
                              className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 text-sm text-foreground"
                              value={serviceDuration}
                              onChange={(e) =>
                                setServiceDuration(e.target.value)
                              }
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
                            <div className="flex gap-2">
                              <LoadingButton
                                type="submit"
                                disabled={
                                  !canManageServices ||
                                  createServiceState.isLoading
                                }
                                isLoading={createServiceState.isLoading}
                                loadingText={Admin.Actions.Creating}
                              >
                                {Admin.Actions.CreateService}
                              </LoadingButton>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenCatalogView("services")}
                              >
                                {Admin.Actions.ViewAll}
                              </Button>
                            </div>
                          </form>
                        </CardContent>
                      </Card>

                      <Card className="dashboard-panel">
                        <CardHeader>
                          <CardTitle className={sectionTitleClass}>
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
                            <div className="flex gap-2">
                              <LoadingButton
                                type="submit"
                                disabled={
                                  !canManageBarbers ||
                                  createBarberState.isLoading
                                }
                                isLoading={createBarberState.isLoading}
                                loadingText={Admin.Actions.Creating}
                              >
                                {Admin.Actions.CreateBarber}
                              </LoadingButton>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenCatalogView("barbers")}
                              >
                                {Admin.Actions.ViewAll}
                              </Button>
                            </div>
                          </form>
                        </CardContent>
                      </Card>

                      <Card className="dashboard-panel">
                        <CardHeader>
                          <CardTitle className={sectionTitleClass}>
                            {Admin.Sections.CreateCustomer}
                          </CardTitle>
                          <CardDescription className="dashboard-description">
                            {Admin.Api.CreateCustomer}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <form
                            className="space-y-3"
                            onSubmit={onCreateCustomer}
                          >
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
                            <div className="flex gap-2">
                              <LoadingButton
                                type="submit"
                                disabled={
                                  !canManageCustomers ||
                                  createCustomerState.isLoading
                                }
                                isLoading={createCustomerState.isLoading}
                                loadingText={Admin.Actions.Creating}
                              >
                                {Admin.Actions.CreateCustomer}
                              </LoadingButton>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenCatalogView("customers")}
                              >
                                {Admin.Actions.ViewAll}
                              </Button>
                            </div>
                          </form>
                        </CardContent>
                      </Card>

                      <Card className="dashboard-panel">
                        <CardHeader>
                          <CardTitle className={sectionTitleClass}>
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
                          {canViewAppointments ? (
                            (appointmentsQuery.data ?? [])
                              .slice(0, 6)
                              .map((appointment) => (
                                <article
                                  key={appointment.id}
                                  className="rounded-xl border border-border/60 p-3"
                                >
                                  <p className="dashboard-heading text-sm font-medium">
                                    {appointment.customerName}
                                  </p>
                                  <p className="dashboard-microtext">
                                    {appointment.serviceName} ·{" "}
                                    {appointment.barberName}
                                  </p>
                                  <p className="dashboard-microtext">
                                    {new Date(
                                      appointment.appointmentTime,
                                    ).toLocaleString(Admin.Format.Locale)}
                                  </p>
                                </article>
                              ))
                          ) : (
                            <p className="dashboard-microtext">
                              No tienes permisos para ver citas.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </section>
                  ) : (
                    <Card className="dashboard-panel">
                      <CardHeader className="flex flex-row items-center justify-between gap-2">
                        <CardTitle className={sectionTitleClass}>
                          {catalogView === "services"
                            ? Admin.Sections.ManageServices
                            : catalogView === "barbers"
                              ? Admin.Sections.ManageBarbers
                              : Admin.Sections.ManageCustomers}
                        </CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onBackToQuickView}
                        >
                          {Admin.Actions.BackToQuick}
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {catalogView === "services" ? (
                          <div className="overflow-x-auto rounded-xl border border-border/60">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/60 text-left">
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Name}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.DurationMinutes}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Price}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Status}
                                  </th>
                                  <th className="px-3 py-2">Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(servicesQuery.data ?? []).map((service) => (
                                  <tr
                                    key={service.id}
                                    className="border-b border-border/40"
                                  >
                                    <td className="px-3 py-2">
                                      {service.name}
                                    </td>
                                    <td className="px-3 py-2">
                                      {service.durationMinutes}
                                    </td>
                                    <td className="px-3 py-2">
                                      {service.price}
                                    </td>
                                    <td className="px-3 py-2">
                                      {service.active
                                        ? Common.Status.Ok
                                        : Common.Status.Error}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            setEditingService(service)
                                          }
                                        >
                                          {Admin.Actions.Edit}
                                        </Button>
                                        <LoadingButton
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            onDeleteService(service.id)
                                          }
                                          isLoading={
                                            deleteServiceState.isLoading
                                          }
                                          loadingText={Admin.Actions.Deleting}
                                        >
                                          {Admin.Actions.Delete}
                                        </LoadingButton>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}

                        {catalogView === "barbers" ? (
                          <div className="overflow-x-auto rounded-xl border border-border/60">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/60 text-left">
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Name}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Email}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Phone}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Status}
                                  </th>
                                  <th className="px-3 py-2">Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(barbersQuery.data ?? []).map((barber) => (
                                  <tr
                                    key={barber.id}
                                    className="border-b border-border/40"
                                  >
                                    <td className="px-3 py-2">{barber.name}</td>
                                    <td className="px-3 py-2">
                                      {barber.email ?? Common.Status.NoData}
                                    </td>
                                    <td className="px-3 py-2">
                                      {barber.phone ?? Common.Status.NoData}
                                    </td>
                                    <td className="px-3 py-2">
                                      {barber.isActive
                                        ? Common.Status.Ok
                                        : Common.Status.Error}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            setEditingBarber(barber)
                                          }
                                        >
                                          {Admin.Actions.Edit}
                                        </Button>
                                        <LoadingButton
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            onToggleBarberActive(barber)
                                          }
                                          isLoading={
                                            deleteBarberState.isLoading ||
                                            updateBarberState.isLoading
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
                        ) : null}

                        {catalogView === "customers" ? (
                          <div className="overflow-x-auto rounded-xl border border-border/60">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/60 text-left">
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Name}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Email}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Phone}
                                  </th>
                                  <th className="px-3 py-2">
                                    {Admin.Fields.Status}
                                  </th>
                                  <th className="px-3 py-2">Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(customersQuery.data ?? []).map((customer) => (
                                  <tr
                                    key={customer.id}
                                    className="border-b border-border/40"
                                  >
                                    <td className="px-3 py-2">
                                      {customer.name ?? Common.Status.NoData}
                                    </td>
                                    <td className="px-3 py-2">
                                      {customer.email ?? Common.Status.NoData}
                                    </td>
                                    <td className="px-3 py-2">
                                      {customer.phone ?? Common.Status.NoData}
                                    </td>
                                    <td className="px-3 py-2">
                                      {customer.isActive
                                        ? Common.Status.Ok
                                        : Common.Status.Error}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            setEditingCustomer(customer)
                                          }
                                        >
                                          {Admin.Actions.Edit}
                                        </Button>
                                        <LoadingButton
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            onToggleCustomerActive(customer)
                                          }
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
                        ) : null}

                        {editingService ? (
                          <form
                            className="space-y-3"
                            onSubmit={onUpdateService}
                          >
                            <p className="dashboard-heading text-sm">
                              Editar servicio
                            </p>
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
                            <div className="flex gap-2">
                              <LoadingButton
                                type="submit"
                                isLoading={updateServiceState.isLoading}
                                loadingText={Admin.Actions.Saving}
                              >
                                {Admin.Actions.Save}
                              </LoadingButton>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditingService(null)}
                              >
                                {Admin.Actions.Cancel}
                              </Button>
                            </div>
                          </form>
                        ) : null}

                        {editingBarber ? (
                          <form className="space-y-3" onSubmit={onUpdateBarber}>
                            <p className="dashboard-heading text-sm">
                              Editar barbero
                            </p>
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
                              <LoadingButton
                                type="submit"
                                isLoading={updateBarberState.isLoading}
                                loadingText={Admin.Actions.Saving}
                              >
                                {Admin.Actions.Save}
                              </LoadingButton>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditingBarber(null)}
                              >
                                {Admin.Actions.Cancel}
                              </Button>
                            </div>
                          </form>
                        ) : null}

                        {editingCustomer ? (
                          <form
                            className="space-y-3"
                            onSubmit={onUpdateCustomer}
                          >
                            <p className="dashboard-heading text-sm">
                              Editar cliente
                            </p>
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
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editingCustomer.isActive}
                                onChange={(e) =>
                                  setEditingCustomer({
                                    ...editingCustomer,
                                    isActive: e.target.checked,
                                  })
                                }
                              />
                              {editingCustomer.isActive
                                ? Admin.Actions.Deactivate
                                : Admin.Actions.Activate}
                            </label>
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
                          </form>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                ) : null}
              </AccordionSection>
            </div>

            {isSuperAdmin ? (
              <div id="superadmin">
                <AccordionSection
                  title="Super Admin"
                  description="Funciones globales del SaaS (multi-tenant, auditoria y politicas)."
                >
                  <Card className="dashboard-panel">
                    <CardHeader>
                      <CardTitle className={sectionTitleClass}>
                        Control global de plataforma
                      </CardTitle>
                      <CardDescription className="dashboard-description">
                        Este espacio estara dedicado a funciones exclusivas de
                        SuperAdmin: gestion de tenants, cuotas, facturacion y
                        salud global.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </AccordionSection>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
