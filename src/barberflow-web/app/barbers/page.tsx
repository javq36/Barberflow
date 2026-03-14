"use client";

import { BarbersSection } from "@/components/dashboard/operations/barbers-section";
import { OwnerPanelShell } from "@/components/dashboard/owner-panel-shell";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";
import { Texts } from "@/lib/content/texts";

export default function BarbersPage() {
  const { Dashboard } = Texts;
  const { isSessionLoading, isAuthenticated, hasAccess, role, barbershopId } =
    useSessionGuard({ requiredPermission: "barbers.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return (
    <OwnerPanelShell
      role={role}
      title={Dashboard.Operations.BarbersTitle}
      description={Dashboard.Operations.Description}
    >
      <BarbersSection canOperate={Boolean(barbershopId)} />
    </OwnerPanelShell>
  );
}
