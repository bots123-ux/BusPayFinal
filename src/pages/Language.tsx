import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Lang = "en"|"fil"|"ceb"|"ilo"|"kap"|"ja"|"ko"|"zh"|"fr"|"es"|"de"|"it"|"hi"|"th"|"vi";

const OPTIONS:{code:Lang;label:string;native:string;cc:string;color:string}[] = [
  {code:"en",  label:"English",           native:"English",       cc:"EN",  color:"bg-blue-700 text-white"},
  {code:"fil", label:"Filipino (Tagalog)", native:"Filipino",      cc:"PH",  color:"bg-blue-600 text-white"},
  {code:"ceb", label:"Cebuano",           native:"Sinugbuanon",   cc:"PH",  color:"bg-red-600 text-white"},
  {code:"ilo", label:"Ilocano",           native:"Ilokano",       cc:"PH",  color:"bg-yellow-500 text-white"},
  {code:"kap", label:"Kapampangan",       native:"Kapampangan",   cc:"PH",  color:"bg-green-600 text-white"},
  {code:"ja",  label:"Japanese",          native:"日本語",          cc:"JP",  color:"bg-red-500 text-white"},
  {code:"ko",  label:"Korean",            native:"한국어",          cc:"KR",  color:"bg-blue-500 text-white"},
  {code:"zh",  label:"Chinese",           native:"中文",            cc:"CN",  color:"bg-red-600 text-white"},
  {code:"fr",  label:"French",            native:"Français",      cc:"FR",  color:"bg-indigo-600 text-white"},
  {code:"es",  label:"Spanish",           native:"Español",       cc:"ES",  color:"bg-yellow-600 text-white"},
  {code:"de",  label:"German",            native:"Deutsch",       cc:"DE",  color:"bg-gray-800 text-white"},
  {code:"it",  label:"Italian",           native:"Italiano",      cc:"IT",  color:"bg-green-700 text-white"},
  {code:"hi",  label:"Hindi",             native:"हिन्दी",        cc:"IN",  color:"bg-orange-500 text-white"},
  {code:"th",  label:"Thai",              native:"ภาษาไทย",       cc:"TH",  color:"bg-blue-800 text-white"},
  {code:"vi",  label:"Vietnamese",        native:"Tiếng Việt",    cc:"VN",  color:"bg-red-700 text-white"},
];

export default function Language() {
  const {t,lang,setLang} = useI18n();
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
                style={{animationDelay:`${i*30}ms`}}>
                {/* Country code badge — works on ALL platforms including Windows */}
                <div className={cn("flex h-8 w-10 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold tracking-wide", opt.color)}>
                  {opt.cc}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{opt.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{opt.native}</div>
                </div>
                {selected === opt.code && (
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-3 w-3" strokeWidth={3}/>
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
