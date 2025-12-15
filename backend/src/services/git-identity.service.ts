import { Injectable, Logger } from '@nestjs/common';
import { SshConfigService } from './ssh-config.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

@Injectable()
export class GitIdentityService {
    private readonly logger = new Logger(GitIdentityService.name);

    constructor(private sshConfigService: SshConfigService) { }

    /**
     * Ensure SSH identity exists for a user and return key path
     */
    async ensureIdentity(userId: string, email: string): Promise<{ keyPath: string; publicKey: string }> {
        const sshDir = path.join(os.homedir(), '.ssh');
        const keyPath = path.join(sshDir, `id_rsa_${userId}`);
        const pubKeyPath = `${keyPath}.pub`;

        // If key already exists, return it
        if (fs.existsSync(keyPath) && fs.existsSync(pubKeyPath)) {
            const publicKey = fs.readFileSync(pubKeyPath, 'utf8').trim();
            return { keyPath, publicKey };
        }

        // Generate new key pair
        this.logger.log(`Generating SSH key for user ${userId}`);
        try {
            execSync(
                `ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "${email}"`,
                { stdio: 'inherit' }
            );
            fs.chmodSync(keyPath, 0o600);

            const publicKey = fs.readFileSync(pubKeyPath, 'utf8').trim();
            this.logger.log(`SSH key generated for user ${userId}`);
            return { keyPath, publicKey };
        } catch (error: any) {
            this.logger.error(`Failed to generate SSH key: ${error.message}`);
            throw new Error(`SSH key generation failed: ${error.message}`);
        }
    }

    /**
     * Add provider alias to SSH config and return the alias
     */
    async addProviderAlias(userId: string, hostname: string): Promise<string> {
        const alias = `${userId}-${hostname.replace(/\./g, '-')}`;

        // Ensure identity exists first
        // Note: We need email, but for now we'll use a default or get from user
        // For simplicity, we'll just ensure the key exists
        const sshDir = path.join(os.homedir(), '.ssh');
        const keyPath = path.join(sshDir, `id_rsa_${userId}`);

        // If key doesn't exist, generate it with a default email
        if (!fs.existsSync(keyPath)) {
            await this.ensureIdentity(userId, `${userId}@night-agent.local`);
        }

        // Add SSH config entry
        this.sshConfigService.addEntry(alias, hostname, keyPath);

        return alias;
    }

    /**
     * Get public key for a user
     */
    async getPublicKey(userId: string): Promise<string | null> {
        const sshDir = path.join(os.homedir(), '.ssh');
        const pubKeyPath = path.join(sshDir, `id_rsa_${userId}.pub`);

        if (fs.existsSync(pubKeyPath)) {
            return fs.readFileSync(pubKeyPath, 'utf8').trim();
        }

        return null;
    }

    /**
     * Regenerate SSH key for a user
     */
    async regenerateKey(userId: string, email: string): Promise<{ keyPath: string; publicKey: string }> {
        const sshDir = path.join(os.homedir(), '.ssh');
        const keyPath = path.join(sshDir, `id_rsa_${userId}`);
        const pubKeyPath = `${keyPath}.pub`;

        // Delete existing keys
        if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
        if (fs.existsSync(pubKeyPath)) fs.unlinkSync(pubKeyPath);

        // Generate new ones
        return this.ensureIdentity(userId, email);
    }
}

