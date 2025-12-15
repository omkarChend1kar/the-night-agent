import { useState, useEffect } from 'react';
import axios from 'axios';

// Define the precise states for our app
export type AppState =
    | 'LOADING'           // Initial check
    | 'UNAUTHENTICATED'   // Token missing
    | 'ONBOARDING_CONNECT'// Auth, no repo
    | 'ONBOARDING_VERIFY' // Auth, repo not verified
    | 'ONBOARDING_SIDECAR'// Auth, verified, sidecar not acknowledged
    | 'DASHBOARD';        // Auth, sidecar acknowledged (Completed)

export const useGlobalState = () => {
    const [appState, setAppState] = useState<AppState>('LOADING');

    useEffect(() => {
        const determineState = async () => {
            try {
                const storedToken = localStorage.getItem('token');

                if (storedToken) {
                    try {
                        const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/onboarding/state`, {
                            headers: { Authorization: `Bearer ${storedToken}` }
                        });

                        const step = res.data.step;
                        console.log('[GlobalState] Onboarding Step:', step);

                        if (step === 'COMPLETED') {
                            setAppState('DASHBOARD');
                        } else if (step === 'SIDECAR_SETUP') {
                            setAppState('ONBOARDING_SIDECAR');
                        } else if (step === 'VERIFY_ACCESS') {
                            setAppState('ONBOARDING_VERIFY');
                        } else {
                            setAppState('ONBOARDING_CONNECT');
                        }
                    } catch (err) {
                        console.error('[GlobalState] Failed to fetch onboarding state', err);
                        // Token likely invalid
                        setAppState('UNAUTHENTICATED');
                    }
                } else {
                    setAppState('UNAUTHENTICATED');
                }
            } catch (err) {
                console.error("[GlobalState] Determination failed", err);
                setAppState('UNAUTHENTICATED');
            }
        };

        determineState();
    }, []);

    return appState;
};
