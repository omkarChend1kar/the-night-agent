import { Injectable } from '@nestjs/common';
import { CodeExecutor, Anomaly, FixProposal, ApplyResult } from './code-executor.interface';

@Injectable()
export class MockCodeExecutor implements CodeExecutor {
    async analyzeAndPropose(repoPath: string, anomaly: Anomaly): Promise<FixProposal> {
        console.log(`[MockExecutor] Analyzing ${repoPath} for anomaly ${anomaly.id}`);
    return {
      id: 'fix-' + Date.now(),
      anomalyId: anomaly.id,
      summary: 'Mock fix for ' + anomaly.message,
      diff: '--- mock diff ---',
      branch: 'fix/mock-branch-' + Date.now(),
      confidence: 0.95,
      status: 'pending'
    };
  }

  async applyFix(repoPath: string, fix: FixProposal): Promise<ApplyResult> {
    console.log(`[MockExecutor] Applying fix ${fix.id} to ${repoPath}`);
    return { success: true };
  }
}
