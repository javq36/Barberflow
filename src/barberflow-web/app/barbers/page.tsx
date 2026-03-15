"use client";

import { BarbersSection } from "@/components/dashboard/operations/barbers-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function BarbersPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId, role } =
    useSessionGuard({ requiredPermission: "barbers.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <BarbersSection canOperate={Boolean(barbershopId)} role={role} />;
}
