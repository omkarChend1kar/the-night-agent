export interface Anomaly {
    id: string;
    serviceId: string;
    timestamp: string;
    severity: string;
    message: string;
    logs: string[];
    traceId?: string;
    confidence: number;
}

export interface FixProposal {
    id: string;
    anomalyId: string;
    summary: string;
    explanation?: string;
    diff: string;
    branch: string;
    confidence: number;
    status: 'pending' | 'approved' | 'rejected' | 'applied' | 'applied_sandbox' | 'merged';
}

export interface ApplyResult {
    success: boolean;
    message?: string;
    pullRequestUrl?: string; // Optional if we move to PRs later, but focus is direct merge
}

export interface CodeExecutor {
    analyzeAndPropose(repoPath: string, anomaly: Anomaly): Promise<FixProposal>;
    applyFix(repoPath: string, fix: FixProposal): Promise<ApplyResult>;
}
