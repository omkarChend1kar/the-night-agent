import { API_BASE_URL, HttpClient } from "../../../../core/http/api-client";
import { RepositoryEntity, SidecarConfigEntity, VerificationResultEntity } from "../../domain/entities/repository.entity";

export class OnboardingDataSource extends HttpClient {
    constructor() {
        super(API_BASE_URL);
    }

    async onboard(repoUrl: string, protocol: 'https' | 'ssh', token?: string, username?: string): Promise<{ repoId: string, publicKey?: string, status: string }> {
        return this.post('/onboard', { repoUrl, protocol, token, username });
    }

    async verify(repoId: string): Promise<VerificationResultEntity> {
        return this.post<VerificationResultEntity>(`/repos/${repoId}/verify`);
    }

    async cloneRepository(repoId: string): Promise<{ success: boolean; message?: string }> {
        return this.post<{ success: boolean, message?: string }>(`/repos/${repoId}/clone`);
    }

    async createSidecar(repoId: string): Promise<{ setup: SidecarConfigEntity }> {
        // Hardcoded defaults for now as per original component
        return this.post<{ setup: SidecarConfigEntity }>('/sidecars', {
            repoId,
            name: 'Sidecar for Repository',
            logPath: '/var/log/app.log',
            serviceId: 'production-service'
        });
    }

    async getOnboardingState(): Promise<any> {
        return this.get('/onboarding/state');
    }

    async deleteRepository(repoId: string): Promise<{ status: string }> {
        return this.delete(`/repos/${repoId}`);
    }

    async getRepositories(): Promise<RepositoryEntity[]> {
        return this.get<RepositoryEntity[]>('/repos');
    }

    async regenerateKey(repoId: string): Promise<{ publicKey: string }> {
        return this.post<{ publicKey: string }>(`/repos/${repoId}/regenerate-key`);
    }
}
