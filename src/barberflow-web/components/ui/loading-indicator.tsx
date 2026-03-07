import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type LoadingIndicatorProps = {
  label?: string;
  className?: string;
  spinnerClassName?: string;
};

export function LoadingIndicator({
  label,
  className,
  spinnerClassName,
}: LoadingIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader2
        className={cn("h-4 w-4 animate-spin text-current", spinnerClassName)}
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
