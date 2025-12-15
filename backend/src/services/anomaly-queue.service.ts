import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

interface AnomalyJob {
    anomalyId: string;
    repoId: string;
    priority: number;
}

@Injectable()
export class AnomalyQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AnomalyQueueService.name);
    private queue: Queue<AnomalyJob>;
    private worker: Worker<AnomalyJob>;
    private connection: Redis;
    private isEnabled: boolean;

    constructor() {
        this.isEnabled = process.env.USE_QUEUE === 'true';
    }

    async onModuleInit() {
        if (!this.isEnabled) {
            this.logger.log('Queue disabled (USE_QUEUE != true). Using synchronous processing.');
            return;
        }

        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        this.logger.log(`Connecting to Redis at ${redisUrl}...`);

        try {
            this.connection = new Redis(redisUrl, {
                maxRetriesPerRequest: null,
                enableReadyCheck: false
            });

            this.queue = new Queue<AnomalyJob>('anomaly-processing', {
                connection: this.connection,
                defaultJobOptions: {
                    removeOnComplete: 100,
                    removeOnFail: 50,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000
                    }
                }
            });

            this.logger.log('Anomaly queue initialized successfully.');

        } catch (error) {
            this.logger.error('Failed to initialize queue:', error);
            this.isEnabled = false;
        }
    }

    async onModuleDestroy() {
        if (this.worker) {
            await this.worker.close();
        }
        if (this.queue) {
            await this.queue.close();
        }
        if (this.connection) {
            await this.connection.quit();
        }
    }

    /**
     * Enqueue an anomaly for processing
     */
    async enqueue(anomalyId: string, repoId: string, priority: number): Promise<boolean> {
        if (!this.isEnabled || !this.queue) {
            return false; // Fall back to sync processing
        }

        try {
            await this.queue.add(
                'process-anomaly',
                { anomalyId, repoId, priority },
                {
                    priority: Math.max(1, 100 - priority), // BullMQ uses lower = higher priority
                    jobId: `anomaly-${anomalyId}`
                }
            );
            this.logger.log(`Enqueued anomaly ${anomalyId} with priority ${priority}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to enqueue anomaly ${anomalyId}:`, error);
            return false;
        }
    }

    /**
     * Start the worker that processes jobs
     * Call this from a separate worker process or during module init
     */
    startWorker(processor: (job: Job<AnomalyJob>) => Promise<void>): void {
        if (!this.isEnabled || !this.connection) {
            this.logger.warn('Cannot start worker - queue not enabled');
            return;
        }

        this.worker = new Worker<AnomalyJob>(
            'anomaly-processing',
            processor,
            {
                connection: this.connection,
                concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '2', 10)
            }
        );

        this.worker.on('completed', (job) => {
            this.logger.log(`Job ${job.id} completed for anomaly ${job.data.anomalyId}`);
        });

        this.worker.on('failed', (job, error) => {
            this.logger.error(`Job ${job?.id} failed:`, error);
        });

        this.worker.on('error', (error) => {
            this.logger.error('Worker error:', error);
        });

        this.logger.log('Anomaly worker started.');
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(): Promise<{ waiting: number; active: number; completed: number; failed: number }> {
        if (!this.queue) {
            return { waiting: 0, active: 0, completed: 0, failed: 0 };
        }

        const [waiting, active, completed, failed] = await Promise.all([
            this.queue.getWaitingCount(),
            this.queue.getActiveCount(),
            this.queue.getCompletedCount(),
            this.queue.getFailedCount()
        ]);

        return { waiting, active, completed, failed };
    }

    isQueueEnabled(): boolean {
        return this.isEnabled;
    }
}
