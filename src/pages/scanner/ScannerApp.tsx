import { useState } from "react";
import { Home, User } from "lucide-react";
import ScannerLanding from "./ScannerLanding";
import ScannerProfile from "./ScannerProfile";
import { cn } from "@/lib/utils";

type Tab = "home" | "profile";

export default function ScannerApp() {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="flex flex-col bg-[#0f0f1a]"
      style={{
        height: "100dvh",           // dynamic viewport — no URL bar cutoff
        overscrollBehavior: "none", // no bounce/rubber band
        WebkitOverflowScrolling: "touch",
      }}>

      {/* Page content — scrollable */}
      <div className="flex-1 overflow-y-auto"
        style={{ overscrollBehavior: "none" }}>
        {tab === "home"    && <ScannerLanding />}
        {tab === "profile" && <ScannerProfile />}
      </div>

      {/* Bottom nav with safe area padding for iPhone home indicator */}
      <nav className="flex flex-shrink-0 border-t border-white/10 bg-[#0f0f1a]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {([
          { id: "home",    icon: Home, label: "Home"    },
          { id: "profile", icon: User, label: "Profile" },
        ] as { id: Tab; icon: any; label: string }[]).map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors",
              tab === id ? "text-orange-400" : "text-slate-500"
            )}>
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
