import { Controller, Get, Post, Body, Param, NotFoundException } from '@nestjs/common';
import { AnomalyService } from '../services/anomaly.service';

@Controller('api/internal')
export class InternalController {
    constructor(private anomalyService: AnomalyService) { }

    @Get('anomalies/pending')
    async getPendingAnomalies() {
        return this.anomalyService.getPendingAnomalies();
    }

    @Get('anomalies/:id')
    async getAnomaly(@Param('id') id: string) {
        const anomaly = await this.anomalyService.getAnomaly(id);
        if (!anomaly) throw new NotFoundException('Anomaly not found');
        return anomaly;
    }

    @Get('fix/:id')
    async getFix(@Param('id') id: string) {
        // Use async version to recover fix with full data from DB if needed
        const fix = await this.anomalyService.getFixAsync(id);
        if (!fix) throw new NotFoundException('Fix not found');
        return fix;
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
