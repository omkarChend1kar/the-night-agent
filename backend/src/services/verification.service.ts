import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma.service';

const execAsync = promisify(exec);

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name);

    constructor(private prisma: PrismaService) { }

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

        // 1. Handshake (ssh -T)
        // GitHub returns exit code 1 but prints "Hi <user>..."
        try {
            logs.push(`Running: ssh -T git@${alias}`);
            await execAsync(`ssh -T -o StrictHostKeyChecking=accept-new git@${alias}`);
            checks.handshake = true; // If exit code 0 (GitLab/Bitbucket sometimes)
        } catch (e: any) {
            const output = e.stderr || e.stdout;
            if (output && output.includes('successfully authenticated')) {
                checks.handshake = true;
                logs.push('Handshake Success (Authenticated)');
            } else {
                logs.push(`Handshake Failed: ${e.message}`);
            }
        }

        // 2. Read Check (ls-remote)
        if (checks.handshake) {
            try {
                logs.push(`Running: git ls-remote ${gitUrl} HEAD`);
                await execAsync(`git ls-remote ${gitUrl} HEAD`);
                checks.read = true;
                logs.push('Read Access Confirmed');
            } catch (e: any) {
                logs.push(`Read Check Failed: ${e.message}`);
            }
        }

        // 3. Write Check (Mock for now or real push)
        // For safety, let's skip real push unless user explicitly requested "Danger Mode"
        // checks.write = true; // Skip for MVP

        return {
            success: checks.handshake && checks.read,
            checks,
            logs
        };
    }
}
