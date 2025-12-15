"use client";
import React from 'react';
import { useOnboardingViewModel } from '../hooks/useOnboardingViewModel';

export default function ConnectRepoPage() {
    const { state, actions } = useOnboardingViewModel();
    const { repoUrl, protocol, token, loading, error, connectedRepoId } = state;

    // If we somehow get here but are already connected, the global router should redirect us.
    // But we can show a "Continue" button just in case or null.
    // Ideally, the global router handles this.

    return (
        <div className="flex h-screen items-center justify-center bg-[var(--color-background)] font-sans">
            <div className="w-full max-w-lg clarity-card relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

                <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4 relative z-10">
                    <img src="/logo.png" alt="Night Agent" className="h-6 w-6 object-contain" />
                    <h1 className="text-sm font-mono font-bold text-green-500 tracking-wider uppercase">
                        // Connect Repository
                    </h1>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs font-mono break-all flex items-start gap-3">
                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={actions.handleConnect} className="space-y-5 relative z-10">
                    <div className="grid grid-cols-1 gap-5">
                        <div>
                            <label className="text-label">Protocol</label>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={() => actions.setProtocol('https')}
                                    className={`p-3 text-xs font-mono border rounded transition-all ${protocol === 'https' ? 'bg-green-500/10 border-green-500/50 text-white' : 'bg-[#1F1F1F] border-white/5 text-gray-500 hover:border-white/20'}`}
                                >
                                    HTTPS
                                </button>
                                <button
                                    type="button"
                                    onClick={() => actions.setProtocol('ssh')}
                                    className={`p-3 text-xs font-mono border rounded transition-all ${protocol === 'ssh' ? 'bg-green-500/10 border-green-500/50 text-white' : 'bg-[#1F1F1F] border-white/5 text-gray-500 hover:border-white/20'}`}
                                >
                                    SSH (Recommended)
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-label">Repository URL</label>
                            <input
                                type="text"
                                placeholder={protocol === 'ssh' ? "git@github.com:org/repo.git" : "https://github.com/org/repo.git"}
                                className="clarity-input font-mono text-xs"
                                value={repoUrl}
                                onChange={(e) => actions.setRepoUrl(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {protocol === 'https' && (
                            <div>
                                <label className="text-label">Personal Access Token</label>
                                <input
                                    type="password"
                                    placeholder="ghp_..."
                                    className="clarity-input font-mono"
                                    value={token}
                                    onChange={(e) => actions.setToken(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                        <button type="submit" disabled={loading || !!connectedRepoId} className="clarity-btn-primary w-full justify-center">
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                    Processing...
                                </span>
                            ) : (
                                protocol === 'ssh' ? 'Generate Identity' : 'Connect'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
