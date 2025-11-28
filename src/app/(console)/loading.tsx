import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner className="h-12 w-12 text-primary" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Loading console...
        </p>
      </div>
    </div>
  );
}
