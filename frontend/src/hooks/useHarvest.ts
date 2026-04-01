import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { HarvestConfig, Withdrawal } from '@trading-agent/types';

type HarvestStatus = {
  realizedPnL: number;
  config: HarvestConfig;
  fixedProgress: number | null;
  pctProgress: number | null;
};

export const useHarvestStatus = () =>
  useQuery({
    queryKey: ['harvest-status'],
    queryFn: () => api.get<HarvestStatus>('/api/harvest/status'),
    refetchInterval: 60_000, // refresh every minute
  });

export const useHarvestConfig = () =>
  useQuery({
    queryKey: ['harvest-config'],
    queryFn: () => api.get<HarvestConfig>('/api/harvest/config'),
  });

export const useWithdrawals = () =>
  useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => api.get<Withdrawal[]>('/api/harvest/withdrawals'),
  });

export const useUpdateHarvestConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: Partial<HarvestConfig>) =>
      api.put<HarvestConfig>('/api/harvest/config', config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['harvest-config'] });
      void queryClient.invalidateQueries({ queryKey: ['harvest-status'] });
    },
  });
};

export const useConfirmWithdrawal = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, achReference }: { id: string; achReference?: string }) =>
      api.post<Withdrawal>(`/api/harvest/confirm/${id}`, { achReference }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      void queryClient.invalidateQueries({ queryKey: ['harvest-status'] });
    },
  });
};
