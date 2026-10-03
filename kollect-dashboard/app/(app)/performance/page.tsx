"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/ctx";
import { useApi } from "@/components/useApi";
import { localStore } from "@/components/local";
import { Badge, COLORS, Card, Loading, Offline } from "@/components/ui";
import { computePerformance } from "@/lib/metrics";
import { inr, inrFull, num } from "@/lib/format";

const TABS = ["Overview", "Stages", "Channels", "Escalations", "Regions"] as const;

export default function Performance() {
  const { qs, filters, user } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const scope = user.role === "client" ? { portfolio: user.portfolio, visibleOnly: true } : {};
  const { data, offline, loading } = useApi(`/api/performance?${qs}`, () => computePerformance(localStore(), filters, scope));
  if (loading || !data) return <Loading />;
  const top = data.funnel[0].value || 1;

  const groupTable = (rows: typeof data.stages, label: string) => (
    <Card title={`By ${label}`}>
      <table className="w-full"><thead><tr><th>{label}</th><th>Assigned</th><th>Contacted</th><th>PTP</th><th>Recovered</th><th>Outstanding</th><th>Recovered ₹</th></tr></thead>
        <tbody className="divide-y">{rows.map((r) => (
          <tr key={r.name}><td className="font-medium">{r.name}</td><td>{num(r.assigned)}</td><td>{num(r.contacted)}</td><td>{num(r.ptp)}</td><td>{num(r.recovered)}</td><td>{inr(r.outstanding)}</td><td>{inr(r.recoveredAmount)}</td></tr>
        ))}</tbody></table>
    </Card>
  );

  return (
    <>
      <Offline show={offline} />
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t}</button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Recovery Funnel">
            <div className="space-y-3">
              {data.funnel.map((f, i) => (
                <div key={f.stage}>
                  <div className="mb-1 flex justify-between text-sm"><span>{f.stage}</span><span className="font-medium">{num(f.value)} <span className="text-slate-400">({((f.value / top) * 100).toFixed(0)}%)</span></span></div>
                  <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full" style={{ width: `${(f.value / top) * 100}%`, background: COLORS[i] }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Dispositions">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.dispositions} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {data.dispositions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Non-Contact Analysis">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.nonContact} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" fontSize={11} width={100} />
                <Tooltip /><Bar dataKey="value" name="Calls" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Connectivity by Attempt">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.attempts}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="attempt" fontSize={11} /><YAxis fontSize={11} />
                <Tooltip /><Legend />
                <Bar dataKey="calls" name="Calls" fill="#c7d2fe" /><Bar dataKey="connected" name="Connected" fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
      {tab === "Stages" && groupTable(data.stages, "Segment")}
      {tab === "Channels" && groupTable(data.channels, "Channel")}
      {tab === "Regions" && groupTable(data.regions, "Region")}
      {tab === "Escalations" && (
        <Card title={`Open escalations (top ${data.escalations.length} by outstanding)`}>
          <table className="w-full"><thead><tr><th>Borrower</th><th>Loan ID</th><th>Portfolio</th><th>DPD</th><th>Outstanding</th><th>Status</th></tr></thead>
            <tbody className="divide-y">{data.escalations.map((b) => (
              <tr key={b.id}><td>{b.name}</td><td>{b.loanId}</td><td>{b.portfolio}</td><td>{b.dpd}</td><td>{inrFull(b.outstanding)}</td><td><Badge>{b.disposition}</Badge></td></tr>
            ))}</tbody></table>
        </Card>
      )}
    </>
  );
}
