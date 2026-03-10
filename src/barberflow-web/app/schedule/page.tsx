"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ScheduleShell } from "../../components/schedule";
import { APP_ROUTES } from "../../lib/config/app";
import { Texts } from "../../lib/content/texts";
import { useAppToast } from "../../lib/toast/toast-provider";
import { useGetSessionQuery } from "../../lib/api/authApi";

export default function SchedulePage() {
  const router = useRouter();
  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();
  const hasHandledGuard = useRef(false);
  const isAuthenticated = session?.authenticated ?? false;
  const role = session?.role ?? null;
  const { showToast } = useAppToast();
  const { Common } = Texts;

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!isAuthenticated && !hasHandledGuard.current) {
      hasHandledGuard.current = true;
      showToast({
        title: Common.Toasts.SessionExpiredTitle,
        description: Common.Toasts.SessionExpiredDescription,
        variant: "info",
      });
      router.replace(APP_ROUTES.Login);
    }
  }, [
    isAuthenticated,
    isSessionLoading,
    router,
    showToast,
    Common.Toasts.SessionExpiredDescription,
    Common.Toasts.SessionExpiredTitle,
  ]);

  if (isSessionLoading || !isAuthenticated) {
    return null;
  }

  return <ScheduleShell role={role} />;
}
