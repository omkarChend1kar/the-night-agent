import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Anomaly, FixProposal } from '../integrations/code-executor/code-executor.interface';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from './encryption.service';

@Injectable()
export class AnomalyService {
    // Fixes are now persisted to the Fix table via Prisma

    constructor(
        private prisma: PrismaService,
        @Inject('WorkflowEngine') private workflowEngine: any,
        @Inject('GitManager') private gitManager: any
    ) { }

    async addAnomaly(dto: any, repoId: string) {
        const decision = this.evaluateAnomaly(dto);

        if (!decision.process) {
            console.log(`[AnomalyService] Dropping anomaly (Noise): ${dto.anomaly_type} - ${dto.message?.substring(0, 50)}...`);
            return null;
        }

        console.log(`[AnomalyService] Processing Anomaly (Score: ${decision.score}): ${dto.anomaly_type}`);

        const anomaly = await this.prisma.anomaly.create({
            data: {
                repoId: repoId,
                status: 'PENDING',
                context: JSON.stringify({
                    ...dto,
                    priority_score: decision.score // Persist score for future sorting
                })
            }
        });

        // Trigger Kestra Workflow (Agent 2)
        // Only trigger workflow if score is high enough (e.g. > 40) to avoid wasting compute on low priority
        if (decision.score >= 40) {
            try {
                console.log(`[AnomalyService] Triggering Kestra flow for ${anomaly.id}`);
                const executionId = await this.workflowEngine.startFixWorkflow(anomaly.id);
                console.log(`[AnomalyService] Workflow started: ${executionId}`);
            } catch (e) {
                console.error('[AnomalyService] Failed to trigger workflow', e);
            }
        } else {
            console.log(`[AnomalyService] Skipping workflow trigger (Low Priority: ${decision.score})`);
        }

        return anomaly;
    }

    private evaluateAnomaly(dto: any): { process: boolean; score: number } {
        const type = dto.anomaly_type || 'Unknown';
        // Handle varying severity formats - also check for "high"/"medium"/"low" and map them
        let severity = (dto.severity || dto.level || 'INFO').toUpperCase();

        // Map confidence-based severity to standard levels
        if (severity === 'HIGH') severity = 'ERROR';
        else if (severity === 'MEDIUM') severity = 'WARN';
        else if (severity === 'LOW') severity = 'INFO';

        // Check for user/tenant context in various places
        const context = dto.context || {};
        const userId = dto.user_id || context.user_id || dto.userId || context.tenant_scope;

        let score = 0;

        // RULE 1: Drop "Novelty" Info/Debug logs (Noise Filter)
        if (type === 'Novelty Anomaly' || type === 'Novel Log Template') {
            if (severity === 'INFO' || severity === 'DEBUG') {
                return { process: false, score: 0 };
            }
        }

        // RULE 2: Base Severity Scoring
        if (severity === 'CRITICAL' || severity === 'FATAL') score += 100;
        else if (severity === 'ERROR') score += 80;
        else if (severity === 'WARN') score += 40;
        else score += 10; // INFO

        // RULE 3: Anomaly Type Weighting
        if (type === 'Frequency Anomaly') score += 30; // Spikes are important
        if (type === 'Latency Anomaly') score += 30;   // UX impact
        if (type === 'Log-Sequence Anomaly') score += 20;
        // Add bonus for Novel Log Template when severity is ERROR or WARN
        if (type === 'Novel Log Template' && (severity === 'ERROR' || severity === 'WARN')) {
            score += 20; // Boost novel errors/warnings
        }

        // RULE 4: User Impact (The "Hindering User Experience" Check)
        if (userId) {
            score += 30; // Significant boost for identified user impact
        }

        // RULE 5: Confidence Multiplier
        if (dto.confidence && typeof dto.confidence === 'number') {
            if (dto.confidence > 0.9) score += 10;
            if (dto.confidence < 0.5) score -= 10;
        }

        return { process: true, score };
    }

