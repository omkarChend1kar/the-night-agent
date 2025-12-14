import { Controller, Post, Body, Inject, Headers, UnauthorizedException } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';
import { PrismaService } from '../prisma.service';
import { SidecarService } from '../services/sidecar.service';

@Controller('api/sidecar')
export class SidecarController {
    constructor(
        @Inject('WorkflowEngine') private workflowEngine: any,
        private anomalyService: AnomalyService,
        private prisma: PrismaService,
        private sidecarService: SidecarService,
    ) { }

    /**
     * Validate sidecar API key from header or body
     */
    private async validateSidecar(apiKey?: string, sidecarId?: string) {
        if (apiKey) {
            const sidecar = await this.sidecarService.validateAndUpdateSidecar(apiKey);
            if (sidecar) return sidecar;
        }
        
        // Fallback: Try to find by sidecarId for backward compatibility
        if (sidecarId) {
            const sidecar = await this.prisma.sidecar.findFirst({
                where: { id: sidecarId }
            });
            if (sidecar) {
                await this.prisma.sidecar.update({
                    where: { id: sidecar.id },
                    data: { lastSeen: new Date(), status: 'active' }
                });
                return sidecar;
            }
        }
        
        return null;
    }

    @Post('register')
    async register(
        @Body() body: any,
        @Headers('x-sidecar-api-key') apiKey?: string
    ) {
        const sidecar = await this.validateSidecar(apiKey, body.sidecarId);
        if (sidecar) {
            console.log(`Sidecar registered: ${sidecar.id} (${sidecar.name})`);
            return { status: 'registered', sidecarId: sidecar.id };
        }
        
        // Allow unregistered sidecars for backward compatibility
        console.log('Sidecar registered (unverified)', body);
        return { status: 'registered' };
    }

    @Post('anomaly')
    async reportAnomaly(
        @Body() anomaly: any,
        @Headers('x-sidecar-api-key') apiKey?: string
    ) {
        console.log('Received anomaly', anomaly);
        
        // Validate sidecar if API key provided
        const sidecar = await this.validateSidecar(apiKey, anomaly.sidecarId);
        
        // Determine repoId
        let repoId: string;
        
        if (sidecar?.repoId) {
            // Use repo linked to sidecar
            repoId = sidecar.repoId;
        } else {
            // Fallback to sidecarId-based lookup
            const sidecarId = anomaly.sidecarId || 'unknown';
            repoId = sidecarId.replace('sidecar-', '');
        }

        let savedAnomaly;
        try {
            // Verify if repo exists
            const repo = await this.prisma.repository.findUnique({ where: { id: repoId } });

            if (!repo) {
                // Fallback: Check if we have an "Unassigned" repo or create one for demo purposes
                const defaultUser = await this.prisma.user.findFirst();
                if (defaultUser) {
                    let fallbackRepo = await this.prisma.repository.findFirst({ where: { url: 'UNKNOWN_REPO' } });
                    if (!fallbackRepo) {
                        fallbackRepo = await this.prisma.repository.create({
                            data: {
                                url: 'UNKNOWN_REPO',
                                protocol: 'https',
                                userId: defaultUser.id,
                                id: 'generic-fallback-repo'
                            }
                        });
                    }
                    repoId = fallbackRepo.id;
                } else {
                    // No users at all? Edge case.
                    console.warn('No users found to attach fallback repo.');
                }
            }

            savedAnomaly = await this.anomalyService.addAnomaly(anomaly, repoId);

            if (!savedAnomaly) {
                return { status: 'filtered', message: 'Anomaly dropped by noise filter' };
            }

        } catch (e) {
            console.error('Failed to save anomaly', e);
            return { status: 'error', message: e.message };
        }

        // Workflow is now triggered inside AnomalyService if priority is high enough
        return { status: 'received', anomalyId: savedAnomaly.id };
    }

    @Post('heartbeat')
    async heartbeat(
        @Body() body: any,
        @Headers('x-sidecar-api-key') apiKey?: string
    ) {
        // Validate and update sidecar lastSeen
        const sidecar = await this.validateSidecar(apiKey, body?.sidecarId);
        
        if (sidecar) {
            return { 
                status: 'alive', 
                sidecarId: sidecar.id,
                name: sidecar.name 
            };
        }
        
        return { status: 'alive' };
    }
}
