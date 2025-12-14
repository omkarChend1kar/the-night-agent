import { Injectable } from '@nestjs/common';
import { GitManager } from './git-manager.interface';
import simpleGit from 'simple-git';
import * as fs from 'fs';

@Injectable()
export class NativeGitManager implements GitManager {
    async cloneRepo(url: string, credsId: string, dest: string): Promise<void> {
        // In a real scenario, we'd inject creds. For MVP, we assume url has token or SSH key is set up.
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        await simpleGit().clone(url, dest);
    }

    async createBranch(repoPath: string, branch: string): Promise<void> {
        const git = simpleGit(repoPath);
        await git.checkoutLocalBranch(branch);
    }

    async applyPatch(repoPath: string, patch: string): Promise<void> {
        const git = simpleGit(repoPath);
        // Write patch to temp file is usually safer, but apply functions often take file paths.
        // simple-git's applyPatch might expect string content or file.
        // For now, let's write to a temp file.
        const patchFile = `${repoPath}/temp.patch`;
        fs.writeFileSync(patchFile, patch);
        try {
            await git.applyPatch(patchFile);
        } finally {
            fs.unlinkSync(patchFile);
        }
    }

    async commitAndPush(repoPath: string, branch: string, message: string): Promise<void> {
        const git = simpleGit(repoPath);
        await git.add('.');
        await git.commit(message);
        await git.push('origin', branch);
    }

    async mergeBranch(repoPath: string, fromBranch: string, toBranch: string): Promise<void> {
        const git = simpleGit(repoPath);
        await git.checkout(toBranch);
        await git.merge([fromBranch]);
        await git.push('origin', toBranch);
    }

    async checkConnection(url: string): Promise<boolean> {
        try {
            // simple-git doesn't have a direct "ssh -T" equivalent for handshake without a repo context usually,
            // but we can try ls-remote on the URL which verifies connection + read.
            // However, the requirement might be just checking if the server is reachable or credentials work.
            // Let's use listRemote for basic connection check as well.
            await simpleGit().listRemote([url, 'HEAD']);
            return true;
        } catch (e) {
            return false;
        }
    }

    async checkReadAccess(url: string): Promise<boolean> {
        try {
            await simpleGit().listRemote([url, 'HEAD']);
            return true;
        } catch (e) {
            return false;
        }
    }

    async checkWriteAccess(url: string): Promise<boolean> {
        // To check write access safely, we can try a dry-run push of an empty ref or verify capabilities.
        // A common trick is `git push --dry-run` but that requires a local repo with something to push.
        // Without cloning, it's hard to verify write access 100% reliably without potentially modifying something.
        // However, if we assume this runs in a context where we might have a repo or can make a temp one:

        const tempDir = fs.mkdtempSync('/tmp/night-agent-write-check-');
        try {
            const git = simpleGit(tempDir);
            await git.init();

            // We can't push nothing. We need a commit.
            // But we don't want to pollute the remote.
            // "git push --dry-run" usually works if we have *something* locally, 
            // but relies on the remote accepting the ref spec.

            // Safer alternative for strictly checking permission without pushing objects:
            // Just assume if we can read, we *might* have write, but that's not enough.

            // Let's try to clone (shallow), make a dummy commit, and push --dry-run.
            await git.addConfig('user.name', 'Night Agent Check');
            await git.addConfig('user.email', 'check@nightagent.ai');

            // We can't clone here deeply if it's huge.
            // Let's just USE the temp dir as a fresh repo, add a remote.
            await git.addRemote('origin', url);

            // Fetch first to verify we can talk to it (read check again implicitly)
            // await git.fetch('origin'); // Optional, but good sanity check

            // Create a dummy commit
            fs.writeFileSync(`${tempDir}/check`, 'check');
            await git.add('check');
            await git.commit('write check');

            // Push with dry-run
            await git.push(['--dry-run', 'origin', 'HEAD:refs/heads/night-agent-write-check-temp']);

            return true;
        } catch (e) {
            // Logs would be good here in a real app
            return false;
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    async getDiff(repoPath: string, fromBranch: string, toBranch: string): Promise<string> {
        try {
            const git = simpleGit(repoPath);
            // Fetch first to ensure we have the branches
            // await git.fetch('origin'); 
            const diff = await git.diff([`${fromBranch}..${toBranch}`]);
            return diff;
        } catch (e: any) {
            console.warn(`[Git] Failed to get diff: ${e.message}`);
            return '';
            return '';
        }
    }

    async getBranches(repoPath: string): Promise<string[]> {
        try {
            const git = simpleGit(repoPath);
            
            // Fetch to ensure we have latest remote info
            await git.fetch('origin').catch(() => {});
            
            // Get both local and remote branches
            const branchSummary = await git.branch(['-a']);
            
            // Process branches to get clean names
            const branches = new Set<string>();
            
            for (const branch of branchSummary.all) {
                // Skip HEAD pointer
                if (branch.includes('HEAD')) continue;
                
                // For remote branches like "remotes/origin/main", extract just "main"
                if (branch.startsWith('remotes/origin/')) {
                    branches.add(branch.replace('remotes/origin/', ''));
                } else {
                    branches.add(branch);
                }
            }
            
            // Ensure main/master is always included if not present
            if (!branches.has('main') && !branches.has('master')) {
                branches.add('main');
            }
            
            return Array.from(branches).sort();
        } catch (e: any) {
            console.warn(`[Git] Failed to get branches: ${e.message}`);
            return ['main']; // Fallback
        }
    }
}
