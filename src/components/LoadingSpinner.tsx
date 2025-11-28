import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export const LoadingSpinner = ({ className, ...props }: LoadingSpinnerProps) => {
  return (
    <Loader2 
      className={cn("animate-spin text-primary", className)} 
      {...props} 
    />
  );
};
