"use client";

import { PaymentsSection } from "@/components/dashboard/operations/payments-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function PaymentsPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId, role } =
    useSessionGuard({ requiredPermission: "appointments.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <PaymentsSection canOperate={Boolean(barbershopId)} role={role} />;
}
