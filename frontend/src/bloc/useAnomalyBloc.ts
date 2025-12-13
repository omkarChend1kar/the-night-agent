import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// --- State Interfaces ---
export interface Anomaly {
    id: string;
    message: string;
    description: string;
    severity: string;
    status: string;
    createdAt: string;
    repoUrl: string;
    context?: string;
    logs?: string[];
    branch?: string;
    generated_patch?: string;
    root_cause_analysis?: any;
}

export interface AnomalyState {
    anomalies: Anomaly[];
    selectedId: string | null;
    repoName: string;
    isLoading: boolean;
    error: string | null;

    // UI State for Refinement Forms
    refiningProposal: boolean;
    refiningSandbox: boolean;
    proposalInstruction: string;
    sandboxInstruction: string;
}

// --- BLoC (Business Logic Component) Interface ---
export interface AnomalyBloc {
    state: AnomalyState;
    actions: {
        selectAnomaly: (id: string) => void;
        setRefiningProposal: (isRefining: boolean) => void;
        setRefiningSandbox: (isRefining: boolean) => void;
        setProposalInstruction: (instruction: string) => void;
        setSandboxInstruction: (instruction: string) => void;

        // Async Actions
        fetchAnomalies: () => Promise<void>;
        refineProposal: () => Promise<void>;
        refineSandbox: () => Promise<void>;
        approveToSandbox: () => Promise<void>;
        rejectFix: () => Promise<void>;
        confirmMerge: (targetBranch: string) => Promise<void>;
    };
    derived: {
        selectedAnomaly: Anomaly | undefined;
        sandboxDiff: string | null;
        availableBranches: string[];
    }
}

const API_BASE = 'http://127.0.0.1:3001/api';

export const useAnomalyBloc = (): AnomalyBloc => {
    // Internal State
    const [state, setState] = useState<AnomalyState>({
        anomalies: [],
        selectedId: null,
        repoName: 'Loading...',
        isLoading: false,
        error: null,
        refiningProposal: false,
        refiningSandbox: false,
        proposalInstruction: '',
        sandboxInstruction: ''
    });

    // Helper to get token
    const getToken = () => localStorage.getItem('token');

    // --- Actions ---

    const fetchAnomalies = useCallback(async () => {
        try {
            const token = getToken();
            const res = await axios.get(`${API_BASE}/anomalies`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setState(s => ({ ...s, anomalies: res.data }));
        } catch (err: any) {
            console.error(err);
            // setState(s => ({ ...s, error: err.message })); // Optional: don't show global error for polling
        }
    }, []);

    const fetchRepoInfo = useCallback(async () => {
        try {
            const token = getToken();
            const res = await axios.get(`${API_BASE}/repos`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data && res.data.length > 0) {
                const url = res.data[0].url;
                const name = url.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', '');
                setState(s => ({ ...s, repoName: name }));
            } else {
                setState(s => ({ ...s, repoName: 'No Repo Connected' }));
            }
        } catch (err) {
            setState(s => ({ ...s, repoName: 'Error fetching repo' }));
        }
    }, []);

    const selectAnomaly = (id: string) => {
        setState(s => ({ ...s, selectedId: id }));
    };

    const setRefiningProposal = (isRefining: boolean) => setState(s => ({ ...s, refiningProposal: isRefining }));
    const setRefiningSandbox = (isRefining: boolean) => setState(s => ({ ...s, refiningSandbox: isRefining }));
    const setProposalInstruction = (instruction: string) => setState(s => ({ ...s, proposalInstruction: instruction }));
    const setSandboxInstruction = (instruction: string) => setState(s => ({ ...s, sandboxInstruction: instruction }));

    // Async Operations
    const refineProposal = async () => {
        if (!state.selectedId) return;
        try {
            await axios.post(`${API_BASE}/fix/${state.selectedId}/refine`, { instruction: state.proposalInstruction }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            alert('Instruction sent. System is regenerating proposal...');
            setState(s => ({ ...s, refiningProposal: false, proposalInstruction: '' }));
            window.location.reload(); // Hard reload for now as per original logic
        } catch (e) {
            alert('Failed to send instruction');
        }
    };

    const refineSandbox = async () => {
        if (!state.selectedId) return;
        try {
            await axios.post(`${API_BASE}/fix/${state.selectedId}/refine-sandbox`, { instruction: state.sandboxInstruction }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            alert('Sandbox adjustments requested. System is applying changes...');
            setState(s => ({ ...s, refiningSandbox: false, sandboxInstruction: '' }));
        } catch (e) {
            alert('Failed to send sandbox instruction');
        }
    };

    const approveToSandbox = async () => {
        if (!state.selectedId) return;
        try {
            await axios.post(`${API_BASE}/fix/${state.selectedId}/apply-sandbox`, {}, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            alert('Fix applied to sandbox. Verifying...');
            fetchAnomalies(); // Refresh state instead of reload
        } catch (e: any) {
            alert('Failed: ' + e.message);
        }
    };

    const rejectFix = async () => {
        // Placeholder for future implementation
        alert('Fix rejected (local simulation)');
    };

    const confirmMerge = async (targetBranch: string) => {
        if (!state.selectedId) return;
        try {
            await axios.post(`${API_BASE}/fix/${state.selectedId}/merge`, { targetBranch }, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            alert('Merge verified and completed.');
            fetchAnomalies();
        } catch (e: any) {
            alert('Merge failed: ' + e.message);
        }
    };

    // --- Effects ---
    useEffect(() => {
        fetchRepoInfo();
        fetchAnomalies();
        const interval = setInterval(fetchAnomalies, 5000);
        return () => clearInterval(interval);
    }, [fetchAnomalies, fetchRepoInfo]);

    // Derived State and Side Effects
    const selectedAnomaly = state.anomalies.find(a => a.id === state.selectedId);
    const [diff, setDiff] = useState<string | null>(null);

    useEffect(() => {
        if (selectedAnomaly?.status === 'SANDBOX_READY') {
            axios.get(`${API_BASE}/fix/${selectedAnomaly.id}/diff`, { headers: { Authorization: `Bearer ${getToken()}` } })
                .then(res => setDiff(res.data.diff))
                .catch(() => setDiff(null));
        } else {
            setDiff(null);
        }
    }, [selectedAnomaly?.id, selectedAnomaly?.status]);

    const [branches, setBranches] = useState<string[]>([]);
    useEffect(() => {
        if (selectedAnomaly?.status === 'SANDBOX_READY') {
            axios.get(`${API_BASE}/fix/${selectedAnomaly.id}/branches`, { headers: { Authorization: `Bearer ${getToken()}` } })
                .then(res => setBranches(res.data.branches))
                .catch(() => setBranches(['main']));
        }
    }, [selectedAnomaly?.id, selectedAnomaly?.status]);

    return {
        state,
        actions: {
            selectAnomaly,
            setRefiningProposal,
            setRefiningSandbox,
            setProposalInstruction,
            setSandboxInstruction,
            fetchAnomalies,
            refineProposal,
            refineSandbox,
            approveToSandbox,
            rejectFix,
            confirmMerge,
        },
        derived: {
            selectedAnomaly,
            sandboxDiff: diff,
            availableBranches: branches
        }
    };
};
