import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, List, DollarSign, Settings, GraduationCap } from 'lucide-react';
import PositionsPage from './pages/PositionsPage.js';
import SignalsPage from './pages/SignalsPage.js';
import TradesPage from './pages/TradesPage.js';
import HarvestPage from './pages/HarvestPage.js';
import AgentsPage from './pages/AgentsPage.js';
import EducationPage from './pages/EducationPage.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
});

const NAV = [
  { to: '/',         label: 'Positions', icon: LayoutDashboard },
  { to: '/signals',  label: 'Signals',   icon: TrendingUp },
  { to: '/trades',   label: 'Trades',    icon: List },
  { to: '/harvest',  label: 'Harvest',   icon: DollarSign },
  { to: '/learn',    label: 'Learn',      icon: GraduationCap },
  { to: '/agents',   label: 'Agents',    icon: Settings },
];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-950 text-gray-100 flex">
          {/* Sidebar */}
          <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 gap-1">
            <div className="px-3 mb-6">
              <h1 className="text-lg font-bold text-white">Trading Agent</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {import.meta.env['VITE_TRADING_MODE'] === 'live' ? '🟢 Live' : '🟡 Paper'}
              </p>
            </div>
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto p-6">
            <Routes>
              <Route path="/"        element={<PositionsPage />} />
              <Route path="/signals" element={<SignalsPage />} />
              <Route path="/trades"  element={<TradesPage />} />
              <Route path="/harvest" element={<HarvestPage />} />
              <Route path="/learn"   element={<EducationPage />} />
              <Route path="/agents"  element={<AgentsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
