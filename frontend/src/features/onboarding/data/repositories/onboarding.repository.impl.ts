import { IOnboardingRepository } from "../../domain/repositories/onboarding.repository.interface";
import { OnboardingDataSource } from "../datasources/onboarding.datasource";
import { RepositoryEntity, SidecarConfigEntity, VerificationResultEntity } from "../../domain/entities/repository.entity";

export class OnboardingRepositoryImpl implements IOnboardingRepository {
    constructor(private dataSource: OnboardingDataSource) { }

    async connect(repoUrl: string, protocol: 'https' | 'ssh', token?: string, username?: string): Promise<{ repo: RepositoryEntity; publicKey?: string }> {
        const result = await this.dataSource.onboard(repoUrl, protocol, token, username);
        // Map raw response to Entity
        const repo: RepositoryEntity = {
            id: result.repoId,
            url: repoUrl,
            protocol: protocol,
            publicKey: result.publicKey
        };
        return { repo, publicKey: result.publicKey };
    }

    async verifyConnection(repoId: string): Promise<VerificationResultEntity> {
        return this.dataSource.verify(repoId);
    }

    async cloneRepository(repoId: string): Promise<{ success: boolean; message?: string }> {
        return this.dataSource.cloneRepository(repoId);
    }

    async provisionSidecar(repoId: string): Promise<SidecarConfigEntity> {
        const res = await this.dataSource.createSidecar(repoId);
        return res.setup;
    }

    async getOnboardingState(): Promise<any> {
        return this.dataSource.getOnboardingState();
    }

    async disconnectRepository(repoId: string): Promise<void> {
        await this.dataSource.deleteRepository(repoId);
    }

    async getRepositories(): Promise<RepositoryEntity[]> {
        return this.dataSource.getRepositories();
    }

    async regenerateKey(repoId: string): Promise<string> {
        const res = await this.dataSource.regenerateKey(repoId);
        return res.publicKey;
    }
}
