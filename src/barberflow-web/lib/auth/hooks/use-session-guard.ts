"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGetSessionQuery } from "@/lib/api/authApi";
import { AppPermission, hasPermission } from "@/lib/auth/permissions";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { useAppToast } from "@/lib/toast/toast-provider";

type UseSessionGuardOptions = {
  requiredPermission?: AppPermission;
};

export function useSessionGuard(options?: UseSessionGuardOptions) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const hasHandledGuard = useRef(false);
  const { Common } = Texts;
  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();

  const isAuthenticated = session?.authenticated ?? false;
  const role = session?.role ?? null;
  const barbershopId = session?.barbershopId ?? null;
  const hasAccess = options?.requiredPermission
    ? hasPermission(role, options.requiredPermission)
    : true;

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

    if (isAuthenticated && !hasAccess && !hasHandledGuard.current) {
      hasHandledGuard.current = true;
      showToast({
        title: Common.Toasts.ErrorTitle,
        description: "No tienes permisos para acceder a esta seccion.",
        variant: "error",
      });
      router.replace(APP_ROUTES.Dashboard);
    }
  }, [
    Common.Toasts.ErrorTitle,
    Common.Toasts.SessionExpiredDescription,
    Common.Toasts.SessionExpiredTitle,
    hasAccess,
    isAuthenticated,
    isSessionLoading,
    router,
    showToast,
  ]);

  return {
    isSessionLoading,
    isAuthenticated,
    hasAccess,
    role,
    barbershopId,
  };
}
