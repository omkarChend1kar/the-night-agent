import { IOnboardingRepository } from "../repositories/onboarding.repository.interface";
import { RepositoryEntity, SidecarConfigEntity, VerificationResultEntity } from "../entities/repository.entity";

export class ConnectRepositoryUseCase {
    constructor(private repository: IOnboardingRepository) { }

    async execute(repoUrl: string, protocol: 'https' | 'ssh', token?: string, username?: string): Promise<{ repo: RepositoryEntity; publicKey?: string }> {
        // Business logic validation could go here
        if (!repoUrl) throw new Error("Repository URL is required");
        return this.repository.connect(repoUrl, protocol, token, username);
    }
}

export class VerifyRepositoryUseCase {
    constructor(private repository: IOnboardingRepository) { }

    async execute(repoId: string): Promise<VerificationResultEntity> {
        return this.repository.verifyConnection(repoId);
    }
}

export class CloneRepositoryUseCase {
    constructor(private repository: IOnboardingRepository) { }

    async execute(repoId: string): Promise<{ success: boolean }> {
        return this.repository.cloneRepository(repoId);
    }
}

export class ProvisionSidecarUseCase {
    constructor(private repository: IOnboardingRepository) { }

    async execute(repoId: string): Promise<SidecarConfigEntity> {
        return this.repository.provisionSidecar(repoId);
    }
}
