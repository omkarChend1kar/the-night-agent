'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function MfaSetup() {
    const [qrCode, setQrCode] = useState('');
    const [token, setToken] = useState('');
    const [secret, setSecret] = useState('');
    const router = useRouter();

    useEffect(() => {
        const setup = async () => {
            const jwt = localStorage.getItem('token');
            try {
                const res = await axios.post('http://localhost:3000/auth/mfa/setup', {}, {
                    headers: { Authorization: `Bearer ${jwt}` }
                });
                setQrCode(res.data.qrCodeUrl);
                setSecret(res.data.secret);
            } catch (e) { alert('MFA Setup Failed'); }
        };
        setup();
    }, []);

    const verify = async () => {
        const jwt = localStorage.getItem('token');
        try {
            await axios.post('http://localhost:3000/auth/mfa/verify', { token }, {
                headers: { Authorization: `Bearer ${jwt}` }
            });
            alert('MFA Secured');
            router.push('/');
        } catch (e) { alert('Invalid Token'); }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-black font-mono">
            <div className="terminal-box w-full max-w-sm">
                <h1 className="text-xl font-bold mb-4 text-center text-green-500 uppercase tracking-widest cursor-blink">
                    Secure Uplink
                </h1>

                <div className="text-center mb-6">
                    <p className="text-xs text-green-700 mb-2">Scan QR with Authenticator</p>
                    {qrCode && (
                        <div className="border border-green-500 p-2 inline-block bg-white">
                            <img src={qrCode} alt="MFA QR" className="w-48 h-48" />
                        </div>
                    )}
                    {secret && <p className="text-xs text-green-800 mt-2">Secret: {secret}</p>}
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase text-green-700 mb-1">Enter 6-Digit Code</label>
                        <input
                            type="text"
                            placeholder="000000"
                            className="hacker-input text-center text-lg tracking-[0.5em]"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                        />
                    </div>
                    <button onClick={verify} className="hacker-btn">
                        Verify & Encrypt
                    </button>
                </div>
            </div>
        </div>
    );
}
