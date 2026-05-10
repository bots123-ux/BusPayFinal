import { useEffect, useState } from "react";
import { Search, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Ticket {
  ticket_id: string; user_email: string; user_name: string;
  origin: string; destination: string; travel_date: string;
  departure_time: string; seat_number: number; status: string;
  price_php: number; payment_method: string; created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-500/15 text-green-400",
  pending: "bg-yellow-500/15 text-yellow-400",
  used: "bg-blue-500/15 text-blue-400",
  cancelled: "bg-red-500/15 text-red-400",
  expired: "bg-slate-500/15 text-slate-400",
};

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.rpc("admin_get_tickets", { p_status: statusFilter || null });
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const filtered = tickets.filter(t =>
    `${t.user_email} ${t.user_name} ${t.origin} ${t.destination}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this ticket and refund the passenger?")) return;
    setCancelling(id);
    const { error } = await supabase.rpc("admin_cancel_ticket", { p_ticket_id: id });
    if (error) { toast.error(error.message); } else { toast.success("Ticket cancelled & refunded"); load(); }
    setCancelling(null);
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-extrabold text-white">Tickets</h1>
        <p className="text-sm text-slate-400">{tickets.length} tickets total</p></div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search passenger, route..."
            className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none">
          <option value="">All Statuses</option>
          {["paid","pending","used","cancelled","expired"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900">
              <tr>{["Passenger","Route","Date","Seat","Status","Amount","Method","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {filtered.map(t => (
                <tr key={t.ticket_id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{t.user_name || "—"}</div>
                    <div className="text-xs text-slate-400">{t.user_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white">{t.origin}</div>
                    <div className="text-xs text-slate-400">→ {t.destination}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{t.travel_date ? format(new Date(t.travel_date), "MMM d, yyyy") : "—"}<br />{t.departure_time?.slice(0,5)}</td>
                  <td className="px-4 py-3 text-center font-bold text-white">{t.seat_number}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_COLORS[t.status] ?? "bg-slate-500/15 text-slate-400")}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">₱{Number(t.price_php).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{t.payment_method}</td>
                  <td className="px-4 py-3">
                    {!["cancelled","expired","used"].includes(t.status) && (
                      <button onClick={() => handleCancel(t.ticket_id)} disabled={cancelling === t.ticket_id}
                        className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-50">
                        {cancelling === t.ticket_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No tickets found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