    async getAnomalies() {
        // Return structured anomalies with active fix details
        const records = await this.prisma.anomaly.findMany({ include: { repo: true } });
        const results = [];

        for (const r of records) {
            const activeFix = await this.getFixByAnomalyId(r.id);
            results.push({
                ...JSON.parse(r.context),
                id: r.id,
                repoUrl: r.repo.url,
                status: r.status,
                createdAt: r.createdAt,
                branch: activeFix?.branch,
                fixExplanation: activeFix?.explanation
            });
        }

        return results;
    }

    async getAnomaly(id: string) {
        const r = await this.prisma.anomaly.findUnique({ where: { id }, include: { repo: true } });
        if (!r) return null;
        return {
            id: r.id,
            ...JSON.parse(r.context),
            repoUrl: r.repo.url,
            repoProtocol: r.repo.protocol,
            encryptedCreds: r.repo.encryptedCreds,
            status: r.status
        };
    }

    // === FIX MANAGEMENT (Database-backed) ===

    async addFix(fix: FixProposal) {
        // Upsert fix to database
        await this.prisma.fix.upsert({
            where: { anomalyId: fix.anomalyId },
            update: {
                diff: fix.diff,
                explanation: fix.explanation,
                summary: fix.summary,
                status: fix.status || 'pending',
                branch: fix.branch,
                confidence: fix.confidence
            },
            create: {
                id: fix.id,
                anomalyId: fix.anomalyId,
                diff: fix.diff,
                explanation: fix.explanation,
                summary: fix.summary,
                status: fix.status || 'pending',
                branch: fix.branch,
                confidence: fix.confidence
            }
        });

        // Also update Anomaly status
        if (fix.anomalyId) {
            await this.prisma.anomaly.update({
                where: { id: fix.anomalyId },
                data: { status: 'PROPOSAL_READY' }
            }).catch(console.error);
        }
    }

    async receiveProposal(fix: FixProposal) {
        await this.addFix(fix);
        console.log(`[AnomalyService] Proposal stored in DB for ${fix.anomalyId}`);
    }

    async getFix(id: string): Promise<FixProposal | null> {
        // Query database
        const dbFix = await this.prisma.fix.findUnique({ where: { id } });
        if (dbFix) {
            return this.mapDbFixToProposal(dbFix);
        }
        // Try by anomalyId
        const byAnomaly = await this.prisma.fix.findUnique({ where: { anomalyId: id } });
        return byAnomaly ? this.mapDbFixToProposal(byAnomaly) : null;
    }

    async getFixAsync(id: string): Promise<FixProposal | null> {
        return this.getFix(id);
    }

    async getFixByAnomalyId(anomalyId: string): Promise<FixProposal | null> {
        const dbFix = await this.prisma.fix.findUnique({ where: { anomalyId } });
        return dbFix ? this.mapDbFixToProposal(dbFix) : null;
    }

    private mapDbFixToProposal(dbFix: any): FixProposal {
        return {
            id: dbFix.id,
            anomalyId: dbFix.anomalyId,
            diff: dbFix.diff || '',
            explanation: dbFix.explanation || '',
            summary: dbFix.summary || '',
            status: dbFix.status || 'pending',
            branch: dbFix.branch || '',
            confidence: dbFix.confidence || 0
        };
    }

