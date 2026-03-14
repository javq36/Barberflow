import { AppRole, hasPermission } from "@/lib/auth/permissions";
import { APP_ROUTES } from "@/lib/config/app";

export type DashboardNavItem = {
  id: string;
  label: string;
  href: string;
  icon: "dashboard" | "schedule" | "operations" | "platform";
};

type DashboardNavigationTexts = {
  Overview: string;
  Schedule: string;
  Services: string;
  Barbers: string;
  Customers: string;
  Platform: string;
};

export function selectDashboardNavItems(
  role: AppRole,
  labels: DashboardNavigationTexts,
): DashboardNavItem[] {
  const items: DashboardNavItem[] = [
    {
      id: "overview",
      label: labels.Overview,
      href: APP_ROUTES.Dashboard,
      icon: "dashboard",
    },
  ];

  if (
    hasPermission(role, "appointments.view") ||
    hasPermission(role, "appointments.manage")
  ) {
    items.push({
      id: "schedule",
      label: labels.Schedule,
      href: APP_ROUTES.Schedule,
      icon: "schedule",
    });
  }

  if (
    hasPermission(role, "services.view") ||
    hasPermission(role, "services.manage")
  ) {
    items.push({
      id: "services",
      label: labels.Services,
      href: APP_ROUTES.Services,
      icon: "operations",
    });
  }

  if (
    hasPermission(role, "barbers.view") ||
    hasPermission(role, "barbers.manage")
  ) {
    items.push({
      id: "barbers",
      label: labels.Barbers,
      href: APP_ROUTES.Barbers,
      icon: "operations",
    });
  }

  if (
    hasPermission(role, "customers.view") ||
    hasPermission(role, "customers.manage")
  ) {
    items.push({
      id: "customers",
      label: labels.Customers,
      href: APP_ROUTES.Customers,
      icon: "operations",
    });
  }

  if (hasPermission(role, "platform.manage")) {
    items.push({
      id: "platform",
      label: labels.Platform,
      href: "/dashboard#platform",
      icon: "platform",
    });
  }

  return items;
}
