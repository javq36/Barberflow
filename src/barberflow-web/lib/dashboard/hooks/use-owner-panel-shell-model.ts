import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useLogoutMutation } from "@/lib/api/authApi";
import { AppRole } from "@/lib/auth/permissions";
import { APP_ROUTES } from "@/lib/config/app";
import { Texts } from "@/lib/content/texts";
import { selectDashboardNavItems } from "@/lib/dashboard/selectors";
import { useAppToast } from "@/lib/toast/toast-provider";

type UseOwnerPanelShellModelInput = {
  role: AppRole;
};

export function useOwnerPanelShellModel({
  role,
}: UseOwnerPanelShellModelInput) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [logout, logoutState] = useLogoutMutation();
  const { Dashboard, Common } = Texts;

  const navItems = useMemo(
    () =>
      selectDashboardNavItems(role, {
        Overview: Dashboard.Navigation.Overview,
        Schedule: Dashboard.Navigation.Schedule,
        Services: Dashboard.Navigation.Services,
        Barbers: Dashboard.Navigation.Barbers,
        Customers: Dashboard.Navigation.Customers,
        Platform: Dashboard.Navigation.Platform,
      }),
    [Dashboard.Navigation, role],
  );

  async function onLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Route transition should still happen even if logout request fails.
    }

    showToast({
      title: Common.Toasts.LoggedOutTitle,
      description: Common.Toasts.LoggedOutDescription,
      variant: "info",
    });

    router.replace(APP_ROUTES.Login);
  }

  return {
    navItems,
    logoutState,
    onLogout,
  };
}
