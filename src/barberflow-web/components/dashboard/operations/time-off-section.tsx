"use client";

import { FormEvent, useState } from "react";
import { CalendarOff, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { LoadingButton } from "@/components/ui/loading-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RoleWorkspaceShell } from "@/components/dashboard/operations/role-workspace-shell";
import {
  TimeOffItem,
  useCreateTimeOffMutation,
  useDeleteTimeOffMutation,
  useGetTimeOffQuery,
} from "@/lib/api/time-off-api";
import { useGetBarbersQuery, BarberItem } from "@/lib/api/owner-admin-api";
import { AppRole } from "@/lib/auth/permissions";
import { getApiErrorMessage } from "@/lib/api/error";
import { APP_ROUTES } from "@/lib/config/app";
import { useAppToast } from "@/lib/toast/toast-provider";
import { Texts } from "@/lib/content/texts";

const { TimeOff: T, Common, SharedShell } = Texts;

type TimeOffSectionProps = {
  canOperate: boolean;
  role: AppRole;
};

type FormErrors = {
  startDate?: string;
  endDate?: string;
};

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
  };
  const locale = "es-CO";
  if (startDate === endDate) {
    return start.toLocaleDateString(locale, options);
  }
  return `${start.toLocaleDateString(locale, options)} – ${end.toLocaleDateString(locale, options)}`;
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function validateForm(startDate: string, endDate: string): FormErrors {
  const errors: FormErrors = {};
  const today = getTodayString();

  if (!startDate) {
    errors.startDate = T.Validation.StartRequired;
  } else if (startDate < today) {
    errors.startDate = T.Validation.StartFuture;
  }

  if (!endDate) {
    errors.endDate = T.Validation.EndRequired;
  } else if (startDate && endDate < startDate) {
    errors.endDate = T.Validation.EndAfterStart;
  }

  return errors;
}

