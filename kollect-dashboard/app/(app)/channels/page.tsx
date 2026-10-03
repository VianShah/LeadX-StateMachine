"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useApp } from "@/components/ctx";
import { useApi } from "@/components/useApi";
import { localStore } from "@/components/local";
import { Card, Loading, Offline } from "@/components/ui";
import { CAN } from "@/lib/roles";
import type { Agent } from "@/lib/types";

interface Data { agents: Agent[]; globalMax: number; live: number }
const Bar = ({ live, max }: { live: number; max: number }) => (
  <div className="flex items-center gap-2">
    <div className="h-2 w-28 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${live / (max || 1) > 0.85 ? "bg-red-500" : "bg-indigo-600"}`} style={{ width: `${Math.min(100, (live / (max || 1)) * 100)}%` }} /></div>
    <span className="text-xs tabular-nums">{live}/{max}</span>
  </div>
);

export default function Channels() {
  const { user } = useApp();
  const canEdit = CAN.editCapacity.includes(user.role);
  const fallback = (): Data => { const s = localStore(); return { agents: s.agents, globalMax: s.globalMax, live: s.agents.reduce((a, x) => a + x.live, 0) }; };
  const { data, setData, offline, loading } = useApi<Data>("/api/channels", fallback, 5000);
  const [gm, setGm] = useState("");
  useEffect(() => { if (data && gm === "") setGm(String(data.globalMax)); }, [data, gm]);
  if (loading || !data) return <Loading />;

  async function patch(body: object, local: (d: Data) => Data) {
    try {
      const res = await fetch("/api/channels", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { const next = await res.json(); setData(next); setGm(String(next.globalMax)); return; }
    } catch { /* fall through */ }
    setData((cur) => (cur ? local(cur) : cur));
  }
  const recalcLocal = (cur: Data, globalMax: number): Data => {
    const total = cur.agents.reduce((s, a) => s + a.max, 0) || 1;
    const agents = cur.agents.map((a) => { const max = Math.max(1, Math.round((a.max / total) * globalMax)); return { ...a, max, live: Math.min(a.live, max) }; });
    return { agents, globalMax, live: agents.reduce((s, a) => s + a.live, 0) };
  };

  return (
    <>
      <Offline show={offline} />
      <Card title="Global capacity" right={<span className="text-xs text-slate-500">Auto-refreshes every 5s</span>}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-64 flex-1">
            <div className="mb-1 flex justify-between text-sm"><span>Live calls in flight</span><span className="font-semibold">{data.live}/{data.globalMax}</span></div>
            <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (data.live / data.globalMax) * 100)}%` }} /></div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Global max</label>
              <input className="input w-20" type="number" min={1} value={gm} onChange={(e) => setGm(e.target.value)} />
              <button className="btn btn-primary" onClick={() => { const v = Number(gm); if (v > 0) patch({ globalMax: v, recalculate: true }, (c) => recalcLocal(c, v)); }}><RefreshCw size={14} /> Recalculate</button>
            </div>
          )}
        </div>
      </Card>
      <Card title="Agents">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead><tr><th>Agent</th><th>Campaign code</th><th>Business</th><th>Product</th><th>Language</th><th>Voice</th><th>Live / Max</th>{canEdit && <th>Max</th>}<th>Feedback</th></tr></thead>
            <tbody className="divide-y">
              {data.agents.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.name}</td><td><code className="text-xs">{a.code}</code></td><td>{a.business}</td><td>{a.product}</td><td>{a.language}</td><td>{a.voice}</td>
                  <td><Bar live={a.live} max={a.max} /></td>
                  {canEdit && <td><input className="input w-16" type="number" min={0} defaultValue={a.max} key={a.max} onBlur={(e) => { const v = Number(e.target.value); if (v !== a.max && v >= 0) patch({ agentId: a.id, max: v }, (c) => ({ ...c, agents: c.agents.map((x) => (x.id === a.id ? { ...x, max: v, live: Math.min(x.live, v) } : x)) })); }} /></td>}
                  <td className="space-x-1 text-xs"><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">{a.resolved} resolved</span><span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">{a.open} open</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
