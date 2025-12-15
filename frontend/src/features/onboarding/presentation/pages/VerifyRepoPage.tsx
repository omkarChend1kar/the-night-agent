"use client";
import React from 'react';
import { useOnboardingViewModel } from '../hooks/useOnboardingViewModel';

export default function VerifyRepoPage() {
    const { state, actions } = useOnboardingViewModel();
    const {
        protocol, publicKey, verifying, cloning, verificationLogs
    } = state;

    return (
        <div className="flex h-screen items-center justify-center bg-[var(--color-background)] font-sans">
            <div className="w-full max-w-2xl clarity-card relative overflow-hidden">
                <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4 relative z-10">
                    <img src="/logo.png" alt="Night Agent" className="h-6 w-6 object-contain" />
                    <h1 className="text-sm font-mono font-bold text-green-500 tracking-wider uppercase">
                        // Verify Access
                    </h1>
                </div>

                <div className="space-y-5 relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    {protocol === 'ssh' && publicKey && (
                        <>
                            {/* Instructional Step */}
                            <div className="flex gap-4 items-start mb-6 p-4 bg-amber-500/5 border-l-2 border-amber-500 rounded-r-md">
                                <div className="shrink-0 mt-0.5 text-amber-500">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-sm font-bold text-amber-400 tracking-wide uppercase">Action Required</h3>
                                    <div className="text-xs text-amber-200/70 leading-relaxed font-mono">
                                        1. Copy the key below.<br />
                                        2. Go to Repo Settings &rarr; <strong>Deploy Keys</strong>.<br />
                                        3. Add Key and check <strong>"Allow write access"</strong>.
                                    </div>
                                </div>
                            </div>

                            {/* Code Block UI for Key */}
                            <div className="rounded-lg border border-[var(--color-border)] bg-[#0D1117] overflow-hidden shadow-inner group">
                                <div className="flex items-center justify-between px-4 py-2 bg-[#161B22] border-b border-[var(--color-border)]">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-mono">id_ed25519.pub</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="px-2 py-1 rounded hover:bg-white/5 transition-colors text-[10px] text-amber-500 font-bold uppercase tracking-wider"
                                            onClick={actions.handleRegenerateKey}
                                            disabled={state.loading}
                                        >
                                            {state.loading ? 'Regenerating...' : 'Regenerate'}
                                        </button>
                                        <div className="h-3 w-px bg-gray-700"></div>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 transition-colors text-[10px] text-emerald-500 font-bold uppercase tracking-wider"
                                            onClick={() => navigator.clipboard.writeText(publicKey)}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                            Copy Key
                                        </button>
                                    </div>
                                </div>
                                <div className="p-4 relative bg-[#0D1117]">
                                    <pre
                                        className="w-full bg-transparent border-none font-mono text-[11px] text-emerald-400/90 whitespace-pre-wrap break-all leading-relaxed cursor-text selection:bg-emerald-500/30"
                                        onClick={(e) => {
                                            const range = document.createRange();
                                            range.selectNodeContents(e.currentTarget);
                                            const sel = window.getSelection();
                                            if (sel) {
                                                sel.removeAllRanges();
                                                sel.addRange(range);
                                            }
                                        }}
                                    >
                                        {publicKey}
                                    </pre>
                                </div>
                            </div>
                        </>
                    )}

                    {!publicKey && protocol === 'https' && (
                        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-xs font-mono break-all flex items-start gap-3">
                            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>HTTPS connection detected. Ready to verify write access.</span>
                        </div>
                    )}

                    <div className="mt-4 flex flex-col items-center justify-center gap-3 w-full">
                        <button
                            type="button"
                            onClick={actions.handleVerifyAndClone}
                            disabled={verifying || cloning}
                            className={`w-full py-3 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${verifying || cloning
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-500 text-white shadow shadow-green-900/50'
                                }`}
                        >
                            {verifying ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin"></div>
                                    Verifying Access...
                                </>
                            ) : cloning ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-green-500/30 border-t-white rounded-full animate-spin"></div>
                                    Cloning Repository...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    Verify Access
                                </>
                            )}
                        </button>

                        {verificationLogs.length > 0 && (
                            <div className="w-full text-[10px] font-mono bg-black/50 p-3 rounded border border-white/10 max-h-32 overflow-y-auto">
                                {verificationLogs.map((log, i) => (
                                    <div key={i} className={`mb-1 ${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-gray-400'}`}>
                                        &gt; {log}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
