import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SidecarService } from '../services/sidecar.service';

@Controller('api/sidecars')
@UseGuards(AuthGuard('jwt'))
export class SidecarManagementController {
    constructor(private sidecarService: SidecarService) {}

    /**
     * Create a new sidecar for the authenticated user
     */
    @Post()
    async createSidecar(
        @Req() req: any,
        @Body() body: { name?: string; repoId?: string; logPath?: string; serviceId?: string }
    ) {
        const sidecar = await this.sidecarService.createSidecar(req.user.userId, body);
        
        // Generate setup instructions
        const dockerCommand = this.sidecarService.generateDockerCommand(sidecar);
        const dockerCompose = this.sidecarService.generateDockerCompose(sidecar);
        
        return {
            sidecar: {
                id: sidecar.id,
                name: sidecar.name,
                status: sidecar.status,
                serviceId: sidecar.serviceId,
                logPath: sidecar.logPath,
                createdAt: sidecar.createdAt
            },
            setup: {
                dockerCommand,
                dockerCompose,
                apiKey: sidecar.apiKey, // Only shown once at creation!
                instructions: [
                    '1. Copy the Docker command or Docker Compose snippet below',
                    '2. Replace /path/to/your/logs with your actual log directory',
                    '3. Run the command to start the sidecar agent',
                    '4. The sidecar will automatically detect anomalies in your logs',
                    '⚠️ Save your API key securely - it won\'t be shown again!'
                ]
            }
        };
    }

    /**
     * Get all sidecars for the authenticated user
     */
    @Get()
    async getSidecars(@Req() req: any) {
        const sidecars = await this.sidecarService.getSidecarsForUser(req.user.userId);
        return sidecars.map((s: any) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            serviceId: s.serviceId,
            logPath: s.logPath,
            lastSeen: s.lastSeen,
            createdAt: s.createdAt
        }));
    }

    /**
     * Get a specific sidecar with setup instructions (regenerate docker command)
     */
    @Get(':id')
    async getSidecar(@Req() req: any, @Param('id') id: string) {
        const sidecar = await this.sidecarService.getSidecar(id, req.user.userId);
        if (!sidecar) throw new NotFoundException('Sidecar not found');
        
        // Generate setup instructions (without API key - only shown at creation)
        const dockerCommand = this.sidecarService.generateDockerCommand({
            ...sidecar,
            apiKey: '<YOUR_API_KEY>' // Mask the API key
        });
        
        return {
            sidecar: {
                id: sidecar.id,
                name: sidecar.name,
                status: sidecar.status,
                serviceId: sidecar.serviceId,
                logPath: sidecar.logPath,
                lastSeen: sidecar.lastSeen,
                createdAt: sidecar.createdAt
            },
            setup: {
                dockerCommand,
                note: 'API key is hidden for security. If you lost it, delete this sidecar and create a new one.'
            }
        };
    }

    /**
     * Delete a sidecar
     */
    @Delete(':id')
    async deleteSidecar(@Req() req: any, @Param('id') id: string) {
        await this.sidecarService.deleteSidecar(id, req.user.userId);
        return { status: 'deleted' };
    }

    /**
     * Regenerate API key for a sidecar (creates new sidecar, deletes old)
     */
    @Post(':id/regenerate')
    async regenerateApiKey(@Req() req: any, @Param('id') id: string) {
        const oldSidecar = await this.sidecarService.getSidecar(id, req.user.userId);
        if (!oldSidecar) throw new NotFoundException('Sidecar not found');
        
        // Delete old and create new with same settings
        await this.sidecarService.deleteSidecar(id, req.user.userId);
        
        const newSidecar = await this.sidecarService.createSidecar(req.user.userId, {
            name: oldSidecar.name || undefined,
            repoId: oldSidecar.repoId || undefined,
            logPath: oldSidecar.logPath || undefined,
            serviceId: oldSidecar.serviceId || undefined
        });
        
        const dockerCommand = this.sidecarService.generateDockerCommand(newSidecar);
        
        return {
            sidecar: {
                id: newSidecar.id,
                name: newSidecar.name,
                apiKey: newSidecar.apiKey // Show new API key
            },
            setup: {
                dockerCommand,
                warning: 'Your old sidecar will stop working. Update your deployment with the new credentials.'
            }
        };
    }
}

