import { useState } from 'react';
import {
  useHarvestStatus,
  useWithdrawals,
  useUpdateHarvestConfig,
  useConfirmWithdrawal,
} from '../hooks/useHarvest.js';
import toast from 'react-hot-toast';
import type { Withdrawal } from '@trading-agent/types';

const statusColor: Record<string, string> = {
  notified:  'bg-yellow-500/20 text-yellow-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

export default function HarvestPage() {
  const { data: status } = useHarvestStatus();
  const { data: withdrawals } = useWithdrawals();
  const updateConfig = useUpdateHarvestConfig();
  const confirmWithdrawal = useConfirmWithdrawal();

  const [achRef, setAchRef] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const config = status?.config;
  const fixedPct = status?.fixedProgress != null ? Math.min(status.fixedProgress * 100, 100) : 0;
  const pctPct = status?.pctProgress != null ? Math.min(status.pctProgress * 100, 100) : 0;

  const handleToggle = () => {
    if (!config) return;
    const next = !config.enabled;
    updateConfig.mutate(
      { ...config, enabled: next },
      {
        onSuccess: () => toast.success(next ? 'Harvest enabled' : 'Harvest disabled'),
        onError: () => toast.error('Failed to update harvest status'),
      },
    );
  };

  const handleConfirm = (id: string) => {
    confirmWithdrawal.mutate(
      { id, achReference: achRef || undefined },
      {
        onSuccess: () => toast.success('Withdrawal confirmed'),
        onError: () => toast.error('Failed to confirm withdrawal'),
      },
    );
    setConfirmingId(null);
    setAchRef('');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Profit Harvest</h2>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-500">Realized P&L (since last harvest)</p>
          <p className={`text-3xl font-bold ${(status?.realizedPnL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${(status?.realizedPnL ?? 0).toFixed(2)}
          </p>

          <div className="space-y-2">
            <ProgressBar label={`Fixed threshold ($${config?.fixedAmount ?? 500})`} pct={fixedPct} />
            <ProgressBar label={`% return threshold (${((config?.pctReturn ?? 0.05) * 100).toFixed(0)}%)`} pct={pctPct} />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <p className="text-xs text-gray-500">Harvest Settings</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ConfigRow label="Fixed threshold" value={`$${config?.fixedAmount ?? 500}`} />
            <ConfigRow label="% return trigger" value={`${((config?.pctReturn ?? 0.05) * 100).toFixed(0)}%`} />
            <ConfigRow label="Reserve" value={`${config?.reservePct ?? 20}%`} />
            <ConfigRow label="Cooldown" value={`${config?.cooldownDays ?? 7} days`} />
          </div>
          <button
            onClick={handleToggle}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
              config?.enabled
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {config?.enabled ? '⏸ Disable Harvest' : '▶ Enable Harvest'}
          </button>
        </div>
      </div>

      {/* Withdrawal History */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Withdrawal History</h3>
        {!withdrawals?.length && (
          <p className="text-gray-600 text-sm">No withdrawals yet.</p>
        )}
        <div className="space-y-2">
          {withdrawals?.map((w: Withdrawal) => (
            <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColor[w.status] ?? ''}`}>
                      {w.status}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">{w.triggerType} trigger</span>
                  </div>
                  <p className="text-lg font-bold text-white">${w.withdrawalAmount.toFixed(2)}</p>
                  <p className="text-xs text-gray-500">
                    P&L at trigger: ${w.realizedPnlAtTrigger.toFixed(2)} · Reserve: ${w.reserveRetained.toFixed(2)}
                  </p>
                  {w.achReference && (
                    <p className="text-xs text-gray-600">ACH Ref: {w.achReference}</p>
                  )}
                </div>
                <div className="text-right space-y-2">
                  <p className="text-xs text-gray-600">{new Date(w.createdAt).toLocaleString()}</p>
                  {w.status === 'notified' && (
                    confirmingId === w.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={achRef}
                          onChange={(e) => setAchRef(e.target.value)}
                          placeholder="ACH reference (optional)"
                          className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirm(w.id)}
                            className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded px-3 py-1"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="flex-1 text-xs bg-gray-700 text-gray-300 rounded px-3 py-1"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(w.id)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1.5"
                      >
                        Mark Completed
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-white">{value}</p>
    </div>
  );
}
