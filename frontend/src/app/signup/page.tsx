'use client';
import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function Signup() {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:3000/auth/signup', { email, password, name });
            router.push('/login');
        } catch (err) {
            alert('Signup failed');
        }
    };


    return (
        <div className="flex h-screen items-center justify-center bg-background font-sans">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center justify-center mb-8 gap-4">
                    <div className="h-16 w-16 bg-black/5 rounded-lg flex items-center justify-center border border-green-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
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
                        // Create Account
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="text-label">Name</label>
                            <input
                                type="text"
                                placeholder="John Doe"
                                className="clarity-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
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
                            Create Account
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
