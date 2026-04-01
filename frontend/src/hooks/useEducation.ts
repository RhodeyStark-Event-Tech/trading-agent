import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import type { EducationCard } from '@trading-agent/types';

export const useEducation = (limit = 50) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['education', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('education_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data as EducationCard[];
    },
  });

  // Real-time: push new education cards into cache
  useEffect(() => {
    const channel = supabase
      .channel('education-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'education_cards' }, (payload) => {
        queryClient.setQueryData<EducationCard[]>(['education', limit], (prev) =>
          [payload.new as EducationCard, ...(prev ?? [])].slice(0, limit),
        );
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [limit, queryClient]);

  return query;
};
