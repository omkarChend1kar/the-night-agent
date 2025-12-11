import { Controller, Post, Body, Inject } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';

@Controller('api/sidecar')
export class SidecarController {
    constructor(
        @Inject('WorkflowEngine') private workflowEngine: any,
        private anomalyService: AnomalyService,
    ) { }

    @Post('register')
    register(@Body() body: any) {
        console.log('Sidecar registered', body);
        return { status: 'registered' };
    }

    @Post('anomaly')
    async reportAnomaly(@Body() anomaly: any) {
        console.log('Received anomaly', anomaly);
        // Assume sidecar injects its ID or we parse it from headers/body
        // For MVP, we assumed 'sidecarId' is in the body or known?
        // Let's assume the Sidecar Script sends 'sidecarId' in the body.
        const sidecarId = anomaly.sidecarId || 'unknown';
        const repoId = sidecarId.replace('sidecar-', '');

        let savedAnomaly;
        try {
            // Check if repo exists to be safe
            // const repo = await this.prisma.repo.find... (skipped for speed)

            savedAnomaly = await this.anomalyService.addAnomaly(anomaly, repoId);
        } catch (e) {
            console.error('Failed to save anomaly', e);
            // Fallback for mocked sidecars without valid IDs
            savedAnomaly = await this.anomalyService.addAnomaly(anomaly, 'unknown-repo');
        }

        // Trigger fix workflow (pass ID)
        // Workflow Engine will call AnomalyService using this ID, which now fetches from DB
        const executionId = await this.workflowEngine.startFixWorkflow(savedAnomaly.id);
        return { status: 'received', executionId };
    }

    @Post('heartbeat')
    heartbeat() {
        return { status: 'alive' };
    }
}
