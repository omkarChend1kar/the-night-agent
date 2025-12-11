import { Injectable, Logger } from '@nestjs/common';
import { CodeExecutor, Anomaly, FixProposal, ApplyResult } from './code-executor.interface';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as util from 'util';
import * as path from 'path';

const execAsync = util.promisify(exec);

@Injectable()
export class ClineCodeExecutor implements CodeExecutor {
  private readonly logger = new Logger(ClineCodeExecutor.name);

  async analyzeAndPropose(repoPath: string, anomaly: Anomaly): Promise<FixProposal> {
    this.logger.log(`[Cline] Analyzing anomaly ${anomaly.id} in ${repoPath}`);

    // Construct the prompt for Cline
    const prompt = `
You are an expert software engineer.
An anomaly was detected in the following service: ${anomaly.serviceId}.
Severity: ${anomaly.severity}.
Message: ${anomaly.message}.

Logs:
${anomaly.logs.join('\\n').slice(0, 2000)}

The codebase is located at: ${repoPath}.
Please analyze the code to find the root cause.
Then, propose a code fix.
IMPORTANT: You MUST output the fix as a standard Unified Diff inside a markdown code block labeled 'diff'.
Example:
\\\`\\\`\\\`diff
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
- old
+ new
\\\`\\\`\\\`
Do not include any other markdown code blocks. Provide a brief summary of the fix before the diff.
    `;

    try {
      // Execute cline CLI
      // Assuming 'cline' is in PATH.
      // We use a non-interactive mode if available, or just pass the prompt as argument.
      // Note: Actual Cline CLI usage might vary (e.g. 'cline <prompt>').
      // We'll assume a simple 'cline' command that takes input args or stdin.
      // Using a timeout to prevent hanging.

      const { stdout, stderr } = await execAsync(`cline "${prompt.replace(/"/g, '\\\\"')}"`, {
        cwd: repoPath, // Run in the context of the repo
        timeout: 120000, // 2 minutes timeout
        maxBuffer: 1024 * 1024 * 5 // 5MB buffer
      });

      if (stderr) {
        this.logger.warn(`Cline stderr: ${stderr}`);
      }

      // Parse output for Diff
      const diffMatch = stdout.match(/\\`\\`\\`diff([\\s\\S]*?)\\`\\`\\`/);
      const diff = diffMatch ? diffMatch[1].trim() : '';

      // Parse output for Summary (everything before the diff)
      const summary = diffMatch ? stdout.split(diffMatch[0])[0].trim() : 'No summary provided';

      if (!diff) {
        throw new Error('No diff found in Cline output');
      }

      return {
        id: `fix-${Date.now()}`,
        anomalyId: anomaly.id,
        summary: summary.slice(0, 200) + '...',
        diff: diff,
        branch: `fix/auto-${anomaly.id.slice(0, 8)}`,
        confidence: 0.85, // Mock confidence for now
        status: 'pending'
      };

    } catch (error) {
      this.logger.error(`Cline execution failed: ${error.message}`);
      throw error;
    }
  }

  async applyFix(repoPath: string, fix: FixProposal): Promise<ApplyResult> {
    this.logger.log(`[Cline] Applying fix ${fix.id} to ${repoPath}`);

    // Safety fallback: Use native git apply instead of AI agent for application
    const patchPath = path.join(repoPath, `temp-${fix.id}.patch`);

    try {
      fs.writeFileSync(patchPath, fix.diff);

      // Use git apply
      await execAsync(`git apply "${patchPath}"`, { cwd: repoPath });

      return { success: true, message: 'Patch applied successfully via git' };
    } catch (error) {
      this.logger.error(`Failed to apply patch: ${error.message}`);
      return { success: false, message: error.message };
    } finally {
      if (fs.existsSync(patchPath)) {
        fs.unlinkSync(patchPath);
      }
    }
  }
}
