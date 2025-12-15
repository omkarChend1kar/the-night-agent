import { useState, useEffect, useCallback } from 'react';
import { DashboardDataSource } from '../../data/datasources/dashboard.datasource';
import { DashboardRepositoryImpl } from '../../data/repositories/dashboard.repository.impl';
import { AnomalyEntity } from '../../domain/entities/anomaly.entity';

// Composition Root
const dataSource = new DashboardDataSource();
const repository = new DashboardRepositoryImpl(dataSource);

export interface DashboardState {
    anomalies: AnomalyEntity[];
    selectedId: string | null;
    repoName: string;
    isLoading: boolean;
    error: string | null;
    refiningProposal: boolean;
    refiningSandbox: boolean;
    proposalInstruction: string;
    sandboxInstruction: string;
}

export const useDashboardBloc = () => {
    const [state, setState] = useState<DashboardState>({
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

    // Sub-Hook State (Derived async)
    const [diff, setDiff] = useState<string | null>(null);
    const [branches, setBranches] = useState<string[]>([]);

    const fetchAnomalies = useCallback(async () => {
        try {
            const anomalies = await repository.getAnomalies();
            setState(s => ({ ...s, anomalies }));
        } catch (err) {
            console.error(err);
        }
    }, []);

    const fetchRepoInfo = useCallback(async () => {
        try {
            const info = await repository.getRepoInfo();
            if (info) {
                setState(s => ({ ...s, repoName: info.name }));
            }
        } catch (err) {
            setState(s => ({ ...s, repoName: 'Error fetching repo' }));
        }
    }, []);

    // Actions
    const selectAnomaly = (id: string) => setState(s => ({ ...s, selectedId: id }));
    const setRefiningProposal = (v: boolean) => setState(s => ({ ...s, refiningProposal: v }));
    const setRefiningSandbox = (v: boolean) => setState(s => ({ ...s, refiningSandbox: v }));
    const setProposalInstruction = (v: string) => setState(s => ({ ...s, proposalInstruction: v }));
    const setSandboxInstruction = (v: string) => setState(s => ({ ...s, sandboxInstruction: v }));

    const refineProposal = async () => {
        if (!state.selectedId) return;
        try {
            await repository.refineProposal(state.selectedId, state.proposalInstruction);
            alert('Instruction sent.');
            setState(s => ({ ...s, refiningProposal: false, proposalInstruction: '' }));
            window.location.reload();
        } catch (e) { alert('Failed'); }
    };

    const refineSandbox = async () => {
        if (!state.selectedId) return;
        try {
            await repository.refineSandbox(state.selectedId, state.sandboxInstruction);
            alert('Sandbox Adjustments Requested.');
            setState(s => ({ ...s, refiningSandbox: false, sandboxInstruction: '' }));
        } catch (e) { alert('Failed'); }
    };

    const approveToSandbox = async () => {
        if (!state.selectedId) return;
        try {
            await repository.approveToSandbox(state.selectedId);
            alert('Fix applied to sandbox.');
            fetchAnomalies();
        } catch (e: any) { alert('Failed: ' + e.message); }
    };

    const rejectFix = async () => { alert('Fix rejected'); };

    const confirmMerge = async (targetBranch: string) => {
        if (!state.selectedId) return;
        try {
            await repository.mergeFix(state.selectedId, targetBranch);
            alert('Merge complete.');
            fetchAnomalies();
        } catch (e: any) { alert('Merge failed: ' + e.message); }
    };

    // Effects
    useEffect(() => {
        fetchRepoInfo();
        fetchAnomalies();
        const interval = setInterval(fetchAnomalies, 5000);
        return () => clearInterval(interval);
    }, [fetchAnomalies, fetchRepoInfo]);

    // Derived Logic Logic
    const selectedAnomaly = state.anomalies.find(a => a.id === state.selectedId);

    useEffect(() => {
        if (selectedAnomaly && (selectedAnomaly.status === 'SANDBOX_READY' || selectedAnomaly.status === 'applied_sandbox' || selectedAnomaly.status === 'RESOLVED' || selectedAnomaly.status === 'merged')) {
            repository.getSandboxDiff(selectedAnomaly.id).then(d => setDiff(d || selectedAnomaly.generated_patch || null));
            repository.getBranches(selectedAnomaly.id).then(b => setBranches(b));
        } else {
            setDiff(null);
            setBranches(['main']);
        }
    }, [selectedAnomaly?.id, selectedAnomaly?.status]);

    return {
        state,
        derived: { selectedAnomaly, sandboxDiff: diff, availableBranches: branches },
        actions: {
            selectAnomaly,
            setRefiningProposal, setRefiningSandbox,
            setProposalInstruction, setSandboxInstruction,
            refineProposal, refineSandbox,
            approveToSandbox, rejectFix, confirmMerge
        }
    };
};
