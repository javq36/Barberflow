import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
  hint: string;
  icon: ReactNode;
};

export function StatCard({ title, value, hint, icon }: StatCardProps) {
  return (
    <Card className="dashboard-panel">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="dashboard-body-muted text-xs font-medium sm:text-sm">
          {title}
        </CardTitle>
        <div className="dashboard-icon-box [&>svg]:h-5 [&>svg]:w-5 [&>svg]:stroke-[2.1]">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <p className="dashboard-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {value}
        </p>
        <p className="dashboard-microtext mt-1.5">{hint}</p>
      </CardContent>
    </Card>
  );
}
