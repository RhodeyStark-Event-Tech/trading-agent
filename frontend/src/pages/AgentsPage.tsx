import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { AgentState } from '@trading-agent/types';

const statusColor: Record<string, string> = {
  running: 'bg-green-500/20 text-green-400',
  paused:  'bg-yellow-500/20 text-yellow-400',
  error:   'bg-red-500/20 text-red-400',
};

type AgentPrompt = { id: string; agent: string; version: number; prompt: string; active: boolean };

export default function AgentsPage() {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: ['agent-state'],
    queryFn: () => api.get<AgentState[]>('/api/agents/status'),
    refetchInterval: 10_000,
  });

  const { data: prompts } = useQuery({
    queryKey: ['agent-prompts'],
    queryFn: () => api.get<AgentPrompt[]>('/api/agents/prompts'),
  });

  const pause = useMutation({
    mutationFn: (agent: string) => api.post(`/api/agents/${agent}/pause`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-state'] }),
  });

  const resume = useMutation({
    mutationFn: (agent: string) => api.post(`/api/agents/${agent}/resume`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-state'] }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-4">Agent Control</h2>
        <div className="grid grid-cols-2 gap-4">
          {agents?.map((a: AgentState) => (
            <div key={a.agent} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold capitalize text-white">{a.agent} Agent</p>
                  {a.lastRunAt && (
                    <p className="text-xs text-gray-500">
                      Last run: {new Date(a.lastRunAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[a.status] ?? ''}`}>
                  {a.status}
                </span>
              </div>
              {a.lastError && (
                <p className="text-xs text-red-400 mb-3 bg-red-500/10 rounded p-2">{a.lastError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => resume.mutate(a.agent)}
                  disabled={a.status === 'running'}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                  ▶ Resume
                </button>
                <button
                  onClick={() => pause.mutate(a.agent)}
                  disabled={a.status === 'paused'}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                >
                  ⏸ Pause
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt Viewer */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Active Prompts</h3>
        <div className="space-y-3">
          {prompts?.map((p: AgentPrompt) => (
            <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold capitalize text-white">{p.agent}</p>
                <span className="text-xs text-gray-500">v{p.version}</span>
              </div>
              <pre className="text-xs text-gray-400 bg-gray-950 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                {p.prompt}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
