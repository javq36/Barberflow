"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { APP_ROUTES } from "@/lib/config/app";
import { clearAuthSession, getAuthSession } from "@/lib/auth/session";
import { useAppToast } from "@/lib/toast/toast-provider";
import { Texts } from "@/lib/content/texts";

export default function DashboardPage() {
  const router = useRouter();
  const [session] = useState(() => getAuthSession());
  const { showToast } = useAppToast();
  const { Common } = Texts;

  useEffect(() => {
    if (!session.isAuthenticated) {
      if (session.wasExpired) {
        showToast({
          title: Common.Toasts.SessionExpiredTitle,
          description: Common.Toasts.SessionExpiredDescription,
          variant: "info",
        });
      }

      clearAuthSession();
      router.replace(APP_ROUTES.Login);
      return;
    }

    if (!session.expiresAtMs) {
      return;
    }

    const expiresInMs = session.expiresAtMs - Date.now();
    const timeoutId = window.setTimeout(
      () => {
        clearAuthSession();
        showToast({
          title: Common.Toasts.SessionExpiredTitle,
          description: Common.Toasts.SessionExpiredDescription,
          variant: "info",
        });
        router.replace(APP_ROUTES.Login);
      },
      Math.max(expiresInMs, 0),
    );

    return () => window.clearTimeout(timeoutId);
  }, [
    router,
    session.expiresAtMs,
    session.isAuthenticated,
    session.wasExpired,
    showToast,
    Common.Toasts.SessionExpiredDescription,
    Common.Toasts.SessionExpiredTitle,
  ]);

  if (!session.isAuthenticated) {
    return null;
  }

  return <DashboardShell />;
}
