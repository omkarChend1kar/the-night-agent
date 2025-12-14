import { Controller, Get, Post, Body, Param, Inject, UseGuards, Req, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';
import { GitManager } from '../integrations/git/git-manager.interface';
import { AuthGuard } from '@nestjs/passport';
import { EncryptionService } from '../services/encryption.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma.service';
import { SshConfigService } from '../services/ssh-config.service';
import { VerificationService } from '../services/verification.service';
import { GitIdentityService } from '../services/git-identity.service';

@Controller('api')
export class FrontendController {
    constructor(
        private anomalyService: AnomalyService,
        @Inject('GitManager') private gitManager: any,
        private encryptService: EncryptionService,
        private authService: AuthService,
        private prisma: PrismaService,
        private sshConfigService: SshConfigService,
        private verifyService: VerificationService,
        private gitIdentityService: GitIdentityService,
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

    @UseGuards(AuthGuard('jwt')) // Protect
    @Post('onboard')
    async onboard(@Req() req: any, @Body() body: { repoUrl: string, protocol: 'https' | 'ssh', username?: string, token?: string }) {
        console.log(`Onboarding ${body.repoUrl} for ${req.user.email} via ${body.protocol}`);

        try {
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
                // 2. SSH Flow: Use User Identity + Deduce Provider
                // Deduce Hostname
                let hostname = '';
                const sshMatch = body.repoUrl.match(/@([^:]+):/);
                if (sshMatch) {
                    hostname = sshMatch[1];
                } else {
                    const httpsMatch = body.repoUrl.match(/https?:\/\/([^/]+)/);
                    if (httpsMatch) hostname = httpsMatch[1];
                }

                if (!hostname) {
                    throw new Error('Could not determine hostname from repository URL. Please verify the URL format.');
                }

                // Generate/Ensure Config Alias
                const alias = await this.gitIdentityService.addProviderAlias(req.user.userId, hostname);

                // Get User Public Key to return
                const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
                if (!user) throw new Error('User not found during onboarding');

                // 5. Update Repo Record
                await this.prisma.repository.update({
                    where: { id: repo.id },
                    data: {
                        sshConfigAlias: alias,
                        publicKey: (user as any).publicKey
                    }
                });

                responseData.publicKey = (user as any).publicKey;
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
        } catch (e) {
            console.error("Onboarding Error:", e);
            throw new HttpException(e.message || 'Onboarding Failed', HttpStatus.BAD_REQUEST);
        }
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('repos')
    async getRepos(@Req() req: any) {
        return this.prisma.repository.findMany({
            where: { userId: req.user.userId }
        });
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
            return result;
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
