"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Fetches from the API route; if the server is unreachable/erroring, falls back to local computation
// (client-side mock) so the UI keeps working. Optional polling for live views.
export function useApi<T>(url: string, fallback: () => T, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const fb = useRef(fallback);
  fb.current = fallback;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (res.status === 403) throw new Error("forbidden");
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setOffline(false);
    } catch {
      setData(fb.current());
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    load();
    if (!pollMs) return;
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { data, setData, offline, loading, reload: load };
}
