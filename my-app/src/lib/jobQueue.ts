// Job Queue system for background processing
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  result?: Record<string, unknown>;
  error?: string;
}

export class JobQueue {
  // Add a new job to the queue
  static async addJob(
    type: string,
    payload: Record<string, unknown>,
    priority: number = 0
  ): Promise<string> {
    const { data, error } = await supabase
      .from('job_queue')
      .insert({
        type,
        payload,
        priority,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to add job: ${error.message}`);
    }

    return data.id;
  }

  // Get the next pending job
  static async getNextJob(): Promise<Job | null> {
    const { data, error } = await supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    // Mark as processing
    await supabase
      .from('job_queue')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.id);

    return data as Job;
  }

  // Complete a job with result
  static async completeJob(
    jobId: string,
    result: Record<string, unknown>
  ): Promise<void> {
    const status = result.success ? 'completed' : 'failed';
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      result
    };

    if (!result.success && result.error) {
      updateData.error = result.error;
    }

    await supabase
      .from('job_queue')
      .update(updateData)
      .eq('id', jobId);

    // Log to job history
    await supabase.from('job_history').insert({
      job_id: jobId,
      status,
      result,
      created_at: new Date().toISOString()
    });
  }

  // Get job status
  static async getJobStatus(jobId: string): Promise<Job | null> {
    const { data, error } = await supabase
      .from('job_queue')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as Job;
  }

  // Get job history
  static async getJobHistory(jobId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from('job_history')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data;
  }

  // Retry a failed job
  static async retryJob(jobId: string): Promise<void> {
    await supabase
      .from('job_queue')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString(),
        error: null
      })
      .eq('id', jobId);
  }

  // Delete old completed jobs
  static async cleanupOldJobs(daysOld: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    await supabase
      .from('job_queue')
      .delete()
      .eq('status', 'completed')
      .lt('updated_at', cutoffDate.toISOString());
  }
}

export class JobWorker {
  private processors: Record<string, (payload: Record<string, unknown>) => Promise<Record<string, unknown>>>;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    processors: Record<string, (payload: Record<string, unknown>) => Promise<Record<string, unknown>>>
  ) {
    this.processors = processors;
  }

  // Start polling for jobs
  start(intervalMs: number = 5000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      await this.processNextJob();
    }, intervalMs);
  }

  // Stop polling
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  // Process a single job
  private async processNextJob(): Promise<void> {
    try {
      const job = await JobQueue.getNextJob();
      if (!job) {
        return;
      }

      const processor = this.processors[job.type];
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
      } catch (error) {
        await JobQueue.completeJob(job.id, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error processing job:', error);
    }
  }
}
