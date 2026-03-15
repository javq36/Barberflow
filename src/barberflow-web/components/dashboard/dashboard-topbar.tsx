"use client";

import { Bell, LogOut, Menu, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/loading-button";
import { Texts } from "@/lib/content/texts";

type DashboardTopbarProps = {
  title: string;
  description: string;
  searchPlaceholder: string;
  notificationsLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
  userName: string;
  userRole: string;
  logoutLabel: string;
  loadingLabel: string;
  isMenuOpen: boolean;
  isLoggingOut: boolean;
  onToggleMenu: () => void;
  onLogout: () => void;
};

export function DashboardTopbar({
  title,
  description,
  searchPlaceholder,
  notificationsLabel,
  openMenuLabel,
  closeMenuLabel,
  userName,
  userRole,
  logoutLabel,
  loadingLabel,
  isMenuOpen,
  isLoggingOut,
  onToggleMenu,
  onLogout,
}: DashboardTopbarProps) {
  const { SharedShell } = Texts;

  return (
    <header className="dashboard-panel p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Badge className="dashboard-badge-brand">
            {SharedShell.BrandName}
          </Badge>
          <h1 className="dashboard-heading text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          <p className="dashboard-body-muted text-sm">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={isMenuOpen ? closeMenuLabel : openMenuLabel}
            onClick={onToggleMenu}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100 lg:hidden"
          >
            {isMenuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <button
            type="button"
            aria-label={notificationsLabel}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-400" />
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-100">
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-zinc-100">{userName}</p>
              <p className="text-[11px] text-zinc-400">{userRole}</p>
            </div>
          </div>
          <LoadingButton
            type="button"
            variant="outline"
            size="sm"
            onClick={onLogout}
            isLoading={isLoggingOut}
            loadingText={loadingLabel}
          >
            <>
              <LogOut className="h-4 w-4" />
              {logoutLabel}
            </>
          </LoadingButton>
        </div>
      </div>
    </header>
  );
}
