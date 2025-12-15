import { AnomalyEntity } from "../entities/anomaly.entity";

export interface IDashboardRepository {
    getAnomalies(): Promise<AnomalyEntity[]>;
    getRepoInfo(): Promise<{ name: string; url: string } | null>;
    getSandboxDiff(anomalyId: string): Promise<string | null>;
    getBranches(anomalyId: string): Promise<string[]>;

    // Actions
    refineProposal(anomalyId: string, instruction: string): Promise<void>;
    refineSandbox(anomalyId: string, instruction: string): Promise<void>;
    approveToSandbox(anomalyId: string): Promise<void>;
    rejectFix(anomalyId: string): Promise<void>;
    mergeFix(anomalyId: string, targetBranch: string): Promise<void>;
}
