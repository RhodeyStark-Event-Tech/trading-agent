import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import toast from 'react-hot-toast';
import type { Trade } from '@trading-agent/types';

const statusColor: Record<string, string> = {
  filled:    'bg-green-500/20 text-green-400',
  pending:   'bg-yellow-500/20 text-yellow-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  rejected:  'bg-red-500/20 text-red-400',
};

export default function TradesPage() {
  const { data: trades, isLoading, error } = useQuery<Trade[]>({
    queryKey: ['trades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data as Trade[];
    },
  });

  useEffect(() => {
    if (error) toast.error(`Failed to load trades: ${(error as Error).message}`);
  }, [error]);

  const totalRealized = trades
    ?.filter((t) => t.status === 'filled')
    .reduce((acc, t) => t.action === 'SELL' ? acc + t.price * t.quantity : acc - t.price * t.quantity, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Trade History</h2>
        <div className={`text-sm font-semibold ${totalRealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          Realized P&L: {totalRealized >= 0 ? '+' : ''}${totalRealized.toFixed(2)}
        </div>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading trades...</p>}

      {trades && trades.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
              <tr>
                {['Ticker', 'Action', 'Qty', 'Price', 'Value', 'Status', 'Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {trades.map((t: Trade) => (
                <tr key={t.id} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-white">{t.ticker}</td>
                  <td className={`px-4 py-3 font-semibold ${t.action === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.action}
                  </td>
                  <td className="px-4 py-3">{t.quantity}</td>
                  <td className="px-4 py-3">${t.price.toFixed(2)}</td>
                  <td className="px-4 py-3">${(t.price * t.quantity).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColor[t.status] ?? ''}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
