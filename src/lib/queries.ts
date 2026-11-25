import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./ipc";
import type { Bootstrap } from "./types";

export function useBootstrap() {
  return useQuery<Bootstrap>({
    queryKey: ["bootstrap"],
    queryFn: api.bootstrap,
    staleTime: 5_000,
  });
}

export function useAccounts(month?: string) {
  return useQuery({
    queryKey: ["accounts", month ?? "current"],
    queryFn: () => api.accounts(month),
  });
}

export function useEvents(p: {
  fromMonth?: string;
  toMonth?: string;
  accountId?: string;
  kind?: string;
  search?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["events", p],
    queryFn: () => api.listEvents(p),
  });
}

export function useEventDetail(id: string | null) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: () => api.eventDetail(id!),
    enabled: !!id,
  });
}

export function useObligations(includeDone = false, kind?: string) {
  return useQuery({
    queryKey: ["obligations", includeDone, kind],
    queryFn: () => api.listObligations(includeDone, kind),
  });
}

export function useQuotaGrants(fromMonth: string, toMonth: string, enabled = true) {
  return useQuery({
    queryKey: ["quota-grants", fromMonth, toMonth],
    queryFn: () => api.quotaGrants(fromMonth, toMonth),
    enabled: enabled && !!fromMonth && !!toMonth,
  });
}

export function useQuotaHistory(accountId: string | null) {
  return useQuery({
    queryKey: ["quota-history", accountId],
    queryFn: () => api.quotaHistory(accountId!),
    enabled: !!accountId,
  });
}

export function useBudget(month: string) {
  return useQuery({
    queryKey: ["budget", month],
    queryFn: () => api.reportBudget(month),
  });
}

export function useForward(months = 12, fromMonth?: string) {
  return useQuery({
    queryKey: ["forward", months, fromMonth ?? "current"],
    queryFn: () => api.reportForward(months, fromMonth),
  });
}

export function useCapacity(month?: string) {
  return useQuery({
    queryKey: ["capacity", month ?? "current"],
    queryFn: () => api.reportCapacity(month),
  });
}

export function usePnl(from: string, to: string) {
  return useQuery({
    queryKey: ["pnl", from, to],
    queryFn: () => api.reportPnl(from, to),
  });
}

export function useCash(from: string, to: string) {
  return useQuery({
    queryKey: ["cash", from, to],
    queryFn: () => api.reportCash(from, to),
  });
}

export function useHabit(months = 12, toMonth?: string) {
  return useQuery({
    queryKey: ["habit", months, toMonth ?? "current"],
    queryFn: () => api.reportHabit(months, toMonth),
  });
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries();
  };
}
