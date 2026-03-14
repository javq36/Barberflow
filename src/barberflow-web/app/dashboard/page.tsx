"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function DashboardPage() {
  const { isSessionLoading, isAuthenticated, role } = useSessionGuard();

  if (isSessionLoading || !isAuthenticated) {
    return null;
  }

  return <DashboardShell role={role} />;
}
