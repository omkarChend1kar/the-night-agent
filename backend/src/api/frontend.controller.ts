import { Controller, Get, Post, Body, Param, Inject, UseGuards, Req } from '@nestjs/common';
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

    @Post('fix/:id/reject')
    rejectFix(@Param('id') id: string) {
        this.anomalyService.updateFixStatus(id, 'rejected');
        return { status: 'rejected' };
    }
}
