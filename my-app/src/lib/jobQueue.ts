// Job queue client for background processing
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface JobPayload {
  documentId: string;
  fileUrl?: string;
  documentType?: string;
  userId?: string;
  [key: string]: any;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: any;
}

export class JobQueue {
  // Enqueue a new job
  static async enqueue(
    type: 'ocr' | 'verification' | 'normalization',
    payload: JobPayload,
    options: {
      priority?: number;
      maxRetries?: number;
      expiresAt?: Date;
    } = {}
  ): Promise<string> {
    const { data, error } = await supabase.rpc('enqueue_job', {
      job_type: type,
      job_payload: payload,
      job_priority: options.priority || 0,
      job_max_retries: options.maxRetries || 3,
      job_expires_at: options.expiresAt?.toISOString() || null
    });

    if (error) {
      throw new Error(`Failed to enqueue job: ${error.message}`);
    }

    return data;
  }

  // Get next job for processing (worker function)
  static async getNextJob(): Promise<{
    id: string;
    type: string;
    payload: JobPayload;
    retryCount: number;
    maxRetries: number;
  } | null> {
    const { data, error } = await supabase.rpc('get_next_job');

    if (error || !data || data.length === 0) {
      return null;
    }

    const job = data[0];
    return {
      id: job.id,
      type: job.type,
      payload: job.payload,
      retryCount: job.retry_count,
      maxRetries: job.max_retries
    };
  }

  // Complete a job
  static async completeJob(
    jobId: string,
    result: JobResult
  ): Promise<void> {
    const { error } = await supabase.rpc('complete_job', {
      job_id: jobId,
      job_result: result.success ? result : null,
      job_error: result.error || null
    });

    if (error) {
      throw new Error(`Failed to complete job: ${error.message}`);
    }
  }

  // Get job status
  static async getJobStatus(jobId: string): Promise<{
    id: string;
    status: string;
    result?: any;
    error?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  } | null> {
    const { data, error } = await supabase
      .from('job_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      status: data.status,
      result: data.result,
      error: data.error,
      createdAt: data.created_at,
      startedAt: data.started_at,
      completedAt: data.completed_at
    };
  }

  // Get job history
  static async getJobHistory(jobId: string): Promise<Array<{
    status: string;
    message?: string;
    metadata?: any;
    createdAt: string;
  }>> {
    const { data, error } = await supabase
      .from('job_status')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map(item => ({
      status: item.status,
      message: item.message,
      metadata: item.metadata,
      createdAt: item.created_at
    }));
  }

  // Clean up old jobs
  static async cleanupOldJobs(olderThanDays: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { error } = await supabase
      .from('job_queue')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .in('status', ['completed', 'failed']);

    if (error) {
      throw new Error(`Failed to cleanup old jobs: ${error.message}`);
    }
  }
}

// Worker class for processing jobs
export class JobWorker {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private processors: {
      ocr?: (payload: JobPayload) => Promise<JobResult>;
      verification?: (payload: JobPayload) => Promise<JobResult>;
      normalization?: (payload: JobPayload) => Promise<JobResult>;
    }
  ) {}

  start(pollIntervalMs: number = 5000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.processNextJob();
    }, pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
  }

  private async processNextJob(): Promise<void> {
    try {
      const job = await JobQueue.getNextJob();
      if (!job) return;

      console.log(`Processing job ${job.id} of type ${job.type}`);

      const processor = this.processors[job.type as keyof typeof this.processors];
      if (!processor) {
        await JobQueue.completeJob(job.id, {
          success: false,
          error: `No processor found for job type: ${job.type}`
        });
        return;
      }

      try {
        const result = await processor(job.payload);
        await JobQueue.completeJob(job.id, result);
        console.log(`Completed job ${job.id}`);
      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error);
        
        // Check if we should retry
        if (job.retryCount < job.maxRetries) {
          // Reset status to pending for retry
          await supabase
            .from('job_queue')
            .update({ status: 'pending', started_at: null })
            .eq('id', job.id);
        } else {
          await JobQueue.completeJob(job.id, {
            success: false,
            error: error.message || 'Unknown error'
          });
        }
      }
    } catch (error) {
      console.error('Job processing error:', error);
    }
  }
}
