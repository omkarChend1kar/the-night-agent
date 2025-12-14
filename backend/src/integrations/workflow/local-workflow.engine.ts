import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEngine, WorkflowStatus } from './workflow-engine.interface';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class LocalWorkflowEngine implements WorkflowEngine {
    private logger = new Logger(LocalWorkflowEngine.name);

    async executeFlow(flowId: string, inputs: Record<string, any>): Promise<string> {
        this.logger.log(`[LocalWorkflow] Executing flow ${flowId} with inputs: ${JSON.stringify(inputs)}`);

        let script = '';
        let args: string[] = [];

        if (flowId === 'apply_fix_flow') {
            script = 'backend/agents/apply_fix_agent.py';
            // Python generic execution: fixId, repoPath, branch
            args = [inputs.fixId, inputs.repoPath, inputs.branch];
        } else if (flowId === 'merge_fix_flow') {
            script = 'backend/agents/merge_fix_agent.py';
            args = [inputs.fixId, inputs.repoPath, inputs.branch || 'main']; // Target branch usually main
        } else {
            this.logger.warn(`[LocalWorkflow] Flow ${flowId} not mapped to local script.`);
            return 'skipped-unknown-flow';
        }

        const projectRoot = process.cwd(); // Assumes running from project root where backend/agents exists

        this.logger.log(`[LocalWorkflow] Spawning: python3 ${script} ${args.join(' ')}`);

        try {
            const child = spawn('python3', [script, ...args], {
                cwd: projectRoot,
                stdio: 'inherit', // Piping to stdout allows user to see logs in backend terminal!
                detached: false   // Keep attached to see lifecycle for debugging, or true for fire-and-forget? 
                // If web request hangs, switch to detached. But 'apply' is fast.
            });

            child.on('error', (err) => {
                this.logger.error(`[LocalWorkflow] Failed to start process: ${err.message}`);
            });

            child.on('exit', (code, signal) => {
                this.logger.log(`[LocalWorkflow] Process exited with code ${code}`);
            });

            // We return immediately, assuming async execution like Kestra
            return `local-${flowId}-${Date.now()}`;

        } catch (e: any) {
            this.logger.error(`[LocalWorkflow] Spawn error: ${e.message}`);
            throw e;
        }
    }

    async startFixWorkflow(anomalyId: string): Promise<string> {
        this.logger.log(`[LocalWorkflow] Start Fix Workflow for ${anomalyId} (Not fully implemented locally yet)`);
        // Could run Analyst + Propose chain here
        return 'local-triage-id';
    }

    async getStatus(workflowExecutionId: string): Promise<WorkflowStatus> {
        return {
            status: 'completed', // Always pretend running/completed
            currentStep: 'running'
        };
    }
}