export function TimeOffSection({ canOperate, role }: TimeOffSectionProps) {
  const router = useRouter();
  const { showToast } = useAppToast();

  const barbersQuery = useGetBarbersQuery(undefined, { skip: !canOperate });
  const barbers = barbersQuery.data ?? [];

  const [selectedBarberId, setSelectedBarberId] = useState<string>("");
  const activeBarberId = selectedBarberId || barbers[0]?.id || "";

  const timeOffQuery = useGetTimeOffQuery(
    { barberId: activeBarberId },
    { skip: !canOperate || !activeBarberId },
  );
  const timeOffEntries = timeOffQuery.data ?? [];

  const [createTimeOff, createTimeOffState] = useCreateTimeOffMutation();
  const [deleteTimeOff, deleteTimeOffState] = useDeleteTimeOffMutation();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const today = getTodayString();

  function resetForm() {
    setStartDate("");
    setEndDate("");
    setReason("");
    setFormErrors({});
  }

  function getSelectedBarber(): BarberItem | undefined {
    return barbers.find((b) => b.id === activeBarberId);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateForm(startDate, endDate);
    if (errors.startDate || errors.endDate) {
      setFormErrors(errors);
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: errors.startDate ?? errors.endDate ?? T.Validation.InvalidData,
        variant: "error",
      });
      return;
    }

    setFormErrors({});

    try {
      await createTimeOff({
        barberId: activeBarberId,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
      }).unwrap();

      resetForm();
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: T.Toast.CreateSuccess,
        variant: "success",
      });
    } catch (error) {
      const status =
        error &&
        typeof error === "object" &&
        "status" in error
          ? (error as { status: number }).status
          : null;

      const message =
        status === 409
          ? T.Toast.CreateConflict
          : (getApiErrorMessage(error) ?? T.Toast.CreateError);

      showToast({
        title: Common.Toasts.ErrorTitle,
        description: message,
        variant: "error",
      });
    }
  }

  async function onConfirmDelete() {
    if (!deleteCandidateId) return;

    try {
      await deleteTimeOff({
        barberId: activeBarberId,
        id: deleteCandidateId,
      }).unwrap();

      setDeleteCandidateId(null);
      showToast({
        title: Common.Toasts.SuccessTitle,
        description: T.Toast.DeleteSuccess,
        variant: "success",
      });
    } catch (error) {
      setDeleteCandidateId(null);
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: getApiErrorMessage(error) ?? T.Toast.DeleteError,
        variant: "error",
      });
    }
  }

  const selectedBarber = getSelectedBarber();

  const barberSelectorBlock = (
    <div className="mb-6">
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
        {T.BarberLabel}
      </label>
      <select
        value={activeBarberId}
        onChange={(e) => setSelectedBarberId(e.target.value)}
        className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100"
      >
        {barbers.map((barber) => (
          <option key={barber.id} value={barber.id}>
            {barber.name}
          </option>
        ))}
      </select>
    </div>
  );

  const addFormBlock = (
    <div className="mb-8 rounded-xl border border-slate-800 bg-slate-800/10 p-6">
      <h3 className="mb-4 text-lg font-bold">{T.AddFormTitle}</h3>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">
              {T.StartDateLabel} <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              min={today}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (formErrors.startDate) {
                  setFormErrors((prev) => ({ ...prev, startDate: undefined }));
                }
              }}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 ${
                formErrors.startDate
                  ? "border-red-500 bg-red-950/20"
                  : "border-slate-700 bg-slate-800/50"
              }`}
            />
            {formErrors.startDate ? (
              <p className="mt-1 text-xs text-red-400">{formErrors.startDate}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">
              {T.EndDateLabel} <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              min={startDate || today}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (formErrors.endDate) {
                  setFormErrors((prev) => ({ ...prev, endDate: undefined }));
                }
              }}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-100 ${
                formErrors.endDate
                  ? "border-red-500 bg-red-950/20"
                  : "border-slate-700 bg-slate-800/50"
              }`}
            />
            {formErrors.endDate ? (
              <p className="mt-1 text-xs text-red-400">{formErrors.endDate}</p>
            ) : null}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">
            {T.ReasonLabel}{" "}
            <span className="text-xs font-normal text-slate-500">{T.ReasonOptional}</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={T.ReasonPlaceholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="flex justify-end">
          <LoadingButton
            type="submit"
            isLoading={createTimeOffState.isLoading}
            loadingText={T.Actions.Saving}
            className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900"
          >
            <Plus className="h-4 w-4" />
            {T.Actions.Add}
          </LoadingButton>
        </div>
      </form>
    </div>
  );

  const listBlock = (
    <div className="rounded-xl border border-slate-800 bg-slate-800/10">
      <div className="border-b border-slate-800 px-6 py-4">
        <h3 className="text-lg font-bold">
          {T.ListTitle}
          {selectedBarber ? (
            <span className="ml-2 text-sm font-normal text-slate-400">
              — {selectedBarber.name}
            </span>
          ) : null}
        </h3>
      </div>

      {timeOffQuery.isLoading ? (
        <div className="px-6 py-8 text-center text-sm text-slate-400">
          {T.Loading}
        </div>
      ) : timeOffEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <CalendarOff className="h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">
            {T.Empty}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800">
          {timeOffEntries.map((entry: TimeOffItem) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-6 py-4"
            >
              <div>
                <p className="font-semibold">
                  {formatDateRange(entry.startDate, entry.endDate)}
                </p>
                {entry.reason ? (
                  <p className="mt-0.5 text-sm text-slate-400">{entry.reason}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDeleteCandidateId(entry.id)}
                disabled={deleteTimeOffState.isLoading}
                className="rounded-lg border border-slate-700 p-2 text-red-400 transition hover:bg-red-900/20 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const desktopBody = (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mb-8">
        <h2 className="mb-2 text-3xl font-black">{T.PageTitle}</h2>
        <p className="text-slate-400">
          {T.PageDescription}
        </p>
      </div>
      {barberSelectorBlock}
      {addFormBlock}
      {listBlock}
    </div>
  );

  return (
    <>
      <RoleWorkspaceShell
        canOperate={canOperate}
        disabledMessage={T.DisabledMessage}
        role={role}
        activeItemId="time-off"
        onNavigate={(href) => router.push(href)}
        brandTitle={SharedShell.BrandName}
        brandSubtitle={T.BrandSubtitle}
        desktopHeader={
          <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-[#191919]/50 px-8 backdrop-blur-md">
            <h1 className="text-xl font-bold">{T.PageTitle}</h1>
          </header>
        }
        desktopBody={desktopBody}
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
              <h1 className="text-xl font-bold">{T.PageTitle}</h1>
            </div>
          </header>
        }
        mobileBody={
          <main className="flex-1 overflow-y-auto p-4 pb-24">
            {barberSelectorBlock}
            {addFormBlock}
            {listBlock}
          </main>
        }
        mobileFooter={<div />}
      />

      <ConfirmDialog
        open={Boolean(deleteCandidateId)}
        title={T.Dialog.Title}
        description={T.Dialog.Description}
        confirmLabel={T.Actions.Delete}
        cancelLabel={T.Actions.Cancel}
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteCandidateId(null)}
      />
    </>
  );
}
