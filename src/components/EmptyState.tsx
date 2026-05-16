import { ReactNode } from "react";

export function EmptyState({
  illustration,
  title,
  description,
  action,
}: {
  illustration: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center animate-fade-in">
      <div className="mb-6 h-40 w-40 text-accent">{illustration}</div>
      <h3 className="mb-2 text-xl font-bold">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function EmptyTicketIllustration() {
  return (
    <svg viewBox="0 0 200 200" fill="none" className="h-full w-full" aria-hidden>
      <rect x="20" y="60" width="160" height="80" rx="12" fill="hsl(var(--secondary))" />
      <circle cx="100" cy="100" r="6" fill="hsl(var(--background))" />
      <line x1="100" y1="60" x2="100" y2="76" stroke="hsl(var(--background))" strokeWidth="2" strokeDasharray="3 3" />
      <line x1="100" y1="124" x2="100" y2="140" stroke="hsl(var(--background))" strokeWidth="2" strokeDasharray="3 3" />
      <rect x="36" y="76" width="48" height="6" rx="2" fill="hsl(var(--accent))" />
      <rect x="36" y="90" width="32" height="4" rx="2" fill="hsl(var(--muted-foreground))" opacity="0.4" />
      <rect x="36" y="100" width="40" height="4" rx="2" fill="hsl(var(--muted-foreground))" opacity="0.4" />
    </svg>
  );
}

export function EmptyBellIllustration() {
  return (
    <svg viewBox="0 0 200 200" fill="none" className="h-full w-full" aria-hidden>
      <path
        d="M100 40 C75 40 60 60 60 90 v25 l-12 18 h104 l-12 -18 v-25 c0 -30 -15 -50 -40 -50z"
        fill="hsl(var(--secondary))"
      />
      <circle cx="100" cy="40" r="8" fill="hsl(var(--accent))" />
      <path d="M88 145 a12 12 0 0 0 24 0z" fill="hsl(var(--secondary))" />
    </svg>
  );
}

export function EmptyWalletIllustration() {
  return (
    <svg viewBox="0 0 200 200" fill="none" className="h-full w-full" aria-hidden>
      <rect x="30" y="60" width="140" height="90" rx="14" fill="hsl(var(--primary))" />
      <rect x="30" y="80" width="140" height="20" fill="hsl(var(--primary-glow))" />
      <circle cx="140" cy="120" r="14" fill="hsl(var(--accent))" />
      <circle cx="155" cy="120" r="14" fill="hsl(var(--accent))" opacity="0.6" />
    </svg>
  );
}
