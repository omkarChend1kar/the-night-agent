import { Controller, Get, Post, Body } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';

@Controller('api/internal')
export class InternalController {
    constructor(private anomalyService: AnomalyService) { }

    @Get('anomalies/pending')
    async getPendingAnomalies() {
        return this.anomalyService.getPendingAnomalies();
    }

    @Post('anomalies/review')
    async reviewAnomaly(@Body() review: { id: string, decision: 'CRITICAL' | 'IGNORE', reasoning: string, analysis?: any }) {
        return this.anomalyService.processJudgeReview(review);
    }

    @Post('anomalies/analysis')
    async submitAnalysis(@Body() dto: { id: string, analysis: any }) {
        return this.anomalyService.saveAnalysis(dto.id, dto.analysis);
    }

    @Post('anomalies/proposal')
    async submitProposal(@Body() dto: { id: string, analysis: string, patch: string, status: string }) {
        return this.anomalyService.saveProposal(dto);
    }
}
