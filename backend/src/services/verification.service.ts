import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { GitManager } from '../integrations/git/git-manager.interface';


@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name);

    constructor(
        private prisma: PrismaService,
        @Inject('GitManager') private gitManager: GitManager
    ) { }

    async verifyRepo(repoId: string): Promise<{
        success: boolean;
        checks: { handshake: boolean; read: boolean; write: boolean };
        logs: string[]
    }> {
        const repo = await this.prisma.repository.findUnique({ where: { id: repoId } });
        if (!repo || !repo.sshConfigAlias) throw new Error('Repo not configured for SSH');

        const logs: string[] = [];
        const checks = { handshake: false, read: false, write: false };

        const alias = repo.sshConfigAlias;
        // Parse original path from URL. Assume URL is like "git@github.com:org/repo.git" or "https://github.com/org/repo.git"
        // We need "org/repo.git" part.
        let pathPart = '';
        const match = repo.url.match(/[:/]([^:]+\/[^:]+\.git)$/); // Rough match
        if (match) {
            pathPart = match[1];
        } else {
            // Fallback: try removing protocol and host
            const parts = repo.url.split('/');
            if (parts.length >= 2) {
                pathPart = parts.slice(-2).join('/');
            }
        }

        const gitUrl = `git@${alias}:${pathPart}`;
        logs.push(`Target URL: ${gitUrl}`);

        // 1. Handshake (Connection Check)
        try {
            logs.push(`Checking Connection (ls-remote)...`);
            const connected = await this.gitManager.checkConnection(gitUrl);
            checks.handshake = connected;
            if (connected) {
                logs.push('Connection Successful');
            } else {
                logs.push('Connection Failed');
            }
        } catch (e: any) {
            logs.push(`Connection Check Error: ${e.message}`);
        }

        // 2. Read Check
        if (checks.handshake) {
            try {
                logs.push(`Verifying Read Access...`);
                const canRead = await this.gitManager.checkReadAccess(gitUrl);
                checks.read = canRead;
                if (canRead) {
                    logs.push('Read Access Confirmed');
                } else {
                    logs.push('Read Access Failed');
                }
            } catch (e: any) {
                logs.push(`Read Check Error: ${e.message}`);
            }
        }

        // 3. Write Check
        if (checks.read) {
            try {
                logs.push(`Verifying Write Access (Dry Run)...`);
                const canWrite = await this.gitManager.checkWriteAccess(gitUrl);
                checks.write = canWrite;
                if (canWrite) {
                    logs.push('Write Access Confirmed');
                } else {
                    logs.push('Write Access Failed (Push Rejected or Auth Error)');
                }
            } catch (e: any) {
                logs.push(`Write Check Error: ${e.message}`);
            }
        }

        const success = checks.handshake && checks.read;

        if (success) {
            await this.prisma.repository.update({
                where: { id: repoId },
                data: { verified: true }
            });
        }

        return {
            success,
            checks,
            logs
        };
    }

    async cloneRepo(repoId: string): Promise<{ success: boolean; message: string; path: string }> {
        const repo = await this.prisma.repository.findUnique({ where: { id: repoId } });
        if (!repo) throw new Error('Repository not found');

        const repoUrl = repo.url;
        let repoPath = '';
        const path = require('path');
        const fs = require('fs');

        try {
            // Determine Repo Path (Same logic as AnomalyService)
            const parts = repoUrl.split(/[:/]/);
            // Handle git@github.com:org/repo.git format
            const repoName = parts.pop()?.replace('.git', '');
            const owner = parts.pop();

            if (owner && repoName) {
                const workspaceRoot = process.env.WORKSPACE_ROOT || 'workspace/repos';
                repoPath = path.isAbsolute(workspaceRoot)
                    ? path.join(workspaceRoot, owner, repoName)
                    : path.join(process.cwd(), workspaceRoot, owner, repoName);
            } else {
                throw new Error(`Could not parse owner/repo from ${repoUrl}`);
            }
        } catch (e) {
            this.logger.error('Failed to deduce repo path:', e);
            throw new Error('Could not determine repository path');
        }

        if (fs.existsSync(repoPath)) {
            // Already exists
            return { success: true, message: 'Repository already exists', path: repoPath };
        }

        this.logger.log(`Cloning ${repoUrl} to ${repoPath}...`);

        // Ensure parent dir exists
        if (!fs.existsSync(path.dirname(repoPath))) {
            fs.mkdirSync(path.dirname(repoPath), { recursive: true });
        }

        await this.gitManager.cloneRepo(repoUrl, repo.encryptedCreds || '', repoPath);

        return { success: true, message: 'Repository cloned successfully', path: repoPath };
    }
}
