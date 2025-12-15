import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class EncryptionService implements OnModuleInit {
    private readonly logger = new Logger(EncryptionService.name);
    private readonly algorithm = 'aes-256-ctr';
    // In a real app, this should be in env vars.
    // Using a fixed key for MVP demo purposes to ensure persistence across restarts if needed.
    private readonly secretKey = crypto.createHash('sha256').update('night-agent-secret').digest('base64').substr(0, 32);

    private readonly keyDir = path.join(process.cwd(), 'host_keys');
    private readonly keyPath = path.join(this.keyDir, 'night_agent_id_rsa');

    async onModuleInit() {
        // Global key generation disabled to enforce per-client key architecture.
        // await this.ensureGlobalKey();
    }

    async ensureGlobalKey() {
        if (!fs.existsSync(this.keyDir)) {
            fs.mkdirSync(this.keyDir, { recursive: true });
        }

        if (!fs.existsSync(this.keyPath)) {
            console.log('Generating Global SSH Key...');
            try {
                await execAsync(`ssh-keygen -t ed25519 -f "${this.keyPath}" -N "" -C "night-agent-global"`);
                console.log('Global SSH Key Generated.');
            } catch (e) {
                console.error('Failed to generate Global Key', e);
            }
        } else {
            console.log('Global SSH Key loaded.');
        }
    }

    getPublicSshKey(): string {
        try {
            return fs.readFileSync(this.keyPath + '.pub', 'utf8');
        } catch (e) {
            return '';
        }
    }

    getPrivateSshKeyPath(): string {
        return this.keyPath;
    }


    encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
        return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
    }

    decrypt(hash: string): string {
        const [ivHex, contentHex] = hash.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
        const decrypted = Buffer.concat([decipher.update(Buffer.from(contentHex, 'hex')), decipher.final()]);
        return decrypted.toString();
    }
    async generateKeyPair(repoId: string): Promise<{ privateKeyPath: string; publicKeyPath: string; publicKey: string }> {
        const keyDir = path.join(os.homedir(), '.night-agent', 'keys');
        if (!fs.existsSync(keyDir)) {
            fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
        }

        const keyPath = path.join(keyDir, repoId);

        // Delete if exists to ensure freshness
        if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
        if (fs.existsSync(keyPath + '.pub')) fs.unlinkSync(keyPath + '.pub');

        this.logger.log(`Generating Keypair for Repo ${repoId}...`);

        try {
            await execAsync(`ssh-keygen -t ed25519 -f "${keyPath}" -N "" -C "night-agent-${repoId}"`);

            // Secure private key
            fs.chmodSync(keyPath, 0o600);

            const publicKey = fs.readFileSync(keyPath + '.pub', 'utf8');
            return {
                privateKeyPath: keyPath,
                publicKeyPath: keyPath + '.pub',
                publicKey
            };
        } catch (e) {
            this.logger.error('Failed to generate keypair', e);
            throw new Error('Key Generation Failed');
        }
    }
}
