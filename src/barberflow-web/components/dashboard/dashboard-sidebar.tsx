"use client";

import {
  CalendarDays,
  LayoutDashboard,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import { DashboardNavItem } from "@/lib/dashboard/selectors";

type DashboardSidebarProps = {
  items: DashboardNavItem[];
  isOpen: boolean;
  onNavigate: (href: string) => void;
};

function getItemIcon(icon: DashboardNavItem["icon"]) {
  switch (icon) {
    case "schedule":
      return <CalendarDays className="h-4 w-4" />;
    case "operations":
      return <Scissors className="h-4 w-4" />;
    case "platform":
      return <ShieldCheck className="h-4 w-4" />;
    default:
      return <LayoutDashboard className="h-4 w-4" />;
  }
}

export function DashboardSidebar({
  items,
  isOpen,
  onNavigate,
}: DashboardSidebarProps) {
  return (
    <aside
      className={`dashboard-panel fixed inset-y-3 left-3 z-40 h-auto w-[260px] overflow-y-auto p-3 transition-transform duration-200 lg:sticky lg:top-4 lg:z-auto lg:block lg:h-fit lg:w-auto lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-[110%]"
      }`}
    >
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20 text-orange-300">
          <Scissors className="h-4 w-4" />
        </div>
        <div>
          <p className="dashboard-heading text-base font-semibold">BarberFlow</p>
          <p className="dashboard-microtext text-xs">Owner Panel</p>
        </div>
      </div>

      <nav className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.href)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 transition hover:bg-zinc-800/70 hover:text-zinc-100"
          >
            {getItemIcon(item.icon)}
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
