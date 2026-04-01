import { useState, useEffect } from 'react';
import { useEducation } from '../hooks/useEducation.js';
import { BookOpen, AlertTriangle, Lightbulb, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import type { EducationCard } from '@trading-agent/types';

const actionColor = (action: string) =>
  action === 'BUY'
    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
    : 'bg-red-500/20 text-red-400 border border-red-500/30';

const difficultyColor = (d: string) => {
  if (d === 'beginner') return 'bg-green-500/20 text-green-400';
  if (d === 'intermediate') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
};

const tagColors = [
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-pink-500/20 text-pink-400',
  'bg-orange-500/20 text-orange-400',
];

function EducationCardItem({ card }: { card: EducationCard }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${actionColor(card.action)}`}>
            {card.action}
          </span>
          <span className="font-mono font-semibold text-white">{card.ticker}</span>
          <span className="text-gray-300">{card.company_name ?? card.companyName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${difficultyColor(card.difficulty)}`}>
            {card.difficulty}
          </span>
          {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Company Overview */}
          <div className="flex gap-2">
            <Building2 size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">About the Company</h4>
              <p className="text-sm text-gray-300">{card.company_overview ?? card.companyOverview}</p>
            </div>
          </div>

          {/* Why This Trade */}
          <div className="flex gap-2">
            <Lightbulb size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Why This Trade</h4>
              <p className="text-sm text-gray-300">{card.trade_rationale ?? card.tradeRationale}</p>
            </div>
          </div>

          {/* Trading Concept */}
          <div className="border-l-2 border-blue-500 pl-3">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={16} className="text-blue-400" />
              <h4 className="text-sm font-semibold text-blue-400">{card.concept_title ?? card.conceptTitle}</h4>
            </div>
            <p className="text-sm text-gray-300">{card.concept_explanation ?? card.conceptExplanation}</p>
          </div>

          {/* Risk Note */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-semibold text-amber-400 uppercase mb-1">Risk Note</h4>
              <p className="text-sm text-amber-200/80">{card.risk_note ?? card.riskNote}</p>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {(card.tags ?? []).map((tag, i) => (
              <span key={tag} className={`px-2 py-0.5 rounded text-xs ${tagColors[i % tagColors.length]}`}>
                {tag}
              </span>
            ))}
          </div>

          {/* Timestamp */}
          <p className="text-xs text-gray-600">
            {new Date(card.created_at ?? card.createdAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

export default function EducationPage() {
  const { data: cards, isLoading, error } = useEducation(100);

  useEffect(() => {
    if (error) toast.error(`Failed to load education cards: ${(error as Error).message}`);
  }, [error]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Learn</h2>
        <p className="text-sm text-gray-400 mt-1">
          Every trade generates an educational card explaining the company, the strategy, and the risks involved.
        </p>
      </div>

      {isLoading && <p className="text-gray-500">Loading education cards...</p>}

      {cards && cards.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <BookOpen size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No education cards yet.</p>
          <p className="text-sm text-gray-600 mt-1">
            Cards are generated automatically when trades are filled.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards?.map((card) => (
          <EducationCardItem key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
