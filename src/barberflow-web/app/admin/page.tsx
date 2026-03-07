"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { APP_ROUTES } from "@/lib/config/app";
import { useAppToast } from "@/lib/toast/toast-provider";
import { Texts } from "@/lib/content/texts";
import { useGetSessionQuery } from "@/lib/api/authApi";
import { hasPermission } from "@/lib/auth/permissions";

export default function AdminPage() {
  const router = useRouter();
  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();
  const hasHandledGuard = useRef(false);
  const isAuthenticated = session?.authenticated ?? false;
  const userRole = session?.role ?? null;
  const barbershopId = session?.barbershopId ?? null;
  const hasAdminAccess = hasPermission(userRole, "admin.access");
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
      return;
    }

    if (!hasAdminAccess && !hasHandledGuard.current) {
      hasHandledGuard.current = true;
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: "No tienes permisos para acceder al panel de administracion.",
        variant: "error",
      });
      router.replace(APP_ROUTES.Dashboard);
    }
  }, [
    hasAdminAccess,
    isAuthenticated,
    isSessionLoading,
    router,
    showToast,
    Common.Toasts.ErrorTitle,
    Common.Toasts.SessionExpiredDescription,
    Common.Toasts.SessionExpiredTitle,
  ]);

  if (isSessionLoading || !isAuthenticated || !hasAdminAccess) {
    return null;
  }

  return <AdminShell role={userRole} barbershopId={barbershopId} />;
}
