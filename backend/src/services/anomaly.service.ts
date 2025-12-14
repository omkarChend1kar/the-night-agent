import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Anomaly, FixProposal } from '../integrations/code-executor/code-executor.interface';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from './encryption.service';

@Injectable()
export class AnomalyService {
    private fixes: Map<string, FixProposal> = new Map(); // Keep fixes in memory for now? Or Schema needs update. Plan didn't incl Fix.

    constructor(
        private prisma: PrismaService,
        @Inject('WorkflowEngine') private workflowEngine: any // Inject Engine
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
        // Handle varying severity formats
        const severity = (dto.severity || dto.level || 'INFO').toUpperCase();
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
        return records.map(r => {
            const activeFix = this.getFixByAnomalyId(r.id);
            return {
                id: r.id,
                ...JSON.parse(r.context),
                repoUrl: r.repo.url,
                status: r.status,
                createdAt: r.createdAt,
                branch: activeFix?.branch, // Expose branch name
                fixExplanation: activeFix?.explanation // Expose reasoning
            };
        });
    }

    async getAnomaly(id: string) {
        const r = await this.prisma.anomaly.findUnique({
            where: { id },
            include: {
                repo: {
                    include: { user: true }
                }
            }
        });
        if (!r) return null;
        return {
            id: r.id,
            ...JSON.parse(r.context),
            repoUrl: r.repo.url,
            repoProtocol: r.repo.protocol,
            encryptedCreds: r.repo.encryptedCreds,
            status: r.status,
            sshAlias: r.repo.sshConfigAlias || (r.repo.user as any)?.sshAlias
        };
    }

    // Fixes are still transient for this iteration unless we add Fix model.
    addFix(fix: FixProposal) {
        this.fixes.set(fix.id, fix);
        // Also update Anomaly status
        if (fix.anomalyId) {
            this.prisma.anomaly.update({ where: { id: fix.anomalyId }, data: { status: 'PROPOSAL_READY' } }).catch(console.error);
        }
    }

    async receiveProposal(fix: FixProposal) {
        this.fixes.set(fix.id, fix);
        console.log(`[AnomalyService] Proposal stored for ${fix.anomalyId}`);
        await this.prisma.anomaly.update({
            where: { id: fix.anomalyId },
            data: { status: 'PROPOSAL_READY' }
        });
    }

    getFix(id: string) {
        return this.fixes.get(id);
    }

    getFixByAnomalyId(anomalyId: string) {
        return Array.from(this.fixes.values()).find(f => f.anomalyId === anomalyId);
    }

    async ensureFix(identifier: string): Promise<FixProposal | undefined> {
        let fix = this.fixes.get(identifier) || this.getFixByAnomalyId(identifier);
        if (fix) return fix;

        // Recovery Logic
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: identifier },
            include: { repo: true }
        });

        if (anomaly && (['PROPOSAL_READY', 'SANDBOX_READY', 'RESOLVED'].includes(anomaly.status))) {
            console.log(`[Recovery] Reconstructing fix for anomaly ${identifier}`);
            const repoName = anomaly.repo?.url.split('/').pop()?.replace('.git', '') || 'unknown-repo';
            const sandboxBranch = `fix/${repoName}/${anomaly.id.substring(0, 8)}`;

            fix = {
                id: identifier, // Assuming 1:1 for MVP
                anomalyId: identifier,
                status: anomaly.status === 'SANDBOX_READY' ? 'applied_sandbox' :
                    anomaly.status === 'RESOLVED' ? 'merged' : 'pending',
                summary: 'Reconstructed Fix',
                explanation: 'Recovered from system state.',
                diff: '',
                branch: sandboxBranch,
                confidence: 1.0
            };
            this.fixes.set(identifier, fix as FixProposal);
            return fix as FixProposal;
        }
        return undefined;
    }

    async applyToSandbox(identifier: string) {
        const fix = await this.ensureFix(identifier);
        if (!fix) throw new Error('Fix not found');

        const fixId = fix.id;
        // Fetch Anomaly to get Repo context
        const anomaly = await this.prisma.anomaly.findUnique({
            where: { id: fix.anomalyId },
            include: { repo: true }
        });
        const repoName = anomaly?.repo?.url.split('/').pop()?.replace('.git', '') || 'unknown-repo';
        // Ensure branch name is set if not already
        if (!fix.branch) {
            fix.branch = `fix/${repoName}/${fix.anomalyId.substring(0, 8)}`;
        }

        console.log(`[Mock] Target Repo: ${repoName}`);
        console.log(`[Mock] Creating branch ${fix.branch} from main...`);
        console.log(`[Mock] Applying patch to ${fix.branch}...`);

        fix.status = 'applied_sandbox';
        this.fixes.set(fixId, fix);

        await this.prisma.anomaly.update({
            where: { id: fix.anomalyId },
            data: { status: 'SANDBOX_READY' }
        });

        return { sandboxBranch: fix.branch };
    }

    async mergeFix(fixId: string, targetBranch: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) throw new Error('Fix not found');

        console.log(`[Mock] Merging fix to ${targetBranch}...`);

        fix.status = 'merged';
        this.fixes.set(fixId, fix);

        await this.prisma.anomaly.update({
            where: { id: fix.anomalyId },
            data: { status: 'RESOLVED' }
        });

        return { status: 'merged' };
    }

    async refineFix(fixId: string, instruction: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) throw new Error('Fix not found');

        console.log(`[Mock] Refine Agent received instruction: "${instruction}"`);
        // Simulate regeneration
        fix.summary = `Updated Fix: ${instruction.substring(0, 20)}...`;
        fix.explanation = `Updated based on input: "${instruction}". Adjusted logic to be more robust.`;
        fix.status = 'pending';
        this.fixes.set(fixId, fix);
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
            this.fixes.set(id, fix);
            // Legacy/Fallback status update
            if (status === 'applied') {
                this.prisma.anomaly.update({ where: { id: fix.anomalyId }, data: { status: 'RESOLVED' } }).catch(console.error);
            }
        }
    }

    async getSandboxDiff(fixId: string) {
        const fix = await this.ensureFix(fixId);
        if (!fix) return null;

        try {
            // Placeholder: throw to force mock diff generation
            throw new Error('Repo not active');
        } catch (e) {
            console.log(`[Mock] Generating diff for ${fix.branch}`);
            return `diff --git a/src/core/vr-trainer.service.ts b/src/core/vr-trainer.service.ts
index 83a9d21..b9fc4a2 100644
--- a/src/core/vr-trainer.service.ts
+++ b/src/core/vr-trainer.service.ts
@@ -45,7 +45,9 @@ export class VRTrainerService {
   async processSession(sessionId: string) {
-    const resource = await this.allocateResource(sessionId);
-    this.activeSessions.push(resource);
+    let resource;
+    try {
+      resource = await this.allocateResource(sessionId);
+      this.activeSessions.push(resource);
+    } finally {
+      if (resource) await resource.release();
+    }
   }
 }`;
        }
    }

    async getBranches(fixId: string) {
        const fix = await this.ensureFix(fixId);
        // We might use fix context to get specific branches in future
        return ['main', 'develop', 'staging', 'feature/new-ui'];
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
