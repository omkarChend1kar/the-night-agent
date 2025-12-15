import { useState, useCallback, useEffect } from 'react';
import { OnboardingDataSource } from '../../data/datasources/onboarding.datasource';
import { OnboardingRepositoryImpl } from '../../data/repositories/onboarding.repository.impl';
import { CloneRepositoryUseCase, ConnectRepositoryUseCase, ProvisionSidecarUseCase, VerifyRepositoryUseCase } from '../../domain/usecases/onboarding.usecases';
import { SidecarConfigEntity } from '../../domain/entities/repository.entity';

// Composition Root (Simple Manual DI)
// In a real app we might use a ContextProvider or IOC container
const dataSource = new OnboardingDataSource();
const repository = new OnboardingRepositoryImpl(dataSource);
const connectUseCase = new ConnectRepositoryUseCase(repository);
const verifyUseCase = new VerifyRepositoryUseCase(repository);
const cloneUseCase = new CloneRepositoryUseCase(repository);
const provisionUseCase = new ProvisionSidecarUseCase(repository);

export const useOnboardingViewModel = () => {
    // State
    const [repoUrl, setRepoUrl] = useState('');
    const [protocol, setProtocol] = useState<'https' | 'ssh'>('https');
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [connectedRepoId, setConnectedRepoId] = useState('');

    useEffect(() => {
        const loadState = async () => {
            try {
                const state = await repository.getOnboardingState();
                console.log('Restoring Onboarding State:', state);

                if (state.step === 'VERIFY_ACCESS') {
                    setRepoUrl(state.context.repoUrl);
                    setProtocol(state.context.protocol);
                    setPublicKey(state.context.publicKey);
                    setConnectedRepoId(state.context.repoId);
                } else if (state.step === 'SIDECAR_SETUP') {
                    setSidecarSetup(state.context); // This should valid SidecarConfigEntity structure
                }
            } catch (e) {
                console.error("Failed to restore state", e);
            }
        };
        loadState();
    }, [repository]);

    // SSH Specific
    const [publicKey, setPublicKey] = useState(''); // Serves as "Token" for display in SSH mode

    // Verification State
    const [verifying, setVerifying] = useState(false);
    const [cloning, setCloning] = useState(false);
    const [verificationLogs, setVerificationLogs] = useState<string[]>([]);

    // Final Result
    const [sidecarSetup, setSidecarSetup] = useState<SidecarConfigEntity | null>(null);

    // Methods
    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { repo, publicKey: pk } = await connectUseCase.execute(repoUrl, protocol, token);

            if (repo.id) {
                setConnectedRepoId(repo.id);
            }

            if (protocol === 'ssh') {
                if (pk) {
                    setToken(pk);
                    setPublicKey(pk);
                    setLoading(false);
                    return;
                } else {
                    throw new Error('SSH Identity generation failed. No public key returned from server.');
                }
            }

            // HTTPS Flow - Go straight to sidecar
            // Note: Original code skipped Verify for HTTPS? 
            // "HTTPS flow or Post-Verification SSH Flow - Create sidecar"
            // Actually original code went straight to sidecar for HTTPS.
            // Let's keep that behavior or unifying it?
            // Original: 
            // if (protocol === 'ssh') return;
            // await sidecar...

            const setup = await provisionUseCase.execute(repo.id);
            setSidecarSetup(setup);

        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Connection failed.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndClone = async () => {
        if (!connectedRepoId) return;
        setVerifying(true);
        setVerificationLogs(['Checking Access...']);
        setError(null);

        try {
            // 1. Verify
            const verifyRes = await verifyUseCase.execute(connectedRepoId);

            if (verifyRes.success) {
                setVerificationLogs(prev => [...prev, '✅ Access Verified.', 'Initiating Clone...']);
                setVerifying(false);
                setCloning(true);

                // 2. Clone
                await cloneUseCase.execute(connectedRepoId);
                setVerificationLogs(prev => [...prev, '✅ Repository Cloned.', 'Creating Sidecar Agent...']);

                // 3. Provision
                const setup = await provisionUseCase.execute(connectedRepoId);
                setSidecarSetup(setup);
            } else {
                setVerificationLogs(verifyRes.logs || ['Verification Failed']);
                setError('Verification failed. Check deploy keys.');
            }
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || 'Verification Process Failed';
            setError(msg);
            setVerificationLogs(prev => [...prev, `❌ Error: ${msg}`]);
        } finally {
            setVerifying(false);
            setCloning(false);
        }
    };

    const handleRegenerateKey = async () => {
        if (!connectedRepoId) return;
        setLoading(true);
        try {
            // Directly call repo method, skipping usecase wrapper for simplicity or add usecase if cleaner
            // For this patch, reuse repo instance
            const newKey = await repository.regenerateKey(connectedRepoId);
            setPublicKey(newKey);
        } catch (err: any) {
            setError('Failed to regenerate key: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return {
        state: {
            repoUrl, protocol, token, publicKey, loading, error,
            verifying, cloning, verificationLogs, sidecarSetup, connectedRepoId
        },
        actions: {
            setRepoUrl, setProtocol, setToken, setPublicKey,
            handleConnect, handleVerifyAndClone, handleRegenerateKey
        }
    };
};
