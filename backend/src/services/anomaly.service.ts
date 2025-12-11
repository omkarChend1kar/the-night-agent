import { Injectable } from '@nestjs/common';
import { Anomaly, FixProposal } from '../integrations/code-executor/code-executor.interface';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AnomalyService {
    private fixes: Map<string, FixProposal> = new Map(); // Keep fixes in memory for now? Or Schema needs update. Plan didn't incl Fix.

    constructor(private prisma: PrismaService) { }

    async addAnomaly(dto: any, repoId: string) {
        const anomaly = await this.prisma.anomaly.create({
            data: {
                repoId: repoId,
                status: 'PENDING',
                context: JSON.stringify(dto)
            }
        });
        return anomaly;
    }

    async getAnomalies() {
        // Return structured anomalies
        const records = await this.prisma.anomaly.findMany({ include: { repo: true } });
        return records.map(r => ({
            id: r.id,
            ...JSON.parse(r.context),
            repoUrl: r.repo.url,
            status: r.status,
            createdAt: r.createdAt
        }));
    }

    async getAnomaly(id: string) {
        const r = await this.prisma.anomaly.findUnique({ where: { id }, include: { repo: true } });
        if (!r) return null;
        return {
            id: r.id,
            ...JSON.parse(r.context),
            repoUrl: r.repo.url,
            repoProtocol: r.repo.protocol,
            encryptedCreds: r.repo.encryptedCreds,
            status: r.status
        };
    }

    // Fixes are still transient for this iteration unless we add Fix model.
    addFix(fix: FixProposal) {
        this.fixes.set(fix.id, fix);
        // Also update Anomaly status
        if (fix.anomalyId) {
            this.prisma.anomaly.update({ where: { id: fix.anomalyId }, data: { status: 'FIX_PROPOSED' } }).catch(console.error);
        }
    }

    getFix(id: string) {
        return this.fixes.get(id);
    }

    getFixByAnomalyId(anomalyId: string) {
        return Array.from(this.fixes.values()).find(f => f.anomalyId === anomalyId);
    }

    updateFixStatus(id: string, status: FixProposal['status']) {
        const fix = this.fixes.get(id);
        if (fix) {
            fix.status = status;
            this.fixes.set(id, fix);
            if (status === 'applied') {
                this.prisma.anomaly.update({ where: { id: fix.anomalyId }, data: { status: 'RESOLVED' } }).catch(console.error);
            }
        }
    }
}
