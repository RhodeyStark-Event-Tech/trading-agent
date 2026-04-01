import { useState } from 'react';
import { useSignals } from '../hooks/useSignals.js';
import type { Signal } from '@trading-agent/types';

const actionColor: Record<string, string> = {
  BUY:  'bg-green-500/20 text-green-400 border border-green-500/30',
  SELL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  HOLD: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
};

const agentColor: Record<string, string> = {
  sentiment:   'text-blue-400',
  technical:   'text-purple-400',
  fundamental: 'text-orange-400',
  meta:        'text-pink-400',
};

export default function SignalsPage() {
  const { data: signals, isLoading, error } = useSignals(100);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const filtered = agentFilter === 'all'
    ? signals
    : signals?.filter((s) => s.agent === agentFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Signal Feed</h2>
        <div className="flex gap-2">
          {['all', 'sentiment', 'technical', 'fundamental', 'meta'].map((a) => (
            <button
              key={a}
              onClick={() => setAgentFilter(a)}
              className={`px-3 py-1 rounded-lg text-xs capitalize transition-colors ${
                agentFilter === a
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading signals...</p>}
      {error && <p className="text-red-400 text-sm">Error: {error.message}</p>}

      <div className="space-y-2">
        {filtered?.map((signal: Signal) => (
          <div
            key={signal.id}
            className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
              onClick={() => setExpanded(expanded === signal.id ? null : signal.id)}
            >
              <span className="font-mono font-bold text-white w-16">{signal.ticker}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${actionColor[signal.action] ?? ''}`}>
                {signal.action}
              </span>
              <span className={`text-xs capitalize ${agentColor[signal.agent] ?? 'text-gray-400'}`}>
                {signal.agent}
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {(signal.confidence * 100).toFixed(0)}% confidence
              </span>
              <span className="text-xs text-gray-600">
                {new Date(signal.createdAt).toLocaleTimeString()}
              </span>
            </button>

            {expanded === signal.id && (
              <div className="px-4 pb-4 border-t border-gray-800 mt-1 pt-3">
                <p className="text-xs text-gray-500 mb-1">LLM Rationale</p>
                <pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(signal.rationale, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
