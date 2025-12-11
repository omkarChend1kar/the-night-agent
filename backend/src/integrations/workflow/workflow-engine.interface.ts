export interface WorkflowStatus {
    status: 'running' | 'completed' | 'failed';
    currentStep?: string;
    error?: string;
}

export interface WorkflowEngine {
    startFixWorkflow(anomalyId: string): Promise<string>;
    getStatus(workflowExecutionId: string): Promise<WorkflowStatus>;
}
