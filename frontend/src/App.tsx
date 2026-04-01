import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, List, DollarSign, Settings, GraduationCap, SlidersHorizontal } from 'lucide-react';
import PositionsPage from './pages/PositionsPage.js';
import SignalsPage from './pages/SignalsPage.js';
import TradesPage from './pages/TradesPage.js';
import HarvestPage from './pages/HarvestPage.js';
import AgentsPage from './pages/AgentsPage.js';
import EducationPage from './pages/EducationPage.js';
import SettingsPage from './pages/SettingsPage.js';
import { Toaster } from 'react-hot-toast';

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
  { to: '/settings', label: 'Settings',  icon: SlidersHorizontal },
];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1f2937', color: '#f3f4f6', border: '1px solid #374151' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1f2937' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1f2937' } },
          duration: 3000,
        }}
      />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="min-h-screen bg-gray-950 text-gray-100 flex">
          {/* Sidebar */}
          <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col py-6 px-3 gap-1">
            <div className="px-3 mb-6">
              <div className="flex items-center gap-2">
                <img src="/favicon.png" alt="Trading Agent" className="w-7 h-7 rounded" />
                <h1 className="text-lg font-bold text-white">Trading Agent</h1>
              </div>
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
              <Route path="/agents"   element={<AgentsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
