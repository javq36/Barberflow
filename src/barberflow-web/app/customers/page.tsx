"use client";

import { CustomersSection } from "@/components/dashboard/operations/customers-section";
import { OwnerPanelShell } from "@/components/dashboard/owner-panel-shell";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";
import { Texts } from "@/lib/content/texts";

export default function CustomersPage() {
  const { Dashboard } = Texts;
  const { isSessionLoading, isAuthenticated, hasAccess, role, barbershopId } =
    useSessionGuard({ requiredPermission: "customers.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return (
    <OwnerPanelShell
      role={role}
      title={Dashboard.Operations.CustomersTitle}
      description={Dashboard.Operations.Description}
    >
      <CustomersSection canOperate={Boolean(barbershopId)} />
    </OwnerPanelShell>
  );
}
