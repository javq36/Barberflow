"use client";

import { TimeOffSection } from "@/components/dashboard/operations/time-off-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function TimeOffPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId, role } =
    useSessionGuard({ requiredPermission: "barbers.manage" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <TimeOffSection canOperate={Boolean(barbershopId)} role={role} />;
}
