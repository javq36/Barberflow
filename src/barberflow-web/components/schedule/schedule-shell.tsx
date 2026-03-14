"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Plus,
  Scissors,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import {
  AppointmentItem,
  BarberItem,
  CustomerItem,
  ServiceItem,
  useCancelAppointmentMutation,
  useCreateAppointmentMutation,
  useCreateCustomerMutation,
  useGetAppointmentsQuery,
  useGetBarbersQuery,
  useGetCustomersQuery,
  useGetCustomersSearchQuery,
  useGetServicesQuery,
  useRescheduleAppointmentMutation,
  useUpdateAppointmentStatusMutation,
} from "@/lib/api/owner-admin-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useLogoutMutation } from "@/lib/api/authApi";
import { useAppToast } from "@/lib/toast/toast-provider";
import { AppRole, hasPermission } from "@/lib/auth/permissions";

type ScheduleShellProps = {
  role: AppRole;
};

type ViewMode = "day" | "week" | "month";
type ModalMode = "create" | "reschedule";

type ScheduleEvent = {
  item: AppointmentItem;
  startDate: Date;
  endDate: Date;
  barber: BarberItem | undefined;
  service: ServiceItem | undefined;
};

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 18;
const SLOT_HEIGHT = 64;
const COLOMBIA_PHONE_MAX_LENGTH = 10;

function getDaySlots() {
  return Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, index) => DAY_START_HOUR + index,
  );
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getViewRange(date: Date, viewMode: ViewMode) {
  if (viewMode === "day") {
    const from = startOfDay(date);
    return { from, to: addDays(from, 1) };
  }

  if (viewMode === "week") {
    const base = startOfDay(date);
    const mondayOffset = (base.getDay() + 6) % 7;
    const from = addDays(base, -mondayOffset);
    return { from, to: addDays(from, 7) };
  }

  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { from: monthStart, to: monthEnd };
}

function isWithinRange(date: Date, from: Date, to: Date) {
  return date >= from && date < to;
}

