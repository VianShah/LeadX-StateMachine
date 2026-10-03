import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { getStore, saveStore } from "@/lib/store";

export async function GET() {
  const a = await requireUser();
  if ("res" in a) return a.res;
  const store = getStore();
  // Simulate live drift while data is mock; real/ingested sources report their own live counts.
  if (store.source === "mock") {
    for (const ag of store.agents) {
      ag.live = Math.max(0, Math.min(ag.max, ag.live + Math.round(Math.random() * 2 - 1)));
    }
  }
  const live = store.agents.reduce((s, x) => s + x.live, 0);
  return NextResponse.json({ agents: store.agents, globalMax: store.globalMax, live });
}

// { globalMax?, recalculate?, agentId?, max? }
export async function PATCH(req: Request) {
  const a = await requireUser("editCapacity");
  if ("res" in a) return a.res;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  if (typeof body.globalMax === "number" && body.globalMax > 0) store.globalMax = Math.floor(body.globalMax);
  if (body.agentId && typeof body.max === "number") {
    const ag = store.agents.find((x) => x.id === body.agentId);
    if (ag) { ag.max = Math.max(0, Math.floor(body.max)); ag.live = Math.min(ag.live, ag.max); }
  }
  if (body.recalculate) {
    const total = store.agents.reduce((s, x) => s + x.max, 0) || 1;
    store.agents.forEach((ag) => { ag.max = Math.max(1, Math.round((ag.max / total) * store.globalMax)); ag.live = Math.min(ag.live, ag.max); });
  }
  saveStore(store);
  const live = store.agents.reduce((s, x) => s + x.live, 0);
  return NextResponse.json({ agents: store.agents, globalMax: store.globalMax, live });
}
