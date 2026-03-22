"use client";

import { useMemo } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  Scissors,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { AppRole } from "@/lib/auth/permissions";
import { Texts } from "@/lib/content/texts";
import { selectDashboardNavItems } from "@/lib/dashboard/selectors";

type RoleSidebarNavProps = {
  role: AppRole;
  activeItemId: string;
  onNavigate: (href: string) => void;
};

function iconByItem(itemId: string) {
  if (itemId === "schedule") {
    return <CalendarDays className="h-4 w-4" />;
  }

  if (itemId === "services" || itemId === "barbers" || itemId === "customers") {
    return <Scissors className="h-4 w-4" />;
  }

  if (itemId === "platform") {
    return <ShieldCheck className="h-4 w-4" />;
  }

  if (itemId === "payments") {
    return <Wallet className="h-4 w-4" />;
  }

  if (
    itemId === "working-hours" ||
    itemId === "time-off" ||
    itemId === "booking-rules"
  ) {
    return <Settings className="h-4 w-4" />;
  }

  return <LayoutDashboard className="h-4 w-4" />;
}

export function RoleSidebarNav({
  role,
  activeItemId,
  onNavigate,
}: RoleSidebarNavProps) {
  const { Dashboard } = Texts;

  const items = useMemo(
    () =>
      selectDashboardNavItems(role, {
        Overview: Dashboard.Navigation.Overview,
        Schedule: Dashboard.Navigation.Schedule,
        Payments: Dashboard.Navigation.Payments,
        Services: Dashboard.Navigation.Services,
        Barbers: Dashboard.Navigation.Barbers,
        Customers: Dashboard.Navigation.Customers,
        Platform: Dashboard.Navigation.Platform,
        WorkingHours: Dashboard.Navigation.WorkingHours,
        TimeOff: Dashboard.Navigation.TimeOff,
        BookingRules: Dashboard.Navigation.BookingRules,
      }),
    [
      Dashboard.Navigation.Barbers,
      Dashboard.Navigation.BookingRules,
      Dashboard.Navigation.Customers,
      Dashboard.Navigation.Overview,
      Dashboard.Navigation.Payments,
      Dashboard.Navigation.Platform,
      Dashboard.Navigation.Schedule,
      Dashboard.Navigation.Services,
      Dashboard.Navigation.TimeOff,
      Dashboard.Navigation.WorkingHours,
      role,
    ],
  );

  return (
    <>
      {items.map((item) => {
        const isActive = item.id === activeItemId;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.href)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-[#262626] text-white"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            {iconByItem(item.id)}
            {item.label}
          </button>
        );
      })}
    </>
  );
}