function formatPeriodLabel(selectedDate: Date, viewMode: ViewMode) {
  if (viewMode === "day") {
    return formatDateLabel(selectedDate);
  }

  if (viewMode === "week") {
    const { from, to } = getViewRange(selectedDate, "week");
    const weekEnd = addDays(to, -1);
    const formatter = new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
    });

    return `${formatter.format(from)} - ${formatter.format(weekEnd)}`;
  }

  return new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
  }).format(selectedDate);
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(date);
}

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);

  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTimeRange(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function parseApiDateTime(value: string) {
  // Backend can return naive timestamps (without timezone suffix).
  // Treat them as UTC to keep client rendering consistent across requests.
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

function getStatusLabel(status: number, labels: Record<string, string>) {
  switch (status) {
    case 1:
      return labels.Pending;
    case 2:
      return labels.Confirmed;
    case 3:
      return labels.Canceled;
    case 4:
      return labels.Completed;
    default:
      return labels.Unknown;
  }
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

function buildIsoDateTime(selectedDate: Date, hour: string) {
  const [hoursRaw, minutesRaw] = hour.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const next = new Date(selectedDate);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}

function isCurrentAppointment(now: Date, startDate: Date, endDate: Date) {
  return now >= startDate && now < endDate;
}

function getDesktopGridClass(columnCount: number) {
  switch (columnCount) {
    case 1:
      return "grid-cols-[80px_minmax(0,1fr)]";
    case 2:
      return "grid-cols-[80px_repeat(2,minmax(0,1fr))]";
    case 3:
      return "grid-cols-[80px_repeat(3,minmax(0,1fr))]";
    default:
      return "grid-cols-[80px_repeat(4,minmax(0,1fr))]";
  }
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function isNumericInput(value: string) {
  return /^\d+$/.test(value.trim());
}

function isPhoneLikeInput(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && !/[\p{L}]/u.test(trimmed) && /\d/.test(trimmed);
}

function customerDisplayName(customer: CustomerItem, unnamedLabel: string) {
  return customer.name || customer.phone || unnamedLabel;
}

export function ScheduleShell({ role }: ScheduleShellProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedBarberId, setSelectedBarberId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingAppointmentId, setEditingAppointmentId] = useState<
    string | null
  >(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<
    string | null
  >(null);
  const [dropTargetSlotKey, setDropTargetSlotKey] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");

  const [draftCustomerId, setDraftCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("");
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState("");
  const [draftServiceId, setDraftServiceId] = useState("");
  const [draftBarberId, setDraftBarberId] = useState("");
  const [draftHour, setDraftHour] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const { showToast } = useAppToast();
  const [logout, logoutState] = useLogoutMutation();
  const { Schedule, Common, Admin } = Texts;

  const viewRange = useMemo(
    () => getViewRange(selectedDate, viewMode),
    [selectedDate, viewMode],
  );
  const appointmentsRangeParams = useMemo(
    () => ({
      from: viewRange.from.toISOString(),
      to: viewRange.to.toISOString(),
    }),
    [viewRange.from, viewRange.to],
  );

  const appointmentsQuery = useGetAppointmentsQuery(appointmentsRangeParams);
  const barbersQuery = useGetBarbersQuery();
  const servicesQuery = useGetServicesQuery();
  const customersQuery = useGetCustomersQuery();
  const [createAppointment, createAppointmentState] =
    useCreateAppointmentMutation();
  const [createCustomer] = useCreateCustomerMutation();
  const debouncedCustomerQuery = useDebouncedValue(customerQuery, 3000);
  const customerSearchQuery = useGetCustomersSearchQuery(
    debouncedCustomerQuery,
    {
      skip:
        modalMode !== "create" ||
        !isModalOpen ||
        debouncedCustomerQuery.trim().length === 0,
    },
  );
  const [updateAppointmentStatus, updateAppointmentStatusState] =
    useUpdateAppointmentStatusMutation();
  const [rescheduleAppointment, rescheduleAppointmentState] =
    useRescheduleAppointmentMutation();
  const [cancelAppointment, cancelAppointmentState] =
    useCancelAppointmentMutation();

  const canAccessAdmin = hasPermission(role, "admin.access");
  const daySlots = useMemo(() => getDaySlots(), []);

  const barbers = useMemo(
    () => (barbersQuery.data ?? []).filter((barber) => barber.isActive),
    [barbersQuery.data],
  );

  const servicesById = useMemo(() => {
    const map = new Map<string, ServiceItem>();

    for (const service of servicesQuery.data ?? []) {
      map.set(service.id, service);
    }

    return map;
  }, [servicesQuery.data]);

  const customers = useMemo(
    () => customersQuery.data ?? [],
    [customersQuery.data],
  );

  const filteredCustomers = useMemo(() => {
    if (!customerQuery.trim()) {
      return [];
    }

    if (customerSearchQuery.data) {
      return customerSearchQuery.data.slice(0, 6);
    }

    return [];
  }, [customerQuery, customerSearchQuery.data]);

  const shouldCreateCustomerOnSubmit =
    modalMode === "create" &&
    customerQuery.trim().length > 0 &&
    !draftCustomerId &&
    !customerSearchQuery.isFetching &&
    !!customerSearchQuery.data &&
    customerSearchQuery.data.length === 0;
  const queryInputIsPhone = isNumericInput(customerQuery.trim());

  const appointments = useMemo(() => {
    const barberMap = new Map(barbers.map((barber) => [barber.id, barber]));
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (appointmentsQuery.data ?? [])
      .map((item) => {
        const startDate = parseApiDateTime(item.appointmentTime);
        const endDate = parseApiDateTime(item.endTime);

        return {
          item,
          startDate,
          endDate,
          barber: barberMap.get(item.barberId),
          service: servicesById.get(item.serviceId),
        } satisfies ScheduleEvent;
      })
      .filter((event) => {
        const matchesBarber =
          selectedBarberId === "all" ||
          event.item.barberId === selectedBarberId;
        const matchesSearch =
          !normalizedSearch ||
          event.item.customerName.toLowerCase().includes(normalizedSearch) ||
          event.item.serviceName.toLowerCase().includes(normalizedSearch) ||
          event.item.barberName.toLowerCase().includes(normalizedSearch);

        return matchesBarber && matchesSearch;
      })
      .sort(
        (left, right) => left.startDate.getTime() - right.startDate.getTime(),
      );
  }, [
    appointmentsQuery.data,
    barbers,
    searchTerm,
    selectedBarberId,
    servicesById,
  ]);

  const appointmentsForDayGrid = useMemo(
    () =>
      appointments.filter((event) => isSameDay(event.startDate, selectedDate)),
    [appointments, selectedDate],
  );

  const appointmentsInView = useMemo(
    () =>
      appointments.filter((event) =>
        isWithinRange(event.startDate, viewRange.from, viewRange.to),
      ),
    [appointments, viewRange.from, viewRange.to],
  );

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();

    for (const event of appointmentsInView) {
      const day = startOfDay(event.startDate);
      const key = day.toISOString();
      const current = map.get(key);
      if (current) {
        current.push(event);
      } else {
        map.set(key, [event]);
      }
    }

    return Array.from(map.entries())
      .sort(
        ([left], [right]) =>
          new Date(left).getTime() - new Date(right).getTime(),
      )
      .map(([dateKey, items]) => ({
        date: new Date(dateKey),
        items: [...items].sort(
          (left, right) => left.startDate.getTime() - right.startDate.getTime(),
        ),
      }));
  }, [appointmentsInView]);

  const effectiveSelectedAppointmentId = useMemo(() => {
    if (!appointmentsInView.length) {
      return null;
    }

    const exists = appointmentsInView.some(
      (appointment) => appointment.item.id === selectedAppointmentId,
    );

    return exists ? selectedAppointmentId : appointmentsInView[0].item.id;
  }, [appointmentsInView, selectedAppointmentId]);

  const selectedAppointment =
    appointmentsInView.find(
      (event) => event.item.id === effectiveSelectedAppointmentId,
    ) ?? null;

  const barbersToRender =
    selectedBarberId === "all"
      ? barbers.slice(0, 4)
      : barbers.filter((barber) => barber.id === selectedBarberId);

  const desktopGridClass = getDesktopGridClass(
    Math.max(barbersToRender.length, 1),
  );

  const selectedStatus = selectedAppointment?.item.status ?? null;
  const canEditSelected = selectedStatus === 1 || selectedStatus === 2;
  const canCheckInSelected = selectedStatus === 1;
  const canCancelSelected =
    selectedStatus !== null && selectedStatus !== 3 && selectedStatus !== 4;

  async function onLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Continue redirect even if API call fails.
    }

    showToast({
      title: Common.Toasts.LoggedOutTitle,
      description: Common.Toasts.LoggedOutDescription,
      variant: "info",
    });

    router.replace(APP_ROUTES.Login);
  }

  function shiftDay(direction: "back" | "next") {
    setSelectedDate((previous) => {
      const next = new Date(previous);

      if (viewMode === "day") {
        next.setDate(previous.getDate() + (direction === "back" ? -1 : 1));
        return next;
      }

      if (viewMode === "week") {
        next.setDate(previous.getDate() + (direction === "back" ? -7 : 7));
        return next;
      }

      next.setMonth(previous.getMonth() + (direction === "back" ? -1 : 1));
      return next;
    });
  }

  function openCreateModal() {
    const firstBarber = barbers[0];
    const firstService = servicesQuery.data?.[0];

    setModalMode("create");
    setEditingAppointmentId(null);
    setDraftBarberId(firstBarber?.id ?? "");
    setDraftServiceId(firstService?.id ?? "");
    setDraftCustomerId("");
    setCustomerQuery("");
    setSelectedCustomerName("");
    setSelectedCustomerPhone("");
    setDraftHour(`${DAY_START_HOUR.toString().padStart(2, "0")}:00`);
    setDraftNotes("");
    setIsModalOpen(true);
  }

  function openCreateModalFromSlot(barberId: string, hour: number) {
    const firstService = servicesQuery.data?.[0];

    setModalMode("create");
    setEditingAppointmentId(null);
    setDraftBarberId(barberId);
    setDraftServiceId(firstService?.id ?? "");
    setDraftCustomerId("");
    setCustomerQuery("");
    setSelectedCustomerName("");
    setSelectedCustomerPhone("");
    setDraftHour(`${hour.toString().padStart(2, "0")}:00`);
    setDraftNotes("");
    setIsModalOpen(true);
  }

  function openRescheduleModal() {
    if (!selectedAppointment) {
      return;
    }

    const localHours = selectedAppointment.startDate
      .getHours()
      .toString()
      .padStart(2, "0");
    const localMinutes = selectedAppointment.startDate
      .getMinutes()
      .toString()
      .padStart(2, "0");

    setModalMode("reschedule");
    setEditingAppointmentId(selectedAppointment.item.id);
    setDraftBarberId(selectedAppointment.item.barberId);
    setDraftServiceId(selectedAppointment.item.serviceId);
    setDraftCustomerId(selectedAppointment.item.customerId);
    setCustomerQuery(selectedAppointment.item.customerName);
    setSelectedCustomerName(selectedAppointment.item.customerName);
    setSelectedCustomerPhone("");
    setDraftHour(`${localHours}:${localMinutes}`);
    setDraftNotes(selectedAppointment.item.notes ?? "");
    setIsModalOpen(true);
  }

  function onPickCustomer(customer: CustomerItem) {
    setDraftCustomerId(customer.id);
    setCustomerQuery(customerDisplayName(customer, Schedule.Modal.Unnamed));
    setSelectedCustomerName(customer.name ?? "");
    setSelectedCustomerPhone(customer.phone ?? "");
  }

  async function onDropAppointmentToSlot(barberId: string, hour: number) {
    if (!draggingAppointmentId) {
      return;
    }

    const draggedEvent = appointmentsForDayGrid.find(
      (event) => event.item.id === draggingAppointmentId,
    );

    if (!draggedEvent) {
      setDraggingAppointmentId(null);
      return;
    }

    if (![1, 2].includes(draggedEvent.item.status)) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: Schedule.Messages.InvalidTime,
        variant: "error",
      });
      setDraggingAppointmentId(null);
      return;
    }

    const nextAppointmentDate = new Date(selectedDate);
    nextAppointmentDate.setHours(
      hour,
      draggedEvent.startDate.getMinutes(),
      0,
      0,
    );

    const draggedDurationMs =
      draggedEvent.endDate.getTime() - draggedEvent.startDate.getTime();
    const targetEndDate = new Date(nextAppointmentDate.getTime() + draggedDurationMs);

    const hasConflictInTargetBarber = appointmentsForDayGrid.some((event) => {
      if (event.item.id === draggedEvent.item.id) {
        return false;
      }

      if (event.item.barberId !== barberId) {
        return false;
      }

      if (![1, 2].includes(event.item.status)) {
        return false;
      }

      return nextAppointmentDate < event.endDate && targetEndDate > event.startDate;
    });

    if (hasConflictInTargetBarber) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: Schedule.Messages.DropConflict,
        variant: "error",
      });
      setDraggingAppointmentId(null);
      setDropTargetSlotKey(null);
      return;
    }

    try {
      await rescheduleAppointment({
        id: draggedEvent.item.id,
        appointmentTime: nextAppointmentDate.toISOString(),
        barberId,
        serviceId: draggedEvent.item.serviceId,
        notes: draggedEvent.item.notes,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Schedule.Messages.Rescheduled,
        variant: "success",
      });
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    } finally {
      setDraggingAppointmentId(null);
      setDropTargetSlotKey(null);
    }
  }

  async function onSubmitAppointmentModal() {
    const appointmentTime = buildIsoDateTime(selectedDate, draftHour);
    const notes = draftNotes.trim() || undefined;

    if (!appointmentTime) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: Schedule.Messages.InvalidTime,
        variant: "error",
      });
      return;
    }

    try {
      if (modalMode === "create") {
        if (!draftBarberId || !draftServiceId) {
          showToast({
            title: Common.Toasts.ErrorTitle,
            description: Schedule.Messages.CompleteRequired,
            variant: "error",
          });
          return;
        }

        let customerIdForAppointment = draftCustomerId;

        if (!customerIdForAppointment) {
          const normalizedInput = customerQuery.trim();

          if (!normalizedInput) {
            showToast({
              title: Common.Toasts.ErrorTitle,
              description: Schedule.Messages.CompleteRequired,
              variant: "error",
            });
            return;
          }

          const numericInput = isNumericInput(normalizedInput);
          const normalizedPhone = normalizePhone(normalizedInput);

          if (
            numericInput &&
            normalizedPhone.length !== COLOMBIA_PHONE_MAX_LENGTH
          ) {
            showToast({
              title: Common.Toasts.ErrorTitle,
              description: Schedule.Messages.InvalidPhoneLength,
              variant: "error",
            });
            return;
          }

          const existingMatch = customers.find((customer) => {
            const byPhone =
              numericInput &&
              normalizePhone(customer.phone ?? "") === normalizedPhone;
            const byName =
              !numericInput &&
              (customer.name ?? "").trim().toLowerCase() ===
                normalizedInput.toLowerCase();
            return byPhone || byName;
          });

          if (existingMatch) {
            customerIdForAppointment = existingMatch.id;
            setSelectedCustomerName(existingMatch.name ?? "");
            setSelectedCustomerPhone(existingMatch.phone ?? "");
          } else {
            if (!shouldCreateCustomerOnSubmit) {
              showToast({
                title: Common.Toasts.ErrorTitle,
                description: Schedule.Messages.CustomerSearchPending,
                variant: "error",
              });
              return;
            }

            const complementaryName = selectedCustomerName.trim();
            const complementaryPhone = normalizePhone(selectedCustomerPhone);

            if (numericInput && complementaryName.length === 0) {
              showToast({
                title: Common.Toasts.ErrorTitle,
                description: Schedule.Messages.ComplementaryNameRequired,
                variant: "error",
              });
              return;
            }

            if (
              !numericInput &&
              complementaryPhone.length !== COLOMBIA_PHONE_MAX_LENGTH
            ) {
              showToast({
                title: Common.Toasts.ErrorTitle,
                description: Schedule.Messages.ComplementaryPhoneRequired,
                variant: "error",
              });
              return;
            }

            const customerName = numericInput
              ? complementaryName
              : selectedCustomerName.trim() || normalizedInput;

            await createCustomer({
              name: customerName,
              phone: numericInput ? normalizedPhone : complementaryPhone,
              isActive: true,
            }).unwrap();

            const refreshed = await customersQuery.refetch();
            const created = (refreshed.data ?? []).find((customer) => {
              if (numericInput) {
                return normalizePhone(customer.phone ?? "") === normalizedPhone;
              }

              return (
                (customer.name ?? "").trim().toLowerCase() ===
                customerName.toLowerCase()
              );
            });

            if (!created) {
              throw new Error(
                "Customer was created but could not be reloaded.",
              );
            }

            customerIdForAppointment = created.id;
            setDraftCustomerId(created.id);
            setSelectedCustomerName(created.name ?? "");
            setSelectedCustomerPhone(created.phone ?? "");
            setCustomerQuery(
              customerDisplayName(created, Schedule.Modal.Unnamed),
            );
          }
        }

        await createAppointment({
          barberId: draftBarberId,
          serviceId: draftServiceId,
          customerId: customerIdForAppointment,
          appointmentTime,
          notes,
        }).unwrap();

        showToast({
          title: Common.Toasts.SuccessTitle,
          description: Schedule.Messages.Created,
          variant: "success",
        });
      } else {
        if (!editingAppointmentId) {
          return;
        }

        await rescheduleAppointment({
          id: editingAppointmentId,
          appointmentTime,
          barberId: draftBarberId || undefined,
          serviceId: draftServiceId || undefined,
          notes,
        }).unwrap();

        showToast({
          title: Common.Toasts.SuccessTitle,
          description: Schedule.Messages.Rescheduled,
          variant: "success",
        });
      }

      setIsModalOpen(false);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  async function onCheckInAppointment() {
    if (!selectedAppointment) {
      return;
    }

    try {
      await updateAppointmentStatus({
        id: selectedAppointment.item.id,
        status: 2,
        notes: selectedAppointment.item.notes,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Schedule.Messages.CheckedIn,
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

  async function onCancelAppointment() {
    if (!selectedAppointment) {
      return;
    }

    try {
      await cancelAppointment({
        id: selectedAppointment.item.id,
        notes: selectedAppointment.item.notes,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Schedule.Messages.Canceled,
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

  const isBusy =
    appointmentsQuery.isLoading ||
    barbersQuery.isLoading ||
    servicesQuery.isLoading ||
    customersQuery.isLoading ||
    createAppointmentState.isLoading ||
    rescheduleAppointmentState.isLoading ||
    updateAppointmentStatusState.isLoading ||
    cancelAppointmentState.isLoading;

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#09090b]/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-100 text-zinc-900 text-sm font-bold">
              BF
            </div>
            <h1 className="text-lg font-semibold tracking-tight">BarberFlow</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={Schedule.Filters.SearchPlaceholder}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={Schedule.Mobile.Alerts}
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-400" />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1360px] p-4">
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0f14]">
          <div className="border-b border-zinc-800 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span>Dashboard</span>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-zinc-100">Schedule</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
                >
                  <Plus className="h-4 w-4" />
                  {Schedule.Actions.NewAppointment}
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(APP_ROUTES.Dashboard)}
                >
                  {Common.Actions.BackToDashboard}
                </Button>
                {canAccessAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(APP_ROUTES.Admin)}
                  >
                    {Admin.Actions.OpenAdmin}
                  </Button>
                ) : null}
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={onLogout}
                  isLoading={logoutState.isLoading}
                  loadingText={Common.Actions.Loading}
                >
                  <>
                    <LogOut className="h-4 w-4" />
                    {Common.Actions.Logout}
                  </>
                </LoadingButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-zinc-700 bg-[#12151c] p-1">
                <button
                  type="button"
                  onClick={() => shiftDay("back")}
                  aria-label="Periodo anterior"
                  className="flex h-8 w-8 items-center justify-center rounded text-zinc-300 hover:bg-zinc-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date())}
                  className="px-3 text-sm font-medium text-zinc-100"
                >
                  {Schedule.Filters.Today}:{" "}
                  {formatPeriodLabel(selectedDate, viewMode)}
                </button>
                <button
                  type="button"
                  onClick={() => shiftDay("next")}
                  aria-label="Periodo siguiente"
                  className="flex h-8 w-8 items-center justify-center rounded text-zinc-300 hover:bg-zinc-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <select
                value={selectedBarberId}
                onChange={(event) => setSelectedBarberId(event.target.value)}
                className="h-10 min-w-[180px] rounded-lg border border-zinc-700 bg-[#12151c] px-3 text-sm text-zinc-100"
              >
                <option value="all">{Schedule.Filters.AllBarbers}</option>
                {barbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>
                    {barber.name}
                  </option>
                ))}
              </select>

              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={Schedule.Filters.SearchPlaceholder}
                  className="h-10 w-full rounded-lg border border-zinc-700 bg-[#12151c] pl-8 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
              </div>

              <div className="inline-flex rounded-lg border border-zinc-700 bg-[#12151c] p-1">
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs ${
                    viewMode === "day"
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-400"
                  }`}
                  onClick={() => setViewMode("day")}
                >
                  {Schedule.Filters.ViewDay}
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs ${
                    viewMode === "week"
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-400"
                  }`}
                  onClick={() => setViewMode("week")}
                >
                  {Schedule.Filters.ViewWeek}
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs ${
                    viewMode === "month"
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-400"
                  }`}
                  onClick={() => setViewMode("month")}
                >
                  {Schedule.Filters.ViewMonth}
                </button>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto">
              {viewMode === "day" ? (
                <div className="min-w-[860px]">
                  <div
                    className={`grid border-b border-zinc-800 ${desktopGridClass}`}
                  >
                    <div className="p-3 text-center text-[10px] uppercase tracking-widest text-zinc-500">
                      {Schedule.Grid.Timezone}
                    </div>
                    {barbersToRender.length ? (
                      barbersToRender.map((barber) => {
                        const appointmentCount = appointmentsForDayGrid.filter(
                          (event) => event.item.barberId === barber.id,
                        ).length;

                        return (
                          <div
                            key={barber.id}
                            className="border-l border-zinc-800 p-3 text-center"
                          >
                            <div className="text-sm font-semibold text-zinc-100">
                              {barber.name}
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              {appointmentCount} {Schedule.Grid.Bookings}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="border-l border-zinc-800 p-3 text-center text-xs text-zinc-500">
                        {Schedule.Empty.NoBarbers}
                      </div>
                    )}
                  </div>

                  {daySlots.map((hour) => (
                    <div
                      key={hour}
                      className={`grid border-b border-zinc-800 ${desktopGridClass}`}
                    >
                      <div className="p-2 text-right text-xs text-zinc-500">
                        {formatHourLabel(hour)}
                      </div>

                      {barbersToRender.length ? (
                        barbersToRender.map((barber) => {
                          const slotAppointments =
                            appointmentsForDayGrid.filter(
                              (event) =>
                                event.item.barberId === barber.id &&
                                event.startDate.getHours() === hour,
                            );
                          const slotKey = `${barber.id}-${hour}`;
                          const isDropTargetActive =
                            draggingAppointmentId !== null &&
                            dropTargetSlotKey === slotKey;

                          return (
                            <div
                              key={`${barber.id}-${hour}`}
                              className={`group/slot relative border-l border-zinc-800 ${
                                isDropTargetActive
                                  ? "bg-blue-500/10 ring-1 ring-inset ring-blue-500/60"
                                  : ""
                              }`}
                              style={{ minHeight: `${SLOT_HEIGHT}px` }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                setDropTargetSlotKey(slotKey);
                              }}
                              onDragLeave={() => {
                                setDropTargetSlotKey((current) =>
                                  current === slotKey ? null : current,
                                );
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                setDropTargetSlotKey(null);
                                void onDropAppointmentToSlot(barber.id, hour);
                              }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  openCreateModalFromSlot(barber.id, hour)
                                }
                                className={`absolute inset-0 z-0 ${
                                  draggingAppointmentId
                                    ? "pointer-events-none"
                                    : ""
                                }`}
                                aria-label={`${Schedule.Actions.NewAppointment} ${barber.name} ${formatHourLabel(hour)}`}
                              >
                                <span className="absolute right-2 top-2 opacity-0 transition group-hover/slot:opacity-100 text-zinc-600">
                                  <Plus className="h-4 w-4" />
                                </span>
                              </button>

                              <div className="relative z-10 p-1.5">
                                {slotAppointments.map((event) => {
                                  const active =
                                    effectiveSelectedAppointmentId ===
                                    event.item.id;
                                  const current = isCurrentAppointment(
                                    new Date(),
                                    event.startDate,
                                    event.endDate,
                                  );

                                  return (
                                    <button
                                      key={event.item.id}
                                      type="button"
                                      draggable={event.item.status === 1 || event.item.status === 2}
                                      onDragStart={() => {
                                        setDraggingAppointmentId(event.item.id);
                                        setDropTargetSlotKey(null);
                                      }}
                                      onDragEnd={() => {
                                        setDraggingAppointmentId(null);
                                        setDropTargetSlotKey(null);
                                      }}
                                      onClick={() =>
                                        setSelectedAppointmentId(event.item.id)
                                      }
                                      className={`w-full rounded border-l-4 p-2 text-left ${
                                        active
                                          ? "border-blue-500 bg-blue-500/20"
                                          : "border-amber-400 bg-zinc-900 hover:bg-zinc-800"
                                      } ${
                                        event.item.status === 1 ||
                                        event.item.status === 2
                                          ? "cursor-grab"
                                          : "cursor-default"
                                      }`}
                                    >
                                      <div className="text-[11px] font-bold text-zinc-200">
                                        {formatTimeRange(
                                          event.startDate,
                                          event.endDate,
                                        )}
                                      </div>
                                      <div className="text-xs font-semibold text-zinc-100 truncate">
                                        {event.item.customerName}
                                      </div>
                                      <div className="text-[11px] text-zinc-400 truncate">
                                        {event.item.serviceName}
                                      </div>
                                      {current ? (
                                        <span className="mt-1 inline-flex rounded bg-zinc-700 px-2 py-0.5 text-[10px] uppercase text-zinc-300">
                                          {Schedule.Grid.Current}
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="border-l border-zinc-800 p-2 text-xs text-zinc-500">
                          {Schedule.Empty.NoData}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  {appointmentsByDay.length ? (
                    <div className="space-y-4">
                      {appointmentsByDay.map((group) => (
                        <section
                          key={group.date.toISOString()}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/40"
                        >
                          <header className="border-b border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 capitalize">
                            {formatDateLabel(group.date)}
                          </header>
                          <div className="divide-y divide-zinc-800">
                            {group.items.map((event) => {
                              const active =
                                effectiveSelectedAppointmentId ===
                                event.item.id;

                              return (
                                <button
                                  key={event.item.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedAppointmentId(event.item.id)
                                  }
                                  className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left ${
                                    active
                                      ? "bg-blue-500/10"
                                      : "hover:bg-zinc-800/60"
                                  }`}
                                >
                                  <div>
                                    <div className="text-sm font-semibold text-zinc-100">
                                      {event.item.customerName}
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                      {event.item.serviceName} ·{" "}
                                      {event.item.barberName}
                                    </div>
                                  </div>
                                  <div className="text-xs text-zinc-300">
                                    {formatTimeRange(
                                      event.startDate,
                                      event.endDate,
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                      {Schedule.Empty.NoData}
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside className="hidden border-l border-zinc-800 xl:block">
              <div className="border-b border-zinc-800 p-4 text-base font-semibold text-zinc-100">
                {Schedule.Details.Title}
              </div>

              <div className="space-y-4 p-4">
                {selectedAppointment ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-100">
                        {selectedAppointment.item.customerName
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-100">
                          {selectedAppointment.item.customerName}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {getStatusLabel(
                            selectedAppointment.item.status,
                            Schedule.Status,
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
                        <div className="mb-1 flex items-center gap-2 text-zinc-500">
                          <Scissors className="h-4 w-4" />
                          <span className="text-[11px] uppercase tracking-wide">
                            {Schedule.Details.Service}
                          </span>
                        </div>
                        <div className="text-zinc-100">
                          {selectedAppointment.item.serviceName}
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
                        <div className="mb-1 flex items-center gap-2 text-zinc-500">
                          <Calendar className="h-4 w-4" />
                          <span className="text-[11px] uppercase tracking-wide">
                            {Schedule.Details.Schedule}
                          </span>
                        </div>
                        <div className="text-zinc-100">
                          {formatTimeRange(
                            selectedAppointment.startDate,
                            selectedAppointment.endDate,
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
                        <div className="mb-1 flex items-center gap-2 text-zinc-500">
                          <Users className="h-4 w-4" />
                          <span className="text-[11px] uppercase tracking-wide">
                            {Schedule.Details.Barber}
                          </span>
                        </div>
                        <div className="text-zinc-100">
                          {selectedAppointment.item.barberName}
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
                        <div className="mb-1 flex items-center gap-2 text-zinc-500">
                          <Clock3 className="h-4 w-4" />
                          <span className="text-[11px] uppercase tracking-wide">
                            {Schedule.Details.Notes}
                          </span>
                        </div>
                        <div className="text-zinc-300">
                          {selectedAppointment.item.notes ||
                            Schedule.Details.NoNotes}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openRescheduleModal}
                        disabled={
                          rescheduleAppointmentState.isLoading ||
                          !canEditSelected
                        }
                      >
                        {Schedule.Actions.Reschedule}
                      </Button>
                      <Button
                        size="sm"
                        onClick={onCheckInAppointment}
                        disabled={
                          updateAppointmentStatusState.isLoading ||
                          !canCheckInSelected
                        }
                      >
                        {Schedule.Actions.CheckIn}
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancelAppointment}
                      disabled={
                        cancelAppointmentState.isLoading || !canCancelSelected
                      }
                      className="text-red-400 hover:text-red-300"
                    >
                      {Schedule.Actions.CancelAppointment}
                    </Button>
                  </>
                ) : (
                  <div className="text-sm text-zinc-500">
                    {Schedule.Empty.SelectAppointment}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={openCreateModal}
        className="fixed bottom-24 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl xl:hidden"
      >
        <Plus className="h-5 w-5" />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-[#09090b]/95 px-4 py-2 backdrop-blur xl:hidden">
        <div className="flex items-center justify-around">
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-zinc-500"
            onClick={() => router.push(APP_ROUTES.Dashboard)}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="text-[10px]">{Schedule.Mobile.Home}</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-zinc-100"
          >
            <Calendar className="h-4 w-4" />
            <span className="text-[10px]">{Schedule.Mobile.Schedule}</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-zinc-500"
          >
            <UserRound className="h-4 w-4" />
            <span className="text-[10px]">{Schedule.Mobile.Clients}</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-zinc-500"
          >
            <Bell className="h-4 w-4" />
            <span className="text-[10px]">{Schedule.Mobile.Alerts}</span>
          </button>
        </div>
      </nav>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-[520px] overflow-hidden rounded border border-zinc-700 bg-[#17191e] shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-700 p-6">
              <h2 className="text-3xl font-bold text-zinc-100">
                {modalMode === "create"
                  ? Schedule.Modal.Title
                  : Schedule.Modal.RescheduleTitle}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Cerrar modal"
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-7 w-7" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {Schedule.Modal.Customer}
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(event) => {
                      const nextRaw = event.target.value;
                      if (isPhoneLikeInput(nextRaw)) {
                        const normalized = normalizePhone(nextRaw).slice(
                          0,
                          COLOMBIA_PHONE_MAX_LENGTH,
                        );
                        setCustomerQuery(normalized);
                      } else {
                        setCustomerQuery(nextRaw);
                      }

                      setDraftCustomerId("");
                      setSelectedCustomerName("");
                      setSelectedCustomerPhone("");
                    }}
                    placeholder={Schedule.Modal.CustomerSearchPlaceholder}
                    className="h-12 w-full rounded border border-zinc-700 bg-[#0f1115] pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                    disabled={modalMode === "reschedule"}
                  />
                </div>

                {modalMode === "create" &&
                isNumericInput(customerQuery) &&
                customerQuery.length === COLOMBIA_PHONE_MAX_LENGTH ? (
                  <p className="text-[11px] text-zinc-500">
                    {Schedule.Modal.PhoneLengthOk}
                  </p>
                ) : null}

                {modalMode === "create" &&
                isNumericInput(customerQuery) &&
                customerQuery.length > 0 &&
                customerQuery.length < COLOMBIA_PHONE_MAX_LENGTH ? (
                  <p className="text-[11px] text-amber-300">
                    {Schedule.Modal.PhoneLengthHint}
                  </p>
                ) : null}

                {modalMode === "create" && draftCustomerId ? (
                  <div className="rounded border border-zinc-700 bg-[#101218] p-2.5 text-xs text-zinc-300">
                    <p>
                      {Schedule.Modal.SelectedCustomerName}:{" "}
                      {selectedCustomerName || "-"}
                    </p>
                    <p>
                      {Schedule.Modal.SelectedCustomerPhone}:{" "}
                      {selectedCustomerPhone || "-"}
                    </p>
                  </div>
                ) : null}

                {modalMode === "create" &&
                customerQuery.trim().length > 0 &&
                filteredCustomers.length ? (
                  <div className="max-h-40 space-y-1 overflow-auto rounded border border-zinc-700 bg-[#101218] p-1">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => onPickCustomer(customer)}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-zinc-800"
                      >
                        <span className="text-sm text-zinc-100">
                          {customerDisplayName(
                            customer,
                            Schedule.Modal.Unnamed,
                          )}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {customer.phone || "-"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {modalMode === "create" &&
                customerQuery.trim().length > 0 &&
                customerSearchQuery.isFetching ? (
                  <p className="text-xs text-zinc-500">
                    {Schedule.Modal.SearchingCustomers}
                  </p>
                ) : null}

                {modalMode === "create" &&
                customerQuery.trim().length > 0 &&
                !customerSearchQuery.isFetching &&
                customerSearchQuery.data &&
                customerSearchQuery.data.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      {Schedule.Modal.NoCustomerResults}
                    </p>

                    {queryInputIsPhone ? (
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-widest text-zinc-500">
                          {Schedule.Modal.ComplementaryNameLabel}
                        </label>
                        <input
                          type="text"
                          value={selectedCustomerName}
                          onChange={(event) =>
                            setSelectedCustomerName(event.target.value)
                          }
                          placeholder={
                            Schedule.Modal.ComplementaryNamePlaceholder
                          }
                          autoFocus
                          className="h-10 w-full rounded border border-zinc-700 bg-[#0f1115] px-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-widest text-zinc-500">
                          {Schedule.Modal.ComplementaryPhoneLabel}
                        </label>
                        <input
                          type="text"
                          value={selectedCustomerPhone}
                          onChange={(event) =>
                            setSelectedCustomerPhone(
                              normalizePhone(event.target.value).slice(
                                0,
                                COLOMBIA_PHONE_MAX_LENGTH,
                              ),
                            )
                          }
                          placeholder={
                            Schedule.Modal.ComplementaryPhonePlaceholder
                          }
                          autoFocus
                          className="h-10 w-full rounded border border-zinc-700 bg-[#0f1115] px-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                        />
                        {selectedCustomerPhone.length > 0 &&
                        selectedCustomerPhone.length <
                          COLOMBIA_PHONE_MAX_LENGTH ? (
                          <p className="text-[11px] text-amber-300">
                            {Schedule.Modal.PhoneLengthHint}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {Schedule.Modal.Service}
                </label>
                <select
                  value={draftServiceId}
                  onChange={(event) => setDraftServiceId(event.target.value)}
                  className="h-12 w-full rounded border border-zinc-700 bg-[#0f1115] px-3 text-sm text-zinc-100"
                >
                  {(servicesQuery.data ?? []).map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} - {service.durationMinutes}m
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    {Schedule.Modal.Barber}
                  </label>
                  <select
                    value={draftBarberId}
                    onChange={(event) => setDraftBarberId(event.target.value)}
                    className="h-12 w-full rounded border border-zinc-700 bg-[#0f1115] px-3 text-sm text-zinc-100"
                  >
                    {barbers.map((barber) => (
                      <option key={barber.id} value={barber.id}>
                        {barber.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    {Schedule.Modal.Time}
                  </label>
                  <div className="relative">
                    <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="time"
                      value={draftHour}
                      onChange={(event) => setDraftHour(event.target.value)}
                      className="h-12 w-full rounded border border-zinc-700 bg-[#0f1115] pl-9 pr-3 text-sm text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  {Schedule.Modal.Notes}
                </label>
                <textarea
                  value={draftNotes}
                  onChange={(event) => setDraftNotes(event.target.value)}
                  rows={4}
                  placeholder={Schedule.Modal.NotesPlaceholder}
                  className="w-full rounded border border-zinc-700 bg-[#0f1115] p-3 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-700 bg-[#14161b] p-6">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                {Schedule.Actions.Cancel}
              </Button>
              <button
                type="button"
                onClick={onSubmitAppointmentModal}
                disabled={
                  createAppointmentState.isLoading ||
                  rescheduleAppointmentState.isLoading
                }
                className="inline-flex items-center rounded bg-[#d4af37] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#c09f33] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {modalMode === "create"
                  ? Schedule.Actions.CreateAppointment
                  : Schedule.Actions.SaveReschedule}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isBusy ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-40 rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-xs text-zinc-400 backdrop-blur">
          {Common.Actions.Loading}
        </div>
      ) : null}
    </main>
  );
}
