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
    <Card className="border-white/20 bg-white/80 backdrop-blur-sm shadow-[0_12px_30px_-20px_rgba(16,24,40,0.55)]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-700">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </CardContent>
    </Card>
  );
}
