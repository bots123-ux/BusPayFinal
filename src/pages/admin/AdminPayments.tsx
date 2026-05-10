// AdminPayments.tsx
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Payment {
  payment_id: string; user_email: string; user_name: string;
  amount_php: number; method: string; status: string;
  origin: string; destination: string; created_at: string;
}

const METHOD_COLORS: Record<string, string> = {
  gcash: "bg-blue-500/15 text-blue-400",
  wallet: "bg-green-500/15 text-green-400",
  card: "bg-purple-500/15 text-purple-400",
};

export function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.rpc("admin_get_payments").then(({ data }) => {
      setPayments((data as Payment[]) ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = payments.filter(p =>
    `${p.user_email} ${p.user_name} ${p.origin} ${p.destination}`.toLowerCase().includes(search.toLowerCase())
  );

  const total = payments.filter(p => p.status === "completed").reduce((s, p) => s + Number(p.amount_php), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-extrabold text-white">Payments</h1>
          <p className="text-sm text-slate-400">{payments.length} transactions · Total: <span className="text-green-400 font-bold">₱{total.toLocaleString()}</span></p></div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search passenger or route..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
      </div>
      {loading ? <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900">
              <tr>{["Passenger","Route","Amount","Method","Status","Date"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {filtered.map(p => (
                <tr key={p.payment_id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{p.user_name || "—"}</div>
                    <div className="text-xs text-slate-400">{p.user_email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{p.origin} → {p.destination}</td>
                  <td className="px-4 py-3 font-bold text-white">₱{Number(p.amount_php).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", METHOD_COLORS[p.method] ?? "bg-slate-500/15 text-slate-400")}>{p.method}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", p.status === "completed" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400")}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{p.created_at ? format(new Date(p.created_at), "MMM d, yyyy · p") : "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No payments found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminPayments;
