import { usePositions } from '../hooks/usePositions.js';
import type { Position } from '@trading-agent/types';

const pnlColor = (val: number) =>
  val >= 0 ? 'text-green-400' : 'text-red-400';

const fmt = (val: number) =>
  `${val >= 0 ? '+' : ''}$${val.toFixed(2)}`;

export default function PositionsPage() {
  const { data: positions, isLoading, error } = usePositions();

  const totalPnL = positions?.reduce((acc, p) => acc + p.unrealizedPnl, 0) ?? 0;
  const totalCost = positions?.reduce((acc, p) => acc + p.quantity * p.avgCost, 0) ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Open Positions</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Open Positions" value={String(positions?.length ?? 0)} />
        <StatCard label="Total Cost Basis" value={`$${totalCost.toLocaleString()}`} />
        <StatCard
          label="Unrealized P&L"
          value={fmt(totalPnL)}
          className={pnlColor(totalPnL)}
        />
      </div>

      {/* Table */}
      {isLoading && <p className="text-gray-500 text-sm">Loading positions...</p>}
      {error && <p className="text-red-400 text-sm">Error: {error.message}</p>}
      {!isLoading && positions?.length === 0 && (
        <p className="text-gray-500 text-sm">No open positions.</p>
      )}
      {positions && positions.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
              <tr>
                {['Ticker', 'Qty', 'Avg Cost', 'Market Value', 'Unrealized P&L', 'Updated'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {positions.map((p: Position) => (
                <tr key={p.id} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-white">{p.ticker}</td>
                  <td className="px-4 py-3">{p.quantity}</td>
                  <td className="px-4 py-3">${p.avgCost.toFixed(2)}</td>
                  <td className="px-4 py-3">${(p.quantity * p.avgCost).toFixed(2)}</td>
                  <td className={`px-4 py-3 font-semibold ${pnlColor(p.unrealizedPnl)}`}>
                    {fmt(p.unrealizedPnl)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(p.updatedAt).toLocaleString()}
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

function StatCard({ label, value, className = 'text-white' }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${className}`}>{value}</p>
    </div>
  );
}
