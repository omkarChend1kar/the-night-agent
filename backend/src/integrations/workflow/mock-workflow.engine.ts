import { Injectable } from '@nestjs/common';
import { WorkflowEngine, WorkflowStatus } from './workflow-engine.interface';

@Injectable()
export class MockWorkflowEngine implements WorkflowEngine {
    async startFixWorkflow(anomalyId: string): Promise<string> {
        console.log(`[MockWorkflow] Starting fix for anomaly ${anomalyId}`);
    return 'mock-workflow-id-' + Date.now();
  }

  async getStatus(workflowExecutionId: string): Promise<WorkflowStatus> {
    return {
      status: 'completed',
      currentStep: 'finished'
    };
  }
}
