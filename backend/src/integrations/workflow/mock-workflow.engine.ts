import { Injectable } from '@nestjs/common';
import { WorkflowEngine, WorkflowStatus } from './workflow-engine.interface';

@Injectable()
export class MockWorkflowEngine implements WorkflowEngine {
  async startFixWorkflow(anomalyId: string): Promise<string> {
    console.log(`[MockWorkflow] Starting fix for anomaly ${anomalyId}`);

    // Simulate Async "Think" Phase
    setTimeout(async () => {
      const axios = require('axios');
      try {
        console.log(`[MockWorkflow] Simulating callback for ${anomalyId}...`);
        await axios.post('http://localhost:3001/api/internal/submit-proposal', {
          anomalyId: anomalyId,
          diff: "--- mock diff ---",
          explanation: "Simulated analysis complete (Mock Engine)."
        });
      } catch (e) {
        console.error('[MockWorkflow] Failed to callback', e.message);
      }
    }, 2000);

    return 'mock-workflow-id-' + Date.now();
  }

  async getStatus(workflowExecutionId: string): Promise<WorkflowStatus> {
    return {
      status: 'completed',
      currentStep: 'finished'
    };
  }
}
