import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { resetStore } from "@/lib/store";

export async function POST() {
  const a = await requireUser("upload");
  if ("res" in a) return a.res;
  return NextResponse.json({ source: resetStore().source });
}
