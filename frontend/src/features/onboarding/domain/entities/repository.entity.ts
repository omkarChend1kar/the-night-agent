export interface RepositoryEntity {
    id: string;
    url: string;
    protocol: 'https' | 'ssh';
    publicKey?: string;
    sshConfigAlias?: string;
}

export interface SidecarConfigEntity {
    dockerCommand: string;
    dockerCompose: string;
    apiKey: string;
    instructions: string[];
}

export interface VerificationResultEntity {
    success: boolean;
    logs: string[];
}
