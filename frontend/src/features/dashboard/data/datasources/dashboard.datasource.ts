import { HttpClient, API_BASE_URL } from "../../../../core/http/api-client";
import { AnomalyEntity } from "../../domain/entities/anomaly.entity";

export class DashboardDataSource extends HttpClient {
    constructor() {
        super(API_BASE_URL);
    }

    async fetchAnomalies(): Promise<AnomalyEntity[]> {
        return this.get<AnomalyEntity[]>('/anomalies');
    }

    async fetchRepos(): Promise<any[]> {
        return this.get<any[]>('/repos');
    }

    async getDiff(id: string): Promise<{ diff: string }> {
        return this.get<{ diff: string }>(`/fix/${id}/diff`);
    }

    async getBranches(id: string): Promise<{ branches: string[] }> {
        return this.get<{ branches: string[] }>(`/fix/${id}/branches`);
    }

    async refineFix(id: string, instruction: string): Promise<void> {
        return this.post(`/fix/${id}/refine`, { instruction });
    }

    async refineSandbox(id: string, instruction: string): Promise<void> {
        return this.post(`/fix/${id}/refine-sandbox`, { instruction });
    }

    async applySandbox(id: string): Promise<void> {
        return this.post(`/fix/${id}/apply-sandbox`, {});
    }

    async mergeFix(id: string, targetBranch: string): Promise<void> {
        return this.post(`/fix/${id}/merge`, { targetBranch });
    }
}
