import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { parseWorkbook } from "@/lib/excel";
import { getStore, saveStore } from "@/lib/store";

export async function POST(req: Request) {
  const a = await requireUser("upload");
  if ("res" in a) return a.res;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach an .xlsx file as 'file'" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "File too large (25MB max)" }, { status: 413 });
  let parsed;
  try { parsed = parseWorkbook(Buffer.from(await file.arrayBuffer())); }
  catch { return NextResponse.json({ error: "Could not read the workbook" }, { status: 400 }); }

  const store = getStore();
  if (parsed.borrowers?.length) store.borrowers = parsed.borrowers;
  if (parsed.calls?.length) store.calls = parsed.calls;
  if (parsed.agents?.length) store.agents = parsed.agents;
  const applied = !!(parsed.borrowers?.length || parsed.calls?.length || parsed.agents?.length);
  if (applied) { store.source = "excel"; saveStore(store); }
  return NextResponse.json({ applied, report: parsed.report, source: store.source });
}
