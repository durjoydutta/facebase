import { cn } from "@/lib/utils";
import { LoadingSpinner } from "./LoadingSpinner";

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  className?: string;
  fullScreen?: boolean;
}

export const LoadingOverlay = ({ 
  isLoading, 
  message = "Loading...", 
  className,
  fullScreen = false
}: LoadingOverlayProps) => {
  if (!isLoading) return null;

  return (
    <div 
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-300 animate-in fade-in",
        fullScreen && "fixed h-screen w-screen",
        className
      )}
    >
      <LoadingSpinner className="h-10 w-10 mb-4" />
      {message && (
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
};
