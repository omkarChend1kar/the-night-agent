import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

interface Metrics {
    anomalies: {
        total: number;
        pending: number;
        resolved: number;
        proposalReady: number;
        sandboxReady: number;
    };
    fixes: {
        total: number;
        pending: number;
        applied: number;
        merged: number;
    };
    sidecars: {
        total: number;
        active: number;
    };
    queue: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
    } | null;
    uptime: number;
    timestamp: string;
}

@Controller('metrics')
export class MetricsController {
    private readonly startTime = Date.now();

    constructor(
        private prisma: PrismaService,
        @Inject('AnomalyQueueService') private queueService: any
    ) { }

    @Get()
    async getMetrics(): Promise<Metrics> {
        // Anomaly counts by status
        const [
            totalAnomalies,
            pendingAnomalies,
            resolvedAnomalies,
            proposalReadyAnomalies,
            sandboxReadyAnomalies
        ] = await Promise.all([
            this.prisma.anomaly.count(),
            this.prisma.anomaly.count({ where: { status: 'PENDING' } }),
            this.prisma.anomaly.count({ where: { status: 'RESOLVED' } }),
            this.prisma.anomaly.count({ where: { status: 'PROPOSAL_READY' } }),
            this.prisma.anomaly.count({ where: { status: 'SANDBOX_READY' } })
        ]);

        // Fix counts by status
        const [
            totalFixes,
            pendingFixes,
            appliedFixes,
            mergedFixes
        ] = await Promise.all([
            this.prisma.fix.count(),
            this.prisma.fix.count({ where: { status: 'pending' } }),
            this.prisma.fix.count({ where: { status: 'applied_sandbox' } }),
            this.prisma.fix.count({ where: { status: 'merged' } })
        ]);

        // Sidecar counts
        const [totalSidecars, activeSidecars] = await Promise.all([
            this.prisma.sidecar.count(),
            this.prisma.sidecar.count({ where: { status: 'active' } })
        ]);

        // Queue stats (if queue service is available)
        let queueStats = null;
        try {
            if (this.queueService?.getQueueStats) {
                queueStats = await this.queueService.getQueueStats();
            }
        } catch (e) {
            // Queue not available
        }

        return {
            anomalies: {
                total: totalAnomalies,
                pending: pendingAnomalies,
                resolved: resolvedAnomalies,
                proposalReady: proposalReadyAnomalies,
                sandboxReady: sandboxReadyAnomalies
            },
            fixes: {
                total: totalFixes,
                pending: pendingFixes,
                applied: appliedFixes,
                merged: mergedFixes
            },
            sidecars: {
                total: totalSidecars,
                active: activeSidecars
            },
            queue: queueStats,
            uptime: Date.now() - this.startTime,
            timestamp: new Date().toISOString()
        };
    }

    @Get('health')
    async getHealth() {
        try {
            // Simple DB connectivity check
            await this.prisma.$queryRaw`SELECT 1`;
            return { status: 'healthy', db: 'connected' };
        } catch (e) {
            return { status: 'unhealthy', db: 'disconnected', error: e.message };
        }
    }

    @Get('ready')
    async getReadiness() {
        const checks = {
            database: false,
            queue: false
        };

        try {
            await this.prisma.$queryRaw`SELECT 1`;
            checks.database = true;
        } catch (e) {
            // DB not ready
        }

        try {
            if (this.queueService?.isQueueEnabled?.()) {
                checks.queue = true;
            } else {
                checks.queue = true; // Queue disabled is still "ready"
            }
        } catch (e) {
            // Queue not ready
        }

        const allReady = Object.values(checks).every(v => v);
        return {
            ready: allReady,
            checks
        };
    }
}