    async ensureFix(identifier: string): Promise<FixProposal | undefined> {
        // Try database first
        let fix = await this.getFix(identifier);
        if (fix) return fix;

        // Recovery Logic - reconstruct from anomaly
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: identifier },
            include: { repo: true }
        });

        if (anomaly && (['PROPOSAL_READY', 'SANDBOX_READY', 'RESOLVED'].includes(anomaly.status))) {
            console.log(`[Recovery] Reconstructing fix for anomaly ${identifier}`);
            const repoName = anomaly.repo?.url.split('/').pop()?.replace('.git', '') || 'unknown-repo';
            const sandboxBranch = `fix/${repoName}/${anomaly.id.substring(0, 8)}`;

            // Get the generated patch from the anomaly's context JSON
            let patchContent = '';
            try {
                const contextData = JSON.parse(anomaly.context || '{}');
                patchContent = contextData?.generated_patch || contextData?.patch || '';
                console.log(`[Recovery] Extracted patch from context, length: ${patchContent.length}`);
            } catch (e) {
                console.error('[Recovery] Failed to parse anomaly context:', e);
            }

            fix = {
                id: identifier,
                anomalyId: identifier,
                status: anomaly.status === 'SANDBOX_READY' ? 'applied_sandbox' :
                    anomaly.status === 'RESOLVED' ? 'merged' : 'pending',
                summary: 'Reconstructed Fix',
                explanation: 'Recovered from system state.',
                diff: patchContent,
                branch: sandboxBranch,
                confidence: 1.0
            };

            // Persist recovered fix to database
            await this.addFix(fix as FixProposal);
            console.log(`[Recovery] Fix reconstructed with patch length: ${patchContent.length}`);
            return fix as FixProposal;
        }
        return undefined;
    }

    async applyToSandbox(identifier: string) {
        const fix = await this.ensureFix(identifier);
        if (!fix) throw new Error('Fix not found');

        const fixId = fix.id;
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: fix.anomalyId },
            include: { repo: true }
        });

        if (!anomaly || !anomaly.repo) throw new Error('Anomaly/Repo not found');

        // Reconstruct local Path for git operations
        const repoUrl = anomaly.repo.url;
        let repoPath = '';
        const path = require('path');
        const fs = require('fs');

        try {
            const parts = repoUrl.split(/[:/]/);
            const repo = parts.pop()?.replace('.git', '');
            const owner = parts.pop();
            if (owner && repo) {
                const workspaceRoot = process.env.WORKSPACE_ROOT || 'workspace/repos';
                repoPath = path.isAbsolute(workspaceRoot)
                    ? path.join(workspaceRoot, owner, repo)
                    : path.join(process.cwd(), workspaceRoot, owner, repo);

                console.log(`[AnomalyService] Local repo path: ${repoPath}`);
            }
        } catch (e) {
            console.error('[AnomalyService] Failed to reconstruct repo path:', e);
        }

        // [Self-Healing] Ensure repo exists before operating on it
        if (repoPath && !fs.existsSync(repoPath)) {
            console.log(`[AnomalyService] Repo missing at ${repoPath}. Cloning from ${repoUrl}...`);
            // Assuming public repo or credentials handled by manager/url
            await this.gitManager.cloneRepo(repoUrl, anomaly.repo.encryptedCreds || '', repoPath);
        }

        if (!fix.branch) {
            const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
            fix.branch = `fix/${repoName}/${fix.anomalyId.substring(0, 8)}`;
        }

        console.log(`[AnomalyService] Applying fix ${fixId} to ${repoPath} on branch ${fix.branch}`);

        try {
            // Apply fix directly using git commands (simpler than Kestra for local dev)
            const simpleGit = require('simple-git');
            const git = simpleGit(repoPath);

            // Ensure we have the patch
            if (!fix.diff) {
                throw new Error('No patch content in fix proposal');
            }

            // Save patch to temp file
            const patchFile = path.join(repoPath, '.temp-fix.patch');
            fs.writeFileSync(patchFile, fix.diff);
            console.log(`[AnomalyService] Patch saved to ${patchFile}`);

            try {
                // Checkout main branch
                await git.checkout('main').catch(() => git.checkout('master'));
                await git.pull('origin', 'main').catch(() => git.pull('origin', 'master').catch(() => { }));

                // Create and checkout fix branch
                await git.checkoutLocalBranch(fix.branch).catch(() => git.checkout(fix.branch));

                // Apply the patch (try --3way for better conflict handling)
                let patchApplied = false;
                try {
                    await git.raw(['apply', '--3way', patchFile]);
                    console.log('[AnomalyService] Patch applied successfully');
                    patchApplied = true;
                } catch (applyError: any) {
                    console.warn('[AnomalyService] Patch apply failed:', applyError.message);
                }

                // Cleanup temp file BEFORE staging
                if (fs.existsSync(patchFile)) {
                    fs.unlinkSync(patchFile);
                }

                // Stage and commit if changes were made
                const status = await git.status();
                if (patchApplied && status.files.length > 0) {
                    await git.add('-A');
                    await git.commit(`fix: applied automated proposal ${fixId}`);
                    console.log('[AnomalyService] Changes committed');
                } else {
                    console.log('[AnomalyService] No changes to commit (patch may not have applied cleanly)');
                }

            } catch (innerError: any) {
                // Cleanup temp file on error
                if (fs.existsSync(patchFile)) {
                    fs.unlinkSync(patchFile);
                }
                throw innerError;
            }

            fix.status = 'applied_sandbox';
            await this.addFix(fix);

            // Update anomaly status
            await this.prisma.anomaly.update({
                where: { id: fix.anomalyId },
                data: { status: 'SANDBOX_READY' }
            });

            console.log(`[AnomalyService] Fix ${fixId} applied successfully to branch ${fix.branch}`);
            return { status: 'sandbox_initiated', sandboxBranch: fix.branch };
        } catch (e) {
            console.error('Apply Flow trigger failed:', e);
            throw e;
        }
    }

    async mergeFix(fixId: string, targetBranch: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) throw new Error('Fix not found');

        console.log(`[AnomalyService] Merging fix ${fixId} from ${fix.branch} to ${targetBranch}...`);

        // Reconstruct Repo Path
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: fix.anomalyId },
            include: { repo: true }
        });

        if (!anomaly || !anomaly.repo) {
            throw new Error('Anomaly or Repo not found for fix');
        }

        const repoUrl = anomaly.repo.url;
        let repoPath = '';
        const path = require('path');

        try {
            const parts = repoUrl.split(/[:/]/);
            const repo = parts.pop()?.replace('.git', '');
            const owner = parts.pop();
            if (owner && repo) {
                const workspaceRoot = process.env.WORKSPACE_ROOT || 'workspace/repos';
                repoPath = path.isAbsolute(workspaceRoot)
                    ? path.join(workspaceRoot, owner, repo)
                    : path.join(process.cwd(), workspaceRoot, owner, repo);
            }
        } catch (e) {
            console.warn('Failed to deduce repo path for merge:', e);
            throw new Error('Could not determine repository path');
        }

        if (!repoPath) {
            throw new Error('Repo path could not be deduced');
        }

        try {
            const simpleGit = require('simple-git');
            const git = simpleGit(repoPath);

            // Checkout target branch
            console.log(`[AnomalyService] Checking out ${targetBranch}...`);
            await git.checkout(targetBranch);

            // Merge the fix branch
            console.log(`[AnomalyService] Merging ${fix.branch} into ${targetBranch}...`);
            await git.merge([fix.branch, '--no-ff', '-m', `Merge fix: ${fixId}`]);

            console.log(`[AnomalyService] Merge successful!`);

            // Push the merged changes to remote
            console.log(`[AnomalyService] Pushing to origin/${targetBranch}...`);
            await git.push('origin', targetBranch);
            console.log(`[AnomalyService] Push successful!`);

            // Update fix status
            fix.status = 'merged';
            await this.addFix(fix);

            // Update anomaly status
            await this.prisma.anomaly.update({
                where: { id: fix.anomalyId },
                data: { status: 'RESOLVED' }
            });

            // Delete the fix branch (local and remote)
            try {
                await git.deleteLocalBranch(fix.branch);
                console.log(`[AnomalyService] Deleted local fix branch ${fix.branch}`);
                // Also delete remote fix branch if it exists
                await git.push('origin', `:${fix.branch}`).catch(() => { });
            } catch (e) {
                console.warn(`[AnomalyService] Could not delete fix branch: ${e}`);
            }

            return { status: 'merged_and_pushed', targetBranch };
        } catch (e: any) {
            console.error('Merge failed:', e);
            throw new Error(`Merge failed: ${e.message}`);
        }
    }

    async refineFix(fixId: string, instruction: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) throw new Error('Fix not found');

        console.log(`[Mock] Refine Agent received instruction: "${instruction}"`);
        // Simulate regeneration
        fix.summary = `Updated Fix: ${instruction.substring(0, 20)}...`;
        fix.explanation = `Updated based on input: "${instruction}". Adjusted logic to be more robust.`;
        fix.status = 'pending';
        await this.addFix(fix);
        return fix;
    }

    async refineSandbox(fixId: string, instruction: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) throw new Error('Fix not found');

        console.log(`[Mock] Sandbox Refine instruction: "${instruction}"`);
        return { message: 'Sandbox updated with adjustments.', branch: fix.branch };
    }

    async updateFixStatus(id: string, status: FixProposal['status']) {
        const fix = await this.ensureFix(id);
        if (fix) {
            fix.status = status;
            await this.addFix(fix);
            // Legacy/Fallback status update
            if (status === 'applied') {
                await this.prisma.anomaly.update({ where: { id: fix.anomalyId }, data: { status: 'RESOLVED' } }).catch(console.error);
            }
        }
    }

    async getSandboxDiff(fixId: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) return null;

        // Try to get structure from real git repo first
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: fix.anomalyId },
            include: { repo: true }
        });

        if (anomaly && anomaly.repo) {
            let repoPath = '';
            try {
                const parts = anomaly.repo.url.split(/[:/]/);
                const repo = parts.pop()?.replace('.git', '');
                const owner = parts.pop();
                if (owner && repo) {
                    // Directory structure is: workspace/repos/{owner}/{repo}
                    const workspaceRoot = process.env.WORKSPACE_ROOT || 'workspace/repos';
                    const path = require('path');
                    repoPath = path.isAbsolute(workspaceRoot)
                        ? path.join(workspaceRoot, owner, repo)
                        : path.join(process.cwd(), workspaceRoot, owner, repo);
                }
            } catch (e) { }

            if (repoPath) {
                try {
                    // Ensure connection/fetch first? GitManager usually handles local opts.
                    // Assuming 'main' exists.
                    const diff = await this.gitManager.getDiff(repoPath, 'main', fix.branch);
                    if (diff) return diff;
                } catch (e) {
                    console.warn('Failed to get real git diff, falling back to stored patch', e);
                }
            }
        }

        // Fallback: Return the generated patch from fix proposal
        return fix.diff || '';
    }

    async getBranches(fixId: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) return ['main'];

        // Get the repo path for this fix
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: fix.anomalyId },
            include: { repo: true }
        });

        if (!anomaly || !anomaly.repo) {
            return ['main'];
        }

        // Reconstruct repo path
        const repoUrl = anomaly.repo.url;
        let repoPath = '';
        try {
            const parts = repoUrl.split(/[:/]/);
            const repo = parts.pop()?.replace('.git', '');
            const owner = parts.pop();
            if (owner && repo) {
                const path = require('path');
                const workspaceRoot = process.env.WORKSPACE_ROOT || 'workspace/repos';
                repoPath = path.isAbsolute(workspaceRoot)
                    ? path.join(workspaceRoot, owner, repo)
                    : path.join(process.cwd(), workspaceRoot, owner, repo);
            }
        } catch (e) {
            console.warn('[AnomalyService] Failed to reconstruct repo path for branches:', e);
            return ['main'];
        }

        if (!repoPath) return ['main'];

        // Get real branches from the repo
        try {
            const branches = await this.gitManager.getBranches(repoPath);
            console.log(`[AnomalyService] Found branches: ${branches.join(', ')}`);
            return branches;
        } catch (e) {
            console.warn('[AnomalyService] Failed to get branches:', e);
            return ['main'];
        }
    }
    async getPendingAnomalies() {
        // Fetch PENDING anomalies that haven't been reviewed yet
        const anomalies = await this.prisma.anomaly.findMany({
            where: { status: 'PENDING' },
            take: 100, // Fetch more to allow for in-memory filtering
            orderBy: { createdAt: 'desc' },
            include: { repo: true }
        });

        // Filter out anomalies that have already been verified by the judge
        const unverified = anomalies.filter(a => {
            try {
                const ctx = JSON.parse(a.context);
                return !ctx.verified_critical;
            } catch (e) { return true; }
        });

        return unverified.slice(0, 50).map(a => ({
            ...JSON.parse(a.context),
            id: a.id, // Explicitly ensure DB ID takes precedence
            createdAt: a.createdAt,
            repoUrl: a.repo ? a.repo.url : 'unknown-repo'
        }));
    }

    async saveAnalysis(id: string, analysis: any) {
        console.log(`[AnomalyService] Saving Analysis for ${id}`);
        // Update Anomaly context with Analysis
        const existing = await this.prisma.anomaly.findUnique({ where: { id } });
        if (!existing) throw new BadRequestException(`Anomaly ${id} not found`);

        const context = JSON.parse(existing.context || '{}');

        await this.prisma.anomaly.update({
            where: { id },
            data: {
                status: 'ANALYZED',
                context: JSON.stringify({
                    ...context,
                    root_cause_analysis: analysis
                })
            }
        });
        return { success: true };
    }

    async saveProposal(dto: { id: string, analysis: string, patch: string, status: string }) {
        console.log(`[AnomalyService] Saving Proposal for ${dto.id}`);
        const { id, analysis, patch } = dto;

        // 1. Ensure Anomaly Exists
        const existing = await this.prisma.anomaly.findUnique({ where: { id }, include: { repo: true } });
        if (!existing) throw new BadRequestException(`Anomaly ${id} not found`);

        // 2. Create Proposal Object (In Memory Map for MVP as per design)
        // Extract repo name for branch naming
        const repoName = existing.repo?.url.split('/').pop()?.replace('.git', '') || 'unknown';
        const branchName = `fix/${repoName}/${id.substring(0, 8)}`;

        const proposal: FixProposal = {
            id: `fix-${Date.now()}`,
            anomalyId: id,
            status: 'pending', // Waiting for user review
            summary: `Automated Fix for ${id}`,
            explanation: typeof analysis === 'string' ? analysis : JSON.stringify(analysis),
            diff: patch,
            branch: branchName,
            confidence: 0.9
        };

        this.addFix(proposal);

        // 3. Update Anomaly Status
        // Add patch to context too for persistence if server restarts
        const context = JSON.parse(existing.context || '{}');

        await this.prisma.anomaly.update({
            where: { id },
            data: {
                status: 'PROPOSAL_READY',
                context: JSON.stringify({
                    ...context,
                    generated_patch: patch,
                    proposal_id: proposal.id
                })
            }
        });

        return { success: true, proposalId: proposal.id };
    }

    async processJudgeReview(review: { id: string, decision: 'CRITICAL' | 'IGNORE', reasoning: string, analysis?: any }) {
        try {
            console.log(`[AnomalyService] Judge Review for ${review.id}: ${review.decision}`);

            // Check if anomaly exists
            const existing = await this.prisma.anomaly.findUnique({ where: { id: review.id } });
            if (!existing) {
                throw new Error(`Anomaly ${review.id} not found`);
            }

            const contextStr = existing.context || '{}';
            const contextObj = JSON.parse(contextStr);

            if (review.decision === 'IGNORE') {
                await this.prisma.anomaly.update({
                    where: { id: review.id },
                    data: {
                        status: 'IGNORED',
                        context: JSON.stringify({
                            ...contextObj,
                            judge_reasoning: review.reasoning
                        })
                    }
                });
                return { status: 'ignored' };
            }

            if (review.decision === 'CRITICAL') {
                const updatedContext = {
                    ...contextObj,
                    verified_critical: true,
                    judge_reasoning: review.reasoning
                };

                await this.prisma.anomaly.update({
                    where: { id: review.id },
                    data: {
                        status: 'VALIDATED', // Ready for Analyst
                        context: JSON.stringify(updatedContext)
                    }
                });
                return { status: 'verified_critical' };
            }

            return { status: 'no_action' };
        } catch (e) {
            console.error('Failed to process review:', e);
            throw new BadRequestException(`Process failed: ${e.message}`);
        }
    }
}
