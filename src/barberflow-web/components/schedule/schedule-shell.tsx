"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
  Plus,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LoadingButton } from "@/components/ui/loading-button";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
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
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";

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
const APPOINTMENT_STATUS_COMPLETED = 4;

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

function to12HourLabel(value: string) {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return value;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function parse12HourTimeInput(value: string) {
  const trimmed = value.trim().toLowerCase();

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match) {
    const rawHours = Number(match[1]);
    const minutes = Number(match[2] ?? "0");
    const period = match[3];

    if (
      Number.isNaN(rawHours) ||
      Number.isNaN(minutes) ||
      rawHours < 1 ||
      rawHours > 12 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    let hours = rawHours % 12;
    if (period === "pm") {
      hours += 12;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  const fallback24h = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (fallback24h) {
    const hours = Number(fallback24h[1]);
    const minutes = Number(fallback24h[2]);
    if (
      !Number.isNaN(hours) &&
      !Number.isNaN(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }
  }

  return null;
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
  const [selectedBarberId] = useState<string>("all");
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
  const [draftHourInput, setDraftHourInput] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);

  const timePickerRef = useRef<HTMLDivElement | null>(null);

  const { showToast } = useAppToast();
  const [logout, logoutState] = useLogoutMutation();
  const { Schedule, Common, SharedShell, Dashboard } = Texts;

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

  const selectedStatus = selectedAppointment?.item.status ?? null;
  const canEditSelected = selectedStatus === 1 || selectedStatus === 2;
  const canCheckInSelected = selectedStatus === 1;
  const canCompleteSelected = selectedStatus === 2;
  const canCancelSelected =
    selectedStatus !== null && selectedStatus !== 3 && selectedStatus !== 4;

  const timeOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];

    for (let hour = DAY_START_HOUR; hour <= DAY_END_HOUR; hour += 1) {
      for (const minutes of [0, 15, 30, 45]) {
        const value = `${hour.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`;
        options.push({ value, label: to12HourLabel(value) });
      }
    }

    return options;
  }, []);

  useEffect(() => {
    if (!isTimePickerOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        timePickerRef.current &&
        !timePickerRef.current.contains(event.target as Node)
      ) {
        setIsTimePickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isTimePickerOpen]);

  const dayEventsSorted = useMemo(
    () =>
      [...appointmentsForDayGrid].sort(
        (left, right) => left.startDate.getTime() - right.startDate.getTime(),
      ),
    [appointmentsForDayGrid],
  );

  const nextEvent = useMemo(() => {
    const now = new Date();
    return (
      dayEventsSorted.find(
        (event) => event.endDate.getTime() >= now.getTime(),
      ) ??
      dayEventsSorted[0] ??
      null
    );
  }, [dayEventsSorted]);

  const desktopBarbers = useMemo(
    () => barbersToRender.slice(0, 3),
    [barbersToRender],
  );
  const desktopGridClass = getDesktopGridClass(
    Math.max(desktopBarbers.length, 1),
  );

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
    setDraftHourInput(
      to12HourLabel(`${DAY_START_HOUR.toString().padStart(2, "0")}:00`),
    );
    setDraftNotes("");
    setIsTimePickerOpen(false);
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
    const hourValue = `${hour.toString().padStart(2, "0")}:00`;
    setDraftHour(hourValue);
    setDraftHourInput(to12HourLabel(hourValue));
    setDraftNotes("");
    setIsTimePickerOpen(false);
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
    const hourValue = `${localHours}:${localMinutes}`;
    setDraftHour(hourValue);
    setDraftHourInput(to12HourLabel(hourValue));
    setDraftNotes(selectedAppointment.item.notes ?? "");
    setIsTimePickerOpen(false);
    setIsModalOpen(true);
  }

  function openEditModalByAppointment(appointmentId: string) {
    const event = appointmentsInView.find(
      (item) => item.item.id === appointmentId,
    );
    if (!event) {
      return;
    }

    setSelectedAppointmentId(appointmentId);
    const localHours = event.startDate.getHours().toString().padStart(2, "0");
    const localMinutes = event.startDate
      .getMinutes()
      .toString()
      .padStart(2, "0");
    const hourValue = `${localHours}:${localMinutes}`;

    setModalMode("reschedule");
    setEditingAppointmentId(event.item.id);
    setDraftBarberId(event.item.barberId);
    setDraftServiceId(event.item.serviceId);
    setDraftCustomerId(event.item.customerId);
    setCustomerQuery(event.item.customerName);
    setSelectedCustomerName(event.item.customerName);
    setSelectedCustomerPhone("");
    setDraftHour(hourValue);
    setDraftHourInput(to12HourLabel(hourValue));
    setDraftNotes(event.item.notes ?? "");
    setIsTimePickerOpen(false);
    setIsModalOpen(true);
  }

  async function onCancelAppointmentById(
    appointmentId: string,
    notes?: string,
  ) {
    try {
      await cancelAppointment({
        id: appointmentId,
        notes,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Schedule.Messages.Canceled,
        variant: "success",
      });

      setIsModalOpen(false);
      setIsCancelConfirmOpen(false);
    } catch (error) {
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? Common.Status.Error,
        variant: "error",
      });
    }
  }

  function requestCancelAppointment() {
    if (modalMode !== "reschedule" || !editingAppointmentId) {
      return;
    }

    setIsCancelConfirmOpen(true);
  }

  async function confirmCancelAppointment() {
    if (!editingAppointmentId) {
      return;
    }

    await onCancelAppointmentById(
      editingAppointmentId,
      draftNotes.trim() || undefined,
    );
  }

  const editingAppointmentEvent = useMemo(
    () =>
      editingAppointmentId
        ? (appointmentsInView.find(
            (event) => event.item.id === editingAppointmentId,
          ) ?? null)
        : null,
    [appointmentsInView, editingAppointmentId],
  );

  function onSelectTimeOption(value: string) {
    setDraftHour(value);
    setDraftHourInput(to12HourLabel(value));
    setIsTimePickerOpen(false);
  }

  function onTimeInputBlur() {
    const parsed = parse12HourTimeInput(draftHourInput);

    if (parsed) {
      setDraftHour(parsed);
      setDraftHourInput(to12HourLabel(parsed));
      return;
    }

    setDraftHourInput(to12HourLabel(draftHour));
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
    const targetEndDate = new Date(
      nextAppointmentDate.getTime() + draggedDurationMs,
    );

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

      return (
        nextAppointmentDate < event.endDate && targetEndDate > event.startDate
      );
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

  async function onCompleteAppointment() {
    if (!selectedAppointment) {
      return;
    }

    try {
      await updateAppointmentStatus({
        id: selectedAppointment.item.id,
        status: APPOINTMENT_STATUS_COMPLETED,
        notes: selectedAppointment.item.notes,
      }).unwrap();

      showToast({
        title: Common.Toasts.SuccessTitle,
        description: Schedule.Messages.Completed,
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
    <>
      <RoleWorkspaceShell
        canOperate
        disabledMessage={Schedule.Empty.NoData}
        role={role}
        activeItemId="schedule"
        onNavigate={(href) => router.push(href)}
        brandTitle={SharedShell.BrandName}
        brandSubtitle={SharedShell.ManagementSubtitle}
        desktopSidebarFooter={
          <>
            <div className="mb-3 flex items-center gap-3 p-2">
              <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-600" />
              <div className="overflow-hidden">
                <p className="truncate text-sm font-medium">
                  {SharedShell.DemoOwnerName}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {SharedShell.DemoOwnerRole}
                </p>
              </div>
            </div>
            <LoadingButton
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onLogout}
              isLoading={logoutState.isLoading}
              loadingText={Common.Actions.Loading}
            >
              <>
                <LogOut className="h-4 w-4" />
                {Common.Actions.Logout}
              </>
            </LoadingButton>
          </>
        }
        desktopHeader={
          <header className="flex h-16 items-center justify-between border-b border-slate-800 px-8">
            <div className="flex flex-1 items-center gap-6">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={Schedule.Filters.SearchPlaceholder}
                  className="w-96 border-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 rounded-lg bg-[#E8611C] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                {Schedule.Actions.NewAppointment}
              </button>
              <div className="mx-2 h-8 w-px bg-slate-800" />
              <button
                type="button"
                aria-label={Schedule.Mobile.Alerts}
                className="p-2 text-slate-400 transition hover:text-white"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>
        }
        desktopBody={
          <div className="flex min-h-0 flex-1 flex-col p-8">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="text-4xl font-black tracking-tight text-white">
                  {Schedule.Header.DesktopTitle}
                </h2>
                <p className="mt-1 text-slate-400">
                  {Schedule.Header.DesktopDescription}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-lg border border-slate-800 bg-[#262626] p-1">
                  <button
                    type="button"
                    onClick={() => shiftDay("back")}
                    className="rounded p-1 hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDate(new Date())}
                    className="px-3 py-1 text-sm font-medium"
                  >
                    {Schedule.Filters.Today},{" "}
                    {formatPeriodLabel(selectedDate, viewMode)}
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftDay("next")}
                    className="rounded p-1 hover:bg-slate-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center rounded-lg border border-slate-800 bg-[#262626] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("day")}
                    className={`rounded px-4 py-1 text-sm font-medium ${
                      viewMode === "day"
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {Schedule.Filters.ViewDay}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("week")}
                    className={`rounded px-4 py-1 text-sm font-medium ${
                      viewMode === "week"
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {Schedule.Filters.ViewWeek}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#262626] shadow-sm">
              <div
                className={`grid border-b border-slate-800 bg-slate-800/30 ${desktopGridClass}`}
              >
                <div className="flex items-center justify-center p-4 text-[10px] font-bold uppercase text-slate-500">
                  {Schedule.Grid.Timezone}
                </div>
                {desktopBarbers.length ? (
                  desktopBarbers.map((barber) => {
                    const appointmentCount = appointmentsForDayGrid.filter(
                      (event) => event.item.barberId === barber.id,
                    ).length;

                    return (
                      <div
                        key={barber.id}
                        className="border-l border-slate-800 p-4 text-center"
                      >
                        <div className="text-sm font-bold">{barber.name}</div>
                        <div className="text-[10px] uppercase text-slate-500">
                          {appointmentCount} {Schedule.Grid.Bookings}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border-l border-slate-800 p-4 text-xs text-slate-500">
                    {Schedule.Empty.NoBarbers}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#121212]">
                {daySlots.map((hour) => (
                  <div
                    key={hour}
                    className={`grid border-b border-slate-800/70 ${desktopGridClass}`}
                  >
                    <div className="flex items-start justify-center pt-2 text-xs font-medium text-slate-500">
                      {formatHourLabel(hour)}
                    </div>

                    {desktopBarbers.length ? (
                      desktopBarbers.map((barber) => {
                        const slotAppointments = appointmentsForDayGrid.filter(
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
                            className={`group/slot relative border-l border-slate-800 ${
                              isDropTargetActive
                                ? "bg-[#1e3a8a1f] ring-1 ring-inset ring-[#3b82f6]"
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
                              className={`absolute inset-0 ${
                                draggingAppointmentId
                                  ? "pointer-events-none"
                                  : ""
                              }`}
                              aria-label={`${Schedule.Actions.NewAppointment} ${barber.name} ${formatHourLabel(hour)}`}
                            >
                              <span className="absolute right-2 top-2 opacity-0 transition group-hover/slot:opacity-100 text-slate-500">
                                <Plus className="h-4 w-4" />
                              </span>
                            </button>

                            <div className="relative z-10 p-1.5">
                              {slotAppointments.map((event) => {
                                const active =
                                  effectiveSelectedAppointmentId ===
                                  event.item.id;

                                return (
                                  <button
                                    key={event.item.id}
                                    type="button"
                                    draggable={
                                      event.item.status === 1 ||
                                      event.item.status === 2
                                    }
                                    onDragStart={() => {
                                      setDraggingAppointmentId(event.item.id);
                                      setDropTargetSlotKey(null);
                                    }}
                                    onDragEnd={() => {
                                      setDraggingAppointmentId(null);
                                      setDropTargetSlotKey(null);
                                    }}
                                    onClick={() =>
                                      openEditModalByAppointment(event.item.id)
                                    }
                                    className={`w-full rounded border-l-4 p-2 text-left ${
                                      active
                                        ? "border-[#E8611C] bg-[#E8611C1f]"
                                        : event.item.status === 2
                                          ? "border-slate-500 bg-slate-800"
                                          : "border-[#E8611C] bg-[#2a1a12]"
                                    } ${
                                      event.item.status === 1 ||
                                      event.item.status === 2
                                        ? "cursor-grab"
                                        : "cursor-default"
                                    }`}
                                  >
                                    <div className="text-[11px] font-bold text-[#E8611C]">
                                      {formatTimeRange(
                                        event.startDate,
                                        event.endDate,
                                      )}
                                    </div>
                                    <div className="truncate text-xs font-bold text-white">
                                      {event.item.customerName}
                                    </div>
                                    <div className="truncate text-[10px] text-slate-400">
                                      {event.item.serviceName}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="border-l border-slate-800 p-2 text-xs text-slate-500">
                        {Schedule.Empty.NoData}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
        mobileHeader={
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#262626] bg-[#1a1a1ad9] px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#262626] text-xl font-bold">
                {SharedShell.BrandMonogram}
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">
                  {SharedShell.BrandName}
                </h1>
                <p className="text-xs text-slate-400">
                  {Schedule.Header.Title}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={Schedule.Mobile.Alerts}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#262626]"
            >
              <Bell className="h-4 w-4" />
            </button>
          </header>
        }
        mobileBody={
          <>
            <div className="flex items-center justify-between bg-[#1a1a1a] px-4 py-4">
              <button
                type="button"
                onClick={() => shiftDay("back")}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#262626]"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex flex-col items-center">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {Schedule.Filters.Today}
                </span>
                <span className="text-lg font-bold capitalize">
                  {formatDateLabel(selectedDate)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => shiftDay("next")}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#262626]"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <section className="px-4 py-2">
              <div className="overflow-hidden rounded-xl border border-[#262626] bg-[#1f1f1f] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-[#262626] px-2.5 py-1 text-[10px] font-bold uppercase tracking-tight text-slate-100">
                    {Schedule.Mobile.NextUp} -{" "}
                    {nextEvent
                      ? formatTimeRange(
                          nextEvent.startDate,
                          nextEvent.endDate,
                        ).split(" - ")[0]
                      : "--:--"}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    {nextEvent ? Schedule.Mobile.NextIn : Schedule.Empty.NoData}
                  </span>
                </div>

                <div className="mb-4 flex items-start gap-4">
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-[#323232]" />
                  <div className="flex-1">
                    <h3 className="text-lg font-bold leading-none">
                      {nextEvent?.item.customerName ?? Schedule.Empty.NoData}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {nextEvent?.item.serviceName ?? "-"}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#E8611C]">
                      {nextEvent
                        ? `${Math.max(15, Math.round((nextEvent.endDate.getTime() - nextEvent.startDate.getTime()) / 60000))} min`
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={onCheckInAppointment}
                    disabled={!canCheckInSelected}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg bg-[#E8611C] py-2 text-slate-100 transition active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-[10px] font-bold uppercase">
                      {Common.Actions.CheckIn}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onCompleteAppointment}
                    disabled={!canCompleteSelected}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-[#22c55e66] bg-[#22c55e1a] py-2 text-[#22c55e] transition active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-[10px] font-bold uppercase">
                      {Schedule.Actions.Complete}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onCancelAppointment}
                    disabled={!canCancelSelected}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-[#303030] bg-[#1a1a1a] py-2 transition active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-[10px] font-bold uppercase">
                      {Schedule.Actions.CancelAppointment}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={openRescheduleModal}
                    disabled={!canEditSelected}
                    className="flex flex-col items-center justify-center gap-1 rounded-lg border border-[#303030] bg-[#1a1a1a] py-2 transition active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-[10px] font-bold uppercase">
                      {Schedule.Actions.Reschedule}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-6 flex flex-col px-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold">
                  {Schedule.Mobile.TodaySchedule}
                </h2>
                <span className="text-xs text-slate-400">
                  {dayEventsSorted.length} {Schedule.Grid.Bookings}
                </span>
              </div>

              <div className="space-y-0">
                {dayEventsSorted.map((event) => {
                  const active =
                    effectiveSelectedAppointmentId === event.item.id;
                  const current = isCurrentAppointment(
                    new Date(),
                    event.startDate,
                    event.endDate,
                  );

                  return (
                    <div
                      key={event.item.id}
                      className="relative flex min-h-[84px] gap-4"
                    >
                      <div className="flex w-12 flex-col items-end pt-1">
                        <span
                          className={`text-xs font-bold ${active ? "text-[#E8611C]" : ""}`}
                        >
                          {new Intl.DateTimeFormat("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }).format(event.startDate)}
                        </span>
                      </div>
                      <div className="relative flex-1 pb-4">
                        <div className="absolute left-[-17px] top-2.5 z-10 h-2 w-2 rounded-full bg-slate-500 ring-4 ring-[#1a1a1a]" />
                        <div className="absolute left-[-13.5px] top-3 h-full w-[1px] bg-slate-800" />
                        <button
                          type="button"
                          onClick={() =>
                            openEditModalByAppointment(event.item.id)
                          }
                          className={`w-full rounded-lg border p-3 text-left ${
                            current
                              ? "border-[#E8611C44] border-l-4 border-l-[#E8611C] bg-[#E8611C14]"
                              : "border-slate-800 bg-[#202020]"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-bold">
                                {event.item.customerName}
                              </p>
                              <p className="text-xs text-slate-400">
                                {event.item.serviceName}
                              </p>
                            </div>
                            {current ? (
                              <span className="rounded-full bg-[#E8611C2a] px-2 py-0.5 text-[10px] font-bold uppercase text-[#E8611C]">
                                {Schedule.Grid.Current}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <button
              type="button"
              onClick={openCreateModal}
              className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8611C] text-slate-100 shadow-xl transition active:scale-90"
            >
              <Plus className="h-6 w-6" />
            </button>
          </>
        }
        mobileFooter={
          <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#262626] bg-[#1a1a1a] pb-6 pt-2">
            <div className="flex items-center justify-around px-4">
              <button
                type="button"
                className="flex flex-col items-center gap-1 text-[#E8611C]"
              >
                <Calendar className="h-4 w-4" />
                <p className="text-[10px] font-bold uppercase">
                  {Schedule.Mobile.Schedule}
                </p>
              </button>
              <button
                type="button"
                onClick={() => router.push(APP_ROUTES.Customers)}
                className="flex flex-col items-center gap-1 text-slate-400"
              >
                <UserRound className="h-4 w-4" />
                <p className="text-[10px] font-medium uppercase">
                  {Schedule.Mobile.Clients}
                </p>
              </button>
              <button
                type="button"
                onClick={() => router.push(APP_ROUTES.Payments)}
                className="flex flex-col items-center gap-1 text-slate-400"
              >
                <Clock3 className="h-4 w-4" />
                <p className="text-[10px] font-medium uppercase">
                  {Dashboard.Navigation.Payments}
                </p>
              </button>
              <button
                type="button"
                onClick={() => router.push(APP_ROUTES.Dashboard)}
                className="flex flex-col items-center gap-1 text-slate-400"
              >
                <Settings className="h-4 w-4" />
                <p className="text-[10px] font-medium uppercase">
                  {Schedule.Mobile.Home}
                </p>
              </button>
            </div>
          </nav>
        }
      />

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-[520px] overflow-hidden rounded border border-[#262626] bg-[#1c1c1c] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#262626] p-6">
              <h2 className="text-xl font-bold tracking-tight text-slate-100">
                {modalMode === "create"
                  ? Schedule.Modal.Title
                  : Schedule.Modal.RescheduleTitle}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setIsCancelConfirmOpen(false);
                }}
                aria-label="Cerrar modal"
                className="text-slate-400 transition hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {Schedule.Modal.Customer}
                </label>
                <div className="relative group">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 group-focus-within:text-[#E8611C]" />
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
                    className="h-12 w-full rounded border border-white/10 bg-[#121212] px-4 pl-11 text-sm text-slate-100 placeholder:text-slate-600 focus:border-[#E8611C] focus:outline-none focus:ring-1 focus:ring-[#E8611C]"
                    disabled={modalMode === "reschedule"}
                  />
                </div>

                {modalMode === "create" && draftCustomerId ? (
                  <div className="rounded border border-[#262626] bg-[#101218] p-2.5 text-xs text-slate-300">
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
                  <div className="max-h-40 space-y-1 overflow-auto rounded border border-[#262626] bg-[#101218] p-1">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => onPickCustomer(customer)}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-slate-800"
                      >
                        <span className="text-sm text-slate-100">
                          {customerDisplayName(
                            customer,
                            Schedule.Modal.Unnamed,
                          )}
                        </span>
                        <span className="text-xs text-slate-500">
                          {customer.phone || "-"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {modalMode === "create" &&
                customerQuery.trim().length > 0 &&
                customerSearchQuery.isFetching ? (
                  <p className="text-xs text-slate-500">
                    {Schedule.Modal.SearchingCustomers}
                  </p>
                ) : null}

                {modalMode === "create" &&
                customerQuery.trim().length > 0 &&
                !customerSearchQuery.isFetching &&
                customerSearchQuery.data &&
                customerSearchQuery.data.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      {Schedule.Modal.NoCustomerResults}
                    </p>
                    {queryInputIsPhone ? (
                      <input
                        type="text"
                        value={selectedCustomerName}
                        onChange={(event) =>
                          setSelectedCustomerName(event.target.value)
                        }
                        placeholder={
                          Schedule.Modal.ComplementaryNamePlaceholder
                        }
                        className="h-10 w-full rounded border border-white/10 bg-[#121212] px-3 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                    ) : (
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
                        className="h-10 w-full rounded border border-white/10 bg-[#121212] px-3 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                    )}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {Schedule.Modal.Service}
                </label>
                <select
                  value={draftServiceId}
                  onChange={(event) => setDraftServiceId(event.target.value)}
                  className="h-12 w-full rounded border border-white/10 bg-[#121212] px-4 text-sm text-slate-100"
                >
                  {(servicesQuery.data ?? []).map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} - {service.durationMinutes}m - $
                      {service.price}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {Schedule.Modal.Barber}
                  </label>
                  <select
                    value={draftBarberId}
                    onChange={(event) => setDraftBarberId(event.target.value)}
                    className="h-12 w-full rounded border border-white/10 bg-[#121212] px-4 text-sm text-slate-100"
                  >
                    {barbers.map((barber) => (
                      <option key={barber.id} value={barber.id}>
                        {barber.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {Schedule.Modal.Time}
                  </label>
                  <div ref={timePickerRef} className="relative">
                    <div className="relative flex items-center gap-3 rounded border border-[#262626] bg-[#121212] px-3">
                      <Clock3 className="h-4 w-4 text-[#E8611C]" />
                      <input
                        type="text"
                        value={draftHourInput}
                        onChange={(event) =>
                          setDraftHourInput(event.target.value)
                        }
                        onFocus={() => setIsTimePickerOpen(true)}
                        onBlur={onTimeInputBlur}
                        placeholder="10:45 AM"
                        className="h-12 w-full border-none bg-transparent text-sm text-slate-100 focus:outline-none"
                      />
                    </div>

                    {isTimePickerOpen ? (
                      <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-[#262626] bg-[#151515] shadow-2xl">
                        {timeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onSelectTimeOption(option.value)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-[#202020] ${
                              draftHour === option.value
                                ? "bg-[#E8611C1f] text-[#E8611C]"
                                : "text-slate-200"
                            }`}
                          >
                            <span>{option.label}</span>
                            {draftHour === option.value ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {Schedule.Modal.Notes}{" "}
                  <span className="normal-case text-slate-600">(Optional)</span>
                </label>
                <textarea
                  value={draftNotes}
                  onChange={(event) => setDraftNotes(event.target.value)}
                  rows={3}
                  placeholder={Schedule.Modal.NotesPlaceholder}
                  className="w-full rounded border border-white/10 bg-[#121212] p-3 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#262626] bg-[#141414] p-6">
              {modalMode === "create" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:text-white"
                  >
                    {Schedule.Actions.GoBack}
                  </button>
                  <button
                    type="button"
                    onClick={onSubmitAppointmentModal}
                    disabled={createAppointmentState.isLoading}
                    className="inline-flex items-center gap-2 rounded bg-[#E8611C] px-6 py-2.5 text-sm font-bold tracking-tight text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {Schedule.Actions.CreateAppointment}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={requestCancelAppointment}
                    disabled={cancelAppointmentState.isLoading}
                    className="inline-flex items-center gap-2 rounded border border-[#EF444466] bg-[#EF44441a] px-6 py-2.5 text-sm font-bold tracking-tight text-[#EF4444] transition hover:bg-[#EF444433] disabled:opacity-50"
                  >
                    {Schedule.Actions.CancelAppointment}
                  </button>
                  <button
                    type="button"
                    onClick={onSubmitAppointmentModal}
                    disabled={rescheduleAppointmentState.isLoading}
                    className="inline-flex items-center gap-2 rounded bg-[#E8611C] px-6 py-2.5 text-sm font-bold tracking-tight text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {Schedule.Actions.SaveReschedule}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:text-white"
                  >
                    {Schedule.Actions.GoBack}
                  </button>
                </>
              )}
            </div>
          </div>

          {isCancelConfirmOpen ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-[460px] rounded border border-[#2a2a2a] bg-[#171717] p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-slate-100">
                  {Schedule.Modal.CancelConfirmTitle}
                </h3>
                <p className="mt-3 text-sm text-slate-300">
                  {Schedule.Modal.CancelConfirmMessagePrefix} &quot;
                  {(editingAppointmentEvent?.item.customerName ??
                    customerQuery) ||
                    Schedule.Modal.Unnamed}
                  &quot;?
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCancelConfirmOpen(false)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:text-white"
                  >
                    {Schedule.Modal.CancelConfirmBack}
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmCancelAppointment()}
                    disabled={cancelAppointmentState.isLoading}
                    className="inline-flex items-center rounded bg-[#EF4444] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#dc2626] disabled:opacity-50"
                  >
                    {Schedule.Modal.CancelConfirmAccept}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isBusy ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-40 rounded-xl border border-slate-700 bg-[#111111] px-3 py-2 text-xs text-slate-400 backdrop-blur">
          {Common.Actions.Loading}
        </div>
      ) : null}
    </>
  );
}
