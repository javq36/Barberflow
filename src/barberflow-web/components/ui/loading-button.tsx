import { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type LoadingButtonProps = ComponentProps<typeof Button> & {
  isLoading?: boolean;
  loadingText?: string;
  children: ReactNode;
};

export function LoadingButton({
  isLoading = false,
  loadingText,
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button disabled={disabled || isLoading} {...props}>
      {isLoading ? <LoadingIndicator label={loadingText} /> : children}
    </Button>
  );
}
