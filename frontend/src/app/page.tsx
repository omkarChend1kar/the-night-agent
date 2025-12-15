"use client";
import { useGlobalState } from '../useGlobalState';

import ConnectRepoPage from '../features/onboarding/presentation/pages/ConnectRepoPage';
import VerifyRepoPage from '../features/onboarding/presentation/pages/VerifyRepoPage';
import SidecarSetupPage from '../features/onboarding/presentation/pages/SidecarSetupPage';
import DashboardPage from '../features/dashboard/presentation/pages/DashboardPage';

export default function Home() {
  const appState = useGlobalState();
  console.log('[Router] Current App State:', appState); // Debug Log

  if (appState === 'LOADING') {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-green-500/20 border-t-green-500 animate-spin"></div>
          <div className="text-green-500 font-mono text-sm tracking-widest animate-pulse">Initializing System...</div>
        </div>
      </div>
    );
  }

  switch (appState) {
    case 'UNAUTHENTICATED':
      // Instead of rendering login here, we redirect to explicit /login
      // This avoids URL confusion.
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return null;
    case 'ONBOARDING_CONNECT':
      return <ConnectRepoPage />;
    case 'ONBOARDING_VERIFY':
      return <VerifyRepoPage />;
    case 'ONBOARDING_SIDECAR':
      return <SidecarSetupPage />;
    case 'DASHBOARD':
      return <DashboardPage />;
    default:
      // Should not happen if state is exhaustive, but safe fallback
      return null;
  }
}
