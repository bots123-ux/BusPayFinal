import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Mail, Shield, Smartphone, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getInstallPrompt, isInstalled, setInstalled, clearPrompt } from "@/lib/installPrompt";
import { cn } from "@/lib/utils";

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandalone = window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as any).standalone === true;

export default function ScannerProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [driverName, setDriverName] = useState("Driver");
  const [role, setRole] = useState<"Admin" | "Driver" | "">("");
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [installed, setInstalledState] = useState(isInstalled() || isInStandalone);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Check admin_accounts first, then driver_accounts for role and name
    supabase.from("admin_accounts")
      .select("full_name, user_id")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data: adminData }) => {
        if (adminData) {
          if (adminData.full_name) setDriverName(adminData.full_name);
          setRole("Admin");
          return;
        }
        supabase.from("driver_accounts")
          .select("full_name, user_id")
          .eq("user_id", user.id).maybeSingle()
          .then(({ data: driverData }) => {
            if (driverData?.full_name) setDriverName(driverData.full_name);
            setRole("Driver");
          });
      });
    setPromptAvailable(!!getInstallPrompt());
  }, [user]);

  const handleInstall = async () => {
    const prompt = getInstallPrompt();
    if (prompt) {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        clearPrompt();
        setInstalledState(true);
        setPromptAvailable(false);
      }
    } else {
      setShowModal(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/scanner/login");
  };

  return (
    <div className="flex flex-col text-white pb-8"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>

      {/* Header */}
      <div className="px-5 pt-10 pb-6">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">QR Reader</p>
        <h1 className="text-2xl font-extrabold">Profile</h1>
      </div>

      {/* User info card */}
      <div className="mx-5 mb-4 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 border border-orange-500/30">
            <span className="text-2xl font-extrabold text-orange-400">
              {driverName[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div>
            <p className="text-lg font-extrabold text-white">{driverName}</p>
            {role && (
              <span className={cn(
                "inline-flex items-center gap-1.5 mt-1 rounded-full px-2.5 py-1 text-xs font-bold",
                role === "Admin"
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                  : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
              )}>
                <Shield className="h-3 w-3" /> {role}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-white/10 pt-4">
          <InfoRow icon={<Mail className="h-4 w-4 text-slate-400" />}
            label="Email" value={user?.email ?? "—"} />
          <InfoRow icon={<User className="h-4 w-4 text-slate-400" />}
            label="Access Level" value={`${role || "Driver"} — QR Scanner`} />
          <InfoRow icon={<Smartphone className="h-4 w-4 text-slate-400" />}
            label="App" value="QR Reader — BusPay Driver App" />
          <InfoRow icon={<div className={cn("h-2.5 w-2.5 rounded-full", isInStandalone ? "bg-green-400" : "bg-yellow-400")} />}
            label="Running as" value={isInStandalone ? "Installed App ✓" : "Browser (not installed)"} />
        </div>
      </div>

      {/* Install / Status */}
      <div className="mx-5 mb-4">
        {installed ? (
          <div className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-400">QR Reader is installed!</p>
              <p className="text-xs text-slate-400 mt-0.5">Running as a standalone app</p>
            </div>
          </div>
        ) : (
          <>
            <button onClick={handleInstall}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white hover:bg-orange-600 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/30">
              Install QR Reader App
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              {isIos
                ? "Safari → Share (□↑) → Add to Home Screen"
                : promptAvailable
                  ? "Tap to install on your Android home screen"
                  : "Open BusPay app → this page → tap Install"}
            </p>
          </>
        )}
      </div>

      {/* How to access properly */}
      {!isInStandalone && (
        <div className="mx-5 mb-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-400 mb-1">For the best experience</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Open the <strong className="text-white">BusPay app</strong> (installed on your home screen) →
                Profile → Open QR Reader. This runs the scanner without a browser URL bar, just like a native app.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="mx-5">
        <button onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-4 text-sm font-bold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>

      {/* Install modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setShowModal(false)}>
          <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#1a1a2e] p-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-14 rounded-full bg-white/20" />
            <h3 className="text-xl font-extrabold mb-1 text-white">
              Install QR Reader
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              For the best experience — no URL bar, works offline:
            </p>

            <div className="mb-4 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
              <p className="text-xs font-bold text-orange-400 mb-2">Recommended method:</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Open the <strong className="text-white">BusPay app</strong> on your home screen →
                Profile tab → "Open QR Reader" button. The scanner opens inside BusPay with no URL bar.
              </p>
            </div>

            <p className="text-xs font-bold text-slate-400 mb-3">
              {isIos ? "OR — Add manually on iPhone:" : "OR — Add manually on Android:"}
            </p>
            {(isIos ? [
              "Open this page in Safari (not Chrome)",
              "Tap the Share button (□↑) at the bottom",
              "Tap Add to Home Screen",
              "Tap Add — QR Reader appears on your home screen",
            ] : [
              "Tap the three-dot menu (⋮) in Chrome top-right",
              "Tap Add to Home screen or Install app",
              "Tap Install to confirm",
              "QR Reader icon appears on your home screen",
            ]).map((text, i) => (
              <div key={i} className="flex items-start gap-3 mb-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                  {i + 1}
                </div>
                <p className="text-sm text-slate-300 pt-0.5">{text}</p>
              </div>
            ))}

            <button onClick={() => setShowModal(false)}
              className="mt-2 w-full rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 active:scale-[0.98] transition-all">
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}