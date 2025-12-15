"use client";
import React, { useState } from 'react';
import { useOnboardingViewModel } from '../hooks/useOnboardingViewModel';

export default function SidecarSetupPage() {
    const { state, actions } = useOnboardingViewModel();
    const { sidecarSetup } = state;
    const [activeTab, setActiveTab] = useState<'docker' | 'compose'>('docker');

    if (!sidecarSetup) {
        return <div className="h-screen flex items-center justify-center text-gray-500 font-mono text-sm">Loading setup configuration...</div>;
    }

    return (
        <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] py-8 px-4 font-sans flex items-center justify-center">
            <div className="w-full max-w-4xl">

                {/* Success Header */}
                <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6 relative">
                        <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full"></div>
                        <svg className="w-8 h-8 text-emerald-500 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">System Connected</h1>
                    <p className="text-gray-400 max-w-lg mx-auto leading-relaxed">
                        Repository access verified. Deploy the sidecar agent to begin monitoring.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Left Column: Instructions & Key */}
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">

                        {/* Step 1: API Key */}
                        <div className="bg-[#161B22] border border-[var(--color-border)] rounded-lg p-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="text-amber-500">01.</span> Secret Key
                            </h3>
                            <p className="text-xs text-gray-500 mb-4 font-mono">
                                Required for the sidecar to authenticate.
                            </p>
                            <div className="bg-black/50 border border-amber-500/20 rounded p-3 flex items-center justify-between group-hover:border-amber-500/40 transition-colors">
                                <code className="text-amber-400 font-mono text-xs break-all mr-4 filter blur-[2px] group-hover:blur-0 transition-all duration-300">
                                    {sidecarSetup.apiKey}
                                </code>
                                <button
                                    onClick={() => navigator.clipboard.writeText(sidecarSetup.apiKey)}
                                    className="shrink-0 p-2 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                                    title="Copy API Key"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </div>

                        {/* Step 2: Deployment Guide */}
                        <div className="bg-[#161B22] border border-[var(--color-border)] rounded-lg p-6 relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="text-blue-500">02.</span> Deployment
                            </h3>
                            <ul className="space-y-4">
                                {sidecarSetup.instructions.map((instruction, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-400">
                                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mt-2"></span>
                                        <span className="leading-relaxed">{instruction}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Right Column: Code Snippets */}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 flex flex-col h-full">
                        <div className="bg-[#0D1117] border border-[var(--color-border)] rounded-lg overflow-hidden flex flex-col h-full shadow-2xl">
                            {/* Tabs */}
                            <div className="flex border-b border-[var(--color-border)] bg-[#161B22]">
                                <button
                                    onClick={() => setActiveTab('docker')}
                                    className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-r border-[var(--color-border)] ${activeTab === 'docker' ? 'text-white bg-[#0D1117]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                >
                                    Docker Run
                                </button>
                                <button
                                    onClick={() => setActiveTab('compose')}
                                    className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-r border-[var(--color-border)] ${activeTab === 'compose' ? 'text-white bg-[#0D1117]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                >
                                    Docker Compose
                                </button>
                            </div>

                            {/* Code Area */}
                            <div className="flex-1 p-0 relative group">
                                <div className="absolute top-4 right-4 z-10">
                                    <button
                                        onClick={() => navigator.clipboard.writeText(activeTab === 'docker' ? sidecarSetup.dockerCommand : sidecarSetup.dockerCompose)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-500 transition-colors backdrop-blur-sm"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                        Copy
                                    </button>
                                </div>
                                <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                                    <pre className="p-6 font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap break-all">
                                        {activeTab === 'docker' ? sidecarSetup.dockerCommand : sidecarSetup.dockerCompose}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => window.location.reload()} // Global router will check status again
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold uppercase tracking-wider rounded transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2"
                            >
                                Go to Dashboard
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
