import { RepositoryEntity, SidecarConfigEntity, VerificationResultEntity } from "../entities/repository.entity";

export interface IOnboardingRepository {
    connect(repoUrl: string, protocol: 'https' | 'ssh', token?: string, username?: string): Promise<{ repo: RepositoryEntity; publicKey?: string }>;
    verifyConnection(repoId: string): Promise<VerificationResultEntity>;
    cloneRepository(repoId: string): Promise<{ success: boolean; message?: string }>;
    provisionSidecar(repoId: string): Promise<SidecarConfigEntity>;
    getRepositories(): Promise<RepositoryEntity[]>;
    getOnboardingState(): Promise<any>;
    disconnectRepository(repoId: string): Promise<void>;
    regenerateKey(repoId: string): Promise<string>;
}
