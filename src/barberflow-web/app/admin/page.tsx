"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { APP_ROUTES } from "@/lib/config/app";
import { useAppToast } from "@/lib/toast/toast-provider";
import { Texts } from "@/lib/content/texts";
import { useGetSessionQuery, useLogoutMutation } from "@/lib/api/authApi";

export default function AdminPage() {
  const router = useRouter();
  const { data: session, isLoading: isSessionLoading } = useGetSessionQuery();
  const [logout] = useLogoutMutation();
  const isAuthenticated = session?.authenticated ?? false;
  const { showToast } = useAppToast();
  const { Common } = Texts;

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!isAuthenticated) {
      void logout();
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
    logout,
    router,
    showToast,
    Common.Toasts.SessionExpiredDescription,
    Common.Toasts.SessionExpiredTitle,
  ]);

  if (isSessionLoading || !isAuthenticated) {
    return null;
  }

  return <AdminShell />;
}
