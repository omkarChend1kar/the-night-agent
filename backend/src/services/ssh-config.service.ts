import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class SshConfigService {
    private readonly logger = new Logger(SshConfigService.name);
    private readonly sshConfigPath = path.join(os.homedir(), '.ssh', 'config');

    constructor() {
        this.ensureSshDirectory();
    }

    private ensureSshDirectory() {
        const sshDir = path.dirname(this.sshConfigPath);
        if (!fs.existsSync(sshDir)) {
            fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
        }
        if (!fs.existsSync(this.sshConfigPath)) {
            fs.writeFileSync(this.sshConfigPath, '', { mode: 0o600 });
        }
    }

    addEntry(alias: string, hostname: string, identityFile: string): void {
        const configEntry = `
# Begin Client: ${alias}
Host ${alias}
    HostName ${hostname}
    User git
    IdentityFile ${identityFile}
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
# End Client: ${alias}
`;

        // Check if already exists to avoid duplicates
        const currentConfig = fs.readFileSync(this.sshConfigPath, 'utf8');
        if (currentConfig.includes(`# Begin Client: ${alias}`)) {
            this.logger.warn(`SSH Config entry for ${alias} already exists. Skipping.`);
            return;
        }

        fs.appendFileSync(this.sshConfigPath, configEntry);
        this.logger.log(`Added SSH config entry for ${alias}`);
    }

    removeEntry(alias: string): void {
        const currentConfig = fs.readFileSync(this.sshConfigPath, 'utf8');
        const markerStart = `# Begin Client: ${alias}`;
        const markerEnd = `# End Client: ${alias}`;

        if (!currentConfig.includes(markerStart)) {
            return;
        }

        // Regex to remove the block
        // Matches from Start Marker to End Marker, including newlines
        const regex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\n?`, 'g');
        const newConfig = currentConfig.replace(regex, '');

        fs.writeFileSync(this.sshConfigPath, newConfig, { mode: 0o600 });
        this.logger.log(`Removed SSH config entry for ${alias}`);
    }
}
