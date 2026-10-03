import { NextResponse } from "next/server";
import { getStore, saveStore } from "@/lib/store";
import type { Call } from "@/lib/types";

// Webhook for dialer / WhatsApp platforms. Auth: `x-api-key` header = INGEST_KEY.
// Body: { calls?: Call[], agents?: { code: string; live?: number; max?: number }[] }
export async function POST(req: Request) {
  if (req.headers.get("x-api-key") !== (process.env.INGEST_KEY ?? "dev-key"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const store = getStore();
  let calls = 0, agents = 0;
  if (Array.isArray(body.calls)) {
    const incoming = (body.calls as Call[]).filter((c) => c.callId && c.ts && c.campaign);
    const known = new Set(store.calls.map((c) => c.callId));
    for (const c of incoming) {
      if (known.has(c.callId)) continue;
      store.calls.unshift({ ...c, id: `I${store.calls.length + 1}`, visible: c.visible ?? true, connected: c.connected ?? c.durationSec > 0 });
      calls++;
    }
  }
  if (Array.isArray(body.agents)) {
    for (const u of body.agents as { code: string; live?: number; max?: number }[]) {
      const ag = store.agents.find((x) => x.code === u.code);
      if (!ag) continue;
      if (typeof u.max === "number") ag.max = u.max;
      if (typeof u.live === "number") ag.live = Math.min(u.live, ag.max);
      agents++;
    }
  }
  if (calls || agents) { store.source = "api"; saveStore(store); }
  return NextResponse.json({ calls, agents });
}
