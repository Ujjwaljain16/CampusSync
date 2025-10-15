// Background job processor endpoint
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { JobWorker, JobQueue } from '../../../../lib/jobQueue';
import { defaultNormalizer } from '../../../../lib/llmNormalizer';
import { extractByType } from '../../../../lib/docExtractors';
import { matchInstitutionLogo } from '../../../../lib/logoMatcher';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// OCR processor
async function processOCR(payload: Record<string, unknown>) {
  try {
    const { documentId, fileUrl, documentType } = payload;
    
    // This would typically call the OCR API
    // For now, return a placeholder result
    return {
      success: true,
      data: {
        documentId,
        extractedText: 'Sample extracted text',
        confidence: 0.85,
        documentType: documentType || 'certificate'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OCR processing failed'
    };
  }
}

// Verification processor
async function processVerification(payload: Record<string, unknown>) {
  try {
    const { documentId, extractedText, documentType } = payload;
    
    // Extract fields using the enhanced extractors
    const extractedFields = extractByType(extractedText, documentType || 'certificate');
    
    // Normalize fields using LLM normalizer
    const normalizedFields = await defaultNormalizer.normalize(extractedFields);
    
    // Simulate logo matching (would use actual image in production)
    const logoMatch = await matchInstitutionLogo(Buffer.from(''), extractedFields.institution);
    
    // Calculate policy score
    const policyScore = Math.min(1, 
      (normalizedFields.confidence * 0.4) + 
      (logoMatch.score * 0.3) + 
      (extractedFields.issuer ? 0.3 : 0)
    );
    
    const outcome = policyScore >= 0.8 ? 'verified' : 
                   policyScore >= 0.5 ? 'manual_review' : 'rejected';
    
    return {
      success: true,
      data: {
        documentId,
        extractedFields,
        normalizedFields,
        logoMatch,
        policyScore,
        outcome,
        verificationStatus: outcome
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification processing failed'
    };
  }
}

// Normalization processor
async function processNormalization(payload: Record<string, unknown>) {
  try {
    const { documentId, extractedFields } = payload;
    
    const normalizedFields = await defaultNormalizer.normalize(extractedFields);
    
    return {
      success: true,
      data: {
        documentId,
        normalizedFields
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Normalization processing failed'
    };
  }
}

// Create worker instance
const worker = new JobWorker({
  ocr: processOCR,
  verification: processVerification,
  normalization: processNormalization
});

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action === 'start') {
      worker.start(5000); // Poll every 5 seconds
      return NextResponse.json({ message: 'Job worker started' });
    } else if (action === 'stop') {
      worker.stop();
      return NextResponse.json({ message: 'Job worker stopped' });
    } else if (action === 'process') {
      // Process a single job
      const job = await JobQueue.getNextJob();
      if (!job) {
        return NextResponse.json({ message: 'No jobs available' });
      }
      
      const processor = worker['processors'][job.type as keyof typeof worker['processors']];
      if (!processor) {
        await JobQueue.completeJob(job.id, {
          success: false,
          error: `No processor found for job type: ${job.type}`
        });
        return NextResponse.json({ error: 'No processor found' });
      }
      
      try {
        const result = await processor(job.payload);
        await JobQueue.completeJob(job.id, result);
        return NextResponse.json({ message: 'Job processed successfully', jobId: job.id });
      } catch (error) {
        await JobQueue.completeJob(job.id, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return NextResponse.json({ error: 'Job processing failed' });
      }
    } else {
      throw apiError.badRequest('Invalid action');
    }
  } catch (error) {
    console.error('Job processing error:', error);
    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }
    throw apiError.internal('Job processing failed');
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (jobId) {
      const status = await JobQueue.getJobStatus(jobId);
      const history = await JobQueue.getJobHistory(jobId);
      
      return NextResponse.json({
        status,
        history
      });
    } else {
      // Get all jobs
      const { data: jobs, error } = await supabase
        .from('job_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
      }
      
      return NextResponse.json({ jobs });
    }
  } catch (error) {
    console.error('Job status fetch error:', error);
    throw apiError.internal('Failed to fetch job status');
  }
}
