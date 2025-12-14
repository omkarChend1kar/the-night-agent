import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SshConfigService } from './ssh-config.service';

const execAsync = promisify(exec);

@Injectable()
export class GitIdentityService {
    private readonly logger = new Logger(GitIdentityService.name);
    private readonly sshDir = path.join(os.homedir(), '.ssh');

    constructor(private sshConfigService: SshConfigService) { }

    async ensureIdentity(userId: string, email: string): Promise<{ publicKey: string; keyPath: string }> {
        const keyName = `id_rsa_${userId}`;
        const keyPath = path.join(this.sshDir, keyName);
        const pubKeyPath = `${keyPath}.pub`;
        const alias = `github.com-${userId}`;

        // 1. Check if keys exist, if not generate them
        if (!fs.existsSync(keyPath)) {
            this.logger.log(`Generating new SSH key for user ${userId}...`);
            await this.generateKeyPair(keyPath, email);
        } else {
            this.logger.log(`SSH key for user ${userId} already exists.`);
        }

        // 2. Read Public Key
        let publicKey = '';
        if (fs.existsSync(pubKeyPath)) {
            publicKey = fs.readFileSync(pubKeyPath, 'utf8').trim();
        } else {
            throw new Error(`Public key file not found at ${pubKeyPath}`);
        }

        return { publicKey, keyPath };
    }

    async addProviderAlias(userId: string, provider: string): Promise<string> {
        const keyName = `id_rsa_${userId}`;
        const keyPath = path.join(this.sshDir, keyName);
        const alias = `${provider}-${userId}`;

        // Ensure Key Exists
        if (!fs.existsSync(keyPath)) {
            // Should have been created at signup, but safe to check
            throw new Error(`User Identity Key not found for ${userId}`);
        }

        this.sshConfigService.addEntry(alias, provider, keyPath);
        return alias;
    }

    private async generateKeyPair(keyPath: string, comment: string): Promise<void> {
        try {
            // -t ed25519 -C "email" -f keyPath -N "" (no passphrase)
            const cmd = `ssh-keygen -t ed25519 -C "${comment}" -f "${keyPath}" -N ""`;
            await execAsync(cmd);

            // Ensure permissions are strict
            await execAsync(`chmod 600 "${keyPath}"`);
            await execAsync(`chmod 644 "${keyPath}.pub"`);

        } catch (error) {
            this.logger.error(`Failed to generate SSH key: ${error}`);
            throw error;
        }
    }
}
