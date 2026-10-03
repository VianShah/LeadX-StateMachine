"use client";
// Client-side fallback store (same seeded mock as the server) used when the API is unreachable.
import { generateStore } from "@/lib/mock";
import type { Store } from "@/lib/types";

let cache: Store | null = null;
export const localStore = (): Store => (cache ??= generateStore());
