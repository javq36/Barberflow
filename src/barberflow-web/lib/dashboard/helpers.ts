import { Texts } from "@/lib/content/texts";

export function formatDashboardDate(value?: string) {
  if (!value) {
    return Texts.Common.Status.NoData;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
