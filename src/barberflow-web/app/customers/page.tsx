"use client";

import { CustomersSection } from "@/components/dashboard/operations/customers-section";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";

export default function CustomersPage() {
  const { isSessionLoading, isAuthenticated, hasAccess, barbershopId } =
    useSessionGuard({ requiredPermission: "customers.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return <CustomersSection canOperate={Boolean(barbershopId)} />;
}
