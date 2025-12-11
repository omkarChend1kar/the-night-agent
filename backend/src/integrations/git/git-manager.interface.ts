export interface GitManager {
    cloneRepo(url: string, credsId: string, dest: string): Promise<void>;
    createBranch(repoPath: string, branch: string): Promise<void>;
    applyPatch(repoPath: string, patch: string): Promise<void>;
    commitAndPush(repoPath: string, branch: string, message: string): Promise<void>;
    mergeBranch(repoPath: string, fromBranch: string, toBranch: string): Promise<void>;
}
