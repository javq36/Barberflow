"use client";

import { ReactNode } from "react";
import { Scissors } from "lucide-react";
import { AppRole } from "@/lib/auth/permissions";
import { RoleSidebarNav } from "@/components/dashboard/role-sidebar-nav";

type RoleWorkspaceShellProps = {
  canOperate: boolean;
  disabledMessage: string;
  role: AppRole;
  activeItemId: string;
  onNavigate: (href: string) => void;
  brandTitle: string;
  brandSubtitle: string;
  desktopHeader: ReactNode;
  desktopBody: ReactNode;
  desktopSidebarExtra?: ReactNode;
  desktopSidebarFooter?: ReactNode;
  mobileHeader: ReactNode;
  mobileBody: ReactNode;
  mobileFooter: ReactNode;
};

export function RoleWorkspaceShell({
  canOperate,
  disabledMessage,
  role,
  activeItemId,
  onNavigate,
  brandTitle,
  brandSubtitle,
  desktopHeader,
  desktopBody,
  desktopSidebarExtra,
  desktopSidebarFooter,
  mobileHeader,
  mobileBody,
  mobileFooter,
}: RoleWorkspaceShellProps) {
  return (
    <main className="min-h-screen bg-[#191919] text-slate-100">
      {!canOperate ? (
        <section className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-slate-800 bg-[#222] p-6 text-sm text-slate-300">
            {disabledMessage}
          </div>
        </section>
      ) : null}

      {canOperate ? (
        <>
          <div className="hidden h-screen overflow-hidden lg:flex">
            <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-[#191919]">
              <div className="flex items-center gap-3 p-6">
                <div className="rounded-lg bg-[#262626] p-1.5 text-slate-100">
                  <Scissors className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-lg font-bold leading-none">
                    {brandTitle}
                  </h1>
                  <p className="mt-1 text-xs text-slate-400">{brandSubtitle}</p>
                </div>
              </div>

              <nav className="flex-1 space-y-1 px-4">
                <RoleSidebarNav
                  role={role}
                  activeItemId={activeItemId}
                  onNavigate={onNavigate}
                />
                {desktopSidebarExtra}
              </nav>

              {desktopSidebarFooter ? (
                <div className="mt-auto border-t border-slate-800 p-4">
                  {desktopSidebarFooter}
                </div>
              ) : null}
            </aside>

            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {desktopHeader}
              {desktopBody}
            </section>
          </div>

          <div className="relative flex h-screen max-w-md flex-col overflow-hidden bg-[#191919] lg:hidden">
            {mobileHeader}
            {mobileBody}
            {mobileFooter}
          </div>
        </>
      ) : null}
    </main>
  );
}
