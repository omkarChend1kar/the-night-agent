"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';

const MOCK_ANOMALIES = [
  { id: '1', service: 'AuthService', message: 'High latency in /login', severity: 'Critical', timestamp: '10:42 AM' },
  { id: '2', service: 'PaymentService', message: 'Timeout waiting for gateway', severity: 'High', timestamp: '10:45 AM' },
];

export default function Dashboard() {
  const [anomalies, setAnomalies] = useState(MOCK_ANOMALIES);
  const [repoName, setRepoName] = useState('Loading...');

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('http://localhost:3000/api/repos', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (res.data && res.data.length > 0) {
        // Just show the first one for MVP
        // If url is git@github.com:user/repo.git, extract user/repo
        // If url is https://github.com/user/repo, extract user/repo
        const url = res.data[0].url;
        setRepoName(url.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', ''));
      } else {
        setRepoName('No Repo Connected');
      }
    }).catch(() => setRepoName('Error fetching repo'));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-8">
      <header className="flex justify-between items-center mb-12 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 bg-green-500/10 rounded flex items-center justify-center border border-green-500/20">
            <img src="/logo.png" alt="Night Agent" className="h-5 w-5 object-contain" />
          </div>
          <h1 className="text-sm font-mono font-bold tracking-wider text-green-500 uppercase">The Night Agent <span className="text-gray-700 mx-2">/</span> <span className="text-gray-400 font-normal tracking-tight normal-case">Dashboard</span></h1>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          REPO: <span className="text-green-500">{repoName}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {anomalies.map((anomaly) => (
          <div key={anomaly.id} className="clarity-card hover:border-white/10 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded border ${anomaly.severity === 'Critical'
                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                : (anomaly.severity === 'High' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')
                }`}>
                {anomaly.severity}
              </span>
              <span className="text-gray-600 text-mono-sm group-hover:text-gray-500 transition-colors">{anomaly.timestamp}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-200 mb-1">{anomaly.service}</h3>
            <p className="text-gray-400 text-xs mb-6 leading-relaxed">{anomaly.message}</p>
            <button className="clarity-btn text-xs">
              View Fix Proposal
            </button>
          </div>
        ))}
      </div>
    </div >
  );
}
