import { useEffect, useState } from "react";
import { Search, Wallet, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface User {
  user_id: string; email: string; full_name: string; phone: string;
  wallet_balance: number; ticket_count: number; total_spent: number;
  created_at: string; last_sign_in_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustUser, setAdjustUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data } = await supabase.rpc("admin_get_users");
    setUsers((data as User[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdjust = async () => {
    if (!adjustUser) return;
    const amt = Number(adjustAmount);
    if (!Number.isFinite(amt) || amt === 0) { toast.error("Enter a valid amount"); return; }
    if (!adjustNote.trim()) { toast.error("Enter a note"); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc("admin_adjust_wallet", {
      p_user_id: adjustUser.user_id, p_amount: amt, p_note: adjustNote
    });
    if (error) { toast.error(error.message); } else { toast.success("Wallet adjusted"); setAdjustUser(null); load(); }
    setSubmitting(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-white">Users</h1>
          <p className="text-sm text-slate-400">{users.length} registered passengers</p></div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
      </div>

      {loading ? <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 bg-slate-900">
              <tr>{["Name / Email","Joined","Last Login","Wallet","Tickets","Spent","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {filtered.map(u => (
                <tr key={u.user_id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex-shrink-0">
                        {(u.full_name || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{u.full_name || "—"}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.created_at ? format(new Date(u.created_at), "MMM d, yyyy") : "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.last_sign_in_at ? format(new Date(u.last_sign_in_at), "MMM d, yyyy") : "—"}</td>
                  <td className="px-4 py-3 font-semibold text-green-400">₱{Number(u.wallet_balance).toLocaleString()}</td>
                  <td className="px-4 py-3 text-white">{u.ticket_count}</td>
                  <td className="px-4 py-3 text-white">₱{Number(u.total_spent).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setAdjustUser(u); setAdjustAmount(""); setAdjustNote(""); }}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-2.5 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/25 transition-colors">
                      <Wallet className="h-3 w-3" /> Adjust Wallet
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Wallet Modal */}
      {adjustUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Adjust Wallet</h3>
              <button onClick={() => setAdjustUser(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-slate-400 mb-4">{adjustUser.full_name} · Current: <span className="font-bold text-green-400">₱{Number(adjustUser.wallet_balance).toLocaleString()}</span></p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Amount (positive to add, negative to deduct)</label>
                <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="e.g. 500 or -200"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reason / Note</label>
                <input type="text" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Refund, Bonus, etc."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
              </div>
              <button onClick={handleAdjust} disabled={submitting}
                className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
