import { useEffect, useState } from "react";
import { MapPin, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Route {
  id: string; origin: string; destination: string;
  duration_minutes: number; price_php: number; active: boolean;
}

export default function AdminRoutes() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("routes").select("*").order("origin");
    setRoutes((data as Route[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleToggle = async (route: Route) => {
    setToggling(route.id);
    const { error } = await supabase.rpc("admin_toggle_route", { p_route_id: route.id, p_active: !route.active });
    if (error) { toast.error(error.message); } else {
      toast.success(`Route ${route.active ? "deactivated" : "activated"}`);
      load();
    }
    setToggling(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    const { error } = await supabase.from("routes").update({
      price_php: Number(editPrice),
      duration_minutes: Number(editDuration),
    }).eq("id", id);
    if (error) { toast.error(error.message); } else { toast.success("Route updated"); setEditing(null); load(); }
    setSaving(false);
  };

  const fmtDuration = (mins: number) => {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-extrabold text-white">Routes</h1>
        <p className="text-sm text-slate-400">{routes.length} routes configured</p></div>

      {loading ? <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {routes.map(r => (
            <div key={r.id} className={cn(
              "rounded-2xl border bg-slate-900 p-5 transition-all",
              r.active ? "border-slate-700" : "border-slate-800 opacity-60"
            )}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MapPin className={cn("h-4 w-4 flex-shrink-0", r.active ? "text-orange-400" : "text-slate-500")} />
                  <div>
                    <div className="font-bold text-white">{r.origin}</div>
                    <div className="text-xs text-slate-400">→ {r.destination}</div>
                  </div>
                </div>
                <button onClick={() => handleToggle(r)} disabled={toggling === r.id}
                  className="flex items-center gap-1.5 text-xs font-semibold transition-colors">
                  {toggling === r.id ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> :
                    r.active
                      ? <><ToggleRight className="h-5 w-5 text-green-400" /><span className="text-green-400">Active</span></>
                      : <><ToggleLeft className="h-5 w-5 text-slate-500" /><span className="text-slate-500">Inactive</span></>
                  }
                </button>
              </div>

              {editing === r.id ? (
                <div className="space-y-2 mt-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-slate-400 mb-1 block">Price (PHP)</label>
                      <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-slate-400 mb-1 block">Duration (mins)</label>
                      <input type="number" value={editDuration} onChange={e => setEditDuration(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(r.id)} disabled={saving}
                      className="flex-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-1">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </button>
                    <button onClick={() => setEditing(null)} className="flex-1 rounded-xl bg-slate-700 py-2 text-xs font-bold text-slate-300 hover:bg-slate-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-4">
                    <div><div className="text-xs text-slate-400">Fare</div><div className="font-bold text-white">₱{Number(r.price_php).toLocaleString()}</div></div>
                    <div><div className="text-xs text-slate-400">Duration</div><div className="font-bold text-white">{fmtDuration(r.duration_minutes)}</div></div>
                  </div>
                  <button onClick={() => { setEditing(r.id); setEditPrice(String(r.price_php)); setEditDuration(String(r.duration_minutes)); }}
                    className="rounded-xl bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 transition-colors">
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
