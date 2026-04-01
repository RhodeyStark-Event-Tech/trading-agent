import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import type { Signal } from '@trading-agent/types';

export const useSignals = (limit = 50) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['signals', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data as Signal[];
    },
  });

  // Real-time: push new signals into cache
  useEffect(() => {
    const channel = supabase
      .channel('signals-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
        queryClient.setQueryData<Signal[]>(['signals', limit], (prev) =>
          [payload.new as Signal, ...(prev ?? [])].slice(0, limit),
        );
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [limit, queryClient]);

  return query;
};
