'use client';
import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.post('http://localhost:3000/auth/login', { email, password });
            localStorage.setItem('token', res.data.access_token);
            // Check if MFA is enabled (backend returns current user state)
            if (res.data.user.isMfaEnabled) {
                // But wait, if MFA is enabled, we need to verify it via 2nd screen or logic.
                // For now, let's assume valid login grants access OR we redirect to verify if we had that flow.
                // MVP: Just login.
            } else {
                // Prompt setup if enforced
            }
            // For now, redirect to dashboard or MFA setup
            // Bypassing MFA for now per user request. Always go to dashboard.
            router.push('/');
        } catch (err) {
            alert('Access Denied');
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-background font-sans">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center justify-center mb-8 gap-4">
                    <div className="h-16 w-16 bg-black/50 rounded-lg flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                        <img src="/logo.png" alt="The Night Agent" className="h-10 w-10 object-contain" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-lg font-bold tracking-wider text-green-500 font-mono uppercase">
                            The Night Agent
                        </h1>
                        <div className="h-0.5 w-12 bg-green-500/30 mx-auto mt-2"></div>
                    </div>
                </div>
                <div className="clarity-card border-green-500/10">
                    <h2 className="text-xs font-mono text-gray-400 mb-6 text-center tracking-widest uppercase">
                        // Authenticate
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="text-label">Email</label>
                            <input
                                type="email"
                                placeholder="user@example.com"
                                className="clarity-input"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-label">Password</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                className="clarity-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="clarity-btn-primary">
                            Sign In
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
