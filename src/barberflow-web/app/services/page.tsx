"use client";

import { ServicesSection } from "@/components/dashboard/operations/services-section";
import { OwnerPanelShell } from "@/components/dashboard/owner-panel-shell";
import { useSessionGuard } from "@/lib/auth/hooks/use-session-guard";
import { Texts } from "@/lib/content/texts";

export default function ServicesPage() {
  const { Dashboard } = Texts;
  const { isSessionLoading, isAuthenticated, hasAccess, role, barbershopId } =
    useSessionGuard({ requiredPermission: "services.view" });

  if (isSessionLoading || !isAuthenticated || !hasAccess) {
    return null;
  }

  return (
    <OwnerPanelShell
      role={role}
      title={Dashboard.Operations.ServicesTitle}
      description={Dashboard.Operations.Description}
    >
      <ServicesSection canOperate={Boolean(barbershopId)} />
    </OwnerPanelShell>
  );
}
