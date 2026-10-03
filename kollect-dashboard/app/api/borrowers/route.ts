import { NextResponse } from "next/server";
import { filtersFrom, requireUser } from "@/lib/api";
import { scopeFor } from "@/lib/auth";
import { scoped } from "@/lib/metrics";
import { getStore, saveStore } from "@/lib/store";

export async function GET(req: Request) {
  const a = await requireUser();
  if ("res" in a) return a.res;
  const { borrowers } = scoped(getStore(), filtersFrom(new URL(req.url)), scopeFor(a.user));
  return NextResponse.json({ borrowers });
}

// Actions: { id, action: "sendLink" | "escalate" }
export async function POST(req: Request) {
  const { id, action } = await req.json().catch(() => ({}));
  const a = await requireUser(action === "escalate" ? "escalate" : "sendLink");
  if ("res" in a) return a.res;
  const store = getStore();
  const b = store.borrowers.find((x) => x.id === id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "sendLink") b.paymentLink = "Shared";
  else if (action === "escalate") { b.disposition = "Escalated"; b.channel = "Human Desk"; }
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  saveStore(store);
  return NextResponse.json({ borrower: b });
}
