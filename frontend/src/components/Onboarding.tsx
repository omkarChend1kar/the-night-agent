"use client";
import { useState } from 'react';
import axios from 'axios';

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
    const [repoUrl, setRepoUrl] = useState('');
    const [protocol, setProtocol] = useState<'https' | 'ssh'>('https');
    const [username, setUsername] = useState('');
    const [token, setToken] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [installCommand, setInstallCommand] = useState('');
    const [connectedRepoId, setConnectedRepoId] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const jwt = localStorage.getItem('token');
            const data = { repoUrl, protocol, username, token, privateKey };
            const res = await axios.post('http://localhost:3000/api/onboard', data, {
                headers: { Authorization: `Bearer ${jwt}` }
            });

            if (res.data.repoId) {
                setConnectedRepoId(res.data.repoId);
            }

            if (protocol === 'ssh' && res.data.publicKey) {
                // If SSH, we stop here and ask for verification
                setToken(res.data.publicKey);
                setLoading(false);
                return;
            }

            // Fetch Install Script (HTTPS only proceeds directly)
            const installRes = await axios.get('http://localhost:3000/api/sidecar/install', {
                headers: { Authorization: `Bearer ${jwt}` }
            });
            setInstallCommand(installRes.data.command);
        } catch (err: any) {
            console.error(err);
            const msg = err.response?.data?.message || err.message || 'Connection failed. Please check credentials.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (installCommand) {
        return (
            <div className="flex h-screen items-center justify-center bg-background text-foreground">
                <div className="w-full max-w-lg clarity-card">
                    <div className="flex justify-center mb-6">
                        <div className="h-12 w-12 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    </div>
                    <h1 className="text-xl font-medium mb-2 text-center text-white">Repository Connected</h1>
                    <p className="text-center text-sm text-gray-500 mb-6 font-sans">Deploy the Sidecar to begin monitoring.</p>

                    <div className="bg-[#111] p-4 rounded border border-white/5 font-mono text-xs text-gray-300 mb-6 break-all">
                        {installCommand}
                    </div>
                    <button
                        onClick={onComplete}
                        className="clarity-btn-primary"
                    >
                        Proceed to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background font-sans">
            <div className="w-full max-w-lg clarity-card">
                <div className="flex items-center gap-3 mb-6 border-b border-green-500/20 pb-4">
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

                <form onSubmit={handleConnect} className="space-y-5">
                    <div className="grid grid-cols-1 gap-5">
                        <div>
                            <label className="text-label">Protocol</label>
                            <select
                                className="clarity-input appearance-none bg-[#1F1F1F]"
                                value={protocol}
                                onChange={(e) => setProtocol(e.target.value as 'https' | 'ssh')}
                            >
                                <option value="https">HTTPS (Personal Access Token)</option>
                                <option value="ssh">SSH (Private Key)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-label">Repository URL</label>
                            <input
                                type="text"
                                placeholder="github.com/org/repo.git"
                                className="clarity-input"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                            />
                        </div>

                        {protocol === 'https' && (
                            <div>
                                <label className="text-label">Access Token</label>
                                <input
                                    type="password"
                                    placeholder="ghp_..."
                                    className="clarity-input"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                />
                            </div>
                        )}

                        {protocol === 'ssh' && (
                            <div>
                                <label className="text-label">SSH Key</label>
                                <div className="text-[10px] text-gray-500 mb-2">
                                    Add this Public Key to your Repo's Deploy Keys with <strong>Write Access</strong>.
                                </div>

                                {token ? (
                                    <div className="mt-2">
                                        <textarea
                                            readOnly
                                            className="w-full p-3 h-24 bg-[#111] rounded border border-green-500/20 font-mono text-xs text-green-400 focus:outline-none"
                                            value={token}
                                        />
                                        <div className="flex items-center justify-center mt-2 gap-2 text-xs text-green-500/80">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                            Waiting for verification...
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-[#1F1F1F] rounded border border-white/5 text-center">
                                        <p className="text-xs text-gray-500">A unique keypair will be generated for this repository.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                        {!token || protocol === 'https' ? (
                            <button type="submit" disabled={loading} className="clarity-btn-primary">
                                {loading ? 'Establishing Connection...' : (protocol === 'ssh' ? 'Generate Keypair' : 'Connect')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={async () => {
                                    setLoading(true);
                                    const jwt = localStorage.getItem('token');
                                    try {
                                        if (connectedRepoId) {
                                            const res = await axios.post(`http://localhost:3000/api/repos/${connectedRepoId}/verify`, {}, {
                                                headers: { Authorization: `Bearer ${jwt}` }
                                            });
                                            if (res.data.success) {
                                                // After successful verification, fetch the install command
                                                const installRes = await axios.get('http://localhost:3000/api/sidecar/install', {
                                                    headers: { Authorization: `Bearer ${jwt}` }
                                                });
                                                setInstallCommand(installRes.data.command);
                                            } else {
                                                alert('Verification Failed: ' + JSON.stringify(res.data.logs));
                                            }
                                        } else {
                                            alert('No repository ID found for verification.');
                                        }
                                    } catch (e: any) {
                                        const msg = e.response?.data?.message || e.message || 'Verification Error';
                                        setError(msg);
                                        console.error(e);
                                    }
                                    setLoading(false);
                                }}
                                disabled={loading}
                                className="clarity-btn border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:border-amber-500"
                            >
                                {loading ? 'Verifying Access...' : 'Verify Access'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

