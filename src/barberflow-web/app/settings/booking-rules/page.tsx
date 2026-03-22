"use client";

import { BookingRulesSection } from "@/components/dashboard/operations/booking-rules-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function BookingRulesPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId, role } =
    useSessionGuard({ requiredPermission: "barbershop.edit" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <BookingRulesSection canOperate={Boolean(barbershopId)} role={role} />;
}
