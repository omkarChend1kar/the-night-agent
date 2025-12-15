import { IDashboardRepository } from "../../domain/repositories/dashboard.repository.interface";
import { DashboardDataSource } from "../datasources/dashboard.datasource";
import { AnomalyEntity } from "../../domain/entities/anomaly.entity";

export class DashboardRepositoryImpl implements IDashboardRepository {
    constructor(private dataSource: DashboardDataSource) { }

    async getAnomalies(): Promise<AnomalyEntity[]> {
        return this.dataSource.fetchAnomalies();
    }

    async getRepoInfo(): Promise<{ name: string; url: string } | null> {
        const repos = await this.dataSource.fetchRepos();
        if (repos && repos.length > 0) {
            const url = repos[0].url;
            const name = url.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', '');
            return { name, url };
        }
        return null;
    }

    async getSandboxDiff(anomalyId: string): Promise<string | null> {
        try {
            const res = await this.dataSource.getDiff(anomalyId);
            return res.diff;
        } catch {
            return null;
        }
    }

    async getBranches(anomalyId: string): Promise<string[]> {
        try {
            const res = await this.dataSource.getBranches(anomalyId);
            return res.branches || ['main'];
        } catch {
            return ['main'];
        }
    }

    async refineProposal(anomalyId: string, instruction: string): Promise<void> {
        return this.dataSource.refineFix(anomalyId, instruction);
    }

    async refineSandbox(anomalyId: string, instruction: string): Promise<void> {
        return this.dataSource.refineSandbox(anomalyId, instruction);
    }

    async approveToSandbox(anomalyId: string): Promise<void> {
        return this.dataSource.applySandbox(anomalyId);
    }

    async rejectFix(anomalyId: string): Promise<void> {
        // Mock impl from original logic
        return Promise.resolve();
    }

    async mergeFix(anomalyId: string, targetBranch: string): Promise<void> {
        return this.dataSource.mergeFix(anomalyId, targetBranch);
    }
}
