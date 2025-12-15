"use client";
import React from 'react';
import { useLoginBloc } from '../blocs/login.bloc';

export default function LoginPage() {
    const { state, actions } = useLoginBloc();

    return (
        <div className="flex h-screen items-center justify-center bg-background font-sans">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center justify-center mb-8 gap-4">
                    <div className="h-16 w-16 bg-black/50 rounded-lg flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                        <img src="/logo.png" alt="The Night Agent" className="h-10 w-10 object-contain" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-lg font-bold tracking-wider text-green-500 font-mono uppercase">The Night Agent</h1>
                        <div className="h-0.5 w-12 bg-green-500/30 mx-auto mt-2"></div>
                    </div>
                </div>
                <div className="clarity-card">
                    <h2 className="text-xs font-mono text-gray-400 mb-6 text-center tracking-widest uppercase">// Authenticate</h2>
                    <form onSubmit={actions.login} className="space-y-5">
                        <div>
                            <label className="text-label">Email</label>
                            <input type="email" placeholder="user@example.com" className="clarity-input"
                                value={state.email} onChange={(e) => actions.setEmail(e.target.value)} required />
                        </div>
                        <div>
                            <label className="text-label">Password</label>
                            <input type="password" placeholder="••••••••" className="clarity-input"
                                value={state.password} onChange={(e) => actions.setPassword(e.target.value)} required />
                        </div>
                        <button type="submit" disabled={state.loading} className="clarity-btn-primary">
                            {state.loading ? 'Signing In...' : 'Sign In'}
                        </button>
                        <div className="text-center mt-4">
                            <a href="/signup" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Create an Account</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
