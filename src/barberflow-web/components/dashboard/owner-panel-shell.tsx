"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { AppRole } from "@/lib/auth/permissions";
import { Texts } from "@/lib/content/texts";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";
import { useOwnerPanelShellModel } from "@/lib/dashboard/hooks/use-owner-panel-shell-model";

type OwnerPanelShellProps = {
  role: AppRole;
  title: string;
  description: string;
  children: ReactNode;
};

export function OwnerPanelShell({
  role,
  title,
  description,
  children,
}: OwnerPanelShellProps) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { Dashboard, Common, SharedShell } = Texts;
  const { navItems, logoutState, onLogout } = useOwnerPanelShellModel({ role });
  const roleLabel =
    role === "SuperAdmin" ? "SuperAdmin" : SharedShell.DemoOwnerRole;

  function onNavigate(href: string) {
    setIsSidebarOpen(false);
    router.push(href);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8">
      <div className="dashboard-atmosphere" />

      <section className="dashboard-container grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DashboardSidebar
          items={navItems}
          isOpen={isSidebarOpen}
          onNavigate={onNavigate}
        />

        {isSidebarOpen ? (
          <button
            type="button"
            aria-label={Dashboard.Navbar.CloseMenu}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          />
        ) : null}

        <div className="space-y-4">
          <DashboardTopbar
            title={title}
            description={description}
            searchPlaceholder={Dashboard.Navbar.SearchPlaceholder}
            notificationsLabel={Dashboard.Navbar.Notifications}
            openMenuLabel={Dashboard.Navbar.OpenMenu}
            closeMenuLabel={Dashboard.Navbar.CloseMenu}
            userName={Dashboard.Navbar.UserName}
            userRole={roleLabel}
            logoutLabel={Common.Actions.Logout}
            loadingLabel={Common.Actions.Loading}
            isMenuOpen={isSidebarOpen}
            isLoggingOut={logoutState.isLoading}
            onToggleMenu={() => setIsSidebarOpen((previous) => !previous)}
            onLogout={onLogout}
          />
          {children}
        </div>
      </section>
    </main>
  );
}
