import { useEffect, useState } from "react";
import { Search, RefreshCw, XCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Trip {
  trip_id: string; origin: string; destination: string;
  travel_date: string; departure_time: string; price_php: number;
  bus_id: string; plate_number: string; bus_model: string;
  driver_id: string; driver_name: string;
  seats_total: number; seats_booked: number;
}
interface Bus { id: string; plate_number: string; model: string; }
interface Driver { id: string; full_name: string; }

export default function AdminTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [reassignTrip, setReassignTrip] = useState<Trip | null>(null);
  const [newBus, setNewBus] = useState("");
  const [newDriver, setNewDriver] = useState("");
  const [cancelTrip, setCancelTrip] = useState<Trip | null>(null);
  const [cancelReason, setCancelReason] = useState("Trip cancelled due to operational issues.");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [{ data: t }, { data: b }, { data: d }] = await Promise.all([
      supabase.rpc("admin_get_trips", { p_date: dateFilter || null }),
      supabase.from("buses").select("id, plate_number, model").order("plate_number"),
      supabase.from("drivers").select("id, full_name").order("full_name"),
    ]);
    setTrips((t as Trip[]) ?? []);
    setBuses((b as Bus[]) ?? []);
    setDrivers((d as Driver[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [dateFilter]);

  const filtered = trips.filter(t =>
    `${t.origin} ${t.destination} ${t.plate_number} ${t.driver_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleReassign = async () => {
    if (!reassignTrip) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_reassign_trip", {
      p_trip_id: reassignTrip.trip_id,
      p_bus_id: newBus || null,
      p_driver_id: newDriver || null,
    });
    if (error) { toast.error(error.message); } else { toast.success("Trip updated"); setReassignTrip(null); load(); }
    setSubmitting(false);
  };

  const handleCancel = async () => {
    if (!cancelTrip) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc("admin_cancel_trip", {
      p_trip_id: cancelTrip.trip_id, p_reason: cancelReason,
    });
    if (error) { toast.error(error.message); } else {
      toast.success(`Trip cancelled — ${data} tickets refunded`);
      setCancelTrip(null); load();
    }
    setSubmitting(false);
  };

  const occupancy = (t: Trip) => Math.round((Number(t.seats_booked) / t.seats_total) * 100);

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-extrabold text-white">Trips</h1>
        <p className="text-sm text-slate-400">{trips.length} trips loaded</p></div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search route, bus, driver..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
        </div>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none" />
        {dateFilter && <button onClick={() => setDateFilter("")} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>}
      </div>

      {loading ? <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900">
              <tr>{["Route","Date","Time","Bus","Driver","Occupancy","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {filtered.map(t => {
                const occ = occupancy(t);
                return (
                  <tr key={t.trip_id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{t.origin}</div>
                      <div className="text-xs text-slate-400">→ {t.destination}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{format(new Date(t.travel_date), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 text-slate-300">{t.departure_time?.slice(0,5)}</td>
                    <td className="px-4 py-3">
                      <div className="text-white font-mono text-xs">{t.plate_number}</div>
                      <div className="text-xs text-slate-400">{t.bus_model}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{t.driver_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-slate-700">
                          <div className={cn("h-1.5 rounded-full transition-all", occ >= 80 ? "bg-red-500" : occ >= 50 ? "bg-orange-400" : "bg-green-500")}
                            style={{ width: `${occ}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{t.seats_booked}/{t.seats_total}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => { setReassignTrip(t); setNewBus(t.bus_id); setNewDriver(t.driver_id); }}
                          className="flex items-center gap-1 rounded-lg bg-blue-500/15 px-2 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-500/25">
                          <RefreshCw className="h-3 w-3" /> Reassign
                        </button>
                        <button onClick={() => { setCancelTrip(t); setCancelReason("Trip cancelled due to operational issues."); }}
                          className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25">
                          <XCircle className="h-3 w-3" /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No trips found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Reassign Trip</h3>
              <button onClick={() => setReassignTrip(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-slate-400 mb-4">{reassignTrip.origin} → {reassignTrip.destination} · {format(new Date(reassignTrip.travel_date), "MMM d")} {reassignTrip.departure_time?.slice(0,5)}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Bus</label>
                <select value={newBus} onChange={e => setNewBus(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none">
                  {buses.map(b => <option key={b.id} value={b.id}>{b.plate_number} — {b.model}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Driver</label>
                <select value={newDriver} onChange={e => setNewDriver(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none">
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <button onClick={handleReassign} disabled={submitting}
                className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-red-400">Cancel Trip</h3>
              <button onClick={() => setCancelTrip(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-slate-400 mb-1">{cancelTrip.origin} → {cancelTrip.destination}</p>
            <p className="text-xs text-slate-500 mb-4">{format(new Date(cancelTrip.travel_date), "MMM d, yyyy")} · {cancelTrip.departure_time?.slice(0,5)} · {cancelTrip.seats_booked} passenger(s) will be notified</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Cancellation Reason (sent to passengers)</label>
                <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none resize-none" />
              </div>
              <button onClick={handleCancel} disabled={submitting}
                className="w-full rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
