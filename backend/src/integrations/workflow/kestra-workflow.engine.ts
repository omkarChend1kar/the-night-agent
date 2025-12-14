import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { WorkflowEngine, WorkflowStatus } from './workflow-engine.interface';

@Injectable()
export class KestraWorkflowEngine implements WorkflowEngine {
  private readonly logger = new Logger(KestraWorkflowEngine.name);
  private readonly kestraUrl = process.env.KESTRA_URL || 'http://localhost:8080';
  private readonly namespace = process.env.KESTRA_NAMESPACE || 'nightagent';
  private readonly flowId = process.env.KESTRA_FLOW_ID || 'fix_anomaly';
  private readonly apiToken = process.env.KESTRA_API_TOKEN;
  private readonly username = process.env.KESTRA_USERNAME;
  private readonly password = process.env.KESTRA_PASSWORD;
  private readonly tenant = process.env.KESTRA_TENANT || 'main';
  
  /**
   * Creates and returns a configured axios instance with authentication
   * Supports both API token (service account) and Basic Auth
   */
  private getAxiosClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.kestraUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Prefer API token if available (service account)
    if (this.apiToken) {
      this.logger.debug(`Using API token for Kestra authentication`);
      client.defaults.headers.common['Authorization'] = `Bearer ${this.apiToken}`;
      return client;
    }

    // Fall back to Basic Auth if username/password are provided
    if (this.username && this.password) {
      this.logger.debug(`Using Basic Auth for Kestra (username: ${this.username})`);
      const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      client.defaults.headers.common['Authorization'] = `Basic ${credentials}`;
      return client;
    }

    // No authentication configured - try without auth (for local dev)
    this.logger.warn(`No Kestra authentication configured! Username: ${this.username}, Password: ${this.password ? '***' : 'not set'}, API Token: ${this.apiToken ? '***' : 'not set'}`);
    return client;
  }

  async startFixWorkflow(anomalyId: string): Promise<string> {
    const url = `/api/v1/executions/${this.namespace}/${this.flowId}`;
    this.logger.log(`Triggering Kestra workflow ${this.flowId} in namespace ${this.namespace} for anomaly ${anomalyId}`);

    try {
      const client = this.getAxiosClient();
      
      // Kestra requires multipart/form-data for execution inputs
      const formData = new FormData();
      formData.append('anomalyId', anomalyId);
      
      const response = await client.post(url, formData, {
        headers: {
          ...formData.getHeaders(),
          ...client.defaults.headers.common
        }
      });

      const executionId = response.data.id;
      if (!executionId) {
        throw new Error('No execution ID returned from Kestra');
      }

      this.logger.log(`Started Kestra execution: ${executionId}`);
      return executionId;
    } catch (error: any) {
      this.logger.error(`Failed to start workflow: ${error.message}`);
      if (error.response) {
        this.logger.error(`Kestra Response Status: ${error.response.status}`);
        this.logger.error(`Kestra Response Data: ${JSON.stringify(error.response.data)}`);
      }
      return 'kestra-failed-mock-' + Date.now();
    }
  }

  async executeFlow(flowId: string, inputs: Record<string, any>): Promise<string> {
    const url = `/api/v1/executions/${this.namespace}/${flowId}`;
    this.logger.log(`Triggering Kestra generic workflow ${flowId} in namespace ${this.namespace}`);

    try {
      const client = this.getAxiosClient();
      
      // Kestra requires multipart/form-data for execution inputs
      const formData = new FormData();
      for (const [key, value] of Object.entries(inputs)) {
        formData.append(key, String(value));
      }
      
      const response = await client.post(url, formData, {
        headers: {
          ...formData.getHeaders(),
          ...client.defaults.headers.common
        }
      });

      const executionId = response.data.id;
      if (!executionId) {
        throw new Error('No execution ID returned from Kestra');
      }

      this.logger.log(`Started Kestra execution: ${executionId}`);
      return executionId;
    } catch (error: any) {
      this.logger.error(`Failed to start workflow ${flowId}: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  async getStatus(workflowExecutionId: string): Promise<WorkflowStatus> {
    const url = `/api/v1/executions/${workflowExecutionId}`;
    try {
      const client = this.getAxiosClient();
      const response = await client.get(url);
      const state = response.data.state.current;

      let status: WorkflowStatus['status'] = 'running';
      if (state === 'SUCCESS') status = 'completed';
      if (state === 'FAILED' || state === 'KILLED') status = 'failed';

      return {
        status,
        currentStep: state,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get status: ${error.message}`);
      return { status: 'failed', error: error.message };
    }
  }
}
