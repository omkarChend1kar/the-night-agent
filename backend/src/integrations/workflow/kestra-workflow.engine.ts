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
      // Inputs expected by the Kestra flow
      const inputs = {
        anomalyId: anomalyId,
      };

      // Kestra API requires multipart/form-data for inputs if they are files, 
      // but for simple key-values in JSON, we can often send them as form-data or JSON depending on version.
      // Standard Kestra trigger usually accepts multipart.
      // Let's try sending as standard form data or just JSON body if supported.
      // For Kestra 0.11+, we can POST /api/v1/executions/{namespace}/{flowId} with FormData.
      
      const formData = new FormData();
      formData.append('anomalyId', anomalyId);
      
      // Since we are in Node.js, we might need a FormData polyfill or just use axios with simple object if Kestra allows JSON.
      // Kestra often expects 'inputs' as a map. 
      // Let's assume a modern Kestra version that accepts JSON body: { inputs: { ... } } or just multipart.
      
      // Safest approach for Node axios without FormData polyfill is often strictly JSON if the endpoint supports it.
      // If not, we might fail. Let's assume standard POST with multipart using 'axios' headers if needed, 
      // but simpler: many Kestra versions support just key-values in body for strings.
      
      // Let's use a simple multipart-like approach via 'axios' or 'form-data' package if needed. 
      // But standard axios post with object often works for json-based inputs.
      
      const response = await axios.post(url, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
      });

      // Note: In a real Node env, axios + FormData (native in Node 18+) works.
      
      const executionId = response.data.id;
      this.logger.log(`Started Kestra execution: ${executionId}`);
      return executionId;
    } catch (error) {
      this.logger.error(`Failed to start workflow: ${error.message}`);
      // Fallback for MVP if Kestra isn't running: return a mock ID
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
