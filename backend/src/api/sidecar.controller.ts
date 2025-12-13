import { Controller, Post, Body, Inject } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';
import { PrismaService } from '../prisma.service';

@Controller('api/sidecar')
export class SidecarController {
    constructor(
        @Inject('WorkflowEngine') private workflowEngine: any,
        private anomalyService: AnomalyService,
        private prisma: PrismaService,
    ) { }

    @Post('register')
    register(@Body() body: any) {
        console.log('Sidecar registered', body);
        return { status: 'registered' };
    }

    @Post('anomaly')
    async reportAnomaly(@Body() anomaly: any) {
        console.log('Received anomaly', anomaly);
        const sidecarId = anomaly.sidecarId || 'unknown';
        // Extract repoId from sidecarId (e.g. "sidecar-uuid" -> "uuid")
        let repoId = sidecarId.replace('sidecar-', '');

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
    heartbeat() {
        return { status: 'alive' };
    }
}
