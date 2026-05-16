import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-shimmer rounded-lg", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-2 h-6 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
