"use client";

import { WorkingHoursSection } from "@/components/dashboard/operations/working-hours-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function WorkingHoursPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId, role } =
    useSessionGuard({ requiredPermission: "barbers.manage" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <WorkingHoursSection canOperate={Boolean(barbershopId)} role={role} />;
}
