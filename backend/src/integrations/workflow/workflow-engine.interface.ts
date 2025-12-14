export interface WorkflowStatus {
    status: 'running' | 'completed' | 'failed';
    currentStep?: string;
    error?: string;
}

export interface WorkflowEngine {
    startFixWorkflow(anomalyId: string): Promise<string>;
    executeFlow(flowId: string, inputs: Record<string, any>): Promise<string>; // Generic execution
    getStatus(workflowExecutionId: string): Promise<WorkflowStatus>;
}
