import { useState } from "react";
import { Home, User } from "lucide-react";
import ScannerLanding from "./ScannerLanding";
import ScannerProfile from "./ScannerProfile";
import { cn } from "@/lib/utils";

type Tab = "home" | "profile";

export default function ScannerApp() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f1a]">
      {/* Page content */}
      <div className="flex-1">
        {tab === "home"    && <ScannerLanding />}
        {tab === "profile" && <ScannerProfile />}
      </div>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-50 flex border-t border-white/10 bg-[#0f0f1a]">
        {([
          { id: "home",    icon: Home, label: "Home"    },
          { id: "profile", icon: User, label: "Profile" },
        ] as { id: Tab; icon: any; label: string }[]).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors",
              tab === id ? "text-orange-400" : "text-slate-500 hover:text-slate-300"
            )}>
            <Icon className={cn("h-5 w-5", tab === id && "text-orange-400")} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
