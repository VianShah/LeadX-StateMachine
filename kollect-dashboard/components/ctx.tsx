"use client";
import { createContext, useContext } from "react";
import type { Filters, Role } from "@/lib/types";

export interface Ctx {
  user: { username: string; name: string; role: Role; portfolio?: string };
  filters: Filters;
  setFilters: (f: Filters) => void;
  qs: string;
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);
