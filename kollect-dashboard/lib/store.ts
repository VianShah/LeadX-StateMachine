// Server-only in-memory store, persisted to data/store.json (swap for a DB later).
import fs from "fs";
import path from "path";
import { generateStore } from "./mock";
import type { Store } from "./types";

const FILE = path.join(process.cwd(), "data", "store.json");
const g = globalThis as unknown as { __kollect?: Store };

export function getStore(): Store {
  if (g.__kollect) return g.__kollect;
  try {
    if (fs.existsSync(FILE)) g.__kollect = JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    /* fall through to mock */
  }
  return (g.__kollect ??= generateStore());
}

export function saveStore(s: Store) {
  s.updatedAt = new Date().toISOString();
  g.__kollect = s;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s));
  } catch {
    /* read-only filesystem: keep in memory only */
  }
}

export function resetStore() {
  try { fs.rmSync(FILE, { force: true }); } catch { /* ignore */ }
  g.__kollect = generateStore();
  return g.__kollect;
}
