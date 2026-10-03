import { NextResponse } from "next/server";
import { can, getSession, type SessionUser } from "./auth";
import type { Action } from "./roles";
import type { Filters } from "./types";

export async function requireUser(action?: Action): Promise<{ user: SessionUser } | { res: NextResponse }> {
  const user = await getSession();
  if (!user) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (action && !can(user, action)) return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export function filtersFrom(url: URL): Filters {
  const p = url.searchParams;
  return {
    range: (p.get("range") as Filters["range"]) ?? "30d",
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    portfolio: p.get("portfolio") ?? undefined,
    channel: p.get("channel") ?? undefined,
  };
}
