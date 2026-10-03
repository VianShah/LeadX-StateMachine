import { NextResponse } from "next/server";
import { filtersFrom, requireUser } from "@/lib/api";
import { scopeFor } from "@/lib/auth";
import { scoped } from "@/lib/metrics";
import { getStore, saveStore } from "@/lib/store";

export async function GET(req: Request) {
  const a = await requireUser();
  if ("res" in a) return a.res;
  const { calls } = scoped(getStore(), filtersFrom(new URL(req.url)), scopeFor(a.user));
  return NextResponse.json({ calls: calls.slice(0, 1000) });
}

// { id, visible }
export async function PATCH(req: Request) {
  const a = await requireUser("hideCall");
  if ("res" in a) return a.res;
  const { id, visible } = await req.json().catch(() => ({}));
  const store = getStore();
  const c = store.calls.find((x) => x.id === id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  c.visible = !!visible;
  saveStore(store);
  return NextResponse.json({ call: c });
}
