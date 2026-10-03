"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LayoutDashboard, BarChart3, Users, Radio, ShieldCheck, Gauge, Database, LogOut } from "lucide-react";
import { ACCESS, MODULES, ROLE_LABEL } from "@/lib/roles";
import { PORTFOLIOS } from "@/lib/mock";
import type { Filters } from "@/lib/types";
import type { SessionUser } from "@/lib/auth";
import { AppCtx } from "./ctx";

const ICONS = { home: LayoutDashboard, performance: BarChart3, borrowers: Users, channels: Radio, audit: ShieldCheck, usage: Gauge, data: Database };

export default function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({ range: "30d", portfolio: "all", channel: "all" });
  const allowed = ACCESS[user.role];
  const current = MODULES.find((m) => path.startsWith(m.href));
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, String(v)));
    return p.toString();
  }, [filters]);
  const showFilters = current && ["home", "performance", "borrowers", "audit", "usage"].includes(current.key);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }

  return (
    <AppCtx.Provider value={{ user, filters, setFilters, qs }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-slate-900 p-3 text-slate-300">
          <div className="px-2 py-3"><div className="text-lg font-bold text-white">Kollect</div><div className="text-xs text-slate-400">by Predixion AI</div></div>
          <nav className="mt-2 flex-1 space-y-1">
            {MODULES.filter((m) => allowed.includes(m.key)).map((m) => {
              const Icon = ICONS[m.key];
              const active = path.startsWith(m.href);
              return (
                <Link key={m.key} href={m.href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-indigo-600 text-white" : "hover:bg-slate-800"}`}>
                  <Icon size={16} /> {m.label}
                </Link>
              );
            })}
          </nav>
          <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-800"><LogOut size={16} /> Sign out</button>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
            <h1 className="mr-auto text-lg font-semibold">{current?.label}</h1>
            {showFilters && (
              <>
                <div className="flex overflow-hidden rounded-lg border border-slate-300">
                  {(["today", "7d", "30d", "mtd", "custom"] as const).map((r) => (
                    <button key={r} onClick={() => setFilters({ ...filters, range: r })} className={`px-3 py-1.5 text-sm ${filters.range === r ? "bg-indigo-600 text-white" : "bg-white hover:bg-slate-50"}`}>
                      {r === "today" ? "Today" : r === "mtd" ? "MTD" : r === "custom" ? "Custom" : r.toUpperCase()}
                    </button>
                  ))}
                </div>
                {filters.range === "custom" && (
                  <>
                    <input type="date" className="input" value={filters.from ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
                    <input type="date" className="input" value={filters.to ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
                  </>
                )}
                {user.role !== "client" && (
                  <select className="input" value={filters.portfolio} onChange={(e) => setFilters({ ...filters, portfolio: e.target.value })}>
                    <option value="all">All portfolios</option>
                    {PORTFOLIOS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                )}
                <select className="input" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
                  <option value="all">All channels</option>
                  <option>AI Voice</option><option>WhatsApp</option><option>Human Desk</option>
                </select>
              </>
            )}
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">{ROLE_LABEL[user.role]}{user.portfolio ? ` · ${user.portfolio}` : ""}</span>
          </header>
          <main className="space-y-4 p-6">{children}</main>
        </div>
      </div>
    </AppCtx.Provider>
  );
}
