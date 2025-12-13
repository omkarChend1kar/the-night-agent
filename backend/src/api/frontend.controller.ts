import { Controller, Get, Post, Body, Param, Inject, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';
import { GitManager } from '../integrations/git/git-manager.interface';
import { AuthGuard } from '@nestjs/passport';
import { EncryptionService } from '../services/encryption.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma.service';
import { SshConfigService } from '../services/ssh-config.service';
import { VerificationService } from '../services/verification.service';

@Controller('api')
export class FrontendController {
    constructor(
        private anomalyService: AnomalyService,
        // @Inject('CodeExecutor') private codeExecutor: CodeExecutor,
        @Inject('GitManager') private gitManager: any,
        private encryptService: EncryptionService, // New
        private authService: AuthService, // New
        private prisma: PrismaService,
        private sshConfigService: SshConfigService, // New
        private verifyService: VerificationService, // New
    ) { }

    @UseGuards(AuthGuard('jwt'))
    @Post('repos/:id/verify')
    async verifyRepo(@Param('id') id: string) {
        return this.verifyService.verifyRepo(id);
    }

    @UseGuards(AuthGuard('jwt')) // Protect
    @Post('git/ssh-key')
    async getGlobalSshKey(@Req() req: any) {
        // Return the Global Static Key
        const publicKey = this.encryptService.getPublicSshKey();
        if (!publicKey) {
            throw new Error('Global Key not ready');
        }
        return { publicKey };
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('repos')
    async getRepos(@Req() req: any) {
        const repos = await this.prisma.repository.findMany({
            where: { userId: req.user.userId }
        });
        return repos;
    }

    @UseGuards(AuthGuard('jwt')) // Protect
    @Post('onboard')
    async onboard(@Req() req: any, @Body() body: { repoUrl: string, protocol: 'https' | 'ssh', username?: string, token?: string }) {
        console.log(`Onboarding ${body.repoUrl} for ${req.user.email} via ${body.protocol}`);

        // 1. Create Repository Record First (to get UUID)
        const repo = await this.prisma.repository.create({
            data: {
                url: body.repoUrl,
                protocol: body.protocol,
                userId: req.user.userId
            }
        });

        let responseData: any = { status: 'connected', sidecarId: 'sidecar-' + repo.id, repoId: repo.id };

        if (body.protocol === 'ssh') {
            // 2. SSH Flow: Generate Keypair & Config
            const keys = await this.encryptService.generateKeyPair(repo.id);

            // 3. Parse Hostname (Simple regex for git@host:path or ssh://git@host/path)
            // Default to github.com if parsing fails for MVP, but we should try to extract.
            let hostname = 'github.com';
            const match = body.repoUrl.match(/@([^:]+):/);
            if (match) {
                hostname = match[1];
            }

            // 4. Update SSH Config
            const alias = `${repo.id}-git`;
            this.sshConfigService.addEntry(alias, hostname, keys.privateKeyPath);

            // 5. Update Repo Record
            await this.prisma.repository.update({
                where: { id: repo.id },
                data: {
                    sshKeyPath: keys.privateKeyPath,
                    sshConfigAlias: alias,
                    publicKey: keys.publicKey
                }
            });

            responseData.publicKey = keys.publicKey;
            responseData.requiresVerification = true;
        } else if (body.protocol === 'https' && body.token) {
            // HTTPS Flow
            const encryptedCreds = this.encryptService.encrypt(body.token);
            await this.prisma.repository.update({
                where: { id: repo.id },
                data: { encryptedCreds }
            });
        }

        return responseData;
    }

    @Get('anomalies')
    getAnomalies() {
        return this.anomalyService.getAnomalies();
    }

    @Get('fix/:id')
    getFix(@Param('id') id: string) {
        return this.anomalyService.getFix(id);
    }

    @Post('fix/:id/approve')
    async approveFix(@Param('id') id: string) {
        const fix = this.anomalyService.getFix(id);
        if (!fix) return { error: 'Fix not found' };

        this.anomalyService.updateFixStatus(id, 'approved');

        // Trigger apply fix (Using GitManager/Executor logic here)
        // In real flow, this might trigger another workflow step

        // Mocking the flow:
        // 1. apply patch
        // 2. commit and push
        // 3. merge

        // For now just return success
        return { status: 'approved', message: 'Fix is being applied' };
    }

    @Post('fix/:id/apply-sandbox')
    async applySandbox(@Param('id') id: string) {
        try {
            const result = await this.anomalyService.applyToSandbox(id);
            return { status: 'sandbox_ready', ...result };
        } catch (e) {
            return { error: e.message };
        }
    }

    @Post('fix/:id/refine')
    async refineFix(@Param('id') id: string, @Body() body: { instruction: string }) {
        try {
            const result = await this.anomalyService.refineFix(id, body.instruction);
            return { status: 'refined', fix: result };
        } catch (e) {
            return { error: e.message };
        }
    }

    @Post('fix/:id/refine-sandbox')
    async refineSandbox(@Param('id') id: string, @Body() body: { instruction: string }) {
        try {
            const result = await this.anomalyService.refineSandbox(id, body.instruction);
            return { status: 'sandbox_updated', ...result };
        } catch (e) {
            return { error: e.message };
        }
    }

    @Get('fix/:id/diff')
    async getFixDiff(@Param('id') id: string) {
        const diff = await this.anomalyService.getSandboxDiff(id);
        if (!diff) throw new NotFoundException('Fix or diff not found');
        return { diff };
    }

    @Get('fix/:id/branches')
    async getFixBranches(@Param('id') id: string) {
        const branches = await this.anomalyService.getBranches(id);
        return { branches };
    }

    @Post('fix/:id/merge')
    async mergeFix(@Param('id') id: string, @Body() body: { targetBranch: string }) {
        try {
            await this.anomalyService.mergeFix(id, body.targetBranch || 'main');
            return { status: 'resolved' };
        } catch (e) {
            return { error: e.message };
        }
    }

    @Post('fix/:id/reject')
    rejectFix(@Param('id') id: string) {
        this.anomalyService.updateFixStatus(id, 'rejected');
        return { status: 'rejected' };
    }

    // -- Internal / Webhook for Agents (Kestra) --
    @Post('internal/submit-proposal')
    async submitProposal(@Body() body: { anomalyId: string, diff: string, explanation: string, branch?: string }) {
        console.log(`[Internal] Received proposal for ${body.anomalyId}`);
        // In a real system, we'd validate a secret token here.

        await this.anomalyService.receiveProposal({
            id: body.anomalyId, // using anomaly ID as fix ID for 1:1 map
            anomalyId: body.anomalyId,
            diff: body.diff,
            explanation: body.explanation,
            branch: body.branch || `fix/auto/${body.anomalyId.substring(0, 8)}`,
            summary: `Fix generated by Agent workflow`,
            status: 'pending',
            confidence: 0.95
        });

        return { status: 'received' };
    }
}
