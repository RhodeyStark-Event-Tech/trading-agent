import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import type { Position } from '@trading-agent/types';

export const usePositions = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .gt('quantity', 0)
        .order('unrealized_pnl', { ascending: false });
      if (error) throw new Error(error.message);
      return data as Position[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('positions-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['positions'] });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);

  return query;
};
