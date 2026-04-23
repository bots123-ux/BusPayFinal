import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Lang = "en" | "fil" | "ceb" | "ilo" | "kap" | "ja" | "ko" | "zh" | "fr" | "es" | "de" | "it" | "hi" | "th" | "vi";

const OPTIONS: { code: Lang; label: string; native: string; flag: string }[] = [
  { code: "en",  label: "English",           native: "English",        flag: "🇬🇧" },
  { code: "fil", label: "Filipino (Tagalog)", native: "Filipino",       flag: "🇵🇭" },
  { code: "ceb", label: "Cebuano",            native: "Sinugbuanon",    flag: "🇵🇭" },
  { code: "ilo", label: "Ilocano",            native: "Ilokano",        flag: "🇵🇭" },
  { code: "kap", label: "Kapampangan",        native: "Kapampangan",    flag: "🇵🇭" },
  { code: "ja",  label: "Japanese",           native: "日本語",          flag: "🇯🇵" },
  { code: "ko",  label: "Korean",             native: "한국어",          flag: "🇰🇷" },
  { code: "zh",  label: "Chinese (Mandarin)", native: "中文",            flag: "🇨🇳" },
  { code: "fr",  label: "French",             native: "Français",       flag: "🇫🇷" },
  { code: "es",  label: "Spanish",            native: "Español",        flag: "🇪🇸" },
  { code: "de",  label: "German",             native: "Deutsch",        flag: "🇩🇪" },
  { code: "it",  label: "Italian",            native: "Italiano",       flag: "🇮🇹" },
  { code: "hi",  label: "Hindi",              native: "हिन्दी",         flag: "🇮🇳" },
  { code: "th",  label: "Thai",               native: "ภาษาไทย",        flag: "🇹🇭" },
  { code: "vi",  label: "Vietnamese",         native: "Tiếng Việt",     flag: "🇻🇳" },
];

export default function Language() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Lang>(lang as Lang);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-8">
        <header className="mb-8 animate-fade-in"><Logo /></header>

        <section className="flex-1">
          <h1 className="mb-1 text-2xl font-extrabold animate-slide-up">{t("lang.title")}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{t("lang.subtitle")}</p>

          <div className="grid grid-cols-2 gap-2">
            {OPTIONS.map((opt, i) => (
              <button
                key={opt.code}
                onClick={() => setSelected(opt.code)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3 text-left transition-all animate-slide-up",
                  selected === opt.code
                    ? "border-accent bg-accent/5 shadow-soft"
                    : "border-border hover:border-accent/40",
                )}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <span className="text-xl">{opt.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{opt.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{opt.native}</div>
                </div>
                {selected === opt.code && (
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        <Button variant="navy" size="lg"
          onClick={() => { setLang(selected as any); navigate("/auth"); }}
          className="mt-6 w-full">
          {t("lang.continue")}
        </Button>
      </div>
    </main>
  );
}
