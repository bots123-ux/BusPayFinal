import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { ShieldCheck, Zap, MapPin } from "lucide-react";

export default function Welcome() {
  const { t } = useI18n();
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-hero text-primary-foreground">
      {/* Decorative road lines */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <path d="M0 700 Q 250 600, 500 700 T 1000 700" stroke="hsl(var(--accent))" strokeWidth="2" fill="none" />
        <path d="M0 800 Q 250 900, 500 800 T 1000 800" stroke="hsl(var(--accent))" strokeWidth="2" fill="none" />
      </svg>

      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
        <header className="animate-fade-in">
          <Logo variant="light" />
        </header>

        <section className="my-auto flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent backdrop-blur animate-fade-in">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Manila ⇄ Baguio
          </div>

          <h1 className="mb-4 text-5xl font-extrabold tracking-tight md:text-7xl lg:text-8xl animate-slide-up">
            Bus<span className="text-accent">Pay</span>
          </h1>
          <p className="mb-3 max-w-xl text-xl font-semibold text-accent md:text-2xl animate-slide-up" style={{ animationDelay: "60ms" }}>
            {t("welcome.tagline")}
          </p>
          <p className="mb-10 max-w-md text-base text-primary-foreground/70 md:text-lg animate-slide-up" style={{ animationDelay: "120ms" }}>
            {t("welcome.desc")}
          </p>

          <Button asChild variant="hero" size="xl" className="animate-slide-up" style={{ animationDelay: "180ms" }}>
            <Link to="/language">{t("welcome.cta")} →</Link>
          </Button>

          <ul className="mt-14 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: Zap, label: "Instant booking" },
              { icon: ShieldCheck, label: "Bank-level security" },
              { icon: MapPin, label: "Real-time seats" },
            ].map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className="flex items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-primary-foreground/[0.03] px-4 py-3 text-sm text-primary-foreground/80 backdrop-blur animate-fade-in"
                style={{ animationDelay: `${240 + i * 80}ms` }}
              >
                <Icon className="h-4 w-4 text-accent" />
                {label}
              </li>
            ))}
          </ul>
        </section>

        <footer className="pt-8 text-center text-xs text-primary-foreground/40">
          © {new Date().getFullYear()} BusPay
        </footer>
      </div>
    </main>
  );
}
