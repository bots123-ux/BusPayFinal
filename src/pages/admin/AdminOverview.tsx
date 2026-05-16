import { useEffect, useState } from "react";
import { Users, CreditCard, Ticket, Bus, TrendingUp, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Stats {
  total_users: number; total_revenue: number; total_tickets: number;
  tickets_today: number; revenue_today: number; active_trips: number;
  trips_upcoming: number;
  revenue_by_route: { route: string; revenue: number; tickets: number }[];
  revenue_7days: { date: string; revenue: number }[];
}

const COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6"];

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400 font-medium">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-extrabold text-white">{value}</div>
      {sub && <div className="mt-1 flex items-center gap-1 text-xs text-green-400"><ArrowUpRight className="h-3 w-3" />{sub}</div>}
    </div>
  );
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("admin_get_stats").then(({ data }) => {
      if (data) setStats(data as Stats);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-slate-800 animate-pulse" />)}
      </div>
    </div>
  );

  const chartData = (stats?.revenue_7days ?? []).map(d => ({
    date: format(new Date(d.date), "MMM d"),
    revenue: Number(d.revenue),
  }));

  const routeData = (stats?.revenue_by_route ?? []).map(r => ({
    name: r.route.replace("Manila → ", "→ ").replace(" → Manila", " →"),
    revenue: Number(r.revenue),
    tickets: Number(r.tickets),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Dashboard Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Welcome back, Admin · {format(new Date(), "EEEE, MMMM d yyyy")}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={stats?.total_users ?? 0} sub="Registered passengers" color="bg-blue-500/20 text-blue-400" />
        <StatCard icon={CreditCard} label="Total Revenue" value={`₱${Number(stats?.total_revenue ?? 0).toLocaleString()}`} sub={`₱${Number(stats?.revenue_today ?? 0).toLocaleString()} today`} color="bg-orange-500/20 text-orange-400" />
        <StatCard icon={Ticket} label="Total Tickets" value={stats?.total_tickets ?? 0} sub={`${stats?.tickets_today ?? 0} booked today`} color="bg-green-500/20 text-green-400" />
        <StatCard icon={Bus} label="Active Trips" value={stats?.active_trips ?? 0} sub={`${stats?.trips_upcoming ?? 0} upcoming`} color="bg-purple-500/20 text-purple-400" />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue 7 days */}
        <div className="col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-white">Revenue — Last 7 Days</h2>
              <p className="text-xs text-slate-400">Daily earnings in PHP</p>
            </div>
            <TrendingUp className="h-5 w-5 text-orange-400" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₱${v}`} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} dot={{ fill: "#f97316", r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by route pie */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-bold text-white mb-1">Revenue by Route</h2>
          <p className="text-xs text-slate-400 mb-4">Breakdown per route</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={routeData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={70} strokeWidth={0}>
                {routeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "Revenue"]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {routeData.slice(0, 4).map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-slate-400 truncate flex-1">{r.name}</span>
                <span className="text-white font-semibold">₱{Number(r.revenue).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tickets by route bar chart */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="font-bold text-white mb-1">Tickets Sold by Route</h2>
        <p className="text-xs text-slate-400 mb-4">All-time ticket count per route</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={routeData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#f1f5f9" }} />
            <Bar dataKey="tickets" fill="#f97316" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
