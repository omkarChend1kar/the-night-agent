import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class SidecarService {
    constructor(private prisma: PrismaService) {}

    /**
     * Generate a unique API key for sidecar authentication
     */
    private generateApiKey(): string {
        return `na_${randomBytes(32).toString('hex')}`;
    }

    /**
     * Create a new sidecar instance for a user
     */
    async createSidecar(userId: string, options?: { name?: string; repoId?: string; logPath?: string; serviceId?: string }) {
        const apiKey = this.generateApiKey();
        
        const sidecar = await this.prisma.sidecar.create({
            data: {
                userId,
                apiKey,
                name: options?.name || 'My Sidecar',
                repoId: options?.repoId,
                logPath: options?.logPath || '/var/log/app.log',
                serviceId: options?.serviceId || 'my-service',
                status: 'pending'
            }
        });

        return sidecar;
    }

    /**
     * Get all sidecars for a user
     */
    async getSidecarsForUser(userId: string) {
        return this.prisma.sidecar.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Get a specific sidecar by ID
     */
    async getSidecar(id: string, userId: string) {
        return this.prisma.sidecar.findFirst({
            where: { id, userId }
        });
    }

    /**
     * Validate sidecar API key and update lastSeen
     */
    async validateAndUpdateSidecar(apiKey: string) {
        const sidecar = await this.prisma.sidecar.findUnique({
            where: { apiKey }
        });

        if (!sidecar) return null;

        // Update lastSeen and status
        await this.prisma.sidecar.update({
            where: { id: sidecar.id },
            data: {
                lastSeen: new Date(),
                status: 'active'
            }
        });

        return sidecar;
    }

    /**
     * Delete a sidecar
     */
    async deleteSidecar(id: string, userId: string) {
        return this.prisma.sidecar.deleteMany({
            where: { id, userId }
        });
    }

    /**
     * Generate Docker run command for a sidecar
     * First builds the image, then runs it
     */
    generateDockerCommand(sidecar: any, backendUrl?: string): string {
        const baseUrl = backendUrl || process.env.BACKEND_PUBLIC_URL || 'http://host.docker.internal:3001';
        const imageTag = `night-agent-sidecar:${sidecar.id.substring(0, 8)}`;
        
        return `# Step 1: Build the sidecar image (run this from the project root)
docker build -t ${imageTag} -f sidecar/Dockerfile sidecar/

# Step 2: Run the sidecar container
docker run -d \\
  --name night-agent-sidecar-${sidecar.id.substring(0, 8)} \\
  --restart unless-stopped \\
  -e SIDECAR_ID="${sidecar.id}" \\
  -e SIDECAR_API_KEY="${sidecar.apiKey}" \\
  -e BACKEND_URL="${baseUrl}/api/sidecar" \\
  -e SERVICE_ID="${sidecar.serviceId || 'my-service'}" \\
  -e LOG_PATH="${sidecar.logPath || '/app/logs/app.log'}" \\
  -v /path/to/your/logs:/app/logs:ro \\
  ${imageTag}`;
    }

    /**
     * Generate Docker Compose snippet
     */
    generateDockerCompose(sidecar: any, backendUrl?: string): string {
        const baseUrl = backendUrl || process.env.BACKEND_PUBLIC_URL || 'http://host.docker.internal:3001';
        
        return `# Add this to your docker-compose.yml
# Note: First build the sidecar image:
#   docker build -t night-agent-sidecar:local -f sidecar/Dockerfile sidecar/

services:
  night-agent-sidecar:
    build:
      context: .
      dockerfile: sidecar/Dockerfile
    container_name: night-agent-sidecar-${sidecar.id.substring(0, 8)}
    restart: unless-stopped
    environment:
      - SIDECAR_ID=${sidecar.id}
      - SIDECAR_API_KEY=${sidecar.apiKey}
      - BACKEND_URL=${baseUrl}/api/sidecar
      - SERVICE_ID=${sidecar.serviceId || 'my-service'}
      - LOG_PATH=/app/logs/app.log
    volumes:
      - ./logs:/app/logs:ro  # Mount your application logs
`;
    }
}
