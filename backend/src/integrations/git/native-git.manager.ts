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
}
