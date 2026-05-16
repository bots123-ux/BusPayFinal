import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "light" | "dark";
}

export function Logo({ className, variant = "dark" }: LogoProps) {
  const navy = variant === "light" ? "hsl(var(--accent))" : "hsl(var(--primary))";
  const gold = "hsl(var(--accent))";
  return (
    <div className={cn("inline-flex items-center gap-2", className)} aria-label="BusPay logo">
      <svg viewBox="0 0 48 48" className="h-9 w-9" role="img" aria-hidden="true">
        <rect x="4" y="10" width="40" height="26" rx="6" fill={navy} />
        <rect x="8" y="14" width="14" height="8" rx="2" fill={gold} />
        <rect x="26" y="14" width="14" height="8" rx="2" fill={gold} opacity="0.7" />
        <circle cx="14" cy="38" r="4" fill={navy} stroke={gold} strokeWidth="2" />
        <circle cx="34" cy="38" r="4" fill={navy} stroke={gold} strokeWidth="2" />
        <path d="M40 26 l4 -2 v6 l-4 -2 z" fill={gold} />
      </svg>
      <span className={cn("text-xl font-extrabold tracking-tight", variant === "light" ? "text-accent" : "text-primary")}>
        Bus<span className="text-accent">Pay</span>
      </span>
    </div>
  );
}
