export interface AnomalyEntity {
    id: string;
    message: string;
    description: string;
    severity: string;
    status: string;
    createdAt: string;
    repoUrl: string;
    context?: string;
    logs?: string[];
    branch?: string;
    generated_patch?: string;
    root_cause_analysis?: {
        root_cause: string;
        relevant_files: string[];
    };
}
