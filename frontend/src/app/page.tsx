"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Onboarding from '../components/Onboarding';
import Dashboard from '../components/Dashboard';

export default function Home() {
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    } else {
      // Check if user has repo connected
      import('axios').then(axios => {
        axios.default.get('http://localhost:3000/api/repos', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
          if (res.data && res.data.length > 0) {
            setIsOnboarded(true);
          }
          setLoading(false);
        }).catch(() => {
          // If error (e.g. 401), redirect to login
          setLoading(false);
          router.push('/login');
        });
      });
    }
  }, []);

  if (loading) return <div className="h-screen bg-black text-green-500 font-mono flex items-center justify-center">INITIALIZING...</div>;

  return (
    <main>
      {isOnboarded ? (
        <Dashboard />
      ) : (
        <Onboarding onComplete={() => setIsOnboarded(true)} />
      )}
    </main>
  );
}
