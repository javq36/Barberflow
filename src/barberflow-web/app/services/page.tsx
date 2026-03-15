"use client";

import { ServicesSection } from "@/components/dashboard/operations/services-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function ServicesPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId, role } =
    useSessionGuard({ requiredPermission: "services.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <ServicesSection canOperate={Boolean(barbershopId)} role={role} />;
}
