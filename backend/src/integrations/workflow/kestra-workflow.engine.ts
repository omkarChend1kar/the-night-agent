import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WorkflowEngine, WorkflowStatus } from './workflow-engine.interface';

@Injectable()
export class KestraWorkflowEngine implements WorkflowEngine {
  private readonly logger = new Logger(KestraWorkflowEngine.name);
  private readonly kestraUrl = process.env.KESTRA_URL || 'http://localhost:8080';
  private readonly namespace = process.env.KESTRA_NAMESPACE || 'nightagent';
  private readonly flowId = process.env.KESTRA_FLOW_ID || 'fix_anomaly';

  async startFixWorkflow(anomalyId: string): Promise<string> {
    const url = `${this.kestraUrl}/api/v1/executions/${this.namespace}/${this.flowId}`;
    this.logger.log(`Triggering Kestra workflow at ${url} for anomaly ${anomalyId}`);

    try {
      // Using standard JSON body which Kestra supports for simple inputs
      // and is safer in Node environment than FormData
      const response = await axios.post(url, {
        anomalyId: anomalyId
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const executionId = response.data.id;
      this.logger.log(`Started Kestra execution: ${executionId}`);
      return executionId;
    } catch (error) {
      this.logger.error(`Failed to start workflow: ${error.message}`);
      if (error.response) {
        this.logger.error(`Kestra Response Status: ${error.response.status}`);
        this.logger.error(`Kestra Response Data: ${JSON.stringify(error.response.data)}`);
      }
      return 'kestra-failed-mock-' + Date.now();
    }
  }

  async getStatus(workflowExecutionId: string): Promise<WorkflowStatus> {
    const url = `${this.kestraUrl}/api/v1/executions/${workflowExecutionId}`;
    try {
      const response = await axios.get(url);
      const state = response.data.state.current;

      // Map Kestra states to our simple status
      let status: WorkflowStatus['status'] = 'running';
      if (state === 'SUCCESS') status = 'completed';
      if (state === 'FAILED' || state === 'KILLED') status = 'failed';

      return {
        status,
        currentStep: state, // Kestra state name
      };
    } catch (error) {
      this.logger.error(`Failed to get status: ${error.message}`);
      return { status: 'failed', error: error.message };
    }
  }
}
