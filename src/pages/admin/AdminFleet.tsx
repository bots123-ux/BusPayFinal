import { useEffect, useState } from "react";
import { Bus, User, Plus, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BusRow { id: string; plate_number: string; model: string | null; total_seats: number; }
interface DriverRow { id: string; full_name: string; license_number: string; phone: string; }

export default function AdminFleet() {
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBusForm, setShowBusForm] = useState(false);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [plate, setPlate] = useState(""); const [model, setModel] = useState(""); const [seats, setSeats] = useState("40");
  const [dName, setDName] = useState(""); const [dLicense, setDLicense] = useState(""); const [dPhone, setDPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [{ data: b }, { data: d }] = await Promise.all([
      supabase.from("buses").select("*").order("plate_number"),
      supabase.from("drivers").select("*").order("full_name"),
    ]);
    setBuses((b as BusRow[]) ?? []);
    setDrivers((d as DriverRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addBus = async () => {
    if (!plate.trim()) { toast.error("Enter plate number"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("buses").insert({ plate_number: plate.trim().toUpperCase(), model: model.trim() || null, total_seats: Number(seats) });
    if (error) { toast.error(error.message); } else { toast.success("Bus added"); setShowBusForm(false); setPlate(""); setModel(""); setSeats("40"); load(); }
    setSubmitting(false);
  };

  const addDriver = async () => {
    if (!dName.trim() || !dLicense.trim()) { toast.error("Fill in name and license"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("drivers").insert({ full_name: dName.trim(), license_number: dLicense.trim(), phone: dPhone.trim() });
    if (error) { toast.error(error.message); } else { toast.success("Driver added"); setShowDriverForm(false); setDName(""); setDLicense(""); setDPhone(""); load(); }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold text-white">Fleet Management</h1>
        <p className="text-sm text-slate-400">{buses.length} buses · {drivers.length} drivers</p></div>

      {loading ? <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Buses */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2"><Bus className="h-5 w-5 text-orange-400" /><h2 className="font-bold text-white">Buses ({buses.length})</h2></div>
              <button onClick={() => setShowBusForm(true)} className="flex items-center gap-1.5 rounded-xl bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-400 hover:bg-orange-500/25 transition-colors">
                <Plus className="h-3 w-3" /> Add Bus
              </button>
            </div>
            {showBusForm && (
              <div className="border-b border-slate-800 p-5 space-y-3 bg-slate-800/50">
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">New Bus</span><button onClick={() => setShowBusForm(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div>
                <input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Plate Number (e.g. ABC 1234)" className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="Bus Model (e.g. Victory Liner)" className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
                <input type="number" value={seats} onChange={e => setSeats(e.target.value)} placeholder="Total Seats" className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white focus:border-orange-500 focus:outline-none" />
                <button onClick={addBus} disabled={submitting} className="w-full rounded-xl bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Bus"}
                </button>
              </div>
            )}
            <div className="divide-y divide-slate-800">
              {buses.map(b => (
                <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400 flex-shrink-0"><Bus className="h-4 w-4" /></div>
                  <div className="flex-1">
                    <div className="font-mono font-semibold text-white text-sm">{b.plate_number}</div>
                    <div className="text-xs text-slate-400">{b.model ?? "—"} · {b.total_seats} seats</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Drivers */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2"><User className="h-5 w-5 text-blue-400" /><h2 className="font-bold text-white">Drivers ({drivers.length})</h2></div>
              <button onClick={() => setShowDriverForm(true)} className="flex items-center gap-1.5 rounded-xl bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/25 transition-colors">
                <Plus className="h-3 w-3" /> Add Driver
              </button>
            </div>
            {showDriverForm && (
              <div className="border-b border-slate-800 p-5 space-y-3 bg-slate-800/50">
                <div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">New Driver</span><button onClick={() => setShowDriverForm(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button></div>
                <input value={dName} onChange={e => setDName(e.target.value)} placeholder="Full Name" className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
                <input value={dLicense} onChange={e => setDLicense(e.target.value)} placeholder="License Number" className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
                <input value={dPhone} onChange={e => setDPhone(e.target.value)} placeholder="Phone (+63...)" className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
                <button onClick={addDriver} disabled={submitting} className="w-full rounded-xl bg-blue-500 py-2 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Driver"}
                </button>
              </div>
            )}
            <div className="divide-y divide-slate-800">
              {drivers.map(d => (
                <div key={d.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 text-sm font-bold flex-shrink-0">{d.full_name[0]}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-white text-sm">{d.full_name}</div>
                    <div className="text-xs text-slate-400">{d.license_number} · {d.phone || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
