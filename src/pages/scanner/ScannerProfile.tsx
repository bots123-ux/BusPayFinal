import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Download, User, Mail, Shield, Smartphone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getInstallPrompt, isInstalled, setInstalled, clearPrompt } from "@/lib/installPrompt";

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function ScannerProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [driverName, setDriverName] = useState("Driver");
  const [role, setRole] = useState<"Admin" | "Driver" | "">("");
  const [installState, setInstallState] = useState<"idle" | "installed" | "no-prompt">("idle");
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("passenger")
      .select("full_name, is_admin, is_driver")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setDriverName(data.full_name);
        if (data?.is_admin) setRole("Admin");
        else if (data?.is_driver) setRole("Driver");
      });

    if (isInstalled()) setInstallState("installed");
    else if (!getInstallPrompt() && !isIos) setInstallState("no-prompt");
  }, [user]);

  const handleInstall = async () => {
    // iOS — show step-by-step modal
    if (isIos) { setShowIosModal(true); return; }

    const prompt = getInstallPrompt();
    if (!prompt) {
      // Already installed or browser doesn't support — show instructions
      setShowIosModal(true);
      return;
    }
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      clearPrompt();
      setInstallState("installed");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/scanner/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f1a] text-white pb-6">

      {/* Header */}
      <div className="px-5 pt-14 pb-6">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">QR Reader</p>
        <h1 className="text-2xl font-extrabold">Profile</h1>
      </div>

      {/* User info card */}
      <div className="mx-5 mb-4 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 border border-orange-500/30">
            <span className="text-2xl font-extrabold text-orange-400">
              {driverName[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div>
            <p className="text-lg font-extrabold text-white">{driverName}</p>
            {role && (
              <span className={`inline-flex items-center gap-1.5 mt-1 rounded-full px-2.5 py-1 text-xs font-bold
                ${role === "Admin"
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                  : "bg-blue-500/15 text-blue-400 border border-blue-500/30"}`}>
                <Shield className="h-3 w-3" /> {role}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 flex-shrink-0">
              <Mail className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Email</p>
              <p className="text-sm font-semibold text-white">{user?.email ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 flex-shrink-0">
              <User className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Access Level</p>
              <p className="text-sm font-semibold text-white">{role || "Driver"} — QR Scanner Access</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 flex-shrink-0">
              <Smartphone className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">App</p>
              <p className="text-sm font-semibold text-white">QR Reader — BusPay Driver App</p>
            </div>
          </div>
        </div>
      </div>

      {/* Install QR Reader App */}
      <div className="mx-5 mb-4">
        {installState === "installed" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4">
            <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-400">QR Reader is installed!</p>
              <p className="text-xs text-slate-400 mt-0.5">Find it on your home screen</p>
            </div>
          </div>
        ) : (
          <button onClick={handleInstall}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white hover:bg-orange-600 active:scale-[0.98] transition-all shadow-lg shadow-orange-500/30">
            <Download className="h-5 w-5" />
            Install QR Reader App
          </button>
        )}
        <p className="mt-2 text-center text-xs text-slate-500">
          {isIos
            ? "Use Safari → Share → Add to Home Screen"
            : "Installs on your Android home screen — works offline"}
        </p>
      </div>

      {/* Logout */}
      <div className="mx-5">
        <button onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-4 text-sm font-bold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all">
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>

      {/* iOS install modal */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setShowIosModal(false)}>
          <div className="w-full rounded-t-3xl border-t border-white/10 bg-[#1a1a2e] p-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-14 rounded-full bg-white/20" />
            <h3 className="text-xl font-extrabold mb-1 text-white">Install QR Reader</h3>
            <p className="text-sm text-slate-400 mb-5">
              {isIos ? "Follow these steps in Safari:" : "Install QR Reader on your device:"}
            </p>
            {(isIos ? [
              "Open this page in Safari (not Chrome)",
              "Tap the Share button (□↑) at the bottom of Safari",
              "Scroll down and tap Add to Home Screen",
              "Tap Add — QR Reader appears on your home screen!",
            ] : [
              "Tap the three-dot menu (⋮) in Chrome top right",
              "Tap Add to Home screen or Install app",
              "Tap Install to confirm",
              "QR Reader will appear on your home screen!",
            ]).map((text, i) => (
              <div key={i} className="flex items-start gap-3 mb-4">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                  {i + 1}
                </div>
                <p className="text-sm text-slate-300 pt-0.5">{text}</p>
              </div>
            ))}
            <button onClick={() => setShowIosModal(false)}
              className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 active:scale-[0.98] transition-all">
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
