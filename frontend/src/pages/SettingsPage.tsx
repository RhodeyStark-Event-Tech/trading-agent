import { useState, useEffect } from 'react';
import { useHarvestConfig, useUpdateHarvestConfig } from '../hooks/useHarvest.js';
import { Save, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { data: config, isLoading } = useHarvestConfig();
  const updateConfig = useUpdateHarvestConfig();

  const [fixedAmount, setFixedAmount] = useState('');
  const [pctReturn, setPctReturn] = useState('');
  const [reservePct, setReservePct] = useState('');
  const [cooldownDays, setCooldownDays] = useState('');
  const [enabled, setEnabled] = useState(false);

  // Populate form when config loads
  useEffect(() => {
    if (!config) return;
    setFixedAmount(String(config.fixedAmount ?? ''));
    const pct = config.pctReturn ?? 0;
    setPctReturn(String(pct <= 1 ? pct * 100 : pct));
    setReservePct(String(config.reservePct ?? ''));
    setCooldownDays(String(config.cooldownDays ?? ''));
    setEnabled(Boolean(config.enabled));
  }, [config]);

  const validate = () => {
    const errors: string[] = [];
    if (Number(fixedAmount) <= 0) errors.push('Fixed amount must be positive');
    if (Number(pctReturn) <= 0 || Number(pctReturn) > 100) errors.push('Percentage return must be between 0 and 100');
    if (Number(reservePct) < 0 || Number(reservePct) > 100) errors.push('Reserve % must be between 0 and 100');
    if (!Number.isInteger(Number(cooldownDays)) || Number(cooldownDays) < 1) errors.push('Cooldown must be at least 1 day');
    return errors;
  };

  const handleSave = () => {
    const errors = validate();
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    updateConfig.mutate(
      {
        fixedAmount: Number(fixedAmount),
        pctReturn: Number(pctReturn) / 100,
        reservePct: Number(reservePct),
        cooldownDays: Number(cooldownDays),
        enabled,
      } as Parameters<typeof updateConfig.mutate>[0],
      {
        onSuccess: () => toast.success('Harvest settings saved'),
        onError: (err) => toast.error(`Failed to save — ${(err as Error).message}`),
      },
    );
  };

  const errors = validate();
  const hasChanges = config != null;

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
        <p className="text-gray-500">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

      {/* Harvest Configuration */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl">
        <h3 className="text-lg font-semibold text-white mb-1">Profit Harvesting</h3>
        <p className="text-sm text-gray-500 mb-6">
          Configure when and how profits are harvested from your account.
        </p>

        <div className="space-y-5">
          {/* Enabled Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-300">Harvest Enabled</label>
              <p className="text-xs text-gray-500">Master switch for automatic profit harvesting</p>
            </div>
            <button
              type="button"
              aria-label="Toggle harvest enabled"
              onClick={() => setEnabled(!enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                enabled ? 'bg-green-500' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          <hr className="border-gray-800" />

          {/* Fixed Amount */}
          <div>
            <label htmlFor="fixedAmount" className="block text-sm font-medium text-gray-300 mb-1">
              Fixed Amount Threshold
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Trigger a harvest when realized profit exceeds this dollar amount
            </p>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                id="fixedAmount"
                type="number"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                min="1"
                step="1"
                aria-label="Fixed amount threshold"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pl-7 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Percentage Return */}
          <div>
            <label htmlFor="pctReturn" className="block text-sm font-medium text-gray-300 mb-1">
              Percentage Return Threshold
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Trigger a harvest when return since last withdrawal exceeds this percentage
            </p>
            <div className="relative">
              <input
                id="pctReturn"
                type="number"
                value={pctReturn}
                onChange={(e) => setPctReturn(e.target.value)}
                min="0.1"
                max="100"
                step="0.1"
                aria-label="Percentage return threshold"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-7 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="absolute right-3 top-2 text-gray-500">%</span>
            </div>
          </div>

          {/* Reserve Percentage */}
          <div>
            <label htmlFor="reservePct" className="block text-sm font-medium text-gray-300 mb-1">
              Minimum Reserve
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Always retain at least this percentage of total account value — withdrawals are capped to never breach this floor
            </p>
            <div className="relative">
              <input
                id="reservePct"
                type="number"
                value={reservePct}
                onChange={(e) => setReservePct(e.target.value)}
                min="0"
                max="100"
                step="1"
                aria-label="Minimum reserve percentage"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-7 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="absolute right-3 top-2 text-gray-500">%</span>
            </div>
          </div>

          {/* Cooldown Days */}
          <div>
            <label htmlFor="cooldownDays" className="block text-sm font-medium text-gray-300 mb-1">
              Cooldown Period
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Minimum days between withdrawals to prevent over-extraction during volatile periods
            </p>
            <div className="relative">
              <input
                id="cooldownDays"
                type="number"
                value={cooldownDays}
                onChange={(e) => setCooldownDays(e.target.value)}
                min="1"
                step="1"
                aria-label="Cooldown period in days"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-12 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="absolute right-3 top-2 text-gray-500">days</span>
            </div>
          </div>
        </div>

        {/* Validation Errors */}
        {fixedAmount !== '' && errors.length > 0 && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            {errors.map((err) => (
              <div key={err} className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle size={14} />
                {err}
              </div>
            ))}
          </div>
        )}

        {/* Save Button */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={errors.length > 0 || updateConfig.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              errors.length > 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {updateConfig.isPending ? 'Saving...' : <><Save size={16} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}
