"use client";
import React from 'react';
import { useSignupBloc } from '../blocs/signup.bloc';

export default function SignupPage() {
    const { state, actions } = useSignupBloc();

    return (
        <div className="flex h-screen items-center justify-center bg-background font-sans">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center justify-center mb-8 gap-4">
                    <div className="h-16 w-16 bg-black/5 rounded-lg flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                        <img src="/logo.png" alt="The Night Agent" className="h-10 w-10 object-contain" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-lg font-bold tracking-wider text-green-500 font-mono uppercase">The Night Agent</h1>
                        <div className="h-0.5 w-12 bg-green-500/30 mx-auto mt-2"></div>
                    </div>
                </div>
                <div className="clarity-card">
                    <h2 className="text-xs font-mono text-gray-400 mb-6 text-center tracking-widest uppercase">// Create Account</h2>

                    {state.error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs font-mono break-all flex items-start gap-3">
                            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <span>{state.error}</span>
                        </div>
                    )}

                    <form onSubmit={actions.signup} className="space-y-5">
                        <div>
                            <label className="text-label">Name</label>
                            <input type="text" placeholder="John Doe" className="clarity-input"
                                value={state.name} onChange={(e) => actions.setName(e.target.value)} required />
                        </div>
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
                            {state.loading ? 'Creating...' : 'Create Account'}
                        </button>
                        <div className="text-center mt-4">
                            <a href="/login" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Already have an account? Sign In</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
