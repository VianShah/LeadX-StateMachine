import type { ReactNode } from "react";

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

const BADGE: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700", "Paid via link": "bg-emerald-100 text-emerald-700",
  PTP: "bg-blue-100 text-blue-700", Partial: "bg-sky-100 text-sky-700", Callback: "bg-amber-100 text-amber-700",
  Dispute: "bg-orange-100 text-orange-700", "No Contact": "bg-slate-100 text-slate-600", Escalated: "bg-red-100 text-red-700",
  "Link clicked": "bg-amber-100 text-amber-700", Shared: "bg-blue-100 text-blue-700", "Not shared": "bg-slate-100 text-slate-500",
  Prime: "bg-emerald-100 text-emerald-700", "Near-prime": "bg-amber-100 text-amber-700", Subprime: "bg-red-100 text-red-700",
  Visible: "bg-emerald-100 text-emerald-700", Hidden: "bg-slate-200 text-slate-600",
};
export const Badge = ({ children }: { children: string }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[children] ?? "bg-slate-100 text-slate-600"}`}>{children}</span>
);

export const Offline = ({ show }: { show: boolean }) =>
  show ? <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">Server unreachable. Showing local fallback data; actions are kept in this browser only.</div> : null;

export const Loading = () => <div className="p-6 text-sm text-slate-500">Loading…</div>;

export const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#94a3b8"];
