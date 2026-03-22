import { AppRole, hasPermission } from "@/lib/auth/permissions";
import { APP_ROUTES } from "@/lib/config/app";

export type DashboardNavItem = {
  id: string;
  label: string;
  href: string;
  icon: "dashboard" | "schedule" | "operations" | "platform" | "settings";
};

type DashboardNavigationTexts = {
  Overview: string;
  Schedule: string;
  Payments: string;
  Services: string;
  Barbers: string;
  Customers: string;
  Platform: string;
  WorkingHours: string;
  TimeOff: string;
  BookingRules: string;
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

    items.push({
      id: "payments",
      label: labels.Payments,
      href: APP_ROUTES.Payments,
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

  if (hasPermission(role, "settings.manage")) {
    items.push({
      id: "working-hours",
      label: labels.WorkingHours,
      href: APP_ROUTES.WorkingHours,
      icon: "settings",
    });

    items.push({
      id: "time-off",
      label: labels.TimeOff,
      href: APP_ROUTES.TimeOff,
      icon: "settings",
    });

    items.push({
      id: "booking-rules",
      label: labels.BookingRules,
      href: APP_ROUTES.BookingRules,
      icon: "settings",
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
