// ... imports
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
    const [repoUrl, setRepoUrl] = useState('');
    const [protocol, setProtocol] = useState<'https' | 'ssh'>('https');
    const [username, setUsername] = useState('');
    const [token, setToken] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [sidecarSetup, setSidecarSetup] = useState<{
        dockerCommand: string;
        dockerCompose: string;
        apiKey: string;
        instructions: string[];
    } | null>(null);
    const [connectedRepoId, setConnectedRepoId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [verificationLogs, setVerificationLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'docker' | 'compose'>('docker');

    // Auto-poll for verification when SSH key is generated
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (protocol === 'ssh' && token && connectedRepoId && !sidecarSetup) {
            setVerifying(true);
            const checkConnection = async () => {
                const jwt = localStorage.getItem('token');
                try {
                    const res = await axios.post(`http://localhost:3001/api/repos/${connectedRepoId}/verify`, {}, {
                        headers: { Authorization: `Bearer ${jwt}` }
                    });

                    if (res.data.success) {
                        setVerificationLogs(['✅ Connection Established!', ...res.data.logs]);
                        setVerifying(false);
                        clearInterval(interval);

                        // Create sidecar and get Docker setup
                        const sidecarRes = await axios.post(`http://localhost:3001/api/sidecars`, {
                            repoId: connectedRepoId,
                            name: `Sidecar for Repository`,
                            logPath: '/var/log/app.log',
                            serviceId: 'production-service'
                        }, {
                            headers: { Authorization: `Bearer ${jwt}` }
                        });
                        setSidecarSetup(sidecarRes.data.setup);
                    } else {
                        // Keep trying but show logs
                        setVerificationLogs(res.data.logs || ['Waiting for connection...']);
                    }
                } catch (e: any) {
                    console.error("Verification poll error", e);
                }
            };

            // Poll every 5 seconds
            checkConnection(); // Initial check
            interval = setInterval(checkConnection, 5000);
        }
        return () => clearInterval(interval);
    }, [protocol, token, connectedRepoId, sidecarSetup]);

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const jwt = localStorage.getItem('token');
            const data = { repoUrl, protocol, username, token, privateKey };
            const res = await axios.post('http://localhost:3001/api/onboard', data, {
                headers: { Authorization: `Bearer ${jwt}` }
            });

            if (res.data.repoId) {
                setConnectedRepoId(res.data.repoId);
            }

            if (protocol === 'ssh' && res.data.publicKey) {
                // If SSH, set token to publicKey to display it and trigger polling
                setToken(res.data.publicKey);
                setLoading(false);
                return;
            }

            // HTTPS flow or Post-Verification SSH Flow - Create sidecar and get Docker setup
            const sidecarRes = await axios.post(`http://localhost:3001/api/sidecars`, {
                repoId: res.data.repoId || connectedRepoId,
                name: `Sidecar for Repository`,
                logPath: '/var/log/app.log',
                serviceId: 'production-service'
            }, {
                headers: { Authorization: `Bearer ${jwt}` }
            });
            setSidecarSetup(sidecarRes.data.setup);
        } catch (err: any) {
            console.error(err);
            const msg = err.response?.data?.message || err.message || 'Connection failed. Please check credentials.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (sidecarSetup) {
        return (
            <div className="min-h-screen bg-background text-foreground py-8 px-4">
                <div className="w-full max-w-4xl clarity-card mx-auto mt-8 mb-8">
                    {/* Header Section */}
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                            <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                        </div>
                        <h1 className="text-2xl font-semibold mb-3 text-white">Repository Connected</h1>
                        <p className="text-sm text-gray-400 font-sans max-w-xl mx-auto">
                            Set up your sidecar agent using Docker to start monitoring your application logs for anomalies.
                        </p>
                    </div>

                    {/* Instructions Section */}
                    <div className="mb-8 p-5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                        <h2 className="text-sm font-semibold text-blue-400 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Setup Instructions
                        </h2>
                        <ol className="space-y-3 ml-2">
                            {sidecarSetup.instructions.map((instruction, idx) => (
                                <li key={idx} className="text-sm text-gray-300 font-sans flex items-start gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 text-xs font-bold">
                                        {idx + 1}
                                    </span>
                                    <span className="flex-1 pt-0.5">{instruction}</span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    {/* API Key Section */}
                    <div className="mb-8 p-5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="flex-1">
                                <h3 className="text-sm font-semibold text-amber-400 mb-2">Important: Save Your API Key</h3>
                                <p className="text-xs text-amber-300/80 mb-3">This API key is only shown once. Save it securely before proceeding.</p>
                                <div className="bg-black/40 p-3 rounded border border-amber-500/20 font-mono text-xs text-amber-200 break-all relative group">
                                    <code>{sidecarSetup.apiKey}</code>
                                    <button
                                        className="absolute top-2 right-2 p-1.5 bg-amber-500/20 rounded hover:bg-amber-500/30 transition-colors"
                                        onClick={() => navigator.clipboard.writeText(sidecarSetup.apiKey)}
                                        title="Copy API key"
                                    >
                                        <svg className="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Docker Commands Section with Tabs */}
                    <div className="mb-8">
                        <div className="flex gap-2 mb-4 border-b border-white/10">
                            <button
                                onClick={() => setActiveTab('docker')}
                                className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
                                    activeTab === 'docker'
                                        ? 'border-green-500 text-green-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                Docker Run
                            </button>
                            <button
                                onClick={() => setActiveTab('compose')}
                                className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
                                    activeTab === 'compose'
                                        ? 'border-blue-500 text-blue-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                Docker Compose
                            </button>
                        </div>

                        {activeTab === 'docker' && (
                            <div className="bg-[#050505] p-6 rounded-lg border border-green-500/20 relative group shadow-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-semibold text-green-400 font-mono uppercase tracking-wider">
                                        Docker Run Command
                                    </label>
                                    <button
                                        className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded text-xs text-green-400 font-semibold transition-colors flex items-center gap-2"
                                        onClick={() => navigator.clipboard.writeText(sidecarSetup.dockerCommand)}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy
                                    </button>
                                </div>
                                <pre className="font-mono text-sm text-green-300 whitespace-pre-wrap break-all overflow-x-auto p-4 bg-black/30 rounded border border-green-500/10">
                                    {sidecarSetup.dockerCommand}
                                </pre>
                            </div>
                        )}

                        {activeTab === 'compose' && (
                            <div className="bg-[#050505] p-6 rounded-lg border border-blue-500/20 relative group shadow-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-sm font-semibold text-blue-400 font-mono uppercase tracking-wider">
                                        Docker Compose Configuration
                                    </label>
                        <button
                                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded text-xs text-blue-400 font-semibold transition-colors flex items-center gap-2"
                                        onClick={() => navigator.clipboard.writeText(sidecarSetup.dockerCompose)}
                        >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Copy
                        </button>
                                </div>
                                <pre className="font-mono text-sm text-blue-300 whitespace-pre-wrap break-all overflow-x-auto p-4 bg-black/30 rounded border border-blue-500/10">
                                    {sidecarSetup.dockerCompose}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={onComplete}
                        className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                    >
                        <span>Proceed to Dashboard</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background font-sans">
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

                <form onSubmit={handleConnect} className="space-y-5 relative z-10">
                    <div className="grid grid-cols-1 gap-5">
                        {!token && (
                            <>
                                <div>
                                    <label className="text-label">Protocol</label>
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        <button
                                            type="button"
                                            onClick={() => setProtocol('https')}
                                            className={`p-3 text-xs font-mono border rounded transition-all ${protocol === 'https' ? 'bg-green-500/10 border-green-500/50 text-white' : 'bg-[#1F1F1F] border-white/5 text-gray-500 hover:border-white/20'}`}
                                        >
                                            HTTPS
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProtocol('ssh')}
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
                                        onChange={(e) => setRepoUrl(e.target.value)}
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
                                            onChange={(e) => setToken(e.target.value)}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {protocol === 'ssh' && token && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded mb-4">
                                    <h3 className="text-amber-500 text-xs font-bold mb-2 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                        ACTION REQUIRED:
                                    </h3>
                                    <ol className="list-decimal ml-4 text-[11px] text-amber-200/80 space-y-1">
                                        <li>Copy the Public Key below.</li>
                                        <li>Go to your Repo Settings &rarr; <strong>Deploy Keys</strong>.</li>
                                        <li>Add Key and check <strong>"Allow write access"</strong>.</li>
                                    </ol>
                                </div>

                                <label className="text-label mb-1 block">Deploy Key (Permissions: Read/Write)</label>
                                <div className="relative group">
                                    <textarea
                                        readOnly
                                        className="w-full p-3 h-24 bg-[#050505] rounded border border-green-500/30 font-mono text-[10px] text-green-400 focus:outline-none focus:border-green-500 transition-colors shadow-inner"
                                        value={token}
                                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                    />
                                    <button
                                        type="button"
                                        className="absolute top-2 right-2 p-1 bg-white/10 rounded hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100"
                                        onClick={() => navigator.clipboard.writeText(token)}
                                        title="Copy to clipboard"
                                    >
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-col items-center justify-center gap-3">
                                    {verifying ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-5 h-5 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin"></div>
                                            <span className="text-xs text-green-500/80 font-mono">Waiting for connection...</span>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-red-400 font-mono">
                                            {verificationLogs[verificationLogs.length - 1]}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                        {!token && (
                            <button type="submit" disabled={loading} className="clarity-btn-primary w-full justify-center">
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                                        Processing...
                                    </span>
                                ) : (
                                    protocol === 'ssh' ? 'Generate Identity' : 'Connect'
                                )}
                            </button>
                        )}

                        {/* 
                          We remove the manual "Verify" button because it's now polling. 
                          But we can leave a manual retry/reset if needed, or back button. 
                        */}
                        {token && protocol === 'ssh' && (
                            <button
                                type="button"
                                onClick={() => { setToken(''); }}
                                className="w-full text-xs text-gray-500 hover:text-white mt-2 underline"
                            >
                                Cancel / Change URL
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

