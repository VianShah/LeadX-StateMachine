import { NextResponse } from "next/server";
import { filtersFrom, requireUser } from "@/lib/api";
import { scopeFor } from "@/lib/auth";
import { computePerformance } from "@/lib/metrics";
import { getStore } from "@/lib/store";

export async function GET(req: Request) {
  const a = await requireUser();
  if ("res" in a) return a.res;
  return NextResponse.json(computePerformance(getStore(), filtersFrom(new URL(req.url)), scopeFor(a.user)));
}
